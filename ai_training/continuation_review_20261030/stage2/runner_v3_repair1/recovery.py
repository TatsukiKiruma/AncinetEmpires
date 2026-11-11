"""新控制身份和单一异常检查点桥接；执行必须另有协调者精确代码批准。"""
import json
from pathlib import Path

from frozen import HERE, REVIEWS, STAGE1, legacy_contracts, legacy_budget

PROTOCOL = 'continuation-control-v3-repair1'
EXACT_CHECKPOINT_SHA = '317e3bf8b14db63b65c4eed503e32641f64d85ecd051dcf28085357f091f7e32'
EXACT_ARM = 'f167ec70-dd0b-48bd-9af0-fb6a45452d3e'
FLOOR_SECONDS = 2466.9585621000006


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


def validate_control(config):
    legacy_identity, science = legacy_contracts.validate(config)
    contract_path = HERE / 'CONTROL_CONTRACT.json'
    control = read(contract_path)
    if control['protocol'] != PROTOCOL or control['frozenScienceContractSha256'] != config['scienceContractSha256']:
        raise ValueError('控制修订与冻结科学合同不对应')
    if control['frozenRunnerContractSha256'] != config['runnerContractSha256']:
        raise ValueError('冻结运行器来源不同')
    for item in control['sources']:
        if legacy_contracts.file_sha(HERE / item['path']) != item['sha256']:
            raise ValueError('新控制源码不是待审核修订：' + item['path'])
    for item in control['preservedEvidence']:
        if legacy_contracts.file_sha(Path(item['path'])) != item['sha256']:
            raise ValueError('原始异常证据或闭合快照变化：' + item['path'])
    return dict(protocol=PROTOCOL, controlContractSha256=legacy_contracts.file_sha(contract_path),
                frozenV2=legacy_identity, scientificNumericsInherited=True,
                controlRevisionChanged=True), science


def require_code_approval(path, control_identity, config, resume_sha=None):
    if path is None:
        raise ValueError('仅修复代码获授权；实际训练必须提供协调者下一轮精确代码批准')
    path = Path(path).resolve()
    if path.parent != REVIEWS.resolve():
        raise ValueError('代码执行批准必须来自协调者reviews目录')
    approval = read(path)
    if approval.get('schema') != 'stage2-control-code-approval-v1' or approval.get('decision') != 'approved_to_run':
        raise ValueError('尚无实际训练执行批准')
    if approval.get('controlContractSha256') != control_identity['controlContractSha256']:
        raise ValueError('新控制代码不是批准的精确摘要')
    if approval.get('sampleBudgetPerArm') != 80000 or approval.get('updateBudgetPerArm') != 10000 or approval.get('wallSecondsPerArm') != 14400:
        raise ValueError('批准声明改变原臂预算')
    if config['peakLearningRate'] not in approval.get('learningRateArms', []):
        raise ValueError('此学习率未获执行批准')
    if resume_sha == EXACT_CHECKPOINT_SHA and approval.get('exactRecoveryCheckpointSha256') != EXACT_CHECKPOINT_SHA:
        raise ValueError('代码批准未授权此单一异常恢复')
    return dict(path=str(path), sha256=legacy_contracts.file_sha(path))


def inspect_resume(checkpoint_path, saved, config, control_identity):
    digest = legacy_contracts.file_sha(checkpoint_path)
    if saved.get('pendingAccumulatedGradients', True) or saved.get('engineeringOnly'):
        raise ValueError('半批或工程检查点禁止恢复')
    if saved['config'] != config or saved['partitionsSha256'] != config['partitionsSha256']:
        raise ValueError('恢复配置改变')
    if saved['baseCheckpointSha256'] != config['checkpointSha256']:
        raise ValueError('原模型来源改变')
    updates, cursor = saved['stageUpdates'], saved['sampler']['cursor']
    if cursor != updates * 8 or saved['global_step'] != 241899 + updates or saved['scheduler']['last_epoch'] != updates:
        raise ValueError('恢复完整位置不一致')
    if not 0 <= updates <= 10000 or cursor > 80000:
        raise ValueError('恢复位置超出原预算')
    exact = digest == EXACT_CHECKPOINT_SHA
    if exact:
        binding = read(HERE / 'EXACT_RECOVERY_BINDING.json')
        if binding['checkpointSha256'] != digest or binding['armId'] != EXACT_ARM:
            raise ValueError('单一异常恢复绑定不符')
        if saved.get('recoveryAllowed') is not False or saved['reason'] != 'exception':
            raise ValueError('异常检查点原始资格字段改变')
        if saved['executionIdentity'] != control_identity['frozenV2'] or config['peakLearningRate'] != .0001:
            raise ValueError('异常来源不是批准的旧运行器/臂')
        if updates != 7758 or cursor != 62064 or saved['armBudget']['armId'] != EXACT_ARM:
            raise ValueError('不是唯一核验过的完整屏障')
        ledger_path = Path(saved['armBudget']['ledgerPath'])
        if str(ledger_path.resolve()) != str(Path(binding['ledgerPath']).resolve()):
            raise ValueError('原账本路径改变')
        if legacy_contracts.file_sha(ledger_path) != binding['closedLedgerSha256']:
            raise ValueError('原账本已改变；禁止重复使用异常恢复桥接')
        if saved['model'] is None or saved['baseCheckpointSha256'] != config['checkpointSha256']:
            raise ValueError('原模型来源不符')
    else:
        if not saved.get('recoveryAllowed', False) or saved.get('executionIdentity') != control_identity:
            raise ValueError('异常或不同控制修订的检查点禁止恢复')

    import torch
    from frozen import load_runtime
    runtime = load_runtime()
    for value in saved['model'].values():
        if value.device.type != 'cpu' or not torch.isfinite(value).all():
            raise ValueError('恢复模型不是有限CPU状态')
    for item in saved['optimizer']['state'].values():
        for value in item.values():
            if isinstance(value, torch.Tensor) and (value.device.type != 'cpu' or not torch.isfinite(value).all()):
                raise ValueError('恢复优化器不是有限CPU状态')
    if exact:
        if runtime.tensor_digest(saved['model']) != binding['modelDigest'] or runtime.tensor_digest(saved['optimizer']) != binding['optimizerDigest']:
            raise ValueError('异常完整状态摘要改变')
    elapsed, ledger_path, arm_id = legacy_budget.resume_budget(saved, digest)
    if exact:
        elapsed = max(elapsed, FLOOR_SECONDS)
        if arm_id != EXACT_ARM or 14400 - elapsed > 11933.0414379 + 1e-9:
            raise ValueError('异常恢复重置原臂预算')
    return dict(checkpointSha256=digest, exactExceptionBridge=exact,
                originalRecoveryAllowed=saved['recoveryAllowed'], elapsed=elapsed,
                ledgerPath=str(ledger_path), armId=arm_id,
                remainingUpdates=10000 - updates, remainingSamples=80000 - cursor,
                remainingWallSeconds=max(0., 14400 - elapsed),
                originalBytesUnchanged=True, executePermissionGranted=False)
