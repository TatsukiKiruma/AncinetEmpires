"""让同一 G1 分桶服务使用经控制器锁定的候选模型。"""
import ctypes
import hashlib
import os
from pathlib import Path
import sys
import traceback

import service_v2 as service


def main():
    prefix, expected = sys.argv[1:]
    digest = hashlib.sha256(Path(prefix + '.bin').read_bytes()).hexdigest()
    if digest != expected:
        raise ValueError('G1 推理模型摘要不符')
    load = service.load_model
    service.load_model = lambda _: load(prefix)
    service.main()


if __name__ == '__main__':
    kernel = ctypes.windll.kernel32
    if not kernel.SetThreadExecutionState(0x80000001):
        raise RuntimeError('防休眠锁获取失败')
    code = 0
    try:
        main()
    except BaseException:
        traceback.print_exc()
        code = 1
    finally:
        kernel.SetThreadExecutionState(0x80000000)
        sys.stdout.flush()
        sys.stderr.flush()
    os._exit(code)
