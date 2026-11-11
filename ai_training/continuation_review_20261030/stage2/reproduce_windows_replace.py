"""使用隔离夹具验证Windows读句柄共享模式与原子替换的关系，不触碰真实账本。"""
import ctypes
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
fixture = HERE / 'windows-replace-fixture-2'
fixture.mkdir(exist_ok=False)
kernel = ctypes.WinDLL('kernel32', use_last_error=True)
kernel.CreateFileW.restype = ctypes.c_void_p
kernel.CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
                              ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
kernel.CloseHandle.argtypes = [ctypes.c_void_p]
results = []
for sharing in [3, 7]:
    target = fixture / f'ledger-{sharing}.json'
    pending = fixture / f'ledger-{sharing}.pending'
    target.write_text('{"fixture": "old"}', 'utf-8')
    pending.write_text('{"fixture": "new"}', 'utf-8')
    handle = kernel.CreateFileW(str(target), 0x80000000, sharing, None, 3, 0x80, None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        try:
            os.replace(pending, target)
            result = dict(shareFlags=sharing, replaceSucceeded=True)
        except PermissionError as error:
            result = dict(shareFlags=sharing, replaceSucceeded=False, error=repr(error), winerror=error.winerror)
    finally:
        kernel.CloseHandle(handle)
    if pending.exists():
        os.replace(pending, target)
        result['succeededAfterReaderClosed'] = True
    results.append(result)
assert not results[0]['replaceSucceeded'] and results[0]['winerror'] == 5
report = dict(passed=True, cases=results, gpuForwardCalls=0, optimizerUpdates=0,
              realLedgerModified=False,
              interpretation='隔离夹具证明持有读句柄时可以触发同类WinError5，关闭后替换成功；share7附加控制也如实记录，不能据此识别真实故障当时的具体持有者。',
              firstAttempt='v1脚本假设share7一定允许替换，该断言失败；脚本及夹具原件保留，未触及真实账本。')
(HERE / 'WINDOWS_REPLACE_REPRO.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps(report, ensure_ascii=False))
