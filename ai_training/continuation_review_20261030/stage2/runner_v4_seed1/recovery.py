"""新控制身份和单一异常检查点桥接；执行必须另有协调者精确代码批准。"""
import json
from pathlib import Path

from frozen import HERE, REVIEWS, STAGE1, legacy_contracts, legacy_budget

PROTOCOL = 'continuation-control-v4-sync1'
EXACT_CHECKPOINT_SHA = '74b326d3981af8364252442991641e4d697b8b674b6eaa683f5a94cdf3181175'
EXACT_ARM = 'f167ec70-dd0b-48bd-9af0-fb6a45452d3e'
FLOOR_SECONDS = 2481.432339600011


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


PARENT_CONFIG_PATH = STAGE1 / 'stage2-configs/lr-1e-4.json'
REPLICATION_CONTRACT_PATH = HERE.parent / 'REPLICATION_CONTRACT.json'


def evaluation_config(config):
    parent = read(PARENT_CONFIG_PATH)
    expected = dict(parent, seed=20261031)
    if config != expected:
        raise ValueError('扩展仅允许原1e-4配置的训练抽样seed改为20261031')
    return parent


def validate_control(config):
    parent_config = evaluation_config(config)
    legacy_identity, science = legacy_contracts.validate(parent_config)
    extension = read(REPLICATION_CONTRACT_PATH)
    if extension['schema'] != 'continuation-sampler-seed-extension-v1' or extension['arm'] != 'lr-1e-4-seed20261031':
        raise ValueError('不是唯一获批种子扩展')
    if extension['scientificDifference'] != {'seed': {'from': 20261030, 'to': 20261031}}:
        raise ValueError('扩展科学差异超出seed范围')
    for item in extension['bindings'] + extension['sources']:
        if legacy_contracts.file_sha(item['path']) != item['sha256']:
            raise ValueError('扩展依赖或源码摘要改变：' + item['path'])
    if legacy_contracts.file_sha(HERE / 'CONFIG.json') != extension['actualConfigSha256']:
        raise ValueError('种子配置不再是冻结扩展')
    parent_control_path = HERE.parent / 'runner_v4_sync1/CONTROL_CONTRACT.json'
    parent_control_sha = legacy_contracts.file_sha(parent_control_path)
    if parent_control_sha != '18cadae52968a1aa313938f26393b83ea85d6710d8f8ccc687f7f4d8daa0cce5':
        raise ValueError('原V4控制合同改变')
    control = read(parent_control_path)
    if control['protocol'] != PROTOCOL or control['frozenScienceContractSha256'] != config['scienceContractSha256'] or control['frozenRunnerContractSha256'] != config['runnerContractSha256']:
        raise ValueError('原控制和科学合同不对应')
    for item in control['sources']:
        if legacy_contracts.file_sha(parent_control_path.parent / item['path']) != item['sha256']:
            raise ValueError('原V4控制源码改变：' + item['path'])
    for item in control['preservedEvidence']:
        if legacy_contracts.file_sha(item['path']) != item['sha256']:
            raise ValueError('历史故障原件改变：' + item['path'])
    return dict(protocol=PROTOCOL, controlContractSha256=parent_control_sha, frozenV2=legacy_identity,
                scientificNumericsInherited=True, controlRevisionChanged=False,
                extensionProtocol='continuation-sampler-seed-extension-v1',
                replicationContractSha256=legacy_contracts.file_sha(REPLICATION_CONTRACT_PATH),
                trainingSamplerSeed=20261031, evaluationConfigSha256=legacy_contracts.file_sha(PARENT_CONFIG_PATH)), science


def require_code_approval(path, control_identity, config, resume_sha=None):
    evaluation_config(config)
    extension = read(REPLICATION_CONTRACT_PATH)
    path = Path(path).resolve() if path else None
    expected = (REVIEWS / 'stage2-review-6.json').resolve()
    if path != expected or legacy_contracts.file_sha(path) != extension['reviewSha256']:
        raise ValueError('种子复验必须使用第六轮协调授权')
    approval = read(path)
    dispatch = read(STAGE1.parent / 'STAGE2_REPLICATION_DISPATCH.json')
    if approval.get('decision') != 'results_verified_stage3_gate_not_passed_bounded_replication_authorized':
        raise ValueError('第六轮未授权限定复验')
    if (dispatch['arm'], dispatch['trainingSamplerSeed'], dispatch['samples'], dispatch['updates'], dispatch['wallSeconds']) != ('lr-1e-4-seed20261031', 20261031, 80000, 10000, 14400):
        raise ValueError('获批复验范围不同')
    if control_identity['replicationContractSha256'] != legacy_contracts.file_sha(REPLICATION_CONTRACT_PATH):
        raise ValueError('扩展身份不符')
    preflight = read(HERE.parent / 'REPLICATION_PREFLIGHT.json')
    if not preflight['passed'] or not preflight['trainingSeedOnly'] or preflight['replicationContractSha256'] != control_identity['replicationContractSha256']:
        raise ValueError('尚无相同冻结扩展的完整预检')
    if preflight['real2mOptimizerUpdates'] or preflight['gpuForwardCalls']:
        raise ValueError('预检冒充实际训练')
    return dict(path=str(path), sha256=legacy_contracts.file_sha(path),
                replicationContractSha256=control_identity['replicationContractSha256'],
                conditionalSeedOnlyAuthorization=True)


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
        previous_identity = saved['executionIdentity']
        if previous_identity.get('protocol') != 'continuation-control-v3-repair3' or previous_identity.get('controlContractSha256') != binding['sourceControlContractSha256'] or previous_identity.get('frozenV2') != control_identity['frozenV2'] or config['peakLearningRate'] != .0001:
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
        closed = read(saved['armBudget']['ledgerPath'])
        if closed.get('status') == 'running' or closed.get('controlProtocol') != PROTOCOL or closed.get('shutdownTailReservationSeconds', 0) < 5:
            raise ValueError('同步控制账本未正常闭合并计入收尾，须另行审核，不自动恢复')

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
        if arm_id != EXACT_ARM or 14400 - elapsed > 11918.56766039999 + 1e-9:
            raise ValueError('异常恢复重置原臂预算')
    return dict(checkpointSha256=digest, exactExceptionBridge=exact,
                originalRecoveryAllowed=saved['recoveryAllowed'], elapsed=elapsed,
                ledgerPath=str(ledger_path), armId=arm_id,
                remainingUpdates=10000 - updates, remainingSamples=80000 - cursor,
                remainingWallSeconds=max(0., 14400 - elapsed),
                originalBytesUnchanged=True, executePermissionGranted=False)
