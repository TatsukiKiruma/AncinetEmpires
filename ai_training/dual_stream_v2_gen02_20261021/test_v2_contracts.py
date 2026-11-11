"""多人分项、失败归属及确定性有界流的行为回归。"""
import copy
import unittest
import torch
from promotion_contract import EXPECTED, LEAGUE_QUALITY_KEYS, qualify
from mixed_batches import shuffled_batches


class PromotionTests(unittest.TestCase):
    def setUp(self):
        self.base = dict(groups={})
        for mode in ['pure', 'turn_search']:
            for panel, count in EXPECTED.items():
                self.base['groups'][mode + '/' + panel] = dict(slots=count, outcomes=dict(natural_win=1))
        for key in ['complete', 'strictAllAttempts', 'zeroModelTimeouts', 'zeroOpponentTimeouts', 'zeroExecutionErrors', 'zeroWallStops', 'zeroUnknownStops', 'retaliationComplete100', 'finiteNumerics', 'p95', 'rootMaxWithin1000ms', 'queueBelow1ms', 'identityVerified']:
            self.base[key] = True
        self.extraction = dict(games=60, strictAllAttempts=True, corrections=10, quality={k: True for k in LEAGUE_QUALITY_KEYS})

    def check(self, current):
        return qualify(current, self.base, self.base, True, True, self.extraction)

    def test_all_five_panels_qualified(self):
        self.assertTrue(self.check(self.base)['promoted'])

    def test_every_multiplayer_subpanel_blocks_even_with_compensating_wins(self):
        for mode in ['pure', 'turn_search']:
            for panel in ['3ffa', '4ffa', '2v2']:
                candidate = copy.deepcopy(self.base)
                candidate['groups'][mode + '/' + panel]['outcomes']['natural_win'] = 0
                candidate['groups'][mode + '/fixed']['outcomes']['natural_win'] = 20
                self.assertFalse(self.check(candidate)['promoted'], mode + '/' + panel)

    def test_missing_panel_never_means_zero_win_tie(self):
        candidate = copy.deepcopy(self.base)
        del candidate['groups']['pure/2v2']
        self.assertFalse(self.check(candidate)['promoted'])

    def test_each_integrity_failure_blocks_independently(self):
        for key, value in self.base.items():
            if key == 'groups':
                continue
            candidate = copy.deepcopy(self.base); candidate[key] = False
            self.assertFalse(self.check(candidate)['promoted'], key)
            del candidate[key]
            self.assertFalse(self.check(candidate)['promoted'], 'missing:' + key)

    def test_league_failures_cannot_be_hidden_by_a_complete_arena(self):
        for key in LEAGUE_QUALITY_KEYS:
            extraction = copy.deepcopy(self.extraction); extraction['quality'][key] = False
            result = qualify(self.base, self.base, self.base, True, True, extraction)
            self.assertFalse(result['promoted'], key)
            self.assertIn('league/' + key, result['failedGates'])


class MixerTests(unittest.TestCase):
    def run_stream(self, seed=9):
        def source(prefix):
            for game in range(8):
                yield [dict(source=dict(parent=f'{prefix}-{game}', id=f'{prefix}-{game}-{i}'), spatial=torch.zeros(1, 2, 2), token=torch.tensor(i)) for i in range(5)]
        receipt = {}
        batches = list(shuffled_batches([source('base'), source('expert')], seed, max_samples=30, max_bytes=2000, batch_size=8, receipt=receipt))
        return [[s['source']['id'] for s in b] for b in batches], receipt

    def test_deterministic_complete_cross_source_and_parent_mixing(self):
        a, receipt = self.run_stream(); b, _ = self.run_stream()
        self.assertEqual(a, b)
        self.assertEqual(len({s for batch in a for s in batch}), 80)
        self.assertGreater(receipt['crossSourceBatches'], 0)
        self.assertGreater(receipt['crossParentBatches'], 0)
        self.assertLessEqual(receipt['maximumBufferedBytes'], 2000)

    def test_replayed_cursor_has_identical_remaining_batches(self):
        uninterrupted, _ = self.run_stream()
        restored, _ = self.run_stream()
        self.assertEqual(uninterrupted[4:], restored[4:])
        other_seed, _ = self.run_stream(10)
        self.assertNotEqual(uninterrupted, other_seed)

    def test_unequal_batch_sizes_do_not_leave_a_long_expert_tail(self):
        def source(name, count, batch):
            for start in range(0, count, batch):
                yield [dict(source=dict(parent=name, id=f'{name}-{i}'), spatial=torch.zeros(1, 2, 2)) for i in range(start, min(count, start + batch))]
        stream = list(shuffled_batches([source('base', 80, 16), source('expert', 160, 1)], 9, max_samples=1, batch_size=1, source_sizes=[80, 160]))
        labels = [s['source']['trainingSource'] for batch in stream for s in batch]
        self.assertEqual(labels.count('base'), 80)
        self.assertEqual(labels.count('expert'), 160)
        # 逐批轮流会让后半程只剩专家；按样本进度调度的最后基础样本在尾部。
        self.assertGreater(max(i for i, label in enumerate(labels) if label == 'base'), 190)


if __name__ == '__main__':
    unittest.main()
