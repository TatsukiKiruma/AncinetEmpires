"""保留首版Value失败，追加权威军力输入，继续冻结策略骨干。"""
from train import *

def initialize_army():
    assert not (HERE/'value-army-initial-model.json').exists()
    old=read(HERE/'value-best-before-army.json');weights=old[:284*64]+[0.]*64+old[284*64:]
    model=read(HERE/'policy-final.json');model.update(valueWeights=weights,valueArmyFeature=True,valueFrozen=False,valueInputDimension=285)
    save('value-army-initial-model.json',model)
    save('value-army-protocol.json',dict(reason='初版中后期未优于拟合权威军力基线，加入同一军力标量；门禁不变',input=285,hidden=64,maxEpochs=40,minEpochs=16,patience=8,learningRate=3e-4,weightDecay=1e-3,warmStart='首版最佳Value新增军力输入行初始化为零',selection='优先全阶段通过原六基线门禁，再按三阶段MSE均值；仅开发选择，无实战结果',preregistered=False,policySha256=hashlib.sha256((HERE/'policy-final.json').read_bytes()).hexdigest(),contextsSha256=hashlib.sha256((HERE/'value-contexts.pkl').read_bytes()).hexdigest(),armySource='公共calculateArmyValue差值/1024，与原军力基线同源'))

def train_army():
    assert read(HERE/'numeric-army-initial.json')['passed'] and read(HERE/'browser-army-initial.json')['passed']
    protocol=read(HERE/'value-army-protocol.json');assert hashlib.sha256((HERE/'value-contexts.pkl').read_bytes()).hexdigest()==protocol['contextsSha256']
    with (HERE/'value-contexts.pkl').open('rb') as f:data=pickle.load(f)
    train,dev=data['train'],data['dev'];model=read(HERE/'value-army-initial-model.json');baseline=read(HERE/'value-evaluation-before-army.json')
    save('value-data-counts.json',dict(trainRows=len(train),devRows=len(dev),trainParents=len(set(r['parent'] for r in train)),devParents=len(set(r['parent'] for r in dev))))
    x=torch.tensor([r['x']+[r['army']] for r in train],dtype=DT);y=torch.tensor([r['y'] for r in train],dtype=DT);dx=torch.tensor([r['x']+[r['army']] for r in dev],dtype=DT)
    v=Value(model['valueWeights']);old=Value(read(HERE/'value-best-before-army.json'))
    with torch.no_grad():warmError=float((v(dx[:256])-old(dx[:256,:284])).abs().max())
    assert warmError<1e-12;save('value-army-warmstart-gate.json',dict(passed=True,maxError=warmError,newInputWeightsZero=True))
    totals={};parentStages={}
    for r in train:key=(r['parent'],stage(r['turn']));totals[key]=totals.get(key,0)+r['weight'];parentStages.setdefault(r['parent'],set()).add(stage(r['turn']))
    weights=torch.tensor([r['weight']/totals[(r['parent'],stage(r['turn']))]/len(parentStages[r['parent']]) for r in train],dtype=DT);weights*=len(weights)/weights.sum()
    optimizer=torch.optim.AdamW(v.parameters(),lr=protocol['learningRate'],weight_decay=protocol['weightDecay']);history=[];bestKey=(2,math.inf);bestMean=math.inf;stale=0;startTime=time.perf_counter()
    phases=['opening','middle','late']
    for epoch in range(1,protocol['maxEpochs']+1):
        indexes=list(range(len(train)));random.Random(20261018+epoch).shuffle(indexes)
        for start in range(0,len(indexes),256):
            idx=indexes[start:start+256];optimizer.zero_grad();pred=v(x[idx]);loss=((pred-y[idx])**2*weights[idx]).sum()/weights[idx].sum();loss.backward();torch.nn.utils.clip_grad_norm_(v.parameters(),1.);optimizer.step()
        with torch.no_grad():prediction=v(dx).tolist()
        metrics=value_metrics(dev,prediction);score=float(np.mean([metrics[k]['mse'] for k in phases]));passed=all(metrics[k]['rows'] and all(metrics[k]['mse']<b[k]['mse'] for b in baseline['baselines'].values()) for k in phases)
        record=dict(epoch=epoch,metrics=metrics,passed=bool(passed),seconds=time.perf_counter()-startTime);history.append(record);save('value-history.json',history);save(f'value-army-epoch-{epoch}.json',v.flat.detach().tolist())
        key=(0 if passed else 1,score)
        if key<bestKey:bestKey=key;save('value-best.json',v.flat.detach().tolist());save('value-army-best-selection.json',dict(epoch=epoch,passed=bool(passed),meanPhaseMse=score))
        if score<bestMean-1e-5:bestMean=score;stale=0
        else:stale+=1
        if epoch>=protocol['minEpochs'] and stale>=protocol['patience']:break
    value=Value(read(HERE/'value-best.json'))
    with torch.no_grad():prediction=value(dx).tolist()
    metrics=value_metrics(dev,prediction);passed=all(metrics[k]['rows'] and all(metrics[k]['mse']<b[k]['mse'] for b in baseline['baselines'].values()) for k in phases)
    result=dict(baseline,passed=bool(passed),metrics=metrics,epochs=epoch,inputDimension=285,armyFeature=True,parentStageBalanced=True,baselineReuse='同一value-contexts.pkl与相同权重，复用首版六基线拟合结果，原报告完整保留',seconds=time.perf_counter()-startTime,selection=read(HERE/'value-army-best-selection.json'))
    save('value-evaluation.json',result);model['valueWeights']=read(HERE/'value-best.json');assert model['weights']==read(HERE/'policy-final.json')['weights'];save('model-final.json',model)
    print(json.dumps(dict(passed=bool(passed),metrics=metrics,epochs=epoch),ensure_ascii=False),flush=True)

if __name__=='__main__':
    if sys.argv[1]=='initialize':initialize_army()
    elif sys.argv[1]=='train':train_army()
