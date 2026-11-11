"""待审核的V3控制入口；数值调用继承V2，实际训练另需精确代码批准。"""
import argparse
import copy
import json
from pathlib import Path
import shutil
import sys
import threading
import time
import traceback
import uuid

from frozen import HERE, STAGE1, load_runtime
from io_control import (ArmBudget, BudgetLedger, BudgetExpired, PersistenceFailure,
                        atomic_save, json_save, bounded_process, close_without_masking,
                        CHECKPOINT_CAP_SECONDS, SHUTDOWN_CAP_SECONDS)
from recovery import read, validate_control, require_code_approval, inspect_resume


def run(args):
    entered = time.perf_counter()
    config = read(args.config)
    execution, science = validate_control(config)
    legacy_execution = execution['frozenV2']
    if args.device != science['executionRuntime']['device']:
        raise ValueError('训练设备与冻结科学合同不同')
    from frozen import legacy_contracts
    resume_sha = legacy_contracts.file_sha(args.resume) if args.resume else None
    approval = None
    if not args.preflight_only:
        if not args.reviewed_stage:
            raise ValueError('实际训练必须显式声明审核阶段')
        approval = require_code_approval(args.code_approval, execution, config, resume_sha)
        if args.out is None:
            raise ValueError('实际训练必须指定新输出目录')
    restored, bridge = None, None
    if args.resume:
        import torch
        restored = torch.load(args.resume, map_location='cpu', weights_only=False)
        bridge = inspect_resume(args.resume, restored, config, execution)
    if args.preflight_only:
        print(json.dumps(dict(executionIdentity=execution, resumeInspection=bridge,
                              approvedToRun=False, gpuForwardCalls=0, optimizerUpdates=0)))
        return

    elapsed = bridge['elapsed'] if bridge else 0.
    budget = ArmBudget(config['stop']['perArmWallSeconds'], elapsed, started=entered)
    # 零预算或未批准在新输出及模型初始化之前拒绝。
    budget.require()
    args.out.mkdir(parents=True, exist_ok=False)
    event_lock, event_errors = threading.Lock(), []
    events = (args.out / 'IO_EVENTS.jsonl').open('x', encoding='utf-8', buffering=1)

    def event(value):
        try:
            with event_lock:
                events.write(json.dumps(value, ensure_ascii=False) + '\n')
        except BaseException as error:
            event_errors.append(repr(error))
            print('I/O事件记录失败：' + repr(error), file=sys.stderr, flush=True)

    ledger = BudgetLedger(bridge['ledgerPath'] if bridge else args.out / 'ARM_BUDGET.json', budget,
                         bridge['armId'] if bridge else None, resume_sha, event=event)
    encoder, last_complete, primary, primary_trace = None, None, None, None
    checkpoint_record, stop_reason = None, None
    updates = restored['stageUpdates'] if restored else 0
    diagnostics = copy.deepcopy(restored.get('diagnostics', [])) if restored else []
    runtime = None

    def checkpoint(reason, recovery):
        nonlocal checkpoint_record
        if last_complete is None:
            return None
        # 检查点使用不可变的新文件名；持久锁也不覆盖旧完整状态。
        state = dict(last_complete, reason=reason, recoveryAllowed=recovery,
                     diagnostics=copy.deepcopy(diagnostics), pendingAccumulatedGradients=False,
                     armBudget=dict(ledgerPath=str(ledger.path), armId=ledger.arm_id,
                                    consumedWallSeconds=budget.elapsed(), limitSeconds=budget.limit,
                                    excludeDowntime=True))
        path = args.out / f'checkpoint-{state["stageUpdates"]:06d}-{uuid.uuid4().hex}.pt'
        atomic_save(path, lambda pending: runtime.torch.save(state, pending), budget,
                    cap=CHECKPOINT_CAP_SECONDS, shutdown=True, event=event)
        checkpoint_record = dict(file=str(path), sha256=runtime.sha(path), stageUpdates=state['stageUpdates'],
                                 samples=state['sampler']['cursor'], reason=reason,
                                 budgetLedger=str(ledger.path), recoveryAllowed=recovery)
        json_save(args.out / 'LATEST.json', checkpoint_record, budget, shutdown=True, event=event)
        ledger.write(checkpoint_sha=checkpoint_record['sha256'], shutdown=True)
        return checkpoint_record

    try:
        ledger.start()
        runtime = load_runtime()
        budget.require()
        manifest = read(STAGE1 / 'PARTITIONS.json')
        budget.require()
        device = runtime.device_for(args.device)
        runtime.torch.set_num_threads(2)
        runtime.torch.set_num_interop_threads(1)
        model, optimizer, scheduler, inherited, receipt = runtime.fresh(
            device, config['peakLearningRate'], config['sampleBudget'] // 8, config['warmupUpdates'])
        sampler = runtime.Sampler(manifest, config['seed'], config['newRatio'], config['duelRatio'])
        if restored:
            model.load_state_dict(restored['model'])
            optimizer.load_state_dict(restored['optimizer'])
            scheduler.load_state_dict(restored['scheduler'])
            sampler.load_state_dict(restored['sampler'])
            runtime.restore_rng(restored['rng'])

        def completed_state():
            return dict(model=copy.deepcopy(model.state_dict()), optimizer=copy.deepcopy(optimizer.state_dict()),
                        scheduler=copy.deepcopy(scheduler.state_dict()), rng=copy.deepcopy(runtime.rng_state()),
                        sampler=copy.deepcopy(sampler.state_dict()), stageUpdates=updates,
                        global_step=241899 + updates, inheritedWorkerRng=inherited['workerRngStates'],
                        config=config, partitionsSha256=config['partitionsSha256'], engineeringOnly=False,
                        baseCheckpointSha256=runtime.BASE_SHA, executionIdentity=execution,
                        frozenScientificIdentity=legacy_execution, recoveryBridge=bridge, codeApproval=approval,
                        runnerSources=dict(controlContractSha256=execution['controlContractSha256'],
                                           frozenV2RunnerContractSha256=config['runnerContractSha256']))

        last_complete = completed_state()
        checkpoint('initial_complete_barrier', True)
        json_save(args.out / 'RESTORE.json', dict(receipt, config=config, executionIdentity=execution,
                  environment=runtime.identity(device), engineeringOnly=False, resumedFrom=str(args.resume) if args.resume else None,
                  recoveryBridge=bridge, codeApproval=approval, budgetLedger=str(ledger.path), inheritedWallSeconds=elapsed,
                  initialModelDigest=runtime.tensor_digest(model.state_dict())), budget, event=event)
        model.export(args.out / 'initial')
        budget.require()
        encoder = runtime.Encoder(args.out / 'encoder.stderr.log', config, legacy_execution)
        with (args.out / 'METRICS.jsonl').open('x', encoding='utf-8') as log:
            while updates < config['sampleBudget'] // 8:
                ledger.check()
                budget.require()
                ledger.write()
                tick = time.perf_counter()
                request = sampler.batch(8)
                rows = encoder.rows(request, timeout=budget.require(config['encodingRequestTimeoutSeconds']))
                if any(r['source']['split'] != 'train' for r in rows):
                    raise ValueError('训练流包含非训练分区')
                data_seconds = time.perf_counter() - tick
                with ledger.optimization_guard():
                    metrics = runtime.update(model, optimizer, scheduler, rows, device, config['microbatch'])
                    updates += 1
                    last_complete = completed_state()
                record = dict(stageUpdates=updates, globalStep=241899 + updates, samples=sampler.cursor,
                              dataSeconds=data_seconds, wallSeconds=budget.elapsed(),
                              remainingWallSeconds=budget.remaining(), **metrics)
                log.write(json.dumps(record) + '\n')
                # 完整更新先记指标，再做账本写入，避免旧故障的一条指标缺口。
                ledger.write()
                if updates == 1 or updates % 100 == 0:
                    log.flush()
                    json_save(args.out / 'PROGRESS.json', record, budget, event=event)
                if updates % config['checkpointEveryUpdates'] == 0:
                    checkpoint('periodic', True)
                if updates % config['diagnosticEveryUpdates'] == 0:
                    validate_control(config)
                    budget.require()
                    prefix = args.out / f'dev-model-{updates}'
                    model.export(prefix)
                    destination = args.out / f'dev-{updates}'
                    with (args.out / f'diagnostic-{updates}.log').open('xb') as diagnostic_log:
                        command = [sys.executable, '-X', 'utf8', str(STAGE1 / 'offline.py'), '--model', str(prefix),
                                   '--out', str(destination), '--device', str(device), '--config', str(Path(args.config).resolve()),
                                   '--timeout-seconds', str(budget.require(config['diagnosticTimeoutSeconds']))]
                        bounded_process(command, budget, config['diagnosticTimeoutSeconds'], cwd=STAGE1,
                                        stdout=diagnostic_log, stderr=diagnostic_log)
                    ledger.write()
                    report = read(destination / 'RESULT.json')
                    if report['executionIdentity'] != legacy_execution:
                        raise ValueError('固定离线评估科学身份变化')
                    values = report['buckets']['old/dev']['parentEqual']
                    baseline = read(STAGE1 / 'offline-baseline/RESULT.json')['buckets']['old/dev']['parentEqual']
                    degraded = values['policyNll'] > baseline['policyNll'] * (1 + config['stop']['devNllRelativeDeteriorationTwoChecks']) or values['brier'] > baseline['brier'] + config['stop']['oldDevBrierIncreaseTwoChecks']
                    diagnostics.append(dict(updates=updates, oldDev=values, degraded=degraded))
                    if len(diagnostics) >= 2 and all(d['degraded'] for d in diagnostics[-2:]):
                        stop_reason = 'old_dev_degraded_two_checks'
                        break
                if shutil.disk_usage(args.out).free < config['stop']['lowFreeDiskBytes']:
                    stop_reason = 'low_free_disk'
                    break
                if (args.out / 'STOP').exists():
                    stop_reason = 'explicit_stop'
                    break
                ledger.check()
                budget.require()
        checkpoint(stop_reason or 'sample_budget_complete', True)
        model.export(args.out / 'final')
        json_save(args.out / 'RESULT.json', dict(status='stopped' if stop_reason else 'reviewed_stage_complete',
                  stopReason=stop_reason, stageUpdates=updates, samples=last_complete['sampler']['cursor'],
                  wallSeconds=budget.elapsed(), budgetLedger=str(ledger.path), checkpoint=checkpoint_record,
                  modelDigest=runtime.tensor_digest(model.state_dict()), optimizerDigest=runtime.tensor_digest(optimizer.state_dict()),
                  exposure=sampler.state_dict()['exposures'], diagnostics=diagnostics, executionIdentity=execution,
                  closureRequired=True), budget, event=event)
    except BaseException as error:
        primary, primary_trace = error, traceback.format_exc()
        stop_reason = 'wall_or_operation_budget' if isinstance(error, BudgetExpired) else 'exception'
        try:
            checkpoint(stop_reason, isinstance(error, BudgetExpired))
        except BaseException as save_error:
            event_errors.append('最后完整检查点保存失败：' + repr(save_error))
    finally:
        cleanup = close_without_masking(primary, [
            ('encoder.close', lambda: encoder.close() if encoder else None),
            ('ledger.stop', lambda: ledger.stop(stop_reason or 'complete')),
            ('events.close', events.close)])
        charge = ledger.last_persisted
        budget_closed = bool(charge and charge['status'] != 'running' and charge['shutdownTailReservationSeconds'] >= 5)
        closure = dict(status='failed' if primary or cleanup['cleanupErrors'] or event_errors or not budget_closed else 'complete',
                       primaryError=repr(primary) if primary else None, primaryTraceback=primary_trace,
                       cleanupErrors=cleanup['cleanupErrors'], eventErrors=event_errors,
                       completedUpdates=last_complete['stageUpdates'] if last_complete else updates,
                       completedSamples=last_complete['sampler']['cursor'] if last_complete else restored['sampler']['cursor'] if restored else 0,
                       lastCompleteCheckpoint=checkpoint_record, wallSeconds=budget.elapsed(),
                       chargedWallUpperBoundSeconds=charge['consumedWallSeconds'] if budget_closed else None,
                       shutdownTailReservationSeconds=charge['shutdownTailReservationSeconds'] if budget_closed else None,
                       budgetClosedConservatively=budget_closed,
                       budgetLedger=str(ledger.path), armId=ledger.arm_id,
                       executionIdentity=execution, optimizationAfterBudgetExpiryAllowed=False)
        try:
            json_save(args.out / ('RUN_CLOSURE-' + uuid.uuid4().hex + '.json'), closure, budget,
                      cap=SHUTDOWN_CAP_SECONDS, shutdown=True)
        except BaseException as evidence_error:
            closure['closureEvidenceError'] = repr(evidence_error)
        print(json.dumps(closure, ensure_ascii=False), file=sys.stderr, flush=True)
    if primary:
        raise primary
    if closure['status'] != 'complete' or 'closureEvidenceError' in closure:
        raise PersistenceFailure('收尾失败；原始错误及附加错误见RUN_CLOSURE和stderr')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=STAGE1 / 'stage2-configs/lr-1e-4.json')
    parser.add_argument('--out', type=Path)
    parser.add_argument('--device', default='cuda:0')
    parser.add_argument('--resume', type=Path)
    parser.add_argument('--code-approval', type=Path)
    parser.add_argument('--reviewed-stage', action='store_true')
    parser.add_argument('--preflight-only', action='store_true')
    run(parser.parse_args())
