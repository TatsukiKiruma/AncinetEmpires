"""创建独立种子扩展源码；保留所有原始冻结文件。"""
import difflib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PARENT = HERE / 'runner_v4_sync1'
TARGET = HERE / 'runner_v4_seed1'


if __name__ == '__main__':
    TARGET.mkdir(exist_ok=False)
    for name in ['frozen.py', 'io_control.py', 'recovery.py', 'train.py']:
        (TARGET / name).write_bytes((PARENT / name).read_bytes())
    path = TARGET / 'train.py'
    source = path.read_text('utf-8')
    replacements = [
        ('require_code_approval, inspect_resume', 'require_code_approval, inspect_resume, evaluation_config, PARENT_CONFIG_PATH'),
        ("frozenV2RunnerContractSha256=config['runnerContractSha256']))", "frozenV2RunnerContractSha256=config['runnerContractSha256'],\n                                           replicationContractSha256=execution['replicationContractSha256']))"),
        ("runtime.Encoder(args.out / 'encoder.stderr.log', config, legacy_execution)", "runtime.Encoder(args.out / 'encoder.stderr.log', evaluation_config(config), legacy_execution)"),
        ('str(Path(args.config).resolve())', 'str(PARENT_CONFIG_PATH)')]
    for old, new in replacements:
        assert source.count(old) == 1, old
        source = source.replace(old, new)
    path.write_text(source, 'utf-8')
    recovery_path = TARGET / 'recovery.py'
    recovery = recovery_path.read_text('utf-8')
    start = recovery.index('def validate_control(config):')
    end = recovery.index('def inspect_resume(', start)
    replacement = '''PARENT_CONFIG_PATH = STAGE1 / 'stage2-configs/lr-1e-4.json'
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


'''
    recovery = recovery[:start] + replacement + recovery[end:]
    recovery_path.write_text(recovery, 'utf-8')
    parent_config = json.loads((HERE.parent / 'stage1/stage2-configs/lr-1e-4.json').read_text('utf-8'))
    (TARGET / 'CONFIG.json').write_text(json.dumps(dict(parent_config, seed=20261031), ensure_ascii=False, indent=2) + '\n', 'utf-8')
    changes = {}
    for name in ['frozen.py', 'io_control.py', 'recovery.py', 'train.py']:
        old, new = (PARENT / name).read_text('utf-8'), (TARGET / name).read_text('utf-8')
        changes[name] = list(difflib.unified_diff(old.splitlines(True), new.splitlines(True), fromfile='runner_v4_sync1/' + name, tofile='runner_v4_seed1/' + name))
    (TARGET / 'SOURCE_DIFF.patch').write_text(''.join(line for lines in changes.values() for line in lines), 'utf-8')
    (TARGET / 'TRANSFORMATIONS.json').write_text(json.dumps(dict(trainReplacements=replacements,
        identicalFiles=['frozen.py', 'io_control.py'], recoveryChanges='仅独立种子门禁和第六轮条件授权；inspect_resume原函数逐字保留'), ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print('已创建独立seed扩展源码，尚未冻结或执行')
