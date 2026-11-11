"""实现期间工程测试；人工优化器更新不属于正式实验训练。"""
import copy
import importlib.util
import os
import random
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
import torch
from core import HERE, R, SEED, read, write_new, frames, load_initial
from ordering import batches
from objectives import objective
from budget import Budget
from evaluation import paired


class Contracts(unittest.TestCase):
    def test_sequence_and_consumption(self):
        rows = [dict(spatial=torch.zeros(34, 8 + (i % 3) * 8, 8), source=dict(id=str(i))) for i in range(4096)]
        lengths = []
        for epoch in range(4):
            ab = batches(rows, 'A', epoch); bb = batches(rows, 'B', epoch); cb = batches(rows, 'C', epoch)
            self.assertEqual(bb, cb)
            self.assertEqual(len(ab), len(bb))
            self.assertNotEqual(ab, bb)
            self.assertEqual(sorted(i for b in bb for i in b), list(range(4096)))
            self.assertTrue(all(1 <= len(b) <= 8 for b in bb))
            lengths.append(bb[-1])
        self.assertGreater(len({tuple(b) for b in lengths}), 1)

    def test_losses_and_recovery(self):
        all_rows = list(frames(R / 'fixtures.frames'))
        row = next(s for s in all_rows if s['spatial'].shape[1] <= 16 and len(s['pointers']) > 1)
        row['source'].update(source='search-expert', quality=4, parentPolicyScale=.7, parentValueScale=.7,
                             searchTarget=[dict(index=0, score=.3), dict(index=1, score=.2)], preferences=[[0, 1]])
        row['valueMask'] = torch.tensor([True], dtype=torch.uint8)
        model = load_initial(R / 'training/pretrain_full/model')
        legacy_spec = importlib.util.spec_from_file_location('e6_legacy_loss', R / 'execution_v5/train.py')
        legacy = importlib.util.module_from_spec(legacy_spec); legacy_spec.loader.exec_module(legacy)
        p, v, _ = objective(model, [row], 'A')
        old, _ = legacy.loss(model, [row])
        self.assertTrue(torch.allclose(p + v, old, atol=1e-6))
        pc, vc, _ = objective(model, [row], 'C')
        duplicate = copy.deepcopy(row); duplicate['source']['preferences'] *= 4
        pc2, vc2, _ = objective(model, [duplicate], 'C')
        self.assertTrue(torch.allclose(pc, pc2))
        self.assertTrue(torch.equal(v, vc))
        no_pairs = copy.deepcopy(row); no_pairs['source']['preferences'] = []
        pn, vn, _ = objective(model, [no_pairs], 'C')
        self.assertEqual(float(pn.detach()), 0.)
        self.assertTrue(torch.equal(vn, vc))
        optimizer = torch.optim.AdamW(model.parameters(), lr=5e-5, weight_decay=1e-4)
        def update(m, opt):
            opt.zero_grad(set_to_none=True)
            p, v, _ = objective(m, [row], 'B'); (p + v).backward()
            self.assertTrue(torch.isfinite(torch.nn.utils.clip_grad_norm_(m.parameters(), 1.)))
            opt.step()
        random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED)
        update(model, optimizer)
        snapshot = dict(model=copy.deepcopy(model.state_dict()), optimizer=copy.deepcopy(optimizer.state_dict()), random=random.getstate(), numpy=np.random.get_state(), torch=torch.get_rng_state())
        expected_rng = (random.random(), float(np.random.rand()), float(torch.rand(1)))
        update(model, optimizer)
        restored = load_initial(R / 'training/pretrain_full/model')
        opt2 = torch.optim.AdamW(restored.parameters(), lr=5e-5, weight_decay=1e-4)
        with tempfile.TemporaryDirectory(dir=HERE) as tmp:
            path = __import__('pathlib').Path(tmp) / 'resume.pt'
            torch.save(snapshot, path); saved = torch.load(path, weights_only=False)
            restored.load_state_dict(saved['model']); opt2.load_state_dict(saved['optimizer'])
            random.setstate(saved['random']); np.random.set_state(saved['numpy']); torch.set_rng_state(saved['torch'])
            self.assertEqual(expected_rng, (random.random(), float(np.random.rand()), float(torch.rand(1))))
            update(restored, opt2)
        self.assertTrue(all(torch.equal(p, restored.state_dict()[n]) for n, p in model.state_dict().items()))
        changed = sum(not torch.equal(p, snapshot['model'][n]) for n, p in model.state_dict().items())
        self.assertGreater(changed, 0)
        self.assertTrue(all(torch.isfinite(p).all() for p in restored.parameters()))

    def test_timeouts_failures_and_disk_preservation(self):
        from core import check_budget
        from pathlib import Path
        with tempfile.TemporaryDirectory(dir=HERE) as tmp:
            path = Path(tmp) / 'budget.json'
            path.write_text('{"totalDeadline":0,"stageDeadline":0}', 'utf-8')
            with patch.dict(os.environ, {'E6_BUDGET': str(path)}):
                with self.assertRaises(TimeoutError): check_budget()
            path.write_text('{"totalDeadline":99999999999999,"stageDeadline":99999999999999}', 'utf-8')
            with patch.dict(os.environ, {'E6_BUDGET': str(path)}), patch('shutil.disk_usage', return_value=type('Usage', (), {'free': 1})()):
                with self.assertRaises(OSError): check_budget()
            old = Path(tmp) / 'evidence.json'; write_new(old, dict(identity='original'))
            with self.assertRaises(FileExistsError): write_new(old, dict(identity='replacement'))
            self.assertEqual(read(old)['identity'], 'original')
        budget = object.__new__(Budget); budget.total_deadline = budget.stage_deadline = 0
        with self.assertRaises(TimeoutError): budget.run([sys.executable, '-c', 'raise SystemExit(0)'], HERE / 'checks/should-not-exist.log')

    def test_paired_cluster_and_natural_only(self):
        rows = [dict(job=dict(id=str(i), seat=i % 2), openingCanonicalSha256=str(i // 2), natural=True, outcome='loss') for i in range(20)]
        candidate = copy.deepcopy(rows)
        candidate[0]['outcome'] = candidate[1]['outcome'] = 'win'
        candidate[2].update(natural=False, outcome='win')
        result = paired(rows, candidate)
        self.assertEqual(result['newWins'], 2)
        self.assertEqual(result['families'], 10)


if __name__ == '__main__':
    import sys
    torch.set_num_threads(4); torch.set_num_interop_threads(1); torch.use_deterministic_algorithms(True)
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(Contracts)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.wasSuccessful():
        target = HERE / 'checks/recovery.json'
        if not target.exists():
            write_new(target, dict(passed=True, modelOptimizerSequenceRNGExact=True, numericalProbeOnly=True, formalTrainingUpdates=0))
    sys.exit(0 if result.wasSuccessful() else 1)
