"""三星独立续训到100k；不执行实战筛选、封存测试或自动传回。"""
import copy
from concurrent.futures import ThreadPoolExecutor
import json
import os
import random
import signal
import time
import traceback
import uuid
import torch
from phone_core import WORK,OUT,read,sha,atomic,validate,instantiate,Encoder,resource,resource_bad,snapshot,Checkpoints,tensor_digest,update
from sampler_mobile import MobileSampler
from phone_offline import evaluate

stop_signal=False
def signal_stop(_number,_frame):
    global stop_signal
    stop_signal=True

def main(probe_updates=None):
    OUT.mkdir(exist_ok=True)
    contract=validate();config=read(WORK/'SCIENCE_CONFIG.json');runtime=read(WORK/'PHONE_RUNTIME.json')
    if (OUT/'COMPLETE.json').exists():return
    if (OUT/'BLOCKED.json').exists():raise RuntimeError('已有异常阻断，禁止自动跳过坏批')
    pointer=read(OUT/'LATEST.json') if (OUT/'LATEST.json').exists() else None
    source=OUT/pointer['file'] if pointer else WORK/'initial-checkpoint.pt'
    expected=pointer['sha256'] if pointer else runtime['originalCheckpointSha256']
    if sha(source)!=expected:raise ValueError('恢复检查点SHA不符')
    saved=torch.load(source,map_location='cpu',weights_only=False)
    if saved.get('engineeringOnly') or saved.get('pendingAccumulatedGradients'):raise ValueError('不能恢复工程或半批状态')
    if pointer and saved['contractSha256']!=contract:raise ValueError('本地续接合同变化')
    if not pointer and (saved['updates']!=2761 or saved['sampler']['cursor']!=88352 or saved['config']!=config):
        raise ValueError('必须精确续接PC暂停点和原100k日程')
    torch.set_num_interop_threads(1)
    model,optimizer,scheduler,receipt=instantiate(saved,config)
    sampler=MobileSampler(WORK,config['seed']);sampler.load_state_dict(saved['sampler'])
    dropout=random.Random(0);dropout.setstate(saved['dropoutRng'])
    u=saved['updates'];diagnostics=copy.deepcopy(saved.get('diagnostics',[]))
    segment_start=u
    generation=uuid.uuid4().hex;checkpoint=Checkpoints();last_saved=time.monotonic();started=last_saved
    last_pointer=None;encoder=None;prefetch=None;pending=None;reason=None;error=None
    metrics_stream=None
    complete=snapshot(model,optimizer,scheduler,sampler,dropout,u,config,contract,diagnostics)
    atomic(OUT/f'RESTORE-{generation}.json',dict(receipt,sourceSha256=expected,update=u,samples=u*32,
        schedulerLastEpoch=scheduler.last_epoch,nextLearningRate=optimizer.param_groups[0]['lr'],
        samplerCursorExact=sampler.cursor==u*32,dropoutRngExact=dropout.getstate()==saved['dropoutRng'],
        hardware='SM-N9500 ARM64 CPU',hostGpuStateOnlyAsProvenance=True))
    def save_checkpoint(why,permanent=False):
        nonlocal last_saved,last_pointer
        if metrics_stream is not None and not metrics_stream.closed:
            metrics_stream.flush();os.fsync(metrics_stream.fileno())
        state=dict(complete,metricsRunId=generation,metricsSegmentStartUpdate=segment_start,sourceCheckpointSha256=expected)
        last_pointer=checkpoint.save(state,why,permanent);last_saved=time.monotonic();return last_pointer
    def progress(phase,extra=None):
        value=dict(phase=phase,update=u,targetUpdates=config['updates'],samples=u*32,targetSamples=config['sampleBudget'],
            phoneWallSeconds=time.monotonic()-started,phonePid=os.getpid(),computerRequired=False,networkRequired=False,
            latestCheckpoint=last_pointer,epoch=time.time(),message={'training':'手机离线训练中','waiting_resources':'等待降温、补电或存储恢复','paused':'已保存暂停','complete':'训练完成，等待用户通知电脑取回'}.get(phase,phase))
        if extra:value.update(extra)
        atomic(OUT/'PROGRESS.json',value)
    def prepare_next():
        preview=copy.copy(sampler);preview.rng=random.Random(0);preview.load_state_dict(sampler.state_dict())
        requests=preview.effective_batch()
        return prefetch.submit(encoder.rows,requests),preview.state_dict(),requests
    def diagnose():
        nonlocal complete,reason
        if any(d['update']==u for d in diagnostics):return
        prefix=OUT/f'model-{u:06d}-{uuid.uuid4().hex}';model.export(prefix)
        report=evaluate(model,prefix,u,lambda:stop_signal)
        old=report['buckets']['1.0/old/dev']['parentEqual'];new=report['buckets']['0.3/new/dev']['parentEqual']
        baseline=read(WORK/'BASELINE_OFFLINE.json')['buckets']['1.0/old/dev']['parentEqual']
        degraded=old['policyNll']>baseline['policyNll']*1.08 or old['brier']>baseline['brier']+.03
        plateau=False
        if u>=60000 and diagnostics:
            previous=diagnostics[-1]['newDev']
            plateau=(previous['policyNll']-new['policyNll'])/max(previous['policyNll'],1e-12)<.005 and new['brier']>=previous['brier']
        diagnostics.append(dict(update=u,oldDev=old,newDev=new,degraded=degraded,plateau=plateau,
            prefix=str(prefix),offline=str(OUT/f'offline-{u:06d}/RESULT.json'),checkpoint=last_pointer))
        complete=snapshot(model,optimizer,scheduler,sampler,dropout,u,config,contract,diagnostics)
        save_checkpoint('diagnostic_complete',True);atomic(OUT/'DIAGNOSTICS.json',diagnostics)
        if len(diagnostics)>=2 and all(d['degraded'] for d in diagnostics[-2:]):reason='old_dev_degraded_two_checks'
        if len(diagnostics)>=2 and all(d['plateau'] for d in diagnostics[-2:]):reason='new_dev_plateau_two_checks'
    try:
        save_checkpoint('mobile_initial_full_barrier',u%500==0)
        encoder=Encoder(OUT);prefetch=ThreadPoolExecutor(max_workers=1,thread_name_prefix='readonly-local-encoder')
        progress('training')
        if u and u%config['diagnosticEvery']==0:diagnose()
        with (OUT/f'METRICS-{generation}.jsonl').open('x',encoding='utf-8',buffering=1) as metrics:
            metrics_stream=metrics
            while u<config['updates'] and reason is None:
                if stop_signal or (WORK/'STOP').exists():reason='user_stop';break
                waiting=False
                while True:
                    try:r=resource();bad=resource_bad(r,waiting)
                    except BaseException as exc:r=dict(valid=False,error=repr(exc),epoch=time.time());bad=True
                    atomic(OUT/'RESOURCE.json',r)
                    if not bad:break
                    if not waiting:save_checkpoint('resource_wait');waiting=True
                    progress('waiting_resources',dict(resource=r))
                    if stop_signal or (WORK/'STOP').exists():reason='user_stop';break
                    time.sleep(20)
                if reason:break
                tick=time.monotonic()
                if pending is None:pending=prepare_next()
                job,next_state,requests=pending
                rows=job.result(timeout=320)
                if len(rows)!=32 or any(r['source']['split']!='train' for r in rows):raise ValueError('手机训练输入批量或分区不符')
                sampler.load_state_dict(next_state)
                pending=prepare_next() if u+1<config['updates'] else None
                wait=time.monotonic()-tick
                result=update(model,optimizer,scheduler,rows,torch.device('cpu'),dropout,u+1,config)
                u+=1
                complete=snapshot(model,optimizer,scheduler,sampler,dropout,u,config,contract,diagnostics)
                record=dict(update=u,samples=u*32,phoneWallSeconds=time.monotonic()-started,encoderWaitSeconds=wait,**result)
                metrics.write(json.dumps(record)+'\n')
                if u%500==0:save_checkpoint('periodic_500',True)
                elif time.monotonic()-last_saved>=300:save_checkpoint('periodic_recovery_300seconds')
                if u%10==0 or u==segment_start+1:progress('training',dict(metrics=record,resource=resource()))
                if u%config['diagnosticEvery']==0:
                    diagnose()
                if probe_updates is not None and u>=segment_start+probe_updates:reason='handoff_probe';break
            save_checkpoint(reason or 'target_100k_complete',True)
            model.export(OUT/'last')
            paused=reason in ['user_stop','handoff_probe']
            result=dict(phase='paused' if paused else 'training_complete',stopReason=reason,updates=u,samples=u*32,
                targetUpdates=100000,lastCheckpoint=last_pointer,lastExport={name:sha(OUT/name) for name in ['last.bin','last.json']},
                modelDigest=tensor_digest(complete['model']),optimizerDigest=tensor_digest(complete['optimizer']),
                diagnostics=diagnostics,exposure=complete['sampler']['exposures'],contractSha256=contract,
                finalArenaPending=True,sealedTestEvaluated=False,automaticReturnTransfer=False)
            atomic(OUT/'RESULT.json',result)
            if not paused:atomic(OUT/'COMPLETE.json',result)
            if reason=='user_stop':atomic(WORK/'STOP',dict(reason='user_stop',update=u))
            progress('paused' if paused else 'complete')
    except InterruptedError:
        reason='user_stop';save_checkpoint(reason,True);atomic(WORK/'STOP',dict(reason=reason,update=u));progress('paused')
    except BaseException as exc:
        error=repr(exc)
        save_checkpoint('exception_last_complete',True)
        atomic(OUT/'BLOCKED.json',dict(error=error,traceback=traceback.format_exc(),lastCompletedUpdate=complete['updates'],
            requests=pending[2] if pending else None,checkpoint=last_pointer,skipBadBatchForbidden=True))
        raise
    finally:
        if encoder:encoder.close()
        if prefetch:prefetch.shutdown(wait=True,cancel_futures=True)
        atomic(OUT/f'RUN_CLOSURE-{generation}.json',dict(completedUpdates=complete['updates'],error=error,stopReason=reason,
            encoderStopped=True,checkpoint=last_pointer,phoneWallSeconds=time.monotonic()-started))

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--handoff-probe',type=int);args=parser.parse_args()
    signal.signal(signal.SIGTERM,signal_stop);signal.signal(signal.SIGINT,signal_stop);main(args.handoff_probe)
