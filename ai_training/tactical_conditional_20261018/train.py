"""本机PyTorch变长padded batch训练；只写本次目录，value头冻结。"""
import os
os.environ.setdefault('OMP_NUM_THREADS', '4')
os.environ.setdefault('MKL_NUM_THREADS', '4')
import gzip
import hashlib
import json
import math
from pathlib import Path
import random
import sys
import time
import pickle
import subprocess
from collections import OrderedDict
import numpy as np
import torch
from torch import nn

HERE = Path(__file__).resolve().parent
torch.set_num_threads(4)
torch.set_num_interop_threads(1)
DT = torch.float64
read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
PACKED_CACHE = OrderedDict()
def save(name, value):
    target = HERE / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding='utf-8')

def layout(s):
    h, f, c = s['hidden'], len(s['token']['keys']), len(s['candidate']['keys'])
    k = 4*h + 4
    d = k + 3*h + c
    eb = f*h
    pw = eb+h
    pb = pw+d*h
    w2 = pb+h
    b2 = w2+h*h
    w3 = b2+h
    b3 = w3+h*h
    ow = b3+h
    ob = ow+h
    vw = ob+1
    return dict(h=h,f=f,c=c,k=k,d=d,eb=eb,pw=pw,pb=pb,w2=w2,b2=b2,w3=w3,b3=b3,ow=ow,ob=ob,vw=vw,count=vw+k+1)

class Policy(nn.Module):
    def __init__(self, schema, initial, legacy=False):
        super().__init__()
        self.s, self.o, self.legacy = schema, layout(schema), legacy
        self.policy = nn.Parameter(torch.tensor(initial[:self.o['vw']], dtype=DT))
        self.register_buffer('value', torch.tensor(initial[self.o['vw']:], dtype=DT))

    def weights(self):
        return torch.cat([self.policy.detach(), self.value]).tolist()

    def forward(self, batch):
        o, w, h = self.o, self.policy, self.o['h']
        a, b = batch['tokens'], batch['candidates']
        if self.legacy:
            b = b.clone()
            b[:, :, self.s['oldCandidateCount']:] = 0
            # 旧10维没有给招募动作归属新actor；对照臂保留其三个零值字段。
            for index in (self.s['oldCandidateCount']-4,self.s['oldCandidateCount']-3,self.s['oldCandidateCount']-1):
                b[:,:,index].masked_fill_(batch['recruit_mask'],0)
        e = torch.relu(a @ w[:o['eb']].reshape(o['f'],h) + w[o['eb']:o['pw']])
        e = e * batch['token_mask'].unsqueeze(-1)
        pooled = torch.zeros(a.shape[0],4,h,dtype=DT)
        pooled.scatter_add_(1,batch['groups'].unsqueeze(-1).expand(-1,-1,h),e)
        counts = torch.zeros(a.shape[0],4,dtype=DT)
        counts.scatter_add_(1,batch['groups'],batch['token_mask'].to(DT))
        ctx = torch.cat([(pooled / counts.clamp_min(1).unsqueeze(-1)).flatten(1), counts/1024],1)
        # 无实体引用映射到追加的零向量，避免padding被误当成第0个token。
        extended = torch.cat([e, torch.zeros(a.shape[0],1,h,dtype=DT)],1)
        refs = batch['refs'].clone()
        refs[refs < 0] = e.shape[1]
        gathered = extended.gather(1,refs.flatten(1).unsqueeze(-1).expand(-1,-1,h)).reshape(a.shape[0],b.shape[1],3*h)
        inputs = torch.cat([ctx.unsqueeze(1).expand(-1,b.shape[1],-1),gathered,b],2)
        h1 = torch.relu(inputs @ w[o['pw']:o['pb']].reshape(o['d'],h)+w[o['pb']:o['w2']])
        h2 = torch.relu(h1 @ w[o['w2']:o['b2']].reshape(h,h)+w[o['b2']:o['w3']])
        h3 = torch.relu(h2 @ w[o['w3']:o['b3']].reshape(h,h)+w[o['b3']:o['ow']])
        logits = (h3 @ w[o['ow']:o['ob']] + w[o['ob']]).masked_fill(~batch['mask'], -torch.inf)
        value = torch.tanh(ctx @ self.value[:o['k']] + self.value[o['k']])
        def rms(v, mask):
            return float((v.detach().square()*mask.unsqueeze(-1)).sum().div(mask.sum().clamp_min(1)*h).sqrt())
        activations = {'embedding':rms(e,batch['token_mask']), 'h1':rms(h1,batch['mask']), 'h2':rms(h2,batch['mask']), 'h3':rms(h3,batch['mask'])}
        return logits, value, activations

def initial_weights(schema):
    torch.manual_seed(20261018)
    o = layout(schema)
    flat = torch.zeros(o['count'],dtype=DT)
    for start,end,fan,nonlinearity in [(0,o['eb'],o['f'],'relu'),(o['pw'],o['pb'],o['d'],'relu'),(o['w2'],o['b2'],o['h'],'relu'),(o['w3'],o['b3'],o['h'],'relu'),(o['ow'],o['ob'],o['h'],'linear')]:
        gain = nn.init.calculate_gain(nonlinearity)
        flat[start:end].normal_(0,gain/math.sqrt(fan))
    # 延续冻结基线的value头身份；该头与目标无关且不参与优化器。
    original = read(HERE/'baseline.json')['weights']
    flat[o['vw']:] = torch.tensor(original[-(o['k']+1):],dtype=DT)
    return flat.tolist()

def rows_for(files, epoch=0, training=False):
    ordered = list(files)
    if training:
        ordered.sort(key=lambda e:hashlib.sha256(f"20261018:{epoch}:{e['parent']}".encode()).hexdigest())
    for entry in ordered:
        if entry.get('packedPath'):
            filename=entry['packedPath']
            if filename not in PACKED_CACHE:
                with (HERE/filename).open('rb') as stream: data=pickle.load(stream)
                for row in data['rows']: row['_token_table']=data['tokenTable']
                PACKED_CACHE[filename]=data
                while len(PACKED_CACHE)>4:PACKED_CACHE.popitem(last=False)
            PACKED_CACHE.move_to_end(filename)
            saved=PACKED_CACHE[filename]['rows']
            for offset in range(0,len(saved),128):
                window=list(saved[offset:offset+128])
                if training and len(window)==128:window.sort(key=lambda r:len(r['candidates']))
                yield from window
            continue
        with gzip.open(HERE/entry['path'],'rt',encoding='utf-8') as stream:
            window = []
            for line in stream:
                window.append(json.loads(line))
                if len(window) == 128:
                    if training:
                        window.sort(key=lambda r:len(r['candidates']))
                    yield from window
                    window = []
            yield from window

def collate(rows, schema):
    B, T, N = len(rows), max(len(r['tokens']) for r in rows), max(len(r['candidates']) for r in rows)
    F, C = len(schema['token']['keys']), len(schema['candidate']['keys'])
    tokens = np.zeros((B,T,F),dtype=np.float64)
    candidates = np.zeros((B,N,C),dtype=np.float64)
    groups = np.zeros((B,T),dtype=np.int64)
    refs = np.full((B,N,3),-1,dtype=np.int64)
    mask = np.zeros((B,N),dtype=bool)
    token_mask = np.zeros((B,T),dtype=bool)
    target_group = np.zeros((B,N),dtype=bool)
    recruit_mask = np.zeros((B,N),dtype=bool)
    for i,r in enumerate(rows):
        if r.get('_packed'):
            tokens[i,:len(r['tokens'])]=r['_token_table'][r['tokens']]
            candidates[i,:len(r['candidates'])]=r['candidates'][:,:C]
        else:
            for j,row in enumerate(r['tokens']):
                if row:
                    indexes,values = zip(*row)
                    tokens[i,j,list(indexes)] = values
            for j,row in enumerate(r['candidates']):
                selected = [(index,value) for index,value in row if index<C]
                if selected:
                    indexes,values = zip(*selected)
                    candidates[i,j,list(indexes)] = values
        groups[i,:len(r['groups'])] = r['groups']
        refs[i,:len(r['refs'])] = r['refs']
        mask[i,:len(r['candidates'])] = True
        token_mask[i,:len(r['tokens'])] = True
        target_group[i,:len(r['candidates'])] = [g == r['actionGroups'][r['target']] for g in r['actionGroups']]
        recruit_mask[i,:len(r['codes'])] = [code.startswith('recruit_') for code in r['codes']]
    batch = {k:torch.from_numpy(v) for k,v in dict(tokens=tokens,candidates=candidates,groups=groups,refs=refs,mask=mask,token_mask=token_mask,target_group=target_group,recruit_mask=recruit_mask).items()}
    batch['target'] = torch.tensor([r['target'] for r in rows],dtype=torch.int64)
    batch['weight'] = torch.tensor([r['weight'] for r in rows],dtype=DT)
    batch['_rows'] = rows
    return batch

def batches(files,schema,epoch=0,training=False,size=32):
    buffer = []
    for row in rows_for(files,epoch,training):
        buffer.append(row)
        if len(buffer) == size:
            yield buffer,collate(buffer,schema)
            buffer = []
    if buffer:
        yield buffer,collate(buffer,schema)

def objective(logits,batch,conditional):
    target = logits.gather(1,batch['target'].unsqueeze(1)).squeeze(1)
    all_lse = torch.logsumexp(logits,1)
    ce = all_lse-target
    within = torch.logsumexp(logits.masked_fill(~batch['target_group'],-torch.inf),1)-target
    weight = batch['weight']
    return ((ce+conditional*within)*weight).sum()/weight.sum(),ce

def stable_best(z):
    best = 0
    for i in range(1,len(z)):
        if z[i] > z[best]+1e-10:
            best = i
    return best

def choose(z,groups,decoder):
    best = stable_best(z)
    if decoder in ('direct','group_max'):
        return best
    masses = {}
    for i,v in enumerate(z):
        masses[groups[i]] = masses.get(groups[i],0)+math.exp(v-z[best])
    selected,score = '',-1
    for key,value in masses.items():
        if value > score+1e-10:
            selected,score = key,value
    chosen = -1
    for i,value in enumerate(z):
        if groups[i] == selected and (chosen < 0 or value > z[chosen]+1e-10):
            chosen = i
    return chosen

def evaluate(model,files,schema,details=False):
    metrics = {d:dict(rows=0,correct=0,groupCorrect=0,moveRows=0,withinMove=0,recruitRows=0,withinRecruit=0,attackRows=0,attackCorrect=0,attackOpportunity=0,attackTaken=0,safeChoiceOpportunity=0,dangerAvoided=0,chosenLethal=0,moveChosen=0,waitWithOpportunity=0) for d in ('direct','group_mass','group_max')}
    loss,total = 0.,0.
    diagnostics = []
    model.eval()
    with torch.no_grad():
        for rows,batch in batches(files,schema):
            logits,_,_ = model(batch)
            _,ce = objective(logits,batch,0)
            loss += float((ce*batch['weight']).sum())
            total += float(batch['weight'].sum())
            for j,r in enumerate(rows):
                z = logits[j,:len(r['codes'])].tolist()
                target = r['target']
                correct_group = r['actionGroups'][target]
                within_indices = [i for i,g in enumerate(r['actionGroups']) if g == correct_group]
                within = within_indices[stable_best([z[i] for i in within_indices])]
                def feature(i,k):
                    if r.get('_packed'):return float(r['candidates'][i,schema['oldCandidateCount']+k])
                    return dict(r['candidates'][i]).get(schema['oldCandidateCount']+k,0)
                move_indices = [i for i,c in enumerate(r['codes']) if c.startswith(('move:', 'post_attack_move:'))]
                any_attack = any(c.startswith('attack:') for c in r['codes'])
                for decoder,m in metrics.items():
                    chosen = choose(z,r['actionGroups'],decoder)
                    code = r['codes'][chosen]
                    m['rows'] += 1
                    m['correct'] += chosen == target
                    m['groupCorrect'] += r['actionGroups'][chosen] == correct_group
                    if r['type'] == 'move':
                        m['moveRows'] += 1; m['withinMove'] += within == target
                    if r['type'].startswith('recruit_'):
                        m['recruitRows'] += 1
                        m['withinRecruit'] += r['codes'][within].split(':')[1] == r['codes'][target].split(':')[1]
                    if r['type'] == 'attack':
                        m['attackRows'] += 1; m['attackCorrect'] += chosen == target
                    m['attackOpportunity'] += any_attack
                    m['attackTaken'] += any_attack and code.startswith('attack:')
                    if code.startswith(('move:', 'post_attack_move:')):
                        same_group_moves = [i for i in move_indices if r['actionGroups'][i]==r['actionGroups'][chosen]]
                        safe_possible = any(feature(i,6) and not feature(i,5) for i in same_group_moves)
                        m['moveChosen'] += 1
                        m['chosenLethal'] += bool(feature(chosen,5))
                        if safe_possible:
                            m['safeChoiceOpportunity'] += 1
                            m['dangerAvoided'] += bool(feature(chosen,6)) and not bool(feature(chosen,5))
                    if code.startswith('wait:'):
                        actor = r['actionGroups'][chosen].split('|')[0]
                        m['waitWithOpportunity'] += any(g in (actor+'|move',actor+'|attack',actor+'|post_attack_move') for g in r['actionGroups'])
                if details and len(diagnostics) < 8:
                    diagnostics.append(dict(parent=r['parent'],macro=r['macro'],logits=z))
    for m in metrics.values():
        m.update(top1=m['correct']/max(1,m['rows']),groupTop1=m['groupCorrect']/max(1,m['rows']),within_move=m['withinMove']/max(1,m['moveRows']),within_recruit=m['withinRecruit']/max(1,m['recruitRows']),attack_accuracy=m['attackCorrect']/max(1,m['attackRows']),attack_opportunity_rate=m['attackTaken']/max(1,m['attackOpportunity']),danger_avoidance=m['dangerAvoided']/max(1,m['safeChoiceOpportunity']))
    return dict(loss=loss/total,weight=total,metrics=metrics,diagnostics=diagnostics)

def gradient_norms(model):
    g,o = model.policy.grad,model.o
    blocks = {'embedding':(0,o['pw']),'policy1':(o['pw'],o['w2']),'policy2':(o['w2'],o['w3']),'policy3':(o['w3'],o['ow']),'output':(o['ow'],o['vw'])}
    return {name:dict(norm=float(g[a:b].norm()),rms=float(g[a:b].square().mean().sqrt())) for name,(a,b) in blocks.items()}

def main():
    contract = read(HERE/'contract.json')
    schema = read(HERE/'schema.json')
    initial = read(HERE/'initial.json')
    assert hashlib.sha256((HERE/'schema.json').read_bytes()).hexdigest() == contract['schemaSha256']
    assert hashlib.sha256((HERE/'initial.json').read_bytes()).hexdigest() == contract['initialSha256']
    for entry in contract['files']:
        assert hashlib.sha256((HERE/entry['path']).read_bytes()).hexdigest() == entry['sha256']
        if entry.get('packedPath'):assert hashlib.sha256((HERE/entry['packedPath']).read_bytes()).hexdigest()==entry['packedSha256']
    assert read(HERE/'numeric-gate-initial.json')['passed']
    assert read(HERE/'browser-parity-initial.json')['passed']
    train = [e for e in contract['files'] if e['split'] == 'train']
    dev = [e for e in contract['files'] if e['split'] == 'validation']
    arm = sys.argv[1]
    assert arm in ('legacy','new','conditional','export-probes')
    if arm=='legacy' and len(sys.argv)==2:
        # 三臂各自4线程，共用只读缓存；优化器、输出及检查点按臂隔离。
        started=time.perf_counter()
        flags=getattr(subprocess,'BELOW_NORMAL_PRIORITY_CLASS',0)|getattr(subprocess,'CREATE_NO_WINDOW',0)
        processes=[subprocess.Popen([sys.executable,'-X','utf8',str(Path(__file__).resolve()),name,'--single'],creationflags=flags) for name in ('legacy','new','conditional')]
        codes=[p.wait() for p in processes]
        save('pc-training-wall.json',dict(seconds=time.perf_counter()-started,parallelArms=3,threadsPerArm=4,returnCodes=codes))
        if any(codes):raise RuntimeError('PC并行训练臂失败:'+str(codes))
        return
    if arm == 'export-probes':
        out = []
        for r in rows_for([{k:v for k,v in entry.items() if k not in ('packedPath','packedSha256')} for entry in train]):
            out.append(r)
            if len(out) == 16: break
        save('parity-inputs.json',out)
        return
    model = Policy(schema,initial,legacy=arm=='legacy')
    if (HERE/f'model-{arm}.json').exists():
        raise RuntimeError('该臂已完成，拒绝覆盖或重跑')
    optimizer = torch.optim.AdamW([model.policy],lr=contract['learningRate'],weight_decay=contract['weightDecay'])
    total_updates = math.ceil(contract['trainRows']/32)*contract['maxEpochs']
    warmup = max(1,math.ceil(total_updates*.05))
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer,lambda step:min(1.,(step+1)/warmup) if step<warmup else .05+.95*.5*(1+math.cos(math.pi*min(1.,(step-warmup)/max(1,total_updates-warmup)))))
    best,stale,updates = float('inf'),0,0
    history = []
    started = time.perf_counter()
    for epoch in range(1,contract['maxEpochs']+1):
        model.train()
        epoch_start = time.perf_counter()
        loss_sum,weight_sum,rows_seen = 0.,0.,0
        telemetry = []
        candidate_slots=real_candidates=token_slots=real_tokens=0
        for rows,batch in batches(train,schema,epoch,True):
            optimizer.zero_grad(set_to_none=True)
            logits,_,activations = model(batch)
            loss,_ = objective(logits,batch,.5 if arm=='conditional' else 0)
            loss.backward()
            if updates % 100 == 0:
                telemetry.append(dict(update=updates,activationRms=activations,gradientBlocks=gradient_norms(model)))
            gradient_norm = float(torch.nn.utils.clip_grad_norm_([model.policy],1.))
            if not math.isfinite(gradient_norm): raise RuntimeError('梯度非有限')
            optimizer.step(); scheduler.step(); updates += 1
            candidate_slots+=batch['mask'].numel();real_candidates+=int(batch['mask'].sum());token_slots+=batch['token_mask'].numel();real_tokens+=int(batch['token_mask'].sum())
            weight_sum += float(batch['weight'].sum()); loss_sum += float(loss.detach())*float(batch['weight'].sum()); rows_seen += len(rows)
            if updates % 25 == 0:
                save(f'train-{arm}.live.json',dict(epoch=epoch,updates=updates,rows=rows_seen,seconds=time.perf_counter()-started,lr=scheduler.get_last_lr()[0]))
        assert rows_seen == contract['trainRows']
        training_seconds = time.perf_counter()-epoch_start
        dev_metrics = evaluate(model,dev,schema)
        record = dict(epoch=epoch,updates=updates,rows=rows_seen,trainLoss=loss_sum/weight_sum,trainingSeconds=training_seconds,examplesPerSecond=rows_seen/training_seconds,
            candidatePaddingFraction=1-real_candidates/max(1,candidate_slots),tokenPaddingFraction=1-real_tokens/max(1,token_slots),dev=dev_metrics,telemetry=telemetry)
        history.append(record)
        save(f'history-{arm}.json',history)
        print(json.dumps(dict(arm=arm,epoch=epoch,updates=updates,trainingSeconds=round(training_seconds,2),devLoss=dev_metrics['loss'],within_move=dev_metrics['metrics']['direct']['within_move'],within_recruit=dev_metrics['metrics']['direct']['within_recruit'])),flush=True)
        if dev_metrics['loss'] < best-1e-5:
            best,stale = dev_metrics['loss'],0
            exported = dict(schema={**schema,'featureMode':'legacy' if arm=='legacy' else 'new'},weights=model.weights(),arm=arm,epoch=epoch,optimizer='PC PyTorch AdamW',valueFrozen=True,decoderSelection='direct开发原子CE')
            save(f'best-{arm}.json',exported)
            torch.save(dict(policy=model.policy.detach(),optimizer=optimizer.state_dict(),scheduler=scheduler.state_dict(),epoch=epoch,updates=updates),HERE/f'checkpoint-{arm}.pt')
        else:
            stale += 1
        if stale >= 2: break
    final = read(HERE/f'best-{arm}.json')
    assert final['weights'][-len(model.value):] == initial[-len(model.value):]
    save(f'model-{arm}.json',final)
    save(f'training-{arm}.json',dict(arm=arm,updates=updates,epochs=len(history),bestEpoch=final['epoch'],bestDevLoss=best,wallSeconds=time.perf_counter()-started,device='PC CPU PyTorch float64',torch=torch.__version__,threads=torch.get_num_threads(),valueFrozen=True))

if __name__ == '__main__':
    main()
