"""策略、边际行动者和可信多玩家结局的联合损失。"""
import torch
from torch.nn import functional as F


def multitask_loss(outputs, samples):
    zero = outputs[0]['logits'].sum() * 0
    policy, who, value, brier = [], [], [], []
    pw, vw = [], []
    for out, sample in zip(outputs, samples):
        weight = sample['weight'].flatten()[0]
        if sample['policyMask'].item():
            target = sample['policyTarget'].long().flatten()[0]
            policy.append(-F.log_softmax(out['logits'], 0)[target] * weight)
            actor = sample['pointers'][target, 0].long()
            # actorPrior由合法候选的边际质量组成，天然满足actorMask。
            who.append(-out['actorPrior'][actor].clamp_min(1e-30).log() * weight)
            pw.append(weight)
        if sample['valueMask'].item():
            target = sample['valueTarget'].float()
            value.append(-(target * F.log_softmax(out['valueLogits'], 0)).sum() * weight)
            brier.append((out['valueProbs'] - target).square().mean() * weight)
            vw.append(weight)
    lp = sum(policy, zero) / sum(pw).clamp_min(1e-12) if pw else zero
    lw = sum(who, zero) / sum(pw).clamp_min(1e-12) if pw else zero
    lv = sum(value, zero) / sum(vw).clamp_min(1e-12) if vw else zero
    lb = sum(brier, zero) / sum(vw).clamp_min(1e-12) if vw else zero
    return dict(total=lp + .25 * lw + lv + lb, policy=lp, who=lw, value=lv, brier=lb)
