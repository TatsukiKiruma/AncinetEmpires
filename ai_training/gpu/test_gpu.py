"""真实训练样本上的前向、微批次梯度与GPU一致性检查。"""
import copy
import itertools
import json
import unittest
import torch
from common import ROOT, load_model, move
from batch_model import collate, forward_batch
from data import samples
from objective import loss


class DeviceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)
        directory = ROOT / 'ai_training/phone_2m_scratch100_20261024'
        dataset = json.loads((directory / 'DATASET.json').read_text('utf-8'))
        chosen = {0, 100, 500}
        cls.rows = [r for i, r in enumerate(itertools.islice(samples(dataset, directory / 'data', 1), 501)) if i in chosen]

    def test_batch_matches_authoritative_model(self):
        model = load_model()
        with torch.no_grad():
            out = forward_batch(model, collate(self.rows))
            for i, row in enumerate(self.rows):
                reference = model(row)
                torch.testing.assert_close(out['logits'][i, :len(row['pointers'])], reference['logits'], atol=2e-5, rtol=2e-4)
                torch.testing.assert_close(out['valueProbs'][i], reference['valueProbs'], atol=2e-5, rtol=2e-4)

    def test_batch_gradient_matches_microbatch(self):
        batched = load_model()
        micro = copy.deepcopy(batched)
        x = collate(self.rows)
        loss(forward_batch(batched, x), x, self.rows).backward()
        for row in self.rows:
            x = collate([row])
            loss(forward_batch(micro, x), x, [row], len(self.rows), len(self.rows)).backward()
        for a, b in zip(batched.parameters(), micro.parameters()):
            torch.testing.assert_close(a.grad, b.grad, atol=3e-5, rtol=1e-3)

    @unittest.skipUnless(torch.cuda.is_available(), 'GPU不可用；此项未验证')
    def test_gpu_forward_backward_update(self):
        cpu = load_model()
        gpu = copy.deepcopy(cpu).to('cuda')
        x = collate(self.rows)
        gx = move(x, 'cuda')
        out = forward_batch(cpu, x)
        gout = forward_batch(gpu, gx)
        for key in ['logits', 'valueProbs']:
            torch.testing.assert_close(gout[key].cpu(), out[key], atol=1e-4, rtol=1e-3)
        loss(out, x, self.rows).backward()
        loss(gout, gx, self.rows).backward()
        for a, b in zip(cpu.parameters(), gpu.parameters()):
            torch.testing.assert_close(b.grad.cpu(), a.grad, atol=1e-4, rtol=3e-3)
        optimizer = torch.optim.AdamW(gpu.parameters(), lr=3e-4, foreach=False, fused=False)
        optimizer.step()
        self.assertEqual(sum(v['exp_avg'].numel() for v in optimizer.state.values()), 1966910)


if __name__ == '__main__':
    unittest.main()
