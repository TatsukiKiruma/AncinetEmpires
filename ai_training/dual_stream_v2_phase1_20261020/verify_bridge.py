"""逐字节校验TS小端连续数组到NumPy/PyTorch的无损桥接。"""
from pathlib import Path
import hashlib
import json
import numpy as np
import torch
from streaming_loader import stream_batches

root = Path(__file__).resolve().parent
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda b: hashlib.sha256(b).hexdigest()
manifest = read(root / 'bridge-fixture.json')
data = (root / 'bridge-fixture.bin').read_bytes()
assert sha(data) == manifest['sha256'] and len(data) == manifest['totalBytes']
checked = 0
batches = {}
for entry in manifest['arrays']:
    raw = data[entry['offset']:entry['offset'] + entry['bytes']]
    assert sha(raw) == entry['sha256']
    array = np.frombuffer(raw, dtype=entry['dtype']).reshape(entry['shape']).copy()
    tensor = torch.from_numpy(array)
    assert list(tensor.shape) == entry['shape']
    assert tensor.contiguous().numpy().tobytes() == raw
    assert np.isfinite(tensor.numpy()).all()
    batches.setdefault(entry['batch'], {})[entry['name']] = tensor
    checked += tensor.numel()
for batch in batches.values():
    pointers = batch['pointers'].long()
    assert torch.all(batch['actorMask'][pointers[:, 0]] == 1)
    prefixes = {tuple(row) for row in batch['prefixTileMask'].tolist()}
    assert all(tuple(row[:2]) in prefixes for row in pointers.tolist())
    assert batch['players'].shape == (6, 11)
    assert batch['active'].shape == (6,)
    assert batch['valueTarget'].shape == (6,)
    assert batch['valueTarget'].sum().item() == batch['valueMask'].item()
    assert batch['policyTarget'].item() < len(pointers)
streamed = 0
for batch in stream_batches(limit=3, batch_size=2, augment=True):
    for sample in batch:
        assert sample['pointers'].shape[1] == 5
        assert sample['policyMask'].item() == 1
        assert 0 <= sample['policyTarget'].item() < len(sample['pointers'])
        assert torch.isfinite(sample['relations']).all()
        streamed += 1
assert streamed == 3
size = sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
result = dict(passed=True, torch=torch.__version__, batches=len(batches), arrays=len(manifest['arrays']), checkedElements=checked, maxAbsoluteError=0, byteIdentical=True, masksVerified=True, ipcStreamSamples=streamed, ipcFeatureFiles=0, binaryBytes=len(data), directoryBytes=size, diskLimitBytes=100_000_000)
assert size <= result['diskLimitBytes']
(root / 'ts-python-bridge-gate.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
