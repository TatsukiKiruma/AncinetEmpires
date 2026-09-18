"""在停机状态下打包完整 checkpoint，并生成逐文件校验清单。"""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path('/home/ubuntu/ancientempires-training-20260909')
assert subprocess.run(['systemctl', 'is-active', 'ancientempires-training.service'], text=True, capture_output=True).stdout.strip() == 'inactive'
runs = list((ROOT / 'training_runs/feature_datasets').glob('*/*/migration-status.json'))
assert len(runs) == 1
run = runs[0].parent
files = {}
batches = {}
for manifest in sorted((run / 'checkpoints').glob('*/*/manifest.json')):
    data = json.loads(manifest.read_text())
    entries = [manifest]
    for shard in data['shards']:
        file = (manifest.parent / shard['path']).resolve()
        assert file.is_relative_to(manifest.parent.resolve())
        assert file.stat().st_size == shard['bytes']
        with file.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        assert digest == shard['sha256']
        entries.append(file)
    for file in entries:
        with file.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        files[file.relative_to(run).as_posix()] = {'bytes': file.stat().st_size, 'sha256': digest}
    rel = manifest.relative_to(run).as_posix()
    batches[rel] = files[rel]['sha256']
record = {'version': 1, 'runDir': str(run), 'migrationId': json.loads(runs[0].read_text())['migrationId'], 'files': files, 'manifests': batches}
out = ROOT / 'runtime/offload'
out.mkdir(exist_ok=True)
(out / 'inventory.json').write_text(json.dumps(record, indent=2))
with tarfile.open(out / 'completed.tar.gz', 'w:gz', compresslevel=1) as archive:
    for relative in files:
        archive.add(run / relative, arcname=relative, recursive=False)
print(json.dumps({'batches': len(batches), 'bytes': sum(f['bytes'] for f in files.values()), 'archiveBytes': (out / 'completed.tar.gz').stat().st_size}), flush=True)
