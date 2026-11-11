"""以当前状态摘要重新训练Value；全部参数拟合只使用训练父局。"""
from train import *
import json,time,pickle,random,math
mode=sys.argv[1] if len(sys.argv)>1 else 'teacher'
model=read(HERE/('initial.json' if mode=='teacher' else 'distill-policy-final.json'))
p=make_policy(model['schema'],model['weights']);s=model['schema'];files=read(HERE/'contract.json')['files'];data={}
start=time.perf_counter()
for split in ['train','validation']:
    out=[];buffer=[]
    def emit(rows):
        with torch.no_grad():context=contexts(p,token_batch(rows,s)).tolist()
        for j,r in enumerate(rows):
            a=r['valueSummary'];out.append(dict(x=context[j]+a+[a[8]-a[22]],y=r['valueTarget'],weight=r['weight'],parent=r['parent'],turn=r['turn']))
    for r in base.rows_for([f for f in files if f['split']==split]):
        if not r.get('valueMask'):continue
        buffer.append(r)
        if len(buffer)==64:emit(buffer);buffer=[]
    if buffer:emit(buffer)
    data[split]=out
with (HERE/f'{mode}-value-contexts.pkl').open('xb') as f:pickle.dump(data,f,protocol=5)
train,dev=data['train'],data['validation'];x=torch.tensor([r['x'] for r in train],dtype=DT);dx=torch.tensor([r['x'] for r in dev],dtype=DT);y=torch.tensor([r['y'] for r in train],dtype=DT)
totals={};stages={}
for r in train:
    k=(r['parent'],stage(r['turn']));totals[k]=totals.get(k,0)+r['weight'];stages.setdefault(r['parent'],set()).add(stage(r['turn']))
weights=torch.tensor([r['weight']/totals[(r['parent'],stage(r['turn']))]/len(stages[r['parent']]) for r in train],dtype=DT);weights*=len(weights)/weights.sum()
v=stage4Residual.ResidualValue(model['valueWeights']);opt=torch.optim.AdamW(v.parameters(),lr=3e-4,weight_decay=1e-3)
history=[];best=math.inf;stale=0;bestw=None
for epoch in range(1,31):
    order=list(range(len(train)));random.Random(2026101905+epoch).shuffle(order)
    for startIndex in range(0,len(order),256):
        idx=order[startIndex:startIndex+256];opt.zero_grad();pred=v(x[idx]);loss=(((pred-y[idx])**2)*weights[idx]).sum()/weights[idx].sum();loss.backward();torch.nn.utils.clip_grad_norm_(v.parameters(),1.);opt.step()
    with torch.no_grad():prediction=v(dx).tolist()
    metrics=value_metrics(dev,prediction);score=float(np.mean([metrics[k]['mse'] for k in ['opening','middle','late']]))
    history.append(dict(epoch=epoch,metrics=metrics,seconds=time.perf_counter()-start));save(f'{mode}-value-history.json',history);save(f'{mode}-value-epoch-{epoch}.json',v.flat.detach().tolist())
    if score<best-1e-5:best=score;stale=0;bestw=v.flat.detach().tolist()
    else:stale+=1
    if epoch>=12 and stale>=6:break
    print(json.dumps(dict(epoch=epoch,meanPhaseMse=score)),flush=True)
v=stage4Residual.ResidualValue(bestw)
with torch.no_grad():hidden,skip,o=v.features(x);dh,dskip,_=v.features(dx);design=torch.cat([hidden,torch.ones(len(x),1,dtype=DT),skip],1);ddesign=torch.cat([dh,torch.ones(len(dx),1,dtype=DT),dskip],1)
candidates=[]
# 预先固定8种输出校准，只按开发分阶段MSE选择，不消费实战胜负。
for objective in ['mse','bce']:
    for reg in [.0001,.001,.01,.1]:
        origin=torch.tensor(bestw[o:o+71],dtype=DT);theta=nn.Parameter(origin.clone());optimizer=torch.optim.LBFGS([theta],max_iter=120,line_search_fn='strong_wolfe')
        def closure():
            optimizer.zero_grad();z=design@theta;error=(torch.tanh(z)-y)**2 if objective=='mse' else F.softplus(-2*y*z)
            loss=(error*weights).sum()/weights.sum()+reg*(theta[:65]**2).sum()+1e-3*((theta[65:]-origin[65:])**2).sum();loss.backward();return loss
        optimizer.step(closure)
        with torch.no_grad():pred=torch.tanh(ddesign@theta).tolist()
        m=value_metrics(dev,pred);score=float(np.mean([m[k]['mse'] for k in ['opening','middle','late']]))
        w=bestw[:o]+theta.detach().tolist();candidates.append((score,dict(objective=objective,regularization=reg,metrics=m),w));save(f'{mode}-value-calibrated-{len(candidates)}.json',w)
constant=float((y*weights).sum()/weights.sum());baselines={'constant':value_metrics(dev,[constant]*len(dev)),'army_static':value_metrics(dev,[math.tanh(r['x'][-1]) for r in dev])}
phaseConstants={k:float((y[[i for i,r in enumerate(train) if stage(r['turn'])==k]]*weights[[i for i,r in enumerate(train) if stage(r['turn'])==k]]).sum()/weights[[i for i,r in enumerate(train) if stage(r['turn'])==k]].sum()) for k in range(3)}
baselines['phase_constant']=value_metrics(dev,[phaseConstants[stage(r['turn'])] for r in dev])
def staticFeatures(r):
    a=r['x'];return [1.,a[260]-a[274],a[262]-a[276],a[261]-a[275],a[265]-a[279]]
baselines['static']=value_metrics(dev,[math.tanh(staticFeatures(r)[1]*.25+staticFeatures(r)[2]*2+staticFeatures(r)[4]) for r in dev])
sx=torch.tensor([staticFeatures(r) for r in train],dtype=DT);sd=torch.tensor([staticFeatures(r) for r in dev],dtype=DT);staticCoef=nn.Parameter(torch.zeros(5,dtype=DT));staticFit=torch.optim.LBFGS([staticCoef],max_iter=100,line_search_fn='strong_wolfe')
def staticClosure():
    staticFit.zero_grad();loss=(((torch.tanh(sx@staticCoef)-y)**2)*weights).sum()/weights.sum()+1e-3*(staticCoef[1:]**2).sum();loss.backward();return loss
staticFit.step(staticClosure)
with torch.no_grad():staticPred=torch.tanh(sd@staticCoef).tolist()
baselines['fitted_static']=value_metrics(dev,staticPred)
coef=nn.Parameter(torch.tensor([0.,1.],dtype=DT));fit=torch.optim.LBFGS([coef],max_iter=100,line_search_fn='strong_wolfe');army=torch.stack([torch.ones(len(x),dtype=DT),x[:,-1]],1)
def closure():
    fit.zero_grad();loss=(((torch.tanh(army@coef)-y)**2)*weights).sum()/weights.sum()+1e-3*coef[1]**2;loss.backward();return loss
fit.step(closure)
with torch.no_grad():pred=torch.tanh(torch.stack([torch.ones(len(dx),dtype=DT),dx[:,-1]],1)@coef).tolist()
baselines['fitted_army']=value_metrics(dev,pred)
def qualifies(record):
    metrics=record['metrics'];return all(metrics[k]['rocAuc'] is not None and metrics[k]['rocAuc']>=(.9 if k=='opening' else .98) and all(metrics[k]['brier']<b[k]['brier'] for b in baselines.values()) for k in ['opening','middle','late'])
qualified=[r for r in candidates if qualifies(r[1])];score,selection,w=min(qualified or candidates,key=lambda v:v[0]);passed=bool(qualified);metrics=selection['metrics'];model['valueWeights']=w;save(f'{mode}-model.json',model)
save(f'{mode}-value-evaluation.json',dict(passed=passed,metrics=metrics,baselines=baselines,baselineCoefficients=dict(constant=constant,phaseConstants=phaseConstants,static=staticCoef.detach().tolist(),army=coef.detach().tolist()),selection=selection,candidates=[r[1] for r in candidates],trainRows=len(train),devRows=len(dev),trainParents=len({r['parent'] for r in train}),devParents=len({r['parent'] for r in dev}),inputDimension=297,parentStageBalanced=True,seconds=time.perf_counter()-start))
print(json.dumps(dict(passed=bool(passed),metrics=metrics)),flush=True)
