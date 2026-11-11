"""在真实已准入分片上验证完整优化器输入与独立Value的梯度形状。"""
from train import *
import pickle,json
receipt=next((HERE/'packed').glob('*.receipt.json'));entry=read(receipt)
with Path(entry['packedPath']).open('rb') as f:data=pickle.load(f)
rows=data['rows'][:7]
for r in rows:r['_token_table']=data['tokenTable']
model=read(HERE/'initial.json');s=model['schema'];p=make_policy(s,model['weights']);b=collate(rows,s,True);z,g,ctx=p(b);loss,_=stage3.objective(z,g,b);loss.backward()
assert p.flat.grad.shape==p.flat.shape and p.type_bias.grad.shape==(5,)
x=torch.cat([ctx.detach(),torch.tensor([r['valueSummary']+[r['valueSummary'][8]-r['valueSummary'][22]] for r in rows],dtype=DT)],1)
v=stage4Residual.ResidualValue(model['valueWeights']);value=v(x);value.square().mean().backward();assert x.shape[1]==297 and len(v.flat.grad)==len(model['valueWeights'])
save('training-smoke.json',dict(passed=True,batch=len(rows),candidates=z.shape[1],valueDimension=x.shape[1],policyParameters=len(p.flat)+5,valueParameters=len(v.flat),loss=float(loss.detach())));print('真实分片训练前向与反向通过')
