"""在线专家对战及其完整strict重放；每局拥有独立输出目录。"""
from pathlib import Path
import subprocess,sys,json,time
from device_protocol import reject_pc_games
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
mode=sys.argv[1] if len(sys.argv)>1 else 'play';count=int(sys.argv[2]) if len(sys.argv)>2 else 2;attempt=str(int(time.time()));procs=[]
if mode=='play':reject_pc_games()
count=json.loads((HERE/'execution-protocol.json').read_text(encoding='utf-8'))['expertWorkers']
for i in range(count):
    out=(HERE/f'expert-{mode}-{i}-{attempt}.log').open('x',encoding='utf-8')
    procs.append(subprocess.Popen(['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_exit_20261019/expert.ts',mode,str(i),str(count)],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
codes=[p.wait() for p in procs];(HERE/f'expert-{mode}-exit.json').write_text(json.dumps(dict(passed=not any(codes),codes=codes,concurrency=count)),encoding='utf-8');sys.exit(int(any(codes)))
