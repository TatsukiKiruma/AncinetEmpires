"""交付前只读核验清单、当前代数、停止收据及112槽原件，不再写入文件。"""
import json
from run_league import DIR, ROOT, read, sha, verify_runtime_contract

verify_runtime_contract()
manifest = read(DIR / 'DELIVERY_MANIFEST_PHASE52.json')
changed = [name for name, entry in manifest['files'].items() if not (ROOT / name).is_file() or (ROOT / name).stat().st_size != entry['bytes'] or sha(ROOT / name) != entry['sha256']]
assert not changed, f'交付文件变化:{changed}'
missing = [p.relative_to(ROOT).as_posix() for p in DIR.rglob('*') if p.is_file() and p.name != 'DELIVERY_MANIFEST_PHASE52.json' and p.relative_to(ROOT).as_posix() not in manifest['files']]
assert not missing, f'清单缺失文件:{missing}'
state = read(DIR / 'league-state.json'); summary = read(DIR / 'gate-summary.json'); stop = read(DIR / 'phase52-audit/STOP_RECEIPT.json')
assert summary['complete'] and state['currentGeneration'] == stop['completedGeneration'] == 3
assert not (DIR / 'generations/gen_04').exists() and summary['generation4Started'] is False
assert summary['gates']['noTrainingAfterStopRequest'] and summary['gates']['arenaInputsUnchanged']
folder = DIR / 'generations/gen_03'; plan = read(folder / 'arena/plan.json')
assert len(plan['slots']) == 112
for slot in plan['slots']:
    prefix = folder / 'arena/battles' / slot['id']; result = read(prefix / 'result.json'); proof = read(prefix / 'strict-replay.json')
    assert proof['passed'] and proof['actions'] == result['actions'] and result['modelSha256'] == sha(folder / 'model.bin')
assert read(DIR / 'pipeline-status.json')['stage'] == 'pc_arena_finished'
print(json.dumps(dict(complete=True, generation=3, championGeneration=state['championGeneration'], promoted=summary['promoted'], deliveryFiles=len(manifest['files']), manifestChanges=changed, missingFiles=missing, strictSlots=112, generation4Started=False, failedGates=summary['failed']), ensure_ascii=False))
