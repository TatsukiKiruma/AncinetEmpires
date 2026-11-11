"""Windows可替换文件的共享读取与有界重试；失败样本不刷新看门狗。"""
import ctypes
from ctypes import wintypes
import json
import math
import msvcrt
import os
import time

_kernel = ctypes.WinDLL('kernel32', use_last_error=True)
_kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                               wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
_kernel.CreateFileW.restype = wintypes.HANDLE
_kernel.CloseHandle.argtypes = [wintypes.HANDLE]


def shared_text(file):
    # 同时允许读取、写入和删除/重命名，避免心跳原子替换与监督读取相互阻塞。
    handle = _kernel.CreateFileW(str(file), 0x80000000, 1 | 2 | 4, None, 3, 0x80, None)
    if handle == wintypes.HANDLE(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        descriptor = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
    except BaseException:
        _kernel.CloseHandle(handle)
        raise
    with os.fdopen(descriptor, 'rb') as stream:
        return stream.read().decode('utf-8-sig')


def transient(error):
    return isinstance(error, PermissionError) or getattr(error, 'winerror', None) in (5, 32, 33)


def retry_fs(operation, timeout=2.0):
    end = time.monotonic() + timeout
    delay = .008
    while True:
        try:
            return operation()
        except OSError as error:
            if not transient(error) or time.monotonic() + delay > end:
                raise
            time.sleep(delay)
            delay = min(.128, delay * 2)


def read_json(file, timeout=2.0):
    return json.loads(retry_fs(lambda: shared_text(file), timeout))


class HeartbeatMonitor:
    def __init__(self, started):
        self.last = started
        self.sample = None
        self.read_failures = 0
        self.last_error = None

    def poll(self, file, now):
        try:
            sample = read_json(file, timeout=.25)
            updated = sample['updatedMs'] / 1000
            if not math.isfinite(updated):
                raise ValueError('心跳时间不是有限数')
            self.last = max(self.last, min(now, updated))
            self.sample = sample
        except (OSError, ValueError, KeyError, TypeError) as error:
            # 短暂共享冲突、缺失或损坏的样本只作诊断；看门狗仍使用上次成功心跳。
            self.read_failures += 1
            self.last_error = repr(error)
        return self.last
