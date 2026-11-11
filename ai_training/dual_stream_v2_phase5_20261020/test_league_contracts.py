"""测试实际晋升函数：失败不污染冠军，成功完整更新身份和历史池。"""
import json
import tempfile
import unittest
from pathlib import Path
import run_league as league


class LeagueContracts(unittest.TestCase):
    def setUp(self):
        self.original = league.DIR
        self.temp = tempfile.TemporaryDirectory(dir=self.original)
        assert Path(self.temp.name).resolve().is_relative_to(self.original.resolve())
        league.DIR = Path(self.temp.name)
        self.base = dict(complete=True, strictAllAttempts=True, noTimeoutOrWall=True, p95=True, queueBelow1ms=True, groups={})
        for mode in ['pure', 'turn_search']:
            for panel, wins in [('fixed', 13), ('expanded', 14), ('3ffa', 1), ('4ffa', 1), ('2v2', 0)]:
                self.base['groups'][mode + '/' + panel] = dict(outcomes=dict(natural_win=wins))
        for gen in [0, 1]:
            folder = league.DIR / f'generations/gen_{gen:02d}'; folder.mkdir(parents=True)
            league.save(folder / 'arena-summary.json', self.base)
            league.save(folder / 'value-calibration.json', dict(passed=True))
            league.save(folder / 'tri-runtime-parity.json', dict(passed=True))
            league.save(folder / 'extraction-summary.json', dict(strictAllAttempts=True, games=60, corrections=10))
            (folder / 'model.bin').write_bytes(f'模型{gen}'.encode()); (folder / 'model.json').write_text('{}')
        league.save(league.DIR / 'champion-pure-arena/arena-summary.json', self.base)
        league.save(league.DIR / 'champion-search-arena/arena-summary.json', self.base)
        league.save(league.DIR / 'league-state.json', dict(currentGeneration=0, championGeneration=0, championModelPath='generations/gen_00/model', championSha256='原冠军', championCalibrationPath='generations/gen_00', hallOfFame=[dict(generation=0)], promotionHistory=[], pendingReservation=dict(generation=1)))

    def tearDown(self):
        league.DIR = self.original; self.temp.cleanup()

    def test_value_failure_preserves_champion(self):
        league.save(league.DIR / 'generations/gen_01/value-calibration.json', dict(passed=False))
        league.promote(1); state = league.read(league.DIR / 'league-state.json')
        self.assertEqual(state['currentGeneration'], 1); self.assertEqual(state['championGeneration'], 0)
        self.assertEqual(state['championSha256'], '原冠军'); self.assertEqual(len(state['hallOfFame']), 1)
        self.assertFalse(state['promotionHistory'][-1]['promoted'])

    def test_panel_regression_blocks_promotion(self):
        candidate = json.loads(json.dumps(self.base)); candidate['groups']['turn_search/fixed']['outcomes']['natural_win'] = 12
        league.save(league.DIR / 'generations/gen_01/arena-summary.json', candidate)
        league.promote(1); state = league.read(league.DIR / 'league-state.json')
        self.assertFalse(state['promotionHistory'][-1]['promoted']); self.assertEqual(state['championGeneration'], 0)

    def test_qualified_candidate_updates_all_champion_identities(self):
        league.promote(1); state = league.read(league.DIR / 'league-state.json')
        self.assertEqual(state['championGeneration'], 1); self.assertEqual(len(state['hallOfFame']), 2)
        self.assertEqual(state['championSha256'], league.sha(league.DIR / 'dual-v2-champion.bin'))
        self.assertNotIn('pendingReservation', state)

    def test_pure_panel_regression_blocks_even_when_total_exceeds_stage4(self):
        candidate = json.loads(json.dumps(self.base)); candidate['groups']['pure/fixed']['outcomes']['natural_win'] = 12
        league.save(league.DIR / 'generations/gen_01/arena-summary.json', candidate)
        league.promote(1); record = league.read(league.DIR / 'generations/gen_01/promotion.json')
        self.assertGreater(record['pureWins'], 20)
        self.assertFalse(record['pureNoRegression']); self.assertFalse(record['promoted'])

    def test_phase53_requires_every_additional_gate_before_replacing_champion(self):
        league.save(league.DIR / 'RUNTIME_REVISION.json', dict(activeRuntimeKey='v4RuntimeSha256'))
        league.save(league.DIR / 'phase53-audit/promotion-gates.json', dict(gates=dict(search42Plus=True, queueBelowPoint5ms=False)))
        league.promote(1)
        state = league.read(league.DIR / 'league-state.json')
        self.assertEqual(state['championGeneration'], 0)
        self.assertFalse(state['promotionHistory'][-1]['promoted'])


if __name__ == '__main__': unittest.main()
