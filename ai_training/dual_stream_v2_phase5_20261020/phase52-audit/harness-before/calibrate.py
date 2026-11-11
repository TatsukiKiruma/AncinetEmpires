"""训练集拟合、固定开发集门禁；禁止使用实战结果或开发标签更新系数。"""
import argparse
import gzip
import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path
import torch
from data import DIR, load_model, batches, collate, forward_batch

spec = importlib.util.spec_from_file_location('historical_metrics', DIR.parent / 'dual_stream_v2_phase3_20261020/calibrate.py')
metrics_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metrics_module)
value_metrics = metrics_module.value_metrics


def save(p, data):
    p = Path(p); tmp = p.with_suffix(p.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8'); tmp.replace(p)


def collect(folder, split, gen):
    cache = folder / f'{split}-calibration.pt.gz'
    stamp = folder / f'{split}-calibration-identity.json'
    identity = None
    if gen > 0:
        files = [folder / 'model.bin', DIR / 'data.py', DIR / 'calibrate.py', DIR / 'stream.ts', DIR / 'evaluation-exclusions.txt.gz']
        identity = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    if cache.exists():
        if gen > 0:
            assert stamp.exists() and json.loads(stamp.read_text('utf-8')) == identity, '校准缓存身份变化，须先保全旧尝试，禁止混用'
        with gzip.open(cache, 'rb') as stream: return torch.load(stream, weights_only=False)
    if gen == 0:
        # 第0代网络权重逐字节继承，仅重用冻结网络输出；新增特征逐样本核对原军力和收入。
        d = torch.load(DIR.parent / f'dual_stream_v2_phase4_20261020/{split}-calibration.pt', weights_only=False)
        features = json.loads((DIR / f'{split}-features.json').read_text('utf-8'))
        for key in ['army', 'income', 'commander', 'actionable']:
            values = torch.tensor([features[s['id']][key] for s in d['sources']])
            if key in d:
                assert torch.equal(values, d[key]), f'冻结校准样本身份失配:{key}'
            d[key] = values
        with gzip.open(cache, 'wb', compresslevel=6) as stream: torch.save(d, stream)
        return d
    os.environ['LEAGUE_MODEL'] = str(folder / 'model')
    model = load_model('model').eval()
    fields = {k: [] for k in ['maximum', 'targetHead', 'weight', 'waste', 'recruit', 'valueLogits', 'target', 'active', 'bucket', 'army', 'income', 'commander', 'actionable']}
    sources, decode_groups = [], []
    with torch.no_grad():
        for samples in batches(split):
            x = collate(samples); out = forward_batch(model, x); scores = out['logits'].double().clone()
            for i, s in enumerate(samples):
                scores[i, :len(s['source']['prior'])] += torch.tensor(s['source']['prior'], dtype=torch.float64)
                # 保留actor:head组首次出现顺序，与TS解码器的相等分数规则一致。
                groups = {}
                for j in range(len(s['source']['prior'])):
                    actor, head = int(x['ptr'][i, j, 0]), int(x['ptr'][i, j, 2])
                    key = (actor, head)
                    groups[key] = max(groups.get(key, -float('inf')), float(scores[i, j]))
                decode_groups.append(dict(heads=torch.tensor([h for a, h in groups]), scores=torch.tensor(list(groups.values()), dtype=torch.float64), waste=torch.tensor([h == 4 and a in s['source']['wasteActors'] for a, h in groups])))
            heads = x['ptr'][:, :, 2]
            fields['maximum'].append(torch.stack([scores.masked_fill((heads != h) | ~x['actionMask'], -1e9).max(-1).values for h in range(15)], -1))
            fields['targetHead'].append(heads[torch.arange(len(samples)), x['target']])
            fields['weight'].append(x['weight'] * x['quality'])
            fields['waste'].append(torch.tensor([bool(s['source']['wasteActors']) for s in samples]))
            fields['recruit'].append(torch.tensor([s['source']['recruitOpportunity'] for s in samples]))
            vm = x['valueMask']; fields['valueLogits'].append(out['valueLogits'][vm]); fields['target'].append(x['valueTarget'][vm]); fields['active'].append(x['active'][vm])
            selected = [s['source'] for s, valid in zip(samples, vm) if valid]
            for key in ['bucket', 'army', 'income', 'commander', 'actionable']:
                fields[key].append(torch.tensor([s['valueFeatures'][key] for s in selected]).reshape((-1, 6) if key != 'bucket' else (-1,)))
            sources.extend(selected)
    d = {k: torch.cat(v) for k, v in fields.items()}; d['sources'] = sources; d['decodeGroups'] = decode_groups
    with gzip.open(cache, 'wb', compresslevel=6) as stream: torch.save(d, stream)
    if identity is not None: save(stamp, identity)
    return d


def probabilities(d, params, army_mix=0.):
    c = params[d['bucket'].long()]; active = d['active'].bool()
    army = d['army'].double().clamp_min(0) * active; income = d['income'].double().clamp_min(0) * active
    army /= army.sum(-1, keepdim=True).clamp_min(1e-12); income /= income.sum(-1, keepdim=True).clamp_min(1e-12)
    actions = d['actionable'].double(); actions = actions / actions.max(-1, keepdim=True).values.clamp_min(1)
    prior = c[:, 1:2] * army + c[:, 2:3] * income + c[:, 3:4] * d['commander'] + c[:, 4:5] * actions
    logits = d['valueLogits'].double() / c[:, :1].exp() + prior
    neural = logits.masked_fill(~active, -1e9).softmax(-1)
    prior = prior.masked_fill(~active, -1e9).softmax(-1)
    mix = c[:, 5:6].sigmoid()
    result = (1 - mix) * neural + mix * prior
    uniform = active.double() / active.sum(-1, keepdim=True).clamp_min(1)
    share = torch.where(army.sum(-1, keepdim=True) > 0, army, uniform)
    return ((1 - army_mix) * result + army_mix * share).float()


def evaluate(train, dev, parameters, army_mix=0.):
    active, target = dev['active'], dev['target']; uniform = active.float() / active.sum(-1, keepdim=True)
    prior = train['target'].sum(0); prior /= prior.sum(); seat = prior[None] * active; seat /= seat.sum(-1, keepdim=True)
    army = dev['army'].clamp_min(0) * active; army = torch.where(army.sum(-1, keepdim=True) > 0, army / army.sum(-1, keepdim=True).clamp_min(1e-12), uniform)
    probs = dict(model=probabilities(dev, parameters, army_mix), uniform=uniform, seatPrior=seat, armyShare=army)
    slices = dict(all=list(range(len(target))))
    for players in [2, 3, 4]:
        slices[f'{players}p/all'] = [i for i, s in enumerate(dev['sources']) if s['configuredPlayers'] == players]
        for phase, name in enumerate(['opening', 'middle', 'late']):
            slices[f'{players}p/{name}'] = [i for i, s in enumerate(dev['sources']) if s['configuredPlayers'] == players and int(dev['bucket'][i]) % 3 == phase]
    for phase, name in enumerate(['opening', 'middle', 'late']):
        slices[f'all/{name}'] = (dev['bucket'].long() % 3 == phase).nonzero().flatten().tolist()
    results = {}
    for name, indices in slices.items():
        ids = torch.tensor(indices, dtype=torch.long)
        results[name] = {k: value_metrics(p[ids], target[ids], active[ids], [dev['sources'][i] for i in indices]) for k, p in probs.items()}
        m = results[name]['model']
        results[name]['allBaselinesExceeded'] = bool(m.get('available')) and all(m['brier'] < b['brier'] and m['kl'] < b['kl'] and m['allianceTop1'] > b['allianceTop1'] and m['allianceRocAuc'] is not None and b['allianceRocAuc'] is not None and m['allianceRocAuc'] > b['allianceRocAuc'] for b in [results[name][k] for k in ['uniform', 'seatPrior', 'armyShare']])
    return results


def head_metrics(d, offset):
    best_heads, wasted = [], 0
    for row in d['decodeGroups']:
        best = int((row['scores'] + offset[row['heads']]).argmax())
        best_heads.append(int(row['heads'][best])); wasted += int(row['waste'][best])
    best = torch.tensor(best_heads)
    return dict(count=len(best), headTop1=float((best == d['targetHead']).double().mean()), endWithRecruit=int(((best == 13) & d['recruit']).sum()), waitWithAnyUnmovedOpportunity=wasted)


def choose_head_bias(anchor, candidate, before, after):
    bounded = bool(((candidate - anchor).abs() <= .25000001).all())
    accepted = bounded and after['headTop1'] >= before['headTop1'] and after['waitWithAnyUnmovedOpportunity'] <= before['waitWithAnyUnmovedOpportunity']
    return (candidate if accepted else anchor).clone(), accepted


def calibrate_heads(train, dev, folder):
    anchor = torch.tensor(json.loads((DIR / 'generations/gen_00/head-calibration.json').read_text('utf-8'))['headBias'], dtype=torch.float64)
    delta = torch.zeros(15, dtype=torch.float64, requires_grad=True)
    optimizer = torch.optim.Adam([delta], lr=.002)
    for _ in range(240):
        logits = train['maximum'].double() + anchor + delta
        loss = (torch.nn.functional.cross_entropy(logits, train['targetHead'], reduction='none') * train['weight']).sum() / train['weight'].sum() + .1 * delta.square().sum()
        optimizer.zero_grad(); loss.backward(); optimizer.step()
        with torch.no_grad(): delta.clamp_(-.25, .25)
    candidate = anchor + delta.detach()
    before, after = head_metrics(dev, anchor), head_metrics(dev, candidate)
    selected, accepted = choose_head_bias(anchor, candidate, before, after)
    bias = dict(headBias=selected.tolist(), anchorHeadBias=anchor.tolist(), attemptedHeadBias=candidate.tolist(), deltaLimit=.25, accepted=accepted, fallbackToChampion=not accepted, before=before, attempted=after, after=after if accepted else before, trainOnly=True, metricContract='decodeTacticalGroups-actor-head-stable-v1')
    save(folder / 'head-calibration.json', bias)


def main(gen):
    torch.set_num_threads(4); folder = DIR / f'generations/gen_{gen:02d}'
    os.environ['LEAGUE_GENERATION'] = str(gen)
    os.environ['LEAGUE_MODEL'] = str(folder / 'model')
    train, dev = collect(folder, 'train', gen), collect(folder, 'dev', gen)
    candidates = []
    # 预注册有界训练目标集合；开发只检查门禁，不能反传或逐样本记忆赢家。
    protocol = dict(rankWeights=[0, .5, 2, 8], balanced=[False, True], armyShareMix=[0., .05, .15], optimizer='LBFGS', maxIterations=220, trainOnly=True, battleSelection=False, headAnchor='gen_00', headDeltaLimit=.25)
    save(folder / 'calibration-protocol.json', protocol)
    for rank, balanced, army_mix in __import__('itertools').product(protocol['rankWeights'], protocol['balanced'], protocol['armyShareMix']):
            params = torch.zeros(9, 6, dtype=torch.float64, requires_grad=True)
            with torch.no_grad(): params[:, 5] = -3
            opt = torch.optim.LBFGS([params], max_iter=220, line_search_fn='strong_wolfe')
            def closure():
                opt.zero_grad(); p = probabilities(train, params, army_mix); logp = p.clamp_min(1e-30).log()
                per = -(train['target'] * logp).sum(-1) + (p - train['target']).square().mean(-1)
                positive = logp.masked_fill(train['target'] <= 0, -1e9).max(-1).values
                negative = logp.masked_fill((train['target'] > 0) | ~train['active'].bool(), -1e9).max(-1).values
                per = per + rank * torch.relu(.3 + negative - positive)
                loss = torch.stack([per[train['bucket'] == b].mean() for b in range(9) if (train['bucket'] == b).any()]).mean() if balanced else per.mean()
                loss = loss + .0001 * params.square().sum(); loss.backward(); return loss
            opt.step(closure)
            with torch.no_grad():
                params[:, 0].clamp_(-2, 3); params[:, 1:].clamp_(-20, 20)
            results = evaluate(train, dev, params.detach(), army_mix)
            nll = float(-(train['target'] * probabilities(train, params.detach(), army_mix).clamp_min(1e-30).log()).sum(-1).mean())
            candidate = dict(rankWeight=rank, balanced=balanced, armyShareMix=army_mix, trainNll=nll, passed=all(s['allBaselinesExceeded'] for s in results.values()), failedSlices=[n for n, s in results.items() if not s['allBaselinesExceeded']], slices=results, parameters=params.detach().tolist())
            candidates.append(candidate); print(json.dumps({k: candidate[k] for k in ['rankWeight', 'balanced', 'trainNll', 'passed', 'failedSlices']}), flush=True)
            save(folder / 'calibration-candidates.json', candidates)
    qualified = [c for c in candidates if c['passed']]
    best = min(qualified or candidates, key=lambda c: c['trainNll'])
    config = dict(buckets=[dict(temperature=float(torch.tensor(c[0], dtype=torch.float64).exp()), army=c[1], income=c[2], commander=c[3], actionable=c[4], mixture=float(torch.tensor(c[5], dtype=torch.float64).sigmoid()), armyShareMix=best['armyShareMix']) for c in best['parameters']])
    save(folder / 'value-config.json', config)
    save(folder / 'value-calibration.json', dict(passed=best['passed'], slices=best['slices'], config=config, trainOnly=True, trainValueSamples=len(train['target']), devValueSamples=len(dev['target']), selectionUsesBattleOutcomes=False))
    if gen == 0:
        bias = json.loads((DIR / 'head-calibration.json').read_text('utf-8'))
        save(folder / 'head-calibration.json', bias)
    else:
        calibrate_heads(train, dev, folder)
    print(json.dumps(dict(generation=gen, valueBaselines=best['passed'])), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--generation', type=int, default=0)
    main(parser.parse_args().generation)
