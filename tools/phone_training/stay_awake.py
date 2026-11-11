import ctypes,json,sys
from ctypes import wintypes

# 仅在指定采集进程存活时阻止电脑自动睡眠，不修改电源方案或显示器状态。
k=ctypes.WinDLL('kernel32',use_last_error=True)
k.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];k.OpenProcess.restype=wintypes.HANDLE
k.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD];k.WaitForSingleObject.restype=wintypes.DWORD
k.SetThreadExecutionState.argtypes=[wintypes.DWORD];k.SetThreadExecutionState.restype=wintypes.DWORD
k.CloseHandle.argtypes=[wintypes.HANDLE]
parent=int(sys.argv[1]);handle=k.OpenProcess(0x00100000,False,parent)
if not handle:raise ctypes.WinError(ctypes.get_last_error())
try:
 if not k.SetThreadExecutionState(0x80000001):raise ctypes.WinError(ctypes.get_last_error())
 print(json.dumps({'holding_system_awake_for_pid':parent,'power_plan_changed':False}),flush=True)
 while k.WaitForSingleObject(handle,10000)==258:pass
finally:
 k.SetThreadExecutionState(0x80000000);k.CloseHandle(handle)
