"""A沿用流式尺寸攒批；B/C在尺寸桶内打乱并随机交错完整批次。"""
import random
from collections import defaultdict
from core import SEED


def batches(rows, arm, epoch):
    rng = random.Random(SEED + epoch)
    groups = defaultdict(list)
    result = []
    if arm == 'A':
        for i, row in enumerate(rows):
            key = tuple(row['spatial'].shape)
            groups[key].append(i)
            if len(groups[key]) == 8:
                result.append(groups[key])
                groups[key] = []
        result.extend(group for group in groups.values() if group)
    else:
        for i, row in enumerate(rows):
            groups[tuple(row['spatial'].shape)].append(i)
        for group in groups.values():
            rng.shuffle(group)
            result.extend(group[i:i+8] for i in range(0, len(group), 8))
        rng.shuffle(result)
    assert sorted(i for batch in result for i in batch) == list(range(len(rows)))
    return result
