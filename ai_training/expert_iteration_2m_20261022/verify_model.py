"""新网络参数、跨语言参考、批处理及优化器工程检查；不作为预训练或棋力结果。"""
import copy
import hashlib
import json
import random
import struct
import time
from pathlib import Path
import numpy as np
import torch
from torch.nn import functional as F
from model import DualStreamModel, ARCHITECTURE
from batch_model import collate, forward_batch

DIR = Path(__file__).resolve().parent


def frames(path):
    with path.open('rb') as f:
        while header := f.read(8):
            ms, ps = struct.unpack('<II', header)
            meta, raw = json.loads(f.read(ms)), f.read(ps)
            assert hashlib.sha256(raw).hexdigest() == meta['sha256']
            samples = [dict(source=s) for s in meta['sources']]
            for e in meta['arrays']:
                data = raw[e['offset']:e['offset']+e['bytes']]
                assert hashlib.sha256(data).hexdigest() == e['sha256']
                samples[e['batch']][e['name']] = torch.from_numpy(np.frombuffer(data, dtype=e['dtype']).copy().reshape(e['shape']))
            yield from samples


def main():
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    random.seed(221966910); np.random.seed(221966910); torch.manual_seed(221966910)
    model = DualStreamModel(seed=221966910).eval()
    count = sum(p.numel() for p in model.parameters())
    assert 1900000 <= count <= 2100000
    assert not (DIR / 'initial.bin').exists(), '拒绝覆盖初始权重'
    meta = model.export(DIR / 'initial')
    assert meta['parameters'] == count
    samples = list(frames(DIR / 'fixtures.frames'))
    references, times = [], []
    model.accurate_reductions()
    with torch.no_grad():
        for i, sample in enumerate(samples):
            start = time.perf_counter(); out = model(sample); elapsed = (time.perf_counter() - start) * 1000
            references.append(dict(id=sample['source']['id'], outputs={k: out[k].tolist() for k in ['logits','actorPrior','conditionalPrior','valueLogits','valueProbs']}))
            times.append(elapsed)
            if i % 20 == 0: print(json.dumps(dict(stage='parity', samples=i+1, ms=elapsed)), flush=True)
    (DIR / 'python-reference.json').write_text(json.dumps(references), 'utf-8')
    # 工程梯度试验使用隔离副本及显式人工标签，不进入预训练池或正式权重。
    probe = copy.deepcopy(model).accurate_reductions(False).train()
    optimizer = torch.optim.AdamW(probe.parameters(), lr=1e-4, weight_decay=0)
    assert {id(p) for group in optimizer.param_groups for p in group['params']} == {id(p) for p in probe.parameters()}
    before = {n: p.detach().clone() for n,p in probe.named_parameters()}
    nonzero = set(); batch_error = 0
    groups = {}
    for s in samples:
        if s['spatial'].shape[-1] <= 32:
            groups.setdefault(tuple(s['spatial'].shape), []).append(s)
    for group in list(groups.values())[:8]:
        rows = group[:4]; x = collate(rows); out = forward_batch(probe,x)
        with torch.no_grad():
            for j,s in enumerate(rows):
                direct = probe(s)
                batch_error = max(batch_error, float((direct['logits']-out['logits'][j,:len(s['pointers'])]).abs().max()))
        # Value人工标签只验证梯度和槽位，不能宣称从真实终局学习。
        objective = F.cross_entropy(out['logits'],x['target']) + F.cross_entropy(out['valueLogits'],x['active'].float().argmax(-1))
        optimizer.zero_grad(set_to_none=True); objective.backward()
        assert torch.isfinite(torch.nn.utils.clip_grad_norm_(probe.parameters(),1.))
        nonzero.update(n for n,p in probe.named_parameters() if p.grad is not None and torch.isfinite(p.grad).all() and bool(p.grad.abs().sum()>0))
        optimizer.step()
    changed = [n for n,p in probe.named_parameters() if not torch.equal(before[n],p)]
    assert batch_error < 2e-4, batch_error
    result = dict(passed=True, architecture=ARCHITECTURE, parameters=count, weightBytes=(DIR/'initial.bin').stat().st_size,
                  modelSha256=hashlib.sha256((DIR/'initial.bin').read_bytes()).hexdigest(), samples=len(samples),
                  pythonMs={k:float(np.percentile(times,p)) for k,p in [('p50',50),('p95',95),('p99',99),('max',100)]},
                  batchMaxError=batch_error, optimizerAllParameters=True, gradientNonzeroTensors=sorted(nonzero), changedTensors=changed,
                  numericalProbeOnly=True, formalTrainingUpdates=0, cuda=torch.cuda.is_available(), torch=torch.__version__)
    (DIR/'model-engineering.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps({k:result[k] for k in ['passed','parameters','weightBytes','samples','batchMaxError']},ensure_ascii=False),flush=True)


if __name__ == '__main__': main()
