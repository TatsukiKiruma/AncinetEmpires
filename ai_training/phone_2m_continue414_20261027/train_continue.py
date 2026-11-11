"""小米8两worker同步续训：继承2000局完整状态，只追加第2001—2414局一遍。"""
import argparse
import datetime as dt
import hashlib
import json
import math
import multiprocessing as mp
import os
from pathlib import Path
import platform
import random
import threading
import time
import traceback
import numpy as np
import torch
import train_phone as base
import workers_runtime as rt
from streaming import Stream
from model import DualStreamModel

WORK=Path('/continue2414');OUT=WORK/'output';N=1966910
base.WORK=WORK;base.OUT=OUT;rt.WORK=WORK;rt.base.WORK=WORK


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--resume',action='store_true');args=parser.parse_args()
    launch=time.monotonic()
    if platform.machine()!='aarch64':raise RuntimeError('优化器更新只允许在小米ARM64运行')
    auth=base.load(WORK/'PHONE_AUTHORIZED.json');protocol=base.load(WORK/'PROTOCOL.json');plan=base.load(WORK/'PLAN.json')
    if auth['serial']!='c2357770' or auth['authorizedParents']!=414 or protocol['workers']!=2:raise RuntimeError('续训预算或worker数不符')
    for name,digest in auth['files'].items():
        if base.sha(WORK/name)!=digest:raise RuntimeError('执行源码/配置摘要变化：'+name)
    if base.sha(Path(protocol['nodeRuntime']))!=protocol['nodeRuntimeSha256']:raise RuntimeError('复用的手机Node运行时摘要不符')
    OUT.mkdir(exist_ok=True)
    if not args.resume and (OUT/'LATEST.json').exists():raise RuntimeError('已有续训状态，拒绝重新开始')
    torch.set_num_threads(protocol['coordinatorThreads']);torch.set_num_interop_threads(1);torch.use_deterministic_algorithms(True)
    seed=protocol['seed'];random.seed(seed);np.random.seed(seed);torch.manual_seed(seed)
    model=DualStreamModel(seed=seed).accurate_reductions(False)
    if sum(p.numel() for p in model.parameters())!=N or sum(p.numel() for p in model.parameters() if p.requires_grad)!=N:raise RuntimeError('必须保留全部1966910参数可训练')
    optimizer=torch.optim.AdamW(model.parameters(),lr=protocol['peakLearningRate'],betas=tuple(protocol['betas']),eps=protocol['eps'],weight_decay=protocol['weightDecay'],foreach=False,fused=False)
    if {id(p) for p in model.parameters()}!={id(p) for g in optimizer.param_groups for p in g['params']}:raise RuntimeError('优化器没有覆盖全部参数')
    total=protocol['referenceTotalUpdates'];warm=math.ceil(total*protocol['warmupFraction']);ratio=protocol['endLearningRate']/protocol['peakLearningRate']
    def factor(step):
        if step<warm:return (step+1)/warm
        f=min(1.,(step-warm)/max(1,total-warm));return ratio+(1-ratio)*.5*(1+math.cos(math.pi*f))
    scheduler=torch.optim.lr_scheduler.LambdaLR(optimizer,factor)
    if args.resume:
        pointer=base.load(OUT/'LATEST.json');source=OUT/pointer['file'];expected=pointer['sha256']
    else:source=WORK/'base-checkpoint.pt';expected=plan['baseCheckpointSha256']
    if base.sha(source)!=expected:raise RuntimeError('完整恢复检查点摘要不符')
    saved=torch.load(source,map_location='cpu',weights_only=False)
    if args.resume and saved['identity']!=auth['files']:raise RuntimeError('本段恢复源码身份不一致')
    model.load_state_dict(saved['model']);optimizer.load_state_dict(saved['optimizer']);scheduler.load_state_dict(saved['scheduler'])
    random.setstate(saved['rng']['python']);np.random.set_state(saved['rng']['numpy']);torch.set_rng_state(saved['rng']['torch'])
    checks={'model':base.tensor_digest(model.state_dict())==saved['digests']['model'],'optimizer':base.tensor_digest(optimizer.state_dict())==saved['digests']['optimizer'],
            'scheduler':base.tensor_digest(scheduler.state_dict())==saved['digests']['scheduler'],'rng':base.rng_digest(base.rng_state())==saved['digests']['rng']}
    if not all(checks.values()):raise RuntimeError('模型/AdamW/scheduler/RNG未完整恢复')
    step=saved['global_step'];cursor=saved['cursor'] if args.resume else 0;generation=saved['generation'] if args.resume else 0
    if not args.resume and (step!=plan['baseStep'] or saved['cursor']!=plan['baseSegmentSamples'] or saved['cumulativeSamples']!=plan['baseSamples']
        or saved['completedParentsBeforeSegment']+saved['completedParents']!=plan['previousParents']
        or saved['identity']!=plan['baseCheckpointIdentity'] or saved['parentOrder']!=plan['baseParentOrder']):raise RuntimeError('必须完整继承已完成2000局的主检查点')
    worker_rng=saved.get('workerRngStates')
    if not worker_rng or len(worker_rng)!=2:raise RuntimeError('缺少两个训练worker的完整随机状态')
    totals=saved['totals'] if args.resume else {'dataSeconds':0.,'parallelComputeWallSeconds':0.,'workerComputeSeconds':[0.,0.],'updateSeconds':0.,'checkpointSeconds':0.,'resourceWaitSeconds':0.,'policyLabels':0,'valueLabels':0}
    initial_rng=base.rng_state();count=plan['intendedSamples'];updates=math.ceil(count/8);initial_step=plan['baseStep'];previous_samples=plan['baseSamples']
    base.atomic(OUT/('RESTORE_VERIFIED.json' if args.resume else 'BASE_RESUME_VERIFIED.json'),{'passed':True,'checks':checks,'sourceCheckpointSha256':expected,'globalStep':step,'cursor':cursor,'cumulativeSamples':previous_samples+cursor,'nextLearningRate':optimizer.param_groups[0]['lr'],'inheritedParents':plan['previousParents'],'workerRngStatesInherited':True})
    shared=OUT/'shared';shared.mkdir(exist_ok=True);flat=rt.mapping(shared/'weights.bin');offset=0
    for p in model.parameters():flat[offset:offset+p.numel()].copy_(p.detach().reshape(-1));offset+=p.numel()
    rt.bind(model,flat);grads=[rt.mapping(shared/f'gradient-{r}.bin') for r in range(2)]
    context=mp.get_context('spawn');processes=[];pipes=[];stop_monitor=threading.Event();sampler=None;iterator=None;started=None;last_saved=time.monotonic()

    def position():
        left=cursor;done=0
        for p in plan['inputs']:
            if left<p['expectedSamples']:return done,p['parentId'],left
            left-=p['expectedSamples'];done+=1
        return done,None,0

    def progress(phase,extra=None):
        done,parent,row=position()
        record={'phase':phase,'workers':2,'cursor':cursor,'samples':count,'completedParents':done,'parents':plan['parents'],'cumulativeCompletedParents':plan['previousParents']+done,'currentParentId':parent,'currentParentRow':row,
                'globalStep':step,'segmentUpdates':step-initial_step,'totalSegmentUpdates':updates,'cumulativeSamples':previous_samples+cursor,'wallSeconds':time.monotonic()-started if started else 0,
                'totals':totals,'epoch':time.time(),'computerRequired':False,'automaticBeyond2414':False}
        if extra:record.update(extra)
        base.atomic(OUT/'PROGRESS.json',record)

    def checkpoint(reason):
        nonlocal generation,last_saved
        tick=time.monotonic();generation+=1;rng=base.rng_state();done,parent,row=position()
        state={'model':model.state_dict(),'optimizer':optimizer.state_dict(),'scheduler':scheduler.state_dict(),'rng':rng,'workerRngStates':worker_rng,'global_step':step,'cursor':cursor,
               'cumulativeSamples':previous_samples+cursor,'completedParentsBeforeSegment':plan['previousParents'],'completedParents':done,'nextParentId':parent,'nextParentRow':row,'epoch':0,'generation':generation,
               'pendingAccumulatedGradients':False,'identity':auth['files'],'parentOrder':[p['parentId'] for p in plan['inputs']],'initialCheckpointSha256':plan['baseCheckpointSha256'],'totals':totals,'reason':reason}
        state['digests']={'model':base.tensor_digest(state['model']),'optimizer':base.tensor_digest(state['optimizer']),'scheduler':base.tensor_digest(state['scheduler']),'rng':base.rng_digest(rng)}
        target=OUT/f'checkpoint-{generation%2}.pt';tmp=target.with_suffix('.pending.pt')
        with tmp.open('wb') as stream:torch.save(state,stream);stream.flush();os.fsync(stream.fileno())
        os.replace(tmp,target)
        pointer={'file':target.name,'sha256':base.sha(target),'globalStep':step,'cursor':cursor,'reason':reason,'stateDigests':state['digests']};base.atomic(OUT/'LATEST.json',pointer)
        totals['checkpointSeconds']+=time.monotonic()-tick;last_saved=time.monotonic();return pointer

    try:
        for rank in range(2):
            parent,child=context.Pipe();p=context.Process(target=rt.worker,args=(child,rank,shared,protocol,None if worker_rng is None else worker_rng[rank]),name=f'train-worker-{rank}')
            p.start();child.close();processes.append(p);pipes.append(parent)
        identities=[rt.receive(pipe,p) for pipe,p in zip(pipes,processes)]
        if worker_rng is not None:
            expected_rng=[base.rng_digest({'python':r['python'],'numpy':r['numpy'],'torch':torch.from_numpy(r['torch'])}) for r in worker_rng]
            rng_checks=[i['rngDigest']==e for i,e in zip(identities,expected_rng)]
            base.atomic(OUT/'WORKER_RNG_RESTORED.json',{'passed':all(rng_checks),'checks':rng_checks,'expected':expected_rng,'actual':[i['rngDigest'] for i in identities]})
            if not all(rng_checks):raise RuntimeError('各训练worker的RNG恢复不一致')
        random.setstate(initial_rng['python']);np.random.set_state(initial_rng['numpy']);torch.set_rng_state(initial_rng['torch'])
        iterator=Stream(cursor)
        base.atomic(OUT/'WORKERS.json',{'coordinator':rt.proc(os.getpid()),'workers':[rt.proc(i['pid']) for i in identities],'encoder':rt.proc(iterator.process.pid),
              'effectiveBatch':8,'threadsPerWorker':2,'synchronization':'两训练worker读取同一权重；完成批次屏障后合计梯度，只执行一次AdamW'})
        sampler=threading.Thread(target=rt.monitor,args=(OUT,[os.getpid(),iterator.process.pid]+[p.pid for p in processes],stop_monitor),daemon=True);sampler.start()
        started=time.monotonic();progress('training',{'setupSeconds':started-launch})
        paused=False
        while cursor<count:
            pause_start=time.monotonic();waiting=False
            while True:
                if (WORK/'STOP').exists():checkpoint('user_stop');progress('stopped');return 2
                try:
                    r=base.load(WORK/'RESOURCE.json')
                    if not r['valid'] or time.time()-r['epoch']>30:raise RuntimeError('监测无效或过期')
                    fs=os.statvfs(WORK);free=fs.f_bavail*fs.f_frsize
                    if paused:paused=not(r['temperatureC']<=42 and r['batteryPercent']>=25 and free>=protocol['freeSpaceResumeBytes'])
                    else:paused=r['temperatureC']>=45 or r['batteryPercent']<20 or free<protocol['freeSpacePauseBytes']
                    if not paused:break
                except Exception:paused=True
                if not waiting:checkpoint('resource_wait')
                waiting=True;progress('waiting_resources');time.sleep(5)
            if waiting:totals['resourceWaitSeconds']+=time.monotonic()-pause_start
            tick=time.monotonic()
            try:rows=[next(iterator) for _ in range(min(8,count-cursor))]
            except Exception:checkpoint('input_pipeline_error');progress('blocked_input_pipeline');raise
            pden=sum(float(x['weight'].item())*bool(x['policyMask'].item()) for x in rows);vden=sum(float(x['weight'].item())*bool(x['valueMask'].item()) for x in rows)
            encoded=[{k:v.numpy() if isinstance(v,torch.Tensor) else v for k,v in row.items()} for row in rows];totals['dataSeconds']+=time.monotonic()-tick
            tick=time.monotonic()
            for rank,pipe in enumerate(pipes):pipe.send((encoded[rank::2],pden,vden))
            results=[rt.receive(pipe,p) for pipe,p in zip(pipes,processes)];totals['parallelComputeWallSeconds']+=time.monotonic()-tick
            worker_rng=[r['rng'] for r in results]
            for rank,r in enumerate(results):totals['workerComputeSeconds'][rank]+=r['computeSeconds']
            if sum(x['samples'] for x in results)!=len(rows):raise RuntimeError('worker消费样本不符')
            aggregate=torch.zeros(N)
            for grad in grads:aggregate.add_(grad)
            if cursor==0:
                tick=time.monotonic();model.zero_grad(set_to_none=True)
                for row in rows:rt.objective(model,row,pden,vden,protocol)[0].backward()
                serial=torch.cat([p.grad.reshape(-1) if p.grad is not None else torch.zeros(p.numel()) for p in model.parameters()]);difference=float((serial-aggregate).abs().max());relative=float(torch.linalg.vector_norm(serial-aggregate)/torch.linalg.vector_norm(serial).clamp_min(1e-12))
                passed=bool(torch.allclose(serial,aggregate,rtol=2e-3,atol=2e-5)) and relative<1e-4
                base.atomic(OUT/'GRADIENT_VERIFIED.json',{'passed':passed,'maximumAbsoluteDifference':difference,'relativeL2Difference':relative,'additionalOptimizerUpdates':0,'seconds':time.monotonic()-tick})
                if not passed:raise RuntimeError('2worker梯度归一化不一致')
                del serial
            tick=time.monotonic();offset=0
            for p in model.parameters():p.grad=aggregate[offset:offset+p.numel()].view_as(p);offset+=p.numel()
            norm=torch.nn.utils.clip_grad_norm_(model.parameters(),1.,error_if_nonfinite=True,foreach=False);optimizer.step();scheduler.step();step+=1;cursor+=len(rows)
            totals['updateSeconds']+=time.monotonic()-tick;totals['policyLabels']+=int(pden);totals['valueLabels']+=int(vden)
            with (OUT/'METRICS.jsonl').open('a',encoding='utf-8') as log:log.write(json.dumps({'globalStep':step,'segmentUpdates':step-initial_step,'cursor':cursor,'samples':len(rows),'policyLoss':sum(x['policyLoss'] for x in results),'valueLoss':sum(x['valueLoss'] for x in results),'gradientNorm':float(norm),'nextLearningRate':optimizer.param_groups[0]['lr'],'epoch':time.time()})+'\n')
            if step-initial_step==1 or (step-initial_step)%100==0 or time.monotonic()-last_saved>=300:checkpoint('periodic')
            progress('training')
        try:next(iterator);raise RuntimeError('输入超过第2001—2414局授权预算')
        except StopIteration:pass
        if step-initial_step!=updates:raise RuntimeError('实际更新数不符')
        final=checkpoint('authorized_414_parents_complete');model.export(OUT/'final')
        base.atomic(OUT/'COMPLETE.json',{'status':'complete','workers':2,'parents':414,'cumulativeParents':2414,'samples':cursor,'updates':step-initial_step,'globalStep':step,'cumulativeSamples':previous_samples+cursor,
              'finalCheckpoint':final,'wallSeconds':time.monotonic()-started,'totals':totals,'automaticBeyond2414':False,'completedUtc':dt.datetime.now(dt.timezone.utc).isoformat()})
        progress('complete');return 0
    finally:
        stop_monitor.set()
        if sampler:sampler.join(10)
        if iterator:iterator.close()
        for pipe in pipes:
            try:pipe.send(None)
            except (OSError,EOFError):pass
        for p in processes:
            p.join(10)
            if p.is_alive():p.terminate();p.join(5)
        for pipe in pipes:pipe.close()


if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception:
        OUT.mkdir(exist_ok=True);base.atomic(OUT/('ERROR-'+str(int(time.time()))+'.json'),{'error':traceback.format_exc(),'epoch':time.time(),'pid':os.getpid()});raise
