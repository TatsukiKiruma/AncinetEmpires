"""PC策略扩量、五类校准与独立价值头训练。"""
import os
os.environ.setdefault('OMP_NUM_THREADS','4');os.environ.setdefault('MKL_NUM_THREADS','4')
from pathlib import Path
import json,math,sys,time,hashlib,importlib.util,random,pickle
sys.dont_write_bytecode=True
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
HERE=Path(__file__).resolve().parent;OLD=HERE.parent/'tactical_scale_20261018';DT=torch.float64
spec=importlib.util.spec_from_file_location('stage3',OLD/'group_train.py');stage3=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage3)
base=stage3.base;layout=stage3.layout;read=base.read;torch.set_num_threads(4)
TYPES=['wait','end_turn','attack','recruit','capture']
def save(n,v):
    p=HERE/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,allow_nan=False),encoding='utf-8')
def gtype(name):
    t=name.split('|')[1];return 'recruit' if t.startswith('recruit_') else t
def collate(rows,s,winning=False):
    b=stage3.collate(rows,s);names=[list(dict.fromkeys(r['actionGroups'])) for r in rows]
    types=torch.zeros(len(rows),b['group_sizes'].shape[1],5,dtype=DT)
    for j,ns in enumerate(names):
        for k,n in enumerate(ns):
            if gtype(n) in TYPES:types[j,k,TYPES.index(gtype(n))]=1
    b['group_types']=types
    if winning:b['weight']*=torch.tensor([1.5 if r.get('valueMask') and r.get('valueTarget')==1 else 1. for r in rows],dtype=DT)
    return b
def batches(files,s,epoch=0,training=False):
    buf=[]
    for r in base.rows_for(files,epoch,training):
        buf.append(r)
        if len(buf)==32:yield buf,collate(buf,s,training);buf=[]
    if buf:yield buf,collate(buf,s,training)
class Policy(nn.Module):
    def __init__(self,s,w):
        super().__init__();self.s=s;self.o=layout(s)
        self.flat=nn.Parameter(torch.tensor(w,dtype=DT))
        self.type_bias=nn.Parameter(torch.tensor(s.get('groupTypeBias',[0.]*5),dtype=DT))
    def forward(self,b):
        o,w,h=self.o,self.flat,self.o['h'];a=b['tokens'];c=b['candidates']
        e=torch.relu(a@w[:o['eb']].reshape(o['f'],h)+w[o['eb']:o['pw']])*b['token_mask'].unsqueeze(-1)
        pooled=torch.zeros(a.shape[0],4,h,dtype=DT);pooled.scatter_add_(1,b['groups'].unsqueeze(-1).expand(-1,-1,h),e)
        counts=torch.zeros(a.shape[0],4,dtype=DT);counts.scatter_add_(1,b['groups'],b['token_mask'].to(DT))
        ctx=torch.cat([(pooled/counts.clamp_min(1).unsqueeze(-1)).flatten(1),counts/1024],1)
        extended=torch.cat([e,torch.zeros(a.shape[0],1,h,dtype=DT)],1);refs=b['refs'].clone();refs[refs<0]=e.shape[1]
        gathered=extended.gather(1,refs.flatten(1).unsqueeze(-1).expand(-1,-1,h)).reshape(a.shape[0],c.shape[1],3*h)
        inputs=torch.cat([ctx.unsqueeze(1).expand(-1,c.shape[1],-1),gathered,c],2)
        first=torch.relu(inputs@w[o['pw']:o['pb']].reshape(o['d'],h)+w[o['pb']:o['w2']])
        def block(x,start,bias,norm):
            z=x@w[start:start+h*h].reshape(h,h)+w[bias:bias+h]
            return torch.relu(x+F.layer_norm(z,(h,),w[norm:norm+h],w[norm+h:norm+2*h],1e-5))
        second=block(first,o['w2'],o['b2'],o['n2']);third=block(second,o['w3'],o['b3'],o['n3'])
        logits=(third@w[o['ow']:o['ob']]+w[o['ob']]).masked_fill(~b['mask'],-torch.inf)
        evidence=(third@w[o['gw']:o['gb']])*b['mask']
        group=torch.zeros(a.shape[0],b['group_sizes'].shape[1],dtype=DT)
        group.scatter_add_(1,b['group_ids'],evidence)
        group=(group/b['group_sizes'].clamp_min(1)+w[o['gb']]).masked_fill(b['group_sizes']==0,-torch.inf)
        group=group+(b['group_types']@self.type_bias)
        # 冻结价值头沿用旧身份，不参与决策和优化。
        value=torch.tanh(ctx@w[o['vw']:o['vw']+o['k']].detach()+w[o['vw']+o['k']].detach())
        return logits,group,ctx


def make_policy(s,w):
    # 运行时导入避免复制历史全局输出路径；模块只含扩展的网络定义。
    return Policy(s,w)
def export(p,s,epoch=0):return dict(schema=dict(s,groupTypeBias=p.type_bias.detach().tolist()),weights=p.flat.detach().tolist(),epoch=epoch,arm='stage4',valueFrozen=True)
def initialize():
    old=read(OLD/'group-best.json');s=dict(old['schema']);s.pop('groupWaitBias',None);s.pop('waitTargetWeight',None)
    s.update(version='sd-value-search-v4',groupTypeBias=[old['schema'].get('groupWaitBias',0),0,0,0,0]);s['candidate']={'keys':s['candidate']['keys']+['tactic_v4.'+n for n in ['actor_focus_damage','actor_focus_lethal','actor_relaxed_top3_damage','actor_focus_attackers','commander_focus_damage','commander_focus_lethal','commander_relaxed_top3_damage','focus_known','can_still_recruit','has_free_attack']]}
    oldo=layout(old['schema']);o=layout(s);w=np.zeros(o['count']);prior=np.array(old['weights'])
    w[:o['pw']]=prior[:oldo['pw']]
    w[o['pw']:o['pb']].reshape(o['d'],64)[:oldo['d']]=prior[oldo['pw']:oldo['pb']].reshape(oldo['d'],64)
    w[o['pb']:]=prior[oldo['pb']:]
    save('schema.json',s);save('initial.json',dict(schema=s,weights=w.tolist(),epoch=0,arm='stage4'))
    torch.manual_seed(2026101804);d=284;h=64;l=d*h+4*h+1
    v=torch.zeros(l,dtype=DT);v[:d*h].normal_(0,math.sqrt(2/d));v[d*h+h:d*h+2*h]=1;v[-65:-1].normal_(0,1/math.sqrt(h))
    save('value-initial.json',v.tolist())
def evaluate(p,files,s):
    original_batches=stage3.batches;stage3.batches=lambda files,s: batches(files,s)
    result=stage3.evaluate(p,files,s);stage3.batches=original_batches;return result
def train_policy():
    assert read(HERE/'numeric-initial.json')['passed'] and read(HERE/'browser-initial.json')['passed']
    c=read(HERE/'contract.json');s=read(HERE/'schema.json');initial=read(HERE/'initial.json');assert not (HERE/'policy-best.json').exists()
    digest=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
    assert digest(OLD/'group-best.json')==read(HERE/'preregister.json')['policyWarmStart']
    numerical=read(HERE/'numeric-model-initial.json');assert initial['weights']==numerical['weights'] and initial['schema']==numerical['schema']==s
    for name,expected in read(HERE/'browser-initial.json')['fileSha256'].items():assert digest(HERE/name)==expected,name
    for name,expected in c['sourceBinding'].items():assert digest(HERE/name)==expected,name
    for entry in c['files']:assert digest(entry['packedPath'])==entry['packedSha256'],entry['parent']
    save('policy-source-binding.json',{name:digest(HERE/name) for name in ['train.py','group_model.ts','features.ts','focus_threat.ts','prepare.ts','pack.py','parity.py','numeric.ts']})
    save('seed-contract.json',dict(parentSelection='stage4-20261018前缀的父局SHA排序与分层补足',policyWarmStartSha256=digest(OLD/'group-best.json'),policyParentOrder='SHA256(20261018:epoch:parent)',valueInitialization=2026101804,valueEpochShuffle='Random(20261018+epoch)',opponentSeeds='battle-plan.json逐槽冻结',deterministicInference=True))
    train=[f for f in c['files'] if f['split']=='train'];dev=[f for f in c['files'] if f['split']=='validation'];p=make_policy(s,initial['weights']);o=p.o
    optimizer=torch.optim.AdamW([p.flat,p.type_bias],lr=3e-4,weight_decay=1e-4);value=p.flat[o['vw']:o['n2']].detach().clone()
    best=math.inf;history=[];steps=0;start=time.perf_counter();stale=0
    for epoch in range(1,5):
        seen=0;total=weight=0.;p.train()
        for rows,b in batches(train,s,epoch,True):
            optimizer.zero_grad();z,g,_=p(b);loss,_=stage3.objective(z,g,b);loss.backward();p.flat.grad[o['vw']:o['n2']]=0
            torch.nn.utils.clip_grad_norm_(p.parameters(),1.);optimizer.step()
            with torch.no_grad():p.flat[o['vw']:o['n2']]=value
            steps+=1;seen+=len(rows);total+=float(loss.detach())*float(b['weight'].sum());weight+=float(b['weight'].sum())
            if steps%25==0:save('training.live.json',dict(epoch=epoch,steps=steps,rows=seen,seconds=time.perf_counter()-start))
        assert seen==c['trainRows'];metrics=evaluate(p,dev,s);record=dict(epoch=epoch,steps=steps,trainLoss=total/weight,dev=metrics,seconds=time.perf_counter()-start);history.append(record);save('policy-history.json',history);print(json.dumps(record),flush=True)
        save(f'policy-epoch-{epoch}.json',export(p,s,epoch));torch.save(dict(weights=p.flat.detach(),biases=p.type_bias.detach(),optimizer=optimizer.state_dict(),epoch=epoch),HERE/f'checkpoint-{epoch}.pt')
        if metrics['loss']<best-1e-5:best=metrics['loss'];stale=0;save('policy-best.json',export(p,s,epoch))
        else:stale+=1
        if stale>=2:break
    save('policy-training.json',dict(steps=steps,epochs=epoch,seconds=time.perf_counter()-start,torch=torch.__version__,python=sys.executable,valueFrozen=True,phoneOperations=0))

class Value(nn.Module):
    def __init__(self,w):super().__init__();self.flat=nn.Parameter(torch.tensor(w,dtype=DT))
    def forward(self,x):
        w=self.flat;d=x.shape[1];b=d*64;n=b+64;o=n+128
        z=x@w[:b].reshape(d,64)+w[b:n];a=torch.relu(F.layer_norm(z,(64,),w[n:n+64],w[n+64:o],1e-5))
        return torch.tanh(a@w[o:o+64]+w[o+64])
def contexts(p,b):
    o,w,h=p.o,p.flat,p.o['h'];a=b['tokens'];e=torch.relu(a@w[:o['eb']].reshape(o['f'],h)+w[o['eb']:o['pw']])*b['token_mask'].unsqueeze(-1)
    pooled=torch.zeros(a.shape[0],4,h,dtype=DT);pooled.scatter_add_(1,b['groups'].unsqueeze(-1).expand(-1,-1,h),e)
    counts=torch.zeros(a.shape[0],4,dtype=DT);counts.scatter_add_(1,b['groups'],b['token_mask'].to(DT))
    return torch.cat([(pooled/counts.clamp_min(1).unsqueeze(-1)).flatten(1),counts/1024],1)
def token_batch(rows,s):
    size=len(rows);length=max(len(r['tokens']) for r in rows);tokens=np.zeros((size,length,len(s['token']['keys'])),dtype=np.float64);groups=np.zeros((size,length),dtype=np.int64);mask=np.zeros((size,length),dtype=bool)
    for j,r in enumerate(rows):
        n=len(r['tokens']);groups[j,:n]=r['groups'];mask[j,:n]=True
        if r.get('_packed'):tokens[j,:n]=r['_token_table'][r['tokens']]
        else:
            for t,items in enumerate(r['tokens']):
                for k,v in items:tokens[j,t,k]=v
    return dict(tokens=torch.from_numpy(tokens),groups=torch.from_numpy(groups),token_mask=torch.from_numpy(mask))
def value_data(model,split):
    s=model['schema'];p=make_policy(s,model['weights']);files=[f for f in read(HERE/'contract.json')['files'] if f['split']==split];out=[]
    army=read(HERE/'army-baseline.json')['armyByAtom']
    def emit(rows):
        context=contexts(p,token_batch(rows,s)).tolist()
        for j,r in enumerate(rows):out.append(dict(x=context[j]+r['valueSummary'],y=r['valueTarget'],parent=r['parent'],turn=r['turn'],weight=r['weight'],army=army[f"{r['parent']}|{r['macro']}|{r['subAction']}"]))
    with torch.no_grad():
        buffer=[]
        for r in base.rows_for(files):
            if not r.get('valueMask'):continue
            buffer.append(r)
            if len(buffer)==64:emit(buffer);buffer=[]
        if buffer:emit(buffer)
    return out
def stage(turn):return 0 if turn<=5 else 1 if turn<=15 else 2
def auc(y,p):
    positives=y>0;np_=int(positives.sum());nn_=len(y)-np_
    if not np_ or not nn_:return None
    order=np.argsort(p,kind='stable');ranks=np.empty(len(p));i=0
    while i<len(order):
        j=i+1
        while j<len(order) and p[order[j]]==p[order[i]]:j+=1
        ranks[order[i:j]]=(i+1+j)/2;i=j
    return float((ranks[positives].sum()-np_*(np_+1)/2)/(np_*nn_))
def value_metrics(rows,pred):
    out={}
    for st,name in [(None,'all'),(0,'opening'),(1,'middle'),(2,'late')]:
        indexes=[i for i,r in enumerate(rows) if st is None or stage(r['turn'])==st]
        if not indexes:out[name]=dict(rows=0,parents=0,available=False);continue
        y=np.array([rows[i]['y'] for i in indexes]);p=np.array([pred[i] for i in indexes]);out[name]=dict(rows=len(y),parents=len(set(rows[i]['parent'] for i in indexes)),mse=float(np.mean((p-y)**2)),brier=float(np.mean(((p+1)/2-(y+1)/2)**2)),signAccuracy=float(np.mean((p>=0)==(y>0))),rocAuc=auc(y,p))
    return out
def train_value():
    model=read(HERE/'policy-final.json');train=value_data(model,'train');dev=value_data(model,'validation');save('value-data-counts.json',dict(trainRows=len(train),devRows=len(dev),trainParents=len(set(r['parent'] for r in train)),devParents=len(set(r['parent'] for r in dev))))
    with (HERE/'value-contexts.pkl').open('xb') as f:pickle.dump(dict(train=train,dev=dev),f,protocol=5)
    x=torch.tensor([r['x'] for r in train],dtype=DT);y=torch.tensor([r['y'] for r in train],dtype=DT);dx=torch.tensor([r['x'] for r in dev],dtype=DT)
    totals={};parentStages={}
    for r in train:key=(r['parent'],stage(r['turn']));totals[key]=totals.get(key,0)+r['weight'];parentStages.setdefault(r['parent'],set()).add(stage(r['turn']))
    weights=torch.tensor([r['weight']/totals[(r['parent'],stage(r['turn']))]/len(parentStages[r['parent']]) for r in train],dtype=DT);weights*=len(weights)/weights.sum()
    v=Value(read(HERE/'value-initial.json'));opt=torch.optim.AdamW(v.parameters(),lr=1e-3,weight_decay=1e-3);best=math.inf;history=[];stale=0
    for epoch in range(1,31):
        indexes=list(range(len(train)));random.Random(20261018+epoch).shuffle(indexes)
        for start in range(0,len(indexes),256):
            idx=indexes[start:start+256];opt.zero_grad();pred=v(x[idx]);loss=((pred-y[idx])**2*weights[idx]).sum()/weights[idx].sum();loss.backward();torch.nn.utils.clip_grad_norm_(v.parameters(),1.);opt.step()
        with torch.no_grad():prediction=v(dx).tolist()
        m=value_metrics(dev,prediction);history.append(dict(epoch=epoch,metrics=m));save('value-history.json',history)
        score=np.mean([m[k]['mse'] for k in ['opening','middle','late'] if m[k]['rows']])
        if score<best-1e-5:best=score;stale=0;save('value-best.json',v.flat.detach().tolist())
        else:stale+=1
        if stale>=5:break
    # 常数和静态公式均只在训练分区拟合。
    constant=float((y*weights).sum()/weights.sum());static=lambda r:np.tanh((r['x'][260]-r['x'][268])*0.25+(r['x'][262]-r['x'][270])*2+(r['x'][265]-r['x'][273]))
    value=Value(read(HERE/'value-best.json'))
    with torch.no_grad():pred=value(dx).tolist()
    phaseConstants={k:float((y[[i for i,r in enumerate(train) if stage(r['turn'])==k]]*weights[[i for i,r in enumerate(train) if stage(r['turn'])==k]]).sum()/weights[[i for i,r in enumerate(train) if stage(r['turn'])==k]].sum()) for k in range(3) if any(stage(r['turn'])==k for r in train)}
    # 加强静态对照：仅用金币、总HP、兵数和规则收入差，系数只在训练集拟合。
    def static_features(r):
        a=r['x'];return [1.,a[260]-a[268],a[262]-a[270],a[261]-a[269],a[265]-a[273]]
    sx=torch.tensor([static_features(r) for r in train],dtype=DT);sd=torch.tensor([static_features(r) for r in dev],dtype=DT);coef=nn.Parameter(torch.zeros(5,dtype=DT));fit=torch.optim.LBFGS([coef],max_iter=100,line_search_fn='strong_wolfe')
    def closure():
        fit.zero_grad();loss=(((torch.tanh(sx@coef)-y)**2)*weights).sum()/weights.sum()+1e-3*(coef[1:]**2).sum();loss.backward();return loss
    fit.step(closure)
    with torch.no_grad():fitted=torch.tanh(sd@coef).tolist()
    armyTrain=torch.tensor([[1.,r['army']] for r in train],dtype=DT);armyDev=torch.tensor([[1.,r['army']] for r in dev],dtype=DT);armyCoef=nn.Parameter(torch.tensor([0.,1.],dtype=DT));armyFit=torch.optim.LBFGS([armyCoef],max_iter=100,line_search_fn='strong_wolfe')
    def army_closure():
        armyFit.zero_grad();loss=(((torch.tanh(armyTrain@armyCoef)-y)**2)*weights).sum()/weights.sum()+1e-3*armyCoef[1]**2;loss.backward();return loss
    armyFit.step(army_closure)
    with torch.no_grad():fittedArmy=torch.tanh(armyDev@armyCoef).tolist()
    metrics=value_metrics(dev,pred);baselines=dict(constant=value_metrics(dev,[constant]*len(dev)),phase_constant=value_metrics(dev,[phaseConstants.get(stage(r['turn']),constant) for r in dev]),static=value_metrics(dev,[static(r) for r in dev]),fitted_static=value_metrics(dev,fitted),army_static=value_metrics(dev,[math.tanh(r['army']) for r in dev]),fitted_army=value_metrics(dev,fittedArmy));passed=all(metrics[k]['rows'] and all(metrics[k]['mse']<b[k]['mse'] for b in baselines.values()) for k in ['opening','middle','late'])
    save('value-evaluation.json',dict(passed=bool(passed),metrics=metrics,baselines=baselines,constant=constant,phaseConstants=phaseConstants,staticCoefficients=coef.detach().tolist(),armyCoefficients=armyCoef.detach().tolist(),epochs=epoch,parentStageBalanced=True))
    model['valueWeights']=read(HERE/'value-best.json');model['valueFrozen']=False;save('model-final.json',model)
if __name__=='__main__':
    mode=sys.argv[1]
    if mode=='initialize':initialize()
    elif mode=='policy':train_policy()
    elif mode=='value':train_value()
