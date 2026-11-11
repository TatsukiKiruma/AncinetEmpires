"""完整复验收尾后诊断，不把失败教师送入专家采样。"""
from pathlib import Path
import json,subprocess,sys,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r21/resume1';PHASE='teacher-r21-resume1'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
def run(args,label):
    log=REV/f'{label}-{time.time_ns()}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,(label,str(log));print(label,'通过',flush=True)
def py(n,*a):return ['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/'+n,*a]
def ts(n,*a):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*a]
while not (REV/'resume-exit.json').exists():time.sleep(2)
assert read(REV/'resume-exit.json')['passed'];gate=read(HERE/f'{PHASE}-gate.json')
run(py('index_consumed_inputs.py',PHASE),'all-consumed-inputs-including-interrupted')
run(py('review_paired_trajectories.py','teacher-r20',PHASE),'full-paired-trajectories')
if not gate['passed']:
    (HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='R21完整150槽失败并strict收尾：定位扩展时延与空城部署完结；专家0'),ensure_ascii=False),encoding='utf-8')
    if not all(g['latency'] and g['rootLatency'] for g in gate['panels'].values()):
        run(['node','ai_training/run.mjs','node','tactical_exit_20261019/profile_frozen_runtime.mjs',PHASE],'frozen-actual-slow-root-profile')
    run(ts('probe_deployment_completion_gap.ts',PHASE),'causal-deployment-completion-probe')
with (REV/'diagnostic-exit.json').open('x',encoding='utf-8') as out:json.dump(dict(passed=True,teacherGatePassed=gate['passed'],expertStarted=False),out)
print('本轮诊断收尾，真正搜索专家仍为0',flush=True)
