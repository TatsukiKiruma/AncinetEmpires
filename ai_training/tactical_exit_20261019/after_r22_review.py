"""完整面板失败且strict收尾后才运行附加诊断；合格教师继续原闭环。"""
from pathlib import Path
import json,subprocess,sys,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r22'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
def run(args,label):
    p=REV/f'{label}-{time.time_ns()}.log'
    with p.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,p;print(label,'通过',flush=True)
while not (HERE/'teacher-r22-gate.json').exists():time.sleep(2)
gate=read(HERE/'teacher-r22-gate.json');assert gate['strictReplay'] and gate['slots']==150
if gate['passed']:
    print('教师已通过，附加失败诊断不执行；继续原专家闭环',flush=True);raise SystemExit(0)
run(['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/index_consumed_inputs.py','teacher-r22'],'all-consumed-inputs')
run(['node','ai_training/run.mjs','node','node_modules/typescript/bin/tsc','-p','tactical_exit_20261019/tsconfig.json','--noEmit'],'diagnostic-typecheck')
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='R22完整150槽失败且全部strict；诊断已执行突击完结分支，专家0'),ensure_ascii=False),encoding='utf-8')
run(['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/probe_assault_completion_paths.ts','teacher-r22'],'assault-completion-causal-probe')
with (REV/'post-panel-diagnostic-exit.json').open('x',encoding='utf-8') as out:json.dump(dict(passed=True,teacherQualified=False,expertGames=0),out)
