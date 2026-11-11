"""交错恢复顺序、专家权重、学习率及开发集有界动作头守门回归。"""
import unittest
import gzip
import hashlib
import json
import tempfile
from pathlib import Path
import torch
import calibrate
from mixed_stream import interleave_batches, expert_quality, cosine_learning_rate
from calibrate import choose_head_bias, head_metrics


class Phase51Tests(unittest.TestCase):
    def test_interleave_entire_epoch_and_replay(self):
        base = [[i] for i in range(10)]
        expert = [[i] for i in range(20)]
        result = list(interleave_batches(base, expert, 10, 20))
        self.assertEqual(result, list(interleave_batches(base, expert, 10, 20)))
        self.assertEqual([s for k, s in result if k == 'base'], base)
        self.assertEqual([s for k, s in result if k == 'expert'], expert)
        self.assertEqual([k for k, s in result[:6]], ['base', 'expert', 'expert', 'base', 'expert', 'expert'])
        self.assertIn('base', [k for k, s in result[-3:]])
        self.assertEqual(result[17:], list(interleave_batches(base, expert, 10, 20))[17:])

    def test_quality_and_learning_rate(self):
        self.assertEqual(expert_quality(dict(correction=True, quality=2.5)), 1.5)
        self.assertEqual(expert_quality(dict(correction=False, quality=1.25)), 1.)
        self.assertAlmostEqual(cosine_learning_rate(0), 3e-5)
        self.assertAlmostEqual(cosine_learning_rate(1), 3e-6)

    def test_head_guard_rejects_regression_and_escape(self):
        anchor = torch.zeros(15)
        before = dict(headTop1=.8, waitWithAnyUnmovedOpportunity=0)
        for candidate, after in [(anchor + .26, before), (anchor + .1, dict(headTop1=.79, waitWithAnyUnmovedOpportunity=0)), (anchor + .1, dict(headTop1=.81, waitWithAnyUnmovedOpportunity=1))]:
            selected, accepted = choose_head_bias(anchor, candidate, before, after)
            self.assertFalse(accepted); self.assertTrue(torch.equal(selected, anchor))
        selected, accepted = choose_head_bias(anchor, anchor + .1, before, before)
        self.assertTrue(accepted)

    def test_decoder_tie_order_and_actor_specific_wait(self):
        row = dict(heads=torch.tensor([7, 4, 0]), scores=torch.tensor([2., 2., 1.]), waste=torch.tensor([False, True, False]))
        data = dict(decodeGroups=[row], targetHead=torch.tensor([7]), recruit=torch.tensor([False]))
        metrics = head_metrics(data, torch.zeros(15))
        self.assertEqual(metrics['headTop1'], 1.)
        self.assertEqual(metrics['waitWithAnyUnmovedOpportunity'], 0)

    def test_calibration_cache_rejects_changed_identity(self):
        original = calibrate.DIR
        with tempfile.TemporaryDirectory(dir=original / 'phase51-audit') as temporary:
            root = Path(temporary)
            self.assertEqual(root.parent, original / 'phase51-audit')
            folder = root / 'generations/gen_02'; folder.mkdir(parents=True)
            files = [folder / 'model.bin', *[root / n for n in ['data.py', 'calibrate.py', 'stream.ts', 'evaluation-exclusions.txt.gz']]]
            for p in files: p.write_bytes(b'fixture')
            identity = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
            cache = folder / 'train-calibration.pt.gz'
            with gzip.open(cache, 'wb') as stream: torch.save(dict(fixture=True), stream)
            (folder / 'train-calibration-identity.json').write_text(json.dumps(identity), encoding='utf-8')
            calibrate.DIR = root
            try:
                self.assertEqual(calibrate.collect(folder, 'train', 2), dict(fixture=True))
                (root / 'stream.ts').write_bytes(b'changed')
                with self.assertRaisesRegex(AssertionError, '校准缓存身份变化'):
                    calibrate.collect(folder, 'train', 2)
            finally:
                calibrate.DIR = original


if __name__ == '__main__': unittest.main()
