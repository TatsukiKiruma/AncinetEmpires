"""训练分区拟合九桶态势校准；基座权重不变，开发集仅报告。"""
import gzip
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from write_budget import reserve

DATA = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')


def load(cache, feature=None, split='train'):
    values, active, target, features, players, boundary = [], [], [], [], [], []
    for file in sorted((DATA / cache).glob('*.npz')):
        with np.load(file, allow_pickle=False) as data:
            sources = json.loads(str(data['sources']))
            if any(s['split'] != split for s in sources):
                raise ValueError('数据分区错误')
            if feature:
                side = json.loads(gzip.decompress((DATA / feature / file.name.removesuffix('.npz')).read_bytes()))
                if any(s['sourceSha256'] != side['sourceSha256'] for s in sources):
                    raise ValueError('态势特征来源摘要错误')
                fs = side['features']
                if any(s['step'] != f['step'] for s, f in zip(sources, fs)):
                    raise ValueError('态势特征样本错位')
            else:
                fs = [s['calibration'] for s in sources]
            features.extend(fs); players.extend(s['players'] for s in sources); boundary.extend(s.get('boundary', False) for s in sources)
            values.extend(data['omniBaseValueLogits']); active.extend(data['active']); target.extend(data['valueTarget'])
    result = {'logits': torch.tensor(np.array(values), dtype=torch.float64), 'active': torch.tensor(np.array(active), dtype=torch.bool), 'target': torch.tensor(np.array(target), dtype=torch.float64),
              'bucket': torch.tensor([f['bucket'] for f in features]), 'players': torch.tensor(players), 'boundary': torch.tensor(boundary)}
    for key in ('army', 'income', 'commander', 'actionable'):
        result[key] = torch.tensor([f[key] for f in features], dtype=torch.float64)
    return result, features


def probability(parameters, data):
    p = parameters[data['bucket']]
    army = data['army'].clamp_min(0) * data['active']; army = army / army.sum(-1, keepdim=True).clamp_min(1e-12)
    income = data['income'].clamp_min(0) * data['active']; income = income / income.sum(-1, keepdim=True).clamp_min(1e-12)
    prior = p[:, 1:2] * army + p[:, 2:3] * income + p[:, 3:4] * data['commander'] + p[:, 4:5] * data['actionable'] / data['actionable'].amax(-1, keepdim=True).clamp_min(1)
    scores = data['logits'] / p[:, :1].exp() + prior
    probs = scores.masked_fill(~data['active'], -1e9).softmax(-1)
    prior_probs = prior.masked_fill(~data['active'], -1e9).softmax(-1)
    mix = p[:, 5:6].sigmoid()
    return (1 - mix) * probs + mix * prior_probs


def metrics(prob, data, subset=None):
    rows = []
    for n in (2, 3, 4):
        mask = data['players'] == n
        if subset is not None:
            mask &= subset
        rows.append({'players': n, 'samples': int(mask.sum()), 'brier': float(((prob[mask] - data['target'][mask]) ** 2).sum(-1).mean()), 'ce': float(-(data['target'][mask] * prob[mask].clamp_min(1e-30).log()).sum(-1).mean())})
    return {'equalBrier': sum(r['brier'] for r in rows) / 3, 'equalCe': sum(r['ce'] for r in rows) / 3, 'groups': rows}


def main():
    torch.set_num_threads(2); torch.manual_seed(20261104)
    folder = DATA / 'H3-v1'; folder.mkdir(exist_ok=False)
    anchor, _ = load('anchor-features-final')
    ood, _ = load('train-features-final', 'train-calibration-final')
    dev, dev_features = load('dev-features-final', 'dev-calibration-final', 'dev')
    assert len(anchor['target']) == len(ood['target']) == 10800 and len(dev['target']) == 2160
    train = {k: torch.cat([anchor[k], ood[k]]) for k in anchor}
    weights = torch.zeros(len(train['target']), dtype=torch.float64)
    for start in (0, 10800):
        for n in (2, 3, 4):
            mask = train['players'][start:start+10800] == n
            weights[start:start+10800][mask] = 1 / (6 * int(mask.sum()))
    params = torch.nn.Parameter(torch.zeros(9, 6, dtype=torch.float64)); params.data[:, 5] = -6
    optimizer = torch.optim.Adam([params], lr=.01)
    for update in range(2000):
        optimizer.zero_grad()
        probs = probability(params, train)
        ce = -(train['target'] * probs.clamp_min(1e-30).log()).sum(-1)
        brier = ((probs - train['target']) ** 2).sum(-1)
        loss = ((ce + brier) * weights).sum()
        loss.backward(); torch.nn.utils.clip_grad_norm_([params], 1., error_if_nonfinite=True); optimizer.step()
        with torch.no_grad(): params[:, 0].clamp_(-3, 3)
        if (update + 1) % 250 == 0: print(json.dumps({'update': update+1, 'trainLoss': float(loss.detach())}), flush=True)
    with torch.no_grad():
        probs = probability(params, dev)
        base = dev['logits'].masked_fill(~dev['active'], -1e9).softmax(-1)
        calibration = {'parentMixture': 0, 'buckets': [{'temperature': float(p[0].exp()), 'army': float(p[1]), 'income': float(p[2]), 'commander': float(p[3]), 'actionable': float(p[4]), 'mixture': float(p[5].sigmoid())} for p in params]}
        report = {'updates': 2000, 'trainSamples': 21600, 'devSamples': 2160, 'baseline': metrics(base, dev), 'H3': metrics(probs, dev), 'boundary': metrics(probs, dev, dev['boundary']), 'parentMixtureReason': '当前搜索运行时不提供parentLogits，正混合会抛错；同一Omni-Base父代混合不可辨识，因此固定0', 'sealedAccess': 0}
        fixtures = [{'logits': dev['logits'][i].tolist(), 'active': dev['active'][i].int().tolist(), 'features': dev_features[i], 'expected': probs[i].tolist()} for i in range(0, 2160, 33)]
    for name, value in [('calibration.json', calibration), ('REPORT.json', report), ('parity-fixtures.json', fixtures)]:
        payload = json.dumps(value, ensure_ascii=False, indent=2).encode(); reserve(len(payload))
        with (folder / name).open('xb') as stream: stream.write(payload)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
