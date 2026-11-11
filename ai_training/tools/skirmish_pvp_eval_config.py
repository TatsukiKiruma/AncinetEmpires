"""生成固定的 8 worker 实战评估清单；选参完成后冻结模型。"""
import json
from pathlib import Path

root = Path('training_runs/pvp_navigation_20260918')
selection = json.loads((root/'selected.json').read_text(encoding='utf-8'))['selected']
variants = {
    'original': {'model':'training_runs/models/sd-bc-v3-20260918-011742.json','policy':'bc'},
    'ai-only': {'model':str(root/'fresh-v3-p0.json'),'policy':'bc'},
    'human-v3': {'model':str(root/f"{selection['v3']}.json"),'policy':'bc'},
    'human-v4': {'model':str(root/f"{selection['v4']}.json"),'policy':'bc'},
}
cases = []
for m in ['(2) Duel.aem','(2) Crossed swords.aem']:
    for seed in [9101811,9101812]:
        for seat in [0,1]:
            cases.append(dict(map=m,plan='sd-normal',seed=seed,seat=seat))
for mi,m in enumerate(['(2) Swamplands.aem','(2) The Crossing.aem']):
    for pi,profile in enumerate(['small','medium','large']):
        for seat in [0,1]:
            cases.append(dict(map=m,plan=f'sd-{profile}-advantage-endgame',seed=9101811+(mi+pi)%2,seat=seat))
jobs=[]
for i,case in enumerate(cases):
    for variant in variants:
        jobs.append(dict(case,id=len(jobs),caseId=i,referenceCaseId=None,variant=variant))
(root/'eval-config.json').write_text(json.dumps(dict(variants=variants,jobs=jobs),indent=2),encoding='utf-8')
print(f'{len(cases)} 个配对场景 × {len(variants)} 个模型 = {len(jobs)} 场，8 worker')
