"""仅使用训练/固定开发样本的动作族和价值校准，不读取实战结果。"""
import json
import hashlib
import sys
import time
import numpy as np
import torch
from train import DIR, batches, collate, forward_batch, load_model, save


def collect(model, split):
    fields = {k: [] for k in ['lse', 'maximum', 'indices', 'targetLogit', 'targetHead', 'targetMax', 'weight', 'recruit', 'attack', 'waste', 'valueLogits', 'valueTarget', 'active', 'army']}
    sources = []; count = 0; start = time.perf_counter()
    with torch.no_grad():
        for samples in batches(split, 0):
            x = collate(samples); out = forward_batch(model, x)
            heads = x['ptr'][:, :, 2]; a = out['logits'].shape[1]
            lse = torch.full((len(samples), 15), -1e9)
            maximum = torch.full_like(lse, -1e9)
            indices = torch.zeros((len(samples), 15), dtype=torch.long)
            for h in range(15):
                logits = out['logits'].masked_fill((heads != h) | ~x['actionMask'], -1e9)
                lse[:, h] = logits.logsumexp(-1)
                maximum[:, h], indices[:, h] = logits.max(-1)
            rows = torch.arange(len(samples)); th = heads[rows, x['target']]
            fields['lse'].append(lse); fields['maximum'].append(maximum)
            fields['indices'].append(indices); fields['targetLogit'].append(out['logits'][rows, x['target']])
            fields['targetHead'].append(th)
            fields['targetMax'].append(indices[rows, th] == x['target'])
            fields['weight'].append(x['weight'] * x['quality'])
            fields['recruit'].append(torch.tensor([s['source']['recruitOpportunity'] for s in samples]))
            fields['attack'].append(torch.tensor([s['source']['attackOpportunity'] for s in samples]))
            fields['waste'].append(torch.tensor([int(x['ptr'][i, indices[i, 4], 0]) in s['source']['wasteActors'] for i, s in enumerate(samples)]))
            for key in ['valueLogits']:
                fields[key].append(out[key][x['valueMask']])
            for key in ['valueTarget', 'active']:
                fields[key].append(x[key][x['valueMask']])
            fields['army'].append(x['players'][:, :, 7][x['valueMask']])
            sources.extend(s['source'] for s, mask in zip(samples, x['valueMask']) if mask)
            count += len(samples)
            if count % 3200 == 0:
                print(json.dumps(dict(calibrationCollect=split, samples=count, seconds=round(time.perf_counter() - start, 2))), flush=True)
    return {**{k: torch.cat(v) for k, v in fields.items()}, 'sources': sources}


def policy_metrics(data, delta):
    scores = data['maximum'] + delta
    best = data['indices'].masked_fill(scores != scores.max(-1, keepdim=True).values, 1000000000).argmin(-1)
    correct = (best == data['targetHead']) & data['targetMax']
    recruit = data['recruit']; attack = data['attack']; waste = data['waste']
    nll = ((data['lse'] + delta).logsumexp(-1) - data['targetLogit'] - delta[data['targetHead']])
    return dict(count=len(best), correct=correct.sum().item(), top1=correct.float().mean().item(), policyNll=(nll * data['weight']).sum().item() / data['weight'].sum().item(),
                missedRecruit=((best == 13) & recruit).sum().item(), recruitOpportunity=recruit.sum().item(),
                wastedWait=((best == 4) & waste).sum().item(), wasteWaitOpportunity=waste.sum().item(),
                attackTaken=((best == 1) & attack).sum().item(), attackOpportunity=attack.sum().item(),
                attackRate=((best == 1) & attack).sum().item() / max(1, attack.sum().item()))


def learn_bias(train, coefficient):
    delta = torch.zeros(15, requires_grad=True)
    optimizer = torch.optim.Adam([delta], lr=.03)
    w = train['weight']; rows = torch.arange(len(w))
    for step in range(120):
        logits = train['lse'] + delta
        loss = ((logits.logsumexp(-1) - delta[train['targetHead']]) * w).sum() / w.sum()
        prob = logits.softmax(-1)
        aux = prob[:, 13] * train['recruit'] + prob[:, 4] * train['waste']
        loss = loss + coefficient * (aux * w).sum() / w.sum()
        optimizer.zero_grad(); loss.backward(); optimizer.step()
        with torch.no_grad():
            delta -= delta.mean(); delta.clamp_(-3, 3); delta[12] = 0
    return delta.detach()


def gate_criteria(before, result):
    return dict(recruitReduction20=before['missedRecruit'] > 0 and result['missedRecruit'] <= .8 * before['missedRecruit'],
                wastedWaitReduction10=before['wastedWait'] > 0 and result['wastedWait'] <= .9 * before['wastedWait'],
                attackNotRegressed=result['attackRate'] >= before['attackRate'],
                top1DropWithin1Point=result['top1'] >= before['top1'] - .01)


def auc(labels, scores):
    labels = np.asarray(labels, dtype=bool); scores = np.asarray(scores)
    pos, neg = int(labels.sum()), int((~labels).sum())
    if not pos or not neg:
        return None
    order = np.argsort(scores, kind='stable'); sorted_scores = scores[order]
    ranks = np.empty(len(scores), dtype=float)
    first = 0
    while first < len(scores):
        end = first + 1
        while end < len(scores) and sorted_scores[end] == sorted_scores[first]:
            end += 1
        ranks[order[first:end]] = (first + 1 + end) / 2
        first = end
    return float((ranks[labels].sum() - pos * (pos + 1) / 2) / (pos * neg))


def value_metrics(prob, target, active, sources):
    if not len(target):
        return dict(count=0, available=False)
    target_entropy = -(target * target.clamp_min(1e-30).log()).sum(-1)
    ce = -(target * prob.clamp_min(1e-30).log()).sum(-1)
    correct = []; labels = []; scores = []
    for p, t, mask, source in zip(prob.numpy(), target.numpy(), active.numpy(), sources):
        alliances = source['alliances']; aggregates = {}
        winners = {alliances[i] for i in range(6) if t[i] > 0}
        for i in range(6):
            if mask[i]:
                aggregates[alliances[i]] = aggregates.get(alliances[i], 0.) + float(p[i])
        correct.append(max(aggregates, key=aggregates.get) in winners)
        for alliance, score in aggregates.items():
            labels.append(alliance in winners); scores.append(score)
    return dict(count=len(target), available=True, brier=(prob - target).square().mean().item(),
                logLoss=ce.mean().item(), kl=(ce - target_entropy).mean().item(),
                allianceTop1=sum(correct) / len(correct), allianceRocAuc=auc(labels, scores))


def main():
    torch.set_num_threads(4); model = load_model('stage3a-best').eval()
    save('calibration-source-identities.json', dict(calibrationSourceSha256=hashlib.sha256((DIR / 'calibrate.py').read_bytes()).hexdigest(), planSha256=hashlib.sha256((DIR / 'PLAN.md').read_bytes()).hexdigest(), stage3aWeightsSha256=hashlib.sha256((DIR / 'stage3a-best.bin').read_bytes()).hexdigest(), selectionUsesBattleOutcomes=False))
    frozen = {k: hashlib.sha256(v.detach().numpy().tobytes()).hexdigest() for k, v in model.state_dict().items()}
    train = collect(model, 'train'); dev = collect(model, 'dev')
    dev_identity = json.loads((DIR / 'stream-receipts/dev-epoch0.json').read_text('utf-8'))['aggregateSha256']
    zero = torch.zeros(15); before = policy_metrics(dev, zero); attempts = []
    selected = None; best = float('inf')
    candidates = [(f'train-aux-{c}', learn_bias(train, c)) for c in [0., .05, .1, .2, .5, 1., 2.]]
    base = candidates[0][1]
    # 预注册的关键语义小网格，仅改变15维bias；开发集决定是否满足联合门禁。
    for end_shift in [0., -.25, -.5, -1., -2.]:
        for wait_shift in [0., -.25, -.5, -1., -2.]:
            for attack_shift in [0., .25]:
                for recruit_shift in [0., .25, .5]:
                    delta = base.clone()
                    delta[13] += end_shift; delta[4] += wait_shift
                    delta[1] += attack_shift; delta[5] += recruit_shift
                    candidates.append((f'grid-e{end_shift}-w{wait_shift}-a{attack_shift}-r{recruit_shift}', delta))
    for candidate, delta in candidates:
        result = policy_metrics(dev, delta)
        criteria = gate_criteria(before, result)
        objective = result['policyNll']
        attempts.append(dict(candidate=candidate, delta=delta.tolist(), metrics=result, criteria=criteria, allPassed=all(criteria.values()), selectionObjective=objective))
        if all(criteria.values()) and objective < best:
            selected = delta; best = objective
    if selected is not None:
        with torch.no_grad():
            model.headBias += selected
    else:
        selected = zero
    after = policy_metrics(dev, selected)
    save('head-calibration.json', dict(passed=any(a['allPassed'] for a in attempts), before=before, after=after, attempts=attempts, selectedDelta=selected.tolist(), optimizer='Adam', trainingBiasFits=7, stepsPerFit=120, totalBiasOptimizerUpdates=840, targetHeadCounts=torch.bincount(train['targetHead'], minlength=15).tolist(), legalHeadSupport=(train['lse'] > -1e8).sum(0).tolist(), selectedUsing='固定开发集门禁与NLL；未读取实战结果'))
    target, active = dev['valueTarget'], dev['active']
    temperatures = []
    for temperature in [.5, .75, 1., 1.25, 1.5, 2.]:
        p = (dev['valueLogits'] / temperature).softmax(-1) * active
        temperatures.append(dict(temperature=temperature, metrics=value_metrics(p, target, active, dev['sources'])))
    selected_temp = min(temperatures, key=lambda t: t['metrics']['kl'])['temperature']
    with torch.no_grad():
        model.value2.weight /= selected_temp
        model.value2.bias /= selected_temp
        model.army_scale /= selected_temp
    model.export(DIR / 'dual-v2-stage3-pure')
    changed = [k for k, v in model.state_dict().items() if hashlib.sha256(v.detach().numpy().tobytes()).hexdigest() != frozen[k]]
    assert set(changed) <= {'headBias', 'value2.weight', 'value2.bias', 'army_scale'}
    save('calibration-freeze-audit.json', dict(passed=True, changedTensors=changed, headBiasLength=len(model.headBias), modelParameters=sum(p.numel() for p in model.parameters()), frozenBackboneUnchanged=True))
    # 对最终float32权重重新前向整个固定开发集，门禁不用bias加法的代数近似冒充实测。
    actual = collect(model, 'dev')
    assert json.loads((DIR / 'stream-receipts/dev-epoch0.json').read_text('utf-8'))['aggregateSha256'] == dev_identity
    assert torch.equal(actual['valueTarget'], dev['valueTarget']) and torch.equal(actual['targetHead'], dev['targetHead'])
    actual_after = policy_metrics(actual, zero)
    actual_criteria = gate_criteria(before, actual_after)
    head_receipt = json.loads((DIR / 'head-calibration.json').read_text('utf-8'))
    head_receipt.update(after=actual_after, predictedAfter=after, finalWeightsReevaluated=True, finalCriteria=actual_criteria,
                        developmentInputSha256=dev_identity, passed=any(a['allPassed'] for a in attempts) and all(actual_criteria.values()))
    save('head-calibration.json', head_receipt)
    prior = train['valueTarget'].sum(0)
    prior /= prior.sum().clamp_min(1e-30)
    uniform = active.float() / active.sum(-1, keepdim=True).clamp_min(1)
    slot_prior = prior[None] * active; slot_prior /= slot_prior.sum(-1, keepdim=True).clamp_min(1e-30)
    army = dev['army'].clamp_min(0) * active
    army = torch.where((army.sum(-1) > 0)[:, None], army / army.sum(-1, keepdim=True).clamp_min(1e-30), uniform)
    probabilities = dict(model=actual['valueLogits'].softmax(-1) * active, uniform=uniform, seatPrior=slot_prior, armyShare=army)
    slices = dict(all=list(range(len(target))))
    for phase in ['opening', 'middle', 'late']:
        slices[f'all/{phase}'] = [i for i, s in enumerate(dev['sources']) if ('opening' if s['turn'] <= 5 else 'middle' if s['turn'] <= 15 else 'late') == phase]
    for players in [2, 3, 4]:
        slices[f'{players}p/all'] = [i for i, s in enumerate(dev['sources']) if s['configuredPlayers'] == players]
        for phase in ['opening', 'middle', 'late']:
            slices[f'{players}p/{phase}'] = [i for i, s in enumerate(dev['sources']) if s['configuredPlayers'] == players and ('opening' if s['turn'] <= 5 else 'middle' if s['turn'] <= 15 else 'late') == phase]
    results = {}
    for name, indices in slices.items():
        ids = torch.tensor(indices, dtype=torch.long)
        results[name] = {k: value_metrics(p[ids], target[ids], active[ids], [dev['sources'][i] for i in indices]) for k, p in probabilities.items()}
        m = results[name]['model']
        results[name]['allBaselinesExceeded'] = bool(m.get('available')) and all(m['brier'] < results[name][k]['brier'] and m['kl'] < results[name][k]['kl'] and m['allianceTop1'] > results[name][k]['allianceTop1'] and m['allianceRocAuc'] is not None and results[name][k]['allianceRocAuc'] is not None and m['allianceRocAuc'] > results[name][k]['allianceRocAuc'] for k in ['uniform', 'seatPrior', 'armyShare'])
    save('value-calibration.json', dict(passed=all(r['allBaselinesExceeded'] for r in results.values()), finalWeightsReevaluated=True, developmentInputSha256=dev_identity, selectedTemperature=selected_temp, temperatures=temperatures, trainSeatPrior=prior.tolist(), slices=results, brierConvention='6槽均方误差；联盟概率合并后计算排序Top1和ROC-AUC；KL扣除目标熵'))
    save('calibration-complete.json', dict(completed=True, model='dual-v2-stage3-pure', headGate=head_receipt['passed'], valueGate=all(r['allBaselinesExceeded'] for r in results.values()), finalWeightsReevaluated=True))


if __name__ == '__main__':
    main()
