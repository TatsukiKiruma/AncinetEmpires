"""冻结参数、真实推理分数及纠错专用损失，独立于训练调度。"""
import torch
from torch.nn import functional as F

POLICY_PREFIXES = ('who.', 'tile_q.', 'tile_k.', 'what_entity.', 'what_tile.', 'target_q.', 'target_k.', 'target_rel')


def freeze_policy_only(model):
    for name, parameter in model.named_parameters():
        parameter.requires_grad_(name.startswith(POLICY_PREFIXES))
    assert not model.headBias.requires_grad
    return [p for p in model.parameters() if p.requires_grad]


def inference_scores(out, x, samples, bias):
    # 与TS解码器一样，在网络float32输出后以float64加入外置偏置和先验。
    prior = torch.zeros_like(out['logits'], dtype=torch.float64)
    for i, sample in enumerate(samples):
        values = sample['source']['prior']
        prior[i, :len(values)] = torch.tensor(values, dtype=torch.float64)
    return (out['logits'].double() + bias[x['ptr'][:, :, 2]] + prior).masked_fill(~x['actionMask'], -1e9)


def policy_loss(kind, student, champion, x, samples, bias):
    score = inference_scores(student, x, samples, bias)
    reference = inference_scores(champion, x, samples, bias)
    kl = F.kl_div(score.log_softmax(-1), reference.softmax(-1), reduction='none').sum(-1)
    ce = F.cross_entropy(score, x['target'], reduction='none')
    if kind == 'base':
        per = kl + .20 * ce
        weights = x['weight'] * x['quality']
    else:
        assert all(s['source']['correction'] is True for s in samples)
        preferred = torch.tensor([s['source']['purePreferredIndex'] for s in samples])
        rows = torch.arange(len(samples))
        margin = F.relu(.5 + score[rows, preferred] - score[rows, x['target']])
        semantic = torch.tensor([s['source']['semanticWeight'] for s in samples])
        # wait/end只保留冠军KL，不能以硬标签或margin挤压战术头。
        per = semantic * (margin + .5 * ce) + .5 * kl
        weights = torch.ones(len(samples))
    return (per * weights).sum() / weights.sum().clamp_min(1e-12)


def assert_frozen_equal(model, teacher):
    reference = teacher.state_dict()
    for name, parameter in model.named_parameters():
        if not parameter.requires_grad:
            assert torch.equal(parameter, reference[name]), f'冻结参数漂移:{name}'
