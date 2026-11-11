"""在同一非平凡开发材料上汇总冻结基线与三臂，按预注册CE选择新模型。"""
import gzip
import hashlib
import json
import math
import shutil
import torch
from train import HERE, DT, Policy, read, save, evaluate

contract = read(HERE/'contract.json')
schema = read(HERE/'schema.json')
dev = [e for e in contract['files'] if e['split']=='validation']
predictions = {}
for entry in dev:
    name = f"baseline-offline/{entry['parent']}"
    receipt = read(HERE/(name+'.receipt.json'))
    data = (HERE/(name+'.jsonl.gz')).read_bytes()
    assert hashlib.sha256(data).hexdigest()==receipt['sha256']
    for line in gzip.decompress(data).splitlines():
        row = json.loads(line)
        predictions[(row['parent'],row['macro'],row['subAction'])] = row

class BaselineOutputs:
    def eval(self): return self
    def __call__(self,batch):
        rows = batch['_rows']
        logits = torch.full(batch['mask'].shape,-torch.inf,dtype=DT)
        for i,row in enumerate(rows):
            expected = predictions[(row['parent'],row['macro'],row['subAction'])]
            assert expected['codes']==row['codes'] and expected['target']==row['target']
            assert expected['beforeHash']==row['beforeHash']
            logits[i,:len(row['codes'])] = torch.tensor(expected['logits'],dtype=DT)
        return logits,torch.zeros(len(rows),dtype=DT),{}

results = {'baseline':evaluate(BaselineOutputs(),dev,schema)}
for arm in ('legacy','new','conditional'):
    package = read(HERE/f'model-{arm}.json')
    model = Policy(schema,package['weights'],arm=='legacy')
    results[arm] = evaluate(model,dev,schema)
    save(f'dev-{arm}.json',results[arm])
    print(json.dumps(dict(arm=arm,loss=results[arm]['loss'],direct=results[arm]['metrics']['direct']),ensure_ascii=False),flush=True)
best = min(('new','conditional'),key=lambda arm:results[arm]['loss'])
best_file = HERE/f'model-{best}.json'
shutil.copyfile(best_file,HERE/'model-best.json')
comparisons = {}
for arm in ('legacy','new','conditional'):
    m,b = results[arm]['metrics']['direct'],results['baseline']['metrics']['direct']
    comparisons[arm] = {key:m[key]-b[key] for key in ('top1','within_move','within_recruit','attack_accuracy','attack_opportunity_rate','danger_avoidance')}
save('comparison.json',dict(bestArm=best,selection='预注册direct开发宏加权原子CE；不查看战报选模型',results=results,deltasVsBaseline=comparisons,
    developmentOnly=True,trainRows=contract['trainRows'],devRows=contract['devRows'],groupMaxEquivalentToDirect=True,
    groupMassDefinition='单位/城堡+动作类型的softmax概率质量，组内稳定argmax',
    safetyDefinition='已选择移动且同单位同动作组有已知安全落点时，选择非致死且已知风险落点的比例',
    attackOpportunityDefinition='全局合法候选存在attack时选择attack比例；不等同证明攻击总是最佳',
    withinDefinition='已知目标动作组下的条件落点/兵种准确率，与decoder选择哪个动作组分开',
    independentGeneralization=False,bestSha256=hashlib.sha256(best_file.read_bytes()).hexdigest()))
print(json.dumps(dict(best=best,loss=results[best]['loss']),ensure_ascii=False))
