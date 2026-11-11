"""用独立小张量验证子集梯度与完整动作锚点，防止未展开动作被误标零概率。"""
import unittest
import torch
from policy_training import subset_kl, anchor_loss

class PolicyLossTest(unittest.TestCase):
    def test_unexpanded_and_vetoed_have_zero_subset_gradient(self):
        logits = torch.tensor([[.2, 8., -.4, -7.]], requires_grad=True)
        rows = [{'teacherMask': torch.tensor([True, False, True, False]), 'teacherProb': torch.tensor([.8, 0., .2, 0.])}]
        loss = subset_kl(logits, rows); loss.backward()
        self.assertEqual(float(logits.grad[0,1]), 0.)
        self.assertEqual(float(logits.grad[0,3]), 0.)
        changed = logits.detach().clone(); changed[0,1] = -100.; changed[0,3] = 100.
        self.assertEqual(float(loss), float(subset_kl(changed,rows)))

    def test_anchor_covers_all_legal_actions(self):
        logits = torch.tensor([[.2, .3, -.4]], requires_grad=True)
        base = torch.zeros_like(logits)
        ce, kl = anchor_loss(logits, base, torch.tensor([1]))
        (ce + .2*kl).backward()
        self.assertTrue(bool((logits.grad != 0).all()))

    def test_rejects_single_action_teacher(self):
        with self.assertRaises(ValueError):
            subset_kl(torch.zeros(1,2), [{'teacherMask': torch.tensor([True,False]), 'teacherProb': torch.tensor([1.,0.])}])

if __name__ == '__main__': unittest.main()
