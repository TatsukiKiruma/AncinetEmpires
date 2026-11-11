"""完整正式面板结束后比较基线全部动作前缀，搜索的实际变化另列。"""
from pathlib import Path
import json,gzip,hashlib
from itertools import zip_longest
HERE=Path(__file__).resolve().parent;REV=HERE/'revisions/r21'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
plan=read(HERE/'teacher-battle-plan.json');assert all((HERE/'teacher-r21-battles/slots'/s['id']/'result.json').exists() for s in plan['slots']),'全部计时结束后才能运行完整轨迹对照'
proofs=[];baselineActions=0;baselineSlots=0;searchChanges=[]
keys=['beforeHash','afterHash','code','side','rngBefore','rngAfter','inputHash','logitsHash']
for slot in plan['slots']:
    paths=[HERE/f'teacher-{r}-battles/slots'/slot['id'] for r in ['r20','r21']];results=[read(p/'result.json') for p in paths]
    assert results[0]['modelHash']==results[1]['modelHash']
    isBaseline=slot['model']!='teacher_search';firstDifference=None;common=0;previous=None
    logs=[p/'actions.jsonl.gz' for p in paths]
    with gzip.open(logs[0],'rt',encoding='utf-8') as a,gzip.open(logs[1],'rt',encoding='utf-8') as b:
        for i,(x,y) in enumerate(zip_longest(a,b)):
            if x is None or y is None:break
            x=json.loads(x);y=json.loads(y);changed=[k for k in keys if x.get(k)!=y.get(k)]
            if changed and firstDifference is None:firstDifference=dict(row=i,fields=changed,before=x['code'],after=y['code'],sameBefore=x['beforeHash']==y['beforeHash'],newReason=(y.get('search') or {}).get('reason'),previous=previous)
            if isBaseline:assert not changed,(slot['id'],i,changed)
            common+=1;previous=dict(before=x['code'],after=y['code'],newReason=(y.get('search') or {}).get('reason'))
    old,new=results
    if isBaseline:
        baselineActions+=common;baselineSlots+=1
        if old['actions']!=new['actions']:assert 'wall_truncation' in [old['classification'],new['classification']],'基线只能因同预算下墙钟结束位置不同而改变长度'
        else:assert old['finalHash']==new['finalHash'] and old['classification']==new['classification']
    elif firstDifference or old['finalHash']!=new['finalHash'] or old['classification']!=new['classification']:
        searchChanges.append(dict(slot=slot['id'],oldClassification=old['classification'],newClassification=new['classification'],oldActions=old['actions'],newActions=new['actions'],firstDifference=firstDifference))
    proofs.append(dict(slot=slot['id'],baseline=isBaseline,commonActions=common,oldLogSha256=sha(logs[0]),newLogSha256=sha(logs[1]),oldFinalHash=old['finalHash'],newFinalHash=new['finalHash']))
assert baselineSlots==100
report=dict(passed=True,slots=150,baselineSlots=baselineSlots,baselineSharedActions=baselineActions,allBaselineSubmittedPrefixesExact=True,searchTrajectoryChanges=searchChanges,proofs=proofs,scope='公共优化的100槽基线完整前缀一致性；搜索变化来自另行登记的安全完结修复，不能把更高离线叶子当胜率证据')
with (REV/'paired-trajectory-gate.json').open('x',encoding='utf-8') as out:json.dump(report,out,ensure_ascii=False)
print({k:v for k,v in report.items() if k!='proofs'})
