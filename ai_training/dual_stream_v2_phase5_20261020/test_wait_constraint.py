"""稀疏KL必须等价完整动作分布，且机会约束只产生策略语义梯度。"""
import unittest
import torch
from wait_constraint import sparse_anchor_part, opportunity_margin


class WaitConstraintTests(unittest.TestCase):
    def test_sparse_gradient_matches_full_action_distribution(self):
        delta = torch.tensor([.1, -.2], requires_grad=True)
        features = torch.tensor([[1., 0.], [0., 1.], [1., 1.]])
        ids = torch.tensor([0, 1, 1]); scores = torch.tensor([1., 2., -1.], dtype=torch.float64)
        other = torch.tensor([0., 1.], dtype=torch.float64); weights = torch.tensor([1., 2.], dtype=torch.float64)
        refs = [torch.tensor([0., 1.], dtype=torch.float64).softmax(-1), torch.tensor([1., 2., -1.], dtype=torch.float64).softmax(-1)]
        pw = torch.cat([refs[0][1:], refs[1][1:]])
        sparse = sparse_anchor_part(delta, features, ids, scores, pw, other, weights)
        sparse.backward(); actual = delta.grad.clone(); delta.grad = None
        moved = scores + (features @ delta).double()
        full = -(weights[0] * (refs[0] * torch.stack([other[0], moved[0]]).log_softmax(-1)).sum() + weights[1] * (refs[1] * torch.cat([other[1:2], moved[1:]]).log_softmax(-1)).sum()) / weights.sum()
        full.backward(); self.assertTrue(torch.allclose(actual, delta.grad, atol=1e-7, rtol=1e-6))

    def test_margin_pushes_wasted_wait_below_available_action(self):
        delta = torch.zeros(2, requires_grad=True)
        loss, gaps = opportunity_margin(delta, torch.tensor([[1., 0.]]), torch.tensor([1.]), torch.tensor([0.]))
        loss.backward(); self.assertGreater(float(delta.grad[0]), 0.); self.assertEqual(float(delta.grad[1]), 0.)
        self.assertGreater(float(gaps[0]), 0.)


if __name__ == '__main__': unittest.main()
