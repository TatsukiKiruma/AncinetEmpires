"""行为夹具短程拟合，用于验证梯度与回合/投降相对排序，不作为候选。"""
import json,random,torch,time
from train import STAGE,tensors,objective,evaluate,load_json_model,SpatialResNetPolicyValueNet
rows=json.loads((STAGE/'evidence/behavior_fixture.json').read_text(encoding='utf8'))
selected=[s for s in rows if s.get('historicalFailure') is not None][-16:]+[s for s in rows if s['teacherActionType']=='end_turn'][:16]
selected=selected[:32];assert selected
data=[tensors(s) for s in selected];torch.manual_seed(884);random.seed(884);m=SpatialResNetPolicyValueNet();load_json_model(m,STAGE.parent/'r7_training_stage_20261014_083500/artifacts/models/theta1_baseline.json');o=torch.optim.AdamW(m.parameters(),lr=.001);before=evaluate(m,data);start=time.monotonic()
for u in range(400):
    m.train();o.zero_grad();loss=objective(m,random.choices(data,k=16),{'surrenderWeight':2.,'surrenderMargin':8.});loss.backward();torch.nn.utils.clip_grad_norm_(m.parameters(),1.);o.step()
after=evaluate(m,data);result={'samples':len(data),'before':before,'after':after,'updates':400,'seconds':time.monotonic()-start,'passed':after['surrenderChoices']==0 and after['top1']>=.9,'scope':'诊断tiny-fit，不计DEV或正式候选'}
(STAGE/'evidence/tiny_fit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(result);assert result['passed']
