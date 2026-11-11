"""89个原冻结输入的PyTorch精确参考，包含新凸组合价值层的逐次float32边界。"""
import json
import os
from pathlib import Path
import torch
from data import decode, load_model

folder = Path(os.environ['LEAGUE_FOLDER']); os.environ['LEAGUE_MODEL'] = str(folder / 'model')
torch.set_num_threads(1); torch.backends.mkldnn.enabled = False; torch.use_deterministic_algorithms(True)
model = load_model('model').accurate_reductions().eval()
samples = decode(json.loads((folder / 'samples.json').read_text('utf-8')), (folder / 'samples.bin').read_bytes())
inputs = json.loads((folder / 'pipeline-inputs.json').read_text('utf-8'))
config = json.loads((folder / 'value-config.json').read_text('utf-8'))
bias = json.loads((folder / 'head-calibration.json').read_text('utf-8'))['headBias']
refs, pipeline, values = [], [], []


def softmax(logits, active):
    exp = torch.where(active, (logits.double() - logits[active].max().double()).exp().float(), torch.zeros(6))
    return (exp.double() / exp.double().sum()).float()


with torch.no_grad():
    for sample, extra in zip(samples, inputs):
        out = model(sample); f = extra['features']; c = config['buckets'][f['bucket']]; mask = sample['active'].bool()
        army = torch.tensor(f['army'], dtype=torch.float64) * mask; income = torch.tensor(f['income'], dtype=torch.float64) * mask
        cmd = torch.tensor(f['commander'], dtype=torch.float64); actions = torch.tensor(f['actionable'], dtype=torch.float64); actions /= actions.max().clamp_min(1)
        prior = c['army'] * army / army.sum().clamp_min(1e-12) + c['income'] * income / income.sum().clamp_min(1e-12)
        extra_score = c.get('commander', 0) * cmd + c.get('actionable', 0) * actions
        # JS先回写旧式logit，再增加新特征并回写，先验单独回写。
        logits = ((out['valueLogits'].double() / c['temperature'] + prior).float().double() + extra_score).float().masked_fill(~mask, -1e9)
        prior_logits = (prior + extra_score).float().masked_fill(~mask, -1e9)
        p = softmax(logits, mask)
        if c.get('mixture', 0):
            q = softmax(prior_logits, mask)
            # 先验分母在JS为float64归约，不能提前回写归一化q。
            exp = torch.where(mask, (prior_logits.double() - prior_logits[mask].max().double()).exp().float(), torch.zeros(6))
            p = ((1 - c['mixture']) * p.double() + c['mixture'] * exp.double() / exp.double().sum()).float()
        scores = out['logits'].double() + torch.tensor([bias[h] for h in extra['heads']], dtype=torch.float64) + torch.tensor(extra['prior'], dtype=torch.float64)
        refs.append({k: out[k].tolist() for k in ['logits', 'actorPrior', 'valueProbs']})
        pipeline.append(dict(scores=scores.tolist(), valueProbs=p.tolist(), beforeHash=extra['beforeHash']))
        values.append(dict(logits=out['valueLogits'].tolist(), active=sample['active'].tolist(), features=f, expected=p.tolist()))
assert len(refs) == 89
for name, data in [('model-torch-reference.json', refs), ('pipeline-reference.json', pipeline), ('value-parity-inputs.json', values)]:
    (folder / name).write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
print(json.dumps(dict(states=89, accurateReductions=True)), flush=True)
