"""只读监测本阶段进程产物，不派发任务、不读取尚未解锁的封存输入。"""
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent
DATA=Path('D:/AncientEmpiresData/continuation_stage6_20261106_v1')
def read(file):return json.loads(file.read_text(encoding='utf-8-sig')) if file.exists() else None
result={'pipeline':read(HERE/'PIPELINE_PROGRESS.json')}
arena=read(HERE/'ARENA_PROGRESS.json')
if arena:
    result['arena']=arena
    root=DATA/('development-v1' if arena['split']=='dev' else 'sealed-v1')
    result['completedReceipts']=len(list(root.glob(f"{arena['split']}-{arena['id']}-*.receipt.json")))
    result['active']=[]
    for match in arena['active']:
        directory=root/f"{arena['split']}-{arena['id']}-{match}"
        summary=read(directory/'SUMMARY.json')
        heartbeat=read(directory/'HEARTBEAT.json')
        if summary:
            game=summary['games'][0]
            result['active'].append({k:game[k] for k in ('id','classification','steps','rounds','wallMs')})
        elif heartbeat:
            result['active'].append({k:heartbeat[k] for k in ('match','step','turn','phase')})
    stage=(result['pipeline'] or {}).get('stage','')
    log=HERE/((stage+'.log') if stage.startswith('development') else 'sealed-matches.log')
    if log.exists():result['latest']=log.read_text(encoding='utf-8-sig',errors='replace').splitlines()[-2:]
print(json.dumps(result,ensure_ascii=False))
