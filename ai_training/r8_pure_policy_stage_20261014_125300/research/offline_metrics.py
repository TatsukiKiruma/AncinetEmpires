"""候选完整验证集的分地图与行为切片，不借用500条局部指标。"""
import sys,json,gzip,collections,torch
from train import STAGE,sha,SpatialResNetPolicyValueNet,load_json_model,tensors,forward
p,dataset=sys.argv[1:3];m=SpatialResNetPolicyValueNet();load_json_model(m,p);m.eval();stats={};total=0
def evaluate_batch(rows):
    global total
    ls,_=forward(m,[tensors(s) for s in rows])
    for s,l in zip(rows,ls):
        pred=int(l.argmax());target=s['targetActionIndex'];sem=s['candidateSemantics'];st=s['stateJson'];own=[u for u in st['units'] if u['ownerId']==st['currentPlayer']]
        slices=['all','map:'+s['mapName'],'targetType:'+str(max(range(14),key=lambda i:sem[target][i]))]
        if st.get('pendingUnitId'):slices.append('pending')
        if st['players'][st['currentPlayer']]['gold']<100:slices.append('low_gold')
        if any(u['unitClass']=='commander' and u['hp']<=40 for u in own):slices.append('commander_low_hp')
        for k in slices:
            r=stats.setdefault(k,{'samples':0,'correct':0,'surrenderChoices':0});r['samples']+=1;r['correct']+=pred==target;r['surrenderChoices']+=sem[pred][12]>.5
        total+=1
with torch.no_grad(),gzip.open(STAGE/f'data/{dataset}/val.jsonl.gz','rt',encoding='utf8') as f:
    batch=[]
    for line in f:
        batch.append(json.loads(line))
        if len(batch)==32:evaluate_batch(batch);batch=[]
    if batch:evaluate_batch(batch)
for r in stats.values():r['top1']=r['correct']/r['samples']
report={'modelSha256':sha(p),'dataset':dataset,'validationSha256':sha(STAGE/f'data/{dataset}/val.jsonl.gz'),'totalRows':total,'slices':stats}
(STAGE/f'evidence/offline_{sha(p)}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False))
