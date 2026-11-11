"""有界预取、多模式批次训练与开发指标；所有编码来自TS权威流。"""
import hashlib
import json
import math
import queue
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path
import numpy as np
import torch

DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]
sys.path.insert(0, str(DIR.parent / 'dual_stream_v2_phase2_20261020'))
from model_torch import DualStreamModel
from batch_model import collate, forward_batch, losses


def save(name, obj):
    (DIR / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def load_model(prefix):
    m = DualStreamModel()
    meta = json.loads((DIR / (prefix + '.json')).read_text('utf-8'))
    raw = np.frombuffer((DIR / (prefix + '.bin')).read_bytes(), dtype='<f4')
    m.load_state_dict({e['name']: torch.from_numpy(raw[e['offset']:e['offset'] + e['length']].copy().reshape(e['shape'])) for e in meta['tensors']})
    return m


def exact(stream, n):
    chunks = bytearray()
    while len(chunks) < n:
        part = stream.read(n - len(chunks))
        if not part:
            raise EOFError('编码流截断')
        chunks.extend(part)
    return chunks


def decode(meta, raw):
    assert hashlib.sha256(raw).hexdigest() == meta['sha256']
    samples = [dict(source=s) for s in meta['sources']]
    for e in meta['arrays']:
        data = raw[e['offset']:e['offset'] + e['bytes']]
        assert hashlib.sha256(data).hexdigest() == e['sha256']
        samples[e['batch']][e['name']] = torch.from_numpy(np.frombuffer(data, dtype=e['dtype']).copy().reshape(e['shape']))
    return samples


def batches(split, epoch=0, limit=None):
    q = queue.Queue(maxsize=2)
    command = ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_phase3_20261020/stream.ts', split, str(epoch)]
    if limit is not None:
        command += [str(limit)]
    p = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    error = bytearray()
    def drain():
        for line in iter(p.stderr.readline, b''):
            error.extend(line)
            if len(error) > 65536:
                del error[:-65536]
    threading.Thread(target=drain, daemon=True).start()
    def produce():
        try:
            while first := p.stdout.read(1):
                ms, ps = struct.unpack('<II', first + exact(p.stdout, 7))
                assert ms <= 1048576 and ps <= 67108864
                meta = json.loads(exact(p.stdout, ms)); raw = exact(p.stdout, ps)
                q.put(decode(meta, raw))
            assert p.wait() == 0, error.decode('utf-8', errors='replace')
        except BaseException as e:
            q.put(e)
        finally:
            q.put(None)
    threading.Thread(target=produce, daemon=True).start()
    try:
        while True:
            item = q.get()
            if item is None:
                break
            if isinstance(item, BaseException):
                raise item
            yield item
    finally:
        if p.poll() is None:
            p.terminate()
        p.wait()
        p.stdout.close(); p.stderr.close()


def run_epoch(model, split, epoch, optimizer=None, total_steps=1, offset=0):
    started = time.perf_counter()
    counts = dict(samples=0, batches=0, correct=0, valueSamples=0, policy=0., who=0., value=0., brier=0., pw=0., vw=0.)
    for samples in batches(split, epoch):
        x = collate(samples)
        with torch.set_grad_enabled(optimizer is not None):
            out = forward_batch(model, x)
            total, per = losses(out, x)
            if optimizer is not None:
                fraction = min(1., (offset + counts['samples']) / max(1, total_steps - 1))
                lr = .0005 * (.05 + .95 * .5 * (1 + math.cos(math.pi * fraction)))
                for group in optimizer.param_groups:
                    group['lr'] = lr
                optimizer.zero_grad(set_to_none=True)
                total.backward()
                norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.)
                assert torch.isfinite(norm)
                optimizer.step()
        pw, vw = x['weight'] * x['quality'], x['weight'] * x['valueMask']
        counts['pw'] += pw.sum().item(); counts['vw'] += vw.sum().item()
        for k in ['policy', 'who']:
            counts[k] += (per[k].detach() * pw).sum().item()
        for k in ['value', 'brier']:
            counts[k] += (per[k].detach() * vw).sum().item()
        counts['samples'] += len(samples); counts['batches'] += 1
        counts['correct'] += (out['logits'].argmax(-1) == x['target']).sum().item()
        counts['valueSamples'] += x['valueMask'].sum().item()
        if counts['batches'] % 100 == 0:
            save('training-progress.json', dict(split=split, epoch=epoch + 1, seconds=time.perf_counter() - started, **counts))
            print(json.dumps(dict(split=split, epoch=epoch + 1, samples=counts['samples'], seconds=round(time.perf_counter() - started, 2))), flush=True)
    counts['top1'] = counts['correct'] / max(1, counts['samples'])
    for k in ['policy', 'who']:
        counts[k] /= max(1e-12, counts['pw'])
    for k in ['value', 'brier']:
        counts[k] /= max(1e-12, counts['vw'])
    counts['composite'] = counts['policy'] + .25 * counts['who'] + counts['value'] + counts['brier']
    counts['seconds'] = time.perf_counter() - started
    counts['inputReceipt'] = json.loads((DIR / f'stream-receipts/{split}-epoch{epoch}.json').read_text('utf-8'))
    return counts


def train():
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    receipts = [json.loads((DIR / f'corpus-receipt-{i}.json').read_text('utf-8')) for i in range(5)]
    summaries = [p for r in receipts for p in r['summaries']]
    train_count = sum(p['samples'] for p in summaries if p['split'] == 'train')
    dev_count = sum(p['samples'] for p in summaries if p['split'] == 'dev')
    save('sample-coverage.json', dict(train=train_count, dev=dev_count, summaries=summaries,
         originalValueParents=len({p['id'] for p in summaries if p['originalValueEligible']}), usableValueParents=len({p['id'] for p in summaries if p['valueSamples'] > 0}),
         stats=[r['stats'] for r in receipts], encodedFeatureFiles=0))
    assert train_count >= 120000 and dev_count >= 25000, (train_count, dev_count)
    model = DualStreamModel(seed=202610203)
    optimizer = torch.optim.AdamW(model.parameters(), lr=.0005, weight_decay=.0001)
    history = []; best = float('inf'); offset = 0
    total_steps = 3 * train_count
    for epoch in range(3):
        model.train(); training = run_epoch(model, 'train', epoch, optimizer, total_steps, epoch * train_count)
        offset += training['batches']
        model.eval(); dev = run_epoch(model, 'dev', epoch)
        history.append(dict(epoch=epoch + 1, train=training, dev=dev))
        if dev['composite'] < best:
            best = dev['composite']; model.export(DIR / 'stage3a-best')
            torch.save(dict(epoch=epoch + 1, model=model.state_dict(), optimizer=optimizer.state_dict()), DIR / 'stage3a-best.pt')
        torch.save(dict(epoch=epoch + 1, model=model.state_dict(), optimizer=optimizer.state_dict()), DIR / 'stage3a-resume.pt')
        save('training-history.json', dict(seed=202610203, torch=torch.__version__, threads=torch.get_num_threads(), optimizer='AdamW', clipGradNorm=1., epochs=history, selectedComposite=best, totalUpdates=offset))
        print(json.dumps(history[-1]), flush=True)
    save('stage3a-complete.json', dict(completed=True, updates=offset, trainSamples=train_count, devSamples=dev_count))


def check_batch():
    torch.set_num_threads(1)
    phase2 = DIR.parent / 'dual_stream_v2_phase2_20261020'
    samples = decode(json.loads((phase2 / 'samples.json').read_text('utf-8')), (phase2 / 'samples.bin').read_bytes())
    m = DualStreamModel().eval(); errors = []; grad_errors = []
    groups = {}
    for s in samples:
        groups.setdefault(tuple(s['spatial'].shape), []).append(s)
    with torch.no_grad():
        for group in groups.values():
            x = collate(group); bat = forward_batch(m, x)
            for i, sample in enumerate(group):
                out = m(sample)
                a = len(sample['pointers']); n = len(sample['entities'])
                actor = torch.cat([bat['actorPrior'][i, :n], bat['actorPrior'][i, -1:]])
                errors.append(max((bat['logits'][i, :a] - out['logits']).abs().max().item(), (bat['valueProbs'][i] - out['valueProbs']).abs().max().item(), (actor - out['actorPrior']).abs().max().item()))
    group = samples[:2]
    m.zero_grad(); x = collate(group); loss, _ = losses(forward_batch(m, x), x); loss.backward()
    grads = {n: p.grad.clone() if p.grad is not None else None for n, p in m.named_parameters()}
    from loss import multitask_loss
    m.zero_grad(); multitask_loss([m(s) for s in group], group)['total'].backward()
    for n, p in m.named_parameters():
        if p.grad is not None and grads[n] is not None:
            grad_errors.append((p.grad - grads[n]).abs().max().item())
    result = dict(passed=max(errors) < 1e-4 and max(grad_errors) < 1e-4, samples=len(samples), maxForwardError=max(errors), maxGradientError=max(grad_errors))
    save('batch-equivalence.json', result); print(json.dumps(result), flush=True)
    assert result['passed']
    timings = []
    group = next(v for v in groups.values() if len(v) >= 8)[:8]
    group = group * 4; x = collate(group)
    for threads in [1, 2, 4, 8, 16]:
        torch.set_num_threads(threads)
        for _ in range(2):
            m.zero_grad(); losses(forward_batch(m, x), x)[0].backward()
        start = time.perf_counter()
        for _ in range(5):
            m.zero_grad(); losses(forward_batch(m, x), x)[0].backward()
        timings.append(dict(threads=threads, samplesPerSecond=160 / (time.perf_counter() - start)))
    save('thread-benchmark.json', timings); print(json.dumps(timings), flush=True)


if __name__ == '__main__':
    if sys.argv[1] == 'check':
        check_batch()
    elif sys.argv[1] == 'train':
        train()
