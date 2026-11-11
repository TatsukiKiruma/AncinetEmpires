"""仅首次生成待协调批准的第二版科学合同；已存在则拒绝覆盖。"""
import json
import importlib.metadata
from pathlib import Path
from contracts import HERE, ROOT, PROTOCOL, file_sha

target = HERE / 'SCIENCE_CONTRACT.json'
if target.exists():
    raise FileExistsError('科学合同已冻结，修改必须重新审核，禁止自动更新')
v1 = HERE / 'revisions/review1/v1'
config = json.loads((v1 / 'STAGE2_CONFIG.json').read_text('utf-8'))
sources = json.loads((v1 / 'SOURCE_MANIFEST.json').read_text('utf-8'))['sources']
evidence = {r['path']: r['sha256'] for r in json.loads((v1 / 'EVIDENCE_MANIFEST.json').read_text('utf-8'))['files']}
inputs = []
for key, name in [('checkpointSha256', 'ai_training/phone_2m_continue414_20261027/completion/job/output/checkpoint-1.pt'), ('partitionsSha256', 'ai_training/continuation_review_20261030/stage1/PARTITIONS.json'), ('offlinePanelSha256', 'ai_training/continuation_review_20261030/stage1/OFFLINE_PANEL.json'), ('arenaPanelSha256', 'ai_training/continuation_review_20261030/stage1/ARENA_PANEL.json')]:
    if file_sha(ROOT / name) != config[key]:
        raise ValueError('已审核第一版输入已变动：' + name)
    inputs.append(dict(configKey=key, path=name, sha256=config[key]))
scientific = []
for entry in sources:
    if entry['path'].startswith('ai_training/continuation_review_20261030/stage1/'):
        continue
    if file_sha(ROOT / entry['path']) != entry['sha256']:
        raise ValueError('已审核基线科学依赖已变动：' + entry['path'])
    scientific.append(entry)
for name in ['io.ts', 'encode_server.ts', 'sampling.py', 'runtime.py', 'budget.py', 'contracts.py', 'offline.py', 'arena_policy.ts', 'arena_contract.ts']:
    scientific.append(dict(path=str((HERE / name).relative_to(ROOT)).replace('\\', '/'), sha256=file_sha(HERE / name)))
baselines = []
for name in ['arena-baseline-r2/RUN.json', 'arena-baseline-r2/SUMMARY.json', 'offline-baseline/RESULT.json']:
    if file_sha(HERE / name) != evidence[name]:
        raise ValueError('已审核基线原件变化：' + name)
    baselines.append(dict(path=name, sha256=evidence[name]))
baselines.append(dict(path='revisions/review1/v1/SOURCE_MANIFEST.json', sha256=file_sha(v1 / 'SOURCE_MANIFEST.json')))
for name in ['encodingRequestTimeoutSeconds', 'diagnosticTimeoutSeconds']:
    config[name] = 120 if name.startswith('encoding') else 600
fixed_keys = ['stage', 'requiresCoordinatorApproval', 'checkpointSha256', 'partitionsSha256', 'offlinePanelSha256', 'arenaPanelSha256', 'sampleBudget', 'effectiveBatch', 'microbatch', 'warmupUpdates', 'endLearningRateRatio', 'newRatio', 'duelRatio', 'sampleWeight', 'policyWeight', 'valueWeight', 'gradientClip', 'weightDecay', 'optimizer', 'diagnosticEveryUpdates', 'checkpointEveryUpdates', 'seed', 'stop', 'encodingRequestTimeoutSeconds', 'diagnosticTimeoutSeconds']
panel = json.loads((HERE / 'ARENA_PANEL.json').read_text('utf-8'))
final = json.loads((HERE / 'SEALED_FINAL_PANEL.json').read_text('utf-8'))
contract = dict(schema='frozen-continuation-science-v2', status='pending_coordinator_review', runnerProtocol=PROTOCOL, fixedConfig={k: config[k] for k in fixed_keys}, learningRateArms=config['learningRateArms'], inputs=inputs, scienceSources=sorted(scientific, key=lambda r: r['path']), panelInitials=[dict(path=s['file'], sha256=s['sha256']) for p in [panel, final] for s in p['slots']], baselineArtifacts=baselines, arenaExecution={k: panel[k] for k in ['engineOptions', 'modelPolicy', 'maxActions', 'maxRounds', 'maxWallMs', 'maxDecisionMs', 'opponents']}, runnerFiles=['train.py', 'arena.ts', 'compare_arena.py'], separation='科学依赖固定摘要，入口运行器修订单独登记源码且必须继续满足同一protocol；源清单刷新不更新本合同。离线指标公式保留在offline.py故整文件冻结。', legacyBaseline='仅映射已审核接受的第一版40局原件；相同推理算法提取到arena_policy.ts，科学公共依赖逐一保持第一版SHA，未重跑或改写结果。')
contract['packages'] = {name: importlib.metadata.version(name) for name in ['torch', 'numpy']}
contract['executionRuntime'] = dict(device='cuda:0', dtype='float32', packages=contract['packages'])
target.write_text(json.dumps(contract, ensure_ascii=False, indent=2), 'utf-8')
config.update(scienceContractSha256=file_sha(target), runnerProtocol=PROTOCOL)
runner_contract = dict(schema='approved-runner-revision-v2', runnerProtocol=PROTOCOL, scienceContractSha256=file_sha(target), status='pending_coordinator_review', sources=[dict(path=name, sha256=file_sha(HERE / name)) for name in contract['runnerFiles']], distinction='调度/预算/汇总入口可单独经协调者审核修订；不改变scienceContract指纹，不允许入口源码静默变化。比较器当前要求双方处于同一批准运行器修订，第一版基线仅有明确SHA特例。')
(HERE / 'RUNNER_CONTRACT.json').write_text(json.dumps(runner_contract, ensure_ascii=False, indent=2), 'utf-8')
config['runnerContractSha256'] = file_sha(HERE / 'RUNNER_CONTRACT.json')
(HERE / 'STAGE2_CONFIG.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps(dict(frozen=True, sources=len(scientific), scienceContractSha256=file_sha(target))))
