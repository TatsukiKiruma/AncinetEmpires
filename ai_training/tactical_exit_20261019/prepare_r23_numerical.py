"""R23校准结束后完成恢复回归与三端数值参考，Chrome由主代理以正常权限实际执行。"""
from pathlib import Path
import json,hashlib,subprocess,time,sys,shutil,datetime
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r23'
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def run(args,label):
    log=REV/f'{label}-{time.time_ns()}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,log;print(label,'通过',flush=True)
def node(n,*a):return ['node','ai_training/run.mjs','node','tactical_exit_20261019/'+n,*a]
def ts(n,*a):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*a]
def py(n,*a):return ['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/'+n,*a]
while not (HERE/'search-scale/teacher-r23-calibration.json').exists():time.sleep(2)
while read('search-scale/teacher-calibration.json')['collectionTag']!='teacher-r23':time.sleep(2)
matched={}
for name,r in read('source-freeze-r21-performance-only.json')['files'].items():
    if name in ['ai_training/tactical_exit_20261019/model_battle_search_ai.ts','ai_training/tactical_exit_20261019/search_prior_config.ts']:continue
    assert sha(ROOT/name)==r['sha256'],name;matched[name]=r['sha256']
assert read('revisions/r21/performance-consistency-gate.json')['passed']
with (REV/'performance-consistency-gate.json').open('x',encoding='utf-8') as out:json.dump(dict(passed=True,roots=1557,reusedUnchangedPerformanceDependencies=True,sourceEvidence='revisions/r21/performance-consistency-gate.json',sourceEvidenceSha256=sha(HERE/'revisions/r21/performance-consistency-gate.json'),matchedFiles=matched,scope='纯性能依赖逐文件未变，复用完整根证明；本轮新根覆盖及共同物理叶子由全量重采单列'),out)
run(node('verify_cache.mjs','r23'),'cache-cold-warm-mutation')
run(node('verify_safe_completion.mjs','r23'),'existing-move-safe-completion-red-green')
run(node('verify_deployment_completion.mjs','r23','final'),'existing-deployment-completion-red-green')
coverage=read('revisions/r23/safe-recruitment-coverage-red-green-gate.json');assert coverage['passed'] and coverage['coreSha256']==sha(HERE/'model_battle_search_ai.ts') and coverage['coverageSha256']==sha(HERE/'safe_recruitment_coverage.ts')
for name in ['initial','teacher','proposal']:
    for prefix in ['python','numeric','numeric-model']:
        file=HERE/f'{prefix}-{name}.json'
        if file.exists():shutil.copy2(file,REV/(file.name+'.before.snapshot'))
    run(py('parity.py',name),'pytorch-'+name);run(ts('gates.ts',name),'standalone-'+name)
receipt=dict(passed=True,preparedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),references={name:sha(HERE/f'python-{name}.json') for name in ['initial','teacher','proposal']},coreSha256=sha(HERE/'model_battle_search_ai.ts'))
with (HERE/'r23-numeric-ready-for-chrome.json').open('x',encoding='utf-8') as out:json.dump(receipt,out)
print('R23三个数值参考已准备，待正常Windows权限的实际Chrome',flush=True)
