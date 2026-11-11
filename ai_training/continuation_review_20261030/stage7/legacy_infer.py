"""Stage 6 传输/前向的同工作负载对照，只使用 Stage 7 独立缓存。"""
import ctypes
import os
from pathlib import Path
import runpy
import sys

DATA = Path('D:/AncientEmpiresData/continuation_stage7_20261108_v1')
os.environ['MIOPEN_USER_DB_PATH'] = str(DATA / 'stage6-reference-miopen-db')
os.environ['MIOPEN_CUSTOM_CACHE_DIR'] = str(DATA / 'stage6-reference-miopen-cache')
for env in ('MIOPEN_USER_DB_PATH', 'MIOPEN_CUSTOM_CACHE_DIR'):
    Path(os.environ[env]).mkdir(exist_ok=True)
os.environ.pop('MIOPEN_FIND_MODE', None)
entry = Path(__file__).resolve().parent.parent / 'stage6' / 'infer.py'
sys.path.insert(0, str(entry.parent))
sys.argv[0] = str(entry)
kernel = ctypes.windll.kernel32
if not kernel.SetThreadExecutionState(0x80000001):
    raise RuntimeError('对照服务防休眠锁获取失败')
try:
    runpy.run_path(str(entry), run_name='__main__')
finally:
    kernel.SetThreadExecutionState(0x80000000)
