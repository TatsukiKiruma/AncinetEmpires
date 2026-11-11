"""汇总固定两seed准入；复用预测及对局记录，不执行额外推理。"""
from collections import Counter, defaultdict
import csv
import json
from pathlib import Path
import random

from compare_offline import METRICS, STAGE1, file_sha, identity, read_rows, strata

HERE = Path(__file__).resolve().parent
SCORE = {'natural_win': 1., 'natural_draw': .5, 'natural_loss': 0.}


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


def offline(folder, baseline, baseline_ids, execution):
    report = read(folder / 'RESULT.json')
    assert report['samples'] == 1299 and not report['finalTestEvaluated'] and report['executionIdentity'] == execution
    rows = read_rows(folder / 'samples.jsonl')
    assert sorted(identity(row) for row in rows) == baseline_ids
    output = {}
    for key, candidate in strata(rows).items():
        base = baseline[key]
        assert (base['parents'], base['samples']) == (candidate['parents'], candidate['samples'])
        b, c = base['parentEqual'], candidate['parentEqual']
        output[key] = dict(parents=candidate['parents'], samples=candidate['samples'], baseline=b, candidate=c,
                           delta={m: c[m] - b[m] for m in METRICS}, relativeNllChange=c['policyNll'] / b['policyNll'] - 1,
                           baselineEce=base['eceSampleWeighted'], candidateEce=candidate['eceSampleWeighted'],
                           baselineCalibration=base['calibrationBins'], candidateCalibration=candidate['calibrationBins'])
    return dict(result=str(folder / 'RESULT.json'), modelSha256=report['modelSha256'], comparisons=output)


if __name__ == '__main__':
    audit = read(HERE / 'REPLICATION_FINAL_AUDIT.json')
    assert audit['passed'] and audit['full80k']
    original = read(HERE / 'revisions/submission-6/TRIAL_COMPARISON.json')
    first = next(arm for arm in original['arms'] if arm['arm'] == 'lr-1e-4')
    assert first['score'] == dict(hard=10., simple=15.) and not first['qualified']
    folder = Path(audit['folder'])
    base_rows = read_rows(STAGE1 / 'offline-baseline/samples.jsonl')
    baseline, ids = strata(base_rows), sorted(identity(row) for row in base_rows)
    snapshots = [dict(updates=item['updates'], **offline(Path(item['result']).parent, baseline, ids, audit['executionIdentity']['frozenV2'])) for item in audit['diagnostics']]
    terminal = snapshots[-1]
    assert terminal['modelSha256'] == audit['binarySha256']
    old, new = terminal['comparisons']['old/dev'], terminal['comparisons']['new/dev']
    old_gate = old['relativeNllChange'] <= .05 and old['delta']['brier'] <= .02
    new_gate = (new['relativeNllChange'] <= -.02 or new['delta']['brier'] <= -.01) and new['relativeNllChange'] <= .05 and new['delta']['brier'] <= .02
    arena = read(folder / 'arena/SUMMARY.json')
    paired = read(HERE / 'REPLICATION_COMPARE.json')
    arena_audit = read(HERE / 'REPLICATION_ARENA.json')
    assert arena['attempted'] == 40 and arena_audit['passed']
    assert paired['executionIdentity'] == audit['executionIdentity']['frozenV2']
    outcomes = {opponent: dict(Counter(g['classification'] for g in arena['games'] if g['opponent'] == opponent)) for opponent in ['hard', 'simple']}
    scores = {opponent: sum(SCORE.get(g['classification'], 0) for g in arena['games'] if g['opponent'] == opponent) for opponent in ['hard', 'simple']}
    endpoint_gate = paired['completeNaturalPanel'] and scores['hard'] >= 10 and scores['simple'] >= 15 and sum(scores.values()) >= 26
    means = {opponent: (first['score'][opponent] + scores[opponent]) / 2 for opponent in ['hard', 'simple']}
    mean_gate = means['hard'] >= 10 and means['simple'] >= 15 and sum(means.values()) >= 26
    both_offline = first['gates']['oldRetention'] and first['gates']['newAdaptation'] and old_gate and new_gate
    admitted = bool(both_offline and endpoint_gate and mean_gate)

    baseline_games = {g['id']: g for g in read(STAGE1 / 'arena-baseline-r2/SUMMARY.json')['games']}
    first_folder = Path(read(first['audit'])['folder']) / 'arena'
    first_games = {g['id']: g for g in read(first_folder / 'SUMMARY.json')['games']}
    candidate_games = {g['id']: g for g in arena['games']}
    assert baseline_games.keys() == first_games.keys() == candidate_games.keys()
    combined = {}
    for opponent in ['hard', 'simple']:
        slots = defaultdict(list)
        changes = []
        for game_id, candidate in candidate_games.items():
            if candidate['opponent'] != opponent:
                continue
            base_game, first_game = baseline_games[game_id], first_games[game_id]
            natural = all(g['classification'] in SCORE for g in [base_game, first_game, candidate])
            average = (SCORE[first_game['classification']] + SCORE[candidate['classification']]) / 2 if natural else None
            delta = average - SCORE[base_game['classification']] if natural else None
            changes.append(dict(id=game_id, map=candidate['map'], category=candidate['category'], actualHand=candidate['actualHand'],
                                baseline=base_game['classification'], seed20261030=first_game['classification'],
                                seed20261031=candidate['classification'], meanCandidateScore=average, scoreChange=delta))
            if natural:
                slots[candidate['slot']].append(delta)
        complete = len(slots) == 10 and all(len(values) == 2 for values in slots.values())
        slot_means = [sum(values) / len(values) for values in slots.values()]
        rng = random.Random(20261030)
        bootstrap = sorted(sum(rng.choice(slot_means) for _ in slot_means) / len(slot_means) for _ in range(10000)) if complete else []
        combined[opponent] = dict(changes=changes, uniqueGameIds=20, uniqueInitialSlots=10, trainingSamplerSeeds=2,
                                  scoreChange=sum(slot_means) / 10 if complete else None,
                                  clusterBootstrap95=[bootstrap[250], bootstrap[9749]] if complete else None,
                                  completeNaturalPanel=complete, independent80InitialsClaimed=False)
    result = dict(schema='stage2-predeclared-two-seed-replication-result-v1',
                  originalThreeArmVerdictsUnchanged=True, firstSeed=dict(seed=20261030, score=first['score'], totalScore=25, originalQualified=False),
                  replication=dict(seed=20261031, score=scores, totalScore=sum(scores.values()), outcomes=outcomes,
                                   oldRetention=old_gate, newAdaptation=new_gate, endpointGate=endpoint_gate),
                  meanPer40=dict(scores=means, totalScore=sum(means.values()), consistencyGate=mean_gate),
                  bothSeedsOffline=both_offline, admittedForStage3Proposal=admitted,
                  decision='限定复验通过，仅提交配置提案待审' if admitted else '限定复验未通过预登记双seed要求，第三阶段预算0',
                  requiredNewSeedTotalScore=27, requiredNewSeedHardScore=10, requiredNewSeedSimpleScore=15,
                  combinedPaired=combined, replicationPaired=paired, arenaDetails=arena_audit['opponents'],
                  snapshots=snapshots, terminalOffline=terminal, audit='stage2/REPLICATION_FINAL_AUDIT.json',
                  executionIdentity=audit['executionIdentity'], additionalForwardCalls=0, additionalGames=0,
                  finalTestEvaluated=False, stage3Started=False,
                  caveat='仅抽样seed改变，非独立模型初始化。两seed复用10个开局槽，80条记录不等于80独立初态；不能宣称显著提升或更像人类。')
    (HERE / 'REPLICATION_RESULT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    with (HERE / 'REPLICATION_OFFLINE_COMPARISON.csv').open('w', newline='', encoding='utf-8-sig') as stream:
        writer = csv.writer(stream)
        writer.writerow(['更新', '分层', '父局', '状态', '基线NLL', '复验NLL', 'NLL相对变化', '基线Brier', '复验Brier', 'Brier变化'])
        for snapshot in snapshots:
            for key, item in snapshot['comparisons'].items():
                writer.writerow([snapshot['updates'], key, item['parents'], item['samples'], item['baseline']['policyNll'], item['candidate']['policyNll'], item['relativeNllChange'], item['baseline']['brier'], item['candidate']['brier'], item['delta']['brier']])
    print(json.dumps(dict(admittedForStage3Proposal=admitted, replicationScore=scores, twoSeedMean=means)))
