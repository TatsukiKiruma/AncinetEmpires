"""独立核查所有缓存的形状、身份、标签及价值头复算。"""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
import torch
from isolation import head, load_model, PREFIX


def main():
    cache, encoded = map(Path, sys.argv[1:3])
    model = load_model(PREFIX).accurate_reductions(True).cuda().eval()
    torch.set_num_threads(2)
    maximum, samples = 0., 0
    with torch.inference_mode():
        for file in sorted(cache.glob('*.npz')):
            with np.load(file, allow_pickle=False) as data:
                assert str(data['inputSha256']) == hashlib.sha256((encoded / file.name.removesuffix('.npz')).read_bytes()).hexdigest()
                sources = json.loads(str(data['sources']))
                assert len(sources) == 12 and all(s['split'] == 'train' for s in sources)
                assert data['slot_vectors'].shape == (12, 6, 683)
                assert data['players'].shape == (12, 6, 11)
                assert data['active'].shape == data['valueTarget'].shape == (12, 6)
                assert np.isfinite(data['slot_vectors']).all() and np.isfinite(data['players']).all()
                assert data['valueMask'].all()
                assert np.allclose(data['valueTarget'].sum(-1), 1)
                assert not (data['valueTarget'] * (1 - data['active'])).any()
                for i in range(12):
                    logits, _ = head(model, torch.from_numpy(data['slot_vectors'][i]).cuda(), torch.from_numpy(data['players'][i]).cuda(), torch.from_numpy(data['active'][i]).cuda())
                    error = float(np.max(np.abs(logits.cpu().numpy() - data['omniBaseValueLogits'][i])))
                    maximum = max(maximum, error)
                samples += 12
    assert samples == json.loads((cache / 'CACHE_REPORT.json').read_text())['samples']
    result = {'samples': samples, 'maxAbsValueLogitDiff': maximum, 'passed': samples > 0 and maximum == 0., 'trainingUpdates': 0}
    target = Path(__file__).resolve().parent / 'CACHE_02_VERIFICATION.json'
    with target.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, indent=2)
    print(json.dumps(result))
    assert result['passed']


if __name__ == '__main__':
    main()
