"""冻结Policy，只按事先登记的原开发与辅助留出规则微调Value。"""
from train import *
from pathlib import Path
import pickle,json,hashlib,time,random,math,copy
protocol=read(HERE/'value-continuation-protocol.json');pack=read(HERE/'value-continuation-pack-gate.json');assert pack['passed']
model=read(HERE/'teacher-model.json');oldEvaluation=read(HERE/'teacher-value-evaluation.json');sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();assert sha(HERE/'teacher-model.json')==protocol['sourceModelSha256']
assert model['weights']==read(HERE/'initial.json')['weights'],'旧Value上下文只可用于完全相同的冻结策略编码器'
with (HERE/'teacher-value-contexts.pkl').open('rb') as f:original=pickle.load(f)
with (HERE/'value-continuations.pkl').open('rb') as f:extra=pickle.load(f)
assert sha(HERE/'value-continuations.pkl')==pack['dataSha256']
oldTrain=original['train'];dev=original['validation'];newTrain=[];aux=[]
for r in extra['rows']:
    out=dict(x=r['x'],y=r['valueTarget'],weight=1.,parent=r['parent'],turn=r['turn'])
    (newTrain if r['valueSplit']=='train' else aux).append(out)
assert oldTrain and newTrain and aux
assert not {r['parent'] for r in aux}&{r['parent'] for r in oldTrain+newTrain}
folder=HERE/'value-continuation-fit';folder.mkdir(exist_ok=False);start=time.perf_counter();torch.manual_seed(2026101920)
def put(n,v):
    with (folder/n).open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,allow_nan=False)
def tensors(rows):
    totals={};stages={}
    for r in rows:
        key=(r['parent'],stage(r['turn']));totals[key]=totals.get(key,0)+r['weight'];stages.setdefault(r['parent'],set()).add(stage(r['turn']))
    w=torch.tensor([r['weight']/totals[(r['parent'],stage(r['turn']))]/len(stages[r['parent']]) for r in rows],dtype=DT);w*=len(w)/w.sum()
    return torch.tensor([r['x'] for r in rows],dtype=DT),torch.tensor([r['y'] for r in rows],dtype=DT),w
ox,oy,ow=tensors(oldTrain);nx,ny,nw=tensors(newTrain);dx=torch.tensor([r['x'] for r in dev],dtype=DT);ax=torch.tensor([r['x'] for r in aux],dtype=DT)
v=stage4Residual.ResidualValue(model['valueWeights'])
def metrics(net):
    with torch.no_grad():dp=net(dx).tolist();ap=net(ax).tolist()
    return value_metrics(dev,dp),value_metrics(aux,ap)
baseDev,baseAux=metrics(v);phases=['opening','middle','late'];available=[k for k in phases if baseAux[k]['rows']>0]
assert available
def assess(dm,am):
    retain=all(dm[k]['rocAuc'] is not None and dm[k]['rocAuc']>=(.9 if k=='opening' else .98) and dm[k]['rocAuc']>=baseDev[k]['rocAuc']-protocol['selection']['originalPhaseAucMaximumDrop'] and dm[k]['brier']<=baseDev[k]['brier']*protocol['selection']['originalPhaseBrierUpperRatio'] and all(dm[k]['brier']<b[k]['brier'] for b in oldEvaluation['baselines'].values()) for k in phases)
    score=.5*sum(dm[k]['brier']/baseDev[k]['brier'] for k in phases)/3+.5*sum(am[k]['brier']/max(.005,baseAux[k]['brier']) for k in available)/len(available)
    return retain,score
ok,baselineScore=assess(baseDev,baseAux);assert ok
records=[dict(kind='original',passed=True,score=baselineScore,metrics=baseDev,auxMetrics=baseAux)];weights=[list(model['valueWeights'])]
bestRaw=list(model['valueWeights']);bestScore=baselineScore;stale=0;cfg=protocol['fit'];opt=torch.optim.AdamW(v.parameters(),lr=cfg['learningRate'],weight_decay=cfg['weightDecay'])
for epoch in range(1,cfg['maxEpochs']+1):
    oldOrder=list(range(len(oldTrain)));newOrder=list(range(len(newTrain)));rng=random.Random(2026101920+epoch);rng.shuffle(oldOrder);rng.shuffle(newOrder);size=cfg['batchSizePerDomain'];seenOld=set();seenNew=set()
    for step,startIndex in enumerate(range(0,len(oldOrder),size)):
        oi=oldOrder[startIndex:startIndex+size];ni=[newOrder[(step*size+j)%len(newOrder)] for j in range(size)];seenOld.update(oi);seenNew.update(ni);opt.zero_grad()
        ol=(((v(ox[oi])-oy[oi])**2)*ow[oi]).sum()/ow[oi].sum();nl=(((v(nx[ni])-ny[ni])**2)*nw[ni]).sum()/nw[ni].sum();loss=cfg['originalLossWeight']*ol+cfg['newContinuationLossWeight']*nl;loss.backward();torch.nn.utils.clip_grad_norm_(v.parameters(),cfg['gradientClip']);opt.step()
    assert len(seenOld)==len(oldTrain) and len(seenNew)==len(newTrain)
    dm,am=metrics(v);passed,score=assess(dm,am);w=v.flat.detach().tolist();record=dict(kind='epoch',epoch=epoch,passed=passed,score=score,metrics=dm,auxMetrics=am,seenOriginalRows=len(seenOld),seenContinuationRows=len(seenNew),seconds=time.perf_counter()-start);records.append(record);weights.append(w);put(f'epoch-{epoch}.json',dict(record=record,weights=w))
    if passed and score<bestScore-1e-5:bestScore=score;bestRaw=w;stale=0
    else:stale+=1
    print(json.dumps(dict(epoch=epoch,passed=passed,score=score,baselineScore=baselineScore)),flush=True)
    if epoch>=cfg['minEpochs'] and stale>=cfg['patience']:break
v=stage4Residual.ResidualValue(bestRaw);x=torch.cat([ox,nx]);y=torch.cat([oy,ny]);mix=torch.cat([ow/ow.sum()*cfg['originalLossWeight'],nw/nw.sum()*cfg['newContinuationLossWeight']])
with torch.no_grad():hidden,skip,o=v.features(x);dh,dskip,_=v.features(dx);ah,askip,_=v.features(ax);design=torch.cat([hidden,torch.ones(len(x),1,dtype=DT),skip],1);ddesign=torch.cat([dh,torch.ones(len(dx),1,dtype=DT),dskip],1);adesign=torch.cat([ah,torch.ones(len(ax),1,dtype=DT),askip],1)
for objective in cfg['calibrationObjectives']:
    for reg in cfg['calibrationL2']:
        origin=torch.tensor(bestRaw[o:o+71],dtype=DT);theta=nn.Parameter(origin.clone());optimizer=torch.optim.LBFGS([theta],max_iter=120,line_search_fn='strong_wolfe')
        def closure():
            optimizer.zero_grad();z=design@theta;error=(torch.tanh(z)-y)**2 if objective=='mse' else F.softplus(-2*y*z);loss=(error*mix).sum()+reg*(theta[:65]**2).sum()+1e-3*((theta[65:]-origin[65:])**2).sum();loss.backward();return loss
        optimizer.step(closure)
        with torch.no_grad():dm=value_metrics(dev,torch.tanh(ddesign@theta).tolist());am=value_metrics(aux,torch.tanh(adesign@theta).tolist())
        passed,score=assess(dm,am);w=bestRaw[:o]+theta.detach().tolist();record=dict(kind='calibration',objective=objective,regularization=reg,passed=passed,score=score,metrics=dm,auxMetrics=am);records.append(record);weights.append(w);put(f'calibration-{objective}-{reg}.json',dict(record=record,weights=w))
admitted=[i for i,r in enumerate(records) if r['passed']];best=min(admitted,key=lambda i:records[i]['score']);chosen=records[best];out=copy.deepcopy(model);out['valueWeights']=weights[best];assert out['weights']==model['weights'] and out['schema']==model['schema']
put('selected-model.json',out);evaluation=dict(passed=True,improvedSelectionScore=chosen['score']<baselineScore-1e-6,selectedOriginal=best==0,selection=chosen,baseline=records[0],metrics=chosen['metrics'],auxMetrics=chosen['auxMetrics'],baselines=oldEvaluation['baselines'],candidates=records,originalTrainRows=len(oldTrain),continuationTrainRows=len(newTrain),originalDevRows=len(dev),auxValidationRows=len(aux),auxAvailablePhases=available,policyFrozen=True,originalDevParentOverlap=0,inputDimension=297,protocolSha256=sha(HERE/'value-continuation-protocol.json'),dataSha256=sha(HERE/'value-continuations.pkl'),parentStageBalanced=True,selectedModelSha256=sha(folder/'selected-model.json'),seconds=time.perf_counter()-start)
evaluation.update(fitterSha256=sha(Path(__file__)),trainingModuleSha256=sha(HERE/'train.py'),residualModuleSha256=sha(HERE.parent/'tactical_value_search_20261018/residual_value.py'),packerSha256=pack['packerSha256'],torchVersion=str(torch.__version__),numpyVersion=str(np.__version__),torchThreads=torch.get_num_threads(),device=str(ox.device),dtype=str(ox.dtype))
put('evaluation.json',evaluation);print(json.dumps(dict(passed=True,selectedOriginal=best==0,improvedSelectionScore=evaluation['improvedSelectionScore'],selection={k:chosen[k] for k in ['kind','score']},metrics=chosen['metrics'],auxMetrics=chosen['auxMetrics']),ensure_ascii=False),flush=True)
