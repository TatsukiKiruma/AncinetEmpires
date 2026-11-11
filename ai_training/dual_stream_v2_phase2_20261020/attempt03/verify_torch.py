"""真实小批量训练与独立float32前向参考；不启动正式预训练。"""
import hashlib
import json
import os
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path
import numpy as np
import torch
from model_torch import DualStreamModel
from loss import multitask_loss

DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]
sys.path.insert(0, str(DIR.parent / 'dual_stream_v2_phase1_20261020'))
from streaming_loader import _exact
torch.set_num_threads(1)
torch.backends.mkldnn.enabled = False
torch.use_deterministic_algorithms(True)


def decode(meta, payload):
    assert hashlib.sha256(payload).hexdigest() == meta['sha256']
    batch = [dict(source=s) for s in meta['sources']]
    for e in meta['arrays']:
        raw = payload[e['offset']:e['offset'] + e['bytes']]
        assert hashlib.sha256(raw).hexdigest() == e['sha256']
        array = np.frombuffer(raw, dtype=e['dtype']).reshape(e['shape']).copy()
        batch[e['batch']][e['name']] = torch.from_numpy(array)
    return batch


def stream_real_samples():
    command = ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_phase2_20261020/samples.ts', 'stream']
    process = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    errors = bytearray()
    def drain():
        for line in iter(process.stderr.readline, b''):
            errors.extend(line)
    thread = threading.Thread(target=drain, daemon=True); thread.start()
    try:
        samples = []
        while first := process.stdout.read(1):
            ms, ps = struct.unpack('<II', first + _exact(process.stdout, 7))
            assert ms <= 1_048_576 and ps <= 67_108_864
            meta = json.loads(_exact(process.stdout, ms)); payload = _exact(process.stdout, ps)
            samples.extend(decode(meta, payload))
        assert process.wait() == 0, errors.decode('utf-8')
        return samples
    finally:
        if process.poll() is None:
            process.terminate()
        process.wait(); thread.join(timeout=5)
        process.stdout.close(); process.stderr.close()


def load_samples():
    return decode(json.loads((DIR / 'samples.json').read_text('utf-8')), (DIR / 'samples.bin').read_bytes())


def save(name, value):
    (DIR / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def load_model(prefix):
    model = DualStreamModel()
    if prefix != 'initial':
        meta = json.loads((DIR / (prefix + '.json')).read_text('utf-8'))
        data = np.frombuffer((DIR / (prefix + '.bin')).read_bytes(), dtype='<f4')
        state = {e['name']: torch.from_numpy(data[e['offset']:e['offset'] + e['length']].copy().reshape(e['shape'])) for e in meta['tensors']}
        model.load_state_dict(state)
    return model


def reference(prefix='initial'):
    model = load_model(prefix).accurate_reductions().eval()
    model.export(DIR / prefix)
    samples = load_samples(); references = []
    with torch.no_grad():
        for i, sample in enumerate(samples):
            out = model(sample)
            for name in ['logits', 'actorPrior', 'valueProbs']:
                assert torch.isfinite(out[name]).all(), (i, name)
            assert abs(out['valueProbs'].sum().item() - 1) < 1e-6
            assert (out['valueProbs'][~sample['active'].bool()] == 0).all()
            references.append({k: out[k].tolist() for k in ['logits', 'actorPrior', 'valueProbs']})
    save(prefix + '-torch-reference.json', references)
    print(json.dumps(dict(mode='reference', prefix=prefix, samples=len(samples), parameters=sum(p.numel() for p in model.parameters())), ensure_ascii=False), flush=True)


def metrics(outputs, samples):
    correct = sum(int(o['logits'].argmax().item() == s['policyTarget'].item()) for o, s in zip(outputs, samples))
    brier = [float((o['valueProbs'] - s['valueTarget']).square().mean().detach()) for o, s in zip(outputs, samples) if s['valueMask'].item()]
    return dict(correct=correct, count=len(samples), top1=correct / len(samples), brier=sum(brier) / len(brier), valueLabels=len(brier))


def overfit():
    start = time.perf_counter()
    samples = stream_real_samples()
    assert len(samples) == 64
    frozen = load_samples()[:64]
    for streamed, stored in zip(samples, frozen):
        for name in ['spatial', 'entities', 'relations', 'players', 'pointers', 'policyTarget', 'valueTarget', 'valueMask', 'weight']:
            assert torch.equal(streamed[name], stored[name]), name
    model = DualStreamModel()
    optimizer = torch.optim.AdamW(model.parameters(), lr=.003, weight_decay=.0001)
    gradients = {name: 0.0 for name, _ in model.named_parameters()}
    history = []
    policy_weight = sum(s['weight'].item() for s in samples if s['policyMask'].item())
    value_weight = sum(s['weight'].item() for s in samples if s['valueMask'].item())
    with torch.no_grad():
        initial = metrics([model(s) for s in samples], samples)
    for step in range(40):
        optimizer.zero_grad(set_to_none=True)
        totals = dict(policy=0., who=0., value=0., brier=0., total=0.)
        # 逐样本反传并按全批真实权重归一化，避免保存64份卷积计算图。
        for sample in samples:
            out = model(sample)
            losses = multitask_loss([out], [sample])
            pw = sample['weight'].item() / policy_weight if sample['policyMask'].item() else 0
            vw = sample['weight'].item() / value_weight if sample['valueMask'].item() else 0
            loss = pw * (losses['policy'] + .25 * losses['who']) + vw * (losses['value'] + losses['brier'])
            loss.backward()
            for name in ['policy', 'who']:
                totals[name] += float(losses[name].detach()) * pw
            for name in ['value', 'brier']:
                totals[name] += float(losses[name].detach()) * vw
            totals['total'] += float(loss.detach())
        for name, parameter in model.named_parameters():
            if parameter.grad is not None:
                assert torch.isfinite(parameter.grad).all(), name
                gradients[name] = max(gradients[name], parameter.grad.norm().item())
        torch.nn.utils.clip_grad_norm_(model.parameters(), 10.)
        optimizer.step()
        with torch.no_grad():
            result = metrics([model(s) for s in samples], samples)
        history.append(dict(step=step + 1, **{**totals, **result}))
        print(json.dumps(history[-1]), flush=True)
    model.export(DIR / 'overfit')
    final = history[-1]
    passed = final['top1'] >= .95 and final['brier'] < .3 * initial['brier'] and all(v > 0 for v in gradients.values())
    save('overfit-smoke-gate.json', dict(passed=passed, seed=20261020, steps=40, optimizer='AdamW', lr=.003, dtype='float32', torch=torch.__version__, python=sys.executable, source='阶段1准入与packTensorBatch二进制管道；64个冻结train前态逐数组复核', samples=64, initial=initial, final=final, history=history, gradientNormMax=gradients, zeroGradientTensors=[k for k, v in gradients.items() if not v], seconds=time.perf_counter() - start, formalPretraining=False, search=False))


if __name__ == '__main__':
    if sys.argv[1] == 'reference':
        reference(sys.argv[2] if len(sys.argv) > 2 else 'initial')
    elif sys.argv[1] == 'overfit':
        overfit()
    else:
        raise ValueError('仅支持reference或overfit')
