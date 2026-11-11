"""使用已训练神经基底和可学习军力跳连做独立Value校准，原门禁不变。"""
from train import *
from residual_value import ResidualValue

def initialize_residual():
    assert not (HERE/'value-residual-initial-model.json').exists()
    previous=read(HERE/'value-evaluation-before-residual.json');alpha,bias=previous['armyCoefficients'];w=read(HERE/'value-best-before-residual.json');w[-65:]=[0.]*65;w+= [alpha]*3+[bias]*3
    model=read(HERE/'policy-final.json');model.update(valueWeights=w,valueArmyFeature=True,valueArmyResidual=True,valueFrozen=False,valueInputDimension=285)
    save('value-residual-initial-model.json',model)
    save('value-residual-protocol.json',dict(reason='前两版Value及输出温度未过中盘强基线，增加六个可学习阶段军力跳连参数',inputDimension=285,hidden=64,skipParameters=6,objectives=['mse','bce'],regularization=[.0001,.001,.01,.1],bases=['head2-best','head2-epoch4-8-mean'],optimizer='训练分区L-BFGS，固定已训练首层和LayerNorm基底，拟合输出与跳连',selection='保持六基线分阶段门禁，合格候选中开发三阶段MSE均值最低',preregistered=False,usesBattleResults=False,contextsSha256=hashlib.sha256((HERE/'value-contexts.pkl').read_bytes()).hexdigest()))

def train_residual():
    assert read(HERE/'numeric-residual-initial.json')['passed'] and read(HERE/'browser-residual-initial.json')['passed']
    protocol=read(HERE/'value-residual-protocol.json');assert hashlib.sha256((HERE/'value-contexts.pkl').read_bytes()).hexdigest()==protocol['contextsSha256']
    with (HERE/'value-contexts.pkl').open('rb') as f:data=pickle.load(f)
    train,dev=data['train'],data['dev'];x=torch.tensor([r['x']+[r['army']] for r in train],dtype=DT);dx=torch.tensor([r['x']+[r['army']] for r in dev],dtype=DT);y=torch.tensor([r['y'] for r in train],dtype=DT)
    totals={};ps={}
    for r in train:key=(r['parent'],stage(r['turn']));totals[key]=totals.get(key,0)+r['weight'];ps.setdefault(r['parent'],set()).add(stage(r['turn']))
    weights=torch.tensor([r['weight']/totals[(r['parent'],stage(r['turn']))]/len(ps[r['parent']]) for r in train],dtype=DT);weights/=weights.sum()
    original=read(HERE/'value-evaluation-before-residual.json');initial=read(HERE/'value-residual-initial-model.json');bases=[np.array(read(HERE/'value-best-before-residual.json')),np.mean([read(HERE/f'value-army-epoch-{i}.json') for i in range(4,9)],axis=0)];records=[];qualified=[];fallback=[]
    for basis,raw in zip(protocol['bases'],bases):
        w=raw.tolist();w[-65:]=initial['valueWeights'][-71:-6];w+=initial['valueWeights'][-6:];network=ResidualValue(w)
        with torch.no_grad():h,skip,o=network.features(x);dh,dskip,_=network.features(dx);design=torch.cat([h,torch.ones(len(x),1,dtype=DT),skip],1);ddesign=torch.cat([dh,torch.ones(len(dx),1,dtype=DT),dskip],1)
        origin=torch.tensor(w[o:o+71],dtype=DT)
        for objective in protocol['objectives']:
            for reg in protocol['regularization']:
                theta=nn.Parameter(origin.clone());optimizer=torch.optim.LBFGS([theta],max_iter=150,tolerance_grad=1e-9,tolerance_change=1e-12,line_search_fn='strong_wolfe');calls=0
                def closure():
                    nonlocal calls
                    optimizer.zero_grad();z=design@theta
                    errors=(torch.tanh(z)-y)**2 if objective=='mse' else F.softplus(-2*y*z)
                    loss=(errors*weights).sum()+reg*(theta[:65]**2).sum()+1e-3*((theta[65:]-origin[65:])**2).sum();loss.backward();calls+=1;return loss
                optimizer.step(closure);final=raw[:o].tolist()+theta.detach().tolist();value=ResidualValue(final)
                with torch.no_grad():prediction=value(dx).tolist();cached=torch.tanh(ddesign@theta).tolist()
                assert max(abs(a-b) for a,b in zip(prediction,cached))<1e-12
                metrics=value_metrics(dev,prediction);passed=all(all(metrics[k]['mse']<b[k]['mse'] for b in original['baselines'].values()) for k in ['opening','middle','late']);score=float(np.mean([metrics[k]['mse'] for k in ['opening','middle','late']]))
                record=dict(epoch=len(records)+1,basis=basis,objective=objective,regularization=reg,closureCalls=calls,metrics=metrics,passed=bool(passed),meanPhaseMse=score,skipCoefficients=theta.detach().tolist()[-6:]);records.append(record)
                save(f'value-residual-candidate-{len(records)}.json',final);save('value-residual-candidates.json',records)
                fallback.append((score,record,final))
                if passed:qualified.append((score,record,final))
    score,record,w=min(qualified or fallback,key=lambda v:v[0]);passed=bool(qualified);model=initial;model['valueWeights']=w;assert model['weights']==read(HERE/'policy-final.json')['weights']
    save('value-best.json',w);save('model-final.json',model);save('value-history.json',records)
    save('value-evaluation.json',dict(original,passed=passed,metrics=record['metrics'],armyFeature=True,residualArmy=True,selection=record,residualProtocol=protocol,frozenTrainedBasis=True,baselineReuse='同一原始可信value上下文与父局/阶段权重，六基线及首版报告保留'))
    print(json.dumps(dict(passed=passed,selected=record),ensure_ascii=False),flush=True)

if __name__=='__main__':
    if sys.argv[1]=='initialize':initialize_residual()
    elif sys.argv[1]=='train':train_residual()
