"""共享队列、可恢复的面板执行与strict重放。"""
from pathlib import Path
import subprocess,sys,os,json,time,concurrent.futures
from reuse_baselines import reuse
from device_protocol import reject_pc_games
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
phase=sys.argv[1];mode=sys.argv[2] if len(sys.argv)>2 else 'play';count=int(sys.argv[3]) if len(sys.argv)>3 else 2
if mode=='play':reject_pc_games()
count=json.loads((HERE/'execution-protocol.json').read_text(encoding='utf-8'))['battleWorkers']
teacher=phase.startswith('teacher');planname='teacher-battle-plan.json' if teacher else 'final-battle-plan.json'
plan=json.loads((HERE/planname).read_text(encoding='utf-8'));env=dict(os.environ,STAGE5_BATTLE_PLAN=planname,STAGE5_BATTLE_OUTPUT=phase+'-battles' if teacher else 'battles')
attempt=str(int(time.time()))
def run(i):
    slot=plan['slots'][i];prefix=HERE/env['STAGE5_BATTLE_OUTPUT']/'slots'/slot['id']
    if mode=='replay_completed' and not (prefix/'result.json').exists():return 0
    if (prefix/('result.json' if mode=='play' else 'strict-replay.json')).exists():return 0
    if phase=='final' and mode=='play' and reuse(slot,prefix):return 0
    with (HERE/f'{phase}-{mode}-{i}-{attempt}.log').open('x',encoding='utf-8') as out:
        return subprocess.run(['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_exit_20261019/battle.ts','replay' if mode=='replay_completed' else mode,str(i),str(len(plan['slots']))],cwd=ROOT,env=env,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)).returncode
with concurrent.futures.ThreadPoolExecutor(max_workers=count) as pool:
    results=list(pool.map(run,range(len(plan['slots']))))
(HERE/f'{phase}-{mode}-exit-{attempt}.json').write_text(json.dumps(dict(passed=not any(results),codes=results,concurrency=count)),encoding='utf-8')
sys.exit(int(any(results)))
