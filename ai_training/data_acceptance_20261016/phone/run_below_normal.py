"""低优先级调用已冻结转换器；不改变其输入、动作或源码身份。"""
import ctypes
from ctypes import wintypes
import os
from pathlib import Path
import runpy

if os.name != 'nt':
    raise RuntimeError('本启动器仅针对当前Windows主机')
kernel = ctypes.windll.kernel32
kernel.GetCurrentProcess.restype = wintypes.HANDLE
kernel.SetPriorityClass.argtypes = [wintypes.HANDLE, wintypes.DWORD]
kernel.SetPriorityClass.restype = wintypes.BOOL
if not kernel.SetPriorityClass(kernel.GetCurrentProcess(), 0x4000):
    raise RuntimeError('无法设置低于正常优先级，拒绝启动附加重放')
os.environ['NODE_OPTIONS'] = '--max-old-space-size=1536'
runpy.run_path(str(Path(__file__).with_name('run_phone.py')), run_name='__main__')
