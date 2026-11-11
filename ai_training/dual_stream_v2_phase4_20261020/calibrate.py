"""冻结骨干的max动作校准及九桶价值校准；所有拟合仅使用train。"""
import json
import sys
from pathlib import Path
import torch
from data import DIR, batches, collate, forward_batch, load_model, save
sys.path.insert(0, str(DIR.parent / 'dual_stream_v2_phase3_20261020'))
from calibrate import value_metrics


def collect(split):
    cache = DIR / (split + '-calibration.pt')
    if cache.exists():
        return torch.load(cache, weights_only=False)
    model = load_model('dual-v2-stage4-pure').eval()
    fields = {k: [] for k in ['maximum', 'targetHead', 'weight', 'waste', 'recruit', 'valueLogits', 'target', 'active', 'bucket', 'army', 'income']}
    sources = []; total = 0
    with torch.no_grad():
        for samples in batches(split):
            x = collate(samples); out = forward_batch(model, x)
            scores = out['logits'].clone()
            for i, sample in enumerate(samples):
                scores[i, :len(sample['source']['prior'])] += torch.tensor(sample['source']['prior'])
            heads = x['ptr'][:, :, 2]
            maximum = torch.stack([scores.masked_fill((heads != h) | ~x['actionMask'], -1e9).max(-1).values for h in range(15)], -1)
            fields['maximum'].append(maximum)
            fields['targetHead'].append(heads[torch.arange(len(samples)), x['target']])
            fields['weight'].append(x['weight'] * x['quality'])
            fields['waste'].append(torch.tensor([bool(s['source']['wasteActors']) for s in samples]))
            fields['recruit'].append(torch.tensor([s['source']['recruitOpportunity'] for s in samples]))
            vm = x['valueMask']; fields['valueLogits'].append(out['valueLogits'][vm])
            fields['target'].append(x['valueTarget'][vm]); fields['active'].append(x['active'][vm])
            selected = [s['source'] for s, valid in zip(samples, vm) if valid]
            for key in ['bucket', 'army', 'income']:
                fields[key].append(torch.tensor([s['valueFeatures'][key] for s in selected]).reshape((-1, 6) if key != 'bucket' else (-1,)))
            sources.extend(selected); total += len(samples)
            if total % 3200 == 0:
                print(json.dumps(dict(split=split, collected=total)), flush=True)
    result = {k: torch.cat(v) for k, v in fields.items()}; result['sources'] = sources
    torch.save(result, cache)
    return result


def probabilities(data, parameters):
    c = parameters[data['bucket'].long()]
    active = data['active']; army = data['army'].clamp_min(0) * active; income = data['income'].clamp_min(0) * active
    army = army / army.sum(-1, keepdim=True).clamp_min(1e-12)
    income = income / income.sum(-1, keepdim=True).clamp_min(1e-12)
    logits = data['valueLogits'] / c[:, :1].exp() + c[:, 1:2] * army + c[:, 2:3] * income
    return logits.masked_fill(~active.bool(), -1e9).softmax(-1)


def main():
    torch.set_num_threads(4)
    rank_weight = float(sys.argv[1]) if len(sys.argv) > 1 else 0.
    balanced = len(sys.argv) > 2 and sys.argv[2] == 'balanced'
    train, dev = collect('train'), collect('dev')
    base_bias = load_model('dual-v2-stage4-pure').headBias.detach()
    delta = torch.zeros(15, requires_grad=True); opt = torch.optim.Adam([delta], lr=.025)
    for _ in range(240):
        # 实际max组解码与训练目标使用相同分数，不采用lse候选数加权。
        logits = train['maximum'] + delta
        ce = torch.nn.functional.cross_entropy(logits, train['targetHead'], reduction='none')
        prob = logits.softmax(-1)
        loss = (ce * train['weight']).sum() / train['weight'].sum() + 2 * (prob[:, 13] * train['recruit'] + prob[:, 4] * train['waste']).mean()
        opt.zero_grad(); loss.backward(); opt.step()
        with torch.no_grad():
            delta.clamp_(-4, 4)
            for h in [0, 1, 2, 5]: delta[h].clamp_(min=max(.05, .05 - float(base_bias[h])))
            for h in [4, 13]: delta[h].clamp_(max=min(-.05, -.05 - float(base_bias[h])))
    def head_metrics(d, bias):
        best = (d['maximum'] + bias).argmax(-1)
        return dict(count=len(best), headTop1=float((best == d['targetHead']).float().mean()), endWithRecruit=int(((best == 13) & d['recruit']).sum()), waitWithAnyUnmovedOpportunity=int(((best == 4) & d['waste']).sum()))
    save('head-calibration.json', dict(headBias=delta.tolist(), effectiveHeadBias=(base_bias + delta).tolist(), score='max+TacticalActionPrior', fitsTrainOnly=True, updates=240, wasteIncludesMove=True, before=head_metrics(dev, torch.zeros(15)), after=head_metrics(dev, delta), metricsScope='先应用战术先验；wait辅助项表示当前菜单存在未动机会，实战另核验同actor精确计数'))
    parameters = torch.zeros(9, 3, requires_grad=True)
    optimizer = torch.optim.LBFGS([parameters], max_iter=160, line_search_fn='strong_wolfe')
    def closure():
        optimizer.zero_grad(); p = probabilities(train, parameters)
        logp = p.clamp_min(1e-30).log()
        per = -(train['target'] * logp).sum(-1) + (p - train['target']).square().sum(-1)
        positive = logp.masked_fill(train['target'] <= 0, -1e9).max(-1).values
        negative = logp.masked_fill((train['target'] > 0) | ~train['active'].bool(), -1e9).max(-1).values
        per = per + rank_weight * torch.relu(1 + negative - positive)
        if balanced:
            loss = torch.stack([per[train['bucket'] == bucket].mean() for bucket in range(9) if (train['bucket'] == bucket).any()]).mean()
        else: loss = per.mean()
        loss = loss + .0001 * parameters.square().sum()
        loss.backward(); return loss
    optimizer.step(closure)
    config = dict(buckets=[dict(temperature=float(c[0].exp()), army=float(c[1]), income=float(c[2])) for c in parameters.detach()])
    save('value-config.json', config)
    active, target = dev['active'], dev['target']; uniform = active.float() / active.sum(-1, keepdim=True)
    prior = train['target'].sum(0); prior /= prior.sum(); seat = prior[None] * active; seat /= seat.sum(-1, keepdim=True)
    army = dev['army'].clamp_min(0) * active; army = torch.where(army.sum(-1, keepdim=True) > 0, army / army.sum(-1, keepdim=True).clamp_min(1e-12), uniform)
    probs = dict(model=probabilities(dev, parameters.detach()), uniform=uniform, seatPrior=seat, armyShare=army)
    slices = dict(all=list(range(len(target))))
    for players in [2, 3, 4]:
        slices[f'{players}p/all'] = [i for i, s in enumerate(dev['sources']) if s['configuredPlayers'] == players]
        for phase in range(3):
            slices[f'{players}p/' + ['opening', 'middle', 'late'][phase]] = [i for i, s in enumerate(dev['sources']) if s['configuredPlayers'] == players and int(dev['bucket'][i]) % 3 == phase]
    for phase in range(3): slices['all/' + ['opening', 'middle', 'late'][phase]] = (dev['bucket'].long() % 3 == phase).nonzero().flatten().tolist()
    results = {}
    for name, indices in slices.items():
        ids = torch.tensor(indices, dtype=torch.long)
        results[name] = {k: value_metrics(p[ids], target[ids], active[ids], [dev['sources'][i] for i in indices]) for k, p in probs.items()}
        m = results[name]['model']
        results[name]['allBaselinesExceeded'] = bool(m.get('available')) and all(m['brier'] < b['brier'] and m['kl'] < b['kl'] and m['allianceTop1'] > b['allianceTop1'] and m['allianceRocAuc'] is not None and b['allianceRocAuc'] is not None and m['allianceRocAuc'] > b['allianceRocAuc'] for b in [results[name][k] for k in ['uniform', 'seatPrior', 'armyShare']])
    save('value-calibration.json', dict(passed=all(s['allBaselinesExceeded'] for s in results.values()), slices=results, config=config, trainOnly=True, rankWeight=rank_weight, bucketBalanced=balanced, trainValueSamples=len(train['target']), devValueSamples=len(target), selectionUsesBattleOutcomes=False))
    save('calibration-complete.json', dict(completed=True, valueBaselines=all(s['allBaselinesExceeded'] for s in results.values())))
    print(json.dumps(dict(completed=True, valueBaselines=all(s['allBaselinesExceeded'] for s in results.values()))), flush=True)


if __name__ == '__main__': main()
