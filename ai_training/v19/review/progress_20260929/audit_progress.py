"""独立复核逐局成绩、训练谱系与样本分布，不加载多 GB 张量，不改历史产物。"""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'v19/out/run_20260928_v19_01'
OUT = Path(__file__).resolve().parent

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def rows(path):
    with path.open(encoding='utf-8-sig') as f:
        for line in f:
            if line.strip():
                yield json.loads(line)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

panels = collections.defaultdict(list)
for path in sorted((RUN / 'arena/dev').glob('*.games.jsonl')):
    key = path.name.split('.m')[0]
    panels[key].extend(r for r in rows(path) if r['arm'] == 'CANDIDATE')
champ = {(r['mapName'], r['seed'], r['candidateSeat']): r for r in panels['P1_s2026_v19control']}
arena = {}
for key, games in panels.items():
    maps = collections.defaultdict(lambda: collections.Counter())
    changes = []
    for g in games:
        maps[g['mapName']][g['outcomeKind']] += 1
        old = champ[(g['mapName'], g['seed'], g['candidateSeat'])]
        if old['outcomeKind'] != g['outcomeKind']:
            changes.append({'map': g['mapName'], 'seed': g['seed'], 'seat': g['candidateSeat'],
                            'before': old['outcomeKind'], 'after': g['outcomeKind']})
    arena[key] = {'games': len(games), 'outcomes': dict(collections.Counter(g['outcomeKind'] for g in games)),
                  'byMap': dict(maps), 'changedOutcomes': changes,
                  'sameOutcomes': len(games) - len(changes),
                  'fallbacks': sum(bool(g['fallbackUsed']) for g in games),
                  'errors': sum(bool(g['error']) for g in games),
                  'checkpointShas': sorted({g['checkpointSha256'] for g in games})}

waves = {}
for folder, key in [('pilot', 'wave0pilot'), ('wave1', 'wave1'), ('wave2', 'wave2')]:
    base = RUN / 'data' / folder
    summary = read(base / f'{key}.summary.json')
    games = list(rows(base / f'{key}.games.jsonl'))
    counts = collections.Counter()
    entropy = collections.Counter()
    action_types = collections.Counter()
    last = {}
    for r in rows(base / f'{key}.transitions.jsonl'):
        counts[r['gameId']] += 1
        last[r['gameId']] = r
        entropy['all'] += 1
        entropy['entropyBelow0.01'] += r['policyEntropy'] < .01
        entropy['entropyAbove1'] += r['policyEntropy'] > 1
        action_types[r['chosenActionCode'].split(':')[0]] += 1
    for g in games:
        g['recorded'] = counts[g['gameId']]
        g['capped'] = g['subjectDecisions'] > g['recorded']
    natural = [g for g in games if g['naturalTerminal']]
    capped = [g for g in natural if g['capped']]
    used = sum(g['recorded'] for g in natural)
    path = Path(summary['modelPath'])
    waves[folder] = {
        'games': len(games), 'planned': summary.get('plannedGames'),
        'behaviorModel': summary['modelPath'], 'declaredSha': summary['checkpointSha256'],
        'actualSha': sha(path), 'sample': summary['sample'],
        'outcomes': dict(collections.Counter(g['outcomeKind'] for g in games)),
        'byMap': {m: dict(collections.Counter(g['outcomeKind'] for g in games if g['mapName'] == m))
                  for m in sorted({g['mapName'] for g in games})},
        'recorded': sum(counts.values()), 'subjectDecisionsActual': sum(g['subjectDecisions'] for g in games),
        'trainingDecisions': used,
        'naturalCappedGames': len(capped), 'naturalCappedTrainingShare': sum(g['recorded'] for g in capped) / used,
        'trainingDecisionsByOutcome': {o: sum(g['recorded'] for g in natural if g['outcomeKind'] == o)
                                      for o in sorted({g['outcomeKind'] for g in natural})},
        'entropyCounts': dict(entropy), 'chosenActionTypes': dict(action_types),
        'top10TrainingGames': [{k: g[k] for k in ['mapName','seed','subjectSeat','outcomeKind','subjectDecisions','recorded','capped']}
                               for g in sorted(natural, key=lambda g: g['recorded'], reverse=True)[:10]],
        'naturalCappedDetails': [{'gameId': g['gameId'], 'outcome': g['outcomeKind'], 'actual': g['subjectDecisions'],
                                 'recorded': g['recorded'], 'lastRecordedTerminal': last[g['gameId']]['terminal']}
                                for g in capped],
    }

training = {}
for path in sorted((RUN / 'experiments').rglob('*.metrics.json')):
    report = read(path)
    if report.get('schema') not in ['v19_ppo_run_1', 'v19_value_warmup_1']:
        continue
    output = report['output']
    output_path = ROOT / output['path']
    training[str(path.relative_to(RUN))] = {
        'schema': report['schema'], 'init': report['initCheckpoint'],
        'actualInitSha': sha(ROOT / report['initCheckpoint']),
        'output': output, 'actualOutputSha': sha(output_path),
        'data': report.get('data'), 'parity': report.get('preUpdateParity'),
        'epochs': report.get('epochs'), 'loss': report.get('loss'),
    }
result = {'run': str(RUN), 'arena': arena, 'waves': waves, 'training': training}
(OUT / 'audit_progress.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'arena': {k: {x: v[x] for x in ['games','outcomes','sameOutcomes']} for k,v in arena.items()},
                  'waves': {k: {x:v[x] for x in ['games','outcomes','trainingDecisions','naturalCappedGames',
                                                  'naturalCappedTrainingShare','trainingDecisionsByOutcome','entropyCounts']}
                            for k,v in waves.items()}}, ensure_ascii=False, indent=2))
