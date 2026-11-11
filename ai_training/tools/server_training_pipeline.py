"""服务器正式数据流水线：复用已有对局，三 worker 补全、导出并校验。"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time

ROOT = Path.cwd()
RUNTIME = ROOT / 'runtime'
RUN = 'sd_training_plan_20260705_heuristic-apk-like-balanced'
EPISODES = ROOT / 'training_runs' / 'episodes' / RUN
FEATURES = ROOT / 'training_runs' / 'feature_datasets' / RUN
PLAN = 'training_configs/sd_training_plan_20260705.json'
STATE = RUNTIME / 'status.json'
NODE = ['node', '--openssl-legacy-provider', '--import', 'tsx']
FEATURE_WORKERS = 2
RUNTIME.mkdir(exist_ok=True)
state = {'workers': 3, 'episodeWorkers': 3, 'featureWorkers': FEATURE_WORKERS, 'state': 'starting', 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
child = None


def save(**values):
    state.update(values)
    state['updatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    temporary = STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(STATE)


def stop_child():
    if child is not None and child.poll() is None:
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=60)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()


def interrupted(signum, frame):
    stop_child()
    save(state='paused', reason='收到停止信号，已保留已完成对局和 checkpoint')
    raise SystemExit(0)


def command(phase, args):
    global child
    log_path = RUNTIME / f'{phase}.log'
    save(state='running', phase=phase, workers=FEATURE_WORKERS if phase == 'features' else 3, command=NODE + args, log=str(log_path), reason=None)
    print(f'开始 {phase}', flush=True)
    with log_path.open('a') as log:
        log.write('\n启动时间：' + state['updatedAt'] + '\n')
        log.flush()
        child = subprocess.Popen(NODE + args, stdout=log, stderr=log, start_new_session=True)
        while child.poll() is None:
            free = shutil.disk_usage(ROOT).free
            if free < 5 * 1024**3:
                stop_child()
                save(state='paused', reason='磁盘可用空间低于 5 GiB，保留断点并停止，需补充空间后续跑')
                raise SystemExit(0)
            save(diskFreeBytes=free, childPid=child.pid)
            time.sleep(10)
        code = child.returncode
        child = None
    if code != 0:
        raise RuntimeError(f'{phase} 失败，退出码 {code}；详情：{log_path}')
    print(f'完成 {phase}', flush=True)


def hash_file(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def audit(jobs, complete=False):
    expected = {}
    for job in jobs:
        expected.setdefault(job['planId'], set()).add((job['scenarioId'], job['seed']))
    counts = {}
    smoke = []
    for plan, keys in expected.items():
        file = EPISODES / f'{plan}-episodes.jsonl'
        found = set()
        if file.exists():
            with file.open() as stream:
                for number, line in enumerate(stream, 1):
                    episode = json.loads(line)
                    key = (episode['scenario']['id'], episode['seed'])
                    summary = episode['summary']
                    if key not in keys or key in found or not line.endswith('\n'):
                        raise ValueError(f'{file}:{number} 非计划内对局、重复或不完整记录')
                    if summary['illegalActionCount'] or summary['stoppedByMaxSteps'] or summary['stepCount'] != len(episode['steps']):
                        raise ValueError(f'{file}:{number} 对局完整性校验失败')
                    if 'random' in episode['policyByPlayer'].values():
                        raise ValueError(f'{file}:{number} 存在 random 标签')
                    if not found:
                        smoke.append(episode)
                    found.add(key)
        counts[plan] = {'completed': len(found), 'planned': len(keys)}
        if complete and found != keys:
            raise ValueError(f'{plan} 对局未齐：{len(found)}/{len(keys)}')
    save(episodeCounts=counts, completedEpisodes=sum(c['completed'] for c in counts.values()), plannedEpisodes=len(jobs))
    return smoke


def main():
    # 独占锁避免重复启动同时写入同一批输出。
    lock = (RUNTIME / 'pipeline.lock').open('w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    snapshot = json.loads((ROOT / 'deployment_manifest.json').read_text())
    save(phase='verify-source')
    # 对局会被合法追加；续跑时仅校验不可变源码，初次输入另有哈希证据。
    for relative, digest in snapshot['sourceFiles'].items():
        if hash_file(ROOT / relative) != digest:
            raise ValueError(f'源码快照不匹配：{relative}')
    if not (RUNTIME / 'input-verified.json').exists():
        for relative, digest in snapshot['inputFiles'].items():
            if hash_file(ROOT / relative) != digest:
                raise ValueError(f'初始数据哈希不匹配：{relative}')
        (RUNTIME / 'input-verified.json').write_text(json.dumps(snapshot['inputFiles'], indent=2))
    jobs = [json.loads(line) for line in (ROOT / 'planned_jobs.jsonl').read_text().splitlines()]
    smoke = audit(jobs)
    command('manifest', ['tools/sd_training_job_manifest.ts', '--out-root', 'runtime/job_manifests', '--json'])
    # 每个已有方案抽一局验证当前引擎重放；测试特征与正式输出严格分目录。
    if smoke and not (RUNTIME / 'replay-smoke-passed.json').exists():
        smoke_path = RUNTIME / 'replay-smoke.jsonl'
        smoke_path.write_text(''.join(json.dumps(e, separators=(',', ':')) + '\n' for e in smoke))
        command('replay-smoke', ['tools/skirmish_old_dataset_migrate.ts', '--input', str(smoke_path), '--plan', PLAN,
                '--out-root', 'runtime/replay-smoke-features', '--result-file', 'runtime/replay-smoke-result.json',
                '--workers', '3', '--batch-episodes', '1', '--max-samples-per-episode', '1',
                '--relabel-mode', 'none', '--timeout-tail-turns', '0', '--json'])
        result = json.loads((RUNTIME / 'replay-smoke-result.json').read_text())
        smoke_manifest = json.loads(Path(result['finalManifest']).read_text())
        if smoke_manifest['summary']['replayedEpisodes'] != len(smoke):
            raise ValueError('抽样对局未全部重放，不能启动正式续跑')
        (RUNTIME / 'replay-smoke-passed.json').write_text(json.dumps(result, indent=2))
    plans = [entry['id'] for entry in json.loads((ROOT / PLAN).read_text())['plans']]
    for plan in plans:
        if state['episodeCounts'][plan]['completed'] == state['episodeCounts'][plan]['planned']:
            continue
        command(f'episodes-{plan}', ['tools/sd_training_plan_runner.ts', '--plan-id', plan, '--run',
                '--preset', 'heuristic-apk-like-balanced', '--workers', '3', '--out-dir', str(EPISODES),
                '--progress-turn-interval', '5', '--json'])
        audit(jobs)
    audit(jobs, complete=True)
    # 与 sd_train_all.ps1 的正式导出参数保持一致，最终仅生成训练集，不训练模型。
    args = ['tools/skirmish_old_dataset_migrate.ts', '--plan', PLAN, '--out-root', str(FEATURES),
            '--result-file', 'runtime/export-result.json', '--workers', str(FEATURE_WORKERS), '--batch-episodes', '10',
            '--dataset-version', RUN + '-v3', '--feature-dim', '4096', '--feature-extractor', 'hashed-action-v3',
            '--max-candidates', '64', '--hard-negative-ratio', '0.5', '--timeout-prefix-turns', '80',
            '--timeout-tail-turns', '20', '--max-samples-per-episode', '800', '--action-type-limit', 'move=400000',
            '--action-type-limit', 'wait=200000', '--shard-samples', '50000', '--validation-ratio', '0.1',
            '--split-seed', '20260730', '--relabel-mode', 'fast-rollout', '--relabel-policy', 'random',
            '--relabel-policy', 'apk-like', '--json']
    for plan in plans:
        args.extend(['--input', str(EPISODES / f'{plan}-episodes.jsonl')])
    command('features', args)
    result = json.loads((RUNTIME / 'export-result.json').read_text())
    manifest = result.get('finalManifest')
    if not manifest or result.get('paused'):
        raise ValueError('特征导出未完成，缺少最终 manifest')
    command('validate', ['tools/skirmish_dataset_validate.ts', '--manifest', manifest])
    save(state='complete', phase='complete', finalManifest=manifest, childPid=None)
    (RUNTIME / 'complete.marker').write_text(manifest + '\n')
    print('全部训练集生成并校验完成', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        stop_child()
        save(state='failed', reason=str(error), childPid=None)
        print(str(error), flush=True)
        raise SystemExit(2)
