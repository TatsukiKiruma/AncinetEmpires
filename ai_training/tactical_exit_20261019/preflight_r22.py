"""R22全部安全、源码、数值及公共前置门禁；没有实战资格时禁止专家。"""
from pathlib import Path
import json,hashlib,subprocess,time,sys,shutil
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
while not (HERE/'search-scale/teacher-r22-calibration.json').exists():time.sleep(2)
while read('search-scale/teacher-calibration.json')['collectionTag']!='teacher-r22':time.sleep(2)
matched={}
for name,r in read('source-freeze-r21-performance-only.json')['files'].items():
    if name in ['ai_training/tactical_exit_20261019/model_battle_search_ai.ts','ai_training/tactical_exit_20261019/search_prior_config.ts']:continue
    assert sha(ROOT/name)==r['sha256'],name;matched[name]=r['sha256']
proof=read('revisions/r21/performance-consistency-gate.json');assert proof['passed'] and proof['roots']==1557
with (REV/'performance-consistency-gate.json').open('x',encoding='utf-8') as out:json.dump(dict(passed=True,roots=1557,reusedUnchangedPerformanceDependencies=True,sourceEvidence='revisions/r21/performance-consistency-gate.json',sourceEvidenceSha256=sha(HERE/'revisions/r21/performance-consistency-gate.json'),matchedFiles=matched,scope='R21纯性能依赖逐文件未变，复用其1557根完整证明；本轮部署物理叶子变化由新重采单列'),out)
run(node('verify_cache.mjs','r22'),'cache-cold-warm-mutation')
run(node('verify_safe_completion.mjs','r22'),'existing-move-safe-completion-red-green')
run(node('verify_deployment_completion.mjs','r22','final'),'deployment-safe-completion-red-green')
for name in ['initial','teacher','proposal']:
    for prefix in ['python','numeric','numeric-model']:
        file=HERE/f'{prefix}-{name}.json'
        if file.exists():shutil.copy2(file,REV/(file.name+'.before.snapshot'))
    run(py('parity.py',name),'pytorch-'+name);run(ts('gates.ts',name),'standalone-'+name);run(node('browser_runner.mjs',name,'r22'),'actual-chrome-'+name)
run(ts('proposal_reuse_regression.ts'),'proposal-shared-root-encoding')
for n in ['search-capacity-speed-gate.json','teacher-r22-speed.json']:
    if (HERE/n).exists():shutil.copy2(HERE/n,REV/(n+'.before.snapshot'))
run(ts('search_capacity_speed.ts'),'root-capacity-speed');run(ts('speed.ts','teacher-r22'),'state-value-speed')
run(py('validate_guard_revision.py','r22','r21'),'all-guards-engine-public-checks')
run(node('prepare_revision.mjs','r22','r21'),'publish-ready')
print('R22前置通过，仍须完整150槽资格；专家0',flush=True)
