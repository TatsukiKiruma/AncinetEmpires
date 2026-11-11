"""唯一GPU服务：二进制微批次、缓冲区复用及约50%占用软限流。"""
import argparse
import json
import os
import struct
import sys
import time
import numpy as np
import torch
from hip_batch import HipBatch
from gpu_monitor import GpuMonitor


def exact(stream, count):
    data = bytearray(count)
    view = memoryview(data); offset = 0
    while offset < count:
        read = stream.readinto(view[offset:])
        if not read: raise EOFError('GPU批次管道截断')
        offset += read
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target-util', type=float, default=50.)
    args = parser.parse_args()
    if not 1 <= args.target_util <= 100: parser.error('GPU占用目标需在1—100之间')
    torch.set_num_threads(1)
    backend = HipBatch()
    monitor = GpuMonitor()
    source, sink = sys.stdin.buffer, sys.stdout.buffer
    def send(header, raw=b''):
        metadata = json.dumps(header, allow_nan=False).encode()
        sink.write(struct.pack('<II', len(metadata), len(raw))); sink.write(metadata); sink.write(raw); sink.flush()
    send(dict(ready=True, pid=os.getpid(), name=torch.cuda.get_device_name(0), architecture=backend.architecture,
              torch=torch.__version__, hip=torch.version.hip, kernelSha256=backend.source_sha256,
              targetUtilPercent=args.target_util, backend='hip-batched-fp64'))
    # 占用是1秒采样的软控制，不是实时硬件配额；未知值不当成0%。
    delay = 0.; last_monitor_epoch = None
    try:
        while first := source.read(1):
            number = struct.unpack('<I', first + exact(source, 3))[0]
            if number == 0: break
            if number > 128: raise ValueError('GPU批次数量过大')
            requests = []
            for _ in range(number):
                size = struct.unpack('<I', exact(source, 4))[0]
                if size < 64 or size > 2**22 or size % 8: raise ValueError('GPU批次字节长度无效')
                requests.append(np.frombuffer(exact(source, size), dtype='<f8'))
            started = time.perf_counter()
            sample = monitor.latest
            if sample.get('available') and sample.get('epoch') != last_monitor_epoch:
                last_monitor_epoch = sample['epoch']
                usage = sample['processMaxEnginePercent']
                if usage > args.target_util: delay = min(.05, max(.0001, delay * 1.4 + .0001))
                elif usage < args.target_util - 5: delay *= .5
            if delay: time.sleep(delay)
            output, counts, gpu_ms = backend.calculate(requests)
            send(dict(counts=counts, serviceSeconds=time.perf_counter()-started, gpuMs=gpu_ms,
                      pinned=backend.pinned, throttleMs=delay*1000, utilization=sample), output.tobytes())
    except Exception as error:
        send(dict(error=repr(error)))
        raise
    finally:
        monitor.close()


if __name__ == '__main__':
    status = 0
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
        status = 1
    # 正常协议退出已同步GPU、关闭采样；绕过Windows ROCm解释器卸载时的等待。
    sys.stdout.flush(); sys.stderr.flush()
    import ctypes
    terminate = ctypes.windll.kernel32.TerminateProcess
    terminate.argtypes = [ctypes.c_void_p, ctypes.c_uint]
    terminate(ctypes.c_void_p(-1), status)
