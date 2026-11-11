"""仅统计本轮收据与磁盘，不把临时分片或历史状态当作完成。"""
import ctypes
import datetime
import hashlib
import json
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
groups = {}
for name in ['full_v6'] + [f'shard_{c}_v6' for c in 'abcdefgh']:
    directory = HERE/name
    if not directory.exists():
        continue
    files = list((directory/'receipts').glob('*.json'))
    groups[name] = {'receipts': len(files),
                    'partial': [{'name': p.name, 'bytes': p.stat().st_size}
                                for p in (directory/'candidate_shards').glob('*.partial')]}
identity = json.loads((HERE/'full_v6/source-identity.json').read_text(encoding='utf8'))
changed = [p for p, digest in identity['source'].items()
           if hashlib.sha256((ROOT/p).read_bytes()).hexdigest() != digest]
memory_fields = [('dwLength', ctypes.c_ulong), ('dwMemoryLoad', ctypes.c_ulong)] + [
    (name, ctypes.c_ulonglong) for name in ['ullTotalPhys', 'ullAvailPhys', 'ullTotalPageFile',
                                         'ullAvailPageFile', 'ullTotalVirtual', 'ullAvailVirtual', 'ullAvailExtendedVirtual']]
memory_type = type('MEMORYSTATUSEX', (ctypes.Structure,), {'_fields_': memory_fields})
memory = memory_type()
memory.dwLength = ctypes.sizeof(memory)
ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory))
result = {'observedAt': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
          'snapshot': 'snapshot_20261016_001729', 'requestedSegments': 5012, 'groups': groups,
          'changedFrozenFiles': changed,
          'newLogicalBytes': sum(p.stat().st_size for p in HERE.parent.rglob('*') if p.is_file()),
          'cFreeBytes': shutil.disk_usage(ROOT).free,
          'availablePhysicalMemoryBytes': memory.ullAvailPhys, 'memoryLoadPercent': memory.dwMemoryLoad,
          'trainingStarted': False, 'phoneControlsTouched': False,
          'scope': '时间快照；没有查询进程，partial不等于处理完成，后续不能据此判断进程仍活跃'}
(HERE/'progress-latest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
with (HERE/'progress-history.jsonl').open('a', encoding='utf8') as stream:
    stream.write(json.dumps(result, ensure_ascii=False)+'\n')
print(json.dumps(result, ensure_ascii=False))
