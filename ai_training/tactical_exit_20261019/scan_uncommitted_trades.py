"""离线诊断已结束轨迹中的正净交换计划；不产生训练标签或通过收据。"""
from pathlib import Path
import gzip,json,sys
HERE=Path(__file__).resolve().parent;phase=sys.argv[1]
out=[]
for folder in sorted((HERE/(phase+'-battles')/'slots').glob('*teacher_search*')):
    log=folder/'actions.jsonl.gz'
    if not log.exists() or not (folder/'result.json').exists():continue
    count=0
    with gzip.open(log,'rt',encoding='utf-8') as f:
        for line in f:
            row=json.loads(line);s=row.get('search')
            if not s or s.get('planCommitted') or s.get('preferred')!=row['code']:continue
            for trace in s.get('traces',[]):
                if trace.get('action')!=row['action']:continue
                if trace.get('complete') and trace.get('actorLost') and not trace.get('commanderLethal') and trace.get('net',0)>0 and trace.get('plan'):
                    out.append(dict(slot=folder.name,macro=row['i'],beforeHash=row['beforeHash'],selected=row['code'],reason=s['reason'],trace=trace));count+=1
                    break
            if count>=2:break
    if len(out)>=12:break
target=HERE/(phase+'-uncommitted-trades.json')
target.write_text(json.dumps(dict(exploratory=True,passed=None,phase=phase,count=len(out),examples=out),ensure_ascii=False),encoding='utf-8')
print(json.dumps(dict(exploratory=True,count=len(out),file=target.name)))
