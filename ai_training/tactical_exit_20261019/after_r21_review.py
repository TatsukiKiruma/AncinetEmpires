"""计时对局全部结束后核对轨迹；失败严格收尾后才启动下一轮缺陷诊断。"""
from pathlib import Path
import subprocess,json,time,sys
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r21'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
plan=read(HERE/'teacher-battle-plan.json')
def run(args,label):
    log=REV/f'{label}-{time.time_ns()}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,log
    print(label,'通过',flush=True)
while not all((HERE/'teacher-r21-battles/slots'/s['id']/'result.json').exists() for s in plan['slots']):time.sleep(2)
run(['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/review_r21_trajectories.py'],'paired-baseline-trajectories')
while not (HERE/'teacher-r21-gate.json').exists():time.sleep(2)
if read(HERE/'teacher-r21-gate.json')['passed']:
    print('教师合格，继续既定专家闭环；不额外运行失败诊断',flush=True)
else:
    run(['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/probe_deployment_completion_gap.ts','teacher-r21'],'retained-deployment-completion-probe')
    print('R21失败的完整严格证据和下一轮缺陷诊断均已保留；专家未解锁',flush=True)
