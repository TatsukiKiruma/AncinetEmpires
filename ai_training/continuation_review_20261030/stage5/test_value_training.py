"""以真实特征缓存验证一次价值更新不触及冻结参数。"""
import json
from pathlib import Path
import numpy as np
import torch
from isolation import load_model, PREFIX
from value_training import freeze, frozen_digest, step, value_logits

torch.set_num_threads(2)
model = load_model(PREFIX).accurate_reductions(True)
parameters = freeze(model)
identity = frozen_digest(model)
file = next(Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1/features-02').glob('*.npz'))
with np.load(file, allow_pickle=False) as cached:
    batch = {k: torch.from_numpy(cached[k].copy()) for k in ['slot_vectors', 'players', 'active', 'valueTarget', 'omniBaseValueLogits']}
batch['weights'] = torch.ones(12)
before = model.value2.weight.detach().clone()
result = step(model, torch.optim.AdamW(parameters, lr=2e-5), batch, .15, identity)
assert frozen_digest(model) == identity
assert not torch.equal(before, model.value2.weight)
assert all(p.grad is None for p in model.parameters() if not p.requires_grad)
batch['active'][0] = 0
try:
    step(model, torch.optim.AdamW(parameters, lr=2e-5), batch, .15, identity)
except ValueError:
    pass
else:
    raise AssertionError('空有效槽未失败关闭')
print(json.dumps({'passed': True, 'inMemoryOnly': True, **result}))
