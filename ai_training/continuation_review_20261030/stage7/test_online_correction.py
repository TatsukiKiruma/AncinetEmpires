"""验证在线纠偏的验收边界、两阶段派发及对在途P1的保护。"""
import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import phase_b_manager as manager


def fixture(phase):
    count = 12 if phase == 'P1' else 6
    return {'phase': phase, 'complete': True, 'failure': None, 'sealedAccess': 0,
            'chosen': {'services': 2, 'coalesceMs': 2},
            **({'profile': {'tag': '', 'workers': 4, 'games': 2, 'services': 2, 'window': 2}} if phase == 'P2' else {}),
            'games': [{'index': i, 'players': 2 + i // (count // 3), 'natural': True, 'stop': 'natural'} for i in range(count)],
            'health': [{'hardTimeouts': 0, 'lateResponses': 0, 'failure': None, 'inFlight': None,
                        'exitCode': 0, 'forcedTermination': False, 'observations': 800, 'completed': 100}],
            'metrics': {'elapsedMs': 100000, 'meanWireMs': 29., 'fullRootsPerHour': 2918.474132526362, 'stepsPerSecond': 3.8},
            'split': [{'players': n} for n in (2, 3, 4)], 'inferenceMode': 'default',
            'referenceRatios': {'fullRootsVsInheritedS0': 2.4320617771053015, 'stepsVsInheritedP0': 4.},
            'wireCoverage': '恢复统计覆盖说明，仅记录不否决'}


class OnlineCorrectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.here = Path(self.temp.name)
        self.labels = {'validTeachers': 100, 'teacherSamplesPerHour': 3600,
                       'byPlayers': {'2': 1200, '3': 1200, '4': 1200}}

    def tearDown(self):
        self.temp.cleanup()

    def test_wire_coverage_and_bounds(self):
        with patch.object(manager, 'DATA', self.here), patch.object(manager, 'audit', return_value=self.labels):
            for value, accepted in [(0, False), (-1, False), (29, True), (35, True), (35.001, False)]:
                report = fixture('P1'); report['metrics']['meanWireMs'] = value
                self.assertEqual(manager.summarize(report, 'B-G3')['wirePassed'], accepted)

    def test_existing_p1_accepted_and_p2_waived(self):
        saved = {}
        def read(file):
            if file.name == 'GATES.json':
                return {'phaseA': {'passed': True}, 'phaseB': {}, 'sealedAccess': 0}
            return {'passed': True, 'selected': 'default'}
        with patch.object(manager, 'HERE', self.here), patch.object(manager, 'DATA', self.here), \
             patch.object(manager, 'read_json', side_effect=read), \
             patch.object(manager, 'audit', return_value=self.labels), \
             patch.object(manager, 'save', side_effect=lambda f, value: saved.update({f.name: copy.deepcopy(value)})), \
             patch.object(manager, 'benchmark', side_effect=lambda phase, *args, **kwargs: fixture(phase)) as benchmark:
            self.assertEqual(manager.main(), 0)
        self.assertEqual([c.args[0] for c in benchmark.call_args_list], ['P1'])
        self.assertTrue(benchmark.call_args_list[0].kwargs['attach'])
        result = saved['PHASE_B_DECISION.json']
        self.assertTrue(result['passed'])
        self.assertIsNone(result['P2'])
        self.assertTrue(result['P2Waiver']['waived'])
        self.assertFalse(result['P2Waiver']['executed'])
        self.assertEqual(result['thresholds']['inheritedTargetRatio'], 2.4)
        self.assertEqual(len(result['workerScan']), 1)
        self.assertAlmostEqual(result['references']['P1']['ratio'], 2.4320617771053015)
        self.assertTrue(saved['GATES.json']['phaseB']['B-G4']['passed'])

    def test_health_and_reference_failures_remain_blocking(self):
        report = fixture('P2'); report['health'][0]['hardTimeouts'] = 1
        with self.assertRaises(manager.GateFailure):
            manager.healthy(report, 'B-G4')
        report = fixture('P1'); report['referenceRatios']['fullRootsVsInheritedS0'] = 999
        with patch.object(manager, 'DATA', self.here), patch.object(manager, 'audit', return_value=self.labels):
            with self.assertRaises(manager.GateFailure):
                manager.inherited_ratio(manager.summarize(report, 'B-G3'), 'P1')

    def test_missing_attached_p1_never_kills_or_restarts(self):
        with patch.object(manager, 'HERE', self.here), patch.object(manager, 'STOP', self.here / 'STOP'), \
             patch.object(manager, 'attached_p1', return_value=[]), patch.object(manager.time, 'sleep'), \
             patch.object(manager, 'save'), patch.object(manager, 'terminate_owned') as kill, \
             patch.object(manager.subprocess, 'Popen') as spawn:
            with self.assertRaises(manager.GateFailure):
                manager.benchmark('P1', attach=True)
            kill.assert_not_called(); spawn.assert_not_called()

    def test_extra_p1_and_legacy_are_refused(self):
        with patch.object(manager, 'HERE', self.here), patch.object(manager.subprocess, 'Popen') as spawn:
            for phase, profile in [('P1', None), ('P2', {'tag': 'stage6-ref', 'legacyV6': True})]:
                with self.assertRaises(manager.GateFailure):
                    manager.benchmark(phase, profile)
            spawn.assert_not_called()


if __name__ == '__main__':
    unittest.main()
