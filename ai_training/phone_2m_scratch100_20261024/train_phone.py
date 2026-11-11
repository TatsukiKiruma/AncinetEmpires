"""仅在小米ARM64 Linux用户空间执行完整2M模型100父局一次训练。"""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import pickle
import platform
import random
import resource
import struct
import time

import numpy as np
import torch
from torch.nn import functional as F
from model import DualStreamModel
from batch_model import collate,forward_batch

WORK=Path('/work')
OUT=WORK/'output'


def load(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def sha(p):
    with Path(p).open('rb') as s:return hashlib.file_digest(s,'sha256').hexdigest()
def atomic(p,value):
    p=Path(p);temporary=p.with_name(p.name+'.pending')
    with temporary.open('w',encoding='utf-8') as f:
        json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
    os.replace(temporary,p)
    fd=os.open(p.parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)


def tensor_digest(mapping):
    h=hashlib.sha256()
    for name,value in sorted(mapping.items()):
        h.update(str(name).encode())
        if isinstance(value,torch.Tensor):h.update(str(value.dtype).encode());h.update(str(tuple(value.shape)).encode());h.update(value.detach().contiguous().numpy().tobytes())
        elif isinstance(value,dict):h.update(tensor_digest(value).encode())
        else:h.update(pickle.dumps(value,protocol=4))
    return h.hexdigest()


def rng_state():return {'python':random.getstate(),'numpy':np.random.get_state(),'torch':torch.get_rng_state()}
def rng_digest(value):
    h=hashlib.sha256(pickle.dumps(value['python'],protocol=4));n=value['numpy']
    h.update(pickle.dumps((n[0],n[2],n[3],n[4]),protocol=4));h.update(n[1].tobytes());h.update(value['torch'].numpy().tobytes())
    return h.hexdigest()


def exact(stream,size):
    data=stream.read(size)
    if len(data)!=size:raise EOFError('训练分片截断')
    return data


def samples(dataset,skip,verified):
    cursor=0
    for report in dataset['reports']:
        count=report['samples']
        if cursor+count<=skip:cursor+=count;continue
        p=WORK/'data'/(report['parentId']+'.frames.gz')
        if p.name not in verified:
            if sha(p)!=report['sha256']:raise ValueError('训练分片摘要变化：'+p.name)
            verified.add(p.name)
        consumed=0
        with gzip.open(p,'rb') as stream:
            while first:=stream.read(1):
                ms,bs=struct.unpack('<II',first+exact(stream,7))
                if not 0<ms<2**24 or not 0<bs<2**29:raise ValueError('样本长度无效')
                meta=exact(stream,ms);raw=exact(stream,bs)
                if cursor>=skip:
                    meta=json.loads(meta)
                    if hashlib.sha256(raw).hexdigest()!=meta['sha256']:raise ValueError('样本字节摘要变化')
                    row={'source':meta['sources'][0]}
                    for e in meta['arrays']:
                        a=raw[e['offset']:e['offset']+e['bytes']]
                        row[e['name']]=torch.from_numpy(np.frombuffer(a,dtype=e['dtype']).copy().reshape(e['shape']))
                    yield row
                consumed+=1;cursor+=1
        if consumed!=count:raise ValueError('训练分片样本计数变化')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--phase',choices=['before-resume','continue'],required=True);args=parser.parse_args()
    setup_started=time.monotonic()
    if platform.machine()!='aarch64' or not (WORK/'PHONE_AUTHORIZED.json').is_file():raise RuntimeError('只允许已授权的小米ARM64训练环境')
    auth=load(WORK/'PHONE_AUTHORIZED.json')
    if auth.get('serial')!='c2357770' or auth.get('authorizedParents')!=100:raise RuntimeError('手机授权身份不符')
    OUT.mkdir(exist_ok=True)
    protocol=load(WORK/'PROTOCOL.json');dataset=load(WORK/'DATASET.json')
    if protocol['initialization']!='random_from_seed_no_existing_weights' or dataset['parents']!=100:raise RuntimeError('初始化或父局预算变化')
    if protocol['automaticFullTraining'] or protocol['authorizedEpochsOverPilot']!=1:raise RuntimeError('仅授权100局一遍')
    for name in ['model.py','accurate_ops.py','batch_model.py','train_phone.py','PROTOCOL.json','DATASET.json']:
        if sha(WORK/name)!=auth['files'][name]:raise RuntimeError('执行身份变化：'+name)
    identity={name:sha(WORK/name) for name in ['model.py','accurate_ops.py','batch_model.py','train_phone.py','PROTOCOL.json','DATASET.json']}
    torch.set_num_threads(protocol['torchThreads']);torch.set_num_interop_threads(1);torch.use_deterministic_algorithms(True)
    seed=protocol['seed'];random.seed(seed);np.random.seed(seed);torch.manual_seed(seed);torch.set_default_dtype(torch.float32)
    model=DualStreamModel(seed=seed).accurate_reductions(False)
    params=list(model.parameters());parameter_count=sum(p.numel() for p in params)
    trainable=sum(p.numel() for p in params if p.requires_grad)
    if parameter_count!=1966910 or trainable!=parameter_count or any(p.dtype!=torch.float32 for p in params):raise RuntimeError('必须完整FP32可训练1966910参数')
    optimizer=torch.optim.AdamW(params,lr=protocol['peakLearningRate'],betas=tuple(protocol['betas']),eps=protocol['eps'],weight_decay=protocol['weightDecay'],foreach=False,fused=False)
    if {id(p) for g in optimizer.param_groups for p in g['params']}!={id(p) for p in params}:raise RuntimeError('优化器未包含全部参数')
    total=protocol['referenceTotalUpdates'];warm=max(1,math.ceil(total*protocol['warmupFraction']));ratio=protocol['endLearningRate']/protocol['peakLearningRate']
    def factor(step):
        if step<warm:return (step+1)/warm
        fraction=min(1.,(step-warm)/max(1,total-warm))
        return ratio+(1-ratio)*.5*(1+math.cos(math.pi*fraction))
    scheduler=torch.optim.lr_scheduler.LambdaLR(optimizer,factor)
    global_step=0;cursor=0;generation=0;gradient_seen=set();verified=set();last_saved=time.monotonic()
    totals={'forwardSeconds':0.,'backwardSeconds':0.,'updateSeconds':0.,'dataSeconds':0.,'checkpointSeconds':0.,'resourcePauseSeconds':0.,'activeTrainSeconds':0.,'policyLabels':0,'valueLabels':0,'maxTemperatureC':0.,'maxRssKiB':0}
    started=time.monotonic();initial_weights=None
    if args.phase=='continue':
        pointer=load(OUT/'LATEST.json');file=OUT/pointer['file']
        if sha(file)!=pointer['sha256']:raise RuntimeError('恢复检查点文件摘要不符')
        saved=torch.load(file,weights_only=False,map_location='cpu')
        if saved['identity']!=identity:raise RuntimeError('恢复源码/数据/配置身份变化')
        model.load_state_dict(saved['model']);optimizer.load_state_dict(saved['optimizer']);scheduler.load_state_dict(saved['scheduler'])
        global_step=saved['global_step'];cursor=saved['cursor'];generation=saved['generation'];totals=saved['totals'];gradient_seen=set(saved['gradient_seen']);initial_weights=saved['initial_weights']
        random.setstate(saved['rng']['python']);np.random.set_state(saved['rng']['numpy']);torch.set_rng_state(saved['rng']['torch'])
        checks={'model':tensor_digest(model.state_dict())==saved['digests']['model'],'optimizer':tensor_digest(optimizer.state_dict())==saved['digests']['optimizer'],
                'scheduler':tensor_digest(scheduler.state_dict())==saved['digests']['scheduler'],'rng':rng_digest(rng_state())==saved['digests']['rng'],
                'cursor':cursor==pointer['cursor'],'globalStep':global_step==pointer['global_step'],'order':saved['parentOrder']==[r['parentId'] for r in dataset['reports']]}
        atomic(OUT/'RESUME_VERIFIED.json',{'passed':all(checks.values()),'checks':checks,'global_step':global_step,'cursor':cursor,'checkpointSha256':pointer['sha256'],'updatedUtc':dt.datetime.now(dt.timezone.utc).isoformat()})
        if not all(checks.values()):raise RuntimeError('恢复状态未完整保持')
    else:
        if (OUT/'LATEST.json').exists():raise RuntimeError('已有训练检查点，拒绝重新初始化')
        model.export(OUT/'initial')
        initial_weights={name:hashlib.sha256(p.detach().numpy().tobytes()).hexdigest() for name,p in model.named_parameters()}
    atomic(OUT/'MODEL_RUNTIME.json',{'model':protocol['model'],'parameters':parameter_count,'trainableParameters':trainable,'optimizerParameterCount':sum(p.numel() for g in optimizer.param_groups for p in g['params']),
           'torch':torch.__version__,'python':platform.python_version(),'machine':platform.machine(),'kernel':platform.release(),'pid':os.getpid(),'phase':args.phase,'randomSeed':seed,'dtype':'float32',
           'tensors':{name:list(p.shape) for name,p in model.named_parameters()},'initialWeightsSha256':sha(OUT/'initial.bin'),'sourceIdentity':identity,'referenceTotalUpdates':total,'warmupUpdates':warm,'setupSecondsAfterImports':time.monotonic()-setup_started})

    def progress(phase,extra=None):
        record={'schema':'phone-2m-scratch100-progress-v1','phase':phase,'pid':os.getpid(),'global_step':global_step,'cursor':cursor,'authorizedSamples':dataset['samples'],'authorizedParents':100,
                'totalUpdates':dataset['updates'],'nextLearningRate':optimizer.param_groups[0]['lr'],'phaseWallSeconds':time.monotonic()-started,'updatedMs':int(time.time()*1000),'totals':totals,
                'computerRequired':False,'automaticFullTraining':False}
        if extra:record.update(extra)
        atomic(OUT/'PROGRESS.json',record)

    def checkpoint(reason):
        nonlocal generation,last_saved
        start=time.monotonic();generation+=1
        remaining=cursor;next_parent=None;next_row=0
        for r in dataset['reports']:
            if remaining<r['samples']:next_parent=r['parentId'];next_row=remaining;break
            remaining-=r['samples']
        rng=rng_state();state={'model':model.state_dict(),'optimizer':optimizer.state_dict(),'scheduler':scheduler.state_dict(),'rng':rng,'global_step':global_step,'cursor':cursor,'epoch':0,
                             'generation':generation,'identity':identity,'initial_weights':initial_weights,'gradient_seen':sorted(gradient_seen),'totals':totals,'parentOrder':[r['parentId'] for r in dataset['reports']],
                             'nextBatchStartsAtCursor':cursor,'nextParentId':next_parent,'nextParentRow':next_row,'pendingAccumulatedGradients':False,'reason':reason}
        state['digests']={'model':tensor_digest(state['model']),'optimizer':tensor_digest(state['optimizer']),'scheduler':tensor_digest(state['scheduler']),'rng':rng_digest(rng)}
        file=OUT/('checkpoint-'+str(generation%2)+'.pt');tmp=file.with_suffix('.pending.pt')
        with tmp.open('wb') as stream:torch.save(state,stream);stream.flush();os.fsync(stream.fileno())
        os.replace(tmp,file)
        pointer={'file':file.name,'sha256':sha(file),'generation':generation,'global_step':global_step,'cursor':cursor,'reason':reason,'stateDigests':state['digests']}
        atomic(OUT/'LATEST.json',pointer);totals['checkpointSeconds']+=time.monotonic()-start;last_saved=time.monotonic()
        with (OUT/'CHECKPOINT_TIMES.jsonl').open('a',encoding='utf-8') as stream:stream.write(json.dumps({'generation':generation,'global_step':global_step,'cursor':cursor,'reason':reason,'seconds':time.monotonic()-start,'epoch':time.time()})+'\n')
        return pointer

    paused=False
    def resources():
        nonlocal paused
        start=time.monotonic();pause_saved=False
        while True:
            if (WORK/'STOP').exists():checkpoint('user_stop');progress('stopped');raise SystemExit(0)
            try:
                r=load(WORK/'RESOURCE.json')
                if not r.get('valid') or time.time()-r['epoch']>30:raise RuntimeError('资源监测无效或超过30秒未更新')
                temp=r['temperatureC'];battery=r['batteryPercent'];free=os.statvfs(WORK).f_bavail*os.statvfs(WORK).f_frsize
                totals['maxTemperatureC']=max(totals['maxTemperatureC'],temp)
                if paused:paused=not(temp<=protocol['temperatureResumeC'] and battery>=protocol['batteryResumePercent'] and free>=protocol['freeSpaceResumeBytes'])
                else:paused=temp>=protocol['temperaturePauseC'] or battery<protocol['batteryPausePercent'] or free<protocol['freeSpacePauseBytes']
                if not paused:break
                reason='resource_threshold'
            except (OSError,ValueError,KeyError,RuntimeError) as error:paused=True;r={'error':str(error)};reason='monitor_unavailable'
            if not pause_saved:checkpoint(reason);pause_saved=True
            progress('waiting_resources',{'resource':r});time.sleep(5)
        totals['resourcePauseSeconds']+=time.monotonic()-start
        totals['maxRssKiB']=max(totals['maxRssKiB'],resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
        return r

    if args.phase=='before-resume':checkpoint('initialized')
    progress('ready')
    iterator=samples(dataset,cursor,verified)
    model.train()
    while cursor<dataset['samples']:
        r=resources();batch=[];read_start=time.monotonic()
        for _ in range(min(protocol['effectiveBatch'],dataset['samples']-cursor)):batch.append(next(iterator))
        totals['dataSeconds']+=time.monotonic()-read_start
        pden=sum(float(row['weight'].item())*bool(row['policyMask'].item()) for row in batch)
        vden=sum(float(row['weight'].item())*bool(row['valueMask'].item()) for row in batch)
        optimizer.zero_grad(set_to_none=True);active_start=time.monotonic();ploss=vloss=0.
        for row in batch:
            start=time.monotonic();x=collate([row]);out=forward_batch(model,x)
            prior=torch.tensor(row['source']['prior'],dtype=torch.float32)[None]
            ce=F.cross_entropy(out['logits']+prior,x['target'],reduction='sum')
            value_ce=-(x['valueTarget']*out['valueLogits'].log_softmax(-1)).sum()
            brier=(out['valueProbs']-x['valueTarget']).square().sum()
            weight=float(row['weight'].item());pm=bool(row['policyMask'].item());vm=bool(row['valueMask'].item())
            policy=ce*(weight/max(pden,1e-12))*pm;value=(value_ce+brier)*(weight/max(vden,1e-12))*vm
            objective=protocol['policyWeight']*policy+protocol['valueWeight']*value
            if not torch.isfinite(objective):raise RuntimeError('手机loss非有限值')
            totals['forwardSeconds']+=time.monotonic()-start;start=time.monotonic();objective.backward();totals['backwardSeconds']+=time.monotonic()-start
            ploss+=float(policy.detach());vloss+=float(value.detach());totals['policyLabels']+=int(pm);totals['valueLabels']+=int(vm)
        start=time.monotonic();norm=torch.nn.utils.clip_grad_norm_(params,protocol['gradientClipNorm'],error_if_nonfinite=True,foreach=False)
        for name,p in model.named_parameters():
            if p.grad is not None and bool(p.grad.abs().sum()>0):gradient_seen.add(name)
        optimizer.step();scheduler.step();global_step+=1;cursor+=len(batch);totals['updateSeconds']+=time.monotonic()-start;totals['activeTrainSeconds']+=time.monotonic()-active_start
        with (OUT/'METRICS.jsonl').open('a',encoding='utf-8') as log:
            log.write(json.dumps({'global_step':global_step,'cursor':cursor,'batchSamples':len(batch),'policyLabels':int(pden),'valueLabels':int(vden),'policyLoss':ploss,'valueLoss':vloss,
                                  'gradientNorm':float(norm),'nextLearningRate':optimizer.param_groups[0]['lr'],'temperatureC':r['temperatureC'],'batteryPercent':r['batteryPercent'],
                                  'activeTrainSeconds':totals['activeTrainSeconds'],'updatedMs':int(time.time()*1000)})+'\n');log.flush()
        if global_step==1:
            optimizer_state_parameters=sum(v['exp_avg'].numel() for v in optimizer.state.values() if 'exp_avg' in v)
            if optimizer_state_parameters!=parameter_count:raise RuntimeError('首次更新后AdamW状态未覆盖全部参数')
            atomic(OUT/'FIRST_UPDATE.json',{'global_step':global_step,'cursor':cursor,'parameters':parameter_count,'trainableParameters':trainable,'optimizerParameters':sum(p.numel() for g in optimizer.param_groups for p in g['params']),
                   'optimizerStateParameters':optimizer_state_parameters,'finiteLossAndGradient':True,'gradientNorm':float(norm),'policyLoss':ploss,'valueLoss':vloss,'initialWeightsUsed':'new_random_seed_20261024','phonePid':os.getpid()})
            checkpoint('first_update')
        if args.phase=='before-resume' and global_step==protocol['resumeTestAfterUpdates']:
            checkpoint('controlled_resume_barrier');progress('resume_barrier');return 75
        if global_step%protocol['checkpointEveryUpdates']==0 or time.monotonic()-last_saved>=protocol['checkpointEverySeconds']:checkpoint('periodic')
        progress('training',{'resource':r,'lastBatchSamples':len(batch)})
    try:next(iterator);raise RuntimeError('超出已授权100局样本预算')
    except StopIteration:pass
    if global_step!=dataset['updates']:raise RuntimeError('实际更新数与100局预算不符')
    final=checkpoint('authorized_100_parents_complete');model.export(OUT/'final')
    changed=[name for name,p in model.named_parameters() if hashlib.sha256(p.detach().numpy().tobytes()).hexdigest()!=initial_weights[name]]
    atomic(OUT/'COMPLETE.json',{'status':'complete','parents':100,'samples':cursor,'updates':global_step,'policyLabels':totals['policyLabels'],'valueLabels':totals['valueLabels'],
           'totals':totals,'finalCheckpoint':final,'gradientNonzeroTensors':sorted(gradient_seen),'changedTensors':changed,'resumeVerified':load(OUT/'RESUME_VERIFIED.json')['passed'],
           'automaticFullTraining':False,'nextAction':'保存后停止，等待用户决定是否续训','completedUtc':dt.datetime.now(dt.timezone.utc).isoformat()})
    progress('complete');return 0


if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as error:
        OUT.mkdir(exist_ok=True)
        import traceback
        atomic(OUT/('ERROR-'+str(int(time.time()))+'.json'),{'error':str(error),'traceback':traceback.format_exc(),'pid':os.getpid()})
        raise
