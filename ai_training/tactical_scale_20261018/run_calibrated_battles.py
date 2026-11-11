"""只依据开发门禁选择的校准候选，完整重跑30槽并验证最终配对60槽。"""
from pathlib import Path
import json,subprocess,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
for name in ['group-numeric-calibrated-initial.json','group-browser-calibrated-initial.json','group-numeric-best.json','group-browser-best.json']:assert read(HERE/name)['passed']
assert read(HERE/'CALIBRATION_PROMOTION.json')['trunkBitEqual'];assert read(HERE/'calibration-results.json')['best']['passed']
start=time.time()
for mode,lanes,filterName in [('play',8,'hierarchical'),('replay',4,None)]:
    procs=[]
    for i in range(lanes):
        out=(HERE/f'calibrated-{mode}-{i}.log').open('w',encoding='utf-8');args=['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_scale_20261018/battle.ts',mode,str(i),str(lanes)]
        if filterName:args.append(filterName)
        procs.append(subprocess.Popen(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
    codes=[p.wait() for p in procs];assert not any(codes),codes
for slot in read(HERE/'battle-plan.json')['slots']:
    r=read(HERE/'battles/slots'/slot['id']/'result.json');assert r['classification']!='error',slot['id']
with (HERE/'calibrated-summary.log').open('w',encoding='utf-8') as out:
    subprocess.run(['node',str(ROOT/'ai_training/run.mjs'),r'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe','-X','utf8','tactical_scale_20261018/summarize_hierarchical.py'],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,check=True)
(HERE/'final-battles-exit.json').write_text(json.dumps(dict(passed=True,seconds=time.time()-start,calibrated=True)),encoding='utf-8')
