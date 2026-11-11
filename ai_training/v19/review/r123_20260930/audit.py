"""复算 R1/R2/R3 的对局、模型身份、logit 差与适用反事实。"""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT/'v19/out/run_20260929_v19_02'
OUT = Path(__file__).parent
def read(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))
def rows(p):
    with p.open(encoding='utf-8-sig') as f:
        for line in f:
            if line.strip():
                yield json.loads(line)
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def panel(where,key):
    return {(r['mapName'],r['seed'],r['candidateSeat']):r for p in (RUN/'arena'/where).glob(key+'.m*.games.jsonl')
            for r in rows(p) if r['arm']=='CANDIDATE'}
panels={k:panel(p,k) for p,k in [('dev','r2_control'),('dev','r2_fix'),('recheck','theta1_fresh40'),('recheck','P1_champion_fresh40')]}
result={'panels':{},'comparisons':{},'r2':{},'r1':[]}
for key,p in panels.items():
    result['panels'][key]={'games':len(p),'outcomes':dict(collections.Counter(r['outcomeKind'] for r in p.values())),
        'sha':sorted({r['checkpointSha256'] for r in p.values()}),'errors':sum(bool(r['error']) for r in p.values()),
        'fallbacks':sum(bool(r['fallbackUsed']) for r in p.values())}
for a,b in [('r2_fix','r2_control'),('theta1_fresh40','P1_champion_fresh40')]:
    pa,pb=panels[a],panels[b]
    assert set(pa)==set(pb)
    fields=['rulesHash','engineSourceDigest','policySourceDigest','maxSteps','maxPlies','wallTimeoutMs','initialStateHash']
    assert all(pa[k][f]==pb[k][f] for k in pa for f in fields)
    result['comparisons'][a+'_vs_'+b]={'sameOutcome':sum(pa[k]['outcomeKind']==pb[k]['outcomeKind'] for k in pa),
        'changed':[{'map':k[0],'seed':k[1],'seat':k[2],'a':pa[k]['outcomeKind'],'b':pb[k]['outcomeKind']} for k in pa if pa[k]['outcomeKind']!=pb[k]['outcomeKind']]}
for key in ['r2_control','r2_fix']:
    m=read(RUN/f'experiments/{key}/s42/{key}.metrics.json')
    assert sha(ROOT/m['output']['path'])==m['output']['sha256']==result['panels'][key]['sha'][0]
    result['r2'][key]={'init':m['initCheckpoint'],'initSha':sha(ROOT/m['initCheckpoint']),
        'data':m['data'],'updates':m['klStop']['updatesPerformed'],'phaseWeighting':m['phaseWeighting'],
        'outputSha':m['output']['sha256']}
historical=ROOT/'v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json'
verify=RUN/'verify/ppo_w1_uniform/ppo_w1_uniform.json'
result['uniformRefactorCheck']={'sameHistoricalSha':verify.exists() and sha(verify)==sha(historical),
    'productionControlIsHistoricalTheta1':result['r2']['r2_control']['outputSha']==sha(historical)}
trace=read(RUN/'diag/trace.json')
for r in trace['results']:
    windows=[]
    for w in r['windows']:
        cf=w['counterfactual']
        valid=cf.get('outcomeKind') in ['NATURAL_WIN','NATURAL_LOSS','NATURAL_DRAW'] and 'error' not in cf
        scores={}
        for model in 'AB':
            codes,logits=w['ordered'+model],w['logits'+model]
            scores[model]={a:(logits[codes.index(w[a])] if w[a] in codes else None) for a in ['actionA','actionB']}
            if all(v is not None for v in scores[model].values()):
                scores[model]['absoluteGap']=abs(scores[model]['actionA']-scores[model]['actionB'])
        windows.append({'decision':w['decisionIndex'],'actionA':w['actionA'],'actionB':w['actionB'],
            'scores':scores,'counterfactual':cf,'validNaturalCounterfactual':valid,
            'changedNaturalResult':valid and cf['outcomeKind']!=r['modelB']['outcomeKind']})
    result['r1'].append({'family':r['family']['id'],'digestMatches':[r['modelA']['digestMatchesDev'],r['modelB']['digestMatchesDev']],
        'windows':windows})
# 检查已执行的历史评测是否复用本轮复核随机流；只读 arena 对局，不把预登记空清单算执行。
freshkeys=set(panels['theta1_fresh40'])
overlap=[]
files=0
for version in ['v14','v15','v16','v17','v18']:
    for p in (ROOT/version).rglob('*.games.jsonl'):
        if 'arena' not in p.parts:
            continue
        files+=1
        for r in rows(p):
            k=(r.get('mapName'),r.get('seed'),r.get('candidateSeat'))
            if k in freshkeys:
                overlap.append({'file':str(p.relative_to(ROOT)),'key':k})
result['freshHistoricalArenaCheck']={'filesChecked':files,'overlaps':overlap,
    'scope':'V14–V18 的 arena/*.games.jsonl；不是所有可能外部评测的证明'}
(OUT/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'panels':result['panels'],'comparisons':result['comparisons'],
    'r2Updates':{k:v['updates'] for k,v in result['r2'].items()},'uniformRefactorCheck':result['uniformRefactorCheck'],
    'freshCheck':result['freshHistoricalArenaCheck'],
    'r1':[{'family':r['family'],'valid':sum(w['validNaturalCounterfactual'] for w in r['windows']),
           'changed':sum(w['changedNaturalResult'] for w in r['windows']),
           'firstScores':r['windows'][0]['scores']} for r in result['r1']]},ensure_ascii=False,indent=2))
