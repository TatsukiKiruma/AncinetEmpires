"""五类别组偏置联合L-BFGS拟合；仅开发门禁选候选。"""
from train import *
model=read(HERE/'policy-best.json');s=model['schema'];p=make_policy(s,model['weights']);contract=read(HERE/'contract.json')
def cache(split):
    rowsout=[];files=[f for f in contract['files'] if f['split']==split]
    with torch.no_grad():
        for rows,b in batches(files,s):
            z,g,_=p(b)
            for j,r in enumerate(rows):
                names=list(dict.fromkeys(r['actionGroups']));groups=g[j,:len(names)].tolist();types=[TYPES.index(gtype(n)) if gtype(n) in TYPES else 5 for n in names]
                groupidx=[names.index(n) for n in r['actionGroups']];zz=z[j,:len(r['codes'])].tolist()
                rowsout.append(dict(weight=r['weight'],target=r['target'],codes=r['codes'],actionGroups=r['actionGroups'],names=names,groupidx=groupidx,types=types,z=zz,g=groups,type=r['type'],valueMask=r['valueMask'],valueTarget=r['valueTarget']))
    return rowsout
train=cache('train');dev=cache('validation')
with (HERE/'calibration-cache.pkl').open('xb') as f:pickle.dump(dict(train=train,dev=dev),f,protocol=5)
def metric(rows,bias):
    m=dict(rows=len(rows),correct=0,groupCorrect=0,attackOpportunity=0,attackTaken=0,waitWithOpportunity=0,endWithRecruit=0,waits=0)
    loss=weight=0.
    for r in rows:
        gs=[v+(bias[t] if t<5 else 0) for v,t in zip(r['g'],r['types'])];g=base.stable_best(gs);members=[i for i,k in enumerate(r['groupidx']) if k==g];chosen=members[base.stable_best([r['z'][i] for i in members])];code=r['codes'][chosen];target=r['target'];tg=r['groupidx'][target]
        m['correct']+=chosen==target;m['groupCorrect']+=g==tg;attack=any(c.startswith('attack:') for c in r['codes']);m['attackOpportunity']+=attack;m['attackTaken']+=attack and code.startswith('attack:')
        if code.startswith('wait:'):
            m['waits']+=1;actor=r['actionGroups'][chosen].split('|')[0];m['waitWithOpportunity']+=any(n in [actor+'|move',actor+'|attack',actor+'|post_attack_move'] for n in r['names'])
        if code=='end_turn':m['endWithRecruit']+=any(c.startswith('recruit_') for c in r['codes'])
        zs=[r['z'][i] for i,k in enumerate(r['groupidx']) if k==tg];gm=max(gs);zm=max(zs)
        ce=gm+math.log(sum(math.exp(v-gm) for v in gs))-gs[tg]+zm+math.log(sum(math.exp(v-zm) for v in zs))-r['z'][target];loss+=ce*r['weight'];weight+=r['weight']
    m.update(top1=m['correct']/m['rows'],groupTop1=m['groupCorrect']/m['rows'],attack_opportunity_rate=m['attackTaken']/max(1,m['attackOpportunity']),loss=loss/weight);return m
# 训练时组偏置已经包含在缓存g中，本次拟合增量。
features=np.full((len(train),6),-np.inf);targetTypes=np.array([r['types'][r['groupidx'][r['target']]] for r in train]);weights=np.array([r['weight']*(1.5 if r['valueMask'] and r['valueTarget']==1 else 1) for r in train])
for j,r in enumerate(train):
    for t in range(6):
        vals=[v for v,k in zip(r['g'],r['types']) if k==t]
        if vals:m=max(vals);features[j,t]=m+math.log(sum(math.exp(v-m) for v in vals))
def fit(wait,end):
    adjusted=weights*np.where(targetTypes==0,wait,np.where(targetTypes==1,end,1));adjusted/=adjusted.sum()
    def objective(b):
        z=features+np.r_[b,0];m=np.max(z,axis=1);exp=np.exp(z-m[:,None]);probs=exp/exp.sum(axis=1)[:,None]
        loss=float(np.sum((m+np.log(exp.sum(axis=1))-z[np.arange(len(z)),targetTypes])*adjusted)+1e-3*np.sum(b*b))
        grad=(probs*adjusted[:,None]).sum(axis=0);np.add.at(grad,targetTypes,-adjusted);return loss,grad[:5]+2e-3*b
    b=nn.Parameter(torch.zeros(5,dtype=DT));x=torch.tensor(features,dtype=DT);ww=torch.tensor(adjusted,dtype=DT);tt=torch.tensor(targetTypes,dtype=torch.int64)
    optimizer=torch.optim.LBFGS([b],lr=1,max_iter=100,tolerance_grad=1e-9,tolerance_change=1e-12,line_search_fn='strong_wolfe');calls=0
    def closure():
        nonlocal calls
        optimizer.zero_grad();z=x+torch.cat([b,torch.zeros(1,dtype=DT)]);loss=((torch.logsumexp(z,1)-z.gather(1,tt[:,None]).squeeze(1))*ww).sum()+1e-3*(b*b).sum();loss.backward();calls+=1;return loss
    optimizer.step(closure);bias=b.detach().numpy();loss,gradient=objective(bias)
    # 独立NumPy解析梯度核对优化器实际目标。
    closure();error=float(np.max(np.abs(b.grad.numpy()-gradient)));assert error<1e-8
    return bias,dict(success=bool(np.max(np.abs(gradient))<1e-5),closureCalls=calls,objective=loss,gradientMax=float(np.max(np.abs(gradient))),numpyGradientError=error,optimizer='PyTorch L-BFGS strong_wolfe')
baseline=metric(dev,np.zeros(5));save('policy-uncalibrated-dev.json',baseline);candidates=[]
old=read(OLD/'group-best.json');oldMetrics=evaluate(stage3.Policy(old['schema'],old['weights']),[f for f in contract['files'] if f['split']=='validation'],old['schema']);save('stage3-same-dev.json',oldMetrics);oldReference=oldMetrics['metrics']
for wait in [.6,.8,1.]:
    for end in [.5,.75,1.]:
        bias,optimization=fit(wait,end);metrics=metric(dev,bias)
        gates=dict(wait=metrics['waitWithOpportunity']<=min(baseline['waitWithOpportunity'],oldReference['waitWithOpportunity']),end=metrics['endWithRecruit']<=.8*min(baseline['endWithRecruit'],oldReference['endWithRecruit']),attack=metrics['attack_opportunity_rate']>=max(baseline['attack_opportunity_rate'],oldReference['attack_opportunity_rate']),top1=metrics['top1']>=max(baseline['top1'],oldReference['top1'])-.01)
        record=dict(wait=wait,end=end,bias=bias.tolist(),optimization=optimization,metrics=metrics,gates=gates,passed=all(gates.values()));candidates.append(record);save('calibration-candidates.json',candidates)
qualified=[r for r in candidates if r['passed']];selected=min(qualified,key=lambda r:r['metrics']['loss']) if qualified else None
if selected:model['schema']['groupTypeBias']=(np.array(model['schema']['groupTypeBias'])+selected['bias']).tolist()
save('policy-final.json',model);save('calibration-result.json',dict(passed=selected is not None,selected=selected,uncalibrated=baseline,stage3Reference=oldReference,selectionUsedBattleResults=False,fallback='无候选通过时保留未校准策略'))
print(json.dumps(dict(passed=selected is not None,selected=selected)),flush=True)
