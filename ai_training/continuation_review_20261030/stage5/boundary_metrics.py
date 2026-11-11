"""在CPU复算完整OOD-Dev及边界子集，避免干扰正在运行的GPU实战预算。"""
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from isolation import load_model, PREFIX
from value_training import value_logits

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')


def main():
    torch.set_num_threads(1)
    fields = ('slot_vectors', 'players', 'active', 'valueTarget')
    parts = {key: [] for key in fields}
    sources = []
    for file in sorted((DATA / 'dev-features-final').glob('*.npz')):
        with np.load(file, allow_pickle=False) as item:
            source = json.loads(str(item['sources']))
            assert all(s['split'] == 'dev' for s in source)
            sources.extend(source)
            for key in fields:
                parts[key].append(item[key].copy())
    arrays = {key: torch.from_numpy(np.concatenate(value)) for key, value in parts.items()}
    assert len(sources) == 2160
    report = {}
    for name, prefix in [('Omni-Base', PREFIX), ('H1', DATA / 'heads-v1/H1/final'), ('H2', DATA / 'heads-v1/H2/final')]:
        model = load_model(prefix).accurate_reductions(True).eval()
        briers, ces = [], []
        with torch.inference_mode():
            for start in range(0, 2160, 32):
                b = {k: v[start:start+32] for k, v in arrays.items()}
                logits = value_logits(model, b['slot_vectors'], b['players'], b['active'])
                logs = logits.double().log_softmax(-1)
                briers.extend(((logs.exp() - b['valueTarget']) ** 2).sum(-1).tolist())
                ces.extend(-(logs * b['valueTarget']).sum(-1).numpy())
        subsets = {}
        for subset in ('all', 'boundary', 'intraTurn'):
            groups = []
            for n in (2, 3, 4):
                indices = [i for i, s in enumerate(sources) if s['players'] == n and (subset == 'all' or s['boundary'] == (subset == 'boundary'))]
                assert len(indices) == (720 if subset == 'all' else 360)
                groups.append({'players': n, 'samples': len(indices), 'brier': float(np.mean([briers[i] for i in indices])), 'ce': float(np.mean([ces[i] for i in indices]))})
            subsets[subset] = {'equalBrier': sum(g['brier'] for g in groups) / 3, 'equalCe': sum(g['ce'] for g in groups) / 3, 'groups': groups}
        report[name] = {'modelSha256': hashlib.sha256(Path(prefix).with_suffix('.bin').read_bytes()).hexdigest(), 'subsets': subsets}
    with (HERE / 'OOD_DEV_BOUNDARY_REPORT.json').open('x', encoding='utf-8') as stream:
        json.dump({'models': report, 'samples': 2160, 'boundarySamples': 1080, 'sealedAccess': 0}, stream, indent=2)
    print(json.dumps({name: row['subsets']['boundary'] for name, row in report.items()}))


if __name__ == '__main__':
    main()
