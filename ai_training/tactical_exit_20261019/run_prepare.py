"""父局分片独占写入的进程并行预处理，失败保留所有现场。"""
from pathlib import Path
import subprocess,sys,json,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
count=int(sys.argv[1]) if len(sys.argv)>1 else 8
attempt=str(int(time.time()));flags=getattr(subprocess,'CREATE_NO_WINDOW',0)
procs=[]
selection=json.loads((HERE/'selection.json').read_text(encoding='utf-8'))['parents'];loads=[0.]*count;assignment={}
def cost(p):
    if (HERE/f"data/{p['parentId']}.receipt.json").exists():return 0
    cached=(HERE.parent/f"tactical_value_search_20261018/data/{p['parentId']}.receipt.json").exists()
    return sum(e.get('admittedAtoms',0) for e in p['segments'])*(.02 if cached else 1.)
for p in sorted(selection,key=cost,reverse=True):
    lane=min(range(count),key=lambda i:loads[i]);assignment[p['parentId']]=lane;loads[lane]+=cost(p)
assignmentName=f'prepare-assignment-{attempt}.json'
(HERE/assignmentName).write_text(json.dumps(dict(parentLane=assignment,estimatedLoads=loads)),encoding='utf-8')
for i in range(count):
    out=(HERE/f'prepare-{i}-{attempt}.log').open('x',encoding='utf-8')
    procs.append(subprocess.Popen(['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_exit_20261019/prepare.ts',str(i),str(count),'0','900',assignmentName],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=flags))
out=(HERE/f'pack-{attempt}.log').open('x',encoding='utf-8')
packer=subprocess.Popen([sys.executable,'-X','utf8',str(HERE/'pack.py')],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=flags)
(HERE/f'prepare-processes-{attempt}.json').write_text(json.dumps(dict(workers=[p.pid for p in procs],packer=packer.pid)),encoding='utf-8')
codes=[p.wait() for p in procs]
if any(codes):packer.terminate()
else:codes.append(packer.wait())
(HERE/'prepare-exit.json').write_text(json.dumps(dict(passed=not any(codes),codes=codes)),encoding='utf-8')
sys.exit(int(any(codes)))
