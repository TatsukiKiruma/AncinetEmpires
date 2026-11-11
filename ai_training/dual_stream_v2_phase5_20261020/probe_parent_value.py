"""按样本身份匹配父代冻结价值输出，验证可用性，不修改任何模型或旧收据。"""
import gzip
import json
from pathlib import Path
import torch
from calibrate import DIR, evaluate, save


def load(path):
    path = Path(path)
    if not path.exists():
        from run_league import ROOT, read, sha
        entry = read(DIR / 'phase51-audit/calibration-cache-archive.json')['files'][path.relative_to(DIR).as_posix()]
        path = ROOT / entry['path']
        assert sha(path) == entry['sha256'], '归档校准统计SHA不符'
    with gzip.open(path, 'rb') as stream: return torch.load(stream, weights_only=False)


def attach_parent(current, parent):
    lookup = {s['id']: i for i, s in enumerate(parent['sources'])}
    assert len(lookup) == len(parent['sources']), '父代价值样本身份重复'
    ids = torch.tensor([lookup[s['id']] for s in current['sources']], dtype=torch.long)
    for key in ['target', 'active', 'army', 'income', 'commander', 'actionable', 'bucket']:
        assert torch.equal(current[key], parent[key][ids]), f'父代与当前价值样本不一致:{key}'
    symmetries = sorted({s.get('symmetry', 'id') for s in parent['sources']})
    assert symmetries == ['id'], f'父代不是相同几何输入:{symmetries}'
    current['parentLogits'] = parent['valueLogits'][ids]
    return current


def main():
    torch.set_num_threads(4)
    folder = DIR / 'generations/gen_02'; parent = DIR / 'generations/gen_00'
    train = attach_parent(load(folder / 'train-calibration.pt.gz'), load(parent / 'train-calibration.pt.gz'))
    dev = attach_parent(load(folder / 'dev-calibration.pt.gz'), load(parent / 'dev-calibration.pt.gz'))
    candidates = json.loads((parent / 'calibration-candidates.json').read_text('utf-8'))
    best = min([c for c in candidates if c['passed']], key=lambda c: c['trainNll'])
    proxy_train = {**train, 'valueLogits': train['parentLogits']}
    proxy_dev = {**dev, 'valueLogits': dev['parentLogits']}
    results = evaluate(proxy_train, proxy_dev, torch.tensor(best['parameters'], dtype=torch.float64))
    result = dict(passed=all(s['allBaselinesExceeded'] for s in results.values()), failedSlices=[k for k, s in results.items() if not s['allBaselinesExceeded']], train=len(train['target']), dev=len(dev['target']), sameSampleGeometryAndFeatures=True, slices=results)
    save(DIR / 'phase51-audit/parent-value-probe.json', result)
    print(json.dumps({k: result[k] for k in ['passed', 'failedSlices', 'train', 'dev']}, ensure_ascii=False))


if __name__ == '__main__': main()
