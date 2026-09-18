"""下载最终增量，使用云端匹配校验器全量验证后精确清理分片。"""
import json
from pathlib import Path
import subprocess
import sys
import server_archive_incremental as archive

archive.TRANSFER = archive.ARCHIVE / 'final_20260918'
archive.REMOTE = archive.ROOT + '/runtime/offload/final_20260918'
archive.COMMON = archive.COMMON.replace('incremental_20260916', 'final_20260918')
OUT = archive.TRANSFER


def fetch():
    OUT.mkdir(exist_ok=True)
    info = json.loads(archive.remote(archive.COMMON + '''
assert subprocess.run(['systemctl', 'is-active', 'ancientempires-training.service'], capture_output=True, text=True).stdout.strip() == 'inactive'
state = json.loads((ROOT / 'runtime/status.json').read_text())
assert state['phase'] == 'awaiting-local-validation'
manifest = Path(state['finalManifest']).resolve()
assert manifest.is_relative_to(ROOT / 'training_runs/feature_datasets')
status = json.loads((manifest.parent / 'migration-status.json').read_text())
assert status['completedBatches'] == status['totalBatches'] == 250
validator = ROOT / 'tools/skirmish_dataset_validate.ts'
deployment = json.loads((ROOT / 'deployment_manifest.json').read_text())
assert digest(validator) == deployment['sourceFiles']['tools/skirmish_dataset_validate.ts']
print(json.dumps({'manifest': str(manifest), 'manifestHash': digest(manifest), 'manifestBytes': manifest.stat().st_size, 'validatorHash': digest(validator), 'validatorBytes': validator.stat().st_size}))
'''))
    (OUT / 'final-info.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
    for source, target, key in [(info['manifest'], archive.DATA / 'manifest.json', 'manifest'), (archive.ROOT + '/tools/skirmish_dataset_validate.ts', OUT / 'skirmish_dataset_validate.ts', 'validator')]:
        assert not target.exists(), str(target)
        subprocess.run(['scp', *archive.OPTIONS, archive.HOST + ':' + source, str(target)], check=True)
        archive.verify(target, {'bytes': info[key + 'Bytes'], 'sha256': info[key + 'Hash']})
    archive.download()


def validate():
    info = json.loads((OUT / 'final-info.json').read_text())
    archive.verify(archive.DATA / 'manifest.json', {'bytes': info['manifestBytes'], 'sha256': info['manifestHash']})
    archive.verify(OUT / 'skirmish_dataset_validate.ts', {'bytes': info['validatorBytes'], 'sha256': info['validatorHash']})
    receipt = json.loads((OUT / 'merged-receipt.json').read_text())
    manifest = json.loads((archive.DATA / 'manifest.json').read_text())
    assert len(receipt['inventory']['manifests']) == 250
    assert receipt['inventory']['migrationId'] == manifest['datasetId']
    # 最终清单必须精确覆盖累计归档中的全部特征分片。
    shards = {s['path']: s for s in manifest['shards']}
    expected = {k: v for k, v in receipt['inventory']['files'].items() if k not in receipt['inventory']['manifests']}
    assert set(shards) == set(expected)
    for name, item in expected.items():
        assert all(shards[name][key] == item[key] for key in ['bytes', 'sha256'])
    report = OUT / 'validation-result.json'
    with report.open('w', encoding='utf-8') as output:
        subprocess.run(['node', '--openssl-legacy-provider', '--import', 'tsx', str(OUT / 'skirmish_dataset_validate.ts'), '--manifest', str(archive.DATA / 'manifest.json')], cwd=archive.BASE, stdout=output, check=True)
    summary = json.loads(report.read_text())['summary']
    assert summary['valid'] is True and summary['episodeLeakageCount'] == 0
    assert summary['samples'] == manifest['summary']['exportedSamples']
    assert summary['trainSamples'] + summary['validationSamples'] == summary['samples']
    print(json.dumps(summary, ensure_ascii=False), flush=True)


def clean():
    summary = json.loads((OUT / 'validation-result.json').read_text())['summary']
    receipt = json.loads((OUT / 'merged-receipt.json').read_text())
    assert summary['valid'] is True and not summary['errors']
    assert summary['datasetId'] == receipt['inventory']['migrationId']
    for name in ['merged-receipt.json', 'validation-result.json', 'final-info.json']:
        subprocess.run(['scp', *archive.OPTIONS, str(OUT / name), archive.HOST + ':' + archive.REMOTE + '/' + name], check=True)
    result = archive.remote(archive.COMMON + '''
assert subprocess.run(['systemctl', 'is-active', 'ancientempires-training.service'], capture_output=True, text=True).stdout.strip() == 'inactive'
inventory = json.loads((OUT / 'inventory.json').read_text())
receipt = json.loads((OUT / 'merged-receipt.json').read_text())
report = json.loads((OUT / 'validation-result.json').read_text())['summary']
info = json.loads((OUT / 'final-info.json').read_text())
run = Path(inventory['runDir']).resolve()
assert run.is_relative_to((ROOT / 'training_runs/feature_datasets').resolve())
assert report['valid'] is True and not report['errors'] and report['episodeLeakageCount'] == 0
assert report['datasetId'] == inventory['migrationId'] == receipt['inventory']['migrationId']
assert receipt['verified'] is True and receipt['inventory']['runDir'] == str(run)
assert digest(run / 'manifest.json') == info['manifestHash']
old = json.loads((run / 'offloaded-checkpoints.json').read_text())
assert old == json.loads((OUT / 'previous-receipt.json').read_text())
for key in ['files', 'manifests']:
    expected = dict(old['inventory'][key])
    expected.update(inventory[key])
    assert expected == receipt['inventory'][key]
assert len(receipt['inventory']['manifests']) == 250
allowed = set()
for relative, expected in receipt['inventory']['manifests'].items():
    file = (run / relative).resolve()
    assert file.is_relative_to(run / 'checkpoints') and digest(file) == expected
for relative in inventory['manifests']:
    manifest = (run / relative).resolve()
    for shard in json.loads(manifest.read_text())['shards']:
        file = (manifest.parent / shard['path']).resolve()
        assert file.is_relative_to(manifest.parent) and file.suffix == '.jsonl'
        allowed.add(file.relative_to(run).as_posix())
assert set(inventory['files']) == set(inventory['manifests']) | allowed
targets = []
for relative, expected in inventory['files'].items():
    raw = run / relative
    file = raw.resolve()
    assert not raw.is_symlink() and file.is_relative_to(run / 'checkpoints')
    assert file.stat().st_size == expected['bytes'] and digest(file) == expected['sha256']
    if relative in allowed:
        targets.append(file)
temporary = run / 'offloaded-checkpoints.json.tmp'
temporary.write_text(json.dumps(receipt, indent=2))
os.replace(temporary, run / 'offloaded-checkpoints.json')
result = {'removedShardFiles': len(targets), 'removedBytes': sum(f.stat().st_size for f in targets), 'archivedBatches': 250, 'removedPaths': [str(f) for f in targets]}
(OUT / 'cleanup-plan.json').write_text(json.dumps(result, indent=2))
for file in targets:
    file.unlink()
(OUT / 'cleanup-result.json').write_text(json.dumps(result, indent=2))
# 完成后保持服务停止，单独保留全量校验回执，不改写历史运行状态。
print(json.dumps(result))
''')
    (OUT / 'cleanup-result.json').write_text(result, encoding='utf-8')
    previous = OUT / 'previous-local-receipt.json'
    assert not previous.exists()
    previous.write_bytes((archive.ARCHIVE / 'local-receipt.json').read_bytes())
    temporary = archive.ARCHIVE / 'local-receipt.json.tmp'
    temporary.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    temporary.replace(archive.ARCHIVE / 'local-receipt.json')
    print(json.dumps({k: v for k, v in json.loads(result).items() if k != 'removedPaths'}), flush=True)


if __name__ == '__main__':
    {'fetch': fetch, 'transfer': archive.transfer, 'verify': archive.verify_local, 'validate': validate, 'clean': clean}[sys.argv[1]]()
