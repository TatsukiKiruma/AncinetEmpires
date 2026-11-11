"""手机同步多进程训练：所有worker累积同一全局批次的梯度，由单一AdamW更新。"""
import argparse
import datetime as dt
import json
import math
import multiprocessing as mp
import os
from pathlib import Path
import pickle
import platform
import random
import threading
import time
import traceback

import numpy as np
import torch
from torch.nn import functional as F
import train_phone as base
from model import DualStreamModel
from batch_model import collate, forward_batch

WORK = Path('/bench')
base.WORK = WORK
N = 1966910


def mapping(path):
    return torch.from_file(str(path), shared=True, size=N, dtype=torch.float32)


def bind(model, flat):
    offset = 0
    for p in model.parameters():
        count = p.numel()
        p.data = flat[offset:offset + count].view_as(p)
        offset += count
    assert offset == N


def objective(model, row, pden, vden, protocol):
    x = collate([row])
    output = forward_batch(model, x)
    prior = torch.tensor(row['source']['prior'], dtype=torch.float32)[None]
    ce = F.cross_entropy(output['logits'] + prior, x['target'], reduction='sum')
    value_ce = -(x['valueTarget'] * output['valueLogits'].log_softmax(-1)).sum()
    brier = (output['valueProbs'] - x['valueTarget']).square().sum()
    weight = float(row['weight'].item())
    policy = ce * (weight / max(pden, 1e-12)) * bool(row['policyMask'].item())
    value = (value_ce + brier) * (weight / max(vden, 1e-12)) * bool(row['valueMask'].item())
    loss = protocol['policyWeight'] * policy + protocol['valueWeight'] * value
    if not bool(torch.isfinite(loss)):
        raise RuntimeError('worker出现非有限损失')
    return loss, float(policy.detach()), float(value.detach())


def worker(pipe, rank, shared, protocol, restore_rng=None):
    try:
        torch.set_num_threads(protocol['torchThreadsPerWorker'])
        torch.set_num_interop_threads(1)
        torch.use_deterministic_algorithms(True)
        random.seed(protocol['seed'] + rank)
        np.random.seed(protocol['seed'] + rank)
        torch.manual_seed(protocol['seed'] + rank)
        model = DualStreamModel(seed=protocol['seed']).accurate_reductions(False)
        bind(model, mapping(shared / 'weights.bin'))
        grad = mapping(shared / f'gradient-{rank}.bin')
        model.train()
        if restore_rng is not None:
            random.setstate(restore_rng['python']); np.random.set_state(restore_rng['numpy']); torch.set_rng_state(torch.from_numpy(restore_rng['torch']))
        pipe.send({'ready': True, 'pid': os.getpid(), 'rank': rank, 'threads': torch.get_num_threads(), 'rngDigest': base.rng_digest(base.rng_state())})
        while True:
            task = pipe.recv()
            if task is None:
                break
            rows, pden, vden = task
            model.zero_grad(set_to_none=True)
            started = time.monotonic()
            ploss = vloss = 0.
            for encoded in rows:
                row = {key: torch.from_numpy(value) if isinstance(value, np.ndarray) else value for key, value in encoded.items()}
                loss, pl, vl = objective(model, row, pden, vden, protocol)
                loss.backward()
                ploss += pl
                vloss += vl
            offset = 0
            for p in model.parameters():
                count = p.numel()
                if p.grad is None:
                    grad[offset:offset + count].zero_()
                else:
                    grad[offset:offset + count].copy_(p.grad.reshape(-1))
                offset += count
            pipe.send({'policyLoss': ploss, 'valueLoss': vloss, 'samples': len(rows), 'computeSeconds': time.monotonic() - started, 'rng': {'python':random.getstate(),'numpy':np.random.get_state(),'torch':torch.get_rng_state().numpy().copy()}})
    except BaseException:
        pipe.send({'error': traceback.format_exc(), 'pid': os.getpid()})
        raise
    finally:
        pipe.close()


def receive(pipe, process):
    if not pipe.poll(180):
        raise RuntimeError(f'训练worker无响应：PID {process.pid}，exitcode={process.exitcode}')
    result = pipe.recv()
    if 'error' in result:
        raise RuntimeError(result['error'])
    return result


def proc(pid):
    fields = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
    memory = {'rssKiB': 0, 'pssKiB': 0}
    smaps = Path(f'/proc/{pid}/smaps_rollup')
    if not smaps.exists():
        smaps = Path(f'/proc/{pid}/smaps')
    for line in smaps.read_text().splitlines():
        if line.startswith('Rss:'):
            memory['rssKiB'] += int(line.split()[1])
        elif line.startswith('Pss:'):
            memory['pssKiB'] += int(line.split()[1])
    return {'pid': pid, 'startTicks': int(fields[19]), 'cpuTicks': int(fields[11]) + int(fields[12]), 'threads': int(fields[17]), **memory}


def monitor(out, pids, stop):
    previous = None
    while not stop.is_set():
        try:
            now = time.monotonic()
            ticks = list(map(int, Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
            total, idle = sum(ticks), ticks[3] + ticks[4]
            processes = [proc(pid) for pid in pids]
            record = {'epoch': time.time(), 'processes': processes, 'sumRssKiB': sum(p['rssKiB'] for p in processes), 'sumPssKiB': sum(p['pssKiB'] for p in processes),
                      'logicalCpus': os.cpu_count(), 'resource': base.load(WORK / 'RESOURCE.json')}
            if previous:
                elapsed = now - previous[0]
                record['intervalSeconds'] = elapsed
                record['processCpuPercentOneCore'] = (sum(p['cpuTicks'] for p in processes) - previous[3]) / os.sysconf('SC_CLK_TCK') / elapsed * 100
                record['deviceCpuPercent'] = (1 - (idle - previous[2]) / max(1, total - previous[1])) * 100
            previous = now, total, idle, sum(p['cpuTicks'] for p in processes)
            with (out / 'PERFORMANCE.jsonl').open('a', encoding='utf-8') as stream:
                stream.write(json.dumps(record) + '\n')
        except Exception as error:
            with (out / 'MONITOR_ERRORS.jsonl').open('a', encoding='utf-8') as stream:
                stream.write(json.dumps({'epoch': time.time(), 'error': str(error)}) + '\n')
        stop.wait(5)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workers', type=int, choices=[2, 3], required=True)
    args = parser.parse_args()
    launch = time.monotonic()
    if platform.machine() != 'aarch64':
        raise RuntimeError('仅允许小米手机执行优化器更新')
    auth = base.load(WORK / 'PHONE_AUTHORIZED.json')
    if auth['serial'] != 'c2357770' or auth['authorizedParents'] != 20:
        raise RuntimeError('授权身份或父局预算错误')
    for name, digest in auth['files'].items():
        if base.sha(WORK / name) != digest:
            raise RuntimeError('冻结源码或输入摘要变化：' + name)
    protocol = base.load(WORK / 'PROTOCOL.json')
    plan = base.load(WORK / 'PLAN.json')
    dataset = base.load(WORK / 'DATASET.json')
    segment = plan['segments'][args.workers - 2]
    reports = dataset['reports'][(args.workers - 2) * 10:(args.workers - 1) * 10]
    assert segment['parentIds'] == [r['parentId'] for r in reports]
    count = sum(r['samples'] for r in reports)
    out = WORK / segment['name']
    out.mkdir(exist_ok=True)
    if (out / 'STARTED.json').exists():
        raise RuntimeError('已启动过该段，拒绝静默重跑')
    base.atomic(out / 'STARTED.json', {'epoch': time.time(), 'pid': os.getpid(), 'workers': args.workers, 'samples': count})
    torch.set_num_threads(protocol['coordinatorThreads'])
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    seed = protocol['seed']
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    model = DualStreamModel(seed=seed).accurate_reductions(False)
    assert sum(p.numel() for p in model.parameters()) == N
    optimizer = torch.optim.AdamW(model.parameters(), lr=protocol['peakLearningRate'], betas=tuple(protocol['betas']), eps=protocol['eps'], weight_decay=protocol['weightDecay'], foreach=False, fused=False)
    total = protocol['referenceTotalUpdates']
    warm = math.ceil(total * protocol['warmupFraction'])
    ratio = protocol['endLearningRate'] / protocol['peakLearningRate']

    def factor(step):
        if step < warm:
            return (step + 1) / warm
        fraction = min(1., (step - warm) / max(1, total - warm))
        return ratio + (1 - ratio) * .5 * (1 + math.cos(math.pi * fraction))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, factor)
    if args.workers == 2:
        source = WORK / 'base-checkpoint.pt'
        expected = plan['baseCheckpointSha256']
    else:
        pointer = base.load(WORK / 'workers2/LATEST.json')
        source = WORK / 'workers2' / pointer['file']
        expected = pointer['sha256']
        assert base.load(WORK / 'workers2/COMPLETE.json')['status'] == 'complete'
    assert base.sha(source) == expected
    saved = torch.load(source, map_location='cpu', weights_only=False)
    model.load_state_dict(saved['model'])
    optimizer.load_state_dict(saved['optimizer'])
    scheduler.load_state_dict(saved['scheduler'])
    random.setstate(saved['rng']['python'])
    np.random.set_state(saved['rng']['numpy'])
    torch.set_rng_state(saved['rng']['torch'])
    checks = {'model': base.tensor_digest(model.state_dict()) == saved['digests']['model'], 'optimizer': base.tensor_digest(optimizer.state_dict()) == saved['digests']['optimizer'],
              'scheduler': base.tensor_digest(scheduler.state_dict()) == saved['digests']['scheduler'], 'rng': base.rng_digest(base.rng_state()) == saved['digests']['rng']}
    assert all(checks.values()), checks
    initial_step = step = saved['global_step']
    previous_samples = saved.get('cumulativeSamples', saved['cursor'])
    initial_rng = base.rng_state()
    del saved
    base.atomic(out / 'RESUME_VERIFIED.json', {'passed': True, 'checks': checks, 'sourceCheckpointSha256': expected, 'globalStep': step, 'cumulativeSamples': previous_samples})
    shared = out / 'shared'
    shared.mkdir(exist_ok=True)
    flat = mapping(shared / 'weights.bin')
    offset = 0
    for p in model.parameters():
        flat[offset:offset + p.numel()].copy_(p.detach().reshape(-1))
        offset += p.numel()
    bind(model, flat)
    grads = [mapping(shared / f'gradient-{rank}.bin') for rank in range(args.workers)]
    context = mp.get_context('spawn')
    processes, pipes = [], []
    monitor_stop = threading.Event()
    sampler = None
    cursor = generation = 0
    started = None
    totals = {'dataSeconds': 0., 'parallelComputeWallSeconds': 0., 'workerComputeSeconds': [0.] * args.workers, 'updateSeconds': 0., 'checkpointSeconds': 0., 'resourceWaitSeconds': 0., 'policyLabels': 0, 'valueLabels': 0}
    last_saved = time.monotonic()

    def progress(phase, extra=None):
        done = 0
        remaining = cursor
        for r in reports:
            if remaining < r['samples']:
                break
            done += 1
            remaining -= r['samples']
        record = {'phase': phase, 'workers': args.workers, 'cursor': cursor, 'samples': count, 'completedParents': done, 'parents': 10, 'globalStep': step,
                  'segmentUpdates': step - initial_step, 'wallSeconds': time.monotonic() - started if started else 0, 'totals': totals, 'epoch': time.time(), 'automaticFullTraining': False}
        if extra:
            record.update(extra)
        base.atomic(out / 'PROGRESS.json', record)

    def checkpoint(reason):
        nonlocal generation, last_saved
        tick = time.monotonic()
        generation += 1
        rng = base.rng_state()
        state = {'model': model.state_dict(), 'optimizer': optimizer.state_dict(), 'scheduler': scheduler.state_dict(), 'rng': rng, 'global_step': step, 'cursor': cursor,
                 'cumulativeSamples': previous_samples + cursor, 'segment': segment, 'parentOrder': segment['parentIds'], 'pendingAccumulatedGradients': False,
                 'totals': totals, 'initialCheckpointSha256': expected, 'completedParentsBeforeSegment': 100 if args.workers == 2 else 110,
                 'identity': auth['files'], 'reason': reason, 'generation': generation}
        state['digests'] = {'model': base.tensor_digest(state['model']), 'optimizer': base.tensor_digest(state['optimizer']), 'scheduler': base.tensor_digest(state['scheduler']), 'rng': base.rng_digest(rng)}
        target = out / f'checkpoint-{generation % 2}.pt'
        temporary = target.with_suffix('.pending.pt')
        with temporary.open('wb') as stream:
            torch.save(state, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
        pointer = {'file': target.name, 'sha256': base.sha(target), 'globalStep': step, 'cursor': cursor, 'reason': reason, 'stateDigests': state['digests']}
        base.atomic(out / 'LATEST.json', pointer)
        totals['checkpointSeconds'] += time.monotonic() - tick
        last_saved = time.monotonic()
        return pointer

    try:
        for rank in range(args.workers):
            parent, child = context.Pipe()
            process = context.Process(target=worker, args=(child, rank, shared, protocol), name=f'train-worker-{rank}')
            process.start()
            child.close()
            processes.append(process)
            pipes.append(parent)
        identities = [receive(pipe, process) for pipe, process in zip(pipes, processes)]
        # 子进程创建后恢复父进程RNG，避免调度器初始化消耗训练随机状态。
        random.setstate(initial_rng['python'])
        np.random.set_state(initial_rng['numpy'])
        torch.set_rng_state(initial_rng['torch'])
        base.atomic(out / 'WORKERS.json', {'coordinator': proc(os.getpid()), 'workers': [proc(item['pid']) for item in identities], 'effectiveBatch': 8,
                                         'threadsPerWorker': protocol['torchThreadsPerWorker'], 'synchronization': '每批只读共享权重，各自私有梯度缓冲，完成屏障后汇总并执行一次AdamW'})
        sampler = threading.Thread(target=monitor, args=(out, [os.getpid()] + [p.pid for p in processes], monitor_stop), daemon=True)
        sampler.start()
        iterator = base.samples({'reports': reports}, 0, set())
        started = time.monotonic()
        base.atomic(out / 'TIMING_START.json', {'epoch': time.time(), 'setupSeconds': started - launch})
        progress('training')
        paused = False
        while cursor < count:
            pause_start = time.monotonic()
            waiting = False
            while True:
                if (WORK / 'STOP').exists():
                    checkpoint('user_stop')
                    progress('stopped')
                    return 2
                try:
                    resource = base.load(WORK / 'RESOURCE.json')
                    if not resource['valid'] or time.time() - resource['epoch'] > 30:
                        raise RuntimeError('资源监测无效或过期')
                    fs = os.statvfs(WORK)
                    free = fs.f_bavail * fs.f_frsize
                    if paused:
                        paused = not (resource['temperatureC'] <= protocol['temperatureResumeC'] and resource['batteryPercent'] >= protocol['batteryResumePercent'] and free >= protocol['freeSpaceResumeBytes'])
                    else:
                        paused = resource['temperatureC'] >= protocol['temperaturePauseC'] or resource['batteryPercent'] < protocol['batteryPausePercent'] or free < protocol['freeSpacePauseBytes']
                    if not paused:
                        break
                except Exception:
                    paused = True
                if not waiting:
                    checkpoint('resource_wait')
                waiting = True
                progress('waiting_resources')
                time.sleep(5)
            if waiting:
                totals['resourceWaitSeconds'] += time.monotonic() - pause_start
            tick = time.monotonic()
            rows = [next(iterator) for _ in range(min(8, count - cursor))]
            pden = sum(float(r['weight'].item()) * bool(r['policyMask'].item()) for r in rows)
            vden = sum(float(r['weight'].item()) * bool(r['valueMask'].item()) for r in rows)
            encoded = [{k: v.numpy() if isinstance(v, torch.Tensor) else v for k, v in row.items()} for row in rows]
            totals['dataSeconds'] += time.monotonic() - tick
            tick = time.monotonic()
            for rank, pipe in enumerate(pipes):
                pipe.send((encoded[rank::args.workers], pden, vden))
            results = [receive(pipe, process) for pipe, process in zip(pipes, processes)]
            totals['parallelComputeWallSeconds'] += time.monotonic() - tick
            for rank, result in enumerate(results):
                totals['workerComputeSeconds'][rank] += result['computeSeconds']
            assert sum(r['samples'] for r in results) == len(rows)
            # 首个实际批次仅额外计算一次串行梯度，核对并行归一化；不额外更新、不执行重放。
            aggregate = torch.zeros(N)
            for grad in grads:
                aggregate.add_(grad)
            if cursor == 0:
                verify_start = time.monotonic()
                model.zero_grad(set_to_none=True)
                for row in rows:
                    objective(model, row, pden, vden, protocol)[0].backward()
                serial = torch.cat([p.grad.reshape(-1) if p.grad is not None else torch.zeros(p.numel()) for p in model.parameters()])
                difference = float((serial - aggregate).abs().max())
                relative_l2 = float(torch.linalg.vector_norm(serial - aggregate) / torch.linalg.vector_norm(serial).clamp_min(1e-12))
                passed = bool(torch.allclose(serial, aggregate, rtol=2e-3, atol=2e-5)) and relative_l2 < 1e-4
                verify_seconds = time.monotonic() - verify_start
                totals['gradientVerificationSeconds'] = verify_seconds
                base.atomic(out / 'GRADIENT_VERIFIED.json', {'passed': passed, 'maximumAbsoluteDifference': difference, 'relativeL2Difference': relative_l2, 'samples': len(rows), 'additionalOptimizerUpdates': 0, 'seconds': verify_seconds})
                if not passed:
                    raise RuntimeError('多worker梯度与串行批次不一致')
                del serial
            tick = time.monotonic()
            offset = 0
            for p in model.parameters():
                p.grad = aggregate[offset:offset + p.numel()].view_as(p)
                offset += p.numel()
            norm = torch.nn.utils.clip_grad_norm_(model.parameters(), protocol['gradientClipNorm'], error_if_nonfinite=True, foreach=False)
            optimizer.step()
            scheduler.step()
            cursor += len(rows)
            step += 1
            totals['updateSeconds'] += time.monotonic() - tick
            totals['policyLabels'] += int(pden)
            totals['valueLabels'] += int(vden)
            with (out / 'METRICS.jsonl').open('a', encoding='utf-8') as stream:
                stream.write(json.dumps({'globalStep': step, 'cursor': cursor, 'samples': len(rows), 'policyLoss': sum(r['policyLoss'] for r in results), 'valueLoss': sum(r['valueLoss'] for r in results),
                                         'gradientNorm': float(norm), 'nextLearningRate': optimizer.param_groups[0]['lr'], 'epoch': time.time()}) + '\n')
            if cursor == len(rows) or (step - initial_step) % protocol['checkpointEveryUpdates'] == 0 or time.monotonic() - last_saved >= protocol['checkpointEverySeconds']:
                checkpoint('periodic')
            progress('training')
        try:
            next(iterator)
            raise RuntimeError('输入超过授权十局')
        except StopIteration:
            pass
        assert step - initial_step == math.ceil(count / 8)
        final = checkpoint('authorized_ten_parents_complete')
        wall = time.monotonic() - started
        base.atomic(out / 'COMPLETE.json', {'status': 'complete', 'workers': args.workers, 'parentRange': segment['parentRange'], 'parents': 10, 'samples': cursor, 'updates': step - initial_step,
                                          'globalStep': step, 'cumulativeSamples': previous_samples + cursor, 'wallSeconds': wall, 'setupSeconds': started - launch,
                                          'samplesPerSecond': cursor / wall, 'timedTrainingSecondsExcludingGradientCheck': wall - totals['gradientVerificationSeconds'],
                                          'totals': totals, 'finalCheckpoint': final, 'automaticFullTraining': False, 'completedUtc': dt.datetime.now(dt.timezone.utc).isoformat()})
        progress('complete')
        return 0
    finally:
        monitor_stop.set()
        if sampler:
            sampler.join(10)
        for pipe in pipes:
            try:
                pipe.send(None)
            except (OSError, EOFError):
                pass
        for process in processes:
            process.join(10)
            if process.is_alive():
                process.terminate()
                process.join(5)
        for pipe in pipes:
            pipe.close()


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        base.atomic(WORK / f'ERROR-{int(time.time())}.json', {'error': traceback.format_exc(), 'pid': os.getpid(), 'epoch': time.time()})
        raise
