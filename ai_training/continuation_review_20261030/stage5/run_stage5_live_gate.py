"""独立进程启动续跑；已有完整收据校验后跳过，不覆盖已完成对局。"""
import os
import ctypes
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def main():
    # 防休眠请求属于当前线程，必须在子进程整个生命周期保持本线程存活。
    execution_state = ctypes.windll.kernel32.SetThreadExecutionState
    execution_state.argtypes = [ctypes.c_uint32]
    execution_state.restype = ctypes.c_uint32
    if not execution_state(0x80000000 | 0x00000001):
        raise OSError('无法获取系统防休眠锁，拒绝启动实战')
    print('系统防休眠锁已开启：ES_CONTINUOUS | ES_SYSTEM_REQUIRED', flush=True)
    try:
        return subprocess.call(['C:/Program Files/nodejs/node.exe', 'ai_training/run.mjs', 'node', '--import', 'tsx', str(HERE / 'development_resume.ts')], cwd=ROOT,
                               env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}, creationflags=subprocess.CREATE_NO_WINDOW)
    finally:
        execution_state(0x80000000)
        print('系统防休眠锁已释放', flush=True)


if __name__ == '__main__':
    raise SystemExit(main())
