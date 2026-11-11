"""默认心跳参数下区分正常慢优化与实际文件I/O故障；不运行GPU。"""
import json
import os
import time
import unittest

import io_control as io
from test_safety import Reader, case_dir


class SlowOptimization(unittest.TestCase):
    def test_default_slow_optimization_and_clone_defer_heartbeat(self):
        root = case_dir('r4-default-slow')
        budget, events = io.ArmBudget(20), []
        ledger = io.BudgetLedger(root / 'ledger.json', budget, event=events.append)
        self.assertEqual(ledger.io_cap, .5)
        self.assertEqual(ledger.interval, .5)
        completed = 0
        ledger.start()
        try:
            # 直接采用生产默认值；优化0.85秒及完整克隆0.85秒覆盖三个心跳周期。
            ledger.write()
            with ledger.optimization_guard():
                time.sleep(.85)
                time.sleep(.85)
                completed += 1
                self.assertIsNone(ledger.failure)
                self.assertFalse(ledger.closed.is_set())
            ledger.write()
            self.assertGreaterEqual(ledger.deferred_heartbeats, 2)
            self.assertGreaterEqual(ledger.last_persisted['observedWallSeconds'], 1.7)
            with ledger.optimization_guard():
                completed += 1
            ledger.write()
            self.assertEqual(completed, 2)
            self.assertIsNone(ledger.failure)
            self.assertFalse(any(e['kind'] == 'heartbeat_failed' for e in events))
            result = dict(passed=True, defaultIoCap=ledger.io_cap, defaultHeartbeatSeconds=ledger.interval,
                          slowOptimizationSeconds=.85, completeCloneSeconds=.85,
                          deferredHeartbeats=ledger.deferred_heartbeats, completedSyntheticGateBatches=completed,
                          postUpdatePersistedSeconds=ledger.last_persisted['observedWallSeconds'],
                          gpuForwardCalls=0, modelOptimizerUpdates=0)
            (root / 'R4_RESULT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), 'utf-8')
        finally:
            ledger.stop('r4_fixture_closed')

    @unittest.skipUnless(os.name == 'nt', '实际Windows共享错误合同')
    def test_real_write_failure_after_slow_update_blocks_next_batch(self):
        root = case_dir('r4-real-failure-after-slow')
        budget, events = io.ArmBudget(20), []
        ledger = io.BudgetLedger(root / 'ledger.json', budget, event=events.append)
        reader, completed, next_batches = None, 0, 0
        ledger.start()
        try:
            ledger.write()
            with ledger.optimization_guard():
                time.sleep(.85)
                time.sleep(.85)
                completed += 1
                self.assertIsNone(ledger.failure)
            reader = Reader(ledger.path)
            with self.assertRaises(io.PersistenceFailure):
                ledger.write()
            self.assertIsNotNone(ledger.failure)
            self.assertTrue(any(e['kind'] == 'sharing_retry' and e['winerror'] == 5 for e in events))
            with self.assertRaises(io.HeartbeatFailure):
                with ledger.optimization_guard():
                    next_batches += 1
            self.assertEqual(completed, 1)
            self.assertEqual(next_batches, 0)
            (root / 'R4_RESULT.json').write_text(json.dumps(dict(
                passed=True, defaultIoCap=ledger.io_cap, defaultHeartbeatSeconds=ledger.interval,
                completedSyntheticGateBatches=completed, nextOptimizationBatches=next_batches,
                realWindowsSharingErrorObserved=True, failure=repr(ledger.failure),
                gpuForwardCalls=0, modelOptimizerUpdates=0), ensure_ascii=False, indent=2), 'utf-8')
        finally:
            if reader:
                reader.close()
            ledger.stop('r4_failure_fixture_closed')
