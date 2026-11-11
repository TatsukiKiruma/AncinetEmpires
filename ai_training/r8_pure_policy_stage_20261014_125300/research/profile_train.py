"""在独立诊断模型上估计真实候选长度下的训练成本，不导出候选。"""
import json,time,random,torch
from train import STAGE,read_data,SpatialResNetPolicyValueNet,objective
d=read_data(STAGE/'data/pilot_snapshot/train.jsonl.gz');random.seed(147);torch.manual_seed(147);m=SpatialResNetPolicyValueNet();o=torch.optim.AdamW(m.parameters(),lr=.0003);t=time.monotonic()
for i in range(100):
    o.zero_grad();loss=objective(m,random.choices(d,k=32),{});loss.backward();o.step()
elapsed=time.monotonic()-t;ks=sorted(len(s['candidateSemantics']) for s in d)
r={'diagnosticOnly':True,'updates':100,'batchSize':32,'seconds':elapsed,'estimated12000UpdateSeconds':elapsed*120,'candidateCounts':{'median':ks[len(ks)//2],'max':max(ks)},'dataSamples':len(d)}
(STAGE/'evidence/training_cost_profile.json').write_text(json.dumps(r,indent=2));print(r)
