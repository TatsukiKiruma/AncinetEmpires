"""单次seed复验闭合后CPU核查；不执行前向或优化。"""
import argparse
import json
import math
from pathlib import Path
import sys

import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'runner_v4_seed1'))
from frozen import STAGE1, load_runtime, legacy_contracts
from recovery import read, validate_control


def audit(folder, exit_code):
    config = read(HERE / 'runner_v4_seed1/CONFIG.json')
    execution, _ = validate_control(config)
    paths = list(folder.glob('RUN_CLOSURE-*.json'))
    assert len(paths) == 1
    closure = read(paths[0])
    assert exit_code == 0 and closure['status'] == 'complete' and closure['primaryError'] is None
    assert closure['budgetClosedConservatively'] and not closure['cleanupErrors'] and not closure['eventErrors']
    assert closure['executionIdentity'] == execution
    latest = read(folder / 'LATEST.json')
    checkpoint = Path(latest['file'])
    checkpoint_sha = legacy_contracts.file_sha(checkpoint)
    assert checkpoint_sha == latest['sha256'] == closure['lastCompleteCheckpoint']['sha256']
    ledger = read(closure['budgetLedger'])
    assert ledger['status'] != 'running' and ledger['latestCheckpointSha256'] == checkpoint_sha
    assert ledger['armId'] == closure['armId'] and ledger['controlProtocol'] == execution['protocol']
    assert ledger['shutdownTailReservationSeconds'] == 5 and ledger['limitSeconds'] == 14400
    assert ledger['consumedWallSeconds'] <= 14400
    saved = torch.load(checkpoint, map_location='cpu', weights_only=False)
    assert saved['executionIdentity'] == execution and saved['config'] == config
    assert saved['frozenScientificIdentity'] == execution['frozenV2']
    assert not saved['pendingAccumulatedGradients'] and not saved['engineeringOnly'] and saved['recoveryAllowed']
    updates, samples = saved['stageUpdates'], saved['sampler']['cursor']
    assert updates == closure['completedUpdates'] == 10000 and samples == closure['completedSamples'] == 80000
    assert saved['global_step'] == 241899 + updates and saved['scheduler']['last_epoch'] == updates
    receipt = read(folder / 'RESTORE.json')
    assert receipt['initialModelDigest'] == receipt['inheritedModelDigest'] == '8046bd5b7527d86fca88b55f9f3a2052086f1541e12b4b4a2974e8799ae0c76a'
    assert receipt['optimizerRestoreDigest'] == receipt['inheritedOptimizerDigest'] == 'f8668b2f1bf1a2c51c7d6f4be14b4ab84c1ec62d9b6b9c42446a64d5007b7d5e'
    assert receipt['inheritedWallSeconds'] == 0 and receipt['resumedFrom'] is None
    assert receipt['executionIdentity'] == execution and receipt['codeApproval']['sha256'] == legacy_contracts.file_sha(receipt['codeApproval']['path'])
    metrics = [json.loads(line) for line in (folder / 'METRICS.jsonl').read_text('utf-8').splitlines() if line]
    assert [r['stageUpdates'] for r in metrics] == list(range(1, 10001))
    for row in metrics:
        step = row['stageUpdates'] - 1
        factor = (step + 1) / 200 if step < 200 else .1 + .45 * (1 + math.cos(math.pi * (step - 200) / 9800))
        assert row['samples'] == row['stageUpdates'] * 8 and row['globalStep'] == 241899 + row['stageUpdates']
        assert math.isclose(row['learningRateUsed'], .0001 * factor, rel_tol=1e-12)
        assert all(math.isfinite(row[k]) for k in ['loss', 'gradientNorm', 'learningRateUsed'])
    runtime = load_runtime()
    base = torch.load(runtime.BASE, map_location='cpu', weights_only=False)
    assert all(float(item['step']) - float(base['optimizer']['state'][key]['step']) == updates for key, item in saved['optimizer']['state'].items())
    assert len(saved['optimizer']['state']) == 194
    assert sum(item['exp_avg'].numel() for item in saved['optimizer']['state'].values()) == 1966910
    assert all(torch.isfinite(value).all() for value in saved['model'].values())
    assert all(torch.isfinite(value).all() for item in saved['optimizer']['state'].values() for value in item.values() if isinstance(value, torch.Tensor))
    model_digest = runtime.tensor_digest(saved['model'])
    assert runtime.tensor_digest(runtime.load_model(folder / 'final').state_dict()) == model_digest
    binary_sha = legacy_contracts.file_sha(folder / 'final.bin')
    diagnostics = []
    for update in [2500, 5000, 7500, 10000]:
        path = folder / f'dev-{update}/RESULT.json'
        result = read(path)
        assert result['samples'] == 1299 and not result['finalTestEvaluated']
        assert result['executionIdentity'] == execution['frozenV2']
        diagnostics.append(dict(updates=update, result=str(path), modelSha256=result['modelSha256']))
    assert diagnostics[-1]['modelSha256'] == binary_sha
    provenance = dict(schema='seed-extension-evaluation-provenance-v1', executionIdentity=execution,
                      trainingConfig=str(HERE / 'runner_v4_seed1/CONFIG.json'), trainingSamplerSeed=20261031,
                      evaluationConfig=str(STAGE1 / 'stage2-configs/lr-1e-4.json'), evaluationSamplerSeedField=20261030,
                      explanation='评测无训练抽样，保留原冻结配置以核对原科学身份；模型明确来自seed扩展终点。',
                      checkpointSha256=checkpoint_sha, modelBinarySha256=binary_sha,
                      modelMetadataSha256=legacy_contracts.file_sha(folder / 'final.json'))
    (folder / 'EVALUATION_PROVENANCE.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    return dict(passed=True, arm='lr-1e-4-seed20261031', actualExitCode=exit_code, folder=str(folder),
                full80k=True, updates=updates, samples=samples, closure=closure, closedLedger=ledger,
                checkpoint=str(checkpoint), checkpointSha256=checkpoint_sha, binarySha256=binary_sha,
                modelDigest=model_digest, optimizerDigest=runtime.tensor_digest(saved['optimizer']),
                samplerDigest=runtime.tensor_digest(saved['sampler']), exposure=saved['sampler']['exposures'],
                recordedMetricRows=len(metrics), clippingFraction=sum(r['gradientNorm'] > 1 for r in metrics) / len(metrics),
                diagnostics=diagnostics, terminalOffline=str(folder / 'dev-10000'), executionIdentity=execution,
                additionalOptimizerUpdates=0, additionalForwardCalls=0, finalTestPredictions=0)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', type=Path, required=True)
    parser.add_argument('--exit-code', type=int, required=True)
    args = parser.parse_args()
    result = audit(args.folder, args.exit_code)
    (HERE / 'REPLICATION_FINAL_AUDIT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps({k: result[k] for k in ['passed', 'updates', 'samples', 'recordedMetricRows']}))
