"""损失的mask、样本权重与边际行动者回归。"""
import unittest
import torch
from loss import multitask_loss


class LossTest(unittest.TestCase):
    def sample(self, weight=1., policy=True, value=True):
        return dict(weight=torch.tensor([weight]), policyMask=torch.tensor([policy]), valueMask=torch.tensor([value]),
                    policyTarget=torch.tensor([1]), pointers=torch.tensor([[0, 0, 0, -1, -1], [1, 0, 0, -1, -1]]),
                    valueTarget=torch.tensor([.25, .75, 0, 0, 0, 0]))

    def output(self):
        logits = torch.tensor([0., 1.], requires_grad=True)
        value = torch.tensor([0., 1., -1e9, -1e9, -1e9, -1e9], requires_grad=True)
        return dict(logits=logits, actorPrior=logits.softmax(0), valueLogits=value, valueProbs=value.softmax(0))

    def test_masks_and_weighted_normalization(self):
        a, b = self.output(), self.output()
        reference = multitask_loss([a], [self.sample()])
        repeated = multitask_loss([a, b], [self.sample(2.), self.sample(3.)])
        self.assertAlmostEqual(reference['total'].item(), repeated['total'].item(), places=6)
        masked = self.sample(100., False, False)
        masked['policyTarget'] = torch.tensor([999])
        same = multitask_loss([a, b], [self.sample(), masked])
        self.assertEqual(reference['total'].item(), same['total'].item())
        reference['total'].backward()
        self.assertGreater(a['logits'].grad.norm().item(), 0)
        self.assertGreater(a['valueLogits'].grad.norm().item(), 0)

    def test_no_supervision_is_differentiable_zero(self):
        a = self.output()
        loss = multitask_loss([a], [self.sample(policy=False, value=False)])
        self.assertEqual(loss['total'].item(), 0)
        loss['total'].backward()
        self.assertEqual(a['logits'].grad.norm().item(), 0)


if __name__ == '__main__':
    unittest.main()
