"""共享队列完成固定验收，再完整strict重放、审计中断前缀并汇总。"""
from pathlib import Path
import subprocess,sys,json,traceback
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
def save(n,x):(HERE/n).write_text(json.dumps(x,ensure_ascii=False),encoding='utf-8')
def args(name,*extra):return ['node',str(ROOT/'ai_training/run.mjs'),sys.executable,'-X','utf8','tactical_value_search_20261018/'+name,*extra]
def ts(name,*extra):return ['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_value_search_20261018/'+name,*extra]
def run(command,name):
    with (HERE/name).open('x',encoding='utf-8') as output:subprocess.run(command,cwd=ROOT,stdout=output,stderr=subprocess.STDOUT,check=True)
try:
    save('TASK_STATE.json',dict(status='running',phase='四臂200槽共享队列实战',complete=False))
    run(args('play_dynamic.py'),'dynamic-play.log');processes=[]
    save('TASK_STATE.json',dict(status='running',phase='200槽全量strict与中断前缀审计',complete=False))
    for lane in range(6):
        output=(HERE/f'battle-replay-{lane}.log').open('x',encoding='utf-8');processes.append(subprocess.Popen(ts('battle.ts','replay',str(lane),'6'),cwd=ROOT,stdout=output,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
    codes=[p.wait() for p in processes];assert not any(codes),codes
    run(ts('replay_interrupted.ts'),'interrupted-replay.log');run(args('summarize.py'),'summarize.log')
    save('pipeline-exit.json',dict(passed=True,dynamicQueue=True))
except BaseException as error:
    save('pipeline-exit.json',dict(passed=False,error=str(error),traceback=traceback.format_exc()));save('TASK_STATE.json',dict(status='failed',phase='保留共享队列失败现场',complete=False,error=str(error)));raise
