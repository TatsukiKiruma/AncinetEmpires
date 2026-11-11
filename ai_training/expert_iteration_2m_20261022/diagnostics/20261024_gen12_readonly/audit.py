"""只读审计已完成的前两代；只在本诊断目录写汇总，不导入或启动训练。"""
import collections
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
EX = ROOT / 'execution_v5'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def describe(values):
    values = sorted(values)
    if not values:
        return {'n': 0}
    return dict(n=len(values), mean=statistics.fmean(values),
                p10=values[int((len(values)-1)*.1)], p50=statistics.median(values),
                p90=values[int((len(values)-1)*.9)], p99=values[int((len(values)-1)*.99)],
                min=values[0], max=values[-1])


def loss_summary(rows):
    n = sum(r['samples'] for r in rows)
    if not n:
        return {}
    return dict(updates=len(rows), samples=n,
                means={k:sum(r[k]*r['samples'] for r in rows)/n
                       for k in ('loss','policy','value','gradientNorm')},
                quantiles={k:describe([r[k] for r in rows])
                           for k in ('policy','value','gradientNorm')},
                clipped=sum(r['gradientNorm'] > 1 for r in rows),
                valueBatches=sum(r['valueSamples'] > 0 for r in rows),
                tinyValueBatches=sum(r['valueSamples'] > 0 and r['value'] < 1e-8 for r in rows))


def receipt_summary(j):
    sources, phases, perspective = collections.Counter(), collections.Counter(), collections.Counter()
    for key, n in j['distribution'].items():
        source, phase, side, _ = key.split('/')
        sources[source] += n
        phases[phase] += n
        perspective[side] += n
    return dict(emitted=j['emitted'], policy=j['policyCount'], value=j['valueCount'],
                duplicate=j['duplicateStates'], excluded=j['excludedByCanonical'],
                exclusionCount=j['exclusionCount'], sources=sources, phases=phases,
                perspectives=perspective, consumedParents=len(j['consumed']))


def fresh():
    return dict(count=collections.Counter(), spread=[], entropy=[], topProbability=[],
                incompleteMass=[], rootCoverage=[], completedCoverage=[], uniqueCandidates=[],
                valueRange=[], selectedRegret=[], actions=collections.Counter(), stop=collections.Counter())


def add_telemetry(stats, row):
    t = row.get('telemetry') or {}
    c = stats['count']
    c['actions'] += 1
    stats['actions'][row['action']['type']] += 1
    if t.get('queued'):
        c['queued'] += 1
    elif 'rootLegal' in t:
        c['roots'] += 1
        stats['stop'][t.get('stopReason')] += 1
        if t['rootLegal']:
            stats['rootCoverage'].append(len(set(t.get('rootCovered', [])))/t['rootLegal'])
            stats['completedCoverage'].append(len(set(t.get('rootCompleted', [])))/t['rootLegal'])
    candidates = [q for q in t.get('candidates', []) if math.isfinite(q['score'])]
    if not candidates:
        return
    c['candidateRows'] += 1
    c['candidateRecords'] += len(candidates)
    c['incompleteRecords'] += sum(not q['responseComplete'] for q in candidates)
    by_action = {}
    for q in candidates:
        code = q['rootAction']
        if code not in by_action or q['score'] > by_action[code]['score']:
            by_action[code] = q
    stats['uniqueCandidates'].append(len(by_action))
    if len(by_action) <= 1:
        c['singleRootAction'] += 1
        return
    c['comparisonRows'] += 1
    values = list(by_action.values())
    scores = [q['score'] for q in values]
    vs = [q['value'] for q in values]
    mx = max(scores)
    probs = [math.exp((s-mx)/.5) for s in scores]
    norm = sum(probs)
    probs = [p/norm for p in probs]
    stats['spread'].append(max(scores)-min(scores))
    stats['valueRange'].append(max(vs)-min(vs))
    stats['topProbability'].append(max(probs))
    stats['entropy'].append(-sum(p*math.log(p) for p in probs if p)/math.log(len(probs)))
    stats['incompleteMass'].append(sum(p for p,q in zip(probs,values) if not q['responseComplete']))
    c['allComparisonsIncomplete'] += int(all(not q['responseComplete'] for q in values))
    c['allCandidateValuesSaturated'] += int(all(abs(v) > .999 for v in vs))
    c['spreadBelow01'] += int(max(scores)-min(scores) < .01)
    c['spreadBelow001'] += int(max(scores)-min(scores) < .001)
    c['selectedNotScoreMax'] += int(row['code'] in by_action and by_action[row['code']]['score'] < mx-1e-8)
    if row['code'] in by_action:
        stats['selectedRegret'].append(mx-by_action[row['code']]['score'])


def finalize(s):
    return {k:describe(v) if isinstance(v,list) else dict(v) for k,v in s.items()}


started = time.time()
report = dict(scope='只读前两代，不重放权威引擎、不启动训练；原始动作统计未重新应用canonical去重，实际准入量以回执为准。', generations={}, inputs={})
for relative in ('execution_v5/train.py','execution_v5/dataset.ts','execution_v5/expert_source.ts'):
    report['inputs'][relative] = hashlib.sha256((ROOT/relative).read_bytes()).hexdigest()

for gen in (1,2):
    name = f'v5_gen_{gen:02}'
    manifest = read(EX/f'generations/gen_{gen:02}/expert-manifest.json')
    receipts = sorted((ROOT/'stream-receipts').glob(f'{name}*.json'))
    train_receipts = [p for p in receipts if '-train.json' in p.name]
    actual = read(train_receipts[0])
    metrics_path = ROOT/f'training/{name}/metrics.jsonl'
    rows = [json.loads(line) for line in metrics_path.read_text(encoding='utf-8').splitlines()]
    g = dict(receipts={p.name:receipt_summary(read(p)) for p in receipts},
             training=read(ROOT/f'training/{name}/training.json'),
             losses={str(ep):loss_summary([r for r in rows if r['epoch']==ep]) for ep in (1,2)},
             parents=[], timeline=[], rawStats={})
    groups = collections.defaultdict(fresh)
    cursor = 0
    for i, entry in enumerate(manifest['games']):
        directory = Path(entry['directory'])
        result = read(directory/'result.json')
        start = read(directory/'started.json')
        consumption = actual['consumed'].get('replay:'+start['job']['id'], {})
        emitted = max(consumption.get('policy',0),consumption.get('value',0))
        parent = dict(id=start['job']['id'], opponent=start['job']['opponent'],
                      map=start['job'].get('map'), seat=start['job']['seat'],
                      outcome=result['outcome'], stop=result['stop'], steps=result['steps'],
                      natural=result['natural'], self=start['self'], winner=result['winner'],
                      admitted=emitted, admittedPolicy=consumption.get('policy',0),
                      admittedValue=consumption.get('value',0), cursorStart=cursor,
                      cursorEnd=cursor+emitted, modelVersion=result['modelVersion'],
                      trajectorySha256=result['trajectorySha256'])
        g['parents'].append(parent)
        cursor += emitted
        # 第一代已扫描的131局在第二代原样复用，仅再次读取新增30局动作。
        if gen == 1 or i >= 131:
            group = ('seed131' if gen == 1 else 'added30')+'/'+start['job']['opponent']
            with gzip.open(directory/'actions.jsonl.gz','rt',encoding='utf-8') as stream:
                for line in stream:
                    row = json.loads(line)
                    add_telemetry(groups[group+'/'+row['side']], row)
        if (i+1) % 20 == 0:
            print(json.dumps(dict(generation=gen,parentsRead=i+1,seconds=round(time.time()-started,1))),flush=True)
    g['rawStats'] = {k:finalize(v) for k,v in groups.items()}
    g['parentTotals'] = dict(collections.Counter(p['opponent']+'/'+p['outcome'] for p in g['parents']))
    for ep in (1,2):
        ep_rows = [r for r in rows if r['epoch']==ep]
        for start_i,end_i,label in ((0,131,'seed131'),(131,len(g['parents']),'added30')):
            if start_i >= end_i:
                continue
            lo=g['parents'][start_i]['cursorStart']; hi=g['parents'][end_i-1]['cursorEnd']
            selected=[r for r in ep_rows if lo < r['cursor'] <= hi]
            g['timeline'].append(dict(epoch=ep,segment=label,start=lo,end=hi,**loss_summary(selected)))
    g['cursorReconstructed'] = cursor
    g['metricsSha256'] = hashlib.sha256(metrics_path.read_bytes()).hexdigest()
    # 参数名列表已有独立记录，此处只保留数量。
    for key in ('gradientNonzeroTensors','actualChangedTensors'):
        g['training'][key+'Count'] = len(g['training'].pop(key))
    report['generations'][str(gen)] = g

report['elapsedSeconds'] = time.time()-started
(HERE/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
for gen,g in report['generations'].items():
    print(json.dumps(dict(gen=gen,parentTotals=g['parentTotals'],cursor=g['cursorReconstructed'],rawStats=g['rawStats'],timeline=g['timeline']),ensure_ascii=False),flush=True)
print(json.dumps(dict(saved=str(HERE/'audit.json'),elapsedSeconds=report['elapsedSeconds'])),flush=True)
