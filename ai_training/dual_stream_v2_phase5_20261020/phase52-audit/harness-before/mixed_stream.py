"""按预计样本比例均匀交错两个有界流，恢复时重放相同的批次顺序。"""
def interleave_batches(base, expert, base_samples, expert_samples):
    streams = [iter(base), iter(expert)]
    totals = [max(1, base_samples), max(1, expert_samples)]
    consumed = [0, 0]
    live = {0, 1}
    try:
        while live:
            index = min(live, key=lambda i: (consumed[i] / totals[i], i))
            try:
                samples = next(streams[index])
            except StopIteration:
                live.remove(index)
                continue
            consumed[index] += len(samples)
            yield ('base' if index == 0 else 'expert'), samples
    finally:
        for stream in streams:
            if hasattr(stream, 'close'):
                stream.close()


def expert_quality(source):
    # 旧代原始标签逐字节保留，训练读取时统一应用新合同。
    return 1.5 if source.get('correction') else 1.0


def cosine_learning_rate(fraction):
    import math
    return 3e-6 + (3e-5 - 3e-6) * .5 * (1 + math.cos(math.pi * min(1., max(0., fraction))))
