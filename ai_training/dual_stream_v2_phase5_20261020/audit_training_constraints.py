"""只读取预登记的119个训练违例，核验导出后实际全网的机会约束。"""
import os
import json
import torch
from data import DIR, batches, collate, forward_batch, load_model
from phase52_io import save
from prior_distillation import inference_scores
from calibrate_frozen import decode

torch.set_num_threads(4)
folder = DIR / 'generations/gen_03'; protocol = json.loads((folder / 'semantic-repair-protocol.json').read_text('utf-8'))
os.environ['LEAGUE_GENERATION'] = '3'
models = []
for name in [protocol['warmModel'], 'generations/gen_03/model']:
    os.environ['LEAGUE_MODEL'] = str(DIR / name); models.append(load_model('model').eval())
bias = torch.tensor(json.loads((DIR / 'generations/gen_00/head-calibration.json').read_text('utf-8'))['headBias'], dtype=torch.float64)
counts = [dict(samples=0, wastedWait=0, headHits=0, violatedMargin=0) for _ in models]
with torch.no_grad():
    for samples in batches('train', 0, env=dict(LEAGUE_SELECTED_IDS=str(folder / 'semantic-constraint-training-ids.json.gz'), LEAGUE_CONSTRAINT_ONLY='1')):
        x = collate(samples)
        for mi, model in enumerate(models):
            scores = inference_scores(forward_batch(model, x), x, samples, bias)
            for i, sample in enumerate(samples):
                n = len(sample['pointers']); ptr = x['ptr'][i, :n]; s = scores[i, :n]
                selected = decode(s, ptr); eligible = sample['source']['wasteActors']
                waste = (ptr[:, 2] == 4) & torch.tensor([int(a) in eligible for a in ptr[:, 0]])
                other = (ptr[:, 2] != 4) & (ptr[:, 2] != 13)
                counts[mi]['samples'] += 1
                counts[mi]['wastedWait'] += int(int(ptr[selected, 2]) == 4 and int(ptr[selected, 0]) in eligible)
                counts[mi]['headHits'] += int(ptr[selected, 2] == ptr[x['target'][i], 2])
                counts[mi]['violatedMargin'] += int(float(s[waste].max() + .5 - s[other].max()) > 0)
assert all(c['samples'] == 119 for c in counts)
result = dict(split='train', warm=counts[0], student=counts[1], metric='实际导出完整网络，非缓存近似', usedDevLabels=False)
save(folder / 'semantic-training-constraint-audit.json', result); print(result)
