"""最佳权重三端门禁完成后，执行同面板30槽并严格重放。"""
from pathlib import Path
import json,time,subprocess
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
while not (HERE/'remaining-exit.json').exists():time.sleep(.5)
assert read(HERE/'remaining-exit.json')['passed'];assert read(HERE/'group-numeric-best.json')['passed']
with (HERE/'group-browser-best.log').open('w',encoding='utf-8') as out:
    subprocess.run(['node',str(ROOT/'ai_training/run.mjs'),'node','tactical_scale_20261018/browser_runner.mjs','best'],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,check=True)
assert read(HERE/'group-browser-best.json')['passed']
plan=read(HERE/'battle-plan.json');assert len(plan['slots'])==30
(HERE/'battle-plan-speed.json').write_bytes((HERE/'battle-plan.json').read_bytes())
extra=[dict(slot,model='hierarchical',decoder='hierarchical',id=f"{slot['opponent']}-hierarchical-hierarchical-m{slot['mapIndex']}-s{slot['seat']}") for slot in plan['slots']]
plan['slots']+=extra;plan['totalSlots']=60;(HERE/'battle-plan.json').write_text(json.dumps(plan),encoding='utf-8')
start=time.time()
def run(mode,lanes):
    processes=[]
    for i in range(lanes):
        out=(HERE/f'hierarchical-{mode}-{i}.log').open('w',encoding='utf-8')
        processes.append(subprocess.Popen(['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_scale_20261018/battle.ts',mode,str(i),str(lanes),'hierarchical'],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
    codes=[p.wait() for p in processes];assert not any(codes),codes
run('play',8);run('replay',4)
for slot in extra:
    result=read(HERE/'battles/slots'/slot['id']/'result.json');assert result['classification']!='error',slot['id']
with (HERE/'hierarchical-summary.log').open('w',encoding='utf-8') as out:
    subprocess.run(['node',str(ROOT/'ai_training/run.mjs'),r'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe','-X','utf8','tactical_scale_20261018/summarize_hierarchical.py'],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,check=True)
(HERE/'final-battles-exit.json').write_text(json.dumps(dict(passed=True,seconds=time.time()-start)),encoding='utf-8')
