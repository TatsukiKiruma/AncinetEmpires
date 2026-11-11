"""单进程流式核验压缩归档；不解包落盘，不执行归档内代码。"""
from pathlib import Path
import hashlib
import json
import tarfile
import time

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent.parent
BASE = ROOT / 'ai_training/training_runs/server_archive_20260913'

def digest_file(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

compact = json.loads((BASE / 'compact_manifest.json').read_text('utf-8'))
receipt = json.loads((BASE / 'local-receipt.json').read_text('utf-8'))
expected = receipt['inventory']['files']
manifest = json.loads((BASE / 'dataset/manifest.json').read_text('utf-8'))
for entry in manifest['shards']:
    old = expected[entry['path']]
    assert old['bytes'] == entry['bytes'] and old['sha256'] == entry['sha256']
results = []
for archive in compact['archives']:
    cache = OUT / ('archive_audit_' + archive['sha256'][:12] + '.json')
    if cache.exists():
        record = json.loads(cache.read_text('utf-8'))
        if record.get('complete') and record['compressedSha256'] == digest_file(BASE / archive['path']):
            results.append(record)
            continue
    started = time.monotonic()
    filename = BASE / archive['path']
    sha = digest_file(filename)
    if sha != archive['sha256']:
        raise RuntimeError('压缩包哈希不一致：' + str(filename))
    rows = []
    with tarfile.open(filename, mode='r|xz') as tar:
        for member in tar:
            if not member.isfile():
                if member.isdir():
                    continue
                raise RuntimeError('归档中包含链接或特殊成员：' + member.name)
            name = member.name.replace('\\', '/')
            at = name.find('checkpoints/')
            key = name[at:] if at >= 0 else name
            h = hashlib.sha256()
            stream = tar.extractfile(member)
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                h.update(block)
            actual = h.hexdigest()
            exp = expected.get(key)
            row = dict(path=key, bytes=member.size, sha256=actual, expected=exp,
                       passed=bool(exp and exp['bytes'] == member.size and exp['sha256'] == actual))
            rows.append(row)
            if len(rows) % 20 == 0:
                print(json.dumps(dict(archive=archive['path'], members=len(rows), seconds=round(time.monotonic()-started, 1))), flush=True)
    record = dict(archive=archive['path'], compressedSha256=sha, compressedBytes=filename.stat().st_size,
                  members=rows, complete=True, elapsedSeconds=time.monotonic()-started)
    cache.write_text(json.dumps(record, ensure_ascii=False, indent=2), 'utf-8')
    results.append(record)
all_rows = [row for record in results for row in record['members']]
found = {row['path'] for row in all_rows}
report = dict(archives=results, expectedFiles=len(expected), actualFiles=len(all_rows),
              missing=sorted(set(expected)-found), duplicateMembers=len(all_rows)-len(found),
              mismatches=[row for row in all_rows if not row['passed']],
              complete=len(found)==len(expected) and all(row['passed'] for row in all_rows),
              interpretation='完整性只表示历史哈希特征字节可用；不可逆推出棋盘，不代表当前规则或空间编码训练适用')
(OUT / 'archive_audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='archives'}, ensure_ascii=False), flush=True)
