"""轻量Windows故障合同；真实检查点只读，训练及实战均不启动。"""
import copy
import ctypes
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

import io_control as io
import recovery
from frozen import HERE, STAGE1, legacy_contracts, legacy_budget


def case_dir(name):
    fixtures = HERE / 'fixtures'
    fixtures.mkdir(exist_ok=True)
    return Path(tempfile.mkdtemp(prefix=name + '-', dir=fixtures))


class Reader:
    def __init__(self, path):
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.CreateFileW.restype = ctypes.c_void_p
        self.kernel.CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
                                           ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
        self.kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        self.handle = self.kernel.CreateFileW(str(path), 0x80000000, 3, None, 3, 0x80, None)
        if self.handle == ctypes.c_void_p(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        self.lock = threading.Lock()

    def close(self):
        with self.lock:
            if self.handle is not None:
                self.kernel.CloseHandle(self.handle)
                self.handle = None


@unittest.skipUnless(os.name == 'nt', '真实Windows读锁合同需要Windows')
class WindowsIO(unittest.TestCase):
    def test_short_lock_recovers_and_counts_wait(self):
        root = case_dir('short-lock')
        path = root / 'ledger.json'
        path.write_text('old', 'utf-8')
        reader = Reader(path)
        timer = threading.Timer(.08, reader.close)
        events = []
        budget = io.ArmBudget(10)
        timer.start()
        try:
            receipt = io.json_save(path, {'value': 'new'}, budget, cap=.4, event=events.append)
        finally:
            reader.close()
            timer.join()
        self.assertGreater(receipt['attempts'], 1)
        self.assertGreaterEqual(budget.elapsed(), .06)
        self.assertEqual(json.loads(path.read_text('utf-8')), {'value': 'new'})
        self.assertTrue(any(e['kind'] == 'sharing_retry_recovered' for e in events))

    def test_persistent_lock_stops_and_keeps_old_target(self):
        root = case_dir('persistent-lock')
        path = root / 'ledger.json'
        path.write_text('old', 'utf-8')
        reader = Reader(path)
        budget = io.ArmBudget(10)
        try:
            with self.assertRaises(io.PersistenceFailure):
                io.json_save(path, {'value': 'new'}, budget, cap=.07)
            self.assertLess(budget.elapsed(), .35)
            self.assertGreaterEqual(budget.elapsed(), .06)
            self.assertEqual(path.read_text('utf-8'), 'old')
        finally:
            reader.close()

    def test_expiry_during_retry_starts_no_update(self):
        root = case_dir('expiry-lock')
        path = root / 'ledger.json'
        path.write_text('old', 'utf-8')
        reader = Reader(path)
        budget = io.ArmBudget(.04)
        updates = 0
        try:
            with self.assertRaises((io.BudgetExpired, io.PersistenceFailure)):
                io.json_save(path, {'value': 'new'}, budget, cap=.5)
                updates += 1
            self.assertEqual(updates, 0)
            self.assertEqual(budget.remaining(), 0)
            self.assertLess(budget.elapsed(), .3)
        finally:
            reader.close()

    def test_heartbeat_failure_blocks_next_optimization(self):
        root = case_dir('heartbeat')
        budget = io.ArmBudget(10)
        ledger = io.BudgetLedger(root / 'ledger.json', budget, interval=.01, io_cap=.06)
        ledger.start()
        reader = Reader(ledger.path)
        updates = 0
        try:
            self.assertTrue(ledger.closed.wait(1.))
            self.assertIsNotNone(ledger.failure)
            with self.assertRaises(io.HeartbeatFailure):
                with ledger.optimization_guard():
                    updates += 1
            self.assertEqual(updates, 0)
            with self.assertRaises(io.PersistenceFailure):
                ledger.stop('persistent_lock')
        finally:
            reader.close()
            ledger.stop('fixture_closed')


class GeneralIO(unittest.TestCase):
    def test_zero_budget_never_calls_writer(self):
        path = case_dir('zero-budget') / 'untouched.json'
        called = []
        with self.assertRaises(io.BudgetExpired):
            io.atomic_save(path, lambda p: called.append(p), io.ArmBudget(1, consumed=1))
        self.assertEqual(called, [])
        self.assertFalse(path.exists())

    def test_slow_serializer_never_promotes_late_result(self):
        path = case_dir('slow-serializer') / 'target.json'

        def slow(pending):
            time.sleep(.16)
            pending.write_text('late', 'utf-8')
        with self.assertRaises(io.PersistenceFailure):
            io.atomic_save(path, slow, io.ArmBudget(10), cap=.03)
        self.assertFalse(path.exists())
        time.sleep(.2)
        self.assertFalse(path.exists())
        self.assertTrue(list(path.parent.glob('*.pending')))

    def test_unique_pending_paths_for_concurrent_writers(self):
        root = case_dir('unique-writers')
        paths, errors = [], []
        budget = io.ArmBudget(10)

        def operation(index):
            try:
                def writer(pending):
                    paths.append(pending)
                    pending.write_text(str(index), 'utf-8')
                io.atomic_save(root / f'target-{index}.json', writer, budget)
            except BaseException as error:
                errors.append(error)
        workers = [threading.Thread(target=operation, args=(i,)) for i in range(6)]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(1)
        self.assertFalse(errors)
        self.assertEqual(len(set(paths)), 6)

    def test_cleanup_cannot_mask_original_error(self):
        primary = ValueError('合成原始错误')

        def fail():
            raise io.PersistenceFailure('合成收尾错误')
        result = io.close_without_masking(primary, [('close', fail)])
        self.assertIn('合成原始错误', result['primaryError'])
        self.assertIn('合成收尾错误', result['cleanupErrors'][0]['error'])

    def test_only_windows_sharing_errors_are_retried(self):
        called = []

        def fail(pending):
            called.append(pending)
            raise ValueError('非文件共享错误')
        with self.assertRaisesRegex(ValueError, '非文件共享错误'):
            io.atomic_save(case_dir('no-broad-retry') / 'target', fail, io.ArmBudget(10))
        self.assertEqual(len(called), 1)

    def test_downtime_and_original_arm_are_inherited(self):
        root = case_dir('resume-budget')
        path = root / 'ledger.json'
        path.write_text(json.dumps(dict(armId='fixture-arm', latestCheckpointSha256='fixture-sha',
                        limitSeconds=14400, excludeDowntime=True, consumedWallSeconds=2466.96,
                        status='exception', pid=0)), 'utf-8')
        saved = dict(armBudget=dict(ledgerPath=str(path), armId='fixture-arm', limitSeconds=14400,
                     consumedWallSeconds=2466.79))
        first = legacy_budget.resume_budget(saved, 'fixture-sha')
        self.assertEqual(first[0], 2466.96)
        self.assertEqual(first[2], 'fixture-arm')
        self.assertLessEqual(14400 - first[0], 11933.04 + 1e-8)


class ExactBridge(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import torch
        cls.torch = torch
        cls.path = Path('D:/AncientEmpiresData/continuation_stage2_20261030_v1/lr-1e-4/checkpoint.pt')
        cls.original_sha = legacy_contracts.file_sha(cls.path)
        cls.saved = torch.load(cls.path, map_location='cpu', weights_only=False)
        cls.config = recovery.read(STAGE1 / 'stage2-configs/lr-1e-4.json')
        old, _ = legacy_contracts.validate(cls.config)
        cls.identity = dict(protocol=recovery.PROTOCOL, controlContractSha256='synthetic-inspection-only', frozenV2=old)
        cls.binding_root = case_dir('exact-binding')
        cls.ledger_sha = legacy_contracts.file_sha(Path(cls.saved['armBudget']['ledgerPath']))
        (cls.binding_root / 'EXACT_RECOVERY_BINDING.json').write_text(json.dumps(dict(
            checkpointSha256=recovery.EXACT_CHECKPOINT_SHA, armId=recovery.EXACT_ARM,
            ledgerPath=cls.saved['armBudget']['ledgerPath'], closedLedgerSha256=cls.ledger_sha,
            modelDigest='45f7b31a68fb08a125c290e2123ace2b4811f5b41a3ba2ce1693e437775f05c9',
            optimizerDigest='c7dc06b09b41202a3394069544a75b694c94c215631d4322b2e791dcb67c01ac')), 'utf-8')

    @classmethod
    def tearDownClass(cls):
        assert legacy_contracts.file_sha(cls.path) == cls.original_sha
        assert legacy_contracts.file_sha(Path(cls.saved['armBudget']['ledgerPath'])) == cls.ledger_sha

    def inspect(self, saved=None, config=None, path=None):
        with patch.object(recovery, 'HERE', self.binding_root):
            return recovery.inspect_resume(path or self.path, saved or self.saved, config or self.config, self.identity)

    def test_real_checkpoint_readonly_exact_bridge(self):
        receipt = self.inspect()
        self.assertFalse(receipt['originalRecoveryAllowed'])
        self.assertFalse(receipt['executePermissionGranted'])
        self.assertEqual(receipt['remainingUpdates'], 2242)
        self.assertEqual(receipt['remainingSamples'], 17936)
        self.assertLessEqual(receipt['remainingWallSeconds'], 11933.0414379 + 1e-9)
        self.assertFalse(self.saved['recoveryAllowed'])

    def test_rejects_original_false_flag_rewrite(self):
        saved = dict(self.saved, recoveryAllowed=True)
        with self.assertRaises(ValueError):
            self.inspect(saved)

    def test_rejects_pending_or_engineering_state(self):
        for key in ['pendingAccumulatedGradients', 'engineeringOnly']:
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.inspect(dict(self.saved, **{key: True}))

    def test_rejects_cursor_arm_reason_and_config_drift(self):
        changes = [dict(stageUpdates=7757), dict(reason='invalid_label'),
                   dict(armBudget=dict(self.saved['armBudget'], armId='wrong-arm')),
                   dict(armBudget=dict(self.saved['armBudget'], ledgerPath=str(self.binding_root / 'copy.json')))]
        for change in changes:
            with self.subTest(change=list(change)), self.assertRaises(ValueError):
                self.inspect(dict(self.saved, **change))
        with self.assertRaises(ValueError):
            self.inspect(config=dict(self.config, peakLearningRate=.00005))

    def test_unrelated_exception_cannot_use_bridge(self):
        path = self.binding_root / 'unrelated.pt'
        path.write_bytes(b'fixture-different-checksum')
        with self.assertRaises(ValueError):
            self.inspect(path=path)

    def test_finite_but_changed_model_is_rejected(self):
        saved = dict(self.saved, model=copy.deepcopy(self.saved['model']))
        name = next(iter(saved['model']))
        saved['model'][name].view(-1)[0] += 1
        with self.assertRaises(ValueError):
            self.inspect(saved)

    def test_current_review_does_not_approve_gpu_run(self):
        with self.assertRaises(ValueError):
            recovery.require_code_approval(None, self.identity, self.config, recovery.EXACT_CHECKPOINT_SHA)
        with self.assertRaises(ValueError):
            recovery.require_code_approval(STAGE1.parent / 'reviews/stage2-review-1.json', self.identity,
                                           self.config, recovery.EXACT_CHECKPOINT_SHA)

    def test_approval_binds_code_budget_arm_and_exact_exception(self):
        # 批准文件仅位于合成夹具目录；不会写真实reviews或用于执行训练。
        root = case_dir('approval-fixture')
        path = root / 'synthetic-review.json'
        approval = dict(schema='stage2-control-code-approval-v1', decision='approved_to_run',
                        controlContractSha256=self.identity['controlContractSha256'],
                        exactRecoveryCheckpointSha256=recovery.EXACT_CHECKPOINT_SHA,
                        sampleBudgetPerArm=80000, updateBudgetPerArm=10000,
                        wallSecondsPerArm=14400, learningRateArms=[.0001])
        with patch.object(recovery, 'REVIEWS', root):
            path.write_text(json.dumps(approval), 'utf-8')
            self.assertIn('sha256', recovery.require_code_approval(path, self.identity, self.config, recovery.EXACT_CHECKPOINT_SHA))
            for change in [dict(controlContractSha256='wrong'), dict(sampleBudgetPerArm=160000),
                           dict(updateBudgetPerArm=20000), dict(wallSecondsPerArm=28800),
                           dict(learningRateArms=[.00005]), dict(exactRecoveryCheckpointSha256='wrong')]:
                with self.subTest(change=list(change)):
                    path.write_text(json.dumps(dict(approval, **change)), 'utf-8')
                    with self.assertRaises(ValueError):
                        recovery.require_code_approval(path, self.identity, self.config, recovery.EXACT_CHECKPOINT_SHA)
