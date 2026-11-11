"""保全R2完整失败证据，预登记第三修订的通用算法与执行合同。"""
import copy
import shutil
from run_league import DIR, read, save, sha

source = DIR / 'phase54-audit/v5-deep-r2'; target = DIR / 'phase54-audit/v5-deep-r3'
assert read(source / 'superseded-summary.json')['gates']['allAttemptsStrict']
assert read(source / 'external-gui-change/authorization.json')['authorizedByHuman'] is True
assert not (target / 'protocol.json').exists(), '不覆盖已经登记的修订'
protocol = copy.deepcopy(read(source / 'protocol.json'))
protocol.update(runtimeRevision='phase54-v5-deep-r3-exact-order-full-queue-neural-recruit',previousPhaseSummary='phase54-audit/v5-deep-r2/superseded-summary.json',previousEvidenceManifest='phase54-audit/v5-deep-r2/superseded-evidence-manifest.json',reason='R2完整60+112及热点诊断：反扑首动作精确剪枝、执行完整胜出方案、根神经招募兵种优先序约束战术挑战；保留第3代原权重，不按对局反选权重。')
protocol['algorithmContract'] = dict(exactRetaliationOrdering=True,executeEvaluatedFullQueue=True,rootNeuralRecruitmentPreference=True,unconstrainedNeuralPrimary=True,enemyPolicyIndependent=True)
protocol['executionContract']['nodeArgs'].append('--retain-maps-for-n-gc=100000')
authorization = 'phase54-audit/v5-deep-r2/external-gui-change/authorization.json'
protocol['authorizedExternalEntrypointChanges'] = dict(path=authorization,sha256=sha(DIR / authorization),scope='用户明确保留并行困难版入口；保护以用户确认的外部基线核验，本任务继续不编辑GUI，原始SHA与R2保护失败保留。')
save(target / 'protocol.json',protocol)
for name in ['historical-manifest.json','read-only-engine-equivalence.json','numeric-reuse.json','selection.json']:
    shutil.copyfile(source / name,target / name)
for name in ['v4-conclusion','pure-strict']:
    shutil.copytree(source / name,target / name)
for arm in ['champion-search-arena','candidate-search-arena','engineering60']:
    plan = read(source / arm / 'plan.json')
    plan.update(runtimeRevision=protocol['runtimeRevision'],executionContract=protocol['executionContract'],algorithmContract=protocol['algorithmContract'],protocolSha256=sha(target / 'protocol.json'))
    save(target / arm / 'plan.json',plan)
print('第三修订已预登记，先专项等价和热点验证，再完整60+112')
