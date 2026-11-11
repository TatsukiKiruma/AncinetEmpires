"""用户确认归档中断局后，持有防休眠锁恢复双worker。"""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import subprocess
from write_budget import reserve

HERE = Path(__file__).resolve().parent


def main():
    proof = json.loads((HERE / 'RESTART_TWO_WORKER_AUTHORIZATION.json').read_text(encoding='utf-8'))
    for filename, digest in proof['protectedFiles'].items():
        if hashlib.sha256(Path(filename).read_bytes()).hexdigest() != digest:
            raise RuntimeError('受保护证据发生变化：' + filename)
    reserve(0)
    with (HERE / 'RESTART_TWO_WORKER_STARTED.json').open('x', encoding='utf-8') as handle:
        json.dump({'pid': os.getpid(), 'sealedAccess': 1}, handle)
    state = ctypes.windll.kernel32.SetThreadExecutionState
    state.argtypes = [ctypes.c_uint32]
    state.restype = ctypes.c_uint32
    if not state(0x80000001):
        raise OSError('无法取得防休眠锁')
    try:
        print('35局证据核验通过；防休眠锁开启；恢复双worker', flush=True)
        return subprocess.call(['C:/Program Files/nodejs/node.exe', 'ai_training/run.mjs', 'node', '--import', 'tsx', str(HERE / 'sealed_two_workers_restart.ts')], cwd=HERE.parents[2], env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}, creationflags=subprocess.CREATE_NO_WINDOW)
    finally:
        state(0x80000000)
        print('防休眠锁已释放', flush=True)


if __name__ == '__main__':
    raise SystemExit(main())
