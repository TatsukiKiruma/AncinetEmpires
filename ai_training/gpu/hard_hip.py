"""通过AMD官方HIPRTC编译单内核；复用PyTorch设备内存与当前stream。"""
import ctypes as c
import hashlib
import os
from pathlib import Path
import sys
import torch


class HipScores:
    def __init__(self, device):
        if os.name != 'nt' or not torch.version.hip:
            raise RuntimeError('此HIPRTC装载器要求Windows官方ROCm环境；其他平台可用torch后端')
        sdk = Path(sys.prefix) / 'Lib/site-packages/_rocm_sdk_core'
        self.dll_directory = os.add_dll_directory(str(sdk / 'bin'))
        self.rtc = c.CDLL(str(sdk / 'bin/hiprtc0702.dll'))
        self.hip = c.CDLL(str(sdk / 'bin/amdhip64_7.dll'))
        def bind(lib, name, args):
            fn = getattr(lib, name); fn.restype = c.c_int; fn.argtypes = args; return fn
        self.create = bind(self.rtc, 'hiprtcCreateProgram', [c.POINTER(c.c_void_p), c.c_char_p, c.c_char_p, c.c_int, c.c_void_p, c.c_void_p])
        self.compile = bind(self.rtc, 'hiprtcCompileProgram', [c.c_void_p, c.c_int, c.POINTER(c.c_char_p)])
        self.log_size = bind(self.rtc, 'hiprtcGetProgramLogSize', [c.c_void_p, c.POINTER(c.c_size_t)])
        self.log = bind(self.rtc, 'hiprtcGetProgramLog', [c.c_void_p, c.c_void_p])
        self.code_size = bind(self.rtc, 'hiprtcGetCodeSize', [c.c_void_p, c.POINTER(c.c_size_t)])
        self.code = bind(self.rtc, 'hiprtcGetCode', [c.c_void_p, c.c_void_p])
        self.destroy = bind(self.rtc, 'hiprtcDestroyProgram', [c.POINTER(c.c_void_p)])
        self.load = bind(self.hip, 'hipModuleLoadData', [c.POINTER(c.c_void_p), c.c_void_p])
        self.function = bind(self.hip, 'hipModuleGetFunction', [c.POINTER(c.c_void_p), c.c_void_p, c.c_char_p])
        self.launch = bind(self.hip, 'hipModuleLaunchKernel', [c.c_void_p, *([c.c_uint] * 7), c.c_void_p, c.POINTER(c.c_void_p), c.c_void_p])
        self.device = device
        self.module, self.kernel = c.c_void_p(), c.c_void_p()
        source = Path(__file__).with_name('hard_score.hip').read_bytes()
        self.source_sha256 = hashlib.sha256(source).hexdigest()
        architecture = torch.cuda.get_device_properties(device).gcnArchName.split(':')[0]
        options = [f'--gpu-architecture={architecture}'.encode(), b'-ffp-contract=off', b'-O2', ('-I' + str(sdk / 'include')).encode()]
        program = c.c_void_p()
        self.check(self.create(c.byref(program), source, b'hard_score.hip', 0, None, None), '创建HIP程序')
        try:
            status = self.compile(program, len(options), (c.c_char_p * len(options))(*options))
            if status:
                length = c.c_size_t(); self.log_size(program, c.byref(length)); message = c.create_string_buffer(length.value)
                self.log(program, message)
                raise RuntimeError('HIP编译失败：' + message.value.decode(errors='replace'))
            length = c.c_size_t(); self.check(self.code_size(program, c.byref(length)), '读取HIP代码长度')
            binary = c.create_string_buffer(length.value); self.check(self.code(program, binary), '读取HIP代码')
            self.check(self.load(c.byref(self.module), binary), '装载HIP模块')
            self.check(self.function(c.byref(self.kernel), self.module, b'hard_score'), '读取HIP内核')
        finally:
            self.destroy(c.byref(program))

    @staticmethod
    def check(code, operation):
        if code != 0:
            raise RuntimeError(f'{operation}失败，HIP错误码{code}')

    def calculate(self, request):
        n = len(request['positions'])
        data = [n, len(request['enemyPositions']), len(request['allyPositions']), len(request['landingPositions']),
                request['landingCount'], request['unitValue'], request['maxRange'], request['situation'] if request['situation'] is not None else 1.]
        for key in ['positions', 'enemyPositions', 'allyPositions', 'landingPositions']:
            data.extend(x for row in request[key] for x in row)
        data.extend(request['defenses'])
        source = torch.tensor(data, device=self.device, dtype=torch.float64)
        output = torch.empty((n, 3), device=self.device, dtype=torch.float64)
        pointers = (c.c_void_p(source.data_ptr()), c.c_void_p(output.data_ptr()))
        arguments = (c.c_void_p * 2)(*(c.cast(c.byref(p), c.c_void_p) for p in pointers))
        stream = torch.cuda.current_stream(self.device).cuda_stream
        self.check(self.launch(self.kernel, (n + 63) // 64, 1, 1, 64, 1, 1, 0, c.c_void_p(stream), arguments, None), '启动HIP评分内核')
        values = output.cpu().tolist()
        return {key: [row[i] for row in values] for i, key in enumerate(['enemy', 'ally', 'landing'])}
