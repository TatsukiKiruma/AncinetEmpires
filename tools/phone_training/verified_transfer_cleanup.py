import datetime
import hashlib
import json
import pathlib
import re
import continuation_io as io

# 仅删除电脑已有逐文件验证归档的手机临时传输副本，不删除任何轨迹目录。
io.adb = 'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
local = pathlib.Path('C:/code/AncinetEmpires/captures/phone-continuation-61-20261015')
remote_root = '/data/local/tmp/aeii-compressed-transfers-20261015'
raw = io.shell('cd '+remote_root+" && find . -maxdepth 1 -type f -name 'continuation-round-*.tar.gz' -exec sha256sum {} +", timeout=180)
rows = []
for line in raw.splitlines():
    phone_sha, name = line.split(None, 1)
    name = name.strip().removeprefix('./')
    if not re.fullmatch(r'continuation-round-\d{4}(?:-audits)?\.tar\.gz', name):
        raise RuntimeError('临时文件名不在允许范围 '+name)
    archive = local/name
    evidence = json.loads(archive.with_suffix('.validation.json').read_text(encoding='utf8'))
    assert evidence['all_equal']
    computer_sha = hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest()
    if computer_sha != phone_sha or computer_sha != evidence['archive_sha256']:
        raise RuntimeError('临时副本摘要与已核验电脑归档不同 '+name)
    rows.append(dict(name=name, bytes=archive.stat().st_size, sha256=computer_sha, computer_archive=str(archive)))
record = dict(created_at=datetime.datetime.now().isoformat(), purpose='无损保留全部轨迹，仅移除经过SHA核验的重复传输副本', remote_root=remote_root, files=rows, deleted=[], bytes=sum(r['bytes'] for r in rows))
output = local/'verified-transfer-duplicate-cleanup.json'
output.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf8')
for row in rows:
    remote = remote_root+'/'+row['name']
    if io.shell('readlink -f '+remote).strip() != remote:
        raise RuntimeError('拒绝删除非预期路径 '+remote)
    io.shell('rm '+remote)
    record['deleted'].append(row['name'])
    output.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(dict(files=len(record['deleted']), bytes=record['bytes']), ensure_ascii=False), flush=True)
