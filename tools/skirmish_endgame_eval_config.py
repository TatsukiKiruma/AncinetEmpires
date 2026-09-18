"""固定配对回归及独立种子矩阵；所有评估阶段统一使用 8 worker。"""
import json,sys
from pathlib import Path

root=Path('training_runs/endgame_20260918')
baseline='training_runs/pvp_navigation_20260918/fresh-v4-p0.json'
stage=sys.argv[1]
cases=json.loads((root/'baseline-config.json').read_text(encoding='utf-8'))['jobs']
if stage=='policy':
    variants={'heuristic-control':dict(model=baseline,policy='heuristic'),
              'v4-tactical-only':dict(model=baseline,policy='tactical-only'),
              'v4-memory':dict(model=baseline,policy='finish')}
elif stage=='trained':
    selected=json.loads((root/'selected.json').read_text(encoding='utf-8'))
    variants={'trained-raw':dict(model=selected['model'],policy='bc'),
              'trained-memory':dict(model=selected['model'],policy='finish')}
elif stage=='holdout-matrix':
    cases=[]
    for name in ['Duel','Crossed swords','Icy Paths','Mourningstar']:
        for seed in [9101821,9101822]:
            for seat in [0,1]:cases.append(dict(map=f'(2) {name}.aem',plan='sd-normal',seed=seed,seat=seat))
    for name in ['Icy Paths','Mourningstar']:
        for index,size in enumerate(['small','medium','large']):
            for seat in [0,1]:cases.append(dict(map=f'(2) {name}.aem',plan=f'sd-{size}-advantage-endgame',seed=9101821+index%2,seat=seat))
    for i,c in enumerate(cases):c.update(caseId=5000+i,referenceCaseId=None)
    (root/'holdout-matrix.json').write_text(json.dumps(cases,indent=2))
    print('独立种子矩阵已冻结：',len(cases));sys.exit()
elif stage=='holdout':
    chosen=json.loads((root/'deployment-candidate.json').read_text(encoding='utf-8'))
    variants={'v4-ai-only':dict(model=baseline,policy='bc'),chosen['variant']:dict(model=chosen['model'],policy=chosen['policy'])}
    cases=json.loads((root/'holdout-matrix.json').read_text(encoding='utf-8'))
else:raise ValueError(stage)
jobs=[dict(case,id=i*len(variants)+k,variant=name) for i,case in enumerate(cases) for k,name in enumerate(variants)]
name=f'regression-{stage}' if stage!='holdout' else stage
(root/f'{name}-config.json').write_text(json.dumps(dict(variants=variants,jobs=jobs),indent=2))
print(name,len(jobs))
