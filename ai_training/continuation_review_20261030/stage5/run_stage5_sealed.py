"""持有Windows防休眠锁运行唯一封存实战；完整门禁验证在占用令牌之前执行。"""
import ctypes
import os
from pathlib import Path
import subprocess
from sealed_guard import validate_gate

HERE = Path(__file__).resolve().parent


def main():
    validate_gate()
    state = ctypes.windll.kernel32.SetThreadExecutionState
    state.argtypes = [ctypes.c_uint32]; state.restype = ctypes.c_uint32
    if not state(0x80000001):
        raise OSError('防休眠请求失败')
    try:
        return subprocess.call(['C:/Program Files/nodejs/node.exe', 'ai_training/run.mjs', 'node', '--import', 'tsx', str(HERE / 'sealed_matches.ts')], cwd=HERE.parents[2], env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}, creationflags=subprocess.CREATE_NO_WINDOW)
    finally:
        state(0x80000000)


if __name__ == '__main__':
    raise SystemExit(main())
