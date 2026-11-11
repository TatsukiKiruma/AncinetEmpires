"""手机冻结2M模型前向服务，只读导出权重；禁止梯度与优化器。"""
import hashlib
import json
import os
from pathlib import Path
import platform
import struct
import sys
import time
import numpy as np
import torch
from model import DualStreamModel
from batch_model import collate, forward_batch

WORK = Path(__file__).resolve().parent


def exact(count):
    parts = []
    while count:
        value = sys.stdin.buffer.read(count)
        if not value:
            raise EOFError('推理请求截断')
        parts.append(value)
        count -= len(value)
    return b''.join(parts)


def emit(value):
    print(json.dumps(value, separators=(',', ':'), ensure_ascii=True), flush=True)


def main():
    assert platform.machine() == 'aarch64'
    identity = json.loads((WORK / 'IDENTITY.json').read_text())
    for name in ['final.json', 'final.bin', 'model.py', 'accurate_ops.py', 'batch_model.py', 'infer.py']:
        assert hashlib.sha256((WORK / name).read_bytes()).hexdigest() == identity['runtimeFiles'][name]
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.set_grad_enabled(False)
    torch.use_deterministic_algorithms(True)
    meta = json.loads((WORK / 'final.json').read_text())
    raw = (WORK / 'final.bin').read_bytes()
    assert meta['model'] == 'dual-stream-v3-2m-v1' and meta['parameters'] == 1966910
    assert len(raw) == meta['parameters'] * 4
    model = DualStreamModel(seed=20261024).accurate_reductions(False)
    weights = {entry['name']: torch.from_numpy(np.frombuffer(raw, dtype='<f4', count=entry['length'], offset=entry['offset'] * 4).copy().reshape(entry['shape'])) for entry in meta['tensors']}
    model.load_state_dict(weights, strict=True)
    model.eval()
    for p in model.parameters():
        p.requires_grad_(False)
    assert sum(p.numel() for p in model.parameters()) == 1966910
    emit({'ready': True, 'pid': os.getpid(), 'parameters': 1966910, 'training': False,
          'modelBinarySha256': hashlib.sha256(raw).hexdigest(), 'torch': torch.__version__, 'threads': 2})
    with torch.inference_mode():
        while True:
            first = sys.stdin.buffer.read(1)
            if not first:
                break
            ml, bl = struct.unpack('<II', first + exact(7))
            assert 0 < ml < 2 ** 24 and 0 < bl < 2 ** 29
            metadata = json.loads(exact(ml))
            body = exact(bl)
            assert hashlib.sha256(body).hexdigest() == metadata['sha256']
            row = {'source': {'quality': 1.}}
            for entry in metadata['arrays']:
                chunk = body[entry['offset']:entry['offset'] + entry['bytes']]
                assert hashlib.sha256(chunk).hexdigest() == entry['sha256']
                row[entry['name']] = torch.from_numpy(np.frombuffer(chunk, dtype=entry['dtype']).copy().reshape(entry['shape']))
            start = time.perf_counter()
            batch = collate([row])
            collate_ms = (time.perf_counter() - start) * 1000
            if metadata.get('warmup'):
                for _ in range(3):
                    forward_batch(model, batch)
            start = time.perf_counter()
            result = forward_batch(model, batch)
            elapsed = (time.perf_counter() - start) * 1000
            logits = result['logits'][0]
            assert bool(torch.isfinite(logits).all())
            assert all(p.grad is None and not p.requires_grad for p in model.parameters())
            emit({'id': metadata['id'], 'logits': logits.tolist(), 'forwardMs': elapsed, 'collateMs': collate_ms})


if __name__ == '__main__':
    main()
