"""冻结表征上的联合策略修复：冠军保留、原子纠错和训练机会约束。"""
import torch
from torch.nn import functional as F
from prior_distillation import inference_scores, policy_loss


def opportunity_loss(score, x, samples, margin=.5):
    terms = []
    for i, sample in enumerate(samples):
        n = len(sample['pointers']); ptr = x['ptr'][i, :n]
        actors = sample['source'].get('wasteActors', [])
        waste = (ptr[:, 2] == 4) & torch.tensor([int(a) in actors for a in ptr[:, 0]])
        other = (ptr[:, 2] != 4) & (ptr[:, 2] != 13)
        if waste.any() and other.any():
            terms.append(F.relu(margin + score[i, :n][waste].max() - score[i, :n][other].max()))
    return torch.stack(terms).mean() if terms else score.sum() * 0.


def champion_head_loss(score, reference, x, samples):
    terms = []
    for i, sample in enumerate(samples):
        n = len(sample['pointers']); heads = x['ptr'][i, :n, 2]
        chosen = int(reference[i, :n].argmax()); head = heads[chosen]
        # 只保护冠军在训练标签上已经正确的动作头；违例待机不充当保护目标。
        if head != heads[x['target'][i]]: continue
        if int(head) == 4 and int(x['ptr'][i, chosen, 0]) in sample['source'].get('wasteActors', []): continue
        same = heads == head
        if (~same).any(): terms.append(F.relu(.2 + score[i, :n][~same].max() - score[i, :n][same].max()))
    return torch.stack(terms).mean() if terms else score.sum() * 0.


def joint_loss(kind, student, champion, x, samples, bias):
    if kind == 'expert': return policy_loss(kind, student, champion, x, samples, bias)
    score = inference_scores(student, x, samples, bias)
    reference = inference_scores(champion, x, samples, bias)
    kl = F.kl_div(score.log_softmax(-1), reference.softmax(-1), reduction='none').sum(-1)
    protect = champion_head_loss(score, reference, x, samples)
    opportunity = opportunity_loss(score, x, samples)
    if kind == 'constraint': return kl.mean() + .5 * protect + 10. * opportunity
    weights = x['weight'] * x['quality']
    ce = F.cross_entropy(score, x['target'], reduction='none')
    return ((2. * kl + .2 * ce) * weights).sum() / weights.sum().clamp_min(1e-12) + .5 * protect + opportunity
