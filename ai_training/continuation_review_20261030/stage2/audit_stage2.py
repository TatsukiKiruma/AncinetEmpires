"""只读核查阶段二训练身份、完整状态及学习率记录，不执行前向或更新。"""
import argparse
import json
import math
import sys
from pathlib import Path

import torch

HERE = Path(__file__).resolve().parent
STAGE1 = HERE.parent / 'stage1'
sys.path.insert(0, str(STAGE1))
from contracts import validate, file_sha
from runtime import tensor_digest, load_model


def read(path):
    return json.loads(path.read_text('utf-8-sig'))


def audit(root):
    records = []
    for arm in ['lr-1e-4', 'lr-5e-5', 'lr-2.4495e-4']:
        folder = root / arm
        config = read(STAGE1 / 'stage2-configs' / (arm + '.json'))
        execution, _ = validate(config)
        if not folder.exists():
            records.append(dict(arm=arm, status='not_started'))
            continue
        receipt = read(folder / 'RESTORE.json')
        ledger = read(folder / 'ARM_BUDGET.json')
        latest = read(folder / 'LATEST.json')
        checkpoint = torch.load(folder / 'checkpoint.pt', map_location='cpu', weights_only=False)
        metrics = [json.loads(line) for line in (folder / 'METRICS.jsonl').read_text('utf-8').splitlines() if line]
        assert receipt['executionIdentity'] == checkpoint['executionIdentity'] == execution
        assert receipt['config'] == checkpoint['config'] == config
        assert receipt['inheritedModelDigest'] == receipt['initialModelDigest']
        assert receipt['inheritedOptimizerDigest'] == receipt['optimizerRestoreDigest']
        assert receipt['checkpointSha256'] == checkpoint['baseCheckpointSha256'] == config['checkpointSha256']
        assert not checkpoint['engineeringOnly'] and not checkpoint['pendingAccumulatedGradients']
        completed_updates = checkpoint['stageUpdates']
        journal_gap = completed_updates - len(metrics)
        # 账本写入位于完整屏障之后、指标日志之前；异常时可留下一个明确披露的完整更新。
        assert journal_gap == 0 or checkpoint['reason'] == 'exception' and journal_gap == 1
        assert checkpoint['sampler']['cursor'] == completed_updates * 8
        assert latest['sha256'] == ledger['latestCheckpointSha256'] == file_sha(folder / 'checkpoint.pt')
        assert checkpoint['armBudget']['armId'] == ledger['armId']
        assert all(torch.isfinite(value).all().item() for value in checkpoint['model'].values())
        for state in checkpoint['optimizer']['state'].values():
            assert all(torch.isfinite(value).all().item() for value in state.values() if isinstance(value, torch.Tensor))
        for index, metric in enumerate(metrics):
            assert metric['stageUpdates'] == index + 1 and metric['samples'] == (index + 1) * 8
            assert all(math.isfinite(metric[key]) for key in ['loss', 'gradientNorm', 'learningRateUsed'])
            factor = (index + 1) / 200 if index < 200 else .1 + .45 * (1 + math.cos(math.pi * (index - 200) / 9800))
            assert math.isclose(metric['learningRateUsed'], config['peakLearningRate'] * factor, rel_tol=1e-12)
            assert metric['remainingWallSeconds'] >= 0
        exposure = checkpoint['sampler']['exposures']
        assert sum(v for k, v in exposure.items() if k.startswith('corpus/')) == completed_updates * 8
        record = dict(arm=arm, stageUpdates=completed_updates, samples=completed_updates * 8,
                      metricRows=len(metrics), completeBarrierUpdatesWithoutMetricRow=journal_gap,
                      stopReason=checkpoint['reason'], recoveryAllowed=checkpoint['recoveryAllowed'],
                      armId=ledger['armId'], ledger=ledger, checkpointSha256=latest['sha256'],
                      modelDigest=tensor_digest(checkpoint['model']), optimizerDigest=tensor_digest(checkpoint['optimizer']),
                      samplerDigest=tensor_digest(checkpoint['sampler']),
                      inheritance=dict(model=receipt['inheritedModelDigest'], optimizer=receipt['inheritedOptimizerDigest']),
                      firstLr=metrics[0]['learningRateUsed'] if metrics else None,
                      lastLr=metrics[-1]['learningRateUsed'] if metrics else None,
                      clippingFraction=sum(m['gradientNorm'] > 1 for m in metrics) / max(1, len(metrics)),
                      exposure={k: v for k, v in exposure.items() if not k.startswith('parent/')},
                      exposedParents=sum(k.startswith('parent/') for k in exposure),
                      largestParentExposure=max((v for k, v in exposure.items() if k.startswith('parent/')), default=0),
                      finiteCompleteState=True, finalTestEvaluated=False, forwardCalls=0, optimizerUpdates=0)
        if (folder / 'final.bin').exists():
            exported = load_model(folder / 'final')
            assert tensor_digest(exported.state_dict()) == record['modelDigest']
            record['export'] = dict(binarySha256=file_sha(folder / 'final.bin'),
                                    metadataSha256=file_sha(folder / 'final.json'), checkpointParametersMatch=True)
        records.append(record)
    by_samples = {}
    for record in records:
        if 'samplerDigest' in record:
            by_samples.setdefault(record['samples'], set()).add(record['samplerDigest'])
    assert all(len(digests) == 1 for digests in by_samples.values())
    return dict(schema='continuation-stage2-readonly-audit-v1', arms=records,
                equalSampleBudgetSamplerStatesMatch=True, forwardCalls=0, optimizerUpdates=0, finalTestEvaluated=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.root)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), 'utf-8')
    print(json.dumps([{k: a.get(k) for k in ['arm', 'status', 'stageUpdates', 'samples', 'stopReason']} for a in result['arms']]))
