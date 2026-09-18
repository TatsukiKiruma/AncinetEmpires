"""增量归档：运行时下载完整批次，全部校验后停机清理并续跑。"""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile

BASE = Path(__file__).resolve().parents[1]
ARCHIVE = BASE / 'training_runs/server_archive_20260913'
TRANSFER = ARCHIVE / 'incremental_20260916'
DATA = ARCHIVE / 'dataset'
ROOT = '/home/ubuntu/ancientempires-training-20260909'
OPTIONS = ['-i', r'C:\Users\SHIINA\Downloads\chat.pem', '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', r'UserKnownHostsFile=C:\Users\SHIINA\AppData\Local\Temp\autoband-deploy-known-hosts']
HOST = 'ubuntu@111.230.73.106'
REMOTE = ROOT + '/runtime/offload/incremental_20260916'


def remote(code):
    result = subprocess.run(['ssh', *OPTIONS, HOST, 'python3 -'], input=code, text=True, encoding='utf-8', capture_output=True, check=True)
    print(result.stderr, end='', flush=True)
    return result.stdout


def verify(file, expected):
    assert file.is_file() and file.stat().st_size == expected['bytes'], str(file)
    with file.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == expected['sha256'], str(file)


COMMON = '''
import hashlib, json, subprocess, os
from pathlib import Path
ROOT = Path('/home/ubuntu/ancientempires-training-20260909')
OUT = ROOT / 'runtime/offload/incremental_20260916'
def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()
'''


def download():
    TRANSFER.mkdir(exist_ok=True)
    # 固定完整清单快照；后续产生的批次留在服务器。
    snapshot = remote(COMMON + '''
OUT.mkdir(exist_ok=True)
assert not (OUT / 'inventory.json').exists(), '本次传输已存在，请检查后恢复'
statuses = list((ROOT / 'training_runs/feature_datasets').glob('*/*/migration-status.json'))
assert len(statuses) == 1
run = statuses[0].parent.resolve()
status = json.loads(statuses[0].read_text())
old = json.loads((run / 'offloaded-checkpoints.json').read_text())
assert old['verified'] is True and old['inventory']['runDir'] == str(run)
active = {b['batchId'] for b in status.get('activeBatches', [])}
files, manifests = {}, {}
for manifest in sorted((run / 'checkpoints').glob('*/*/manifest.json')):
    relative = manifest.relative_to(run).as_posix()
    if relative in old['inventory']['manifests']:
        assert digest(manifest) == old['inventory']['manifests'][relative]
        continue
    if manifest.parent.parent.name in active:
        continue
    data = json.loads(manifest.read_text())
    entries = [manifest]
    for shard in data['shards']:
        file = (manifest.parent / shard['path']).resolve()
        assert file.is_relative_to(manifest.parent.resolve()) and not file.is_symlink()
        assert file.stat().st_size == shard['bytes'] and digest(file) == shard['sha256']
        entries.append(file)
    for file in entries:
        files[file.relative_to(run).as_posix()] = {'bytes': file.stat().st_size, 'sha256': digest(file)}
    manifests[relative] = files[relative]['sha256']
assert manifests
record = {'version': 1, 'runDir': str(run), 'migrationId': status['migrationId'], 'files': files, 'manifests': manifests}
(OUT / 'inventory.json').write_text(json.dumps(record, indent=2))
(OUT / 'previous-receipt.json').write_text(json.dumps(old, indent=2))
print(json.dumps(record))
''')
    inventory = json.loads(snapshot)
    (TRANSFER / 'inventory.json').write_text(json.dumps(inventory, indent=2), encoding='utf-8')
    print(f"本次新增 {len(inventory['manifests'])} 批，{sum(x['bytes'] for x in inventory['files'].values()) / 2**30:.2f} GiB", flush=True)
    transfer()


def transfer():
    # 低优先级压缩后直接传输，不占用云端额外归档空间。
    code = COMMON + '''
import tarfile, sys, lzma
record = json.loads((OUT / 'inventory.json').read_text())
with lzma.LZMAFile(sys.stdout.buffer, mode='w', preset=1) as compressed:
    with tarfile.open(fileobj=compressed, mode='w|') as archive:
        for relative in record['files']:
            archive.add(Path(record['runDir']) / relative, arcname=relative, recursive=False)
'''
    with (TRANSFER / 'completed.tar.xz.partial').open('wb') as output:
        subprocess.run(['ssh', *OPTIONS, HOST, 'nice -n 19 python3 -'], input=code.encode(), stdout=output, check=True)
    (TRANSFER / 'completed.tar.xz.partial').replace(TRANSFER / 'completed.tar.xz')
    print('增量压缩包下载完成', flush=True)
    verify_local()


def verify_local():
    inventory = json.loads((TRANSFER / 'inventory.json').read_text(encoding='utf-8'))
    with tarfile.open(TRANSFER / 'completed.tar.xz') as archive:
        members = archive.getmembers()
        assert len(members) == len(inventory['files'])
        assert {m.name for m in members} == set(inventory['files'])
        for member in members:
            assert member.isfile() and (DATA / member.name).resolve().is_relative_to(DATA.resolve())
            assert member.size == inventory['files'][member.name]['bytes']
            target = DATA / member.name
            if target.exists():
                verify(target, inventory['files'][member.name])
            else:
                archive.extract(member, DATA, filter='data')
    old = json.loads((ARCHIVE / 'local-receipt.json').read_text(encoding='utf-8'))
    assert old['verified'] is True
    merged = json.loads(json.dumps(old['inventory']))
    assert merged['runDir'] == inventory['runDir'] and merged['migrationId'] == inventory['migrationId']
    for key in ['files', 'manifests']:
        for name, value in inventory[key].items():
            assert name not in merged[key] or merged[key][name] == value
            merged[key][name] = value
    # 连同旧归档一起复核，避免累计回执指向失效本地文件。
    for index, (name, expected) in enumerate(merged['files'].items(), 1):
        file = (DATA / name).resolve()
        assert file.is_relative_to(DATA.resolve())
        verify(file, expected)
        if index % 50 == 0:
            print(f"已校验 {index}/{len(merged['files'])} 个文件", flush=True)
    receipt = {'verified': True, 'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'localDataDir': str(DATA), 'inventory': merged}
    (TRANSFER / 'merged-receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(f"累计 {len(merged['manifests'])} 批全部通过大小及 SHA256 校验，可以暂停并清理", flush=True)


def install():
    receipt = json.loads((TRANSFER / 'merged-receipt.json').read_text(encoding='utf-8'))
    assert receipt['verified'] is True
    subprocess.run(['scp', *OPTIONS, str(TRANSFER / 'merged-receipt.json'), HOST + ':' + REMOTE + '/merged-receipt.json'], check=True)
    print(remote(COMMON + '''
inventory = json.loads((OUT / 'inventory.json').read_text())
receipt = json.loads((OUT / 'merged-receipt.json').read_text())
run = Path(inventory['runDir']).resolve()
assert run.is_relative_to((ROOT / 'training_runs/feature_datasets').resolve())
assert json.loads((run / 'migration-status.json').read_text())['migrationId'] == inventory['migrationId'] == receipt['inventory']['migrationId']
old = json.loads((run / 'offloaded-checkpoints.json').read_text())
assert old == json.loads((OUT / 'previous-receipt.json').read_text())
assert receipt['verified'] is True and receipt['inventory']['runDir'] == str(run)
for key in ['files', 'manifests']:
    expected = dict(old['inventory'][key])
    expected.update(inventory[key])
    assert expected == receipt['inventory'][key]
subprocess.run(['sudo', '-n', 'systemctl', 'stop', 'ancientempires-training.service'], check=True)
assert subprocess.run(['systemctl', 'is-active', 'ancientempires-training.service'], capture_output=True, text=True).stdout.strip() == 'inactive'
targets = []
allowed = set()
for relative in inventory['manifests']:
    manifest = (run / relative).resolve()
    assert manifest.is_relative_to(run / 'checkpoints')
    for shard in json.loads(manifest.read_text())['shards']:
        file = (manifest.parent / shard['path']).resolve()
        assert file.is_relative_to(manifest.parent) and file.suffix == '.jsonl'
        allowed.add(file.relative_to(run).as_posix())
assert set(inventory['files']) == set(inventory['manifests']) | allowed
for relative, expected in inventory['files'].items():
    file = (run / relative).resolve()
    assert file.is_relative_to(run / 'checkpoints') and not file.is_symlink()
    assert file.stat().st_size == expected['bytes'] and digest(file) == expected['sha256']
    if relative in allowed:
        targets.append(file)
for relative, expected in receipt['inventory']['manifests'].items():
    assert digest(run / relative) == expected
temporary = run / 'offloaded-checkpoints.json.tmp'
temporary.write_text(json.dumps(receipt, indent=2))
os.replace(temporary, run / 'offloaded-checkpoints.json')
# 使用已部署入口实际验证累计回执，成功后才删除精确列表中的分片。
code = """
import {readFile} from 'node:fs/promises';
import {archivedCheckpointValid} from './tools/server_offloaded_migrate.ts';
const run = process.argv[1];
const receipt = JSON.parse(await readFile(run + '/offloaded-checkpoints.json', 'utf8'));
for (const relative of Object.keys(receipt.inventory.manifests)) {
  if (!await archivedCheckpointValid(run + '/' + relative, run)) throw new Error('归档验证失败');
}
console.log('已部署续跑入口验证累计回执通过');
"""
subprocess.run(['node', '--openssl-legacy-provider', '--import', 'tsx', '--input-type=module', '-e', code, str(run)], cwd=ROOT, check=True)
result = {'removedShardFiles': len(targets), 'removedBytes': sum(f.stat().st_size for f in targets), 'archivedBatches': len(receipt['inventory']['manifests']), 'removedPaths': [str(f) for f in targets]}
(OUT / 'cleanup-plan.json').write_text(json.dumps(result, indent=2))
for file in targets:
    file.unlink()
(OUT / 'cleanup-result.json').write_text(json.dumps(result, indent=2))
subprocess.run(['sudo', '-n', 'systemctl', 'start', 'ancientempires-training.service'], check=True)
print(json.dumps({k: v for k, v in result.items() if k != 'removedPaths'}))
'''), flush=True)
    previous = TRANSFER / 'previous-local-receipt.json'
    if not previous.exists():
        previous.write_bytes((ARCHIVE / 'local-receipt.json').read_bytes())
    temporary = ARCHIVE / 'local-receipt.json.tmp'
    temporary.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    temporary.replace(ARCHIVE / 'local-receipt.json')


if __name__ == '__main__':
    {'download': download, 'transfer': transfer, 'verify': verify_local, 'install': install}[sys.argv[1]]()
