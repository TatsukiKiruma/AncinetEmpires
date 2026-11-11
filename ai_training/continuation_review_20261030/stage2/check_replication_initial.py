"""只读核对不可变零步检查点的模型、AdamW矩和恢复RNG。"""
import json
from pathlib import Path
import sys

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'runner_v4_seed1'))
from frozen import load_runtime

ROOT = Path('D:/AncientEmpiresData/continuation_stage2_20261030_v1')


def equal(a, b):
    if isinstance(a, torch.Tensor):
        return isinstance(b, torch.Tensor) and torch.equal(a, b)
    if isinstance(a, np.ndarray):
        return isinstance(b, np.ndarray) and np.array_equal(a, b)
    if isinstance(a, dict):
        return isinstance(b, dict) and a.keys() == b.keys() and all(equal(a[k], b[k]) for k in a)
    if isinstance(a, (list, tuple)):
        return type(a) == type(b) and len(a) == len(b) and all(equal(x, y) for x, y in zip(a, b))
    return a == b


if __name__ == '__main__':
    runtime = load_runtime()
    current_paths = list((ROOT / 'lr-1e-4-seed20261031').glob('checkpoint-000000-*.pt'))
    original_paths = list((ROOT / 'lr-5e-5').glob('checkpoint-000000-*.pt'))
    assert len(current_paths) == len(original_paths) == 1
    current = torch.load(current_paths[0], map_location='cpu', weights_only=False)
    original = torch.load(original_paths[0], map_location='cpu', weights_only=False)
    base = torch.load(runtime.BASE, map_location='cpu', weights_only=False)
    assert current['stageUpdates'] == 0 and current['sampler']['cursor'] == 0
    checks = dict(modelEqualsBase=equal(current['model'], base['model']),
                  adamMomentsEqualBase=equal(current['optimizer']['state'], base['optimizer']['state']),
                  restoredBasePythonNumpyTorchRng=all(equal(current['rng'][key], base['rng'][key]) for key in ['python', 'numpy', 'torch']),
                  rngEqualsOriginalV4Start=equal(current['rng'], original['rng']),
                  samplerRngDiffers=not equal(current['sampler']['rng'], original['sampler']['rng']))
    assert all(checks.values()), checks
    result = dict(passed=True, checks=checks, currentInitial=str(current_paths[0]), referenceInitial=str(original_paths[0]),
                  modelDigest=runtime.tensor_digest(current['model']), baselineGpuRngWasAbsent=base['rng'].get('gpu') is None,
                  newForwardCalls=0, newOptimizerUpdates=0, budgetLedgerReads=0)
    (HERE / 'REPLICATION_INITIAL_RESTORE_AUDIT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps(result, ensure_ascii=False))
