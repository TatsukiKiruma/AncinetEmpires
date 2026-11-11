"""完成上一版本收尾，再以新版本完整资格验收恢复原训练闭环。"""
from pathlib import Path
import subprocess,sys,json,time,traceback,hashlib,shutil
from device_protocol import reject_pc_games
reject_pc_games()
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;PY=sys.executable
revision=sys.argv[1] if len(sys.argv)>1 else 'r3';previous=sys.argv[2] if len(sys.argv)>2 else 'teacher-r2';phaseName='teacher-'+revision
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
    phase(previous+'全部提交动作严格收尾')
    previousComplete=(HERE/f'{previous}-battle-summary.json').exists() and (HERE/f'{previous}-gate.json').exists()
    if previousComplete:
        # 已完整结束的失败面板保留完整汇总，不伪造成提前停止的部分面板。
        prior=read(f'{previous}-battle-summary.json');plan=read('teacher-battle-plan.json')
        for slot in plan['slots']:
            folder=HERE/f'{previous}-battles/slots'/slot['id'];r=json.loads((folder/'result.json').read_text());s=json.loads((folder/'strict-replay.json').read_text())
            assert s['passed'] and s['actions']==r['actions'],'前版本实际提交动作尚未全部strict'
    else:
        while True:
            reports=sorted(HERE.glob(previous+'-replay_completed-exit-*.json'))
            if reports:
                assert json.loads(reports[-1].read_text())['passed'],'前版本strict未通过'
                break
            time.sleep(2)
        run(py('summarize_revision_stop.py',previous),previous+'-stopped-summary')
    archive=HERE/'revisions'/previous.removeprefix('teacher-');archive.mkdir(parents=True,exist_ok=True)
    names=[f'{previous}-speed.json',f'{previous}-model-identities.json',f'source-freeze-{previous}.json',f'{previous}-stopped-summary.json',f'{previous}-battle-summary.json',f'{previous}-gate.json',f'pipeline-{previous.removeprefix("teacher-")}-exit.json']
    for n in names:
        p=HERE/n
        if p.exists() and not (archive/n).exists():shutil.copy2(p,archive/n)
    while not (HERE/f'{revision}-ready.json').exists():time.sleep(2)
    ready=read(f'{revision}-ready.json');assert ready['passed'] and ready['coreSha256']==sha(HERE/'model_battle_search_ai.ts')
    phase(revision+'完整150槽教师资格与速度验收')
    if not (HERE/f'{phaseName}-speed.json').exists():run(ts('speed.ts',phaseName),phaseName+'-speed')
    assert read(f'{phaseName}-speed.json')['passed']
    if not (HERE/f'{phaseName}-model-identities.json').exists():run(ts('model_identities.ts',phaseName),phaseName+'-identities')
    if not (HERE/f'source-freeze-{phaseName}.json').exists():run(node('freeze_sources.mjs',phaseName),phaseName+'-freeze')
    if not (HERE/f'{phaseName}-gate.json').exists():
        run(py('run_battles.py',phaseName,'play','4'),phaseName+'-battles');run(py('run_battles.py',phaseName,'replay','4'),phaseName+'-replay');run(py('summarize.py',phaseName),phaseName+'-summary')
    assert read(f'{phaseName}-gate.json')['passed'],'本版本教师门禁失败，禁止采样'
    # 晋升前保留旧的规范入口；失败资格证据不能被新的合格入口覆盖而丢失。
    priorCanonical=HERE/'revisions'/revision/('before-teacher-publication-'+str(time.time_ns()));priorCanonical.mkdir(parents=True,exist_ok=False)
    for name in ['teacher-speed.json','teacher-model-identities.json','source-freeze-teacher.json','teacher-battle-summary.json','TEACHER_BATTLES.md','teacher-gate.json','ACTIVE_TEACHER.json']:
        if (HERE/name).exists():shutil.copy2(HERE/name,priorCanonical/name)
    for source,target in [(f'{phaseName}-speed.json','teacher-speed.json'),(f'{phaseName}-model-identities.json','teacher-model-identities.json'),(f'source-freeze-{phaseName}.json','source-freeze-teacher.json'),(f'{phaseName}-battle-summary.json','teacher-battle-summary.json'),(phaseName.upper().replace('-','_')+'_BATTLES.md','TEACHER_BATTLES.md')]:shutil.copy2(HERE/source,HERE/target)
    save('teacher-gate.json',dict(read(f'{phaseName}-gate.json'),activeRevision=revision,evidenceFolder=phaseName+'-battles',sourceGate=f'{phaseName}-gate.json'))
    save('ACTIVE_TEACHER.json',dict(revision=revision,evidenceFolder=phaseName+'-battles',gate=f'{phaseName}-gate.json',priorAttempt=f'{previous}-battle-summary.json' if previousComplete else f'{previous}-stopped-summary.json'))
    phase(revision+'教师通过，继续40局专家和最终验收')
    run(py('pipeline_full.py'),'pipeline-full-after-'+revision)
    save(f'pipeline-{revision}-exit.json',dict(passed=True,readyForDelivery=read('pipeline-full-exit.json').get('readyForDelivery',False)))
except BaseException as e:
    save(f'pipeline-{revision}-exit.json',dict(passed=False,error=str(e),traceback=traceback.format_exc()));phase(revision+'保留失败现场：'+str(e));raise
