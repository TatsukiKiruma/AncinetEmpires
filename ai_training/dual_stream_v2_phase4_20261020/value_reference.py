"""独立校准数值参考：89条固定开发真实价值前态，不参与参数拟合。"""
import json
import math
import numpy as np
import torch
from pathlib import Path
DIR = Path(__file__).resolve().parent
data = torch.load(DIR / 'dev-calibration.pt', weights_only=False)
config = json.loads((DIR / 'value-config.json').read_text('utf-8'))
inputs = []
pools = [(data['bucket'].long() == bucket).nonzero().flatten().tolist() for bucket in range(9)]
selected = []
while len(selected) < 89:
    for pool in pools:
        if pool and len(selected) < 89: selected.append(pool.pop(0))
    if not any(pools) and len(selected) < 89: raise RuntimeError('价值探针不足89条')
for i in selected:
    logits = data['valueLogits'][i].tolist(); active = data['active'][i].tolist()
    army = data['army'][i].tolist(); income = data['income'][i].tolist(); bucket = int(data['bucket'][i]); c = config['buckets'][bucket]
    asum = max(1e-12, sum(max(0, x) * a for x, a in zip(army, active))); isum = max(1e-12, sum(max(0, x) * a for x, a in zip(income, active)))
    scores = torch.tensor([logits[s] / c['temperature'] + c['army'] * max(0, army[s]) / asum + c['income'] * max(0, income[s]) / isum if active[s] else -1e9 for s in range(6)], dtype=torch.float32)
    mask = torch.tensor(active, dtype=torch.bool)
    maximum = scores[mask].max()
    exps = torch.where(mask, (scores.double() - maximum.double()).exp().float(), torch.zeros(6))
    p = (exps.double() / exps.double().sum()).float().tolist()
    inputs.append(dict(logits=logits, active=active, features=dict(bucket=bucket, army=army, income=income), expected=p, source=data['sources'][i]['id']))
(DIR / 'value-parity-inputs.json').write_text(json.dumps(inputs), encoding='utf-8')
