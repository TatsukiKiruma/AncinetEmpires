"""阶段三100k更新；完整安全点、同步预算、固定20k开发诊断与保护早停。"""
import argparse
import copy
import json
import os
from pathlib import Path
import random
import shutil
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from core import HERE, STAGE1, DATA, legacy, control, torch, EncoderPool as Encoder, read, save, validate, fresh, update
from sampler import OmniSampler
from offline import evaluate


def run(resume=None):
    entered=time.perf_counter()
    contract=validate()
    config=read(HERE/'CONFIG.json')
    if not read(HERE/'NUMERICAL_VERIFIED.json')['passed'] or not read(HERE/'SAMPLING_VERIFIED.json')['strictQuotaPassed']:
        raise ValueError('训练前科学自检未通过')
    out=DATA/'training'
    restored=torch.load(resume,map_location='cpu',weights_only=False) if resume else None
    consumed=0.
    if restored:
        record=read(out/'ARM_BUDGET.json')
        same_contract=restored['contractSha256']==contract
        if not same_contract:
            bridge=read(HERE/'PERFORMANCE_REVISION.json')
            same_contract=(legacy.sha(resume)==bridge['checkpoint']['sha256']
                and restored['contractSha256']==bridge['oldContractSha256']
                and legacy.sha(HERE/'CONFIG.json')==bridge['configurationSha256']
                and restored['config']==config and restored['updates']==bridge['updatesAlreadyComplete']
                and read(HERE/'RAGGED_VERIFIED.json')['relativeGradientL2']<1e-4)
        if record['status']=='running' or record['latestCheckpointSha256']!=legacy.sha(resume) or not same_contract or not restored['recoveryAllowed']:
            raise ValueError('只允许同臂已闭合的最新完整检查点恢复')
        consumed=max(record['consumedWallSeconds'],restored['consumedWallSeconds'])
    else:
        out.mkdir(exist_ok=False)
    budget=control.ArmBudget(config['wallSeconds'],consumed,started=entered)
    budget.require()
    ledger=control.BudgetLedger(out/'ARM_BUDGET.json',budget,
        restored['armId'] if restored else None,legacy.sha(resume) if resume else None)
    encoder,complete,primary,checkpoint_record=None,None,None,None
    prefetch_executor=None
    diagnostics=copy.deepcopy(restored['diagnostics']) if restored else []
    u=restored['updates'] if restored else 0
    stop=None
    def checkpoint(reason,recovery=True):
        nonlocal checkpoint_record
        if complete is None:
            return
        state=dict(complete,diagnostics=copy.deepcopy(diagnostics),reason=reason,recoveryAllowed=recovery,
                   consumedWallSeconds=budget.elapsed(),armId=ledger.arm_id,pendingAccumulatedGradients=False)
        file=out/f'checkpoint-{state["updates"]:05d}-{uuid.uuid4().hex}.pt'
        control.atomic_save(file,lambda pending:torch.save(state,pending),budget,shutdown=True)
        checkpoint_record=dict(file=str(file),sha256=legacy.sha(file),updates=state['updates'],samples=state['sampler']['cursor'],recoveryAllowed=recovery)
        control.json_save(out/'LATEST.json',checkpoint_record,budget,shutdown=True)
        ledger.write(checkpoint_sha=checkpoint_record['sha256'],shutdown=True,force=True)
        return checkpoint_record
    try:
        ledger.start()
        torch.set_num_threads(2)
        device=legacy.device_for('cuda:0')
        manifest=read(STAGE1/'PARTITIONS.json')
        sampler=OmniSampler(manifest,config['seed'])
        model,optimizer,scheduler,inherited,receipt=fresh(device,config)
        rng=random.Random(config['seed']+300)
        if restored:
            model.load_state_dict(restored['model']); optimizer.load_state_dict(restored['optimizer']); scheduler.load_state_dict(restored['scheduler'])
            sampler.load_state_dict(restored['sampler']); rng.setstate(restored['dropoutRng']); legacy.restore_rng(restored['rng'])
        def barrier():
            return dict(model=copy.deepcopy(model.state_dict()),optimizer=copy.deepcopy(optimizer.state_dict()),
                scheduler=copy.deepcopy(scheduler.state_dict()),rng=copy.deepcopy(legacy.rng_state()),
                dropoutRng=rng.getstate(),sampler=copy.deepcopy(sampler.state_dict()),updates=u,
                global_step=241899+u,cumulativeSamples=1935189+u*32,
                config=config,contractSha256=contract,baseCheckpointSha256=legacy.BASE_SHA,engineeringOnly=False)
        complete=barrier()
        checkpoint('initial')
        save(out/('RESTORE-'+uuid.uuid4().hex+'.json'),dict(receipt,environment=legacy.identity(device),contractSha256=contract,resume=str(resume)))
        encoder=Encoder(out/'encoder.stderr.log')
        prefetch_executor=ThreadPoolExecutor(max_workers=1,thread_name_prefix='stage3-readonly-prefetch')
        pending=None
        def prepare_next():
            # 预取只推进临时抽样器；实际游标仅在消费该批前态时提交。
            preview=copy.copy(sampler)
            preview.rng=random.Random(0)
            preview.load_state_dict(sampler.state_dict())
            requests=preview.effective_batch()
            return (prefetch_executor.submit(encoder.rows,requests,budget.require(config['encodingTimeout'])),preview.state_dict())
        with (out/'METRICS.jsonl').open('a' if restored else 'x',encoding='utf-8',buffering=1) as log:
            while u<config['updates']:
                budget.require(); ledger.write()
                tick=time.perf_counter()
                if pending is None:
                    pending=prepare_next()
                job,next_state=pending
                rows=job.result(timeout=budget.require(config['encodingTimeout']))
                sampler.load_state_dict(next_state)
                pending=prepare_next() if u+1<config['updates'] else None
                if len(rows)!=32 or any(r['source']['split']!='train' for r in rows):
                    raise ValueError('训练批量或分区不符')
                data_seconds=time.perf_counter()-tick
                with ledger.optimization_guard():
                    metrics=update(model,optimizer,scheduler,rows,device,rng,u+1,config)
                    u+=1
                    complete=barrier()
                record=dict(update=u,samples=u*32,dataSeconds=data_seconds,prefetch=True,encoderWorkers=4,wallSeconds=budget.elapsed(),**metrics)
                log.write(json.dumps(record)+'\n')
                ledger.write()
                if u==1 or u%100==0:
                    control.json_save(out/'PROGRESS.json',record,budget)
                if u%config['checkpointEvery']==0:
                    checkpoint('periodic')
                if u%config['diagnosticEvery']==0:
                    ledger.write(force=True)
                    prefix=out/f'model-{u:05d}'
                    model.export(prefix)
                    report=evaluate(prefix,out/f'offline-{u:05d}',device)
                    budget.require()
                    values=report['buckets']['1.0/old/dev']['parentEqual']
                    baseline=read(DATA/'baseline-offline/RESULT.json')['buckets']['1.0/old/dev']['parentEqual']
                    degraded=values['policyNll']>baseline['policyNll']*1.08 or values['brier']>baseline['brier']+.03
                    new_values=report['buckets']['0.3/new/dev']['parentEqual']
                    plateau=False
                    if u>=60000 and diagnostics:
                        previous=diagnostics[-1]['newDev']
                        plateau=(previous['policyNll']-new_values['policyNll'])/max(previous['policyNll'],1e-12)<.005 and new_values['brier']>=previous['brier']
                    diagnostics.append(dict(update=u,oldDev=values,newDev=new_values,degraded=degraded,plateau=plateau,checkpoint=checkpoint_record,offline=str(out/f'offline-{u:05d}/RESULT.json')))
                    save(out/'DIAGNOSTICS.json',diagnostics)
                    ledger.write(force=True)
                    if len(diagnostics)>=2 and all(d['degraded'] for d in diagnostics[-2:]):
                        stop='old_dev_degraded_two_checks'; break
                    if len(diagnostics)>=2 and all(d['plateau'] for d in diagnostics[-2:]):
                        stop='new_dev_plateau_two_checks'; break
                if (out/'STOP').exists():
                    stop='explicit_stop'; break
                if shutil.disk_usage(DATA).free<config['lowFreeDiskBytes']:
                    stop='low_free_disk'; break
                budget.require()
        checkpoint(stop or 'complete')
        model.export(out/'last')
        save(out/'RESULT.json',dict(updates=u,samples=u*32,stopReason=stop,diagnostics=diagnostics,
             exposures=sampler.state_dict()['exposures'],checkpoint=checkpoint_record,wallSeconds=budget.elapsed(),
             modelDigest=legacy.tensor_digest(model.state_dict()),optimizerDigest=legacy.tensor_digest(optimizer.state_dict()),
             contractSha256=contract))
    except BaseException as error:
        primary=error
        save(out/('FAILURE-'+uuid.uuid4().hex+'.json'),dict(error=repr(error),traceback=traceback.format_exc(),updates=u))
        checkpoint('budget_expired' if isinstance(error,control.BudgetExpired) else 'exception',isinstance(error,control.BudgetExpired))
        if isinstance(error,control.BudgetExpired) and complete is not None:
            stop='wall_limit'
            model.load_state_dict(complete['model'])
            model.export(out/'last')
            save(out/'RESULT.json',dict(updates=complete['updates'],samples=complete['sampler']['cursor'],stopReason=stop,
                diagnostics=diagnostics,exposures=complete['sampler']['exposures'],checkpoint=checkpoint_record,
                wallSeconds=budget.elapsed(),modelDigest=legacy.tensor_digest(complete['model']),
                optimizerDigest=legacy.tensor_digest(complete['optimizer']),contractSha256=contract))
            primary=None
    finally:
        cleanup=control.close_without_masking(primary,[('encoder.close',lambda:encoder.close() if encoder else None),
            ('prefetch.shutdown',lambda:prefetch_executor.shutdown(wait=True,cancel_futures=True) if prefetch_executor else None),
            ('ledger.stop',lambda:ledger.stop('failed' if primary else stop or 'complete'))])
        save(out/('RUN_CLOSURE-'+uuid.uuid4().hex+'.json'),dict(updates=u,samples=u*32,checkpoint=checkpoint_record,
             primaryError=repr(primary) if primary else None,cleanup=cleanup,wallSeconds=budget.elapsed(),budgetClosed=ledger.closed))
    if primary:
        raise primary
    print(json.dumps(dict(updates=u,samples=u*32,stopReason=stop,wallSeconds=budget.elapsed())))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resume',type=Path)
    run(parser.parse_args().resume)
