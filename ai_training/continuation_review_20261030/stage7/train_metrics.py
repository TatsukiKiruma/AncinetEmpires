"""自然结果的父局等权 Brier、槽位 ECE 和有效教师子集 KL。"""
from collections import defaultdict
from statistics import mean

from fp32_forward import forward, torch
from common import move
from ragged_batch import collate
from train_data import tensor_target


def subset(logits, row):
    mask, expected = tensor_target(row['source'], logits.device)
    p = expected[mask]
    p = p / p.sum()
    return (p * (p.clamp_min(1e-30).log() - logits[:len(mask)][mask].log_softmax(-1))).sum()


def brier_ce(out, x):
    brier = (out['valueProbs'] - x['valueTarget']).square().sum(-1)
    ce = -(x['valueTarget'] * out['valueLogits'].log_softmax(-1)).sum(-1)
    return brier, ce


def metrics(model, dev):
    parents, slots, teachers = defaultdict(lambda: defaultdict(list)), defaultdict(list), defaultdict(list)
    with torch.inference_mode():
        for i in range(0, len(dev), 8):
            rows = dev[i:i + 8]
            x = move(collate(rows), 'cuda')
            out = forward(model, x)
            scores = (out['valueProbs'] - x['valueTarget']).square().sum(-1).cpu().tolist()
            probabilities = out['valueProbs'].cpu().tolist()
            for j, row in enumerate(rows):
                s = row['source']; n = s['players']
                if s['split'] != 'dev' or not row['valueMask'].item():
                    raise ValueError('离线开发集包含非自然价值标签')
                parents[n][s['parentId']].append(scores[j])
                slots[n].extend((p, t) for p, t, a in zip(probabilities[j], row['valueTarget'].tolist(), row['active'].tolist()) if a)
                if s['teacherValid']:
                    teachers[n].append(float(subset(out['logits'][j], row)))
    groups = {}
    for n in (2, 3, 4):
        buckets = [[] for _ in range(10)]
        for p, t in slots[n]:
            buckets[min(9, max(0, int(p * 10)))].append(p - t)
        groups[n] = dict(brier=mean(mean(v) for v in parents[n].values()),
                         ece=sum(abs(sum(b)) for b in buckets) / len(slots[n]), subsetKL=mean(teachers[n]),
                         parents=len(parents[n]), slots=len(slots[n]), teachers=len(teachers[n]))
    return {**{k: mean(row[k] for row in groups.values()) for k in ('brier', 'ece', 'subsetKL')}, 'byPlayers': groups}
