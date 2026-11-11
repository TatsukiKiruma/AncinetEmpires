"""保全联合尝试，登记固定表征上的动作头语义联合拟合。"""
import gzip
import json
from run_league import DIR, ROOT, read, save, sha

folder = (DIR / 'generations/gen_03').resolve(); archive = folder / 'training-attempt03-joint-policy'
assert folder.is_relative_to(ROOT.resolve()) and not archive.exists()
audit = read(folder / 'dev-policy-audit.json'); assert not audit['passed'] and audit['modelSha256'] == sha(folder / 'model.bin')
keep = {'games', 'initial', 'league-plan.json', 'extraction-summary.json'}
entries = [p for p in folder.iterdir() if p.name not in keep and not p.name.startswith('training-attempt')]
identities = {p.relative_to(folder).as_posix(): sha(p) for e in entries for p in ([e] if e.is_file() else e.rglob('*')) if p.is_file()}
archive.mkdir()
for entry in entries:
    assert entry.parent == folder and not entry.is_symlink(); entry.rename(archive / entry.name)
assert all(sha(archive / p) == digest for p, digest in identities.items())
save(archive / 'ARCHIVE_MANIFEST.json', dict(files=identities, reason='联合策略训练仍未过原前检，继续同代诊断；未进入三端/112槽'))
selected = [r for r in json.loads(gzip.decompress((folder / 'training-attempt02-wait-linear/wait-constraint-training-ids.json.gz').read_bytes())) if r['constraint']]
assert len(selected) == 119
(folder / 'semantic-constraint-training-ids.json.gz').write_bytes(gzip.compress(json.dumps(selected, ensure_ascii=False).encode(), mtime=0))
warm = 'generations/gen_03/training-attempt01-prior-aware/model'
save(folder / 'semantic-repair-protocol.json', dict(schema='frozen-feature-semantic-joint-v1', generation=3, warmModel=warm, warmSha256=sha(DIR / (warm + '.bin')), championModel='generations/gen_00/model', epochs=20, constraintRepeats=16, lr=2e-5, minLr=2e-6, weightDecay=1e-4, gradientClip=1., baseRate=20000/141381, baseKl=1., baseActionCe=.2, baseHeadCe=1., baseOpportunityWeight=1., constraintKl=1., constraintOpportunityWeight=10., margin=.5, deltaL2=.01, trainedParameterRows=['what_entity.weight[:15]', 'what_entity.bias[:15]'], hardBaseSkip='prior<=-100000 或 目标为有未移动机会的wait；仍保留冠军KL', expertLoss='原先验感知纯纠错损失', cachedFeatures='仅RAM，不落盘；冻结骨干输出实体向量与完整候选分数', devUsedForOptimization=False, battleUsedForOptimization=False, stopAfterGeneration=3))
save(DIR / 'pipeline-status.json', dict(stage='semantic_joint_repair_prepared', generation=3, pids=[], gatesUnchanged=True, candidateArenaSlots=0))
print(dict(archivedFiles=len(identities), warmSha256=sha(DIR / (warm + '.bin'))))
