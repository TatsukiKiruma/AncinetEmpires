"""保持100局手机试训的策略先验、掩码、权重与六槽价值损失。"""
import torch
from torch.nn import functional as F


def loss(out, x, rows, policy_denominator=None, value_denominator=None):
    device = x['weight'].device
    prior = torch.zeros_like(out['logits'])
    for i, row in enumerate(rows):
        prior[i, :len(row['pointers'])] = torch.as_tensor(row['source']['prior'], device=device)
    pm = torch.tensor([bool(r['policyMask'].item()) for r in rows], device=device)
    pw = x['weight'] * pm
    vw = x['weight'] * x['valueMask']
    pden = pw.sum().clamp_min(1e-12) if policy_denominator is None else max(policy_denominator, 1e-12)
    vden = vw.sum().clamp_min(1e-12) if value_denominator is None else max(value_denominator, 1e-12)
    policy = (F.cross_entropy(out['logits'] + prior, x['target'], reduction='none') * pw).sum() / pden
    value_ce = -(x['valueTarget'] * out['valueLogits'].log_softmax(-1)).sum(-1)
    brier = (out['valueProbs'] - x['valueTarget']).square().sum(-1)
    value = ((value_ce + brier) * vw).sum() / vden
    return policy + value
