"""四路完整根一致性证明；冻结版本复核不修改当前安全完结实现。"""
from pathlib import Path
import subprocess,concurrent.futures,time,json,hashlib
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
def run(i):
    p=HERE/f'revisions/r21/performance-proof-{i}-{time.time_ns()}.log'
    with p.open('x',encoding='utf-8') as out:r=subprocess.run(['node','ai_training/run.mjs','node','tactical_exit_20261019/verify_frozen_performance.mjs',str(i)],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,p
    print('性能完整根复核',i,'通过',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(run,range(4)))
rows=[json.loads((HERE/f'revisions/r21/performance-proof-{i}.json').read_text()) for i in range(4)]
assert all(r['passed'] and r['allRootDecisionsAndTracesExact'] and r['allWitnessesReplayed'] for r in rows)
report=dict(passed=True,roots=sum(r['roots'] for r in rows),candidates=sum(r['candidates'] for r in rows),witnessActions=sum(r['witnessActions'] for r in rows),laneFiles=[f'performance-proof-{i}.json' for i in range(4)],scope='完整冻结性能分支证明；安全完结造成的物理叶子变更另行核验')
assert report['roots']==1557
(HERE/'revisions/r21/performance-consistency-gate.json').write_text(json.dumps(report,ensure_ascii=False),encoding='utf-8');print(report,flush=True)
