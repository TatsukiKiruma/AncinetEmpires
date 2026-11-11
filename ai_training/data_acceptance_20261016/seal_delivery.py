"""仅在全量验收、报告和状态入口完成后封存本轮交付清单。"""
import datetime
import hashlib
import json
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TARGET = HERE/'DELIVERY_MANIFEST.json'
if TARGET.exists():
    raise RuntimeError('交付清单已存在；先复核，不能直接覆盖已封存结果')
validation = json.loads((HERE/'validation-summary.json').read_text(encoding='utf8'))
acceptance = json.loads((HERE/'FINAL_ACCEPTANCE.json').read_text(encoding='utf8'))
progress = json.loads((HERE/'phone/progress-latest.json').read_text(encoding='utf8'))
assert validation['passed'] and acceptance['native']['allRequestedProcessed']
assert acceptance['native']['processedSegments'] == progress['groups']['full_v6']['receipts'] == 5012
assert not acceptance['trainingStarted'] and not acceptance['phoneControlsTouched']
assert not progress['changedFrozenFiles']
assert not list((HERE/'phone').glob('*_v6/candidate_shards/*.partial')), '仍有未封存的工作分片'
for file in (HERE/'phone').glob('*_v6/resource-execution-*.json'):
    proof = json.loads(file.read_text(encoding='utf8'))
    assert proof['sourceStable'] and proof.get('finishedAt'), file
frontier = json.loads((HERE/'phone/EXECUTION_FRONTIER.json').read_text(encoding='utf8'))
assert not frontier['activeToolSessions'], '状态入口仍有未结束任务'
assert 'REPORT.md' in (ROOT/'ai_training/status/CURRENT.md').read_text(encoding='utf8')
files = sorted(p for p in HERE.rglob('*') if p.is_file() and p != TARGET)
artifacts = []
for file in files:
    assert file.resolve().is_relative_to(HERE)
    before = file.stat()
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    after = file.stat()
    assert (before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns), file
    artifacts.append(dict(path=file.relative_to(HERE).as_posix(), bytes=after.st_size, sha256=digest))
assert set(files) == {p for p in HERE.rglob('*') if p.is_file() and p != TARGET}, '封存期间有新增文件'
record = dict(sealedAt=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
              scope='整个本轮目录的交付证据清单，含隔离和中断证据；训练来源只能由最终release用途索引与具体模型schema门槛决定',
              nativeRelease=validation['nativeRelease'], nativeSegments=5012, nativeParents=3000,
              realUniqueResponses=257, artifacts=artifacts,
              trainingStarted=False, phoneControlsTouched=False, modelSchemaAccepted=False,
              artifactLogicalBytesExcludingManifest=sum(x['bytes'] for x in artifacts),
              outputLimitBytes=1342177280, cFreeBytesMin=12*1024**3,
              currentStatusPointerSha256=hashlib.sha256((ROOT/'ai_training/status/CURRENT.md').read_bytes()).hexdigest())
raw = (json.dumps(record, ensure_ascii=False, indent=2)+'\n').encode()
assert record['artifactLogicalBytesExcludingManifest']+len(raw) <= record['outputLimitBytes']
assert shutil.disk_usage(ROOT).free >= record['cFreeBytesMin']
with TARGET.open('xb') as stream:
    stream.write(raw)
print(json.dumps(dict(sealed=True, files=len(artifacts), manifestSha256=hashlib.sha256(raw).hexdigest(),
                      totalLogicalBytes=record['artifactLogicalBytesExcludingManifest']+len(raw),
                      cFreeBytes=shutil.disk_usage(ROOT).free), ensure_ascii=False))
