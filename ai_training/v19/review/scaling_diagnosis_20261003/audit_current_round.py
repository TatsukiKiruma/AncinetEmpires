"""只读复算已有80局的耗时、分布与配对结果，不运行训练或对局。"""
import hashlib
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'v19/out/continuous16_20261003'
panels, sources, rows = {}, [], []
for arm in ['control', 'treatment']:
    for step in ['0400', '0800']:
        key = f'path3_{arm}_u{step}'
        batch = []
        for index in range(5):
            path = RUN / f'arena/dev/{key}.m{index}.games.jsonl'
            batch += [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
            sources.append({'path': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        assert len(batch) == 20
        panels[key] = batch
        rows += batch

def groups(batch, field):
    result = {}
    for row in batch:
        group = result.setdefault(str(row[field]), {})
        kind = row['outcomeKind']
        group[kind] = group.get(kind, 0) + 1
    return result

costs, paired = {}, {}
for kind in sorted({r['outcomeKind'] for r in rows}):
    batch = [r for r in rows if r['outcomeKind'] == kind]
    costs[kind] = {'games': len(batch), 'wallSecondsSum': sum(r['wallMs'] for r in batch)/1000,
                   'medianSteps': statistics.median(r['steps'] for r in batch)}
for step in ['0400', '0800']:
    def index(arm):
        return {(r['mapName'], r['seed'], r['candidateSeat']): r for r in panels[f'path3_{arm}_u{step}']}
    control, treatment = index('control'), index('treatment')
    assert control.keys() == treatment.keys()
    transitions, same = {}, 0
    for key, c in control.items():
        t = treatment[key]
        name = c['outcomeKind'] + ' -> ' + t['outcomeKind']
        transitions[name] = transitions.get(name, 0) + 1
        same += c['actionDigest'] == t['actionDigest']
    paired[step] = {'outcomeTransitions': transitions, 'sameActionDigestGames': same, 'games': 20}
decisions = sum(r['candidateDecisions'] for r in rows)
result = {'schema': 'v19_scaling_diagnosis_current_round_1', 'scope': '只读已有80局，未新增对局',
          'games': len(rows), 'sources': sources,
          'panels': {key: {'byMap': groups(batch, 'mapName'), 'bySeat': groups(batch, 'candidateSeat')} for key, batch in panels.items()},
          'paired': paired, 'costByOutcome': costs, 'gameWallSecondsSum': sum(r['wallMs'] for r in rows)/1000,
          'candidateDecisions': decisions,
          'decisionWeightedMeanLatencyMs': sum(r['latencyMs']['mean']*r['candidateDecisions'] for r in rows)/decisions,
          'maxGameWallSeconds': max(r['wallMs'] for r in rows)/1000,
          'costCaveat': '各局墙钟之和包含并行争用，不等于实际等待时长或CPU核时。'}
Path(__file__).with_name('current_round_audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k != 'sources'}, ensure_ascii=False))
