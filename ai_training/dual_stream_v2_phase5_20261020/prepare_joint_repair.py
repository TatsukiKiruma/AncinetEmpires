"""保全第二次同代尝试，并在读取新开发指标之前固定联合训练合同。"""
import shutil
from run_league import DIR, ROOT, read, save, sha

folder = (DIR / 'generations/gen_03').resolve()
archive = (folder / 'training-attempt02-wait-linear').resolve()
assert folder.is_relative_to(ROOT.resolve()) and archive.parent == folder and not archive.exists()
keep = {'games', 'initial', 'league-plan.json', 'extraction-summary.json', 'training-attempt01-prior-aware'}
entries = [p for p in folder.iterdir() if p.name not in keep]
identities = {p.relative_to(folder).as_posix(): sha(p) for entry in entries for p in ([entry] if entry.is_file() else entry.rglob('*')) if p.is_file()}
assert read(folder / 'tri-runtime-parity.json')['passed']
assert read(folder / 'wait-row-byte-audit.json')['passed']
archive.mkdir()
for entry in entries:
    assert entry.parent == folder and not entry.is_symlink()
    entry.rename(archive / entry.name)
assert all(sha(archive / p) == digest for p, digest in identities.items())
save(archive / 'ARCHIVE_MANIFEST.json', dict(files=identities, reason='待机线性校正仍未过原前检，用户要求保持门禁继续同代联合修复'))
history = DIR / 'phase52-audit/attempt02-precheck-documents'; history.mkdir(exist_ok=True)
for name in ['REPORT.md', 'BATTLES.md', 'gate-summary.json', 'LEAGUE_RESUME_GUIDE.md', 'pipeline-status.json']:
    shutil.copyfile(DIR / name, history / name)
shutil.copyfile(ROOT / 'ai_training/status/CURRENT.md', history / 'CURRENT.md')
save(folder / 'joint-repair-protocol.json', dict(schema='train-only-joint-policy-v1', generation=3, warmModel='generations/gen_03/training-attempt02-wait-linear/model', warmSha256=sha(archive / 'model.bin'), championModel='generations/gen_00/model', baseRate=20000/141381, epochs=2, constraintRepeats=8, optimizer='AdamW', lr=1e-5, minLr=2e-6, weightDecay=1e-4, gradientClip=1., baseKl=2., baseCe=.2, championCorrectHeadMargin=.2, championCorrectHeadWeight=.5, opportunityMargin=.5, baseOpportunityWeight=1., constraintOpportunityWeight=10., expertLoss='原先验感知纯纠错损失', devUsedForOptimization=False, battleUsedForOptimization=False, stopAfterGeneration=3))
save(DIR / 'pipeline-status.json', dict(stage='same_generation_joint_repair', generation=3, currentCompletedGeneration=2, pids=[], gatesUnchanged=True, userDecision='保持原门禁，继续同代优化', candidateArenaSlots=0))
print(dict(archivedFiles=len(identities), warmSha256=sha(archive / 'model.bin')))
