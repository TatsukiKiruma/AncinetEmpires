"""按完整失败和配对诊断冻结深度版第二修订，不更换候选权重。"""
import copy
import shutil
from run_league import DIR, read, save, sha

source = DIR / 'phase54-audit/v5-deep'; target = DIR / 'phase54-audit/v5-deep-r2'
assert read(source / 'superseded-engineering-summary.json')['gates']['allAttemptsStrict']
assert read(source / 'gc-comparison/comparison.json')['passed']
if (target / 'protocol.json').exists():
    print('深度第二修订已登记，保持原件')
else:
    protocol = copy.deepcopy(read(source / 'protocol.json'))
    protocol.update(runtimeRevision='phase54-v5-deep-r2-admission220-yield',previousPhaseSummary='phase54-audit/v5-deep/superseded-engineering-summary.json',previousEvidenceManifest='phase54-audit/v5-deep/superseded-evidence-manifest.json',candidateAdmissionMinWindowMs=220,extensionReservePerRemainingEnemyMs=70,reason='完整首轮60局与三次配对诊断：决赛挑战不足220ms不启动，延伸链为后续敌方每顺位预留70ms核心窗口，计时前归还事件循环；模型仍为预登记第3代，不按棋力选权重。')
    protocol['executionContract']['yieldBeforeDecision'] = True
    save(target / 'protocol.json',protocol)
    for name in ['historical-manifest.json','read-only-engine-equivalence.json','numeric-reuse.json','selection.json']:
        shutil.copyfile(source / name,target / name)
    shutil.copytree(source / 'v4-conclusion',target / 'v4-conclusion')
    shutil.copytree(source / 'pure-strict',target / 'pure-strict')
    for arm in ['champion-search-arena','candidate-search-arena','engineering60']:
        plan = read(source / arm / 'plan.json')
        plan.update(runtimeRevision=protocol['runtimeRevision'],executionContract=protocol['executionContract'],candidateAdmissionMinWindowMs=220,extensionReservePerRemainingEnemyMs=70,protocolSha256=sha(target / 'protocol.json'))
        save(target / arm / 'plan.json',plan)
    print('深度第二修订已登记，仍先工程60再配对112槽')
