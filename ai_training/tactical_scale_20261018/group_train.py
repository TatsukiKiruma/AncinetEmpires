"""PC float64 分层组分类和组内分类，两个残差 LayerNorm 块。"""
import os
os.environ.setdefault('OMP_NUM_THREADS', '4')
os.environ.setdefault('MKL_NUM_THREADS', '4')
import sys, json, math, time, hashlib, importlib.util
from pathlib import Path
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

HERE = Path(__file__).resolve().parent
OLD = HERE.parent/'tactical_conditional_20261018'
spec = importlib.util.spec_from_file_location('stage2_train', OLD/'train.py')
base = importlib.util.module_from_spec(spec); spec.loader.exec_module(base)
DT = torch.float64
read = base.read
def save(name, value):
    (HERE/name).write_text(json.dumps(value,ensure_ascii=False,allow_nan=False),encoding='utf-8')
def layout(s):
    o=base.layout(s); n2=o['count']; n3=n2+2*o['h']; gw=n3+2*o['h']
    return dict(o,n2=n2,n3=n3,gw=gw,gb=gw+o['h'],count=gw+o['h']+1)

class Policy(nn.Module):
    def __init__(self,s,w):
        super().__init__();self.s=s;self.o=layout(s)
        self.flat=nn.Parameter(torch.tensor(w,dtype=DT))
        self.wait_bias=nn.Parameter(torch.tensor(s['groupWaitBias'],dtype=DT)) if 'groupWaitBias' in s else None
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
        if self.wait_bias is not None:group=group+self.wait_bias*b['group_wait']
        # 冻结价值头沿用旧身份，不参与决策和优化。
        value=torch.tanh(ctx@w[o['vw']:o['vw']+o['k']].detach()+w[o['vw']+o['k']].detach())
        return logits,group,value

def collate(rows,s):
    b=base.collate(rows,s);names=[list(dict.fromkeys(r['actionGroups'])) for r in rows]
    ids=torch.zeros(b['mask'].shape,dtype=torch.int64);sizes=torch.zeros(len(rows),max(map(len,names)),dtype=DT)
    targets=[];waits=torch.zeros(sizes.shape,dtype=DT)
    for j,r in enumerate(rows):
        actual=[names[j].index(g) for g in r['actionGroups']];ids[j,:len(actual)]=torch.tensor(actual)
        for g in actual:sizes[j,g]+=1
        waits[j,:len(names[j])]=torch.tensor([name.endswith('|wait') for name in names[j]],dtype=DT)
        targets.append(actual[r['target']])
    b.update(group_ids=ids,group_sizes=sizes,group_target=torch.tensor(targets,dtype=torch.int64),group_wait=waits)
    b['weight']*=torch.tensor([s.get('waitTargetWeight',1.) if r['actionGroups'][r['target']].endswith('|wait') else 1. for r in rows],dtype=DT)
    return b
def objective(z,g,b):
    group=F.cross_entropy(g,b['group_target'],reduction='none')
    within=torch.logsumexp(z.masked_fill(~b['target_group'],-torch.inf),1)-z.gather(1,b['target'][:,None]).squeeze(1)
    return ((group+within)*b['weight']).sum()/b['weight'].sum(),group+within
def batches(files,s,epoch=0,training=False):
    buf=[]
    for r in base.rows_for(files,epoch,training):
        buf.append(r)
        if len(buf)==32:yield buf,collate(buf,s);buf=[]
    if buf:yield buf,collate(buf,s)
def decode(z,g,r):
    names=list(dict.fromkeys(r['actionGroups']));chosen=names[base.stable_best(g)]
    members=[i for i,k in enumerate(r['actionGroups']) if k==chosen]
    return members[base.stable_best([z[i] for i in members])]

def evaluate(model,files,s):
    m=dict(rows=0,correct=0,groupCorrect=0,moveRows=0,withinMove=0,recruitRows=0,withinRecruit=0,attackOpportunity=0,attackTaken=0,safeChoiceOpportunity=0,dangerAvoided=0,waitWithOpportunity=0,waits=0,endWithRecruit=0)
    loss=weight=0.;model.eval()
    with torch.no_grad():
        for rows,b in batches(files,dict(s,waitTargetWeight=1.)):
            z,g,_=model(b);_,ce=objective(z,g,b);loss+=float((ce*b['weight']).sum());weight+=float(b['weight'].sum())
            for j,r in enumerate(rows):
                zz=z[j,:len(r['codes'])].tolist();gg=g[j,:len(set(r['actionGroups']))].tolist();i=decode(zz,gg,r);target=r['target'];group=r['actionGroups'][target]
                members=[k for k,v in enumerate(r['actionGroups']) if v==group];within=members[base.stable_best([zz[k] for k in members])]
                code=r['codes'][i];m['rows']+=1;m['correct']+=i==target;m['groupCorrect']+=r['actionGroups'][i]==group
                if r['type']=='move':m['moveRows']+=1;m['withinMove']+=within==target
                if r['type'].startswith('recruit_'):m['recruitRows']+=1;m['withinRecruit']+=r['codes'][within].split(':')[1]==r['codes'][target].split(':')[1]
                attack=any(c.startswith('attack:') for c in r['codes']);m['attackOpportunity']+=attack;m['attackTaken']+=attack and code.startswith('attack:')
                def feat(k,n):return float(r['candidates'][k,s['oldCandidateCount']+n]) if r.get('_packed') else dict(r['candidates'][k]).get(s['oldCandidateCount']+n,0)
                if code.startswith(('move:','post_attack_move:')):
                    same=[k for k,v in enumerate(r['actionGroups']) if v==r['actionGroups'][i]]
                    if any(feat(k,6) and not feat(k,5) for k in same):m['safeChoiceOpportunity']+=1;m['dangerAvoided']+=bool(feat(i,6)) and not bool(feat(i,5))
                if code.startswith('wait:'):
                    m['waits']+=1;actor=r['actionGroups'][i].split('|')[0];m['waitWithOpportunity']+=any(v in (actor+'|move',actor+'|attack',actor+'|post_attack_move') for v in r['actionGroups'])
                if code=='end_turn':m['endWithRecruit']+=any(c.startswith('recruit_') for c in r['codes'])
    for name,num,den in [('top1','correct','rows'),('groupTop1','groupCorrect','rows'),('within_move','withinMove','moveRows'),('within_recruit','withinRecruit','recruitRows'),('attack_opportunity_rate','attackTaken','attackOpportunity'),('danger_avoidance','dangerAvoided','safeChoiceOpportunity')]:m[name]=m[num]/max(1,m[den])
    return dict(loss=loss/weight,weight=weight,metrics=m)

def initialize():
    s=read(OLD/'schema.json');s['version']='sd-hierarchical-residual-ln-v1';s['architecture']='64x3, two post-linear LayerNorm residual blocks, mean-pooled explicit group head';s['groupObjective']='group CE + target-group conditional CE';s['layerNormEpsilon']=1e-5
    o=layout(s);torch.manual_seed(20261018)
    w=torch.zeros(o['count'],dtype=DT);prior=read(OLD/'initial.json');w[:len(prior)]=torch.tensor(prior,dtype=DT)
    w[o['n2']:o['n2']+o['h']]=1;w[o['n3']:o['n3']+o['h']]=1;w[o['gw']:o['gb']].normal_(0,1/math.sqrt(o['h']))
    save('group-schema.json',s);save('group-initial.json',dict(schema=s,weights=w.tolist(),arm='hierarchical',epoch=0))
def parity(name):
    model=read(HERE/f'group-{name}.json');s=model['schema'];p=Policy(s,model['weights']);inputs=read(HERE/'group-inputs.json');out=[]
    for r in inputs:
        b=collate([r],s);p.zero_grad();z,g,v=p(b);loss,_=objective(z,g,b);loss.backward()
        gradient=p.flat.grad.tolist()+([float(p.wait_bias.grad)] if p.wait_bias is not None else [])
        out.append(dict(logits=z[0].detach().tolist(),groupLogits=g[0].detach().tolist(),value=float(v[0]),best=decode(z[0].tolist(),g[0].tolist(),r),loss=float(loss),gradient=gradient))
    tail=read(HERE/'scale-contract.json')['trainRows']%32 if (HERE/'scale-contract.json').exists() else 5
    tail=tail or 32;batchChecks=[]
    for size in [32,tail]:
        indexes=[i%len(inputs) for i in range(size)];rows=[inputs[i] for i in indexes];b=collate(rows,s);p.zero_grad();z,g,v=p(b);loss,_=objective(z,g,b);loss.backward()
        gradient=p.flat.grad.tolist()+([float(p.wait_bias.grad)] if p.wait_bias is not None else [])
        batchChecks.append(dict(size=size,indexes=indexes,loss=float(loss),gradient=gradient,out=[dict(logits=z[j,:len(r['codes'])].detach().tolist(),groupLogits=g[j,:len(set(r['actionGroups']))].detach().tolist(),value=float(v[j]),best=decode(z[j,:len(r['codes'])].tolist(),g[j,:len(set(r['actionGroups']))].tolist(),r)) for j,r in enumerate(rows)]))
    save(f'group-python-{name}.json',dict(out=out,batchChecks=batchChecks))

def train():
    for gate in ['feature-parity-speed.json','clone-trajectory-parity.json','group-numeric-initial.json','group-browser-initial.json']:assert read(HERE/gate)['passed']
    contract=read(HERE/'scale-contract.json');assert contract['canonicalV3Threshold'];assert read(HERE/'castle-aura-probe.json')['passed']
    for filename,digest in contract['sourceBinding'].items():assert hashlib.sha256((HERE/filename).read_bytes()).hexdigest()==digest
    files=contract['files'];s=read(HERE/'group-schema.json');initial=read(HERE/'group-initial.json')
    browser=read(HERE/'group-browser-initial.json')
    assert browser['batchParity'] and read(HERE/'group-numeric-initial.json')['batchParity']
    for filename,digest in browser['fileSha256'].items():assert hashlib.sha256((HERE/filename).read_bytes()).hexdigest()==digest
    for f in files:
        assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()==f['sha256']
        assert hashlib.sha256(Path(f['packedPath']).read_bytes()).hexdigest()==f['packedSha256']
    assert not (HERE/'group-best.json').exists(),'拒绝覆盖已完成训练'
    train=[f for f in files if f['split']=='train'];dev=[f for f in files if f['split']=='validation'];p=Policy(s,initial['weights']);o=p.o
    optimizer=torch.optim.AdamW([p.flat],lr=1e-3,weight_decay=1e-4)
    updates=math.ceil(contract['trainRows']/32)*8;warmup=math.ceil(updates*.05)
    scheduler=torch.optim.lr_scheduler.LambdaLR(optimizer,lambda n:min(1.,(n+1)/warmup) if n<warmup else .05+.95*.5*(1+math.cos(math.pi*min(1.,(n-warmup)/max(1,updates-warmup)))))
    best=math.inf;stale=steps=0;history=[];start=time.perf_counter();value=p.flat[o['vw']:o['n2']].detach().clone()
    for epoch in range(1,9):
        p.train();seen=0;total=weight=0.;t0=time.perf_counter()
        for rows,b in batches(train,s,epoch,True):
            optimizer.zero_grad(set_to_none=True);z,g,_=p(b);loss,_=objective(z,g,b);loss.backward();p.flat.grad[o['vw']:o['n2']]=0
            norm=float(torch.nn.utils.clip_grad_norm_([p.flat],1.));assert math.isfinite(norm)
            optimizer.step();scheduler.step()
            with torch.no_grad():p.flat[o['vw']:o['n2']]=value
            seen+=len(rows);steps+=1;total+=float(loss.detach())*float(b['weight'].sum());weight+=float(b['weight'].sum())
            if steps%25==0:save('group-train.live.json',dict(epoch=epoch,steps=steps,rows=seen,seconds=time.perf_counter()-start))
        assert seen==contract['trainRows'];trainingSeconds=time.perf_counter()-t0;metrics=evaluate(p,dev,s)
        record=dict(epoch=epoch,steps=steps,rows=seen,trainLoss=total/weight,trainingSeconds=trainingSeconds,dev=metrics);history.append(record);save('group-history.json',history);print(json.dumps(record),flush=True)
        if metrics['loss']<best-1e-5:
            best=metrics['loss'];stale=0;save('group-best.json',dict(schema=s,weights=p.flat.detach().tolist(),arm='hierarchical',epoch=epoch))
        else:stale+=1
        torch.save(dict(weights=p.flat.detach(),optimizer=optimizer.state_dict(),scheduler=scheduler.state_dict(),epoch=epoch,steps=steps),HERE/f'group-checkpoint-{epoch}.pt')
        if stale>=2:break
    save('group-training.json',dict(epochs=epoch,steps=steps,seconds=time.perf_counter()-start,bestLoss=best,phoneOperations=0,optimizer='PC PyTorch AdamW float64',valueFrozen=True,
        python=sys.executable,torchVersion=torch.__version__,cpuThreads=torch.get_num_threads(),cudaUsed=False,parameters=o['count']))

if __name__=='__main__':
    mode=sys.argv[1]
    if mode=='initialize':initialize()
    elif mode=='parity':parity(sys.argv[2])
    elif mode=='train':train()
