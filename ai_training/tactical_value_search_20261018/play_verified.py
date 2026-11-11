"""同样八个实战进程共享剩余槽队列；不改变任何模型、种子或局内代码。"""
from pathlib import Path
import concurrent.futures,subprocess,sys,json,hashlib,threading,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
frozen=read(HERE/'battle-verified-source-freeze.json')
def verify():
    for name,digest in frozen.items():assert sha((HERE/name).resolve())==digest,name
verify();plan=read(HERE/'battle-verified-plan.json');pending=[(i,s) for i,s in enumerate(plan['slots']) if not (HERE/'battles/slots'/s['id']/'result.json').exists()]
logs=HERE/'battles/verified-logs';logs.mkdir(exist_ok=True);lock=threading.Lock();active={};completed=len(plan['slots'])-len(pending);failures=[];started=time.time()
def update():
    (HERE/'battle-verified.live.json').write_text(json.dumps(dict(completed=completed,total=len(plan['slots']),active=active,failures=failures,seconds=time.time()-started)),encoding='utf-8')
def run(item):
    global completed
    index,slot=item;ident=slot['id']
    with lock:active[ident]=dict(index=index);update()
    args=['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_value_search_20261018/battle_verified.ts','play',str(index),str(len(plan['slots']))]
    with (logs/(ident+'.log')).open('x',encoding='utf-8') as output:
        code=subprocess.run(args,cwd=ROOT,stdout=output,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)).returncode
    with lock:
        active.pop(ident);completed+=1
        if code or not (HERE/'battles/slots'/ident/'result.json').exists():failures.append(dict(id=ident,exitCode=code))
        update()
    return code
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:codes=list(executor.map(run,pending))
verify();assert not failures and not any(codes),failures
(HERE/'verified-play-exit.json').write_text(json.dumps(dict(passed=True,totalSlots=len(plan['slots']),retained=len(plan['slots'])-len(pending),rerun=0,maxConcurrentGames=8)),encoding='utf-8')
print(json.dumps(dict(passed=True,completed=completed)),flush=True)
