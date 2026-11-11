"""语义头增量与按头监督的候选数量不变性回归。"""
import unittest
import torch
from semantic_joint_loss import adjusted_scores, loss


class SemanticJointTests(unittest.TestCase):
    def test_semantic_update_only_changes_addressed_head(self):
        cache = dict(features=torch.tensor([[[1., 2.]]]), actor=torch.tensor([[0, 0]]), head=torch.tensor([[0, 1]]), target=torch.tensor([0]), score=torch.tensor([[3., 4.]], dtype=torch.float64), mask=torch.ones(1, 2, dtype=torch.bool))
        weight = torch.tensor([[.5, 0.], [0., 0.]], requires_grad=True); bias = torch.zeros(2, requires_grad=True)
        scores = adjusted_scores(cache, weight, bias)
        self.assertTrue(torch.equal(scores, torch.tensor([[3.5, 4.]], dtype=torch.float64)))
        scores[0, 0].backward(); self.assertEqual(weight.grad.tolist(), [[1., 2.], [0., 0.]])

    def test_head_supervision_does_not_reward_extra_low_scoring_candidates(self):
        protocol = dict(baseKl=0., baseActionCe=0., baseHeadCe=1., baseOpportunityWeight=0., margin=.5)
        def evaluate(values, heads):
            score = torch.tensor([values], dtype=torch.float64)
            cache = dict(teacher=score.softmax(-1), target=torch.tensor([0]), head=torch.tensor([heads]), waste=torch.zeros(1, len(values), dtype=torch.bool), other=torch.ones(1, len(values), dtype=torch.bool), hardMask=torch.ones(1), weights=torch.ones(1))
            return loss('base', score, cache, protocol)
        self.assertAlmostEqual(float(evaluate([2., 1.], [1, 2])), float(evaluate([2., 1., -5., -8.], [1, 2, 2, 2])), places=12)


if __name__ == '__main__': unittest.main()
