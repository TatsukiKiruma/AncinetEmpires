"""在训练分区拟合输出温度与偏置，折叠到原MLP输出层，不改前向结构。"""
from train import *

assert not (HERE/'battle-plan.json').exists()
with (HERE/'value-contexts.pkl').open('rb') as f:data=pickle.load(f)
train,dev=data['train'],data['dev'];x=torch.tensor([r['x']+[r['army']] for r in train],dtype=DT);dx=torch.tensor([r['x']+[r['army']] for r in dev],dtype=DT);y=torch.tensor([r['y'] for r in train],dtype=DT)
totals={};ps={}
for r in train:key=(r['parent'],stage(r['turn']));totals[key]=totals.get(key,0)+r['weight'];ps.setdefault(r['parent'],set()).add(stage(r['turn']))
weights=torch.tensor([r['weight']/totals[(r['parent'],stage(r['turn']))]/len(ps[r['parent']]) for r in train],dtype=DT);weights/=weights.sum()
original=read(HERE/'value-evaluation.json');phases=['opening','middle','late'];candidates=[];qualified=[]
heads=[(f'epoch-{r["epoch"]}',np.array(read(HERE/f'value-army-epoch-{r["epoch"]}.json'))) for r in read(HERE/'value-history.json')]
for start,end in [(4,8),(8,16)]:heads.append((f'average-{start}-{end}',np.mean([w for name,w in heads if name.startswith('epoch-') and start<=int(name.split('-')[1])<=end],axis=0)))
def logits(a,w):
    d=a.shape[1];b=d*64;n=b+64;o=n+128
    z=a@w[:b].reshape(d,64)+w[b:n];h=torch.relu(F.layer_norm(z,(64,),w[n:n+64],w[n+64:o],1e-5));return h@w[o:o+64]+w[o+64]
for name,raw in heads:
    w=torch.tensor(raw,dtype=DT)
    with torch.no_grad():z=logits(x,w)
    params=nn.Parameter(torch.zeros(2,dtype=DT));optimizer=torch.optim.LBFGS([params],max_iter=100,tolerance_grad=1e-9,line_search_fn='strong_wolfe')
    def closure():
        optimizer.zero_grad();alpha=params[0].exp();pred=torch.tanh(z*alpha+params[1]);loss=(((pred-y)**2)*weights).sum()+1e-3*((alpha-1)**2+params[1]**2);loss.backward();return loss
    optimizer.step(closure);alpha=float(params[0].detach().exp());bias=float(params[1].detach());w[-65:-1]*=alpha;w[-1]=w[-1]*alpha+bias
    with torch.no_grad():pred=Value(w.tolist())(dx).tolist()
    metrics=value_metrics(dev,pred);passed=all(all(metrics[k]['mse']<b[k]['mse'] for b in original['baselines'].values()) for k in phases);record=dict(name=name,alpha=alpha,bias=bias,metrics=metrics,passed=bool(passed));candidates.append(record);save(f'value-output-calibrated-{name}.json',w.tolist())
    if passed:qualified.append((np.mean([metrics[k]['mse'] for k in phases]),record,w.tolist()))
    save('value-output-calibration-candidates.json',candidates)
selected=min(qualified,key=lambda v:v[0]) if qualified else None
save('value-output-calibration-result.json',dict(passed=selected is not None,selection=selected[1] if selected else None,trainingOnlyFit=True,foldedIntoExistingOutputLayer=True,usesBattleResults=False))
if selected:
    for n in ['value-best.json','value-evaluation.json','model-final.json']:
        target=HERE/(Path(n).stem+'-before-output-calibration'+Path(n).suffix);assert not target.exists();target.write_bytes((HERE/n).read_bytes())
    score,record,w=selected;save('value-best.json',w);save('value-evaluation.json',dict(original,passed=True,metrics=record['metrics'],outputCalibration=record));model=read(HERE/'model-final.json');model['valueWeights']=w;save('model-final.json',model)
print(json.dumps(dict(passed=selected is not None,selected=selected[1] if selected else None),ensure_ascii=False),flush=True)
