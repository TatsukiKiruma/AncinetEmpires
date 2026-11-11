"""待机语义行的稀疏KL与训练集机会约束；不更新共享表征。"""
import torch


def sparse_anchor_part(delta, features, sample_index, wait_scores, teacher_wait, nonwait_lse, weights):
    shifted = wait_scores + (features @ delta).double()
    maximum = nonwait_lse.scatter_reduce(0, sample_index, shifted, reduce='amax', include_self=True)
    normalizer = (nonwait_lse - maximum).exp().scatter_add(0, sample_index, (shifted - maximum[sample_index]).exp())
    logz = maximum + normalizer.log()
    total = weights.sum().clamp_min(1e-12)
    return (weights * logz).sum() / total - (teacher_wait * shifted * weights[sample_index]).sum() / total


def opportunity_margin(delta, features, wait_scores, alternatives, margin=.5):
    gaps = wait_scores + (features @ delta).double() - alternatives
    return (gaps + margin).relu().mean(), gaps
