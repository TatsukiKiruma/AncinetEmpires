"""等待原200槽封存后追加50槽；不替换原已完成结果。"""
from pathlib import Path
import subprocess,sys,json,time,traceback
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(n,x):(HERE/n).write_text(json.dumps(x,ensure_ascii=False),encoding='utf-8')
def py(name,*extra):return ['node',str(ROOT/'ai_training/run.mjs'),sys.executable,'-X','utf8','tactical_value_search_20261018/'+name,*extra]
def ts(name,*extra):return ['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_value_search_20261018/'+name,*extra]
def run(command,name):
    with (HERE/name).open('x',encoding='utf-8') as output:subprocess.run(command,cwd=ROOT,stdout=output,stderr=subprocess.STDOUT,check=True)
try:
    save('verified-pipeline.live.json',dict(phase='等待原200槽及strict审计完成',complete=False))
    while not (HERE/'pipeline-exit.json').exists():time.sleep(2)
    original=read(HERE/'pipeline-exit.json');assert original['passed'],original
    for source,target in [('pipeline-exit.json','pipeline-exit-original200.json'),('battle-summary.json','battle-summary-original200.json'),('BATTLES.md','BATTLES_ORIGINAL200.md')]:
        destination=HERE/target;assert not destination.exists();destination.write_bytes((HERE/source).read_bytes())
    save('pipeline-exit.json',dict(passed=False,status='running_verified_extension',original200Passed=True))
    save('TASK_STATE.json',dict(status='running',phase='事件守卫修订50槽配对实战',complete=False))
    save('verified-pipeline.live.json',dict(phase='追加50槽实战',complete=False));run(py('play_verified.py'),'verified-play.log')
    processes=[];save('verified-pipeline.live.json',dict(phase='修订50槽strict重放',complete=False))
    for lane in range(6):
        output=(HERE/f'verified-replay-{lane}.log').open('x',encoding='utf-8');processes.append(subprocess.Popen(ts('battle_verified.ts','replay',str(lane),'6'),cwd=ROOT,stdout=output,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
    codes=[p.wait() for p in processes];assert not any(codes),codes
    run(py('summarize.py','all'),'summarize-all.log')
    save('verified-pipeline-exit.json',dict(passed=True,slots=50));save('pipeline-exit.json',dict(passed=True,originalSlots=200,additionalSlots=50,totalSlots=250));save('verified-pipeline.live.json',dict(phase='全部250槽完成',complete=True))
except BaseException as error:
    save('verified-pipeline-exit.json',dict(passed=False,error=str(error),traceback=traceback.format_exc()));raise
