"""确认本轮旧worker已消失后，保留中断产物并恢复写入前沿；不操作其他进程。"""
import ctypes
from ctypes import wintypes
import datetime
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPLAY = HERE.parent/'replay'
stamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')
kernel = ctypes.WinDLL('kernel32', use_last_error=True)
kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel.OpenProcess.restype = wintypes.HANDLE
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
lock = REPLAY/'worker.lock.json'
if lock.exists():
    previous = json.loads(lock.read_text(encoding='utf8'))
    handle = kernel.OpenProcess(0x1000, False, previous['pid'])
    if handle:
        kernel.CloseHandle(handle)
        raise RuntimeError('旧回放PID仍存在，不移动锁、不启动第二worker')
    error = ctypes.get_last_error()
    if error != 87:
        raise RuntimeError(f'不能证明旧回放PID消失：Win32 error {error}')

moved = []
def preserve(file, destination):
    source = file.resolve()
    target = destination.resolve()
    if not source.is_relative_to(HERE.parent) or not target.is_relative_to(HERE.parent):
        raise RuntimeError('恢复文件路径越界')
    if datetime.datetime.now().timestamp()-source.stat().st_mtime < 60:
        raise RuntimeError('产物最近仍在写入，不做恢复')
    target.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    size = source.stat().st_size
    source.rename(target)
    if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        raise RuntimeError('移动后字节身份异常')
    moved.append({'from': str(source.relative_to(HERE.parent)), 'to': str(target.relative_to(HERE.parent)),
                  'bytes': size, 'sha256': digest})

for name in ['full_v6']+[f'shard_{c}_v6' for c in 'abcdef']:
    directory = HERE/name
    for file in (directory/'candidate_shards').glob('*.partial'):
        preserve(file, directory/'interrupted'/(file.name+'.'+stamp))
if lock.exists():
    preserve(lock, REPLAY/'interrupted'/('worker.lock.'+stamp+'.json'))
report = {'observedAt': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
          'reason': '执行工具会话丢失；Get-Process未见node/python，旧回放PID OpenProcess返回ERROR_INVALID_PARAMETER(87)',
          'scope': '只保留本轮未完成临时分片和已证实失效锁；没有终止任何进程，没有删除数据', 'moved': moved,
          'replayAttemptsPreservedInPlace': True}
(HERE/('recovery-'+stamp+'.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print(json.dumps(report, ensure_ascii=False))
