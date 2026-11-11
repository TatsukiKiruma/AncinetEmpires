"""保留受限Chrome失败后，核验正常权限真实Chrome收据并继续未执行门禁。"""
from pathlib import Path
import json,hashlib,subprocess,time,sys,shutil
from numeric_receipt_valid import numeric_receipt_valid
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r22'
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def run(args,label):
    log=REV/f'{label}-{time.time_ns()}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,log;print(label,'通过',flush=True)
def node(n,*a):return ['node','ai_training/run.mjs','node','tactical_exit_20261019/'+n,*a]
def ts(n,*a):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*a]
def py(n,*a):return ['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/'+n,*a]
receipts={}
for name in ['initial','teacher','proposal']:
    assert numeric_receipt_valid(HERE,name),name
    r=read('browser-'+name+'.json');assert r['passed'] and r['executedAt']>'2026-10-19T15:14:40Z'
    receipts[name]=dict(sha256=sha(HERE/('browser-'+name+'.json')),executedAt=r['executedAt'],maxForwardError=r['maxForwardError'],maxGradientError=r['maxGradientError'],argmax=r['argmax'])
with (REV/'browser-retry-gate.json').open('x',encoding='utf-8') as out:json.dump(dict(passed=True,failedAttempt='revisions/r22/actual-chrome-initial-1792422676533036500.log',failure='受限Windows环境crashpad无法启动，未返回数值校验',retry='正常Windows进程权限真实Chrome155，三个模型全部重新实际执行',receipts=receipts),out,ensure_ascii=False)
old=read('source-freeze-teacher-r21.json')['files']['ai_training/tactical_exit_20261019/model_battle_search_ai.ts'];target=HERE/'revisions/r21/model_battle_search_ai.ts.snapshot';source=HERE/old['snapshot'];assert sha(source)==old['sha256']
if not target.exists():shutil.copy2(source,target)
assert sha(target)==old['sha256']
run(ts('proposal_reuse_regression.ts'),'proposal-shared-root-encoding')
for n in ['search-capacity-speed-gate.json','teacher-r22-speed.json']:
    if (HERE/n).exists() and not (REV/(n+'.before.snapshot')).exists():shutil.copy2(HERE/n,REV/(n+'.before.snapshot'))
run(ts('search_capacity_speed.ts'),'root-capacity-speed');run(ts('speed.ts','teacher-r22'),'state-value-speed')
run(py('validate_guard_revision.py','r22','r21'),'all-guards-engine-public-checks')
run(node('prepare_revision.mjs','r22','r21'),'publish-ready')
print('R22全部前置通过，仍须完整150槽资格；专家0',flush=True)
