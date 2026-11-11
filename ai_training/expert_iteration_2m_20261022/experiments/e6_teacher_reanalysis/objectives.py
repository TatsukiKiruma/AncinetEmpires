"""策略与价值分离计算；偏好每态均值防止多对放大该状态权重。"""
import torch
from torch.nn import functional as F
from core import collate, forward_batch


def objective(model, rows, arm):
    x = collate(rows)
    out = forward_batch(model, x)
    prior = torch.zeros_like(out['logits'])
    for i, row in enumerate(rows):
        prior[i, :len(row['pointers'])] = torch.tensor(row['source']['prior'])
    score = out['logits'] + prior
    losses, enabled = [], []
    for i, row in enumerate(rows):
        source = row['source']
        active = bool(row['policyMask'].item())
        if arm == 'C' and source['source'] == 'search-expert':
            pairs = source.get('preferences', [])
            term = torch.stack([F.softplus(-(score[i, a] - score[i, b])) for a, b in pairs]).mean() if pairs else score[i, 0] * 0
            weight = source['parentPolicyScale']
            active = bool(pairs)
        elif target := source.get('searchTarget'):
            indices = torch.tensor([r['index'] for r in target], dtype=torch.long)
            probabilities = torch.tensor([r['score'] for r in target]).div(.5).softmax(0)
            term = -(probabilities * score[i, indices].log_softmax(0)).sum()
            weight = source['parentPolicyScale'] * source['quality']
        else:
            term = -score[i].log_softmax(0)[x['target'][i]]
            weight = source['parentPolicyScale'] * source['quality']
        losses.append(term * weight * active)
        enabled.append(active)
    policy = torch.stack(losses).mean()
    nll = -(x['valueTarget'] * out['valueLogits'].log_softmax(-1)).sum(-1)
    brier = (out['valueProbs'] - x['valueTarget']).square().sum(-1)
    weights = x['valueMask'].float() * torch.tensor([r['source']['parentValueScale'] for r in rows])
    value = ((nll + brier) * weights).mean()
    return policy, value, dict(policy=float(policy.detach()), value=float(value.detach()), policySamples=sum(enabled), valueSamples=int(x['valueMask'].sum()), samples=len(rows))


def gradient_scale(loss, parameters):
    grads = torch.autograd.grad(loss, parameters, retain_graph=True, allow_unused=True)
    return float(sum((g.detach().double().square().sum() for g in grads if g is not None), torch.tensor(0., dtype=torch.float64)).sqrt())


@torch.no_grad()
def development(model, value_rows, search_rows):
    nll = brier = 0.
    for row in value_rows:
        out = model(row)
        nll += float(-(row['valueTarget'] * out['valueLogits'].log_softmax(0)).sum())
        brier += float((out['valueProbs'] - row['valueTarget']).square().sum())
    correct = pairs = reliable_states = 0
    for row in search_rows:
        out = model(row)
        score = out['logits'] + torch.tensor(row['source']['prior'])
        preferences = row['source'].get('preferences', [])
        reliable_states += bool(preferences)
        for a, b in preferences:
            pairs += 1
            correct += float(score[a]) > float(score[b])
    return dict(valueNLL=nll / len(value_rows), valueBrier=brier / len(value_rows), preferenceAccuracy=correct / pairs if pairs else None,
                preferencePairs=pairs, reliableStates=reliable_states, valueStates=len(value_rows))
