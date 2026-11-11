"""交付静态闭环检查；不执行历史动作、不训练、不新增实战。"""
import hashlib
import json
from pathlib import Path
from collections import Counter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
load = lambda p: json.loads(Path(p).read_text('utf-8-sig'))
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
plan = load(HERE.parent / 'PLAN.json')
parts = load(HERE / 'PARTITIONS.json')
old = load(ROOT / 'ai_training/phone_2m_scratch100_20261024/SPLIT.json')
checks = {}
checks['inputIdentity'] = sha(plan['inputs']['newIndex']) == plan['inputs']['newIndexSha256'] and sha(ROOT / plan['inputs']['checkpoint']) == plan['inputs']['checkpointSha256']
checks['oldPartitionUnchanged'] = sha(ROOT / 'ai_training/phone_2m_scratch100_20261024/SPLIT.json') == parts['oldSplitSha256'] and all([p['parentId'] for p in parts['parents'] if p['corpus'] == 'old' and p['split'] == split] == [p['parentId'] for p in old[split]] for split in ['train', 'dev'])
checks['all3000Accounted'] = len([p for p in parts['parents'] if p['corpus'] == 'new']) == 3000 and len({p['parentId'] for p in parts['parents']}) == 5682
checks['noUnexplainedGroupLeakage'] = load(HERE / 'GROUPING.json')['unexplainedCrossSplits'] == 0
offline = load(HERE / 'OFFLINE_PANEL.json')
predicted = [json.loads(line) for line in (HERE / 'offline-baseline/samples.jsonl').read_text('utf-8').splitlines()]
checks['offlineComplete'] = len(predicted) == len(offline['requests']) == load(HERE / 'offline-baseline/RESULT.json')['samples'] == 1299
checks['sealedNeverEvaluated'] = all(r['split'] in ['train', 'dev'] for r in predicted) and load(HERE / 'SEALED_ACCESS_VERIFIED.json')['predictions'] == 0
checks['gpuAndLabels'] = all(load(HERE / name)['passed'] for name in ['LABEL_CONTRACTS.json', 'GPU_RUNTIME_VERIFIED.json', 'GPU_RESUME_VERIFIED.json', 'EXPORT_PARITY.json', 'CACHE_PARITY.json', 'SEALED_ACCESS_VERIFIED.json'])
checks['engineeringBudget'] = load(HERE / 'GPU_RESUME_VERIFIED.json')['totalTemporaryOptimizerUpdates'] == 8
sampling = load(HERE / 'SAMPLING_VERIFIED.json')
checks['samplingAndIsolation'] = sampling['samples'] == 100000 and sampling['distinctIsolationGroupsPerBatch'] and sampling['samplerResumeExact']
arena = load(HERE / 'arena-baseline-r2/SUMMARY.json')
checks['exact40Attempts'] = len(arena['games']) == 40 and Counter(g['opponent'] for g in arena['games']) == {'hard': 20, 'simple': 20}
checks['arenaNaturalAndSeparated'] = all(g['natural'] and g['classification'].startswith('natural_') and not g['error'] and g['timeForfeit'] is None for g in arena['games'])
logs = 0
for game in arena['games']:
    directory = HERE / 'arena-baseline-r2' / game['id']
    steps = [json.loads(line) for line in (directory / 'steps.jsonl').read_text('utf-8').splitlines()]
    assert len(steps) == game['steps'] and all(row['step'] == i for i, row in enumerate(steps))
    assert all(a['after'] == b['before'] for a, b in zip(steps, steps[1:]))
    assert load(directory / 'final.json')['winner'] == game['winner']
    logs += len(steps)
checks['arenaSavedRowsAndHashChain'] = logs > 0
panel = load(HERE / 'ARENA_PANEL.json')
final_panel = load(HERE / 'SEALED_FINAL_PANEL.json')
byid = {p['parentId']: p for p in parts['parents']}
checks['panelsDisjoint'] = len(panel['slots']) == len(final_panel['slots']) == 10 and not {s['groupId'] for s in panel['slots']} & {s['groupId'] for s in final_panel['slots']} and all(byid[s['parentId']]['split'] == split for split, p in [('dev', panel), ('test', final_panel)] for s in p['slots'])
checks['eightOldDuelMaps'] = len({s['map'] for s in panel['slots']}) == 8
run = load(HERE / 'arena-baseline-r2/RUN.json')
checks['baselineModelUnchanged'] = run['modelBinarySha256'] == sha(ROOT / 'ai_training/phone_2m_continue414_20261027/completion/job/output/final.bin') == load(HERE / 'offline-baseline/RESULT.json')['modelSha256']
checks['rawStoreComplete'] = load(HERE / 'STORE_INVENTORY.json')['parents'] == 5682 and load(HERE / 'CACHE_PARITY.json')['independentPrestates'] == 96
assert all(checks.values()), checks
result = dict(passed=True, checks=checks, trueEvaluationAttempts=40, opponents=dict(hard=20, simple=20), savedArenaAtomicRows=logs, temporaryCurrentModelUpdates=8, formalContinuationUpdates=0, historicalWholeGameReplay=0, finalTestPredictions=0, scope='合同交付静态闭环，不替代完整训练工作区失败检查；审核决定由协调者作出')
(HERE / 'VALIDATION.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps(result, ensure_ascii=False))
