"""H1/H2固定6000步价值校准；仅OOD-Dev选择快照，不解锁实战或封存。"""
import io
import json
import math
from pathlib import Path
import random
import sys
import numpy as np
import torch
from isolation import load_model, PREFIX
from value_training import freeze, frozen_digest, step, value_logits, VALUE
from write_budget import reserve

DATA = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')
FIELDS = ['slot_vectors', 'players', 'active', 'valueTarget', 'omniBaseValueLogits']


def dataset(name, split, expected):
    root = DATA / name
    if json.loads((root / 'CACHE_REPORT.json').read_text())['samples'] != expected:
        raise ValueError('缓存尚未完整')
    arrays = {key: [] for key in FIELDS}
    sources = []
    for file in sorted(root.glob('*.npz')):
        with np.load(file, allow_pickle=False) as item:
            meta = json.loads(str(item['sources']))
            if any(s['split'] != split for s in meta) or not item['valueMask'].all():
                raise ValueError('分区或标签掩码错误')
            sources.extend(meta)
            for key in FIELDS:
                arrays[key].append(item[key].copy())
    result = {key: torch.from_numpy(np.concatenate(value)).cuda() for key, value in arrays.items()}
    if len(sources) != expected:
        raise ValueError('样本计数不符')
    return result, sources


def evaluate(model, data, sources):
    errors, ces = [], []
    with torch.inference_mode():
        for start in range(0, len(sources), 64):
            b = {k: v[start:start+64] for k, v in data.items()}
            logits = value_logits(model, b['slot_vectors'], b['players'], b['active'])
            logs = logits.log_softmax(-1)
            errors.extend(((logs.exp() - b['valueTarget']) ** 2).sum(-1).cpu().tolist())
            ces.extend(-(logs * b['valueTarget']).sum(-1).cpu().numpy())
    groups = {}
    for n in (2, 3, 4):
        ids = [i for i, source in enumerate(sources) if source['players'] == n]
        groups[n] = {'brier': float(np.mean([errors[i] for i in ids])), 'ce': float(np.mean([ces[i] for i in ids]))}
    return {'equalBrier': sum(v['brier'] for v in groups.values()) / 3, 'equalCe': sum(v['ce'] for v in groups.values()) / 3, 'groups': groups}


def save(file, obj):
    content = io.BytesIO()
    torch.save(obj, content)
    payload = content.getvalue(); reserve(len(payload))
    with file.open('xb') as stream:
        stream.write(payload)


def main():
    torch.set_num_threads(2)
    random.seed(20261104); torch.manual_seed(20261104)
    root = DATA / 'heads-v1'; root.mkdir(exist_ok=False)
    anchor, anchor_sources = dataset('anchor-features-final', 'train', 10800)
    ood, ood_sources = dataset('train-features-final', 'train', 10800)
    dev, dev_sources = dataset('dev-features-final', 'dev', 2160)
    pools = [[torch.tensor([i for i, s in enumerate(meta) if s['players'] == n], device='cuda') for n in (2, 3, 4)] for meta in (anchor_sources, ood_sources)]
    baseline = evaluate(load_model(PREFIX).accurate_reductions(True).cuda().eval(), dev, dev_sources)
    for name, peak, trust in [('H1', 2e-5, .15), ('H2', 5e-5, .05)]:
        folder = root / name; folder.mkdir()
        model = load_model(PREFIX).accurate_reductions(True).cuda().eval()
        params = freeze(model); identity = frozen_digest(model)
        optimizer = torch.optim.AdamW(params, lr=peak)
        best, best_state, curve = None, None, []
        for update in range(6000):
            # 每批两个来源各32样本；人数余数每步轮换，三步后严格等权。
            pieces = []
            for data, source_pools in zip((anchor, ood), pools):
                indices = []
                for n, pool in enumerate(source_pools):
                    count = 10 if n == update % 3 else 11
                    indices.append(pool[torch.randint(len(pool), (count,), device='cuda')])
                index = torch.cat(indices)
                pieces.append({k: v[index] for k, v in data.items()})
            batch = {k: torch.cat([p[k] for p in pieces]) for k in FIELDS}
            batch['weights'] = torch.ones(64, device='cuda')
            rate = peak * (.1 + .9 * (1 + math.cos(math.pi * update / 5999)) / 2)
            optimizer.param_groups[0]['lr'] = rate
            result = step(model, optimizer, batch, trust, identity)
            if (update + 1) % 250 == 0:
                metrics = evaluate(model, dev, dev_sources)
                record = {'update': update + 1, 'lr': rate, **metrics, **result}
                curve.append(record); print(json.dumps({'candidate': name, **record}), flush=True)
                state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items() if k.split('.')[0] in VALUE}
                save(folder / f'value-{update+1:04d}.pt', {'value': state, 'optimizer': optimizer.state_dict(), 'rng': torch.get_rng_state(), 'cudaRng': torch.cuda.get_rng_state(), 'record': record, 'frozenSha256': identity})
                if best is None or metrics['equalBrier'] < best['equalBrier']:
                    best, best_state = record, state
        model.load_state_dict(best_state, strict=False)
        if frozen_digest(model) != identity:
            raise ValueError('导出前冻结参数身份变化')
        reserve(9_000_000); model.export(folder / 'final')
        report = {'baseline': baseline, 'best': best, 'curve': curve, 'optimizer': 'AdamW干净初始化对照', 'updates': 6000, 'stage1DevGate': '待评估', 'exportPolicyParity': '待执行', 'sealedAccess': 0}
        payload = json.dumps(report, ensure_ascii=False, indent=2).encode(); reserve(len(payload))
        with (folder / 'REPORT.json').open('xb') as stream:
            stream.write(payload)


if __name__ == '__main__':
    main()
