"""交互持有本任务防休眠锁，关闭输入或异常退出时释放。"""
import ctypes
import os

kernel = ctypes.windll.kernel32
assert kernel.SetThreadExecutionState(0x80000001)
print(f'stage7 防休眠锁已获取 PID={os.getpid()}', flush=True)
try:
    input()
finally:
    kernel.SetThreadExecutionState(0x80000000)
    print('stage7 防休眠锁已释放', flush=True)
