"""完整2M续训运行器；科学身份先核验，同臂预算跨恢复累计。"""
import argparse
import copy
import json
import shutil
import sys
import time
from pathlib import Path
import torch
from runtime import HERE, BASE_SHA, Sampler, Encoder, fresh, update, rng_state, restore_rng, tensor_digest, device_for, identity, save, sha
from budget import ArmBudget, BudgetLedger, BudgetExpired, bounded_process, resume_budget
from contracts import validate, runner_sources


def run(args):
    entered = time.perf_counter()
    config = json.loads(Path(args.config).read_text('utf-8'))
    execution, science = validate(config)
    if args.device != science['executionRuntime']['device']:
        raise ValueError('训练设备与固定科学合同不同')
    runners = runner_sources(science)
    if args.preflight_only:
        print(json.dumps(execution))
        return
    engineering = args.engineering_updates is not None
    if engineering and not 0 <= args.engineering_updates <= 100:
        raise ValueError('第一阶段临时工程更新不得超过100次')
    if not engineering and not args.reviewed_stage:
        raise ValueError('正式试训必须由已审核阶段显式执行')
    restored = None
    elapsed, ledger_path, arm_id, latest_sha = 0., args.out / 'ARM_BUDGET.json', None, None
    if args.resume:
        restored = torch.load(args.resume, map_location='cpu', weights_only=False)
        if not restored.get('recoveryAllowed', False) or restored.get('pendingAccumulatedGradients', True):
            raise ValueError('异常或半批检查点禁止恢复')
        if restored['config'] != config or restored['engineeringOnly'] != engineering:
            raise ValueError('恢复配置或工程/正式模式改变')
        if 'executionIdentity' not in restored:
            raise ValueError('旧检查点缺少强制科学身份合同')
        validate(config, expected_identity=restored['executionIdentity'])
        latest_sha = sha(args.resume)
        elapsed, ledger_path, arm_id = resume_budget(restored, latest_sha)
    budget = ArmBudget(config['stop']['perArmWallSeconds'], elapsed, started=entered)
    args.out.mkdir(parents=True, exist_ok=False)
    ledger = BudgetLedger(ledger_path, budget, arm_id, latest_sha)
    ledger.start()
    encoder, last_complete, model = None, None, None
    updates = restored['stageUpdates'] if restored else 0
    diagnostics = restored.get('diagnostics', []) if restored else []
    stopped = None

    def checkpoint(reason, recovery=True):
        if last_complete is None:
            return
        # 只保存成功批次屏障后的克隆，不消费编码超时或半批异常的游标。
        state = dict(last_complete, reason=reason, recoveryAllowed=recovery, diagnostics=copy.deepcopy(diagnostics), armBudget=dict(ledgerPath=str(ledger.path), armId=ledger.arm_id, consumedWallSeconds=budget.elapsed(), limitSeconds=budget.limit, excludeDowntime=True), pendingAccumulatedGradients=False)
        pending = args.out / 'checkpoint.pending.pt'
        torch.save(state, pending)
        pending.replace(args.out / 'checkpoint.pt')
        digest = sha(args.out / 'checkpoint.pt')
        save(args.out / 'LATEST.json', dict(file='checkpoint.pt', sha256=digest, stageUpdates=state['stageUpdates'], samples=state['sampler']['cursor'], reason=reason, budgetLedger=str(ledger.path)))
        ledger.write(checkpoint_sha=digest)

    try:
        budget.require()
        manifest = json.loads((HERE / 'PARTITIONS.json').read_text('utf-8'))
        budget.require()
        device = device_for(args.device)
        torch.set_num_threads(2)
        torch.set_num_interop_threads(1)
        model, optimizer, scheduler, inherited, receipt = fresh(device, config['peakLearningRate'], config['sampleBudget'] // 8, config['warmupUpdates'])
        sampler = Sampler(manifest, config['seed'], config['newRatio'], config['duelRatio'])
        if restored:
            model.load_state_dict(restored['model'])
            optimizer.load_state_dict(restored['optimizer'])
            scheduler.load_state_dict(restored['scheduler'])
            sampler.load_state_dict(restored['sampler'])
            restore_rng(restored['rng'])

        def completed_state():
            return dict(model=copy.deepcopy(model.state_dict()), optimizer=copy.deepcopy(optimizer.state_dict()), scheduler=copy.deepcopy(scheduler.state_dict()), rng=copy.deepcopy(rng_state()), sampler=copy.deepcopy(sampler.state_dict()), stageUpdates=updates, global_step=241899 + updates, inheritedWorkerRng=inherited['workerRngStates'], config=config, partitionsSha256=config['partitionsSha256'], engineeringOnly=engineering, baseCheckpointSha256=BASE_SHA, executionIdentity=execution, runnerSources=runners)

        last_complete = completed_state()
        checkpoint('initial_complete_barrier')
        save(args.out / 'RESTORE.json', dict(receipt, environment=identity(device), config=config, configSha256=sha(args.config), executionIdentity=execution, runnerSources=runners, engineeringOnly=engineering, resumedFrom=str(args.resume) if args.resume else None, budgetLedger=str(ledger.path), inheritedWallSeconds=elapsed, initialModelDigest=tensor_digest(model.state_dict())))
        model.export(args.out / 'initial')
        budget.require()
        encoder = Encoder(args.out / 'encoder.stderr.log', config, execution)
        target = args.engineering_updates if engineering else config['sampleBudget'] // 8
        with (args.out / 'METRICS.jsonl').open('w', encoding='utf-8') as log:
            while updates < target:
                budget.require()
                ledger.write()
                tick = time.perf_counter()
                request = sampler.batch(8)
                rows = encoder.rows(request, timeout=budget.require(config['encodingRequestTimeoutSeconds']))
                if any(r['source']['split'] != 'train' for r in rows):
                    raise ValueError('训练流包含非训练分区')
                data_seconds = time.perf_counter() - tick
                # 编码耗尽时间时不优化；异常检查点仍指向last_complete。
                budget.require()
                metrics = update(model, optimizer, scheduler, rows, device, config['microbatch'])
                updates += 1
                last_complete = completed_state()
                ledger.write()
                record = dict(stageUpdates=updates, globalStep=241899 + updates, samples=sampler.cursor, dataSeconds=data_seconds, wallSeconds=budget.elapsed(), remainingWallSeconds=budget.remaining(), **metrics)
                log.write(json.dumps(record) + '\n')
                if updates == 1 or updates % 100 == 0:
                    log.flush()
                    save(args.out / 'PROGRESS.json', record)
                if updates % config['checkpointEveryUpdates'] == 0:
                    checkpoint('periodic')
                if not engineering and updates % config['diagnosticEveryUpdates'] == 0:
                    validate(config, expected_identity=execution)
                    budget.require()
                    prefix = args.out / f'dev-model-{updates}'
                    model.export(prefix)
                    destination = args.out / f'dev-{updates}'
                    with (args.out / f'diagnostic-{updates}.log').open('wb') as diagnostic_log:
                        command = [sys.executable, '-X', 'utf8', str(HERE / 'offline.py'), '--model', str(prefix), '--out', str(destination), '--device', str(device), '--config', str(Path(args.config).resolve()), '--timeout-seconds', str(budget.require(config['diagnosticTimeoutSeconds']))]
                        bounded_process(command, budget, config['diagnosticTimeoutSeconds'], cwd=HERE, stdout=diagnostic_log, stderr=diagnostic_log)
                    ledger.write()
                    report = json.loads((destination / 'RESULT.json').read_text('utf-8'))
                    if report['executionIdentity'] != execution:
                        raise ValueError('诊断执行身份与训练臂不同')
                    metrics = report['buckets']['old/dev']['parentEqual']
                    baseline = json.loads((HERE / 'offline-baseline/RESULT.json').read_text('utf-8'))['buckets']['old/dev']['parentEqual']
                    degraded = metrics['policyNll'] > baseline['policyNll'] * (1 + config['stop']['devNllRelativeDeteriorationTwoChecks']) or metrics['brier'] > baseline['brier'] + config['stop']['oldDevBrierIncreaseTwoChecks']
                    diagnostics.append(dict(updates=updates, oldDev=metrics, degraded=degraded))
                    if len(diagnostics) >= 2 and all(d['degraded'] for d in diagnostics[-2:]):
                        stopped = 'old_dev_degraded_two_checks'
                        break
                if shutil.disk_usage(args.out).free < config['stop']['lowFreeDiskBytes']:
                    stopped = 'low_free_disk'
                    break
                if (args.out / 'STOP').exists():
                    stopped = 'explicit_stop'
                    break
                budget.require()
        checkpoint(stopped or 'sample_budget_complete')
        model.export(args.out / 'final')
        save(args.out / 'RESULT.json', dict(status='engineering_only_never_promote' if engineering else 'stopped' if stopped else 'reviewed_stage_complete', stopReason=stopped, stageUpdates=updates, samples=last_complete['sampler']['cursor'], wallSeconds=budget.elapsed(), budgetLedger=str(ledger.path), modelDigest=tensor_digest(model.state_dict()), optimizerDigest=tensor_digest(optimizer.state_dict()), checkpointSha256=sha(args.out / 'checkpoint.pt'), peakGpuBytes=torch.cuda.max_memory_allocated() if device.type == 'cuda' else 0, exposure=sampler.state_dict()['exposures'], diagnostics=diagnostics, executionIdentity=execution))
    except BudgetExpired as error:
        stopped = 'wall_or_operation_budget'
        checkpoint(stopped, recovery=True)
        save(args.out / 'STOPPED.json', dict(reason=stopped, detail=str(error), completedUpdates=last_complete['stageUpdates'] if last_complete else updates, completedSamples=last_complete['sampler']['cursor'] if last_complete else None, wallSeconds=budget.elapsed(), budgetLedger=str(ledger.path), noIncompleteBatchConsumed=True))
    except Exception as error:
        stopped = 'exception'
        checkpoint(stopped, recovery=False)
        save(args.out / 'ERROR.json', dict(error=repr(error), completedUpdates=last_complete['stageUpdates'] if last_complete else updates, wallSeconds=budget.elapsed(), noIncompleteBatchConsumed=True))
        raise
    finally:
        try:
            if encoder:
                encoder.close()
        finally:
            ledger.stop(stopped or 'complete')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=HERE / 'STAGE2_CONFIG.json')
    parser.add_argument('--out', type=Path)
    parser.add_argument('--device', default='cuda:0')
    parser.add_argument('--resume', type=Path)
    parser.add_argument('--engineering-updates', type=int)
    parser.add_argument('--reviewed-stage', action='store_true')
    parser.add_argument('--preflight-only', action='store_true')
    args = parser.parse_args()
    if not args.preflight_only and args.out is None:
        parser.error('执行训练必须指定新输出目录')
    run(args)
