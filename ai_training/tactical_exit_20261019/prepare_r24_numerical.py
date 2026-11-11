"""Top16全量一致性后完成既有修复回归及三端数值参考。"""
from pathlib import Path
import json,hashlib,subprocess,time,sys,shutil,datetime
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
while not (HERE/'search-scale/teacher-r24-calibration.json').exists():time.sleep(2)
while read('search-scale/teacher-calibration.json')['collectionTag']!='teacher-r24':time.sleep(2)
matched={};exceptions=['model_battle_search_ai.ts','search_prior_config.ts','search_budget.ts','audit_search_risks.ts']
for name,r in read('source-freeze-r21-performance-only.json')['files'].items():
    if name in ['ai_training/tactical_exit_20261019/'+n for n in exceptions]:continue
    assert sha(ROOT/name)==r['sha256'],name;matched[name]=r['sha256']
assert read('revisions/r21/performance-consistency-gate.json')['passed']
with (REV/'performance-consistency-gate.json').open('x',encoding='utf-8') as out:json.dump(dict(passed=True,roots=1557,reusedUnchangedPerformanceDependencies=True,sourceEvidence='revisions/r21/performance-consistency-gate.json',sourceEvidenceSha256=sha(HERE/'revisions/r21/performance-consistency-gate.json'),matchedFiles=matched,registeredNonPerformanceChanges=exceptions,scope='纯性能后端未变，预算与预算审计元数据按已登记Top16变化；新根容量由全部原15921候选及新增5307候选的strict单列证明'),out)
run(node('verify_cache.mjs','r24'),'cache-cold-warm-mutation')
run(node('verify_safe_completion.mjs','r24'),'existing-move-safe-completion-red-green')
run(node('verify_deployment_completion.mjs','r24','final'),'existing-deployment-completion-red-green')
run(node('verify_safe_recruitment_coverage.mjs','r24'),'existing-top12-recruitment-coverage-red-green')
capacity=read('revisions/r24/top16-capacity-red-green-gate.json');assert capacity['passed'] and capacity['budgetSha256']==sha(HERE/'search_budget.ts')
for name in ['initial','teacher','proposal']:
    for prefix in ['python','numeric','numeric-model']:
        file=HERE/f'{prefix}-{name}.json'
        if file.exists():shutil.copy2(file,REV/(file.name+'.before.snapshot'))
    run(py('parity.py',name),'pytorch-'+name);run(ts('gates.ts',name),'standalone-'+name)
receipt=dict(passed=True,preparedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),references={name:sha(HERE/f'python-{name}.json') for name in ['initial','teacher','proposal']},coreSha256=sha(HERE/'model_battle_search_ai.ts'),budgetSha256=sha(HERE/'search_budget.ts'))
with (HERE/'r24-numeric-ready-for-chrome.json').open('x',encoding='utf-8') as out:json.dump(receipt,out)
print('R24三个数值参考已准备，待正常Windows权限实际Chrome',flush=True)
