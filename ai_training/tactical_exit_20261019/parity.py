"""Policy与独立Value联合损失的PyTorch自动微分数值参考。"""
from train import *
ResidualValue=stage4Residual.ResidualValue
name=sys.argv[1];assert name in ['initial','teacher','proposal','best'];model=read(HERE/({'initial':'initial.json','teacher':'teacher-model.json','proposal':'base-policy-final.json','best':'model-final.json'}[name]))
model['valueWeights']=model['valueWeights'];save(f'numeric-model-{name}.json',model)
s=model['schema'];p=make_policy(s,model['weights']);v=(ResidualValue if model.get('valueArmyResidual') else Value)(model['valueWeights']);inputs=read(HERE/'inputs.json')
def run(rows,winning=False):
    b=collate(rows,s,winning);p.zero_grad();v.zero_grad();z,g,ctx=p(b);policy,ce=stage3.objective(z,g,b)
    assert float((contexts(p,b)-ctx).detach().abs().max())<1e-12,'价值独立上下文与策略上下文不一致'
    target=torch.tensor([r['valueTarget'] if r['valueMask'] else 0 for r in rows],dtype=DT);mask=torch.tensor([r['valueMask'] for r in rows],dtype=DT)
    value=v(torch.cat([ctx.detach(),torch.tensor([r['valueSummary']+[r['valueSummary'][8]-r['valueSummary'][22]] for r in rows],dtype=DT)],1))
    loss=((ce+(value-target)**2*mask)*b['weight']).sum()/b['weight'].sum();loss.backward()
    grad=p.flat.grad.tolist()+p.type_bias.grad.tolist()+(v.flat.grad.tolist() if v.flat.grad is not None else [0.]*len(v.flat))
    out=[dict(logits=z[j,:len(r['codes'])].detach().tolist(),groupLogits=g[j,:len(set(r['actionGroups']))].detach().tolist(),value=float(value[j].detach()),best=stage3.decode(z[j,:len(r['codes'])].tolist(),g[j,:len(set(r['actionGroups']))].tolist(),r),loss=float(loss.detach()),gradient=grad) for j,r in enumerate(rows)]
    return dict(out=out,loss=float(loss.detach()),gradient=grad)
out=[run([r])['out'][0] for r in inputs];checks=[]
tail=read(HERE/'contract.json')['trainRows']%32 if (HERE/'contract.json').exists() else 7
sizes=list(dict.fromkeys([32,tail or 32]))
if (HERE/'expert-summary.json').exists():
    expertTail=read(HERE/'expert-summary.json')['rows']%32
    if expertTail and expertTail not in sizes:sizes.append(expertTail)
for size in sizes:
    for winning in [False,True]:
        indexes=[i%len(inputs) for i in range(size)];result=run([inputs[i] for i in indexes],winning);checks.append(dict(size=size,indexes=indexes,loss=result['loss'],gradient=result['gradient'],winningWeighted=winning))
    indexes=[i%len(inputs) for i in range(size)]
    overrides=[dict(weight=2. if j%2 else .5,valueMask=False,valueTarget=None,target=(inputs[i]['target']+1)%len(inputs[i]['codes'])) for j,i in enumerate(indexes)]
    result=run([dict(inputs[i],**overrides[j]) for j,i in enumerate(indexes)])
    assert max(abs(v) for v in result['gradient'][-len(model['valueWeights']):])==0,'专家mask=false不得更新Value'
    checks.append(dict(size=size,indexes=indexes,loss=result['loss'],gradient=result['gradient'],winningWeighted=False,rowOverrides=overrides,expertWeightsAndCorrectedTargets=True))
save(f'python-{name}.json',dict(out=out,batchChecks=checks))
