"""保留首轮失败，使用相同训练目标追加更强end降权；门禁不变。"""
from train import *
import ast

assert not (HERE/'battle-plan.json').exists(),'追加校准不能消费实战结果'
original=read(HERE/'calibration-result-original-nine.json');assert not original['passed']
protocol=read(HERE/'calibration-extension-protocol.json')
with (HERE/'calibration-cache.pkl').open('rb') as f:cached=pickle.load(f)
train=cached['train'];dev=cached['dev'];model=read(HERE/'policy-best.json')
# 复用原始metric与fit函数，保持优化目标、解析梯度核对和开发统计完全一致。
source=ast.parse((HERE/'calibrate.py').read_text(encoding='utf-8'))
functions=[n for n in source.body if isinstance(n,ast.FunctionDef) and n.name in ['metric','fit']]
assert len(functions)==2
exec(compile(ast.Module(body=functions,type_ignores=[]),str(HERE/'calibrate.py'),'exec'),globals())
features=np.full((len(train),6),-np.inf)
targetTypes=np.array([r['types'][r['groupidx'][r['target']]] for r in train])
weights=np.array([r['weight']*(1.5 if r['valueMask'] and r['valueTarget']==1 else 1) for r in train])
for j,r in enumerate(train):
    for t in range(6):
        vals=[v for v,k in zip(r['g'],r['types']) if k==t]
        if vals:m=max(vals);features[j,t]=m+math.log(sum(math.exp(v-m) for v in vals))
baseline=original['uncalibrated'];oldReference=original['stage3Reference'];candidates=read(HERE/'calibration-candidates-original-nine.json')
for params in protocol['additionalWeights']:
    wait,end=params['wait'],params['end'];bias,optimization=fit(wait,end);metrics=metric(dev,bias)
    gates=dict(wait=metrics['waitWithOpportunity']<=min(baseline['waitWithOpportunity'],oldReference['waitWithOpportunity']),end=metrics['endWithRecruit']<=.8*min(baseline['endWithRecruit'],oldReference['endWithRecruit']),attack=metrics['attack_opportunity_rate']>=max(baseline['attack_opportunity_rate'],oldReference['attack_opportunity_rate']),top1=metrics['top1']>=max(baseline['top1'],oldReference['top1'])-.01)
    candidates.append(dict(wait=wait,end=end,bias=bias.tolist(),optimization=optimization,metrics=metrics,gates=gates,passed=all(gates.values()),additionalAfterOriginalNine=True))
qualified=[r for r in candidates if r['passed']];selected=min(qualified,key=lambda r:r['metrics']['loss']) if qualified else None
if selected:model['schema']['groupTypeBias']=(np.array(model['schema']['groupTypeBias'])+selected['bias']).tolist()
save('policy-final.json',model);save('calibration-candidates.json',candidates)
save('calibration-result.json',dict(passed=selected is not None,selected=selected,uncalibrated=baseline,stage3Reference=oldReference,selectionUsedBattleResults=False,originalNinePassed=False,additionalProtocol=protocol,totalCandidates=len(candidates),fallback='无候选通过时保留未校准策略'))
print(json.dumps(dict(passed=selected is not None,selected=selected),ensure_ascii=False),flush=True)
