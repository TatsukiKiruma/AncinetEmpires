"""E6固定四轮训练，终点唯一；支持相同序列和完整RNG的显式恢复。"""
import argparse
import json
import os
import random
import subprocess
import sys
import time
from collections import Counter
import numpy as np
import torch
from core import HERE, R, ROOT, SEED, read, digest, write_new, check_budget, frames, teacher_labels, tensor_hashes, load_initial
from ordering import batches
from objectives import objective, development, gradient_scale


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('arm', choices=['A', 'B', 'C'])
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    check_budget()
    assert read(HERE / 'teacher-gate.json')['passed'] and read(HERE / 'tactical-teacher-gate.json')['passed']
    assert read(HERE / 'strict-tactics.json')['passed']
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED)
    rows = teacher_labels(list(frames(HERE / 'data/train.frames')), 'train')
    dev_search = teacher_labels(list(frames(HERE / 'data/dev-search.frames')), 'dev-search')
    dev_value = list(frames(HERE / 'data/dev-value.frames'))
    assert len(rows) == 4096 and len(dev_search) == 128 and len(dev_value) == 512
    output = HERE / 'training' / args.arm
    output.mkdir(parents=True, exist_ok=True)
    checkpoint = output / 'resume.pt'
    identity_files = [HERE / 'frozen-identity.json', R / 'model.py', R / 'batch_model.py', R / 'training/pretrain_full/model.bin', R / 'training/pretrain_full/model.json',
                      HERE / 'protocol.json', HERE / 'dataset-manifest.json', HERE / 'teacher-gate.json', HERE / 'tactical-teacher-gate.json',
                      *HERE.glob('*.py'), *HERE.glob('*.ts'), *HERE.glob('data/*'), *HERE.glob('teacher/*/*/result.json')]
    identity = {str(p.relative_to(ROOT)): digest(p) for p in identity_files if p.is_file()}
    model = load_initial(R / 'training/pretrain_full/model')
    optimizer = torch.optim.AdamW(model.parameters(), lr=5e-5, weight_decay=1e-4)
    start_hashes = tensor_hashes(model)
    epoch = cursor = updates = 0
    history = []
    consumed = Counter()
    epoch_clips = epoch_updates = 0
    if args.resume:
        assert read(output / 'identity.json') == identity
        saved = torch.load(checkpoint, weights_only=False)
        assert saved['arm'] == args.arm
        model.load_state_dict(saved['model']); optimizer.load_state_dict(saved['optimizer'])
        epoch, cursor, updates = saved['epoch'], saved['cursor'], saved['updates']
        history, consumed = saved['history'], Counter(saved['consumed'])
        start_hashes = saved['startHashes']
        epoch_clips, epoch_updates = saved['epochClips'], saved['epochUpdates']
        random.setstate(saved['random']); np.random.set_state(saved['numpy']); torch.set_rng_state(saved['torch'])
    else:
        assert not checkpoint.exists()
        write_new(output / 'identity.json', identity)

    def save():
        # 原子替换仅限本臂恢复文件；各轮导出和证据使用独占新文件。
        tmp = output / 'resume.pending.pt'
        torch.save(dict(arm=args.arm, model=model.state_dict(), optimizer=optimizer.state_dict(), epoch=epoch, cursor=cursor, updates=updates,
                        history=history, consumed=dict(consumed), startHashes=start_hashes, epochClips=epoch_clips, epochUpdates=epoch_updates,
                        random=random.getstate(), numpy=np.random.get_state(), torch=torch.get_rng_state()), tmp)
        os.replace(tmp, checkpoint)

    attempt = time.time_ns()
    metrics_file = output / f'metrics-{attempt}.jsonl'
    try:
        while epoch < 4:
            sequence = batches(rows, args.arm, epoch)
            sequence_hash = __import__('hashlib').sha256(json.dumps(sequence).encode()).hexdigest()
            while cursor < len(sequence):
                check_budget()
                indices = sequence[cursor]; samples = [rows[i] for i in indices]
                model.train(); optimizer.zero_grad(set_to_none=True)
                policy, value, metrics = objective(model, samples, args.arm)
                total = policy + value
                assert torch.isfinite(total)
                if (updates + 1) % 100 == 0:
                    shared = [p for n, p in model.named_parameters() if not n.startswith(('value', 'who', 'tile_', 'what_', 'target_', 'headBias', 'army_scale'))]
                    metrics['gradients'] = dict(policyAll=gradient_scale(policy, list(model.parameters())), valueAll=gradient_scale(value, list(model.parameters())),
                                                policyShared=gradient_scale(policy, shared), valueShared=gradient_scale(value, shared))
                total.backward()
                norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.)
                assert torch.isfinite(norm)
                optimizer.step()
                assert all(torch.isfinite(p).all() for p in model.parameters())
                cursor += 1; updates += 1; epoch_updates += 1; epoch_clips += float(norm) > 1
                consumed.update(s['source']['id'] for s in samples)
                with metrics_file.open('a', encoding='utf-8') as f:
                    f.write(json.dumps(dict(epoch=epoch+1, cursor=cursor, updates=updates, sequenceSha256=sequence_hash, gradientNorm=float(norm), **metrics), allow_nan=False) + '\n')
                if updates % 100 == 0:
                    save()
                    print(json.dumps(dict(arm=args.arm, epoch=epoch+1, updates=updates, cursor=cursor)), flush=True)
            model.eval()
            metrics = development(model, dev_value, dev_search)
            prefix = output / f'epoch-{epoch+1}'
            assert not prefix.with_suffix('.bin').exists()
            model.export(prefix)
            tactic_file = output / f'epoch-{epoch+1}-tactics.json'
            subprocess.run(['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', str(HERE / 'tactics.ts'), 'model', str(prefix), str(tactic_file)], cwd=ROOT, check=True)
            history.append(dict(epoch=epoch+1, updates=updates, metrics=metrics, tactics=read(tactic_file), clippingFraction=epoch_clips/max(1, epoch_updates),
                                sourceConsumption=dict(Counter(s['source']['source'] for s in rows)), sequenceSha256=sequence_hash))
            epoch += 1; cursor = 0; epoch_clips = epoch_updates = 0; save()
            write_new(output / f'epoch-{epoch}-metrics.json', history[-1])
        assert len(consumed) == 4096 and set(consumed.values()) == {4}
        changed = [n for n, h in tensor_hashes(model).items() if h != start_hashes[n]]
        assert changed
        write_new(output / 'complete.json', dict(complete=True, endpoint=4, updates=updates, consumption=dict(consumed), changedTensors=changed, history=history,
                                              modelPrefix=str(output / 'epoch-4'), modelSha256=digest(output / 'epoch-4.bin'), policyLossComparison='异目标Policy损失不横比'))
    except BaseException as error:
        try:
            save()
        finally:
            write_new(output / f'stop-{attempt}.json', dict(reason=repr(error), epoch=epoch, cursor=cursor, updates=updates, identity=identity))
        raise


if __name__ == '__main__':
    main()
