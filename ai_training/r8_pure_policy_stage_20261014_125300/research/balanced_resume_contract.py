"""均衡采样的中断恢复合同；诊断夹具不计入正式训练数据。"""
import json,random,numpy as np,torch
from train_balanced import STAGE,tensors,SpatialResNetPolicyValueNet,objective,checkpoint,restore_rng,build_pools,sample_ids
rows=json.loads((STAGE/'evidence/behavior_fixture.json').read_text(encoding='utf8'));data=[tensors(s) for s in rows];pools=build_pools(data)
assert len(pools[0])==14
cfg={'batchSize':4,'endTurnFraction':.15,'daggerFraction':None,'surrenderMargin':8.,'surrenderWeight':1.}
torch.manual_seed(543);random.seed(543);np.random.seed(543);m=SpatialResNetPolicyValueNet();o=torch.optim.AdamW(m.parameters(),lr=.0003);sc=torch.optim.lr_scheduler.CosineAnnealingLR(o,T_max=8)
def steps(n):
    ids=[]
    for _ in range(n):
        picked=sample_ids(pools,cfg);ids.append(picked);o.zero_grad();loss=objective(m,[data[i] for i in picked],cfg);loss.backward();o.step();sc.step()
    return ids
steps(3);p=STAGE/'evidence/balanced_resume.pt';torch.save(checkpoint(m,o,sc,3,cfg,{}),p);expected_ids=steps(5);expected={k:v.clone() for k,v in m.state_dict().items()}
c=torch.load(p,weights_only=False);m.load_state_dict(c['model_state_dict']);o.load_state_dict(c['optimizer_state_dict']);sc.load_state_dict(c['scheduler_state_dict']);restore_rng(c['rng']);actual_ids=steps(5)
assert actual_ids==expected_ids and all(torch.equal(v,m.state_dict()[k]) for k,v in expected.items())
(STAGE/'evidence/balanced_resume_contract.json').write_text(json.dumps({'passed':True,'steps':8,'split':3,'strata':14,'samplingSequenceEqual':True,'modelParametersBitwiseEqual':True}),encoding='utf8');print('均衡采样恢复合同通过')
