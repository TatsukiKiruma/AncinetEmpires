"""桌面CPU/CUDA/ROCm完整2M训练；新输出目录隔离历史手机任务。"""
import argparse
import itertools
import json
import math
from pathlib import Path
import time
import torch
from common import ROOT, device_for, identity, load_model, move, save, sha, synchronize
from batch_model import collate, forward_batch
from data import samples, groups
from objective import loss


def main():
    main_start = time.perf_counter()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', default='auto')
    parser.add_argument('--dataset', type=Path, default=ROOT / 'ai_training/phone_2m_scratch100_20261024/DATASET.json')
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'ai_training/phone_2m_scratch100_20261024/data')
    parser.add_argument('--parents', type=int, default=100)
    parser.add_argument('--batch-size', type=int, default=8)
    parser.add_argument('--microbatch', type=int, default=8)
    parser.add_argument('--max-updates', type=int, default=0, help='仅用于冒烟；0表示完整一遍')
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--seed', type=int, default=20261024)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if min(args.parents, args.batch_size, args.microbatch, args.threads) < 1 or args.max_updates < 0:
        parser.error('父局数、批次和线程须为正整数')
    device = device_for(args.device)
    args.out.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    dataset = json.loads(args.dataset.read_text('utf-8'))
    rows = iter(samples(dataset, args.data_dir, args.parents))
    model = load_model(seed=args.seed).to(device).train()
    if sum(p.numel() for p in model.parameters() if p.requires_grad) != 1966910:
        raise RuntimeError('完整2M可训练参数合同变化')
    optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4, foreach=False, fused=False)
    total, warm = 725697, math.ceil(725697 * .05)
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lambda step: (step + 1) / warm if step < warm else .1 + .9 * .5 * (1 + math.cos(math.pi * min(1., (step - warm) / (total - warm)))))
    receipt = dict(environment=identity(device), datasetSha256=sha(args.dataset), seed=args.seed,
                   initialization='random', parameters=1966910, parents=args.parents, batchSize=args.batch_size,
                   microbatch=args.microbatch, dtype='float32', requestedMaxUpdates=args.max_updates,
                   parentIds=[r['parentId'] for r in dataset['reports'][:args.parents]],
                   timingScope='wallSeconds含数据读取/训练；endToEndSeconds另含最终保存；mainSeconds另含模型初始化，不含Python导入')
    model.export(args.out / 'initial')
    save(args.out / 'RUN.json', receipt)
    initial = {n: p.detach().cpu().clone() for n, p in model.named_parameters()}
    start = time.perf_counter()
    cursor = updates = 0
    data_seconds = compute_seconds = 0.
    seen = set()
    try:
        while True:
            read_start = time.perf_counter()
            batch = list(itertools.islice(rows, args.batch_size))
            data_seconds += time.perf_counter() - read_start
            if not batch:
                break
            synchronize(device)
            compute_start = time.perf_counter()
            optimizer.zero_grad(set_to_none=True)
            pden = sum(float(r['weight'].item()) * bool(r['policyMask'].item()) for r in batch)
            vden = sum(float(r['weight'].item()) * bool(r['valueMask'].item()) for r in batch)
            objective = 0.
            # 不同地图分成同尺寸微批次，仍按完整有效批次归一化并只更新一次。
            for micro in groups(batch, args.microbatch):
                x = move(collate(micro), device)
                value = loss(forward_batch(model, x), x, micro, pden, vden)
                if not torch.isfinite(value):
                    raise RuntimeError('损失出现非有限值')
                value.backward()
                objective += float(value.detach())
            norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1., error_if_nonfinite=True, foreach=False)
            if updates == 0:
                seen = {n for n, p in model.named_parameters() if p.grad is not None}
            optimizer.step()
            scheduler.step()
            synchronize(device)
            compute_seconds += time.perf_counter() - compute_start
            cursor += len(batch)
            updates += 1
            progress = dict(samples=cursor, updates=updates, loss=objective, gradientNorm=float(norm),
                            wallSeconds=time.perf_counter() - start, dataSeconds=data_seconds, computeSeconds=compute_seconds)
            if updates == 1 or updates % 100 == 0:
                save(args.out / 'PROGRESS.json', progress)
                print(json.dumps(progress), flush=True)
            if args.max_updates and updates >= args.max_updates:
                break
        complete = cursor == sum(r['samples'] for r in dataset['reports'][:args.parents])
        if complete:
            # 即使短测上限恰好落在尾批，也必须耗尽生成器以核对末局计数。
            try:
                next(rows)
            except StopIteration:
                pass
            else:
                raise ValueError('分片含超出manifest计数的样本')
        state = dict(model=model.state_dict(), optimizer=optimizer.state_dict(), scheduler=scheduler.state_dict(),
                     cursor=cursor, updates=updates, rng=torch.get_rng_state(),
                     gpuRng=torch.cuda.get_rng_state_all() if device.type == 'cuda' else None, receipt=receipt)
        torch.save(state, args.out / 'checkpoint.pt')
        model.export(args.out / 'final')
        changed = [n for n, p in model.named_parameters() if not torch.equal(initial[n], p.detach().cpu())]
        save(args.out / 'RESULT.json', dict(progress, status='complete' if complete else 'smoke_only',
             completeParents=args.parents if complete else None, changedTensors=len(changed), gradientTensors=len(seen),
             optimizerParameters=sum(v['exp_avg'].numel() for v in optimizer.state.values()),
             endToEndSeconds=time.perf_counter() - start, checkpointSha256=sha(args.out / 'checkpoint.pt'),
             mainSeconds=time.perf_counter() - main_start,
             peakGpuBytes=torch.cuda.max_memory_allocated(device) if device.type == 'cuda' else 0))
    except Exception as error:
        save(args.out / 'ERROR.json', dict(error=repr(error), samples=cursor, updates=updates))
        raise


if __name__ == '__main__':
    main()
