"""完整计时结束后比较实际动作、数值输入与随机流，保留独立诊断原件。"""
from pathlib import Path
import json,gzip,hashlib,sys,time
from itertools import zip_longest
HERE=Path(__file__).resolve().parent
oldPhase=sys.argv[1];newPhase=sys.argv[2];out=HERE/(sys.argv[3] if len(sys.argv)>3 else 'revisions/r21/resume1')/f'paired-trajectory-{time.time_ns()}.json'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
plan=read(HERE/'teacher-battle-plan.json');assert all((HERE/(newPhase+'-battles/slots')/s['id']/'result.json').exists() for s in plan['slots'])
proofs=[];baselineActions=0;baselineSlots=0;searchChanges=[]
keys=['beforeHash','afterHash','code','action','side','rngBefore','rngAfter','legalHash','selected']
for slot in plan['slots']:
    paths=[HERE/(p+'-battles/slots')/slot['id'] for p in [oldPhase,newPhase]];results=[read(p/'result.json') for p in paths]
    assert results[0]['modelHash']==results[1]['modelHash'];assert all(read(p/'strict-replay.json')['passed'] for p in paths)
    baseline=slot['model']!='teacher_search';first=None;common=0;logs=[p/'actions.jsonl.gz' for p in paths]
    with gzip.open(logs[0],'rt',encoding='utf-8') as a,gzip.open(logs[1],'rt',encoding='utf-8') as b:
        for i,(x,y) in enumerate(zip_longest(a,b)):
            if x is None or y is None:break
            x=json.loads(x);y=json.loads(y);changed=[k for k in keys if x.get(k)!=y.get(k)]
            if changed and first is None:first=dict(row=i,fields=changed,before=x['code'],after=y['code'],sameBefore=x['beforeHash']==y['beforeHash'],newReason=(y.get('search') or {}).get('reason'))
            if baseline:assert not changed,(slot['id'],i,changed)
            common+=1
    old,new=results
    if baseline:
        baselineActions+=common;baselineSlots+=1
        if old['actions']!=new['actions']:assert 'wall_truncation' in [old['classification'],new['classification']]
        else:assert old['finalHash']==new['finalHash'] and old['classification']==new['classification']
    elif first or old['finalHash']!=new['finalHash'] or old['classification']!=new['classification']:
        searchChanges.append(dict(slot=slot['id'],oldClassification=old['classification'],newClassification=new['classification'],oldActions=old['actions'],newActions=new['actions'],firstDifference=first))
    proofs.append(dict(slot=slot['id'],baseline=baseline,commonActions=common,oldLogSha256=sha(logs[0]),newLogSha256=sha(logs[1])))
assert baselineSlots==100
report=dict(passed=True,oldPhase=oldPhase,newPhase=newPhase,baselineSlots=100,baselineSharedActions=baselineActions,allBaselinePrefixesExact=True,searchTrajectoryChanges=searchChanges,proofs=proofs)
with out.open('x',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False)
print(json.dumps({k:v for k,v in report.items() if k!='proofs'},ensure_ascii=False))
