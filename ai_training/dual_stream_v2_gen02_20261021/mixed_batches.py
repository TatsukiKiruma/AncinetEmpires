"""跨源确定性交错和有界洗牌，恢复时按相同输入重放并跳过已保存游标。"""
import random
import json
import os
import subprocess
from collections import defaultdict
from data import batches, DIR, ROOT


def shuffled_batches(sources, seed, max_samples=128, max_bytes=64_000_000, batch_size=16, receipt=None, source_sizes=None):
    rng = random.Random(seed)
    iterators = [iter(s) for s in sources]
    active = list(range(len(iterators)))
    sizes = source_sizes or [1] * len(iterators)
    delivered = [0] * len(iterators)
    pools = defaultdict(list)
    buffered = used = maximum = 0

    def size(sample):
        return sum(v.numel() * v.element_size() for v in sample.values() if hasattr(v, 'numel'))

    def flush(key):
        nonlocal buffered, used
        pool = pools[key]
        selected = []
        for _ in range(min(batch_size, len(pool))):
            sample = pool.pop(rng.randrange(len(pool)))
            used -= size(sample)
            buffered -= 1
            selected.append(sample)
        if receipt is not None:
            receipt['batches'] = receipt.get('batches', 0) + 1
            receipt['crossParentBatches'] = receipt.get('crossParentBatches', 0) + int(len({s['source']['parent'] for s in selected}) > 1)
            receipt['crossSourceBatches'] = receipt.get('crossSourceBatches', 0) + int(len({s['source']['trainingSource'] for s in selected}) > 1)
        return selected

    while active:
        # 按源的样本消费比例调度，不能让小批次专家流在基础流耗尽后留下长尾。
        for source in [min(active, key=lambda i: (delivered[i] / max(1, sizes[i]), i))]:
            try:
                incoming = next(iterators[source])
            except StopIteration:
                active.remove(source)
                continue
            delivered[source] += len(incoming)
            for sample in incoming:
                while buffered and (buffered >= max_samples or used + size(sample) > max_bytes):
                    yield flush(max(pools, key=lambda k: len(pools[k])))
                if size(sample) > max_bytes:
                    raise RuntimeError('单个编码样本超过内存合同')
                sample['source']['trainingSource'] = 'base' if source == 0 else 'expert'
                key = tuple(sample['spatial'].shape)
                pools[key].append(sample)
                used += size(sample)
                buffered += 1
                maximum = max(maximum, used)
            while buffered >= max_samples or used >= max_bytes:
                yield flush(max(pools, key=lambda k: len(pools[k])))
    for key in sorted(pools):
        while pools[key]:
            yield flush(key)
    if receipt is not None:
        receipt['maximumBufferedBytes'] = maximum
        receipt['denseFeatureFiles'] = 0
        receipt['sourceSizes'] = sizes
        receipt['deliveredSamples'] = delivered


def mixed_batches(epoch, receipt=None):
    command = ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_gen02_20261021/source_counts.ts']
    subprocess.run(command, cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    counts = json.loads((DIR / f"generations/gen_{int(os.environ['LEAGUE_GENERATION']):02d}/source-counts.json").read_text('utf-8'))
    return shuffled_batches([batches('train', epoch, stream='dual_stream_v2_gen02_20261021/stream.ts'), batches('train', epoch, stream='dual_stream_v2_gen02_20261021/league_stream.ts')], 20261023 + epoch, receipt=receipt, source_sizes=[counts['base'], counts['expert']])
