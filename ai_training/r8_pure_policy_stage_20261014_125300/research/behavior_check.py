"""完整行为回归夹具预测，候选发布前不得借用其他权重的结果。"""
import json,sys,torch
from train import STAGE,sha,SpatialResNetPolicyValueNet,load_json_model,tensors,forward
p=sys.argv[1];m=SpatialResNetPolicyValueNet();load_json_model(m,p);m.eval();rows=json.loads((STAGE/'evidence/behavior_fixture.json').read_text(encoding='utf8'));results=[]
with torch.no_grad():
    for s in rows:
        l,_=forward(m,[tensors(s)]);i=int(l[0].argmax());sem=s['candidateSemantics'][i];results.append({'sampleId':s['sampleId'],'map':s['mapName'],'historicalFailure':s.get('historicalFailure'),'typeIndex':max(range(14),key=lambda k:sem[k]),'teacherMatch':i==s['targetActionIndex']})
out={'modelSha256':sha(p),'surrenderChoices':sum(x['typeIndex']==12 for x in results),'historicalSurrenderChoices':sum(x['typeIndex']==12 and x['historicalFailure'] is not None for x in results),'teacherMatches':sum(x['teacherMatch'] for x in results),'samples':len(results),'rows':results}
(STAGE/f'evidence/behavior_{sha(p)}.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print({k:v for k,v in out.items() if k!='rows'})
