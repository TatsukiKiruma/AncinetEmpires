"""在独立 Linux 工作目录顺序测量训练进程组资源，结果不纳入正式训练集。"""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = Path.cwd()
OUT = ROOT / 'benchmark'
OUT.mkdir(exist_ok=True)
HZ = os.sysconf('SC_CLK_TCK')


def memory():
    return {line.split(':')[0]: int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines()}


def group_usage(pgid):
    cpu, rss, pss = 0, 0, 0
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            fields = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
            if int(fields[2]) != pgid:
                continue
            cpu += (int(fields[11]) + int(fields[12])) / HZ
            rss += int(fields[21]) * os.sysconf('SC_PAGE_SIZE') / 1024
            for line in (entry / 'smaps_rollup').read_text().splitlines():
                if line.startswith('Pss:'):
                    pss += int(line.split()[1])
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            pass
    return cpu, rss, pss


def health():
    start = time.monotonic()
    try:
        with urllib.request.urlopen('https://111.230.73.106/health/ready', timeout=4) as response:
            return {'status': response.status, 'ms': (time.monotonic() - start) * 1000}
    except Exception as error:
        return {'error': str(error)}


def containers():
    result = subprocess.run(['sudo', '-n', 'docker', 'stats', '--no-stream', '--format', '{{json .}}'], capture_output=True, text=True, timeout=10)
    return [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]


def run_case(phase, workers, args):
    name = f'{phase}-w{workers}'
    samples, health_checks, service_samples = [], [], []
    reason = None
    start = time.monotonic()
    with (OUT / f'{name}.log').open('w') as log:
        process = subprocess.Popen(['nice', '-n', '10', 'node', '--openssl-legacy-provider', '--import', 'tsx', *args], stdout=log, stderr=log, start_new_session=True)
        previous_cpu, previous_time = 0, start
        while process.poll() is None:
            now = time.monotonic()
            cpu, rss, pss = group_usage(process.pid)
            mem = memory()
            samples.append({'seconds': now - start, 'cpuPercent': max(0, cpu - previous_cpu) / max(now - previous_time, .001) * 100,
                            'rssMiB': rss / 1024, 'pssMiB': pss / 1024, 'availableMiB': mem['MemAvailable'] / 1024,
                            'swapUsedMiB': (mem['SwapTotal'] - mem['SwapFree']) / 1024})
            previous_cpu, previous_time = cpu, now
            if len(samples) % 10 == 1:
                health_checks.append(health())
                service_samples.append(containers())
            if mem['MemAvailable'] < 700 * 1024:
                reason = '可用内存低于 700 MiB，主动停止'
            if now - start > 360:
                reason = '达到单项 360 秒上限，主动停止'
            if reason:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                break
            time.sleep(1)
        process.wait()
    duration = time.monotonic() - start
    result = {'phase': phase, 'workers': workers, 'exitCode': process.returncode, 'stopReason': reason,
              'elapsedSeconds': duration, 'peakRssMiB': max(s['rssMiB'] for s in samples),
              'peakPssMiB': max(s['pssMiB'] for s in samples), 'minAvailableMiB': min(s['availableMiB'] for s in samples),
              'peakSwapUsedMiB': max(s['swapUsedMiB'] for s in samples),
              'averageCpuPercent': sum(s['cpuPercent'] * (s['seconds'] - (samples[i-1]['seconds'] if i else 0)) for i, s in enumerate(samples)) / duration,
              'peakCpuPercent': max(s['cpuPercent'] for s in samples), 'health': health_checks, 'containers': service_samples}
    (OUT / f'{name}.samples.json').write_text(json.dumps(samples))
    (OUT / f'{name}.result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({k: v for k, v in result.items() if k not in ('health', 'containers')}), flush=True)
    return result


features_only = '--features-only' in sys.argv
results = [json.loads((OUT / f'episodes-w{workers}.result.json').read_text()) for workers in range(1, 5)] if features_only else []
if not features_only:
    (OUT / 'baseline.json').write_text(json.dumps({'memory': memory(), 'health': health(), 'containers': containers()}, indent=2))
    for workers in range(1, 5):
        results.append(run_case('episodes', workers, ['tools/sd_training_plan_runner.ts', '--plan-id', 'sd-normal', '--limit-jobs', '12',
            '--run', '--max-turns', '12', '--workers', str(workers), '--out-dir', f'benchmark/episodes-w{workers}', '--no-progress', '--json']))
        if results[-1]['exitCode'] != 0:
            break
if len(results) == 4 and all(row['exitCode'] == 0 for row in results):
    for workers in range(1, 5):
        results.append(run_case('features-short', workers, ['tools/skirmish_old_dataset_migrate.ts', '--input',
            'benchmark/episodes-w1/sd-normal-episodes.jsonl', '--out-root', f'benchmark/features-short-w{workers}',
            '--batch-episodes', '1', '--max-samples-per-episode', '12', '--shard-samples', '5000',
            '--workers', str(workers), '--relabel-mode', 'fast-rollout', '--timeout-tail-turns', '0', '--json']))
        if results[-1]['exitCode'] != 0:
            break
(OUT / 'results.json').write_text(json.dumps(results, indent=2))
print('测试结束', flush=True)
