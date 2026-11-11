"""固定开发集选定模型后才进入新三端和112槽正式评测。"""
import os
import subprocess
import sys
import time
from run_league import DIR, ROOT, read, save, sha, parity, command, verify_runtime_contract
from arena_summary import summarize


def main():
    protocol = read(DIR / 'phase53-audit/gen4-protocol.json'); os.environ.update(LEAGUE_EVIDENCE_LIMIT=str(protocol['resource']['evidenceCapBytes']),LEAGUE_GENERATION='4',LEAGUE_EXPERT_MIN_GENERATION='4')
    folder = DIR / 'generations/gen_04'; verify_runtime_contract()
    # 对手投影缓存只做等价提速；先完成纯策略轨迹复核与新搜索教师基准，才开始新模型面板。
    ready = DIR / 'phase53-audit/opponent-optimization-ready.json'
    if not ready.exists(): save(DIR / 'phase53-audit/gen4-status.json',dict(stage='waiting_opponent_baseline',startedAt=time.time()))
    while not ready.exists(): time.sleep(5)
    assert read(ready)['passed'], '对手提速的评分等价与新基准必须先完成'
    profile = read(ready)['profile']
    assert profile['sourceSha256'] == sha(ROOT / 'src/game/ai/tactical_evaluation.ts')
    audit = read(folder / 'dev-policy-audit.json'); selection = read(folder / 'grid-selection.json')
    assert audit['passed'] and selection['passed'] and audit['modelSha256'] == sha(folder / 'model.bin') and audit['selectedCandidate'] == selection['selected']
    assert not selection['usesBattleResults'] and read(folder / 'training-complete.json')['maxValueLogitsDifference'] == 0.
    parity(4)
    command('gen4-arena-plan.log',['node',str(ROOT / 'ai_training/run.mjs'),sys.executable,'-B','-X','utf8','dual_stream_v2_phase5_20261020/arena_plan.py','4'])
    target = folder / 'arena/plan.json'; plan = read(target); baseline = read(DIR / 'champion-search-arena/plan.json')
    fields = dict(runtimeRevision=baseline['runtimeRevision'],executionContract=baseline['executionContract'],modelSha256=sha(folder / 'model.bin'),devSelectionSha256=sha(folder / 'grid-selection.json'))
    lock = folder / 'arena/plan-lock.json'
    if not lock.exists():
        assert not (folder / 'arena/battles').exists(), '正式开局后不可改写计划'
        plan.update(fields); save(target,plan); save(lock,dict(sha256=sha(target),**fields))
    assert read(lock)['sha256'] == sha(target) and all(plan[k] == v for k,v in fields.items())
    freeze = read(DIR / 'phase53-audit/runtime-freeze.json')
    assert all(sha(ROOT / p) == h for p,h in {**freeze['runtime'],**freeze['harness']}.items())
    processes = []; logs = []
    try:
        for lane in range(2):
            output = (DIR / f'gen4-arena-{lane}.log').open('ab'); logs.append(output)
            args = ['node',str(ROOT / 'ai_training/run.mjs'),'node',*plan['executionContract']['nodeArgs'],'--import','tsx','dual_stream_v2_phase5_20261020/battle.ts','play',str(lane),'2']
            processes.append(subprocess.Popen(args,cwd=ROOT,env={**os.environ,'LEAGUE_ARENA':'generations/gen_04/arena'},stdout=output,stderr=subprocess.STDOUT))
        save(DIR / 'phase53-audit/gen4-status.json',dict(stage='formal_arena',pids=[p.pid for p in processes],startedAt=time.time(),modelSha256=fields['modelSha256']))
        codes = [p.wait() for p in processes]; assert codes == [0,0], f'保留全部正式前缀，不能覆盖失败槽:{codes}'
    finally:
        for output in logs: output.close()
    summarize(4)
    command('gen4-isolation.log',['node',str(ROOT / 'ai_training/run.mjs'),'node','--import','tsx','dual_stream_v2_phase5_20261020/isolation_gen4_phase53.ts'])
    command('gen4-finish.log',['node',str(ROOT / 'ai_training/run.mjs'),sys.executable,'-B','-X','utf8','dual_stream_v2_phase5_20261020/finish_gen4_phase53.py'])


if __name__ == '__main__': main()
