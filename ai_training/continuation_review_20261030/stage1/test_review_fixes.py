"""审核R1/R2/R3轻量正负例；没有真实优化器更新或新实战。"""
import argparse
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import torch
import budget as budgets
import contracts
import runtime
import train
from compare_arena import checked_games, compare_games

HERE = Path(__file__).resolve().parent
CASE_RESULTS = {}


def record_case(name, result):
    CASE_RESULTS[name] = result
    (HERE / 'REVIEW_LIGHT_CASES.json').write_text(json.dumps(dict(cases=CASE_RESULTS, realCurrentModelOptimizerUpdates=0, additionalGames=0), ensure_ascii=False, indent=2), 'utf-8')


class Clock:
    def __init__(self): self.now = 10.
    def __call__(self): return self.now
    def advance(self, value): self.now += value


class FakeState:
    def __init__(self): self.value = torch.tensor([0.])
    def state_dict(self): return {'w': self.value}
    def load_state_dict(self, state): self.value.copy_(state['w'])
    def export(self, path): Path(str(path) + '.json').write_text('{}', 'utf-8')


class FakeSampler:
    def __init__(self, *args): self.cursor = 0
    def batch(self, size): self.cursor += size; return list(range(size))
    def state_dict(self): return {'cursor': self.cursor, 'exposures': {}}
    def load_state_dict(self, value): self.cursor = value['cursor']


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.here = Path(self.temp.name)
        (self.here / 'PARTITIONS.json').write_text('{}', 'utf-8')
        self.config = json.loads((HERE / 'STAGE2_CONFIG.json').read_text('utf-8'))
        self.config.update(sampleBudget=16, checkpointEveryUpdates=1, diagnosticEveryUpdates=2, encodingRequestTimeoutSeconds=120, diagnosticTimeoutSeconds=.1)
        self.config['stop']['perArmWallSeconds'] = 10.
        self.config['stop']['lowFreeDiskBytes'] = 0
        self.path = self.here / 'config.json'
        self.clock = Clock()
        self.execution = {'fixture': 'no_gpu'}
        self.states = [FakeState(), FakeState(), FakeState()]
        self.calls = {'updates': 0, 'fresh': 0, 'rows': 0, 'closed': 0}
        self.mode = 'normal'

    def tearDown(self): self.temp.cleanup()

    def invoke(self, out, resume=None, engineering=False):
        self.path.write_text(json.dumps(self.config), 'utf-8')
        args = argparse.Namespace(config=self.path, preflight_only=False, engineering_updates=2 if engineering else None, reviewed_stage=not engineering, out=self.here / out, resume=resume, device='cuda:0')
        owner = self
        class Encoder:
            def __init__(self, *args): pass
            def rows(self, requests, timeout):
                owner.calls['rows'] += 1
                owner.clock.advance(.2)
                if owner.mode == 'encoding_timeout' and owner.calls['rows'] == 2:
                    raise budgets.BudgetExpired('夹具编码挂起')
                return [{'source': {'split': 'train'}} for _ in requests]
            def close(self): owner.calls['closed'] += 1
        def fresh(*args):
            self.calls['fresh'] += 1
            return (*self.states, {'workerRngStates': []}, {})
        def update(*args):
            self.states[0].value.add_(1)
            self.clock.advance(.1)
            if self.mode == 'partial_update': raise RuntimeError('夹具半批失败')
            self.calls['updates'] += 1
            return {'loss': 0.}
        def diagnostic(*args, **kwargs):
            self.clock.advance(2.)
            raise budgets.BudgetExpired('夹具诊断挂起')
        factory = lambda limit, consumed=0., started=None: budgets.ArmBudget(limit, consumed, clock=self.clock, started=started)
        science = {'executionRuntime': {'device': 'cuda:0'}, 'runnerFiles': []}
        with patch.multiple(train, HERE=self.here, validate=lambda *a, **k: (self.execution, science), runner_sources=lambda *a: {}, ArmBudget=factory, fresh=fresh, update=update, Encoder=Encoder, Sampler=FakeSampler, device_for=lambda *a: torch.device('cpu'), identity=lambda *a: {}, rng_state=lambda: {}, restore_rng=lambda *a: None, bounded_process=diagnostic), patch.object(train.time, 'perf_counter', self.clock), patch.object(torch, 'set_num_interop_threads'), patch.object(torch, 'set_num_threads'):
            train.run(args)
        return args.out

    def test_normal_barrier_has_complete_cursor(self):
        out = self.invoke('normal', engineering=True)
        saved = torch.load(out / 'checkpoint.pt', weights_only=False)
        self.assertEqual((saved['stageUpdates'], saved['sampler']['cursor']), (2, 16))
        self.assertEqual(saved['model']['w'].item(), 2.)
        self.assertTrue(saved['recoveryAllowed'])
        self.assertGreater(saved['armBudget']['consumedWallSeconds'], .5)
        record_case('R1/complete_barrier', dict(completedSyntheticUpdates=2, cursor=saved['sampler']['cursor'], modelScalar=saved['model']['w'].item(), consumed=saved['armBudget']['consumedWallSeconds']))

    def test_resume_accumulates_budget_and_zero_remaining_never_initializes(self):
        self.config['stop']['perArmWallSeconds'] = .49
        out = self.invoke('first', engineering=True)
        first = torch.load(out / 'checkpoint.pt', weights_only=False)
        self.assertEqual(first['sampler']['cursor'], 8)
        self.assertEqual(self.calls['updates'], 1)
        original_ledger = json.loads(Path(first['armBudget']['ledgerPath']).read_text('utf-8'))
        self.clock.advance(10000.)
        prior = dict(self.calls)
        resumed = self.invoke('resumed', out / 'checkpoint.pt', engineering=True)
        self.assertEqual(self.calls, prior)
        stop = json.loads((resumed / 'STOPPED.json').read_text('utf-8'))
        self.assertGreaterEqual(stop['wallSeconds'], original_ledger['consumedWallSeconds'])
        self.assertLess(stop['wallSeconds'], 1.)
        ledger = json.loads(Path(first['armBudget']['ledgerPath']).read_text('utf-8'))
        self.assertEqual(ledger['armId'], original_ledger['armId'])
        record_case('R1/resume_budget', dict(before=original_ledger['consumedWallSeconds'], after=stop['wallSeconds'], downtimeExcluded=10000, additionalModelInitializations=self.calls['fresh'] - prior['fresh'], additionalSyntheticUpdates=self.calls['updates'] - prior['updates'], sameArmId=True))

    def test_encoding_timeout_rolls_back_pending_data_cursor(self):
        self.mode = 'encoding_timeout'
        out = self.invoke('encoder', engineering=True)
        saved = torch.load(out / 'checkpoint.pt', weights_only=False)
        self.assertEqual((saved['stageUpdates'], saved['sampler']['cursor']), (1, 8))
        self.assertTrue(saved['recoveryAllowed'])
        self.assertEqual(self.calls['closed'], 1)
        record_case('R1/encoder_timeout', dict(savedCursor=saved['sampler']['cursor'], pendingCursorDiscarded=16, savedCompleteUpdates=saved['stageUpdates'], encoderClosed=True, recoveryAllowed=saved['recoveryAllowed']))

    def test_half_batch_exception_preserves_previous_weights_and_cursor(self):
        self.mode = 'partial_update'
        with self.assertRaises(RuntimeError): self.invoke('half', engineering=True)
        saved = torch.load(self.here / 'half/checkpoint.pt', weights_only=False)
        self.assertEqual(saved['model']['w'].item(), 0.)
        self.assertEqual(saved['sampler']['cursor'], 0)
        self.assertFalse(saved['recoveryAllowed'])
        record_case('R1/half_batch', dict(savedModel=saved['model']['w'].item(), partiallyMutatedFixtureModel=self.states[0].value.item(), savedCursor=saved['sampler']['cursor'], recoveryAllowed=False))

    def test_diagnostic_time_is_in_arm_budget_and_full_batch_is_saved(self):
        out = self.invoke('diagnostic')
        saved = torch.load(out / 'checkpoint.pt', weights_only=False)
        self.assertEqual((saved['stageUpdates'], saved['sampler']['cursor']), (2, 16))
        self.assertGreater(saved['armBudget']['consumedWallSeconds'], 2.5)
        self.assertTrue(saved['recoveryAllowed'])
        record_case('R1/diagnostic_timeout', dict(completedSyntheticUpdates=saved['stageUpdates'], cursor=saved['sampler']['cursor'], consumed=saved['armBudget']['consumedWallSeconds'], diagnosticConsumed=2.))


class TimeoutTests(unittest.TestCase):
    def test_real_diagnostic_process_is_reaped(self):
        spawned = []
        popen = subprocess.Popen
        def capture(*args, **kwargs):
            p = popen(*args, **kwargs); spawned.append(p); return p
        began = time.perf_counter()
        with patch.object(budgets.subprocess, 'Popen', side_effect=capture), self.assertRaises(budgets.BudgetExpired):
            budgets.bounded_process([sys.executable, '-c', 'import time; time.sleep(30)'], budgets.ArmBudget(2), .15, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.assertIsNotNone(spawned[0].poll())
        self.assertLess(time.perf_counter() - began, 5.)
        record_case('R1/real_process_timeout', dict(childReaped=True, seconds=time.perf_counter() - began))

    def test_real_encoder_pipe_timeout_closes_process(self):
        popen = subprocess.Popen
        def fake_command(*args, **kwargs):
            if args[0][0] == 'node':
                return popen([sys._base_executable, '-c', 'import time; time.sleep(30)'], **kwargs)
            return popen(*args, **kwargs)
        with tempfile.TemporaryDirectory() as d, patch.object(runtime, 'validate', return_value=({}, {})), patch.object(runtime.subprocess, 'Popen', side_effect=fake_command):
            encoder = runtime.Encoder(Path(d) / 'encoder.log')
            with self.assertRaises(budgets.BudgetExpired): encoder.rows([{}], timeout=.1)
            encoder.close()
            self.assertIsNotNone(encoder.process.poll())
            with self.assertRaises(RuntimeError): encoder.rows([{}], timeout=.1)
            record_case('R1/real_encoder_timeout', dict(childReaped=True, failedServiceCannotReuse=True))


class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.here = self.root / 'stage'; self.here.mkdir()
        for name in ['checkpoint', 'partition', 'offline', 'arena', 'rule.py', 'model.py']:
            (self.root / name).write_text(name, 'utf-8')
        # 面板、规则和数值源码使用真实文件的临时副本，原件完全不写。
        copies = {'offline': HERE / 'OFFLINE_PANEL.json', 'arena': HERE / 'ARENA_PANEL.json', 'rule.py': contracts.ROOT / 'src/game/rules.ts', 'model.py': contracts.ROOT / 'ai_training/gpu/batch_model.py'}
        for name, source in copies.items():
            (self.root / name).write_bytes(source.read_bytes())
        for name in ['initial', 'baseline']:
            (self.here / name).write_text(name, 'utf-8')
        self.config = dict(runnerProtocol=contracts.PROTOCOL, peakLearningRate=.0001, learningRateArms=[.0001], effectiveBatch=8, microbatch=1, policyWeight=1, valueWeight=1, gradientClip=1, weightDecay=.0001, endLearningRateRatio=.1, stop={'perArmWallSeconds': 14400})
        self.contract = dict(runnerProtocol=contracts.PROTOCOL, runnerFiles=['entry.py'], arenaExecution={'policy': 'fixture'}, fixedConfig={k: v for k, v in self.config.items() if k not in ['peakLearningRate', 'runnerProtocol']}, learningRateArms=[.0001], inputs=[], scienceSources=[dict(path=n, sha256=contracts.file_sha(self.root / n)) for n in ['rule.py', 'model.py']], panelInitials=[dict(path='initial', sha256=contracts.file_sha(self.here / 'initial'))], baselineArtifacts=[dict(path='baseline', sha256=contracts.file_sha(self.here / 'baseline'))])
        for key, name in [('checkpointSha256', 'checkpoint'), ('partitionsSha256', 'partition'), ('offlinePanelSha256', 'offline'), ('arenaPanelSha256', 'arena')]:
            digest = contracts.file_sha(self.root / name)
            self.config[key] = digest
            self.contract['inputs'].append(dict(configKey=key, path=name, sha256=digest))
        (self.here / 'SCIENCE_CONTRACT.json').write_text(json.dumps(self.contract), 'utf-8')
        self.config['scienceContractSha256'] = contracts.file_sha(self.here / 'SCIENCE_CONTRACT.json')
        (self.here / 'entry.py').write_text('fixture', 'utf-8')
        runners = dict(runnerProtocol=contracts.PROTOCOL, scienceContractSha256=self.config['scienceContractSha256'], sources=[dict(path='entry.py', sha256=contracts.file_sha(self.here / 'entry.py'))])
        (self.here / 'RUNNER_CONTRACT.json').write_text(json.dumps(runners), 'utf-8')
        self.config['runnerContractSha256'] = contracts.file_sha(self.here / 'RUNNER_CONTRACT.json')

    def tearDown(self): self.temp.cleanup()
    def check(self, config=None, expected_identity=None): return contracts.validate(config or self.config, root=self.root, here=self.here, expected_identity=expected_identity)
    def test_identity_positive(self): self.assertEqual(self.check()[0], self.check()[0])
    def test_panel_tamper_rejected(self):
        for name in ['offline', 'arena']:
            with self.subTest(name=name):
                original = (self.root / name).read_text('utf-8'); (self.root / name).write_text('changed', 'utf-8')
                with self.assertRaises(ValueError): self.check()
                (self.root / name).write_text(original, 'utf-8')
        record_case('R2/panels', dict(realPanelCopiesRejected=2, originalPanelsWritten=False))
    def test_rule_and_numeric_dependency_tamper_rejected(self):
        for name in ['rule.py', 'model.py']:
            with self.subTest(name=name):
                original = (self.root / name).read_text('utf-8'); (self.root / name).write_text('changed', 'utf-8')
                with self.assertRaises(ValueError): self.check()
                (self.root / name).write_text(original, 'utf-8')
        record_case('R2/dependencies', dict(realSourceCopiesRejected=2, originalSourcesWritten=False))
    def test_fixed_config_unsupported_values_rejected(self):
        for key in ['effectiveBatch', 'microbatch', 'policyWeight', 'valueWeight', 'gradientClip', 'weightDecay', 'endLearningRateRatio', 'stop']:
            with self.subTest(key=key):
                altered = copy.deepcopy(self.config); altered[key] = {'perArmWallSeconds': 1} if key == 'stop' else 999
                with self.assertRaises(ValueError): self.check(altered)
        record_case('R2/fixed_config', dict(unsupportedCasesRejected=8))
    def test_contract_and_resume_identity_tamper_rejected(self):
        with self.assertRaises(ValueError): self.check(expected_identity={})
        (self.here / 'SCIENCE_CONTRACT.json').write_text('{}', 'utf-8')
        with self.assertRaises(ValueError): self.check()
    def test_initial_and_approved_baseline_tamper_rejected(self):
        for name in ['initial', 'baseline']:
            original = (self.here / name).read_text('utf-8'); (self.here / name).write_text('changed', 'utf-8')
            with self.assertRaises(ValueError): self.check()
            (self.here / name).write_text(original, 'utf-8')
    def test_runner_change_is_separately_rejected(self):
        (self.here / 'entry.py').write_text('changed runner', 'utf-8')
        with self.assertRaises(ValueError): self.check()
        record_case('R2/runner_revision', dict(unapprovedRunnerRejected=True))


class ComparisonTests(unittest.TestCase):
    def setUp(self):
        self.panel = json.loads((HERE / 'ARENA_PANEL.json').read_text('utf-8'))
        self.payload = json.loads((HERE / 'arena-baseline-r2/SUMMARY.json').read_text('utf-8'))
        self.run = json.loads((HERE / 'arena-baseline-r2/RUN.json').read_text('utf-8'))
        self.initials = {s['slot']: json.loads((HERE / s['file']).read_text('utf-8')) for s in self.panel['slots']}
        self.execution = {'arenaPanelSha256': self.run['panelSha256'], 'arenaExecutionSha256': 'fixed'}
        self.payload['executionIdentity'] = self.execution
        self.run['executionIdentity'] = self.execution
        for game in self.payload['games']:
            first = self.initials[game['slot']]['currentPlayer']
            game.update(executionIdentity=self.execution, firstToActPlayer=first, actualHand='first' if first == game['modelPlayer'] else 'second')
    def check(self): return checked_games(self.payload, self.run, self.panel, self.execution, self.initials)
    def test_actual_hand_uses_current_player_instead_of_color(self):
        games = self.check()
        examples = [g for g in games if g['firstToActPlayer'] != 0 and g['seat'] == 0]
        self.assertTrue(examples)
        self.assertTrue(all(g['actualHand'] == 'second' for g in examples))
        record_case('R3/actual_hand', dict(nonzeroCurrentPlayerCases=len(examples), colorSeatZeroCorrectlySecond=True))
    def test_complete_self_comparison(self):
        games = self.check(); report = compare_games(games, games)
        self.assertTrue(report['eligibleForPromotionReview'])
        self.assertEqual(report['results']['hard']['scoreChange'], 0.)
        self.assertFalse(report['directPromotionAllowed'])
    def test_duplicate_missing_or_wrong_id_rejected(self):
        original = copy.deepcopy(self.payload)
        for mode in ['duplicate', 'missing', 'wrong']:
            self.payload = copy.deepcopy(original)
            if mode == 'duplicate': self.payload['games'][1]['id'] = self.payload['games'][0]['id']
            elif mode == 'missing': self.payload['games'].pop()
            else: self.payload['games'][0]['id'] = 'unplanned'
            with self.assertRaises(ValueError): self.check()
        record_case('R3/ids', dict(duplicateRejected=True, missingRejected=True, unexpectedIdRejected=True))
    def test_wrong_execution_or_hand_rejected(self):
        self.run['executionIdentity'] = {'different': True}
        with self.assertRaises(ValueError): self.check()
        self.run['executionIdentity'] = self.execution
        self.payload['games'][0]['actualHand'] = 'wrong'
        with self.assertRaises(ValueError): self.check()
    def test_non_natural_result_never_promotes_from_subset(self):
        base = self.check()
        game = self.payload['games'][0]
        game.update(natural=False, classification='runtime_error', winner=None, error='轻量夹具错误')
        candidate = self.check()
        report = compare_games(base, candidate)
        self.assertFalse(report['eligibleForPromotionReview'])
        self.assertIsNone(report['results']['hard']['scoreChange'])
        self.assertEqual(report['results']['hard']['naturalMatchedGames'], 19)
        record_case('R3/incomplete_natural', dict(naturalMatchedGames=19, promotionReviewEligible=report['eligibleForPromotionReview'], fullPanelScoreChange=report['results']['hard']['scoreChange']))


if __name__ == '__main__': unittest.main()
