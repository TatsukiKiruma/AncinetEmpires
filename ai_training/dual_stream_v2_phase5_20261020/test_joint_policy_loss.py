"""联合约束的梯度方向和冠军保护范围回归。"""
import unittest
import torch
from joint_policy_loss import opportunity_loss, champion_head_loss


class JointPolicyTests(unittest.TestCase):
    def test_only_wasted_wait_is_suppressed(self):
        score = torch.tensor([[2., 1., 5.]], requires_grad=True)
        x = dict(ptr=torch.tensor([[[0, 0, 4], [0, 0, 0], [1, 0, 4]]]))
        samples = [dict(pointers=[0, 1, 2], source=dict(wasteActors=[0]))]
        loss = opportunity_loss(score, x, samples); loss.backward()
        self.assertEqual(score.grad.tolist(), [[1., -1., 0.]])

    def test_wrong_champion_head_does_not_override_training_label(self):
        score = torch.tensor([[2., 1.]], requires_grad=True)
        x = dict(ptr=torch.tensor([[[0, 0, 1], [0, 0, 2]]]), target=torch.tensor([1]))
        samples = [dict(pointers=[0, 1], source={})]
        loss = champion_head_loss(score, torch.tensor([[3., 1.]]), x, samples)
        loss.backward(); self.assertEqual(score.grad.tolist(), [[0., 0.]])


if __name__ == '__main__': unittest.main()
