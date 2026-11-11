"""Policy与独立Value联合损失的PyTorch自动微分数值参考。"""
from train import *
from residual_value import ResidualValue
name=sys.argv[1];model=read(HERE/('value-residual-initial-model.json' if name=='residual-initial' else 'value-army-initial-model.json' if name=='army-initial' else 'initial.json' if name=='initial' else 'model-final.json'))
model['valueWeights']=model.get('valueWeights',read(HERE/'value-initial.json'));save(f'numeric-model-{name}.json',model)
s=model['schema'];p=make_policy(s,model['weights']);v=(ResidualValue if model.get('valueArmyResidual') else Value)(model['valueWeights']);inputs=read(HERE/('inputs-army.json' if model.get('valueArmyFeature') else 'inputs.json'))
def run(rows,winning=False):
    b=collate(rows,s,winning);p.zero_grad();v.zero_grad();z,g,ctx=p(b);policy,ce=stage3.objective(z,g,b)
    assert float((contexts(p,b)-ctx).detach().abs().max())<1e-12,'价值独立上下文与策略上下文不一致'
    target=torch.tensor([r['valueTarget'] if r['valueMask'] else 0 for r in rows],dtype=DT);mask=torch.tensor([r['valueMask'] for r in rows],dtype=DT)
    value=v(torch.cat([ctx.detach(),torch.tensor([r['valueSummary']+([r['valueArmy']] if model.get('valueArmyFeature') else []) for r in rows],dtype=DT)],1))
    loss=((ce+(value-target)**2*mask)*b['weight']).sum()/b['weight'].sum();loss.backward()
    grad=p.flat.grad.tolist()+p.type_bias.grad.tolist()+(v.flat.grad.tolist() if v.flat.grad is not None else [0.]*len(v.flat))
    out=[dict(logits=z[j,:len(r['codes'])].detach().tolist(),groupLogits=g[j,:len(set(r['actionGroups']))].detach().tolist(),value=float(value[j].detach()),best=stage3.decode(z[j,:len(r['codes'])].tolist(),g[j,:len(set(r['actionGroups']))].tolist(),r),loss=float(loss.detach()),gradient=grad) for j,r in enumerate(rows)]
    return dict(out=out,loss=float(loss.detach()),gradient=grad)
out=[run([r])['out'][0] for r in inputs];checks=[]
tail=read(HERE/'contract.json')['trainRows']%32 if (HERE/'contract.json').exists() else 7
for size in [32,tail or 32]:
    for winning in [False,True]:
        indexes=[i%len(inputs) for i in range(size)];result=run([inputs[i] for i in indexes],winning);checks.append(dict(size=size,indexes=indexes,loss=result['loss'],gradient=result['gradient'],winningWeighted=winning))
save(f'python-{name}.json',dict(out=out,batchChecks=checks))
