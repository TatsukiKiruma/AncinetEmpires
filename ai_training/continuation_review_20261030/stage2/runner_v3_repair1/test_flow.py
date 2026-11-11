"""用三个参数的CPU夹具运行原/新真实控制循环，验证无故障与完整批屏障。"""
import ast
from contextlib import redirect_stderr
import copy
import importlib.util
import io as textio
import json
import math
from pathlib import Path
import random
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
import torch

from frozen import HERE, STAGE1, load_runtime
import io_control
import recovery
from test_safety import Reader, case_dir

COUNTERS = dict(syntheticCpuOptimizerUpdates=0, real2mOptimizerUpdates=0, gpuForwardCalls=0, newGames=0)


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


V3 = module('v3_fixture_control', HERE / 'train.py')
RT = load_runtime()
OLD = module('v2_fixture_control', STAGE1 / 'train.py')
OLD_IDENTITY = {'fixture': 'CPU控制对照，非正式模型'}
NEW_IDENTITY = dict(protocol='synthetic-control-only', controlContractSha256='fixture-control', frozenV2=OLD_IDENTITY)


def factor_from_frozen_source():
    source = ast.parse((STAGE1 / 'runtime.py').read_text('utf-8'))
    fresh = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == 'fresh')
    factor = next(n for n in fresh.body if isinstance(n, ast.FunctionDef) and n.name == 'factor')
    scope = dict(math=math, warmup=200, updates=10000)
    exec(compile(ast.fix_missing_locations(ast.Module(body=[factor], type_ignores=[])), '<冻结LR函数>', 'exec'), scope)
    return scope['factor']


FACTOR = factor_from_frozen_source()


def manifest():
    parents = []
    for corpus, players in [('old', 2), ('new', 2), ('new', 3), ('new', 4)]:
        for index in range(12):
            identifier = f'fixture-{corpus}-{players}-{index}'
            parents.append(dict(parentId=identifier, split='train', corpus=corpus, admitted=True,
                                players=players, category='synthetic', source='synthetic-only',
                                isolationGroupId=identifier, groupId=identifier, actions=30,
                                positions=[[i, 0, i // 2] for i in range(6)]))
    return dict(parents=parents)


def cpu_rng():
    return dict(python=random.getstate(), numpy=np.random.get_state(), torch=torch.get_rng_state(), gpu=None)


def cpu_restore(state):
    random.setstate(state['python'])
    np.random.set_state(state['numpy'])
    torch.set_rng_state(state['torch'])


class Toy(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.linear = torch.nn.Linear(2, 1)

    def export(self, prefix):
        prefix = Path(prefix)
        prefix.with_suffix('.bin').write_bytes(b''.join(v.detach().numpy().tobytes() for v in self.state_dict().values()))
        prefix.with_suffix('.json').write_text(json.dumps({'fixture': '三参数CPU夹具，不能作为2M模型加载'}), 'utf-8')


class Services:
    def __init__(self, root, stop_after=None, partial_failure=False, heartbeat_lock=False, cleanup_failure=False):
        self.root, self.stop_after = root, stop_after
        self.partial_failure, self.heartbeat_lock, self.cleanup_failure = partial_failure, heartbeat_lock, cleanup_failure
        self.calls, self.requests, self.first_model = 0, [], None
        self.fresh_calls = 0
        self.reader, self.ledger = None, None
        self.torch = SimpleNamespace(save=torch.save, load=torch.load,
                                     set_num_threads=lambda n: None, set_num_interop_threads=lambda n: None)

    def fresh(self, device, peak, updates, warmup):
        self.fresh_calls += 1
        random.seed(1247)
        np.random.seed(1247)
        torch.manual_seed(1247)
        model = Toy()
        optimizer = torch.optim.AdamW(model.parameters(), lr=peak, weight_decay=1e-4, foreach=False)
        scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, FACTOR)
        return model, optimizer, scheduler, {'workerRngStates': []}, {'syntheticCpuFixture': True}

    def update(self, model, optimizer, scheduler, rows, device, microbatch):
        optimizer.zero_grad(set_to_none=True)
        x = torch.tensor([[r['macro'] % 5 / 5, r['choice'] % 17 / 17] for r in rows], dtype=torch.float32)
        y = torch.tensor([[r['choice'] % 3] for r in rows], dtype=torch.float32)
        loss = (model.linear(x) - y).square().mean() + torch.rand(()) * 1e-6
        loss.backward()
        norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1., foreach=False)
        lr = optimizer.param_groups[0]['lr']
        optimizer.step()
        scheduler.step()
        self.calls += 1
        COUNTERS['syntheticCpuOptimizerUpdates'] += 1
        if self.calls == 1:
            self.first_model = copy.deepcopy(model.state_dict())
        if self.partial_failure and self.calls == 2:
            raise ValueError('合成半批失败：当前模型已变动，禁止保存为完整批')
        if self.stop_after == self.calls:
            (self.root / 'STOP').write_text('合成显式停止', 'utf-8')
        return dict(loss=float(loss), gradientNorm=float(norm), learningRateUsed=lr,
                    nextLearningRate=optimizer.param_groups[0]['lr'])

    def encoder(self, *args):
        services = self

        class Encoder:
            def rows(self, requests, timeout):
                services.requests.append(copy.deepcopy(requests))
                if services.heartbeat_lock:
                    services.reader = Reader(services.ledger.path)
                    if not services.ledger.closed.wait(1):
                        raise AssertionError('合成心跳没有传播失败')
                return [dict(r, source={'split': 'train'}) for r in requests]

            def close(self):
                pass
        return Encoder()

    def ledger_factory(self, *args, **kwargs):
        if self.heartbeat_lock:
            kwargs.update(interval=.01, io_cap=.06)
        self.ledger = io_control.BudgetLedger(*args, **kwargs)
        if self.cleanup_failure:
            def failed_stop(status):
                self.ledger.closed.set()
                if self.ledger.thread:
                    self.ledger.thread.join(1)
                raise io_control.PersistenceFailure('合成收尾持久锁失败')
            self.ledger.stop = failed_stop
        return self.ledger

    def runtime(self):
        return SimpleNamespace(torch=self.torch, BASE_SHA='fixture-base', fresh=self.fresh,
                               device_for=lambda name: torch.device('cpu'), Sampler=RT.Sampler,
                               update=self.update, Encoder=self.encoder, rng_state=cpu_rng, restore_rng=cpu_restore,
                               tensor_digest=RT.tensor_digest, sha=RT.sha, identity=lambda device: {'fixture': 'CPU'})


def config():
    value = recovery.read(STAGE1 / 'stage2-configs/lr-1e-4.json')
    value.update(sampleBudget=48, partitionsSha256='fixture-partitions', checkpointSha256='fixture-base',
                 checkpointEveryUpdates=100, diagnosticEveryUpdates=2500)
    value['stop'] = dict(value['stop'], lowFreeDiskBytes=0)
    return value


def run_fixture(which, root, services, resume=None, old_target=6):
    cfg = config()
    cfgpath = root.parent / (root.name + '-config.json')
    cfgpath.write_text(json.dumps(cfg), 'utf-8')
    args = SimpleNamespace(config=cfgpath, out=root, device='cpu', resume=resume, reviewed_stage=True,
                           preflight_only=False, code_approval=None, engineering_updates=old_target)
    scientific = {'executionRuntime': {'device': 'cpu'}}
    capture = textio.StringIO()
    try:
        if which == 'v2':
            old_here = root.parent / (root.name + '-old-here')
            old_here.mkdir()
            (old_here / 'PARTITIONS.json').write_text(json.dumps(manifest()), 'utf-8')
            replacement = dict(HERE=old_here, BASE_SHA='fixture-base', torch=services.torch,
                               validate=lambda *a, **k: (OLD_IDENTITY, scientific), runner_sources=lambda *a: {'fixture': True},
                               fresh=services.fresh, device_for=lambda name: torch.device('cpu'), Sampler=RT.Sampler,
                               update=services.update, Encoder=services.encoder, rng_state=cpu_rng, restore_rng=cpu_restore,
                               tensor_digest=RT.tensor_digest, identity=lambda device: {'fixture': 'CPU'})
            with patch.multiple(OLD, **replacement), redirect_stderr(capture):
                OLD.run(args)
        else:
            original_read = V3.read

            def fixture_read(path):
                return manifest() if Path(path).name == 'PARTITIONS.json' else original_read(path)
            with patch.multiple(V3, validate_control=lambda *a: (NEW_IDENTITY, scientific),
                                require_code_approval=lambda *a: {'syntheticFixtureOnly': True},
                                load_runtime=services.runtime, read=fixture_read,
                                BudgetLedger=services.ledger_factory), redirect_stderr(capture):
                V3.run(args)
    finally:
        (root.parent / (root.name + '.stderr.log')).write_text(capture.getvalue(), 'utf-8')
        if services.reader:
            services.reader.close()
    if which == 'v2':
        return torch.load(root / 'checkpoint.pt', map_location='cpu', weights_only=False)
    latest = recovery.read(root / 'LATEST.json')
    return torch.load(latest['file'], map_location='cpu', weights_only=False)


def equal_numerical(test, first, second):
    for key in ['model', 'optimizer']:
        test.assertEqual(RT.tensor_digest(first[key]), RT.tensor_digest(second[key]))
    test.assertEqual(first['scheduler'], second['scheduler'])
    test.assertEqual(first['sampler'], second['sampler'])
    test.assertEqual(first['rng']['python'], second['rng']['python'])
    test.assertTrue(np.array_equal(first['rng']['numpy'][1], second['rng']['numpy'][1]))
    test.assertTrue(torch.equal(first['rng']['torch'], second['rng']['torch']))
    test.assertEqual(first['stageUpdates'], second['stageUpdates'])


class ProductionFlowFixtures(unittest.TestCase):
    def test_exhausted_budget_refuses_before_model_initialization(self):
        root = case_dir('flow-zero-budget')
        services = Services(root / 'run')
        with patch.object(V3, 'ArmBudget', lambda limit, consumed=0., started=None:
                          io_control.ArmBudget(limit, consumed=limit, started=started)):
            with self.assertRaises(io_control.BudgetExpired):
                run_fixture('v3', root / 'run', services)
        self.assertEqual(services.fresh_calls, 0)
        self.assertEqual(services.calls, 0)
        self.assertFalse((root / 'run').exists())

    def test_original_new_and_resume_paths_are_numerically_equal(self):
        root = case_dir('flow-equivalence')
        old_services, new_services = Services(root / 'old'), Services(root / 'new')
        old = run_fixture('v2', root / 'old', old_services)
        new = run_fixture('v3', root / 'new', new_services)
        equal_numerical(self, old, new)
        self.assertEqual(old_services.requests, new_services.requests)
        old_first = Services(root / 'old-first')
        run_fixture('v2', root / 'old-first', old_first, old_target=2)
        old_second = Services(root / 'old-second')
        old_resumed = run_fixture('v2', root / 'old-second', old_second, root / 'old-first/checkpoint.pt')
        equal_numerical(self, old, old_resumed)
        new_first = Services(root / 'new-first', stop_after=2)
        run_fixture('v3', root / 'new-first', new_first)
        first_latest = recovery.read(root / 'new-first/LATEST.json')
        new_second = Services(root / 'new-second')
        new_resumed = run_fixture('v3', root / 'new-second', new_second, Path(first_latest['file']))
        equal_numerical(self, old, new_resumed)
        self.assertEqual(new_first.requests + new_second.requests, old_services.requests)
        self.assertEqual(new_resumed['armBudget']['armId'], recovery.read(root / 'new-first/ARM_BUDGET.json')['armId'])
        self.assertEqual(new_resumed['armBudget']['ledgerPath'], str((root / 'new-first/ARM_BUDGET.json').resolve()))
        for directory in ['old', 'new']:
            rows = [json.loads(s) for s in (root / directory / 'METRICS.jsonl').read_text('utf-8').splitlines()]
            self.assertEqual([r['learningRateUsed'] for r in rows], [.0001 * FACTOR(i) for i in range(6)])
        (root / 'EQUIVALENCE.json').write_text(json.dumps(dict(passed=True, parameters=3,
            originalAndNewControlLoopsCompared=True, originalAndNewResumeCompared=True,
            samplerOrderEqual=True, learningRatesEqual=True, modelOptimizerSchedulerRngCursorEqual=True,
            real2mOptimizerUpdates=0, gpuForwardCalls=0)), 'utf-8')

    def test_half_batch_and_cleanup_failure_keep_complete_barrier(self):
        root = case_dir('flow-half-batch')
        services = Services(root / 'run', partial_failure=True, cleanup_failure=True)
        with self.assertRaisesRegex(ValueError, '合成半批失败'):
            run_fixture('v3', root / 'run', services)
        latest = recovery.read(root / 'run/LATEST.json')
        state = torch.load(latest['file'], map_location='cpu', weights_only=False)
        self.assertEqual(state['stageUpdates'], 1)
        self.assertEqual(state['sampler']['cursor'], 8)
        self.assertFalse(state['recoveryAllowed'])
        self.assertEqual(RT.tensor_digest(state['model']), RT.tensor_digest(services.first_model))
        closure = recovery.read(next((root / 'run').glob('RUN_CLOSURE-*.json')))
        self.assertIn('合成半批失败', closure['primaryError'])
        self.assertTrue(any('合成收尾持久锁失败' in row['error'] for row in closure['cleanupErrors']))

    @unittest.skipUnless(sys.platform == 'win32', 'Windows生产循环故障夹具')
    def test_heartbeat_error_reaches_production_guard_before_first_update(self):
        root = case_dir('flow-heartbeat')
        services = Services(root / 'run', heartbeat_lock=True)
        with self.assertRaises(io_control.HeartbeatFailure):
            run_fixture('v3', root / 'run', services)
        self.assertEqual(services.calls, 0)
        latest = recovery.read(root / 'run/LATEST.json')
        state = torch.load(latest['file'], map_location='cpu', weights_only=False)
        self.assertEqual(state['stageUpdates'], 0)
        self.assertEqual(state['sampler']['cursor'], 0)
        self.assertFalse(state['recoveryAllowed'])
        closure = recovery.read(next((root / 'run').glob('RUN_CLOSURE-*.json')))
        self.assertIn('HeartbeatFailure', closure['primaryError'])
        self.assertFalse(services.ledger.thread.is_alive())


if __name__ == '__main__':
    unittest.main(verbosity=2)
