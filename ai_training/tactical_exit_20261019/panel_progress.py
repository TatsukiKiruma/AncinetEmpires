"""只读展示已结束槽位；部分结果不作为完整门禁结论。"""
from pathlib import Path
import json,collections,sys,datetime
HERE=Path(__file__).resolve().parent;phase=sys.argv[1] if len(sys.argv)>1 else 'teacher-r21';base=HERE/(phase+'-battles' if phase.startswith('teacher') else 'battles')/'slots'
rows=[];groups=collections.defaultdict(collections.Counter);strict=0
for file in base.glob('*/result.json'):
    r=json.loads(file.read_text());rows.append(r);s=r['slot'];key=f'{s.get("panel","fixed")}/{s["model"]}';groups[key][r['classification']]+=1
    if (file.parent/'strict-replay.json').exists():strict+=1
live=[]
for file in sorted(base.glob('*/live.json'),key=lambda p:p.stat().st_mtime,reverse=True)[:4]:
    if not (file.parent/'result.json').exists():
        r=json.loads(file.read_text());live.append(dict(slot=file.parent.name,actions=r.get('actions'),turn=r.get('turn'),seconds=r.get('seconds')))
print(json.dumps(dict(now=datetime.datetime.now().isoformat(timespec='seconds'),phase=phase,completed=len(rows),strictSlots=strict,actions=sum(r['actions'] for r in rows),groups={k:dict(v) for k,v in sorted(groups.items())},live=live,scope='部分观察；不判定完整门禁'),ensure_ascii=False))
