"""多进程预处理，进程只写各自父局分片。"""
from pathlib import Path
import subprocess,sys,json,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
attempt=str(int(time.time()));assignment=sys.argv[1] if len(sys.argv)>1 else 'worker-assignment-balanced.json'
flags=getattr(subprocess,'CREATE_NO_WINDOW',0)
procs=[]
for i in range(10):
    out=(HERE/f'prepare-{i}-{attempt}.log').open('x',encoding='utf-8')
    procs.append(subprocess.Popen(['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_value_search_20261018/prepare.ts',str(i),'10','0','600',assignment],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=flags))
out=(HERE/f'pack-{attempt}.log').open('x',encoding='utf-8')
packer=subprocess.Popen([sys.executable,'-X','utf8',str(HERE/'pack.py')],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=flags)
(HERE/f'processes-{attempt}.json').write_text(json.dumps(dict(workers=[p.pid for p in procs],packer=packer.pid)),encoding='utf-8')
codes=[p.wait() for p in procs]
if any(codes):packer.terminate()
else:codes.append(packer.wait())
(HERE/'prepare-exit.json').write_text(json.dumps(dict(passed=not any(codes),codes=codes)),encoding='utf-8')
sys.exit(int(any(codes)))
