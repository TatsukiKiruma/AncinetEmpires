"""完整720父局策略训练及一轮专家纠错蒸馏。"""
from train import *
import json,time,math,hashlib,pickle,random
mode=sys.argv[1] if len(sys.argv)>1 else 'base'
contract=read(HERE/'contract.json');initial=read(HERE/('initial.json' if mode=='base' else 'base-policy-final.json'));s=initial['schema'];p=make_policy(s,initial['weights']);p.type_bias.data.copy_(torch.tensor(s['groupTypeBias'],dtype=DT))
assert read(HERE/'numeric-initial.json')['passed'] and read(HERE/'browser-initial.json')['passed']
assert not (HERE/f'{mode}-policy-best.json').exists(),'拒绝覆盖已完成训练'
files=contract['files'];train=[f for f in files if f['split']=='train'];dev=[f for f in files if f['split']=='validation']
for f in files:assert hashlib.sha256(Path(f['packedPath']).read_bytes()).hexdigest()==f['packedSha256']
expert=[]
if mode=='distill':
    assert read(HERE/'expert-summary.json')['passed']
    with (HERE/'expert.pkl').open('rb') as f:expert=pickle.load(f)
    allowed={p['parentId'] for p in read(HERE/'selection.json')['parents'] if p['split']=='train'}
    assert all(r['parent'] in allowed for r in expert)
o=p.o;frozen=p.flat[o['vw']:o['n2']].detach().clone();opt=torch.optim.AdamW(p.parameters(),lr=3e-4 if mode=='base' else 1e-4,weight_decay=1e-4)
best=math.inf;history=[];steps=0;start=time.perf_counter()
for epoch in range(1,5 if mode=='base' else 2):
    seen=0;total=weight=0.;expertSeen=0
    def stream():
        extras=list(expert);random.Random(20261019+epoch).shuffle(extras);j=0
        for rows,b in batches(train,s,epoch,True):
            yield rows,b,False
            if j<len(extras) and (seen//32)%20==0:
                rows=extras[j:j+32];j+=len(rows);yield rows,collate(rows,s,False),True
        while j<len(extras):
            rows=extras[j:j+32];j+=len(rows);yield rows,collate(rows,s,False),True
    for rows,b,isExpert in stream():
        opt.zero_grad();z,g,_=p(b);loss,_=stage3.objective(z,g,b);loss.backward();p.flat.grad[o['vw']:o['n2']]=0
        torch.nn.utils.clip_grad_norm_(p.parameters(),1.);opt.step()
        with torch.no_grad():p.flat[o['vw']:o['n2']]=frozen
        steps+=1
        if isExpert:expertSeen+=len(rows)
        else:seen+=len(rows)
        total+=float(loss.detach())*float(b['weight'].sum());weight+=float(b['weight'].sum())
        if steps%25==0:save(f'{mode}-training.live.json',dict(epoch=epoch,steps=steps,rows=seen,expertRows=expertSeen,seconds=time.perf_counter()-start))
    assert seen==contract['trainRows'];assert expertSeen==len(expert)
    metrics=evaluate(p,dev,s);record=dict(epoch=epoch,steps=steps,trainRows=seen,expertRows=expertSeen,trainLoss=total/weight,dev=metrics,seconds=time.perf_counter()-start);history.append(record);save(f'{mode}-policy-history.json',history);print(json.dumps(record),flush=True)
    sourceName='initial.json' if mode=='base' else 'base-policy-final.json'
    trainingPhase=dict(mode=mode,source=sourceName,sourceSha256=hashlib.sha256((HERE/sourceName).read_bytes()).hexdigest(),epochs=epoch,updates=steps,originalRowsPerEpoch=contract['trainRows'],expertRowsPerEpoch=len(expert))
    model=dict(initial,schema=dict(s,groupTypeBias=p.type_bias.detach().tolist()),weights=p.flat.detach().tolist(),epoch=epoch,arm='stage5',trainingPhases=[*initial.get('trainingPhases',[]),trainingPhase])
    save(f'{mode}-policy-epoch-{epoch}.json',model);torch.save(dict(weights=p.flat.detach(),biases=p.type_bias.detach(),optimizer=opt.state_dict(),epoch=epoch,steps=steps),HERE/f'{mode}-checkpoint-{epoch}.pt')
    if metrics['loss']<best:best=metrics['loss'];save(f'{mode}-policy-best.json',model)
save(f'{mode}-policy-training.json',dict(epochs=epoch,steps=steps,seconds=time.perf_counter()-start,trainRows=contract['trainRows'],expertRows=len(expert),torch=torch.__version__,python=sys.executable,phoneOperations=0))
