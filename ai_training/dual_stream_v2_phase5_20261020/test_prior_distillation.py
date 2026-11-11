"""先验感知损失及冻结合同的可复现回归。"""
import unittest
import torch
from prior_distillation import policy_loss, freeze_policy_only, assert_frozen_equal
from data import load_model


class PriorDistillationTests(unittest.TestCase):
    def fixture(self, semantic=1.5):
        scores = torch.tensor([[0., 0.]], requires_grad=True)
        output = dict(logits=scores)
        champion = dict(logits=torch.zeros(1, 2))
        x = dict(ptr=torch.zeros(1, 2, 5, dtype=torch.long), actionMask=torch.ones(1, 2, dtype=torch.bool), target=torch.tensor([1]), weight=torch.ones(1), quality=torch.ones(1))
        source = dict(prior=[2., 0.], correction=True, purePreferredIndex=0, semanticWeight=semantic)
        return scores, output, champion, x, [dict(source=source)], torch.zeros(15, dtype=torch.float64)

    def test_margin_uses_prior_and_flips_only_corrected_pair(self):
        logits, student, champion, x, samples, bias = self.fixture()
        loss = policy_loss('expert', student, champion, x, samples, bias)
        self.assertGreater(float(loss), 3.75)
        loss.backward()
        self.assertGreater(float(logits.grad[0, 0]), 0.)
        self.assertLess(float(logits.grad[0, 1]), 0.)

    def test_wait_correction_keeps_kl_only(self):
        logits, student, champion, x, samples, bias = self.fixture(0.)
        loss = policy_loss('expert', student, champion, x, samples, bias)
        loss.backward()
        self.assertAlmostEqual(float(loss), 0., places=12)
        self.assertLess(float(logits.grad.abs().max()), 1e-12)

    def test_uncorrected_expert_is_rejected(self):
        _, student, champion, x, samples, bias = self.fixture()
        samples[0]['source']['correction'] = False
        with self.assertRaises(AssertionError): policy_loss('expert', student, champion, x, samples, bias)

    def test_frozen_contract_excludes_head_bias_and_value(self):
        model, teacher = load_model('generations/gen_00/model'), load_model('generations/gen_00/model')
        trainable = freeze_policy_only(model)
        self.assertGreater(len(trainable), 0)
        assert_frozen_equal(model, teacher)
        self.assertFalse(model.headBias.requires_grad)
        self.assertFalse(any(p.requires_grad for n, p in model.named_parameters() if n.startswith(('map.', 'blocks.', 'value'))))

    def test_decoder_keeps_group_insertion_order_on_equal_maxima(self):
        from calibrate_frozen import decode
        pointers = torch.tensor([[0, 0, 1, -1, -1], [1, 0, 2, -1, -1], [0, 1, 1, -1, -1]])
        self.assertEqual(decode(torch.tensor([1., 3., 3.], dtype=torch.float64), pointers), 2)


if __name__ == '__main__': unittest.main()
