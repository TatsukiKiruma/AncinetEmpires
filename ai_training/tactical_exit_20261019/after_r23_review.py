"""完整失败及strict收尾后，诊断覆盖前提是否误判真实安全完结。"""
from pathlib import Path
import json,subprocess,sys,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r23'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
def run(args,label):
    p=REV/f'{label}-{time.time_ns()}.log'
    with p.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,p;print(label,'通过',flush=True)
while not (HERE/'teacher-r23-gate.json').exists():time.sleep(2)
gate=read(HERE/'teacher-r23-gate.json');assert gate['strictReplay'] and gate['slots']==150
if gate['passed']:print('教师合格，继续原专家闭环，不运行失败诊断',flush=True);raise SystemExit(0)
run(['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/index_consumed_inputs.py','teacher-r23'],'all-consumed-inputs')
run(['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/review_paired_trajectories.py','teacher-r22','teacher-r23','revisions/r23'],'full-paired-trajectories')
run(['node','ai_training/run.mjs','node','tactical_exit_20261019/diagnose_coverage_regression.mjs','teacher-r22','teacher-r23'],'actual-safe-recruitment-premise')
with (REV/'post-panel-diagnostic-exit.json').open('x',encoding='utf-8') as out:json.dump(dict(passed=True,teacherQualified=False,expertGames=0),out)
