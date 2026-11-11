"""只读统计已保存状态与清单，不导入引擎、模型或训练器。"""
import collections
import gzip
import hashlib
import json
import math
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
BASE = ROOT / 'ai_training'
CONV = BASE / 'human_2m_conversion_20261027'
INV = BASE / 'human_data_inventory_20261027'

def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

def counter():
    return {'rows': 0, 'sources': set(), 'macros': set(), 'weight': 0., 'weight2': 0.,
            'sourceRows': collections.Counter(), 'players': collections.Counter(),
            'split': collections.Counter(), 'kind': collections.Counter(), 'actions': collections.Counter()}

plan = load(CONV / 'PLAN.json')
ledger = {r['responseSha256']: r for r in load(INV / 'multiplayer-ledger.json')}
pools = collections.defaultdict(counter)
admitted = {}
state_files = []
for receipt in load(CONV / 'CONVERSION.json')['reports']:
    path = CONV / receipt['output']
    actual = sha(path)
    assert actual == receipt['outputSha256'] and receipt['complete']
    state_files.append({'path': str(path.relative_to(ROOT)), 'sha256': actual})
    with gzip.open(path, 'rt', encoding='utf8') as stream:
        for line in stream:
            r = json.loads(line)
            if r['kind'] != 'sample':
                continue
            sid, macro, w = r['sourceId'], r['macro'], r['weight']
            p = pools[r['admission']]
            p['rows'] += 1; p['sources'].add(sid); p['macros'].add((sid, macro))
            p['weight'] += w; p['weight2'] += w*w; p['sourceRows'][sid] += 1
            p['players'][str(ledger[sid]['activePlayers'])] += 1
            p['split'][r['split']] += 1; p['kind'][r['sourceKind']] += 1
            p['actions'][r['actionCode'].split(':')[0]] += 1
            if r['admission'] != 'train_admitted':
                continue
            a = admitted.setdefault(sid, {'rows': 0, 'weight': 0., 'macros': {}, 'actions': collections.Counter(),
                'seats': set(), 'turns': [], 'candidates': [], 'states': set(), 'mapShapes': set()})
            a['rows'] += 1; a['weight'] += w
            a['macros'].setdefault(macro, []).append((r['subAction'], r['macroAtomicCount'], w))
            a['actions'][r['actionCode'].split(':')[0]] += 1; a['seats'].add(r['controller']['seat'])
            a['turns'].append(r['state']['turn']); a['candidates'].append(r['candidateCount'])
            a['states'].add(r['stateHash']); a['mapShapes'].add((r['state']['map']['width'], r['state']['map']['height']))

result = {}
for name, p in pools.items():
    result[name] = {k:v for k,v in p.items() if k not in {'sources','macros','weight2'}}
    result[name].update(sourceCount=len(p['sources']), macroCount=len(p['macros']),
        rowWeightKish=p['weight']**2/p['weight2'],
        sourceConcentrationEquivalent=p['rows']**2/sum(v*v for v in p['sourceRows'].values()))
for sid, a in admitted.items():
    macros = a.pop('macros'); a['macroCount'] = len(macros)
    a['keptAtomsPerMacro'] = dict(collections.Counter(map(len, macros.values())))
    a['originalAtomsPerMacro'] = dict(collections.Counter(v[0][1] for v in macros.values()))
    a['incompleteMacroCount'] = sum(len(v) != v[0][1] for v in macros.values())
    a['macroWeightTotals'] = dict(collections.Counter(round(sum(x[2] for x in v), 8) for v in macros.values()))
    a['seats'] = sorted(a['seats']); a['mapShapes'] = sorted(a['mapShapes'])
    a['turnRange'] = [min(a['turns']), max(a['turns'])]
    del a['turns']
    cc = sorted(a.pop('candidates'));a['candidateMinMedianMax'] = [cc[0],cc[len(cc)//2],cc[-1]]
    a['uniqueStateHashes'] = len(a.pop('states'));a['activePlayers'] = ledger[sid]['activePlayers']
    a['apiKeyCount'] = len({x['apiIdHash'] for x in ledger[sid]['apiBindings']})
    src = next(s for s in plan['sources'] if s['id'] == sid)
    ids = set()
    with gzip.open(src['path'], 'rt', encoding='utf8') as stream:
        for line in stream:
            r = json.loads(line)
            if r.get('kind') == 'atomic' and r.get('controller',{}).get('type') == 1:
                if r['controller'].get('idHash'): ids.add(r['controller']['idHash'])
    a['historicalHumanControllerIdHashes'] = sorted(ids)

sync_path = BASE / 'phone_2m_continue414_20261027/SYNC_2414.json'
sync = load(sync_path)
checks = [{'path': x['relativePath'], 'matches': sha(Path(x['local'])) == x['sha256']} for x in sync['files']]
assert all(x['matches'] for x in checks)
protocol = load(BASE / 'phone_2m_continue414_20261027/PROTOCOL.json')
warm = math.ceil(protocol['referenceTotalUpdates'] * protocol['warmupFraction'])
def lr(step):
    fraction = min(1, (step-warm)/(protocol['referenceTotalUpdates']-warm))
    return protocol['endLearningRate'] + (protocol['peakLearningRate']-protocol['endLearningRate'])*.5*(1+math.cos(math.pi*fraction))

exposure = []
for fraction in [.01,.05,.1,.125,.2,1.]:
    for updates in [100,250,384,613,1000,2500,5000]:
        draws = 8*updates*fraction
        exposure.append({'humanRowFraction':fraction,'updates':updates,'humanDraws':draws,
            'meanAtomicExposures':draws/613,'oneAtomicPassUpdates':613/(8*fraction)})

split_path = BASE / 'phone_2m_scratch100_20261024/SPLIT.json'
split = load(split_path)
native = {'keys':list(split), 'train':len(split['train']),'dev':len(split['dev']),
    'trainMapCounts':dict(collections.Counter(x['map'] for x in split['train'])),
    'devMapCounts':dict(collections.Counter(x['map'] for x in split['dev']))}
save('STATIC_FINDINGS.json', {'scope':'仅已保存JSON/gzip/字节摘要与算术；零引擎调用、零模型前向、零优化器、零手机操作',
    'pools':result,'admittedSources':admitted,'nativeSplit':native,
    'baseline':{'checkpoint':sync['finalCheckpoint'],'sha256':sync['finalCheckpointSha256'],
        'syncCheckedUtc':sync['checkedUtc'],'complete':sync['complete'],'fileChecks':checks,
        'schedulerNextLearningRate2000':lr(201251),'schedulerNextLearningRate2414':lr(241899)}})
save('EXPOSURE.json',exposure)
paths = [CONV / n for n in ['REPORT.md','PLAN.json','SUMMARY.json','CONVERSION.json','STATE_IDENTITY_ISOLATION.json','FORMAT_VERIFICATION.json','reader.py','convert.mts','encode.mts','train-admitted.frames.gz']]
paths += [INV / n for n in ['REPORT.md','PROPOSED_PLAN.json','multiplayer-ledger.json','accepted-packets.json','availability-gaps.json','saved-packet-chain.json']]
paths += [sync_path,split_path]
save('INPUT_IDENTITY.json', {'files':[{'path':str(p.relative_to(ROOT)),'sha256':sha(p)} for p in paths], 'convertedStateFiles':state_files})
print(json.dumps({'pools':{k:{x:y for x,y in v.items() if x!='sourceRows'} for k,v in result.items()},'admitted':admitted,'native':native,'baselineHash':sync['finalCheckpointSha256'],'baselineFilesChecked':len(checks),'nextLR':lr(241899)},ensure_ascii=False))
