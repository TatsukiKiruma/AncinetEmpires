"""复用冠军纯策略前，核验56槽模型身份、旧交付清单及校准SHA。"""
from run_league import DIR, read, save, sha

legacy = read(DIR / 'phase51-audit/training-source-before/DELIVERY_MANIFEST.json')['files']
selected = {name: entry for name, entry in legacy.items() if name.replace('\\', '/').startswith('champion-pure-arena/') or name.replace('\\', '/') in ['generations/gen_00/model.bin', 'generations/gen_00/model.json', 'generations/gen_00/head-calibration.json']}
assert all(name in selected for name in ['generations/gen_00/model.bin', 'generations/gen_00/model.json', 'generations/gen_00/head-calibration.json'])
changed = [name for name, entry in selected.items() if sha(DIR / name) != entry['sha256']]
assert not changed, f'旧纯策略基线或权重/校准身份变化:{changed}'
model_sha = sha(DIR / 'generations/gen_00/model.bin')
plan = read(DIR / 'champion-pure-arena/plan.json')
assert len(plan['slots']) == 56
for slot in plan['slots']:
    for name in ['actions.jsonl.gz', 'result.json', 'strict-replay.json', 'started.json', 'witnesses.jsonl.gz']:
        assert f"champion-pure-arena/battles/{slot['id']}/{name}" in selected
    folder = DIR / 'champion-pure-arena/battles' / slot['id']
    result, strict = read(folder / 'result.json'), read(folder / 'strict-replay.json')
    assert result['modelSha256'] == model_sha
    assert strict['passed'] and strict['actions'] == result['actions']
    assert strict['logSha256'] == sha(folder / 'actions.jsonl.gz')
save(DIR / 'phase51-audit/pure-reuse-attestation.json', dict(passed=True, slots=56, oldManifestFilesChecked=len(selected), modelSha256=model_sha, headCalibrationSha256=sha(DIR / 'generations/gen_00/head-calibration.json'), sourceIdentityAttestation='runtime-freeze.json'))
print(f'冠军纯策略56槽模型、日志与{len(selected)}份旧交付文件SHA一致，可复用')
