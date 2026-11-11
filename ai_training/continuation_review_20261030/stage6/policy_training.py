"""只训练因子化动作指针策略头；子集KL绝不向未展开动作传播梯度。"""
import hashlib
import torch
from torch.nn import functional as F

POLICY = {'who', 'tile_q', 'tile_k', 'what_entity', 'what_tile', 'target_q', 'target_k', 'target_rel', 'headBias'}

def freeze(model):
    model.eval()
    for name, parameter in model.named_parameters():
        parameter.requires_grad_(name.split('.')[0] in POLICY)
    return [p for p in model.parameters() if p.requires_grad]

def frozen_digest(model):
    digest = hashlib.sha256()
    for name, value in model.state_dict().items():
        if name.split('.')[0] not in POLICY:
            digest.update(name.encode())
            digest.update(value.detach().cpu().contiguous().numpy().tobytes())
    return digest.hexdigest()

def subset_kl(logits, rows):
    losses = []
    for i, row in enumerate(rows):
        selected = row['teacherMask'].to(logits.device)
        if int(selected.sum()) < 2:
            raise ValueError('教师有效子集少于两个动作')
        target = row['teacherProb'].to(logits.device)[selected]
        target = target / target.sum()
        logs = F.log_softmax(logits[i, :len(selected)][selected], -1)
        losses.append((target * (target.clamp_min(1e-30).log() - logs)).sum())
    return torch.stack(losses).mean()

def anchor_loss(logits, base_logits, target):
    logs = F.log_softmax(logits, -1)
    base_logs = F.log_softmax(base_logits.detach(), -1)
    ce = F.nll_loss(logs, target)
    trust = (base_logs.exp() * (base_logs - logs)).sum(-1).mean()
    return ce, trust

def verify_gradients(model):
    for name, parameter in model.named_parameters():
        if name.split('.')[0] not in POLICY and parameter.grad is not None and torch.count_nonzero(parameter.grad).item():
            raise ValueError('非策略头出现梯度：' + name)
