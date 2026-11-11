"""冻结四臂相同种子面板与额外开发根。"""
from train import *
import subprocess
assert read(HERE/'value-evaluation.json')['passed'],'价值分阶段门禁未通过，保留现场并先修复价值头'
assert read(HERE/'calibration-result.json')['passed'],'多类别校准门禁未通过，先修复收尾校准'
ROOT=HERE.parent.parent
for log,args in [('typecheck-final.log',['node',str(ROOT/'node_modules/typescript/bin/tsc'),'--noEmit','-p',str(HERE/'tsconfig.json')]),
    ('purity-final.log',['node',str(ROOT/'ai_training/run.mjs'),'node','tactical_value_search_20261018/purity_gate.mjs']),
    ('search-best.log',['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_value_search_20261018/search_gate.ts','best']),
    ('response-best.log',['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_value_search_20261018/response_regression.ts','best'])]:
    with (HERE/log).open('x',encoding='utf-8') as out:subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,check=True)
plan=read(OLD/'battle-plan.json');slots=[]
for old in plan['slots']:
    if old['model']!='hierarchical':continue
    for arm in ['hierarchical','pure','value_rerank','bounded']:
        slots.append(dict(old,model=arm,decoder=arm,id=f"{old['opponent']}-{arm}-m{old['mapIndex']}-s{old['seat']}"))
assert len(slots)==120
maps=plan['maps']
for j,root in enumerate(read(HERE/'expanded-roots.json')['roots']):
    index=len(maps);maps.append(dict(name='开发前缀-'+root['parent'],index=index,path=root['path'],sha256=root['sha256'],parent=root['parent'],prefix=root['prefix']))
    seats=sorted(player['id'] for player in read(root['path'])['players'])
    assert len(seats)==2
    for seatIndex,seat in enumerate(seats):
        for arm in ['hierarchical','pure','value_rerank','bounded']:
            slots.append(dict(model=arm,decoder=arm,opponent='heuristic',opponentSeed=2026101804+j*2+seatIndex,mapIndex=index,seat=seat,panel='expanded',id=f'expanded-{arm}-r{j}-s{seat}'))
save('battle-plan.json',dict(maps=maps,budgets=plan['budgets'],slots=slots,totalSlots=len(slots),independentEvaluation=False,arms=['hierarchical','pure','value_rerank','bounded']))
