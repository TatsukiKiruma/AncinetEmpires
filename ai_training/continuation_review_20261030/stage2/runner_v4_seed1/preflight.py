"""无真实优化的种子、分区、恢复及原V4同步控制预检。"""
import copy
import hashlib
import importlib
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import torch

from frozen import HERE, STAGE1, load_runtime, legacy_contracts
import recovery


def main():
    target = HERE.parent / 'REPLICATION_PREFLIGHT.json'
    if target.exists():
        raise FileExistsError('保留首次预检结果，不覆盖')
    config = recovery.read(HERE / 'CONFIG.json')
    execution, _ = recovery.validate_control(config)
    parent = HERE.parent / 'runner_v4_sync1'
    transforms = recovery.read(HERE / 'TRANSFORMATIONS.json')
    expected_train = (parent / 'train.py').read_text('utf-8')
    for old, new in transforms['trainReplacements']:
        assert expected_train.count(old) == 1
        expected_train = expected_train.replace(old, new)
    assert expected_train == (HERE / 'train.py').read_text('utf-8')
    for name in transforms['identicalFiles']:
        assert legacy_contracts.file_sha(parent / name) == legacy_contracts.file_sha(HERE / name)
    assert (parent / 'recovery.py').read_text('utf-8').split('def inspect_resume(', 1)[1] == (HERE / 'recovery.py').read_text('utf-8').split('def inspect_resume(', 1)[1]
    rejected_configs = []
    for key, value in [('seed', 20261032), ('seed', 20261030), ('peakLearningRate', .00005),
                       ('newRatio', .5), ('duelRatio', .7), ('microbatch', 2), ('effectiveBatch', 16),
                       ('sampleBudget', 80008), ('gradientClip', 2), ('valueWeight', .5)]:
        try:
            recovery.evaluation_config(dict(config, **{key: value}))
        except ValueError:
            rejected_configs.append(key)
        else:
            raise AssertionError('超范围配置未被拒绝')
    try:
        legacy_contracts.validate(config)
    except ValueError:
        original_gate_rejected_seed_extension = True
    else:
        raise AssertionError('原科学seed门禁被放宽')
    runtime = load_runtime()
    manifest = recovery.read(STAGE1 / 'PARTITIONS.json')
    by_id = {p['parentId']: p for p in manifest['parents']}
    a, b, old = (runtime.Sampler(manifest, seed) for seed in [20261031, 20261031, 20261030])
    requests, old_requests = [], []
    for index in range(100):
        batch = a.batch(8)
        assert batch == b.batch(8)
        groups = [by_id[r['parentId']]['isolationGroupId'] for r in batch]
        assert len(set(groups)) == 8
        assert all(by_id[r['parentId']]['split'] == 'train' and r['split'] == 'train' for r in batch)
        requests.extend(batch)
        old_requests.extend(old.batch(8))
        if index == 49:
            saved = copy.deepcopy(a.state_dict())
            restored = runtime.Sampler(manifest, 0)
            restored.load_state_dict(saved)
        elif index > 49:
            assert restored.batch(8) == batch
    assert a.state_dict() == b.state_dict() == restored.state_dict()
    assert a.cursor == 800 and requests != old_requests
    digest = lambda rows: hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()

    # 使用原测试源码，模块绑定当前独立目录，全部新夹具写入本目录。
    sys.path.append(str(parent))
    original_tests = importlib.import_module('test_sync')
    sys.path.remove(str(parent))
    names = ['test_no_background_threads_and_slow_phases_do_not_misfire',
             'test_slow_main_json_encoding_has_no_false_sharing_deadline',
             'test_real_short_and_persistent_windows_locks',
             'test_expiry_and_diagnostic_time_are_cumulative',
             'test_actual_io_failure_stops_next_batch']
    gpu_attempts = []
    def reject_gpu(*args, **kwargs):
        gpu_attempts.append(1)
        raise AssertionError('预检禁止GPU初始化')
    with patch.object(torch.cuda, '_lazy_init', reject_gpu):
        suite = unittest.TestSuite(original_tests.SyncControl(name) for name in names)
        tested = unittest.TextTestRunner(stream=sys.stdout, verbosity=2).run(suite)
    assert tested.wasSuccessful() and not gpu_attempts and tested.testsRun == 5 and not tested.skipped

    fixture = HERE / 'fixtures/resume-inspector'
    fixture.mkdir(parents=True, exist_ok=False)
    checkpoint = fixture / 'synthetic-state.pt'
    state = dict(config=config, executionIdentity=execution, partitionsSha256=config['partitionsSha256'],
                 baseCheckpointSha256=config['checkpointSha256'], stageUpdates=1, global_step=241900,
                 sampler=dict(cursor=8), scheduler=dict(last_epoch=1), pendingAccumulatedGradients=False,
                 engineeringOnly=False, recoveryAllowed=True, model={'fixture': torch.ones(1)},
                 optimizer={'state': {0: {'step': torch.tensor(1.), 'exp_avg': torch.ones(1)}}},
                 armBudget=dict(ledgerPath=str(fixture / 'ledger.json'), armId='synthetic-seed-preflight',
                                consumedWallSeconds=12, limitSeconds=14400))
    torch.save(state, checkpoint)
    checkpoint_sha = legacy_contracts.file_sha(checkpoint)
    ledger = dict(armId='synthetic-seed-preflight', latestCheckpointSha256=checkpoint_sha, status='complete',
                  controlProtocol=recovery.PROTOCOL, shutdownTailReservationSeconds=5, limitSeconds=14400,
                  excludeDowntime=True, consumedWallSeconds=17)
    (fixture / 'ledger.json').write_text(json.dumps(ledger), 'utf-8')
    bridge = recovery.inspect_resume(checkpoint, state, config, execution)
    assert bridge['elapsed'] == 17 and bridge['remainingUpdates'] == 9999 and bridge['remainingSamples'] == 79992
    rejected_states = []
    mutations = [dict(pendingAccumulatedGradients=True), dict(engineeringOnly=True), dict(recoveryAllowed=False),
                 dict(executionIdentity=execution['frozenV2']), dict(config=dict(config, seed=20261032)),
                 dict(model={'fixture': torch.tensor(float('nan'))})]
    for mutation in mutations:
        try:
            recovery.inspect_resume(checkpoint, dict(state, **mutation), config, execution)
        except ValueError:
            rejected_states.append(next(iter(mutation)))
        else:
            raise AssertionError('错误恢复状态未被拒绝')
    (fixture / 'ledger.json').write_text(json.dumps(dict(ledger, status='running')), 'utf-8')
    try:
        recovery.inspect_resume(checkpoint, state, config, execution)
    except ValueError:
        rejected_states.append('unclosed-ledger')
    else:
        raise AssertionError('未闭合账本未被拒绝')
    report = dict(passed=True, trainingSeedOnly=True, replicationContractSha256=execution['replicationContractSha256'],
                  sourceTransformExact=True, unchangedIoAndFrozenBytes=True, unchangedResumeFunction=True,
                  originalGateRejectedSeedExtension=original_gate_rejected_seed_extension,
                  rejectedOutOfScopeConfigs=rejected_configs, samplerRequests=800, sameSeedExact=True,
                  differentSeedSequence=True, samplerResumeExact=True, trainPartitionsOnly=True,
                  distinctIsolationGroupsPerBatch=True, requestDigest=digest(requests), parentSeedRequestDigest=digest(old_requests),
                  inheritedV4IoTests=5, originalTestSourceSha256=legacy_contracts.file_sha(parent / 'test_sync.py'),
                  resumeBudgetPreserved=True, rejectedResumeStates=rejected_states,
                  real2mOptimizerUpdates=0, syntheticOptimizerUpdates=0, gpuForwardCalls=0, gpuInitializationAttempts=0,
                  limitation='本次不重跑已经过期的原单一异常桥接测试；其全部旧证据保留。新臂旧异常检查点因配置/扩展身份不符被拒绝。')
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    recovery.require_code_approval(STAGE1.parent / 'reviews/stage2-review-6.json', execution, config)
    print(json.dumps(dict(passed=True, contract=execution['replicationContractSha256'], samplerRequests=800, ioTests=5)))


if __name__ == '__main__':
    main()
