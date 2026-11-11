"""固定实体表征上的真实候选KL、动作头监督与机会约束。"""
import torch
from torch.nn import functional as F


def adjusted_scores(cache, weight, bias):
    semantic = F.linear(cache['features'], weight, bias)
    row = torch.arange(len(cache['target']))[:, None]
    return (cache['score'] + semantic[row, cache['actor'], cache['head']].double()).masked_fill(~cache['mask'], -1e9)


def loss(kind, score, cache, protocol):
    lp = score.log_softmax(-1)
    kl = F.kl_div(lp, cache['teacher'], reduction='none').sum(-1)
    rows = torch.arange(len(score)); target = cache['target']
    ce = F.cross_entropy(score, target, reduction='none')
    if kind == 'expert':
        margin = F.relu(protocol['margin'] + score[rows, cache['preferred']] - score[rows, target])
        return (cache['semantic'] * (margin + .5 * ce) + .5 * kl).mean()
    waste = score.masked_fill(~cache['waste'], -1e9).max(-1).values
    other = score.masked_fill(~cache['other'], -1e9).max(-1).values
    valid = cache['waste'].any(-1) & cache['other'].any(-1)
    opportunity = F.relu(protocol['margin'] + waste - other)[valid].mean() if valid.any() else score.sum() * 0.
    if kind == 'constraint': return protocol['constraintKl'] * kl.mean() + protocol['constraintOpportunityWeight'] * opportunity
    # 解码按每个动作头的最大分数决定；头监督直接对齐此统计，避免候选数量冲刷。
    head_scores = torch.full((len(score), 15), -1e9, dtype=score.dtype).scatter_reduce(1, cache['head'], score, reduce='amax', include_self=True)
    head_ce = F.cross_entropy(head_scores, cache['head'][rows, target], reduction='none')
    hard = cache['hardMask']; weights = cache['weights']
    supervised = (protocol['baseActionCe'] * ce + protocol['baseHeadCe'] * head_ce) * hard
    return ((protocol['baseKl'] * kl + supervised) * weights).sum() / weights.sum().clamp_min(1e-12) + protocol['baseOpportunityWeight'] * opportunity
