"""串行运行轻量合同与真实CLI护栏，不恢复GPU训练。"""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import time
import unittest
from unittest.mock import patch

import torch

from frozen import HERE, STAGE1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--core-only', action='store_true')
    args = parser.parse_args()
    if args.report.exists():
        raise FileExistsError('验证报告已存在，拒绝覆盖首次运行')
    started = time.perf_counter()
    gpu_attempts = []

    def reject_gpu(*a, **k):
        gpu_attempts.append(True)
        raise AssertionError('轻量夹具禁止CUDA初始化')
    suite = unittest.defaultTestLoader.discover(str(HERE), pattern='test_*.py')
    with patch.object(torch.cuda, '_lazy_init', reject_gpu):
        result = unittest.TextTestRunner(stream=sys.stdout, verbosity=2).run(suite)
    import test_flow
    cli = []
    if result.wasSuccessful() and not args.core_only:
        def call(name, arguments, expected):
            proc = subprocess.run([sys.executable, '-X', 'utf8', str(HERE / 'preflight_guard.py'), *arguments],
                                  capture_output=True, text=True, encoding='utf-8', timeout=60)
            (HERE / (name + '.stdout.log')).write_text(proc.stdout, 'utf-8')
            (HERE / (name + '.stderr.log')).write_text(proc.stderr, 'utf-8')
            passed = proc.returncode == expected and 'GPU_LAZY_INIT_ATTEMPTS=0' in proc.stderr
            cli.append(dict(name=name, exitCode=proc.returncode, expectedExitCode=expected,
                            passed=passed, gpuLazyInitAttempts=0 if 'GPU_LAZY_INIT_ATTEMPTS=0' in proc.stderr else None))
        for arm in ['lr-1e-4', 'lr-5e-5', 'lr-2.4495e-4']:
            call('preflight-' + arm, ['--config', str(STAGE1 / 'stage2-configs' / (arm + '.json')), '--preflight-only'], 0)
        call('preflight-exact-resume', ['--preflight-only', '--resume',
             'D:/AncientEmpiresData/continuation_stage2_20261030_v1/lr-1e-4/checkpoint.pt'], 0)
        untouched = HERE / 'fixtures/unapproved-output-must-not-exist'
        if untouched.exists():
            raise FileExistsError('未批准输出负例位置已存在')
        call('reject-no-code-approval', ['--out', str(untouched), '--reviewed-stage'], 1)
        call('reject-repair-only-review', ['--out', str(untouched), '--reviewed-stage', '--code-approval',
             str(STAGE1.parent / 'reviews/stage2-review-1.json')], 1)
        unsupported = json.loads((STAGE1 / 'stage2-configs/lr-1e-4.json').read_text('utf-8'))
        unsupported['microbatch'] = 2
        unsupported_path = HERE / 'fixtures/unsupported-microbatch.json'
        unsupported_path.write_text(json.dumps(unsupported), 'utf-8')
        call('reject-fixed-config-drift', ['--config', str(unsupported_path), '--preflight-only'], 1)
        if untouched.exists():
            raise AssertionError('未批准入口创建了运行输出')
    report = dict(passed=result.wasSuccessful() and not gpu_attempts and all(c['passed'] for c in cli),
                  unittestCases=result.testsRun, failures=len(result.failures), errors=len(result.errors),
                  skipped=len(result.skipped), cliCases=cli, gpuLazyInitAttempts=len(gpu_attempts),
                  syntheticCpuOptimizerUpdates=test_flow.COUNTERS['syntheticCpuOptimizerUpdates'],
                  real2mOptimizerUpdates=0, gpuForwardCalls=0, newArenaGames=0, seconds=time.perf_counter() - started,
                  scope='CPU三参数合成夹具、Windows隔离文件锁及真实CLI预检；不代表新GPU吞吐或GPU更新逐位复现。')
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps(report, ensure_ascii=False))
    if not report['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
