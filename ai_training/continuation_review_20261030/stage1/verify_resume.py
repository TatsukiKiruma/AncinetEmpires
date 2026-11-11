"""比较4步连续更新与2步保存+2步恢复，工程副本永不晋升。"""
import json
import pickle
import torch
import numpy as np
from runtime import HERE, tensor_digest, save, sha

out = HERE / 'runs'
full = torch.load(out / 'engineering-full/checkpoint.pt', map_location='cpu', weights_only=False)
resumed = torch.load(out / 'engineering-resumed/checkpoint.pt', map_location='cpu', weights_only=False)
checks = dict(model=tensor_digest(full['model']) == tensor_digest(resumed['model']), optimizer=tensor_digest(full['optimizer']) == tensor_digest(resumed['optimizer']), scheduler=full['scheduler'] == resumed['scheduler'], sampler=pickle.dumps(full['sampler']) == pickle.dumps(resumed['sampler']), rng=pickle.dumps(full['rng']['python']) == pickle.dumps(resumed['rng']['python']) and torch.equal(full['rng']['torch'], resumed['rng']['torch']) and all(torch.equal(a, b) for a, b in zip(full['rng']['gpu'], resumed['rng']['gpu'])), updates=full['stageUpdates'] == resumed['stageUpdates'] == 4)
maximum = max(float((full['model'][k] - resumed['model'][k]).abs().max()) for k in full['model'])
checks['numpyRng'] = full['rng']['numpy'][0] == resumed['rng']['numpy'][0] and np.array_equal(full['rng']['numpy'][1], resumed['rng']['numpy'][1]) and full['rng']['numpy'][2:] == resumed['rng']['numpy'][2:]
checks['finiteModel'] = all(torch.isfinite(v).all().item() for v in full['model'].values())
checks['finiteAdamMoments'] = all(torch.isfinite(v['exp_avg']).all().item() and torch.isfinite(v['exp_avg_sq']).all().item() for v in full['optimizer']['state'].values())
assert all(checks.values()), checks
assert all(checks.values()), checks
save(HERE / 'GPU_RESUME_VERIFIED.json', dict(passed=True, checks=checks, modelMaxAbsoluteDifference=maximum, effectiveBatch=8, microbatch=1, independentStageUpdates=4, totalTemporaryOptimizerUpdates=8, formalUpdates=0, engineeringNeverPromote=True, checkpoints={name: sha(out / name / 'checkpoint.pt') for name in ['engineering-full', 'engineering-split', 'engineering-resumed']}, note='GPU同平台连续与保存恢复逐位一致；ARM到GPU只要求恢复身份与前向/梯度容差，不声称跨平台更新逐位等价'))
print(json.dumps(dict(passed=True, checks=checks, totalTemporaryOptimizerUpdates=8)))
