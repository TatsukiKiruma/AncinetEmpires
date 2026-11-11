"""受控运行子命令并在正常结束或异常时释放Windows防休眠锁。"""
import ctypes
import subprocess
import sys
import os

def main():
    if not ctypes.windll.kernel32.SetThreadExecutionState(0x80000001):
        raise RuntimeError('防休眠锁获取失败')
    print(f'防休眠锁已获取，控制器PID={os.getpid()}', flush=True)
    try:
        return subprocess.call(sys.argv[1:])
    finally:
        if not ctypes.windll.kernel32.SetThreadExecutionState(0x80000000):
            raise RuntimeError('防休眠锁释放失败')
        print(f'防休眠锁已释放，控制器PID={os.getpid()}', flush=True)

if __name__ == '__main__':
    raise SystemExit(main())
