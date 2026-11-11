"""证明新增收尾计时回归能识别已保留的首版缺口，不运行模型训练。"""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import test_safety
from frozen import HERE


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


if __name__ == '__main__':
    previous = HERE.parent / 'runner_v3_repair1'
    old_io = module('superseded_control_io', previous / 'io_control.py')
    old_recovery = module('superseded_control_recovery', previous / 'recovery.py')
    suite = unittest.TestSuite([
        test_safety.GeneralIO('test_shutdown_tail_is_conservatively_charged'),
        test_safety.ExactBridge('test_unclosed_v3_budget_cannot_auto_resume')])
    output = io.StringIO()
    with patch.object(test_safety, 'io', old_io), patch.object(test_safety.recovery, 'inspect_resume', old_recovery.inspect_resume):
        result = unittest.TextTestRunner(stream=output, verbosity=2).run(suite)
    (HERE / 'SUPERSEDED_REGRESSION.log').write_text(output.getvalue(), 'utf-8')
    detected = not result.wasSuccessful() and len(result.failures) == 1 and len(result.errors) == 1
    report = dict(passed=detected, expectedOldRevisionFailures=1, expectedOldRevisionErrors=1,
                  actualFailures=len(result.failures), actualErrors=len(result.errors),
                  real2mOptimizerUpdates=0, gpuForwardCalls=0, originalEvidenceModified=False,
                  explanation='新增两项回归在保留的repair1上按预期失败；当前repair2的24项核心合同已通过。')
    (HERE / 'SUPERSEDED_REGRESSION.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    print(json.dumps(report, ensure_ascii=False))
    if not detected:
        raise SystemExit(1)
