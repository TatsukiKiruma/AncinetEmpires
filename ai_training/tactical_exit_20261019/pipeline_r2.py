"""保留R1全部提交证据，完成R2教师资格后才恢复专家闭环。"""
from pathlib import Path
import subprocess,sys,json,time,traceback,hashlib,shutil
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;PY=sys.executable
def read(n):return json.loads((HERE/n).read_text(encoding='utf-8-sig'))
def save(n,v):(HERE/n).write_text(json.dumps(v,ensure_ascii=False),encoding='utf-8')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def phase(s):save('TASK_STATE.json',dict(status='running',complete=False,phase=s))
def run(args,label):
    log=HERE/f'{label}-{int(time.time())}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if r.returncode:raise RuntimeError(f'{log.name} 退出码{r.returncode}')
def py(n,*a):return ['node',str(ROOT/'ai_training/run.mjs'),PY,'-X','utf8','tactical_exit_20261019/'+n,*a]
def ts(n,*a):return ['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_exit_20261019/'+n,*a]
def node(n,*a):return ['node',str(ROOT/'ai_training/run.mjs'),'node','tactical_exit_20261019/'+n,*a]
try:
    phase('R1全部已提交动作及风险见证严格重放')
    while True:
        reports=sorted(HERE.glob('teacher-replay_completed-exit-*.json'))
        if reports:
            if not json.loads(reports[-1].read_text())['passed']:raise RuntimeError('R1 strict重放失败，禁止继续')
            break
        time.sleep(2)
    run(py('summarize_stopped.py'),'teacher-r1-stopped-summary')
    archive=HERE/'revisions/r1';archive.mkdir(parents=True,exist_ok=True)
    for n in ['pipeline-full-exit.json','teacher-speed.json','teacher-model-identities.json','source-freeze-teacher.json','teacher-r1-stopped-summary.json','TEACHER_R1_STOPPED.md']:
        target=archive/n
        if not target.exists():shutil.copy2(HERE/n,target)
    while not (HERE/'r2-ready.json').exists():time.sleep(2)
    ready=read('r2-ready.json');assert ready['passed'] and ready['coreSha256']==sha(HERE/'model_battle_search_ai.ts')
    phase('R2默认保底修订：速度及完整150槽教师资格')
    if not (HERE/'teacher-r2-speed.json').exists():run(ts('speed.ts','teacher-r2'),'teacher-r2-speed')
    assert read('teacher-r2-speed.json')['passed']
    if not (HERE/'teacher-r2-model-identities.json').exists():run(ts('model_identities.ts','teacher-r2'),'teacher-r2-identities')
    if not (HERE/'source-freeze-teacher-r2.json').exists():run(node('freeze_sources.mjs','teacher-r2'),'teacher-r2-freeze')
    if not (HERE/'teacher-r2-gate.json').exists():
        run(py('run_battles.py','teacher-r2','play','4'),'teacher-r2-battles')
        run(py('run_battles.py','teacher-r2','replay','4'),'teacher-r2-replay')
        run(py('summarize.py','teacher-r2'),'teacher-r2-summary')
    assert read('teacher-r2-gate.json')['passed'],'R2教师资格未过，保留全量结果，禁止专家采样'
    for source,target in [('teacher-r2-speed.json','teacher-speed.json'),('teacher-r2-model-identities.json','teacher-model-identities.json'),('source-freeze-teacher-r2.json','source-freeze-teacher.json'),('teacher-r2-battle-summary.json','teacher-battle-summary.json'),('TEACHER_R2_BATTLES.md','TEACHER_BATTLES.md')]:
        shutil.copy2(HERE/source,HERE/target)
    gate=dict(read('teacher-r2-gate.json'),activeRevision='r2',evidenceFolder='teacher-r2-battles',sourceGate='teacher-r2-gate.json');save('teacher-gate.json',gate)
    receipt=HERE/'pipeline-full-exit.json'
    if receipt.exists():
        target=archive/'pipeline-full-exit-original.json';assert not target.exists();receipt.rename(target)
    save('ACTIVE_TEACHER.json',dict(revision='r2',evidenceFolder='teacher-r2-battles',gate='teacher-r2-gate.json',priorStopped='teacher-r1-stopped-summary.json'))
    phase('R2教师通过，恢复40局纠错与蒸馏、最终200槽')
    run(py('pipeline_full.py'),'pipeline-full-after-r2')
    save('pipeline-r2-exit.json',dict(passed=True,teacherRevision='r2',readyForDelivery=read('pipeline-full-exit.json').get('readyForDelivery',False)))
except BaseException as e:
    save('pipeline-r2-exit.json',dict(passed=False,error=str(e),traceback=traceback.format_exc()));phase('R2保留现场，等待修复：'+str(e));raise
