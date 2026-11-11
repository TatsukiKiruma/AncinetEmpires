"""无需Torch的统一科学比较门禁；先核验，再允许前向、更新或游戏推进。"""
import hashlib
import importlib.metadata
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PROTOCOL = 'continuation-runner-v2'


def file_sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def canonical_sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()


def validate(config, *, root=ROOT, here=HERE, expected_identity=None):
    root, here = Path(root), Path(here)
    contract_path = here / 'SCIENCE_CONTRACT.json'
    if file_sha(contract_path) != config.get('scienceContractSha256'):
        raise ValueError('科学合同不是配置批准的摘要，禁止自动重建基准')
    contract = json.loads(contract_path.read_text('utf-8'))
    runner_path = here / 'RUNNER_CONTRACT.json'
    if file_sha(runner_path) != config.get('runnerContractSha256'):
        raise ValueError('入口运行器不是配置批准的修订')
    runners = json.loads(runner_path.read_text('utf-8'))
    if runners['scienceContractSha256'] != config['scienceContractSha256'] or runners['runnerProtocol'] != PROTOCOL:
        raise ValueError('运行器与科学合同不对应')
    if {r['path'] for r in runners['sources']} != set(contract['runnerFiles']):
        raise ValueError('入口运行器清单缺失或新增未知入口')
    for entry in runners['sources']:
        if file_sha(here / entry['path']) != entry['sha256']:
            raise ValueError('入口运行器修订未获批准：' + entry['path'])
    if config.get('runnerProtocol') != PROTOCOL or contract['runnerProtocol'] != PROTOCOL:
        raise ValueError('运行器合同版本不支持')
    for key, value in contract['fixedConfig'].items():
        if config.get(key) != value:
            raise ValueError('配置与固定实现不一致：' + key)
    if config['peakLearningRate'] not in contract['learningRateArms']:
        raise ValueError('学习率不在批准比较臂中')
    if config.get('learningRateArms') != contract['learningRateArms']:
        raise ValueError('配置声明的学习率比较范围改变')
    for package, expected in contract.get('packages', {}).items():
        if importlib.metadata.version(package) != expected:
            raise ValueError('数值环境版本变化：' + package)
    for entry in contract['inputs']:
        if config.get(entry['configKey']) != entry['sha256'] or file_sha(root / entry['path']) != entry['sha256']:
            raise ValueError('冻结输入变化：' + entry['path'])
    for entry in contract['scienceSources']:
        if file_sha(root / entry['path']) != entry['sha256']:
            raise ValueError('科学比较依赖变化：' + entry['path'])
    for entry in contract['panelInitials']:
        if file_sha(here / entry['path']) != entry['sha256']:
            raise ValueError('冻结实战初态变化：' + entry['path'])
    for entry in contract['baselineArtifacts']:
        if file_sha(here / entry['path']) != entry['sha256']:
            raise ValueError('批准基线证据变化：' + entry['path'])
    identity = dict(runnerProtocol=PROTOCOL, scienceContractSha256=file_sha(contract_path), scienceSourcesSha256=canonical_sha(contract['scienceSources']), arenaExecutionSha256=canonical_sha(contract['arenaExecution']), offlinePanelSha256=config['offlinePanelSha256'], arenaPanelSha256=config['arenaPanelSha256'], partitionsSha256=config['partitionsSha256'], executionRuntime=contract.get('executionRuntime'))
    if expected_identity is not None and identity != expected_identity:
        raise ValueError('恢复或诊断的科学比较身份改变')
    return identity, contract


def runner_sources(contract, here=HERE):
    return dict(runnerContractSha256=file_sha(Path(here) / 'RUNNER_CONTRACT.json'), files={name: file_sha(Path(here) / name) for name in contract['runnerFiles']})


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=HERE / 'STAGE2_CONFIG.json')
    args = parser.parse_args()
    config = json.loads(args.config.read_text('utf-8'))
    identity, _ = validate(config)
    print(json.dumps(identity))
