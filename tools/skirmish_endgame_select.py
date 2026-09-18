"""仅依据开发回归选候选，独立种子结果不得用于反向选参。"""
import json
from pathlib import Path
from collections import defaultdict

root=Path('training_runs/endgame_20260918')
groups=defaultdict(list);variants={}
for stage in ['regression-policy','regression-trained']:
    manifest=json.loads((root/stage/'manifest.json').read_text(encoding='utf-8'))
    variants.update(manifest['variants'])
    for row in json.loads((root/stage/'results.json').read_text(encoding='utf-8')):groups[row['variant']].append(row)
rows=[]
for name,games in groups.items():
    normal=[g for g in games if g['plan']=='sd-normal'];end=[g for g in games if g['plan']!='sd-normal']
    assert len(normal)==8 and len(end)==12
    n=sum(g['naturalWin'] for g in normal);e=sum(g['naturalWin'] for g in end)
    t=sum(g['timeout'] for g in games);i=sum(g['illegalActionCount'] for g in games)
    protection=sum(g['stoppedByStagnation'] or g['stoppedByMaxSteps'] for g in games)
    rows.append(dict(variant=name,**variants[name],normalWins=n,endgameWins=e,timeouts=t,illegalActions=i,
                     passGate=n>=2 and e>=8 and t<=2 and i==0 and protection==0))
# 同分优先较少超时，再优先保留既有模型，避免无收益的模型替换。
eligible=[r for r in rows if r['variant']!='heuristic-control']
eligible.sort(key=lambda r:(r['passGate'],r['normalWins']+r['endgameWins'],r['endgameWins'],-r['timeouts'],r['variant'].startswith('v4-')),reverse=True)
chosen=eligible[0]
(root/'gate-results.json').write_text(json.dumps(rows,indent=2))
(root/'deployment-candidate.json').write_text(json.dumps(dict(chosen,selection='独立种子评估前冻结；未通过门槛时仅作诊断候选，不推荐替换默认 AI'),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(rows,indent=2));print('selected',chosen['variant'])
