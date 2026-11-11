"""CPU 数组整理与批量指针映射，复用锁页缓冲区；保留真实地图和实体掩码。"""
import numpy as np
import torch

BUCKETS = (1, 2, 4, 8, 16, 32, 64, 128, 256)

class Collator:
    def __init__(self):
        self.cache = {}

    def __call__(self, rows):
        count = len(rows)
        if not 1 <= count <= 256:
            raise ValueError('批次必须包含1至256个真实观测')
        b = next(v for v in BUCKETS if v >= count)
        n = max(len(r['entities']) for r in rows)
        a = max(1, max(len(r['pointers']) for r in rows))
        h = (max(r['spatial'].shape[-2] for r in rows) + 3) // 4 * 4
        w = (max(r['spatial'].shape[-1] for r in rows) + 3) // 4 * 4
        shapes = {'spatial': (b, 34, h, w), 'raw': (b, n, 66), 'rel': (b, n, n, 16),
                  'players': (b, 6, 11), 'active': (b, 6), 'ptr': (b, a, 5),
                  'entityMask': (b, n + 1), 'actionMask': (b, a), 'sizes': (b, 2)}
        key = (b, n, a, h, w)
        if key not in self.cache:
            # 缓存有界，避免异质根的实体数和动作数使锁页内存无限增长。
            if len(self.cache) >= 4:
                self.cache.pop(next(iter(self.cache)))
            self.cache[key] = {k: torch.empty(shape, dtype=torch.int64 if k in ('ptr', 'sizes') else
                torch.bool if k in ('active', 'entityMask', 'actionMask') else torch.float32, pin_memory=True)
                for k, shape in shapes.items()}
        host = self.cache[key]
        arrays = {k: v.numpy() for k, v in host.items()}
        for v in arrays.values():
            v.fill(0)
        arrays['sizes'][:] = (h, w)
        arrays['entityMask'][:, n] = True
        lengths = np.zeros((b, 2), dtype=np.int64)
        widths = np.ones(b, dtype=np.int64)
        # 每行仅复制连续切片；指针、掩码和坐标变换在整批上向量化。
        for i, row in enumerate(rows):
            ni, ai = len(row['entities']), len(row['pointers'])
            hi, wi = row['spatial'].shape[-2:]
            lengths[i] = (ni, ai)
            widths[i] = wi
            arrays['sizes'][i] = (hi, wi)
            arrays['spatial'][i, :, :hi, :wi] = row['spatial'].numpy()
            arrays['raw'][i, :ni] = row['entities'].numpy()
            arrays['rel'][i, :ni, :ni] = row['relations'].numpy()
            arrays['players'][i] = row['players'].numpy()
            arrays['active'][i] = row['active'].numpy()
            arrays['ptr'][i, :ai] = row['pointers'].numpy()
        p = arrays['ptr']
        p[:, :, 0] = np.where(p[:, :, 0] == lengths[:, 0, None], n, p[:, :, 0])
        tiles = p[:, :, 1]
        p[:, :, 1] = np.where(tiles >= 0, (tiles // widths[:, None]) * w + tiles % widths[:, None], tiles)
        arrays['entityMask'][:, :n] = np.arange(n)[None, :] < lengths[:, 0, None]
        arrays['actionMask'][:] = np.arange(a)[None, :] < lengths[:, 1, None]
        return {k: v.to('cuda', non_blocking=True) for k, v in host.items()}

def cpu_output(out):
    names = ('logits', 'valueLogits', 'valueProbs', 'actorPrior')
    # 所有字段合并后只做一次有限性检查，标志随同一次 CPU 回传。
    widths = [out[k].shape[1] for k in names]
    joined = torch.cat([out[k] for k in names], dim=1)
    checked = torch.cat([joined.flatten(), torch.isfinite(joined).all().reshape(1).float()]).cpu().numpy()
    if checked[-1] != 1:
        raise ValueError('整批推理含非有限数')
    return np.split(checked[:-1].reshape(joined.shape), np.cumsum(widths)[:-1], axis=1)
