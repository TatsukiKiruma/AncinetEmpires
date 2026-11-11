"""闭合后核查V4候选及跨控制运行段；不创建训练预算或执行前向。"""
import argparse
import json
import math
from pathlib import Path
import sys

import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'runner_v4_sync1'))
from frozen import STAGE1, load_runtime, legacy_contracts
from recovery import read, validate_control

ARTIFACTS = Path('D:/AncientEmpiresData/continuation_stage2_20261030_v1')


def audit(arm, folder, exit_code):
    config = read(STAGE1 / 'stage2-configs' / (arm + '.json'))
    execution, _ = validate_control(config)
    closures = list(folder.glob('RUN_CLOSURE-*.json'))
    assert len(closures) == 1, '必须有唯一闭合证据'
    closure = read(closures[0])
    budget_stop = bool(exit_code != 0 and str(closure['primaryError']).startswith('BudgetExpired('))
    assert exit_code == 0 or budget_stop, '真实异常候选禁止自动晋升'
    assert closure['budgetClosedConservatively'] and not closure['cleanupErrors'] and not closure['eventErrors']
    assert closure['status'] == ('failed' if budget_stop else 'complete')
    if not budget_stop:
        assert closure['primaryError'] is None
    latest = read(folder / 'LATEST.json')
    saved_path = Path(latest['file'])
    digest = legacy_contracts.file_sha(saved_path)
    assert digest == latest['sha256'] == closure['lastCompleteCheckpoint']['sha256']
    ledger = read(closure['budgetLedger'])
    assert ledger['latestCheckpointSha256'] == digest and ledger['status'] != 'running'
    assert ledger['controlProtocol'] == execution['protocol'] and ledger['shutdownTailReservationSeconds'] == 5
    assert ledger['armId'] == closure['armId']
    saved = torch.load(saved_path, map_location='cpu', weights_only=False)
    assert saved['executionIdentity'] == closure['executionIdentity'] == execution
    assert saved['config'] == config and saved['frozenScientificIdentity'] == execution['frozenV2']
    assert not saved['engineeringOnly'] and not saved['pendingAccumulatedGradients'] and saved['recoveryAllowed']
    updates, samples = saved['stageUpdates'], saved['sampler']['cursor']
    assert updates == closure['completedUpdates'] and samples == closure['completedSamples'] == updates * 8
    assert updates <= 10000 and saved['global_step'] == 241899 + updates
    assert saved['scheduler']['last_epoch'] == updates
    assert ledger['consumedWallSeconds'] >= saved['armBudget']['consumedWallSeconds']
    receipt = read(folder / 'RESTORE.json')
    assert receipt['executionIdentity'] == execution and receipt['initialModelDigest']
    assert receipt['codeApproval']['sha256'] == legacy_contracts.file_sha(receipt['codeApproval']['path'])
    assert receipt['optimizerRestoreDigest'] == receipt['inheritedOptimizerDigest'] == 'f8668b2f1bf1a2c51c7d6f4be14b4ab84c1ec62d9b6b9c42446a64d5007b7d5e'
    segments = []
    if arm == 'lr-1e-4':
        assert receipt['inheritedWallSeconds'] == 2481.432339600011
        assert receipt['initialModelDigest'] == '45f7b31a68fb08a125c290e2123ace2b4811f5b41a3ba2ce1693e437775f05c9'
        assert receipt['recoveryBridge']['checkpointSha256'] == '74b326d3981af8364252442991641e4d697b8b674b6eaa683f5a94cdf3181175'
        assert ledger['armId'] == 'f167ec70-dd0b-48bd-9af0-fb6a45452d3e'
        segments += [(ARTIFACTS / 'lr-1e-4/METRICS.jsonl', 1, 7757, 'V2，7758完整屏障后指标缺1条'),
                     (folder / 'METRICS.jsonl', 7759, updates, 'V4正式接续，V3段新增0')]
    else:
        assert receipt['inheritedWallSeconds'] == 0 and receipt['resumedFrom'] is None
        assert receipt['initialModelDigest'] == receipt['inheritedModelDigest'] == '8046bd5b7527d86fca88b55f9f3a2052086f1541e12b4b4a2974e8799ae0c76a'
        segments += [(folder / 'METRICS.jsonl', 1, updates, 'V4独立从原2414/AdamW起步')]
    records, summaries = [], []
    for path, first, last, label in segments:
        rows = [json.loads(line) for line in path.read_text('utf-8').splitlines() if line]
        assert [r['stageUpdates'] for r in rows] == list(range(first, last + 1))
        for row in rows:
            index = row['stageUpdates'] - 1
            expected_factor = (index + 1) / 200 if index < 200 else .1 + .45 * (1 + math.cos(math.pi * (index - 200) / 9800))
            assert row['samples'] == row['stageUpdates'] * 8 and row['globalStep'] == 241899 + row['stageUpdates']
            assert math.isclose(row['learningRateUsed'], config['peakLearningRate'] * expected_factor, rel_tol=1e-12)
            assert all(math.isfinite(row[key]) for key in ['loss', 'gradientNorm', 'learningRateUsed'])
        records.extend(rows)
        summaries.append(dict(path=str(path), rows=len(rows), firstUpdate=first, lastUpdate=last, meaning=label))
    runtime = load_runtime()
    base = torch.load(runtime.BASE, map_location='cpu', weights_only=False)
    assert all(float(value['step']) - float(base['optimizer']['state'][key]['step']) == updates for key, value in saved['optimizer']['state'].items())
    assert sum(value['exp_avg'].numel() for value in saved['optimizer']['state'].values()) == 1966910
    assert all(torch.isfinite(value).all() for value in saved['model'].values())
    assert all(torch.isfinite(value).all() for item in saved['optimizer']['state'].values() for value in item.values() if isinstance(value, torch.Tensor))
    model_digest = runtime.tensor_digest(saved['model'])
    exported_here = False
    if not (folder / 'final.bin').exists():
        assert budget_stop, '只对预算停止允许只读补导出'
        model = runtime.load_model()
        model.load_state_dict(saved['model'])
        model.export(folder / 'final')
        exported_here = True
    exported = runtime.load_model(folder / 'final')
    assert runtime.tensor_digest(exported.state_dict()) == model_digest
    binary_sha = legacy_contracts.file_sha(folder / 'final.bin')
    diagnostics = []
    candidates = [folder] + ([ARTIFACTS / 'lr-1e-4'] if arm == 'lr-1e-4' else [])
    matching_terminal = None
    for candidate in candidates:
        for point in [2500, 5000, 7500, 10000]:
            path = candidate / f'dev-{point}/RESULT.json'
            if path.exists():
                report = read(path)
                assert report['samples'] == 1299 and not report['finalTestEvaluated']
                if 'executionIdentity' in report:
                    assert report['executionIdentity'] == execution['frozenV2']
                else:
                    assert candidate == ARTIFACTS / 'lr-1e-4'
                diagnostics.append(dict(updates=point, result=str(path), modelSha256=report['modelSha256']))
                if report['modelSha256'] == binary_sha:
                    matching_terminal = str(path.parent)
    exposure = saved['sampler']['exposures']
    assert sum(value for key, value in exposure.items() if key.startswith('corpus/')) == samples
    return dict(passed=True, arm=arm, folder=str(folder), actualExitCode=exit_code, budgetStop=budget_stop,
                candidateFiniteAndQualifiedForFixedArena=True, updates=updates, samples=samples,
                full80k=samples == 80000, stopReason=saved['reason'], closure=closure, closedLedger=ledger,
                checkpoint=str(saved_path), checkpointSha256=digest, modelDigest=model_digest,
                optimizerDigest=runtime.tensor_digest(saved['optimizer']), samplerDigest=runtime.tensor_digest(saved['sampler']),
                binarySha256=binary_sha, metadataSha256=legacy_contracts.file_sha(folder / 'final.json'),
                metricsSegments=summaries, recordedMetricRows=len(records), knownMissingMetricUpdates=[7758] if arm == 'lr-1e-4' else [],
                clippingFraction=sum(r['gradientNorm'] > 1 for r in records) / max(1, len(records)),
                diagnostics=diagnostics, terminalOffline=matching_terminal, needsTerminalOffline=matching_terminal is None,
                readOnlyExportPerformed=exported_here, exportForwardCalls=0, auditOptimizerUpdates=0,
                exposure=exposure, finalTestPredictions=0)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arm', required=True)
    parser.add_argument('--folder', type=Path, required=True)
    parser.add_argument('--exit-code', type=int, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.arm, args.folder, args.exit_code)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps({key: result[key] for key in ['arm', 'passed', 'updates', 'samples', 'stopReason', 'recordedMetricRows', 'needsTerminalOffline']}))
