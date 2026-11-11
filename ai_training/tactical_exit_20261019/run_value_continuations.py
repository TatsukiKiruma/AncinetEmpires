"""普通纯策略续弈仅收集自然结局Value监督；不调用或记作搜索专家。"""
from pathlib import Path
import json,hashlib,subprocess,sys,concurrent.futures,time
from numeric_receipt_valid import numeric_receipt_valid
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
protocol=read('value-continuation-protocol.json');assert not protocol['samplingUsesSearch'] and not protocol['policyTargetsCollected']
assert read('revisions/r19/candidate-scalars-exact.json')['allRecordsExact'] and read('revisions/r19/cache-full-witness-gate.json')['passed']
assert all(numeric_receipt_valid(HERE,n) for n in ['initial','teacher','proposal'])
assert sha(HERE/'teacher-model.json')==protocol['sourceModelSha256']
def run(lane,mode):
    log=HERE/f'value-continuation-{mode}-{lane}-{time.time_ns()}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(['node','ai_training/run.mjs','node','--import','tsx','tactical_exit_20261019/value_continuations.ts',mode,str(lane)],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,log
    print(mode,lane,'通过',flush=True)
for mode in ['play','replay']:
    (HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='40局纯策略自然结局Value续弈：'+mode+'；不采专家策略标签，搜索教师仍未合格'),ensure_ascii=False),encoding='utf-8')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda i:run(i,mode),range(4)))
results=[read(f'value-continuations/slots/{i}/result.json') for i in range(40)];replays=[read(f'value-continuations/slots/{i}/strict-replay.json') for i in range(40)]
assert all(s['passed'] and s['actions']==r['actions'] and r['sourceModelSha256']==protocol['sourceModelSha256'] and not r['searchUsed'] and not r['policyTargetsCollected'] for r,s in zip(results,replays))
assert all(r['classification']!='error' for r in results)
report=dict(passed=True,games=40,strictActions=sum(r['actions'] for r in results),samples=sum(r['samples'] for r in results),classifications={k:sum(r['classification']==k for r in results) for k in sorted({r['classification'] for r in results})},searchUsed=False,expertPolicySamples=0,protocolSha256=sha(HERE/'value-continuation-protocol.json'),modelSha256=protocol['sourceModelSha256'])
(HERE/'value-continuation-games-gate.json').write_text(json.dumps(report,ensure_ascii=False),encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
