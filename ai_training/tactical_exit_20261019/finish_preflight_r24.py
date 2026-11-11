"""核验三个实际新Chrome收据和Top16身份后执行全部前置门禁。"""
from pathlib import Path
import json,hashlib,subprocess,time,sys,shutil
from numeric_receipt_valid import numeric_receipt_valid
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r24'
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def run(args,label):
    log=REV/f'{label}-{time.time_ns()}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,log;print(label,'通过',flush=True)
def node(n,*a):return ['node','ai_training/run.mjs','node','tactical_exit_20261019/'+n,*a]
def ts(n,*a):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*a]
def py(n,*a):return ['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/'+n,*a]
prepared=read('r24-numeric-ready-for-chrome.json');assert prepared['passed'] and prepared['budgetSha256']==sha(HERE/'search_budget.ts');receipts={}
for name in ['initial','teacher','proposal']:
    assert numeric_receipt_valid(HERE,name),name
    r=read('browser-'+name+'.json');assert r['executedAt']>=prepared['preparedAt'] and r['fileSha256'][f'python-{name}.json']==prepared['references'][name]
    receipts[name]=dict(sha256=sha(HERE/('browser-'+name+'.json')),executedAt=r['executedAt'])
with (REV/'fresh-three-model-chrome-gate.json').open('x',encoding='utf-8') as out:json.dump(dict(passed=True,allThreeActualNewChrome=True,receipts=receipts),out)
run(ts('proposal_reuse_regression.ts'),'proposal-shared-root-encoding')
shutil.copy2(HERE/'search-capacity-speed-gate.json',REV/'capacity-speed-before-calibrated-recheck.snapshot')
run(ts('search_capacity_speed.ts'),'calibrated-root-capacity-speed');run(ts('speed.ts','teacher-r24'),'state-value-speed')
run(py('validate_guard_revision.py','r24','r23'),'all-guards-engine-public-checks')
run(node('prepare_revision.mjs','r24','r23'),'publish-ready')
print('R24全部前置通过，仍须完整150槽资格；专家0',flush=True)
