"""同一60父局开发材料比较，保留整数分母，不宣称独立泛化。"""
from group_train import HERE,OLD,read,save,Policy,evaluate,base
import time
import hashlib
contract=read(HERE/'scale-contract.json');dev=[f for f in contract['files'] if f['split']=='validation']
model=read(HERE/'group-best.json');start=time.perf_counter();current=evaluate(Policy(model['schema'],model['weights']),dev,model['schema'])
old=read(OLD/'model-best.json');cached=read(HERE/'stage2-scale-dev.json') if (HERE/'stage2-scale-dev.json').exists() else None
if cached:
    assert cached['modelSha256']==hashlib.sha256((OLD/'model-best.json').read_bytes()).hexdigest()
    assert cached['contractSha256']==hashlib.sha256((HERE/'scale-contract.json').read_bytes()).hexdigest()
prior=cached['full'] if cached else base.evaluate(base.Policy(old['schema'],old['weights']),dev,old['schema'])
old16=read(OLD/'contract.json');ids={f['parent'] for f in old16['files'] if f['split']=='validation'};subset=[f for f in dev if f['parent'] in ids]
subsetNew=evaluate(Policy(model['schema'],model['weights']),subset,model['schema'])
subsetOld=cached['original16'] if cached else base.evaluate(base.Policy(old['schema'],old['weights']),subset,old['schema'])
save('scale-comparison.json',dict(scope='240/60既有开发分区，非独立评测；数据规模、架构及目标同时变化，不能单因素归因',parents=len(dev),hierarchical=current,stage2=prior,original16=dict(hierarchical=subsetNew,stage2=subsetOld),seconds=time.perf_counter()-start))
keys=['top1','groupTop1','within_move','within_recruit','attack_opportunity_rate','danger_avoidance','waitWithOpportunity']
lines=['# 同一开发集比较','','新模型报告组CE＋组内条件CE（分层联合NLL），阶段2报告全候选softmax的原子NLL；两者均按原宏权重归一化。解码方式不同，损失不能单独证明决策或实战改善。其余指标在相同状态、候选、标签和风险特征上计算。','', '|指标|阶段2 direct|阶段2 group_mass|分层新模型|','|---|---:|---:|---:|']
for key in keys:
    values=[prior['metrics']['direct'][key],prior['metrics']['group_mass'][key],current['metrics'][key]]
    def fmt(v):return str(v) if key=='waitWithOpportunity' else f'{v:.4%}'
    lines.append('|'+key+'|'+'|'.join(map(fmt,values))+'|')
(HERE/'COMPARISON.md').write_text('\n'.join(lines)+'\n',encoding='utf-8');print(current['metrics'])
