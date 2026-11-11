"""先收尾全部停止轨迹，再保留135局并独立重跑15个未完槽，不覆盖历史。"""
from pathlib import Path
import concurrent.futures,datetime,gzip,hashlib,json,os,shutil,subprocess,sys,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;PY=sys.executable
PHASE='teacher-r21-resume1';REV=HERE/'revisions/r21/resume1';REV.mkdir(parents=True,exist_ok=True)
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
def write(p,v):
    with Path(p).open('x',encoding='utf-8') as out:json.dump(v,out,ensure_ascii=False)
def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
    return h.hexdigest()
def run(args,label):
    log=REV/f'{label}-{time.time_ns()}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,(label,str(log));print(label,'通过',flush=True)
def ts(n,*args):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*map(str,args)]
def py(n,*args):return ['node','ai_training/run.mjs',PY,'-X','utf8','tactical_exit_20261019/'+n,*map(str,args)]
def phase(text):
    (HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase=text,qualifiedTeacher=False,trueSearchExpertGames=0),ensure_ascii=False),encoding='utf-8')
stop=read(HERE/'revisions/r21/USER_STOP_20261019T222424.json');plan=read(HERE/'teacher-battle-plan.json')
phase('R21用户恢复：135完成局与4中断原始轨迹strict收尾，教师仍不合格、专家0')
run(py('run_battles.py','teacher-r21','replay_completed',4),'completed-strict')
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(lambda i:None if (HERE/stop['interruptedSlots'][i]['rawLog']).with_name('strict-prefix-replay.json').exists() else run(ts('replay_interrupted_r21.ts',i),'prefix-strict-'+str(i)),range(4)))
actual=0;risk=0;inputs=set();logs=[]
for entry in stop['interruptedSlots']:
    f=HERE/entry['rawLog'];r=read(f.with_name('strict-prefix-replay.json'));assert r['passed'] and r['actions']==entry['completeLines'] and sha(f)==entry['sha256']
    actual+=r['actions'];risk+=r['riskWitnessAudit'].get('witnessActions',0)
    with f.open(encoding='utf-8') as inp:inputs.update(json.loads(line)['beforeHash'] for line in inp)
    logs.append(dict(path=entry['rawLog'],sha256=entry['sha256'],actions=r['actions'],classification='user_interrupted_prefix'))
    # 生成独立压缩副本供排重绑定，不修改原始动作或补造对局结局。
    target=REV/(entry['slot']+'.interrupted.actions.jsonl.gz')
    if not target.exists():
        with f.open('rb') as inp,target.open('xb') as out,gzip.GzipFile(filename='',fileobj=out,mode='wb',mtime=0) as gz:shutil.copyfileobj(inp,gz)
    logs[-1].update(compressedPath=target.relative_to(HERE).as_posix(),compressedSha256=sha(target))
completed=[]
for slot in plan['slots']:
    f=HERE/'teacher-r21-battles/slots'/slot['id']
    if not (f/'result.json').exists():continue
    r=read(f/'result.json');s=read(f/'strict-replay.json');assert s['passed'] and s['actions']==r['actions']
    actual+=s['actions'];risk+=s['riskWitnessAudit'].get('witnessActions',0);completed.append(slot['id'])
assert len(completed)==135 and actual==77935+4343
proof=dict(passed=True,completedSlots=135,interruptedSlots=4,actualActions=actual,riskWitnessActions=risk,partialLogs=logs,interruptedBeforeHashes=sorted(inputs),scope='全部停止现场实际动作strict，不代表150槽资格通过')
if not (REV/'stopped-strict-gate.json').exists():write(REV/'stopped-strict-gate.json',proof)
protocol=dict(registeredAt=datetime.datetime.now().isoformat(timespec='seconds'),phase=PHASE,sourceAttempt='teacher-r21',retainedCompletedSlots=completed,rerunFromInitialSlots=[s['id'] for s in plan['slots'] if s['id'] not in completed],interruptedOriginals=logs,initialization='4个中断槽和11个未开始槽从相同初态/模型/种子重新运行；中断前缀单独保留与strict，对重跑公共前缀另验一致',budgets=plan['budgets'],workers=4,sourceAndModel='与已冻结R21完全相同',thresholds='原固定/扩展质量、全步/根p95<=600ms、两类搜索超时0均保持；不以部分面板判断通过',selectionUsesResults=False,completedEvidenceReuse='135局原完整收据与原计时逐字节复用；新目录硬链接只读原件，不重新计时或挑选成功局')
if not (REV/'resume-protocol.json').exists():write(REV/'resume-protocol.json',protocol)
else:assert read(REV/'resume-protocol.json')['rerunFromInitialSlots']==protocol['rerunFromInitialSlots']
assert len(protocol['rerunFromInitialSlots'])==15
for name in ['model-identities','speed']:
    target=HERE/f'{PHASE}-{name}.json';source=HERE/f'teacher-r21-{name}.json'
    if not target.exists():shutil.copy2(source,target)
    assert sha(source)==sha(target)
original=read(HERE/'source-freeze-teacher-r21.json')
for name,entry in original['files'].items():assert sha(ROOT/name)==entry['sha256'],name
target=HERE/f'source-freeze-{PHASE}.json'
if not target.exists():shutil.copy2(HERE/'source-freeze-teacher-r21.json',target)
# 本机受限环境拒绝硬链接；保留初始登记并在任何重跑计时之前追加复制方式说明。
amendment=REV/'evidence-copy-amendment.json'
if not amendment.exists():write(amendment,dict(registeredAt=datetime.datetime.now().isoformat(timespec='seconds'),reason='创建第一个硬链接时WinError5，尚未启动任何重跑',actualMethod='shutil.copy2逐字节副本并核对SHA256，原文件只读',changesDecisionOrBudget=False))
manifest=[]
for name in completed:
    source=HERE/'teacher-r21-battles/slots'/name;target=HERE/(PHASE+'-battles/slots')/name;target.mkdir(parents=True,exist_ok=True)
    for old in source.iterdir():
        if not old.is_file():continue
        new=target/old.name
        if not new.exists():shutil.copy2(old,new)
        assert sha(new)==sha(old);manifest.append(dict(source=old.relative_to(HERE).as_posix(),target=new.relative_to(HERE).as_posix(),sha256=sha(old)))
if not (REV/'retained-evidence.json').exists():write(REV/'retained-evidence.json',manifest)
phase('R21独立恢复面板：保留135完整局，原初态重跑4中断与11未开始槽；专家0')
run(py('run_battles.py',PHASE,'play',4),'play-missing15')
run(py('run_battles.py',PHASE,'replay',4),'full-strict')
prefixProof=[]
for entry in stop['interruptedSlots']:
    old=HERE/entry['rawLog'];new=HERE/(PHASE+'-battles/slots')/entry['slot']/'actions.jsonl';common=0
    with old.open(encoding='utf-8') as a,new.open(encoding='utf-8') as b:
        for x,y in zip(a,b):
            x=json.loads(x);y=json.loads(y)
            for key in ['i','player','side','action','code','beforeHash','afterHash','legalHash','selected','rngBefore','rngAfter']:assert x.get(key)==y.get(key),(entry['slot'],common,key)
            common+=1
    assert common==min(entry['completeLines'],read(new.with_name('result.json'))['actions'])
    prefixProof.append(dict(slot=entry['slot'],commonActions=common,originalSha256=entry['sha256'],newSha256=sha(new)))
if not (REV/'interrupted-rerun-prefix-gate.json').exists():write(REV/'interrupted-rerun-prefix-gate.json',dict(passed=True,proofs=prefixProof))
run(py('summarize.py',PHASE),'complete-summary')
gate=read(HERE/f'{PHASE}-gate.json')
phase('R21恢复完整150槽已strict收尾：教师门禁'+('通过，待绑定全部前置证据' if gate['passed'] else '失败，继续定位时延与棋力；禁止专家采样'))
write(REV/'resume-exit.json',dict(passed=True,teacherQualified=gate['passed'],sourceGate=f'{PHASE}-gate.json',stoppedActualActions=actual))
print(json.dumps(gate,ensure_ascii=False),flush=True)
