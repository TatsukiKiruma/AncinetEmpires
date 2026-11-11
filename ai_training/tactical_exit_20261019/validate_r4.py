"""新版本资格评测前固定公共规则等价、特征、回归与源码证据。"""
from pathlib import Path
import json,hashlib,subprocess,sys,time,shutil,re
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;revision=sys.argv[1] if len(sys.argv)>1 else 'r4';previous=sys.argv[2] if len(sys.argv)>2 else 'r3';REV=HERE/'revisions'/revision;REV.mkdir(parents=True,exist_ok=True)
def read(n):return json.loads((HERE/n).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(args,label):
    p=REV/f'{label}-{int(time.time())}.log'
    with p.open('x',encoding='utf-8') as f:r=subprocess.run(args,cwd=ROOT,stdout=f,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,p.name
    print(label,'通过',flush=True)
def ts(n,*args):return ['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/'+n,*args]
def node(n,*args):return ['node','ai_training/run.mjs','node','tactical_exit_20261019/'+n,*args]
for n in ['trajectory-gate.json','feature-audit.json','movement-gate.json','damage-gate.json','regression-gate.json','guard-regression-gate.json','standalone-value-parity.json','purity-gate.json','browser-initial.json','browser-teacher.json','numeric-initial.json','numeric-teacher.json']:
    p=HERE/n;q=REV/('before-'+n)
    if p.exists() and not q.exists():shutil.copy2(p,q)
for script in ['trajectory_gate.ts','audit_features.ts','movement_gate.ts','damage_gate.ts','regressions.ts','guard_regressions.ts','standalone_value_parity.ts']:
    run(ts(script),script)
    # 每项生成的活动收据同时保留为本次版本证据。
run(ts('critical_event_regression.ts'),'critical-event')
if revision!='r4':run(ts('causal_veto_regression.ts'),'causal-veto')
for n in ['trajectory-gate.json','feature-audit.json','movement-gate.json','damage-gate.json','regression-gate.json','guard-regression-gate.json','standalone-value-parity.json']:shutil.copy2(HERE/n,REV/n)
run(node('purity_gate.mjs'),'purity')
for name in ['initial','teacher']:run(ts('gates.ts',name),'numeric-'+name);shutil.copy2(HERE/f'numeric-{name}.json',REV/f'numeric-{name}.json')
run([sys.executable,'-X','utf8',str(HERE/'run_checks.py')],'checks')
assert all(r['passed'] for r in read('checks.json') if r['name'] in ['public-lint','public-test','public-build','stage5-typecheck'])
shutil.copy2(HERE/'checks.json',REV/'checks.json')
current=(HERE/'model_battle_search_ai.ts').read_text(encoding='utf-8');old=(HERE/'revisions'/previous/'model_battle_search_ai.ts.snapshot').read_text(encoding='utf-8')
pattern=r'this\.options=\{[^\n]+\};';assert re.search(pattern,current).group()==re.search(pattern,old).group()
assert sha(HERE/'leaf.ts')==read(f'source-freeze-teacher-{previous}.json')['files']['ai_training/tactical_exit_20261019/leaf.ts']['sha256']
result=dict(passed=True,coreSha256=sha(HERE/'model_battle_search_ai.ts'),typecheckPassed=True,publicChecksPassed=True,trajectoryPassed=True,featureParityPassed=True,numericCoefficientsAndBudgetUnchanged=True,teacherModelSha256=sha(HERE/'teacher-model.json'),criticalGate=read('performance_query_cache/critical-red-green-gate.json'),performanceOnlyChanges=read('performance_query_cache/applied-r4.json'),recruitReaders=read('performance_query_cache/cost-readers-gate.json'),speculativeSingleThreatEnabled=False)
if revision!='r4':
    result.update(causalGate=read('causal-red-green-gate.json'),legalActionClone=read('performance_legal_clone/applied.json'),readonlyEngineEnabled=False)
    assert result['causalGate']['passed'] and result['causalGate']['currentSha256']==result['coreSha256']
(HERE/f'{revision}-pre-browser-ready.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
print(f'等待真实Chrome数值复核后发布{revision}-ready',flush=True)
