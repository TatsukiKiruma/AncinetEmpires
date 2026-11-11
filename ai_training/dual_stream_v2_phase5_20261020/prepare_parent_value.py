"""父代价值扩展前保全首轮校准、数值收据及实际训练时源码。"""
import shutil
from run_league import DIR, ROOT, read, save, sha

folder = DIR / 'generations/gen_02'
assert not read(folder / 'value-calibration.json')['passed']
assert not list((folder / 'arena').glob('battles/*/result.json')), '候选实战已发生，不能作为未观察战绩的扩展'
identity = read(folder / 'training-input-identity.json')['sourceIdentity']
for name, digest in identity.items():
    target = folder / 'training-source-snapshot' / name
    if not target.exists():
        assert sha(ROOT / name) == digest
        target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(ROOT / name, target)
    assert sha(target) == digest
save(folder / 'training-source-snapshot.json', identity)
for source, label in [(ROOT / 'src/ai_runtime/dual_v2', 'runtime-v2-before-parent'), (DIR, 'harness-before-parent')]:
    destination = DIR / 'phase51-audit' / label; destination.mkdir(exist_ok=True)
    for p in source.iterdir():
        if p.is_file() and p.suffix in ['.ts', '.py', '.mjs', '.md'] and not (destination / p.name).exists(): shutil.copyfile(p, destination / p.name)
archive = folder / 'calibration-attempt01-army-floor'; archive.mkdir(exist_ok=True)
names = ['calibration-protocol.json', 'calibration-candidates.json', 'value-config.json', 'value-calibration.json', 'head-calibration.json', 'model-torch-reference.json', 'pipeline-reference.json', 'value-parity-inputs.json', 'model-node-output.json', 'model-node-parity.json', 'model-browser-parity.json', 'browser-attempts.jsonl', 'browser-bundle.js', 'tri-runtime-parity.json']
files = {}
for name in names:
    source, target = folder / name, archive / name
    if not source.exists(): continue
    if not target.exists(): shutil.copyfile(source, target)
    assert sha(source) == sha(target)
    files[name] = sha(target)
save(archive / 'ARCHIVE.json', dict(files=files, reason='24组军力保底候选未通过16切片；真实Chrome沙箱失败；模型/检查点不变；候选实战尚未开始'))
print(f'保全{len(files)}份校准和数值产物；训练源码快照已核验')
