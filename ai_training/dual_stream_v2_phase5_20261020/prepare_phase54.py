"""阶段5.4：先保全旧证据，再登记固定第3代候选与同运行时验收计划。"""
import copy
import shutil
from run_league import DIR, ROOT, read, save, sha

AUDIT = DIR / 'phase54-audit'


def main():
    AUDIT.mkdir(exist_ok=True)
    if (AUDIT / 'protocol.json').exists():
        print('阶段5.4协议已登记，保持原件')
        return
    # 历史评测目录继续原位封存，逐文件SHA与小型结论副本构成完整归档。
    files = {}
    for base in [DIR, ROOT / 'src/ai_runtime/dual_v2']:
        for path in base.rglob('*'):
            if path.is_file() and AUDIT not in path.parents:
                files[path.relative_to(ROOT).as_posix()] = dict(sha256=sha(path), bytes=path.stat().st_size)
    protected = {p:sha(ROOT / p) for p in ['src/App.tsx','src/game/ai/neural_ai_adapter.ts','src/game/ai/ai_worker.ts']}
    save(AUDIT / 'historical-manifest.json', dict(files=files, protected=protected, policy='旧文件原位封存，只有明确列出的工作文档及框架允许更新；模型与对局不覆写'))
    for name in ['RUNTIME_REVISION.json','league-state.json','gate-summary.json','REPORT.md','BATTLES.md','dual-v2-champion.json','dual-v2-champion.bin']:
        dest = AUDIT / 'v4-conclusion' / name
        dest.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(DIR / name,dest)
    candidate = 'generations/gen_03'
    assert sha(DIR / candidate / 'model.bin') == 'e29d75abafda78c4e15ea523e785878c70027e0a5a5650ed92bb085bc574e39d'
    protocol = dict(phase='5.4',runtimeRevision='phase54-v5',candidateGeneration=3,candidateModel=candidate+'/model',candidateSha256=sha(DIR / candidate / 'model.bin'),selection='复用已通过开发审计且纯策略41胜的第3代，不生成新权重，不按本轮对局反选策略',usesBattleSelection=False,resource=dict(evidenceCapBytes=2_000_000_000,minimumFreeBytes=12*1024**3),executionContract=dict(nodeArgs=['--expose-gc','--max-semi-space-size=128'],lanes=2,budgetMs=1000,timing='原始performance.now墙钟，包含计时区内全部GC与调度；显式回收在开局和根见证写盘后，计入整局墙钟'),targets=dict(pureWins=41,searchWins=43,purePanels=dict(fixed=16,expanded=15,multiplayer=10),queueMaxExclusive=.5,retaliationCompletion=1),formalSearchSlots=112,engineeringInitialStates=60,training=False)
    save(AUDIT / 'protocol.json',protocol)
    for generation, source, name in [(0,'champion-search-arena','champion-search-arena'),(3,'generations/gen_03/arena','candidate-search-arena')]:
        plan = read(DIR / source / 'plan.json')
        plan['slots'] = [s for s in plan['slots'] if s['mode'] == 'turn_search']
        assert len(plan['slots']) == 56
        plan.update(runtimeRevision=protocol['runtimeRevision'],executionContract=protocol['executionContract'],modelSha256=sha(DIR / (plan['modelPrefix']+'.bin')),protocolSha256=sha(AUDIT / 'protocol.json'))
        save(AUDIT / name / 'plan.json',plan)
    engineering = copy.deepcopy(read(DIR / 'phase53-audit/gen4-engineering-replay/plan.json'))
    engineering.update(runtimeRevision=protocol['runtimeRevision'],executionContract=protocol['executionContract'],teacherModel=candidate+'/model',teacherSha256=protocol['candidateSha256'],teacherCalibration=candidate,protocolSha256=sha(AUDIT / 'protocol.json'),engineeringOnly=True,trainingLabelsAdmitted=False)
    save(AUDIT / 'engineering60/plan.json',engineering)
    save(AUDIT / 'selection.json',dict(passed=read(DIR / candidate / 'dev-policy-audit.json')['passed'],generation=3,modelSha256=protocol['candidateSha256'],devPolicyAuditSha256=sha(DIR / candidate / 'dev-policy-audit.json'),usesBattleResults=False,newWeights=False))
    print(dict(files=len(files),freeGiB=shutil.disk_usage(DIR).free/1024**3,candidateSha256=protocol['candidateSha256']))


if __name__ == '__main__': main()
