"""新容量可恢复全参数训练；正式、稳定性与开发流使用独立运行身份。"""
import argparse
import hashlib
import json
import os
import random
import struct
import subprocess
import threading
import time
from pathlib import Path
import numpy as np
import torch
from torch.nn import functional as F
from model import DualStreamModel
from batch_model import collate, forward_batch

DIR=Path(__file__).resolve().parent
ROOT=DIR.parents[1]


def decode(meta,raw):
    assert hashlib.sha256(raw).hexdigest()==meta['sha256']
    samples=[dict(source=s) for s in meta['sources']]
    for e in meta['arrays']:
        data=raw[e['offset']:e['offset']+e['bytes']]
        assert hashlib.sha256(data).hexdigest()==e['sha256']
        samples[e['batch']][e['name']]=torch.from_numpy(np.frombuffer(data,dtype=e['dtype']).copy().reshape(e['shape']))
    return samples


def exact(f,n):
    data=bytearray()
    while len(data)<n:
        part=f.read(n-len(data))
        if not part: raise EOFError('训练流截断')
        data.extend(part)
    return data


def stream(split,identity,limit=None,skip=0,source_mode='all',expert_manifest=None):
    command=['node',str(ROOT/'ai_training/run.mjs'),'node','--max-old-space-size=4096','--import','tsx','expert_iteration_2m_20261022/dataset.ts',split,identity,str(limit) if limit is not None else 'Infinity',str(skip),source_mode]
    if expert_manifest:command.append(expert_manifest)
    p=subprocess.Popen(command,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    log=(DIR/'training-logs');log.mkdir(exist_ok=True)
    def drain():
        with (log/(identity+'-'+split+'.log')).open('ab') as f:
            for line in iter(p.stderr.readline,b''):f.write(line);f.flush()
    thread=threading.Thread(target=drain,daemon=True);thread.start()
    try:
        while first:=p.stdout.read(1):
            ms,ps=struct.unpack('<II',first+exact(p.stdout,7))
            assert ms<2**24 and ps<2**28
            yield from decode(json.loads(exact(p.stdout,ms)),exact(p.stdout,ps))
        assert p.wait()==0,'数据流失败，详见独立日志'
    finally:
        if p.poll() is None:p.terminate()
        p.wait();thread.join(timeout=3);p.stdout.close();p.stderr.close()


def load_initial(prefix=None):
    m=DualStreamModel(seed=221966910)
    prefix=Path(prefix) if prefix else DIR/'initial'
    meta=json.loads(prefix.with_suffix('.json').read_text('utf-8'));assert meta['model']=='dual-stream-v3-2m-v1'
    raw=np.frombuffer(prefix.with_suffix('.bin').read_bytes(),dtype='<f4')
    m.load_state_dict({e['name']:torch.from_numpy(raw[e['offset']:e['offset']+e['length']].copy().reshape(e['shape'])) for e in meta['tensors']})
    return m


def loss(model,rows):
    x=collate(rows);out=forward_batch(model,x)
    prior=torch.zeros_like(out['logits'])
    for i,s in enumerate(rows):prior[i,:len(s['pointers'])]=torch.tensor(s['source']['prior'])
    score=out['logits']+prior
    policy_mask=torch.tensor([bool(s['policyMask'].item()) for s in rows])
    pweight=x['weight']*x['quality']*policy_mask*torch.tensor([s['source'].get('parentPolicyScale',1.) for s in rows])
    ce=F.cross_entropy(score,x['target'],reduction='none')
    for i,s in enumerate(rows):
        if target:=s['source'].get('searchTarget'):
            indices=torch.tensor([r['index'] for r in target],dtype=torch.long)
            probabilities=torch.tensor([r['score'] for r in target]).div(.5).softmax(0)
            # 仅在实际探索根动作集合中归一化，未探索动作不获得负标签。
            ce[i]=-(probabilities*score[i,indices].log_softmax(0)).sum()
    policy=(ce*pweight).mean()
    vweight=x['valueMask'].float()*torch.tensor([s['source'].get('parentValueScale',1.) for s in rows])
    vl=-(x['valueTarget']*out['valueLogits'].log_softmax(-1)).sum(-1)
    brier=(out['valueProbs']-x['valueTarget']).square().sum(-1)
    value=((vl+brier)*vweight).mean()
    # 无教师或KL锚定，避免将扩容网络长期锁在旧输出附近。
    return policy+value,dict(policy=float(policy.detach()),value=float(value.detach()),kl=0.,demonstration=float(policy.detach()),policySamples=int(policy_mask.sum()),valueSamples=int(x['valueMask'].sum()),samples=len(rows))


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',required=True);parser.add_argument('--epochs',type=int,default=2);parser.add_argument('--batch',type=int,default=8);parser.add_argument('--lr',type=float,default=1e-4);parser.add_argument('--limit',type=int);parser.add_argument('--resume',action='store_true');parser.add_argument('--source-mode',default='all',choices=['all','native-value']);parser.add_argument('--initial-prefix');parser.add_argument('--expert-manifest')
    args=parser.parse_args();assert args.run.replace('-','').replace('_','').isalnum()
    torch.set_num_threads(4);torch.set_num_interop_threads(1);torch.use_deterministic_algorithms(True)
    random.seed(221966910);np.random.seed(221966910);torch.manual_seed(221966910)
    output=DIR/'training'/args.run;output.mkdir(parents=True,exist_ok=True)
    checkpoint=output/'resume.pt';model=load_initial(args.initial_prefix);optimizer=torch.optim.AdamW(model.parameters(),lr=args.lr,weight_decay=1e-4)
    identity_files=list(DIR.glob('*.ts'))+[DIR/'model.py',DIR/'batch_model.py',DIR/'train.py',DIR.parent/'pretrain_preflight_20261022/DATA_SPLITS.json']
    identity_files+=list((ROOT/'src/ai_runtime/dual_v3').glob('*.ts'))
    if (DIR/'new-evaluation-exclusions.txt.gz').exists():identity_files.append(DIR/'new-evaluation-exclusions.txt.gz')
    if args.expert_manifest:identity_files.append(Path(args.expert_manifest))
    initial_prefix=Path(args.initial_prefix) if args.initial_prefix else DIR/'initial'
    identity_files.extend([initial_prefix.with_suffix('.bin'),initial_prefix.with_suffix('.json')])
    source_identity={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in identity_files}
    identity_file=output/'source-identity.json'
    if args.resume:assert json.loads(identity_file.read_text('utf-8'))==source_identity,'续训源码或数据身份变化，必须建立新运行'
    else:identity_file.write_text(json.dumps(source_identity,ensure_ascii=False,indent=2),'utf-8')
    assert {id(p) for group in optimizer.param_groups for p in group['params']}=={id(p) for p in model.parameters()}
    epoch=0;cursor=0;updates=0;pending={};best=None;history=[];grad=set()
    start_hashes={n:hashlib.sha256(p.detach().numpy().tobytes()).hexdigest() for n,p in model.named_parameters()}
    attempt_id=time.time_ns()
    if args.resume:
        saved=torch.load(checkpoint,weights_only=False);assert saved['settings']==vars(args)|{'resume':saved['settings']['resume']}
        model.load_state_dict(saved['model']);optimizer.load_state_dict(saved['optimizer']);epoch=saved['epoch'];cursor=saved['cursor'];updates=saved['updates'];pending=saved['pending'];best=saved['best'];history=saved['history'];grad=set(saved['grad'])
        start_hashes=saved['startHashes']
        random.setstate(saved['random']);np.random.set_state(saved['numpy']);torch.set_rng_state(saved['torch'])
    else:
        assert not checkpoint.exists(),'存在检查点，请使用--resume'
    def save_state():
        state=dict(model=model.state_dict(),optimizer=optimizer.state_dict(),epoch=epoch,cursor=cursor,updates=updates,pending=pending,best=best,history=history,grad=sorted(grad),
                   random=random.getstate(),numpy=np.random.get_state(),torch=torch.get_rng_state(),settings=vars(args),startHashes=start_hashes,initialSha256=hashlib.sha256(initial_prefix.with_suffix('.bin').read_bytes()).hexdigest())
        temp=output/'resume.pending.pt';torch.save(state,temp);os.replace(temp,checkpoint)
    def update(rows):
        nonlocal updates
        objective,metrics=loss(model,rows);assert torch.isfinite(objective)
        optimizer.zero_grad(set_to_none=True);objective.backward();norm=torch.nn.utils.clip_grad_norm_(model.parameters(),1.);assert torch.isfinite(norm)
        grad.update(n for n,p in model.named_parameters() if p.grad is not None and bool(p.grad.abs().sum()>0))
        optimizer.step();updates+=1
        with (output/'metrics.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(dict(epoch=epoch+1,updates=updates,cursor=cursor,loss=float(objective.detach()),gradientNorm=float(norm),**metrics))+'\n')
        if updates%100==0:save_state();print(json.dumps(dict(stage='train',epoch=epoch+1,updates=updates,cursor=cursor,**metrics)),flush=True)
        (output/'progress.json').write_text(json.dumps(dict(epoch=epoch+1,updates=updates,cursor=cursor,policySamples=metrics['policySamples'],valueSamples=metrics['valueSamples'],status='running')),'utf-8')
    while epoch<args.epochs:
        model.train();start=time.perf_counter()
        remaining=None if args.limit is None else max(0,args.limit-cursor)
        if not checkpoint.exists():save_state()
        for sample in stream('train',f'{args.run}-a{attempt_id}-e{epoch}-c{cursor}',remaining,cursor,args.source_mode,args.expert_manifest):
            cursor+=1;key=tuple(sample['spatial'].shape);pending.setdefault(key,[]).append(sample)
            if len(pending[key])>=args.batch:
                rows=pending[key];pending[key]=[];update(rows)
        for key in list(pending):
            if pending[key]:rows=pending[key];pending[key]=[];update(rows)
        model.export(output/f'epoch-{epoch+1}')
        model.eval();dev_metrics=[];dev_groups={}
        with torch.no_grad():
            for sample in stream('dev',f'{args.run}-a{attempt_id}-dev-e{epoch}',args.limit,0,args.source_mode):
                key=tuple(sample['spatial'].shape);dev_groups.setdefault(key,[]).append(sample)
                if len(dev_groups[key])>=args.batch:
                    rows=dev_groups[key];dev_groups[key]=[];objective,stats=loss(model,rows);dev_metrics.append((float(objective),len(rows)))
            for rows in dev_groups.values():
                if rows:objective,stats=loss(model,rows);dev_metrics.append((float(objective),len(rows)))
        assert dev_metrics,'开发流没有合格样本'
        score=sum(v*n for v,n in dev_metrics)/sum(n for _,n in dev_metrics)
        record=dict(epoch=epoch+1,updates=updates,cursor=cursor,devObjective=score,seconds=time.perf_counter()-start,formal=args.limit is None)
        if best is None or score<best['devObjective']:
            best=record;model.export(output/'model')
        history.append(record);epoch+=1;cursor=0;save_state()
        changed=[n for n,p in model.named_parameters() if hashlib.sha256(p.detach().numpy().tobytes()).hexdigest()!=start_hashes[n]]
        (output/'training.json').write_text(json.dumps(dict(settings=vars(args),history=history,best=best,gradientNonzeroTensors=sorted(grad),actualChangedTensors=changed,optimizerIncludesAllParameters=True,formal=args.limit is None),ensure_ascii=False,indent=2),'utf-8')
        print(json.dumps(record),flush=True)
    (output/'complete.json').write_text(json.dumps(dict(complete=True,formal=args.limit is None,best=best,updates=updates,modelSha256=hashlib.sha256((output/'model.bin').read_bytes()).hexdigest())),'utf-8')


if __name__=='__main__':main()
