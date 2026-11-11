"""对已严格结束的完整面板补充自动换手与实际多敌攻击指标，不运行策略。"""
from pathlib import Path
import subprocess,concurrent.futures,sys,time,json
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;phase=sys.argv[1];stamp=int(time.time())
plan=json.loads((HERE/('teacher-battle-plan.json' if phase.startswith('teacher') else 'final-battle-plan.json')).read_text(encoding='utf-8'));folder=phase+'-battles' if phase.startswith('teacher') else 'battles'
assert all((HERE/f"{folder}/slots/{s['id']}/{n}").exists() for s in plan['slots'] for n in ['result.json','strict-replay.json']),'完整面板结束前拒绝启动辅助重放'
def run(lane):
    with (HERE/f'{phase}-metric-audit-{lane}-{stamp}.log').open('x',encoding='utf-8') as out:
        r=subprocess.run(['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_exit_20261019/audit_opportunities.ts',phase,str(lane),'4'],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        return r.returncode
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:codes=list(pool.map(run,range(4)))
(HERE/f'{phase}-metric-audit-exit-{stamp}.json').write_text(json.dumps(dict(passed=not any(codes),codes=codes,scope='只读权威重放，不调用策略，不改变任何对战计时')),encoding='utf-8');assert not any(codes),codes
