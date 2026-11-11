"""用新增默认参数回归识别保留的repair2误停，真实训练保持零。"""
import importlib.util
import io
import json
import unittest
from unittest.mock import patch

from frozen import HERE
import test_r4_slow


if __name__ == '__main__':
    path = HERE.parent / 'runner_v3_repair2/io_control.py'
    spec = importlib.util.spec_from_file_location('superseded_r4_io', path)
    previous = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(previous)
    suite = unittest.TestSuite([test_r4_slow.SlowOptimization('test_default_slow_optimization_and_clone_defer_heartbeat')])
    stream = io.StringIO()
    with patch.object(test_r4_slow, 'io', previous):
        result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
    (HERE / 'R4_PREVIOUS_REGRESSION.log').write_text(stream.getvalue(), 'utf-8')
    detected = len(result.failures) == 1 and not result.errors and '等待预算写者锁超过期限' in stream.getvalue()
    report = dict(passed=detected, expectedPreviousRevisionFailures=1, actualFailures=len(result.failures),
                  actualErrors=len(result.errors), defaultIoCap=.5, defaultHeartbeatSeconds=.5,
                  optimizationAndCloneSeconds=1.7, originalFilesModified=False,
                  gpuForwardCalls=0, real2mOptimizerUpdates=0, newArenaGames=0)
    (HERE / 'R4_PREVIOUS_REGRESSION.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    print(json.dumps(report, ensure_ascii=False))
    if not detected:
        raise SystemExit(1)
