"""原89状态最终组合推理的PyTorch精确参考。"""
import json
import torch
from data import DIR, decode, load_model, save
torch.set_num_threads(1)
torch.backends.mkldnn.enabled = False
torch.use_deterministic_algorithms(True)
model = load_model('dual-v2-stage4-pure').accurate_reductions().eval()
inputs = json.loads((DIR / 'pipeline-inputs.json').read_text('utf-8'))
samples = decode(json.loads((DIR / 'samples.json').read_text('utf-8')), (DIR / 'samples.bin').read_bytes())
config = json.loads((DIR / 'value-config.json').read_text('utf-8'))
bias = json.loads((DIR / 'head-calibration.json').read_text('utf-8'))['headBias']
references = []
with torch.no_grad():
    for sample, extra in zip(samples, inputs):
        out = model(sample); f = extra['features']; c = config['buckets'][f['bucket']]; mask = sample['active'].bool()
        army = torch.tensor(f['army'], dtype=torch.float64) * mask; income = torch.tensor(f['income'], dtype=torch.float64) * mask
        logits = (out['valueLogits'].double() / c['temperature'] + c['army'] * army / army.sum().clamp_min(1e-12) + c['income'] * income / income.sum().clamp_min(1e-12)).float().masked_fill(~mask, -1e9)
        exp = torch.where(mask, (logits.double() - logits[mask].max().double()).exp().float(), torch.zeros(6))
        p = (exp.double() / exp.double().sum()).float()
        scores = out['logits'].double() + torch.tensor([bias[h] for h in extra['heads']], dtype=torch.float64) + torch.tensor(extra['prior'], dtype=torch.float64)
        references.append(dict(scores=scores.tolist(), valueProbs=p.tolist(), beforeHash=extra['beforeHash']))
save('pipeline-reference.json', references)
print(json.dumps(dict(samples=len(references), passed=len(references) == 89)))
