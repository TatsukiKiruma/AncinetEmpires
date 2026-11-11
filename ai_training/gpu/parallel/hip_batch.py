"""多个对局共享一次HIP调度；整数距离并行归约，评分仍复用原内核表达式。"""
import ctypes as c
import hashlib
import os
from pathlib import Path
import sys
import numpy as np
import torch


def source_code():
    source = Path(__file__).resolve().parents[1].joinpath('hard_score.hip').read_text('utf-8')
    def replace(before, after):
        nonlocal source
        if source.count(before) != 1:
            raise RuntimeError('HIP批量生成锚点变化：' + before[:80])
        source = source.replace(before, after)
    replace('void hard_score(const double* data, double* output) {', '''void hard_score_batch(const double* batch, double* output) {
    const double* data = batch + (int)batch[1 + blockIdx.y * 2];
    output += (int)batch[2 + blockIdx.y * 2];''')
    replace('int k = blockIdx.x * blockDim.x + threadIdx.x;', 'int k = blockIdx.x;')
    replace('''double enemy = mean_distance(row, col, enemy_points, enemies, enemies);
    double ally = mean_distance(row, col, ally_points, allies, allies);
    double moved_ally = mean_distance(row, col, landing_points, landing, (int)data[4]);''', '''
    // 输入坐标为有界整数，距离之和小于2^53，并行相加不会改变结果。
    __shared__ double sums[3][64];
    int lane = threadIdx.x;
    double e = 0.0, a = 0.0, l = 0.0;
    for (int i = lane; i < enemies; i += 64) e += fabs(row-enemy_points[2*i])+fabs(col-enemy_points[2*i+1]);
    for (int i = lane; i < allies; i += 64) a += fabs(row-ally_points[2*i])+fabs(col-ally_points[2*i+1]);
    for (int i = lane; i < landing; i += 64) l += fabs(row-landing_points[2*i])+fabs(col-landing_points[2*i+1]);
    sums[0][lane]=e; sums[1][lane]=a; sums[2][lane]=l;
    __syncthreads();
    for (int stride=32; stride>0; stride/=2) {
        if (lane<stride) { sums[0][lane]+=sums[0][lane+stride]; sums[1][lane]+=sums[1][lane+stride]; sums[2][lane]+=sums[2][lane+stride]; }
        __syncthreads();
    }
    if (lane != 0) return;
    double enemy = enemies ? round_distance(sums[0][0]/enemies) : 0.0;
    double ally = allies ? round_distance(sums[1][0]/allies) : 0.0;
    double moved_ally = round_distance(sums[2][0]/data[4]);''')
    graph = Path(__file__).with_name('range.hip').read_text('utf-8')
    source = graph + '\n' + source
    replace('    int k = blockIdx.x;', '''    if (data[1] == -1) {
        if (blockIdx.x == 0 && threadIdx.x == 0) exact_movement_range(data, output, (int)data[5]);
        return;
    }
    int k = blockIdx.x;''')
    return source.encode('utf-8')


class HipBatch:
    def __init__(self, device='cuda:0'):
        self.device = torch.device(device)
        if os.name != 'nt' or not torch.version.hip or not torch.cuda.is_available():
            raise RuntimeError('批量HIP后端需要当前Windows ROCm环境；不会回退CPU')
        torch.cuda.set_device(self.device)
        torch.empty(1, device=self.device)
        sdk = Path(sys.prefix) / 'Lib/site-packages/_rocm_sdk_core'
        self.dll_directory = os.add_dll_directory(str(sdk / 'bin'))
        rtc = c.CDLL(str(sdk / 'bin/hiprtc0702.dll'))
        hip = c.CDLL(str(sdk / 'bin/amdhip64_7.dll'))
        self.libraries = (rtc, hip)
        def bind(lib, name, args):
            fn = getattr(lib, name); fn.restype = c.c_int; fn.argtypes = args; return fn
        create = bind(rtc, 'hiprtcCreateProgram', [c.POINTER(c.c_void_p), c.c_char_p, c.c_char_p, c.c_int, c.c_void_p, c.c_void_p])
        compile_program = bind(rtc, 'hiprtcCompileProgram', [c.c_void_p, c.c_int, c.POINTER(c.c_char_p)])
        log_size = bind(rtc, 'hiprtcGetProgramLogSize', [c.c_void_p, c.POINTER(c.c_size_t)])
        get_log = bind(rtc, 'hiprtcGetProgramLog', [c.c_void_p, c.c_void_p])
        code_size = bind(rtc, 'hiprtcGetCodeSize', [c.c_void_p, c.POINTER(c.c_size_t)])
        get_code = bind(rtc, 'hiprtcGetCode', [c.c_void_p, c.c_void_p])
        destroy = bind(rtc, 'hiprtcDestroyProgram', [c.POINTER(c.c_void_p)])
        load = bind(hip, 'hipModuleLoadData', [c.POINTER(c.c_void_p), c.c_void_p])
        function = bind(hip, 'hipModuleGetFunction', [c.POINTER(c.c_void_p), c.c_void_p, c.c_char_p])
        self.launch = bind(hip, 'hipModuleLaunchKernel', [c.c_void_p, *([c.c_uint] * 7), c.c_void_p, c.POINTER(c.c_void_p), c.c_void_p])
        self.module, self.kernel = c.c_void_p(), c.c_void_p()
        source = source_code()
        self.source_sha256 = hashlib.sha256(source).hexdigest()
        self.architecture = torch.cuda.get_device_properties(self.device).gcnArchName.split(':')[0]
        options = [f'--gpu-architecture={self.architecture}'.encode(), b'-ffp-contract=off', b'-O2', ('-I' + str(sdk / 'include')).encode()]
        program = c.c_void_p()
        self.check(create(c.byref(program), source, b'hard_score_batch.hip', 0, None, None), '创建HIP程序')
        try:
            status = compile_program(program, len(options), (c.c_char_p * len(options))(*options))
            if status:
                size = c.c_size_t(); log_size(program, c.byref(size)); log = c.create_string_buffer(size.value)
                get_log(program, log); raise RuntimeError(log.value.decode(errors='replace'))
            size = c.c_size_t(); self.check(code_size(program, c.byref(size)), '读取代码长度')
            binary = c.create_string_buffer(size.value); self.check(get_code(program, binary), '读取代码')
            self.check(load(c.byref(self.module), binary), '加载HIP模块')
            self.check(function(c.byref(self.kernel), self.module, b'hard_score_batch'), '读取HIP函数')
        finally:
            destroy(c.byref(program))
        self.input_capacity = self.output_capacity = 0
        self.pinned = True
        self.malloc = bind(hip, 'hipMalloc', [c.POINTER(c.c_void_p), c.c_size_t])
        self.host_malloc = bind(hip, 'hipHostMalloc', [c.POINTER(c.c_void_p), c.c_size_t, c.c_uint])
        self.free = bind(hip, 'hipFree', [c.c_void_p])
        self.host_free = bind(hip, 'hipHostFree', [c.c_void_p])
        self.copy = bind(hip, 'hipMemcpyAsync', [c.c_void_p, c.c_void_p, c.c_size_t, c.c_int, c.c_void_p])
        self.record = bind(hip, 'hipEventRecord', [c.c_void_p, c.c_void_p])
        self.sync = bind(hip, 'hipEventSynchronize', [c.c_void_p])
        self.elapsed = bind(hip, 'hipEventElapsedTime', [c.POINTER(c.c_float), c.c_void_p, c.c_void_p])
        create_event = bind(hip, 'hipEventCreate', [c.POINTER(c.c_void_p)])
        self.begin = c.c_void_p(); self.end = c.c_void_p()
        self.check(create_event(c.byref(self.begin)), '创建开始事件')
        self.check(create_event(c.byref(self.end)), '创建结束事件')
        self.stream = c.c_void_p(torch.cuda.current_stream(self.device).cuda_stream)

    @staticmethod
    def check(code, operation):
        if code:
            raise RuntimeError(f'{operation}失败，HIP错误{code}')

    @staticmethod
    def validate(data):
        if len(data) < 8 or not np.isfinite(data).all():
            raise ValueError('GPU二进制输入无效')
        if data[1] == -1:
            rows, cols, move = data[2:5]
            cells = int(rows*cols)
            if rows != int(rows) or cols != int(cols) or rows < 1 or cols < 1 or not 1 <= cells <= 768 or move != int(move) or not 0 <= move <= 32:
                raise ValueError('GPU移动图尺寸或移动力超出精确实现范围')
            capacity=min(cells,1+2*int(move)*(int(move)+1))
            if data[0] != capacity or data[5] != int(data[5]) or not 0 <= data[5] < cells or len(data) != 8+cells*2:
                raise ValueError('GPU移动图布局无效')
            costs, blocked = data[8:8+cells], data[8+cells:]
            if (costs != np.floor(costs)).any() or (costs < 1).any() or (costs > 1000000).any() or not np.isin(blocked, [0,1]).all():
                raise ValueError('GPU移动图要求原脚本提供正整数代价和布尔阻挡')
            return capacity
        counts = data[:5]
        if (counts != np.floor(counts)).any() or (counts < 0).any() or (counts > 10000).any():
            raise ValueError('GPU二进制计数越界')
        n, e, a, l, count = map(int, counts)
        if not n or count != l + 1 or len(data) != 8 + n * 3 + (e + a + l) * 2:
            raise ValueError('GPU二进制布局或落点分母不符')
        coords = data[8:8+(n+e+a+l)*2]
        if (coords != np.floor(coords)).any() or (np.abs(coords) > 10000).any():
            raise ValueError('距离归约输入必须是有界整数坐标')
        return n

    def allocate(self, needed, output=False):
        name = 'output' if output else 'input'
        if needed <= getattr(self, name + '_capacity'):
            return
        capacity = max(65536, 1 << (needed - 1).bit_length())
        host = c.c_void_p(); gpu = c.c_void_p()
        self.check(self.host_malloc(c.byref(host), capacity*8, 0), '分配固定页缓冲区')
        self.check(self.malloc(c.byref(gpu), capacity*8), '分配GPU缓冲区')
        if getattr(self, name + '_capacity'):
            self.check(self.host_free(getattr(self, name+'_host')), '释放旧固定页缓冲区')
            self.check(self.free(getattr(self, name+'_gpu')), '释放旧GPU缓冲区')
        setattr(self, name + '_host', host); setattr(self, name + '_gpu', gpu)
        setattr(self, name + '_array', np.ctypeslib.as_array(c.cast(host, c.POINTER(c.c_double)), shape=(capacity,)))
        setattr(self, name + '_capacity', capacity)

    def calculate(self, requests):
        if not 1 <= len(requests) <= 128:
            raise ValueError('GPU批大小越界')
        counts = [self.validate(r) for r in requests]
        size = 1 + len(requests) * 2 + sum(len(r) for r in requests)
        total = sum(counts)
        self.allocate(size); self.allocate(total * 3, output=True)
        target = self.input_array
        target[0] = len(requests)
        offset = 1 + len(requests) * 2; output_offset = 0
        for i, (request, n) in enumerate(zip(requests, counts)):
            target[1+i*2] = offset; target[2+i*2] = output_offset
            target[offset:offset+len(request)] = request
            offset += len(request); output_offset += n * 3
        self.check(self.record(self.begin, self.stream), '记录开始事件')
        self.check(self.copy(self.input_gpu, self.input_host, size*8, 1, self.stream), '上传批次')
        pointers = (self.input_gpu, self.output_gpu)
        arguments = (c.c_void_p * 2)(*(c.cast(c.byref(p), c.c_void_p) for p in pointers))
        grid = max(1 if r[1] == -1 else n for r,n in zip(requests,counts))
        self.check(self.launch(self.kernel, grid, len(requests), 1, 64, 1, 1, 0, self.stream, arguments, None), '启动批量HIP内核')
        self.check(self.copy(self.output_host, self.output_gpu, total*24, 2, self.stream), '下载批次')
        self.check(self.record(self.end, self.stream), '记录结束事件')
        self.check(self.sync(self.end), '等待批次完成')
        output = self.output_array[:total*3]
        if not np.isfinite(output).all():
            raise RuntimeError('GPU输出出现非有限值')
        offset=0
        for request,n in zip(requests,counts):
            if request[1] == -1 and (output[offset:offset+n*3:3] < -1).any():
                raise RuntimeError('GPU移动搜索队列容量不足，拒绝不完整结果')
            offset+=n*3
        milliseconds = c.c_float()
        self.check(self.elapsed(c.byref(milliseconds), self.begin, self.end), '读取GPU耗时')
        return output, counts, milliseconds.value
