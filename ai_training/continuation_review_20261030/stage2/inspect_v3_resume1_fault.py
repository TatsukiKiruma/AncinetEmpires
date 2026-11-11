"""只读核对获批接续的启动故障、零新增更新和累计预算，不恢复训练。"""
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
CONTROL = HERE / 'runner_v3_repair3'
sys.path.insert(0, str(CONTROL))
from frozen import load_runtime
from recovery import read, validate_control, inspect_resume

ARTIFACTS = Path('D:/AncientEmpiresData/continuation_stage2_20261030_v1')
SEGMENT = ARTIFACTS / 'lr-1e-4-v3-resume1'


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


if __name__ == '__main__':
    runtime = load_runtime()
    source_path = ARTIFACTS / 'lr-1e-4/checkpoint.pt'
    source = torch.load(source_path, map_location='cpu', weights_only=False)
    latest = read(SEGMENT / 'LATEST.json')
    saved_path = Path(latest['file'])
    saved = torch.load(saved_path, map_location='cpu', weights_only=False)
    closure = read(next(SEGMENT.glob('RUN_CLOSURE-*.json')))
    ledger = read(ARTIFACTS / 'lr-1e-4/ARM_BUDGET.json')
    old_ledger = read(HERE / 'revisions/submission-1/original-ARM_BUDGET.json')
    events = [json.loads(line) for line in (SEGMENT / 'IO_EVENTS.jsonl').read_text('utf-8').splitlines() if line]
    receipt = read(SEGMENT / 'RESTORE.json')
    assert receipt['environment']['device'] == 'cuda:0'
    assert sha(source_path) == '317e3bf8b14db63b65c4eed503e32641f64d85ecd051dcf28085357f091f7e32'
    assert sha(saved_path) == latest['sha256'] == ledger['latestCheckpointSha256'] == closure['lastCompleteCheckpoint']['sha256']
    assert not source['recoveryAllowed'] and not saved['recoveryAllowed'] and not saved['pendingAccumulatedGradients']
    assert source['stageUpdates'] == saved['stageUpdates'] == closure['completedUpdates'] == 7758
    assert source['sampler']['cursor'] == saved['sampler']['cursor'] == closure['completedSamples'] == 62064
    assert saved['sampler'] == source['sampler'] and saved['scheduler'] == source['scheduler']
    model_digest = runtime.tensor_digest(saved['model'])
    optimizer_digest = runtime.tensor_digest(saved['optimizer'])
    assert model_digest == runtime.tensor_digest(source['model']) == '45f7b31a68fb08a125c290e2123ace2b4811f5b41a3ba2ce1693e437775f05c9'
    assert optimizer_digest == runtime.tensor_digest(source['optimizer']) == 'c7dc06b09b41202a3394069544a75b694c94c215631d4322b2e791dcb67c01ac'
    assert saved['rng']['python'] == source['rng']['python']
    assert np.array_equal(saved['rng']['numpy'][1], source['rng']['numpy'][1])
    assert saved['rng']['numpy'][0] == source['rng']['numpy'][0] and saved['rng']['numpy'][2:] == source['rng']['numpy'][2:]
    assert torch.equal(saved['rng']['torch'], source['rng']['torch'])
    assert len(saved['rng']['gpu']) == len(source['rng']['gpu'])
    assert all(torch.equal(a, b) for a, b in zip(saved['rng']['gpu'], source['rng']['gpu']))
    assert all(float(saved['optimizer']['state'][key]['step']) == float(value['step']) for key, value in source['optimizer']['state'].items())
    assert (SEGMENT / 'METRICS.jsonl').stat().st_size == 0
    assert closure['status'] == 'failed' and closure['budgetClosedConservatively']
    assert ledger['armId'] == old_ledger['armId'] == 'f167ec70-dd0b-48bd-9af0-fb6a45452d3e'
    assert ledger['status'] == 'exception' and ledger['shutdownTailReservationSeconds'] == 5
    assert ledger['consumedWallSeconds'] == closure['chargedWallUpperBoundSeconds'] > old_ledger['consumedWallSeconds']
    assert ledger['consumedWallSeconds'] >= closure['wallSeconds']
    config = saved['config']
    execution, _ = validate_control(config)
    assert execution == saved['executionIdentity'] == closure['executionIdentity']
    rejected = {}
    initial_path = next(path for path in SEGMENT.glob('checkpoint-*.pt') if path != saved_path)
    initial = torch.load(initial_path, map_location='cpu', weights_only=False)
    for name, path, state in [('original_317_checkpoint', source_path, source),
                              ('new_exception_checkpoint', saved_path, saved),
                              ('nonlatest_initial_v3_checkpoint', initial_path, initial)]:
        try:
            inspect_resume(path, state, config, execution)
        except ValueError as error:
            rejected[name] = str(error)
        else:
            raise AssertionError('新故障后不应自动接受再次恢复：' + name)
    results = dict(
        passed=True, codeApproval='reviews/stage2-review-3.json', exitCode=1,
        sourceCheckpointSha256=sha(source_path), newExceptionCheckpoint=str(saved_path), newExceptionCheckpointSha256=sha(saved_path),
        originalClosedLedgerSnapshotSha256=sha(HERE / 'revisions/submission-1/original-ARM_BUDGET.json'),
        currentClosedLedgerSha256=sha(ARTIFACTS / 'lr-1e-4/ARM_BUDGET.json'),
        currentClosedLedger=ledger, closure=closure,
        actualNewUpdates=0, actualNewSamples=0, newMetricRows=0, newOfflinePredictions=0, newArenaGames=0,
        modelDigest=model_digest, optimizerDigest=optimizer_digest,
        completeModelOptimizerSchedulerSamplerAndAllRngEqual=True, optimizerStateEntriesUnchanged=len(saved['optimizer']['state']),
        preservedSourceFalse=True, preservedNewExceptionFalse=True,
        sharingRetryEvents=sum(event['kind'] == 'sharing_retry' for event in events),
        heartbeatFailureEvents=sum(event['kind'] == 'heartbeat_failed' for event in events),
        failureBeforeFirstWriteAttempt='atomic_save循环顶部deadline分支，attempts尚未增加；无PermissionError cause或共享重试事件',
        rootCauseStatus='尚未确证；需区分调度/GIL/目录或UUID准备耗时与真实共享拒绝，不以错误文案代替证据',
        bootstrapGpuDeviceInitialized=True, bootstrapEnvironment=receipt['environment'], gpuForwardCalls=0,
        segmentObservedSeconds=closure['wallSeconds'] - old_ledger['consumedWallSeconds'],
        segmentChargedSeconds=ledger['consumedWallSeconds'] - old_ledger['consumedWallSeconds'],
        remainingSamples=17936, remainingUpdates=2242, remainingWallSeconds=14400 - ledger['consumedWallSeconds'],
        repeatedResumeRejected=rejected, nextArmsNotStarted=not (ARTIFACTS / 'lr-5e-5').exists() and not (ARTIFACTS / 'lr-2.4495e-4').exists(),
        authoritativeTrainingCodeChanged=False, finalTestPredictions=0)
    (HERE / 'V3_RESUME1_FAULT.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps({key: results[key] for key in ['passed', 'exitCode', 'actualNewUpdates', 'actualNewSamples',
          'newExceptionCheckpointSha256', 'sharingRetryEvents', 'segmentObservedSeconds', 'segmentChargedSeconds', 'remainingWallSeconds', 'repeatedResumeRejected']}, ensure_ascii=False))
