"""电脑验收完成后的只读重放、隔离、公共检查与报告交付。"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from run_league import DIR, ROOT, read, save, sha, verify_runtime_contract


def execute(name, command):
    attempt = 1
    while (DIR / f'pc-completion-{name}-attempt{attempt:02d}.log').exists():
        attempt += 1
    log = DIR / f'pc-completion-{name}-attempt{attempt:02d}.log'
    print(json.dumps(dict(stage=name, status='started'), ensure_ascii=False), flush=True)
    start = time.perf_counter()
    with log.open('wb') as output:
        code = subprocess.run(command, cwd=ROOT, stdout=output, stderr=subprocess.STDOUT, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'NO_COLOR': '1'}).returncode
    result = dict(name=name, command=command, code=code, passed=code == 0, seconds=time.perf_counter() - start, log=log.name, logSha256=sha(log))
    print(json.dumps(result, ensure_ascii=False), flush=True)
    assert code == 0, f'检查失败，保留日志:{log.name}'
    return result


def node_tool(name, script, *args):
    return execute(name, ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_gen02_20261021/' + script, *args])


def main():
    assert read(DIR / 'league-state.json')['currentGeneration'] == 1
    assert read(DIR / 'generations/gen_01/arena-summary.json')['completedSlots'] == 112
    verify_runtime_contract()
    device_identity = read(DIR / 'device-comparison-10-run02/identity.json')
    public_source_matches = {name: sha(ROOT / 'ai_training' / name) == digest for name, digest in device_identity['sources'].items() if name.startswith('../src/')}
    assert all(public_source_matches.values()), '公共对手或推理依赖源码变化，不能混用旧结果'
    diagnostics = []
    diagnostics.append(node_tool('derive-latency', 'derive_latency.ts'))
    diagnostics.append(node_tool('post-evaluation-isolation', 'post_evaluation_audit.ts', '1'))
    diagnostics.append(execute('checkpoint-resume', [sys.executable, '-B', '-X', 'utf8', str(DIR / 'resume_audit.py')]))
    diagnostics.append(execute('promotion-contracts', [sys.executable, '-B', '-X', 'utf8', str(DIR / 'test_league_contracts.py')]))
    results = []
    for name, command in [('lint', ['npm.cmd', 'run', 'lint']), ('test', ['npm.cmd', 'test']), ('build', ['npm.cmd', 'run', 'build']), ('independent-tsc', ['node', str(ROOT / 'node_modules/typescript/bin/tsc'), '-p', str(DIR / 'tsconfig.json'), '--pretty', 'false'])]:
        results.append(execute(name, command))
    public = read(DIR / 'public-checks.json')
    public['pcResume'] = dict(passed=all(r['passed'] for r in results), results=results, diagnostics=diagnostics, testLog=next(r['log'] for r in results if r['name'] == 'test'), completedAt=datetime.now(timezone(timedelta(hours=8))).isoformat())
    public['passed'] = public['passed'] and public['pcResume']['passed']
    public['finalIndependentTypeCheck'] = dict(passed=True, log=results[-1]['log'], sha256=results[-1]['logSha256'], coversPcResume=True, coversDeviceDiagnostics=True, coversEvaluationIndexPreservation=True, coversPostEvaluationAudit=True)
    save(DIR / 'public-checks.json', public)
    isolation = read(DIR / 'post-evaluation-isolation.json')
    save(DIR / 'PC_COMPLETION_VALIDATION.json', dict(passed=isolation['passed'], diagnostics=diagnostics, publicChecks=results, indexRegression=read(DIR / 'evaluation-index-regression.json'), postEvaluationIsolation=isolation['passed'], runtimeContractMatched=True, publicSourcesMatchPriorDeviceSnapshot=public_source_matches, phoneTesting=False))
    # 最后生成清单；此后不写入会使清单SHA过期的运行日志或状态文件。
    from finalize import main as finalize
    finalize()


if __name__ == '__main__':
    main()
