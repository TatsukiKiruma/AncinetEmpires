"""只读小型逐槽收据，避免计时期间扫描轨迹或运行推理。"""
from pathlib import Path
import json,sys,collections,math
HERE=Path(__file__).resolve().parent
name=sys.argv[1] if len(sys.argv)>1 else 'teacher-r11'
folder=HERE/(name+'-battles' if name.startswith('teacher') else 'battles')/'slots'
panels={};active=[];completed=0;opponents={};times={}
for p in sorted(folder.glob('*')):
    result=p/'result.json';started=p/'started.json'
    if not started.exists():continue
    s=json.loads(started.read_text())['slot']
    if not result.exists():
        live=p/'live.json'
        progress=json.loads(live.read_text()) if live.exists() else {}
        active.append(dict(id=s['id'],live={k:progress[k] for k in ['actions','turn','seconds'] if k in progress}));continue
    r=json.loads(result.read_text());completed+=1
    key=s.get('panel','fixed')+'/'+s['model']
    table=panels.setdefault(key,collections.Counter());table[r['classification']]+=1
    table['slots']+=1
    times.setdefault(key,[]).extend(r.get('latencySamples',{}).get('model',[]))
    subgroup=opponents.setdefault(key+'/'+s['opponent'],collections.Counter());subgroup[r['classification']]+=1;subgroup['slots']+=1
latency={k:dict(count=len(v),p95=sorted(v)[math.ceil(.95*len(v))-1]) for k,v in times.items() if v}
fixed=panels.get('fixed/teacher_search',{});maxWins=30-fixed.get('slots',0)+fixed.get('natural_win',0)
print(json.dumps(dict(completed=completed,active=active,panels=panels,opponents=opponents,latency=latency,fixedSearchMaximumPossibleWins=maxWins),ensure_ascii=False))
