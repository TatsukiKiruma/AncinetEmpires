"""只读汇总已完成试训、固定开发预测及唯一40局；不执行前向或训练。"""
import argparse
from collections import Counter
import csv
import json
from pathlib import Path

from compare_offline import METRICS, STAGE1, file_sha, read_rows, strata

HERE = Path(__file__).resolve().parent
ARMS = ['lr-1e-4', 'lr-5e-5', 'lr-2.4495e-4']
IDENTITY = ['parentId', 'corpus', 'split', 'groupId', 'players', 'category', 'source',
            'map', 'macro', 'subAction', 'phase', 'before', 'code', 'candidates', 'terrainTrust']


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


def identities(rows):
    return sorted(tuple(row[key] for key in IDENTITY) for row in rows)


def offline_comparison(folder, baseline, baseline_identity, execution):
    report = read(folder / 'RESULT.json')
    assert report['samples'] == 1299 and not report['finalTestEvaluated']
    assert report.get('executionIdentity', execution) == execution
    rows = read_rows(folder / 'samples.jsonl')
    assert identities(rows) == baseline_identity
    comparisons = {}
    for key, item in strata(rows).items():
        base = baseline[key]
        assert (item['parents'], item['samples']) == (base['parents'], base['samples'])
        b, c = base['parentEqual'], item['parentEqual']
        comparisons[key] = dict(parents=item['parents'], samples=item['samples'], baseline=b, candidate=c,
                                delta={k: c[k] - b[k] for k in METRICS},
                                relativeNllChange=c['policyNll'] / b['policyNll'] - 1,
                                baselineEce=base['eceSampleWeighted'], candidateEce=item['eceSampleWeighted'],
                                baselineCalibration=base['calibrationBins'], candidateCalibration=item['calibrationBins'])
    return dict(folder=str(folder), resultSha256=file_sha(folder / 'RESULT.json'),
                modelSha256=report['modelSha256'], comparisons=comparisons)


def summarize(require_complete=False):
    baseline_rows = read_rows(STAGE1 / 'offline-baseline/samples.jsonl')
    baseline, baseline_identity = strata(baseline_rows), identities(baseline_rows)
    arms, snapshots, missing = [], [], []
    for arm in ARMS:
        audit_path = HERE / f'FINAL_AUDIT-{arm}.json'
        if not audit_path.exists():
            missing.append(arm)
            continue
        audit = read(audit_path)
        assert audit['passed'] and audit['candidateFiniteAndQualifiedForFixedArena']
        folder = Path(audit['folder'])
        execution = audit['closure']['executionIdentity']['frozenV2']
        terminal = Path(audit['terminalOffline']) if audit['terminalOffline'] else folder / 'terminal-dev'
        if not (terminal / 'RESULT.json').exists() or not (HERE / f'ARENA-{arm}.json').exists():
            missing.append(arm)
            continue
        current = offline_comparison(terminal, baseline, baseline_identity, execution)
        assert current['modelSha256'] == audit['binarySha256']
        for point in audit['diagnostics']:
            saved = offline_comparison(Path(point['result']).parent, baseline, baseline_identity, execution)
            snapshots.append(dict(arm=arm, updates=point['updates'], samples=point['updates'] * 8, **saved))
        comparison = read(HERE / f'COMPARE-{arm}.json')
        arena_audit = read(HERE / f'ARENA-{arm}.json')
        arena = read(folder / 'arena/SUMMARY.json')
        assert arena_audit['passed'] and comparison['executionIdentity'] == execution
        assert arena['attempted'] == 40 and len(arena['games']) == 40
        outcome = {opponent: dict(Counter(g['classification'] for g in arena['games'] if g['opponent'] == opponent))
                   for opponent in ['hard', 'simple']}
        score = {opponent: values.get('natural_win', 0) + .5 * values.get('natural_draw', 0)
                 for opponent, values in outcome.items()}
        old, new = current['comparisons']['old/dev'], current['comparisons']['new/dev']
        old_gate = old['relativeNllChange'] <= .05 and old['delta']['brier'] <= .02
        new_gate = (new['relativeNllChange'] <= -.02 or new['delta']['brier'] <= -.01) and new['relativeNllChange'] <= .05 and new['delta']['brier'] <= .02
        arena_gate = comparison['completeNaturalPanel'] and score['hard'] >= 10 and score['simple'] >= 15 and sum(score.values()) >= 26
        gates = dict(identityAndFinite=True, oldRetention=old_gate, newAdaptation=new_gate,
                     completeNatural40=comparison['completeNaturalPanel'], arena=arena_gate)
        records = []
        for segment in audit['metricsSegments']:
            records.extend(json.loads(line) for line in Path(segment['path']).read_text('utf-8').splitlines() if line)
        rates = [row['learningRateUsed'] for row in records]
        rate_curve = [{k: row[k] for k in ['stageUpdates', 'samples', 'learningRateUsed', 'nextLearningRate']}
                      for row in records if row['stageUpdates'] == 1 or row['stageUpdates'] % 100 == 0]
        arms.append(dict(arm=arm, peakLearningRate=read(STAGE1 / f'stage2-configs/{arm}.json')['peakLearningRate'],
                         audit=str(audit_path), auditSha256=file_sha(audit_path), updates=audit['updates'], samples=audit['samples'],
                         full80k=audit['full80k'], stopReason=audit['stopReason'], actualExitCode=audit['actualExitCode'],
                         wallChargedSeconds=audit['closedLedger']['consumedWallSeconds'],
                         samplerDigest=audit['samplerDigest'], exposure=audit['exposure'],
                         modelSha256=audit['binarySha256'], checkpointSha256=audit['checkpointSha256'],
                         controlIdentity=audit['closure']['executionIdentity'],
                         recordedMetricRows=audit['recordedMetricRows'], missingMetricUpdates=audit['knownMissingMetricUpdates'],
                         clippingFraction=audit['clippingFraction'], actualLearningRate=dict(first=rates[0], last=rates[-1], minimum=min(rates), maximum=max(rates), curveEvery100=rate_curve),
                         terminalOffline=current, outcomes=outcome, score=score, arenaDetails=arena_audit['opponents'],
                         pairedComparison=comparison, gates=gates, qualified=all(gates.values())))
    if require_complete:
        assert not missing and len(arms) == 3, f'三臂证据未齐：{missing}'
    full = [arm for arm in arms if arm['full80k']]
    same_sampler = len({arm['samplerDigest'] for arm in full}) <= 1
    assert same_sampler, '同预算三臂的抽样状态不一致，不能声称受控比较'
    return dict(schema='continuation-stage2-trial-comparison-v1', experimentsComplete=not missing and len(arms) == 3,
                missingArms=missing, arms=arms, snapshots=snapshots,
                fullBudgetArms=[arm['arm'] for arm in full], sameFullBudgetSamplerState=same_sampler,
                qualifiedArms=[arm['arm'] for arm in arms if arm['qualified']],
                additionalForwardCalls=0, additionalOptimizerUpdates=0, additionalArenaGames=0,
                finalTestEvaluated=False, scope='父局等权离线开发诊断与固定双人40局筛选；多人仅离线，不代表未知图泛化或统计显著提升。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-complete', action='store_true')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = summarize(args.require_complete)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    with args.out.with_suffix('.csv').open('w', newline='', encoding='utf-8-sig') as file:
        writer = csv.writer(file)
        writer.writerow(['学习率臂', '更新', '样本', '分层', '父局', '基线NLL', '候选NLL', 'NLL相对变化', '基线Brier', '候选Brier', 'Brier变化'])
        for snapshot in result['snapshots']:
            for key, item in snapshot['comparisons'].items():
                writer.writerow([snapshot['arm'], snapshot['updates'], snapshot['samples'], key, item['parents'],
                                 item['baseline']['policyNll'], item['candidate']['policyNll'], item['relativeNllChange'],
                                 item['baseline']['brier'], item['candidate']['brier'], item['delta']['brier']])
    print(json.dumps(dict(complete=result['experimentsComplete'], qualifiedArms=result['qualifiedArms'], arms=len(result['arms']))))
