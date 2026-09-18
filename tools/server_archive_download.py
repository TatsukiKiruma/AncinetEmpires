"""下载已完成批次，安全解包并逐文件校验后生成回执。"""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile

DEST = Path(__file__).resolve().parents[1] / 'training_runs/server_archive_20260913'
DEST.mkdir(exist_ok=True)
SSH = ['-i', r'C:\Users\SHIINA\Downloads\chat.pem', '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', r'UserKnownHostsFile=C:\Users\SHIINA\AppData\Local\Temp\autoband-deploy-known-hosts']
REMOTE = 'ubuntu@111.230.73.106:/home/ubuntu/ancientempires-training-20260909/runtime/offload/'
if '--verify-only' not in sys.argv:
    for name in ['inventory.json', 'completed.tar.xz']:
        subprocess.run(['scp', *SSH, REMOTE + name, str(DEST / name)], check=True)
        print('已下载', name, flush=True)
inventory = json.loads((DEST / 'inventory.json').read_text())
data = DEST / 'dataset'
data.mkdir(exist_ok=True)
with tarfile.open(DEST / 'completed.tar.xz') as archive:
    for member in archive.getmembers():
        assert member.isfile() and member.name in inventory['files']
        assert (data / member.name).resolve().is_relative_to(data.resolve())
    archive.extractall(data, filter='data')
for relative, expected in inventory['files'].items():
    file = data / relative
    assert file.stat().st_size == expected['bytes']
    with file.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == expected['sha256']
receipt = {'verified': True, 'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'localDataDir': str(data), 'inventory': inventory}
(DEST / 'local-receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
subprocess.run(['scp', *SSH, str(DEST / 'local-receipt.json'), REMOTE + 'local-receipt.json'], check=True)
print(json.dumps({'verifiedBatches': len(inventory['manifests']), 'localDataDir': str(data)}), flush=True)
