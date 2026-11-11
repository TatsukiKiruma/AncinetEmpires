"""最终只读复核固定快照的封存归档；不追采集新轮次，不解压或复制。"""
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
summary = json.loads((HERE/'endpoints/audit-summary.json').read_text(encoding='utf8'))
start = time.monotonic()
results = []
for item in summary['archives']:
    if shutil.disk_usage(ROOT).free < 12*1024**3:
        raise RuntimeError('磁盘水位触发，仅停止本只读复核')
    file = (ROOT/item['archive']).resolve()
    if not file.is_relative_to(ROOT/'captures'):
        raise RuntimeError('归档引用越过captures')
    before = file.stat()
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        while block := stream.read(4*1024**2):
            digest.update(block)
    after = file.stat()
    accepted = (digest.hexdigest() == item['sha256'] and before.st_size == after.st_size == item['bytes']
                and before.st_mtime_ns == after.st_mtime_ns)
    row = {'archive': item['archive'], 'bytes': after.st_size, 'mtimeNs': str(after.st_mtime_ns),
           'sha256': digest.hexdigest(), 'accepted': accepted}
    results.append(row)
    if not accepted:
        raise RuntimeError('封存归档身份变化，禁止最终发布：'+item['archive'])
    if len(results) % 10 == 0:
        print(json.dumps({'verifiedArchives': len(results), 'seconds': round(time.monotonic()-start, 2)}), flush=True)
report = {'snapshot': summary['snapshot'], 'endpointSourceId': summary['sourceId'],
          'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'accepted': all(r['accepted'] for r in results), 'archives': results,
          'totalBytes': sum(r['bytes'] for r in results), 'seconds': time.monotonic()-start}
name = 'archive-integrity-'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')+'.json'
(HERE/name).write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print(json.dumps({'accepted': report['accepted'], 'archives': len(results), 'bytes': report['totalBytes'], 'out': name}))
