"""只读 V15 原始证据，将复算结果写入 V16 审核目录。"""
from pathlib import Path
from collections import Counter, defaultdict
import json

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / 'v15/out/v15_20260925_core'

def rows(path):
    with path.open(encoding='utf-8') as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)

def counts(values):
    return dict(sorted(Counter(values).items()))

arena = {}
for path in sorted((RUN / 'T15-09/matches').glob('dev_*.games.jsonl')):
    data = list(rows(path))
    candidate = [r for r in data if r['arm'] == 'CANDIDATE']
    if not candidate:
        continue
    by_map = {}
    for map_name in sorted({r['mapName'] for r in candidate}):
        group = [r for r in candidate if r['mapName'] == map_name]
        by_map[map_name] = {
            'n': len(group), 'outcomes': counts(r['outcomeKind'] for r in group),
            'winningSeats': counts(str(r['candidateSeat']) for r in group if r['outcomeKind'] == 'NATURAL_WIN'),
        }
    arena[path.stem] = by_map

ledgers = {}
ledger_rows = {}
for task in ['T15-06', 'T15-08']:
    for path in sorted((RUN / task).glob('*/*optimizer_update_ledger.jsonl')):
        data = list(rows(path))
        name = path.parent.name
        ledger_rows[name] = data
        ledgers[name] = {
            'quarantinedBadSchemaRun': name.endswith('_badschema'),
            'updates': len(data), 'exposures': sum(len(r['sampleIds']) for r in data),
            'uniqueSamples': len({s for r in data for s in r['sampleIds']}),
            'valueSupervised': sum(r.get('valueSupervised', 0) for r in data),
        }
shared = {}
for seed in [42, 1337, 2026]:
    groups = [ledger_rows[f'd{g}_s{seed}'] for g in range(3)]
    shared[str(seed)] = {
        'lengths': list(map(len, groups)),
        'first16MismatchUpdates': sum(not (a['sampleIds'][:16] == b['sampleIds'][:16] == c['sampleIds'][:16]) for a,b,c in zip(*groups)),
    }

partition = defaultdict(lambda: {'n': 0, 'maps': Counter(), 'players': Counter(), 'targetTypes': Counter(), 'roots': set()})
for row in rows(RUN / 'T15-04/dataset_v15.jsonl'):
    entry = partition[row['partition']]
    entry['n'] += 1
    entry['maps'][row['mapName']] += 1
    entry['players'][str(row['playerCount'])] += 1
    candidate = row['candidateActions'][row['targetActionIndex']]
    entry['targetTypes'][row['targetActionCode'].split(':')[0]] += 1
    entry['roots'].add(row['rootFamilyId'])
for entry in partition.values():
    entry['roots'] = len(entry['roots'])

headers = []
for folder in ['collect_D1', 'collect_D1_complete', 'collect_D2', 'collect_D2_complete', 'probe_dev_roots']:
    for path in sorted((RUN / 'T15-08' / folder).glob('*.jsonl')):
        # 首行保存根局面，避免把数百 MB 的轨迹读入内存。
        first = next(rows(path))
        state = first.get('initialState')
        if state:
            headers.append({'file': str(path.relative_to(ROOT)), 'mapName': first.get('mapName', state.get('metadata', {}).get('mapName')), 'gold': [p['gold'] for p in state['players']]})

old_roots = list(rows(ROOT / 'v14/out/v14_20260924_t14/T14-02/raw/roots.jsonl'))
matched = json.loads((RUN / 'T15-08/matched_groups.json').read_text(encoding='utf-8'))
new_maps = Counter()
for group in matched['allocation']:
    new_maps[group['key'].split('|')[1]] += group['quotaPerArm']
result = {'sourceRun': str(RUN.relative_to(ROOT)), 'arena': arena, 'ledgers': ledgers,
          'matchedFirst16': shared, 'baseDataset': dict(partition), 'newInitialStates': headers,
          'oldRootInitialGold': counts(str(tuple(p['gold'] for p in r['initialState']['players'])) for r in old_roots),
          'matchedNewPoolMapsPerArm': dict(new_maps)}
out = Path(__file__).with_name('v15_recomputed.json')
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'output': str(out), 'models': len(arena), 'ledgers': len(ledgers), 'headers': len(headers), 'matchedFirst16': shared}, ensure_ascii=False))
