"""仅价值头的批量训练原语，冻结参数身份每步检查。"""
import hashlib
import torch
from torch.nn import functional as F

VALUE = {'value1', 'value_norm', 'value2', 'army_scale'}


def freeze(model):
    for name, parameter in model.named_parameters():
        parameter.requires_grad_(name.split('.')[0] in VALUE)
    trainable = [p for p in model.parameters() if p.requires_grad]
    assert sum(p.numel() for p in trainable) == 175874
    assert sum(p.numel() for p in model.parameters() if not p.requires_grad) == 1791036
    return trainable


def frozen_digest(model):
    digest = hashlib.sha256()
    for name, parameter in model.named_parameters():
        if name.split('.')[0] not in VALUE:
            digest.update(name.encode())
            digest.update(parameter.detach().cpu().contiguous().numpy().tobytes())
    return digest.hexdigest()


def value_logits(model, vectors, players, active):
    logits = model.value2(F.relu(model.value_norm(model.value1(vectors)))).squeeze(-1)
    army = players[..., 7].clamp_min(0).double() * active
    logits = (logits.double() + model.army_scale.double() * army / army.sum(-1, keepdim=True).clamp_min(1e-12)).float()
    return logits.masked_fill(~active.bool(), -1e9)


def objective(logits, base_logits, target, active, trust, weights):
    if not torch.isfinite(logits).all() or not active.bool().any(-1).all():
        raise ValueError('价值预测或有效槽无效')
    if not torch.allclose(target.sum(-1), torch.ones_like(target.sum(-1))) or (target * ~active.bool()).any():
        raise ValueError('标签不属于有效槽')
    logs = F.log_softmax(logits, -1)
    probability = logs.exp()
    base_logs = F.log_softmax(base_logits.detach(), -1)
    ce = -(target * logs).sum(-1)
    # 与Stage3离线门禁一致，采用六槽平方误差之和。
    brier = (((probability - target) ** 2) * active).sum(-1)
    kl = (base_logs.exp() * (base_logs - logs)).sum(-1)
    return ((ce + brier + trust * kl) * weights).sum() / weights.sum()


def step(model, optimizer, batch, trust, identity):
    if frozen_digest(model) != identity:
        raise ValueError('冻结参数更新前身份变化')
    optimizer.zero_grad(set_to_none=True)
    logits = value_logits(model, batch['slot_vectors'], batch['players'], batch['active'])
    loss = objective(logits, batch['omniBaseValueLogits'], batch['valueTarget'], batch['active'], trust, batch['weights'])
    loss.backward()
    norm = torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1., error_if_nonfinite=True)
    optimizer.step()
    if frozen_digest(model) != identity:
        raise ValueError('冻结参数更新后身份变化')
    return {'loss': float(loss.detach()), 'gradientNorm': float(norm)}
