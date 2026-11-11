"""冻结相同50槽面板并复用完整计时和strict重放工具。"""
from pathlib import Path
import json
HERE=Path(__file__).resolve().parent;OLD=HERE.parent/'tactical_value_search_20261018'
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
plan=read(OLD/'battle-plan.json');base=[s for s in plan['slots'] if s['model']=='hierarchical']
assert len(base)==50
maps=plan['maps']
for m in maps:
    p=Path(m['path']);m['path']=str(p if p.is_absolute() else (OLD/p).resolve())
def write_plan(name,arms):
    slots=[]
    for s in base:
        for arm in arms:
            v=dict(s,model=arm,decoder=arm);v['id']=s['id'].replace('hierarchical',arm);slots.append(v)
    target=HERE/name
    assert not target.exists()
    target.write_text(json.dumps(dict(maps=maps,budgets=plan['budgets'],slots=slots,arms=arms,independentEvaluation=False),ensure_ascii=False),encoding='utf-8')
write_plan('teacher-battle-plan.json',['hierarchical','pure','teacher_search'])
write_plan('final-battle-plan.json',['hierarchical','pure','stage5_pure','stage5_search'])
source=(OLD/'battle.ts').read_text(encoding='utf-8')
source=source.replace("from './features'","from '../tactical_value_search_20261018/features'")
source=source.replace("read('battle-plan.json')","read(process.env.STAGE5_BATTLE_PLAN??'final-battle-plan.json')")
source=source.replace("const name=slot.model==='hierarchical'?'../tactical_scale_20261018/group-best.json':'model-final.json';","const name=slot.model==='hierarchical'?'../tactical_scale_20261018/group-best.json':slot.model==='pure'?'../tactical_value_search_20261018/model-final.json':slot.model==='teacher_search'?'teacher-model.json':'model-final.json';")
source=source.replace("`battles/slots/${slot.id}`","`${process.env.STAGE5_BATTLE_OUTPUT??'battles'}/slots/${slot.id}`")
source=source.replace("slot.model==='bounded'","slot.model.endsWith('_search')")
source=source.replace("Math.max(0,2400-counter.searchNodes)","Number.MAX_SAFE_INTEGER")
assert not (HERE/'battle.ts').exists()
(HERE/'battle.ts').write_text(source,encoding='utf-8')
print('已冻结150槽教师门禁和200槽最终验收面板')
