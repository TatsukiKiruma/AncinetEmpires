"""用Windows真实禁止删除共享句柄触发重命名冲突，验证有界重试而非模拟异常。"""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATA = Path('D:/AncientEmpiresData/continuation_stage4_v6_20261102_v1')
suffix = '-probe' if '--probe' in sys.argv else '-v2' if '--v2' in sys.argv else ''
folder = DATA / ('io-contract-check' + suffix)
folder.mkdir(exist_ok=False)
kernel = ctypes.WinDLL('kernel32', use_last_error=True)
kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
kernel.CreateFileW.restype = wintypes.HANDLE
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
results = []
for mode in ['release', 'bounded']:
    file = folder / (mode + '.json')
    file.write_text('{"version":"旧内容"}', encoding='utf8')
    handle = kernel.CreateFileW(str(file), 0x80000000, 1, None, 3, 0x80, None)
    if handle == wintypes.HANDLE(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    child = None
    try:
        child = subprocess.Popen(['node', '--import', 'tsx', str(HERE / 'check_io_writer.ts'), str(file), mode], cwd=ROOT,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf8', creationflags=subprocess.CREATE_NO_WINDOW)
        assert child.stdout.readline().strip() == '开始原子替换'
        if mode == 'release':
            time.sleep(.35)
            kernel.CloseHandle(handle); handle = None
        tail, errors = child.communicate(timeout=10)
        assert child.returncode == 0, errors
        result = json.loads(tail.strip())
        if mode == 'release':
            assert result['success'] and 300 <= result['ms'] <= 2200, result
        else:
            assert not result['success'] and result['code'] in ['EPERM', 'EACCES', 'EBUSY'] and 1500 <= result['ms'] <= 2200, result
        results.append(result)
    finally:
        if handle:
            kernel.CloseHandle(handle)
        if child and child.poll() is None:
            child.kill(); child.wait(timeout=5)
payload = dict(passed=True, realWindowsSharingViolation=True, results=results, childrenRemaining=0)
pending = HERE / ('IO_RETRY_CHECK.' + str(os.getpid()) + '.pending')
pending.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf8')
os.link(pending, HERE / ('IO_RETRY_CHECK' + suffix + '.json'))
pending.unlink()
print(json.dumps(payload, ensure_ascii=False))
