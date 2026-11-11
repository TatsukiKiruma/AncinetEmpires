"""父代/当前价值logits的预登记插值网格；仅train拟合，dev只作16切片筛选。"""
import itertools
import json
import math
import shutil
import torch
from calibrate import DIR, probabilities, evaluate, save
from probe_parent_value import load, attach_parent
from run_league import sha


def main():
    torch.set_num_threads(4)
    folder = DIR / 'generations/gen_02'; parent = DIR / 'generations/gen_00'
    protocol = dict(parentMixtures=[.25, .5, .75, 1.], rankWeights=[0., .5, 2., 8.], balanced=[False, True], armyShareMix=[0., .05, .15], candidate0='父代已通过16切片的训练拟合参数', optimizer='LBFGS', maxIterations=220, trainOnly=True, devGradient=False, battleSelection=False, firstStudentBattlesObserved=False)
    save(folder / 'parent-calibration-protocol.json', protocol)
    train = attach_parent(load(folder / 'train-calibration.pt.gz'), load(parent / 'train-calibration.pt.gz'))
    dev = attach_parent(load(folder / 'dev-calibration.pt.gz'), load(parent / 'dev-calibration.pt.gz'))
    old = json.loads((parent / 'calibration-candidates.json').read_text('utf-8'))
    retained = min([c for c in old if c['passed']], key=lambda c: c['trainNll'])
    candidates = []

    def candidate(params, mix, army_mix, rank, balanced, source='train-lbfgs'):
        td = {**train, 'valueLogits': ((1 - mix) * train['valueLogits'].double() + mix * train['parentLogits'].double()).float()}
        dd = {**dev, 'valueLogits': ((1 - mix) * dev['valueLogits'].double() + mix * dev['parentLogits'].double()).float()}
        metrics = evaluate(td, dd, params, army_mix)
        nll = float(-(td['target'] * probabilities(td, params, army_mix).clamp_min(1e-30).log()).sum(-1).mean())
        c = dict(parentMixture=mix, armyShareMix=army_mix, rankWeight=rank, balanced=balanced, source=source, trainNll=nll, parameters=params.tolist(), passed=all(s['allBaselinesExceeded'] for s in metrics.values()), failedSlices=[k for k, s in metrics.items() if not s['allBaselinesExceeded']], slices=metrics)
        candidates.append(c)
        save(folder / 'parent-calibration-candidates.json', candidates)
        print(json.dumps({k: c[k] for k in ['parentMixture', 'armyShareMix', 'rankWeight', 'balanced', 'trainNll', 'passed', 'failedSlices']}), flush=True)

    candidate(torch.tensor(retained['parameters'], dtype=torch.float64), 1., 0., retained['rankWeight'], retained['balanced'], '父代冻结训练拟合参数')
    for mix, rank, balanced, army_mix in itertools.product(protocol['parentMixtures'], protocol['rankWeights'], protocol['balanced'], protocol['armyShareMix']):
        td = {**train, 'valueLogits': ((1 - mix) * train['valueLogits'].double() + mix * train['parentLogits'].double()).float()}
        params = torch.zeros(9, 6, dtype=torch.float64, requires_grad=True)
        with torch.no_grad(): params[:, 5] = -3
        opt = torch.optim.LBFGS([params], max_iter=220, line_search_fn='strong_wolfe')
        def closure():
            opt.zero_grad(); p = probabilities(td, params, army_mix); logp = p.clamp_min(1e-30).log()
            per = -(td['target'] * logp).sum(-1) + (p - td['target']).square().mean(-1)
            positive = logp.masked_fill(td['target'] <= 0, -1e9).max(-1).values
            negative = logp.masked_fill((td['target'] > 0) | ~td['active'].bool(), -1e9).max(-1).values
            per = per + rank * torch.relu(.3 + negative - positive)
            loss = torch.stack([per[td['bucket'] == b].mean() for b in range(9) if (td['bucket'] == b).any()]).mean() if balanced else per.mean()
            loss = loss + .0001 * params.square().sum(); loss.backward(); return loss
        opt.step(closure)
        with torch.no_grad(): params[:, 0].clamp_(-2, 3); params[:, 1:].clamp_(-20, 20)
        candidate(params.detach(), mix, army_mix, rank, balanced)
    qualified = [c for c in candidates if c['passed']]
    assert qualified, '父代插值网格仍未通过16切片，禁止启动候选实战'
    best = min(qualified, key=lambda c: c['trainNll'])
    config = dict(parentMixture=best['parentMixture'], parentModelFile='parent-model', parentModelSha256=sha(parent / 'model.bin'), buckets=[dict(temperature=math.exp(c[0]), army=c[1], income=c[2], commander=c[3], actionable=c[4], mixture=float(torch.tensor(c[5], dtype=torch.float64).sigmoid()), armyShareMix=best['armyShareMix']) for c in best['parameters']])
    for suffix in ['json', 'bin']:
        target = folder / f'parent-model.{suffix}'
        if not target.exists(): shutil.copyfile(parent / f'model.{suffix}', target)
        assert sha(target) == sha(parent / f'model.{suffix}')
    save(folder / 'value-config.json', config)
    save(folder / 'value-calibration.json', dict(passed=True, slices=best['slices'], config=config, trainOnly=True, trainValueSamples=len(train['target']), devValueSamples=len(dev['target']), selectionUsesBattleOutcomes=False, protocol='parent-calibration-protocol.json', selectedSource=best['source']))
    print(json.dumps(dict(completed=True, parentMixture=best['parentMixture'], passed=True, trainNll=best['trainNll'])), flush=True)


if __name__ == '__main__': main()
