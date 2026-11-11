"""完成在途固定批次，再根据门禁顺序运行吞吐对照。"""
import ctypes
import json
import math
from pathlib import Path
import subprocess
import sys
import time

import psutil
from phase_b_watch import DATA, HERE, now, processes, read_json, save

ROOT = HERE.parents[2]
PYTHON = sys.executable
NODE = 'node.exe'
STOP = HERE / 'STOP'


class GateFailure(Exception):
    def __init__(self, gate, message):
        self.gate = gate
        super().__init__(message)


def cutoff():
    files = [HERE / 'service-startup-attempt1.log', HERE / 'B_P1_CLOCK.json']
    start = min(p.stat().st_mtime for p in files if p.exists())
    return start + 36 * 3600


def managed_processes():
    return [p for p in processes() if p['label'] in ('throughput_gate.ts', 'service_v2.py', 'legacy_infer.py')]


def child_tree(pid):
    try:
        root = psutil.Process(pid)
        return [{'pid': p.pid, 'created': p.create_time()} for p in root.children(recursive=True) + [root]]
    except psutil.NoSuchProcess:
        return []


def attached_p1():
    owned = {}
    for row in managed_processes():
        if row['label'] != 'throughput_gate.ts':
            continue
        try:
            args = psutil.Process(row['pid']).cmdline()
        except psutil.NoSuchProcess:
            continue
        if args[-1:] == ['P1']:
            for p in child_tree(row['pid']):
                owned[p['pid']] = p
    return list(owned.values())


def terminate_owned(rows):
    safe = []
    for row in rows:
        try:
            p = psutil.Process(row['pid'])
            if abs(p.create_time() - row['created']) < .01:
                safe.append(p)
        except psutil.NoSuchProcess:
            pass
    for p in safe:
        try:
            p.terminate()
        except psutil.NoSuchProcess:
            pass
    _, alive = psutil.wait_procs(safe, timeout=5)
    for p in alive:
        try:
            p.kill()
        except psutil.NoSuchProcess:
            pass
    psutil.wait_procs(alive, timeout=5)


def stop_guard(gate, owned=()):
    if STOP.exists() or time.time() >= cutoff():
        terminate_owned(owned)
        raise GateFailure(gate, '收到用户停止标志' if STOP.exists() else 'Phase B 到达 36 小时墙钟上限')


def benchmark(phase, profile=None, attach=False):
    if profile and profile.get('legacyV6'):
        raise GateFailure('B-G3' if phase == 'P1' else 'B-G4', '在线纠偏已禁止 legacyV6 全量重跑')
    label = phase + ('-' + profile['tag'] if profile and profile['tag'] else '')
    result = HERE / f'B_{label}.json'
    gate = 'B-G3' if phase == 'P1' else 'B-G4'
    if result.exists():
        return read_json(result)
    if attach:
        # 现有 P1 由另一控制会话启动。只等这棵树退出和收据落盘。
        misses = 0
        while not result.exists():
            active = attached_p1()
            # 在途P1由原会话拥有；外层等待器无权终止或重启这棵树。
            if STOP.exists():
                raise GateFailure(gate, '等待器收到停止标志；保留在途P1继续运行')
            misses = 0 if active else misses + 1
            if misses >= 3:
                save(HERE / 'PHASE_B_CONTROL_INTERRUPTION.json', {'phase': phase, 'updatedAt': now(),
                     'reason': '控制进程退出且没有门禁收据；原逐步数据库保留', 'sealedAccess': 0})
                raise GateFailure(gate, '未找到在途P1且没有结果；不自动终止或重启P1')
            time.sleep(5)
        for _ in range(10):
            if not attached_p1():
                break
            time.sleep(1)
        return read_json(result)
    if phase == 'P1':
        raise GateFailure(gate, '在线纠偏已取消所有额外P1全量运行')
    stop_guard(gate)
    if managed_processes():
        raise GateFailure(gate, '发现仍在运行的本任务推理/吞吐进程，拒绝重复启动')
    previous = (HERE / f'B_{label}_CLOCK.json').exists()
    save(HERE / 'RUN_STATUS.json', {'phase': 'B', 'status': 'running', 'benchmark': label, 'updatedAt': now(), 'sealedAccess': 0})
    command = [NODE, 'ai_training/run.mjs', 'node', '--import', 'tsx', str(HERE / 'throughput_gate.ts'), phase]
    if profile:
        command.append(json.dumps(profile, separators=(',', ':')))
    log = DATA / f'throughput-{label}-stage7.log'
    with log.open('ab') as stream:
        child = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=stream, stderr=stream,
                                 creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            while child.poll() is None:
                stop_guard(gate, child_tree(child.pid))
                time.sleep(5)
        finally:
            if child.poll() is None:
                terminate_owned(child_tree(child.pid))
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill(); child.wait()
    if not result.exists():
        raise GateFailure(gate, f'{label} 控制异常退出且无结果，退出码 {child.returncode}；保留原数据库与日志')
    row = read_json(result)
    if previous:
        row['wireCoverage'] = '控制故障恢复前的进程内物理传输计数不可恢复；本次 meanWireMs 只覆盖恢复后的请求'
        save(HERE / f'B_{label}_RECOVERED.json', {'wireCoverage': row['wireCoverage'], 'sealedAccess': 0})
    return row


def audit(result):
    profile = result['profile']
    label = result['phase'] + ('-' + profile['tag'] if profile['tag'] else '')
    file = HERE / f'B_{label}_VALID_TEACHERS.json'
    if not file.exists():
        run = subprocess.run([PYTHON, '-B', '-X', 'utf8', str(HERE / 'audit_teacher_counts.py'), label],
                             cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
        (DATA / f'throughput-{label}-teacher-audit.log').write_bytes(run.stdout)
        if run.returncode:
            raise GateFailure('B-G3' if result['phase'] == 'P1' else 'B-G4', f'{label} 的有效教师复核失败')
    return read_json(file)


def healthy(report, gate):
    expected = 12 if report['phase'] == 'P1' else 6
    if (not report['complete'] or report.get('failure') or len(report['games']) != expected
            or len({g['index'] for g in report['games']}) != expected or report['sealedAccess'] != 0):
        raise GateFailure(gate, f'{report["phase"]} 未完整执行固定的 {expected} 局：{report.get("failure")}')
    for n in (2, 3, 4):
        assert len([g for g in report['games'] if g['players'] == n]) == expected // 3
    if any(g['stop'] not in ('natural', 'round_truncation') for g in report['games']):
        raise GateFailure(gate, '对局结论不是自然终局或明确轮数截断')
    if any(s['hardTimeouts'] or s['lateResponses'] or s['failure'] or s['inFlight'] is not None
           or s['exitCode'] != 0 or s['forcedTermination'] for s in report['health']):
        raise GateFailure(gate, '推理服务健康失败：存在超时、迟到、传输错误或非自然退出')
    if report['metrics']['elapsedMs'] <= 0:
        raise GateFailure(gate, '没有有效墙钟计时')


def summarize(report, gate, reference=False):
    # 原始在途版本未输出profile；只恢复实际启动参数，不改写原始收据。
    if 'profile' not in report:
        if report['phase'] != 'P1':
            raise GateFailure(gate, 'P2缺少锁定配置收据')
        chosen = report['chosen']
        report = {**report, 'profile': {'tag': '', 'workers': 4, 'games': 2,
                  'services': chosen['services'], 'window': chosen['coalesceMs']}}
    healthy(report, gate)
    labels = audit(report)
    h, m = report['health'], report['metrics']
    samples = []
    gpu_file = DATA / f'throughput-{report["phase"]}-gpu-samples.jsonl'
    if not report['profile']['tag'] and gpu_file.exists():
        samples = [r['maxOwnedComputeEnginePct'] for line in gpu_file.read_text(encoding='utf-8').splitlines()
                   if (r := json.loads(line)).get('maxOwnedComputeEnginePct') is not None]
    gpu = {'samples': len(samples), 'meanPct': sum(samples) / len(samples), 'peakPct': max(samples),
           'basis': 'Windows GPU Engine 按本任务推理 PID 采样；不是内核占墙钟的精确比例'} if samples else None
    old_batch = {'meanIncludingWarmup': sum(s['observations'] for s in h) / max(1, sum(s['completed'] for s in h)),
                 'p95': None, 'queueMs': None, 'basis': '接手前启动版本未导出完整分布'} if 'realBatch' not in m else None
    return {'profile': report['profile'], 'fixedGames': len(report['games']), 'natural': sum(g['natural'] for g in report['games']),
            'truncations': sum(not g['natural'] for g in report['games']), 'validTeachers': labels['validTeachers'],
            'validTeachersPerHour': labels['teacherSamplesPerHour'], 'metrics': m,
            'byPlayers': [{**group, 'teacherSamplesPerHour': labels['byPlayers'][str(group['players'])]} for group in report['split']],
            'hardTimeouts': sum(s['hardTimeouts'] for s in h), 'lateResponses': sum(s['lateResponses'] for s in h), 'gpuUtilization': gpu,
            'historicalBatchTelemetry': old_batch,
            'inferenceMode': report['inferenceMode'], 'wireCoverage': report.get('wireCoverage', '完整批次，排除预热'),
            'wirePassed': not reference and 0 < m['meanWireMs'] <= 35.,
            'inheritedReferenceRatios': report['referenceRatios'],
            'legacyThroughputCutoffMet': m['fullRootsPerHour'] >= 7200 if gate == 'B-G3' else m['stepsPerSecond'] >= 10.}


def inherited_ratio(summary, phase):
    key = 'fullRootsVsInheritedS0' if phase == 'P1' else 'stepsVsInheritedP0'
    actual = summary['metrics']['fullRootsPerHour'] / 1200 if phase == 'P1' else summary['metrics']['stepsPerSecond'] / .95
    supplied = summary['inheritedReferenceRatios'][key]
    if not math.isfinite(actual) or not math.isclose(actual, supplied, rel_tol=1e-9, abs_tol=1e-12):
        raise GateFailure('B-G3' if phase == 'P1' else 'B-G4', '继承基准比值与实测指标不一致')
    return {'ratio': actual, 'metric': key, 'baseline': 1200 if phase == 'P1' else .95,
            'basis': '用户在线纠偏指定的继承基准；不运行legacyV6，不冒称同工作负载新测对照'}


def main():
    base = read_json(HERE / 'GATES.json')
    latency = read_json(HERE / 'B_G1_G5.json')
    deterministic = read_json(HERE / 'B_G2.json')
    assert base['phaseA']['passed'] and latency['passed'] and deterministic['passed'] and base['sealedAccess'] == 0
    result = {'passed': False, 'inferenceMode': latency['selected'], 'chosen': None, 'P1': None, 'P2': None,
              'workerScan': [], 'references': {}, 'thresholds': {'meanWireMs': 35., 'inheritedTargetRatio': 2.4, 'P2Games': 0},
              'policy': '复用已完成P1；继承倍率门槛2.4；用户明确豁免P2；禁止额外P1及legacyV6', 'sealedAccess': 0}
    gate = 'B-G3'
    try:
        primary = summarize(benchmark('P1', attach=True), gate)
        result['P1'] = primary
        if not primary['wirePassed']:
            raise GateFailure(gate, f'在途正式 P1 的物理 meanWireMs={primary["metrics"]["meanWireMs"]:.3f}，并发合批门槛 ≤35.0 ms；{primary["wireCoverage"]}')
        result['workerScan'].append(primary)
        chosen = primary
        result['P1'] = chosen; result['chosen'] = chosen['profile']
        result['references']['P1'] = inherited_ratio(chosen, 'P1')
        if result['references']['P1']['ratio'] < 2.4:
            raise GateFailure(gate, 'P1完整根吞吐相对继承1200根/小时基准未达到2.4倍')
        save(HERE / 'PHASE_B_CHOSEN.json', {'chosen': chosen['profile'], 'P1': primary,
             'basis': result['references']['P1'], 'sealedAccess': 0})
        # 用户明确豁免P2，不把豁免写成实测通过。
        result['P2Waiver'] = {'passed': True, 'waived': True, 'executed': False,
             'chosen': chosen['profile'], 'reason': '用户明确授权跳过P2，沿用P1锁定配置；混合联赛路径已有smoke验证'}
        result['passed'] = True
    except GateFailure as exc:
        result.update(failedGate=exc.gate, reason=str(exc))
    except Exception as exc:
        result.update(failedGate=gate, reason=f'控制或收据错误：{type(exc).__name__}: {exc}')
    finally:
        result['updatedAt'] = now()
        save(HERE / 'PHASE_B_DECISION.json', result)
        for tag, phase in (('B-G3', 'P1'), ('B-G4', 'P2')):
            if result.get(phase) or result.get('failedGate') == tag:
                failed = result.get('failedGate') == tag
                base['phaseB'][tag] = {'passed': not failed, 'result': result[phase], 'reason': result.get('reason') if failed else None}
        if result['passed']:
            base['phaseB']['B-G4'] = result['P2Waiver']
        base['stopReason'] = result.get('reason')
        save(HERE / 'GATES.json', base)
        save(HERE / 'RUN_STATUS.json', {'phase': 'B', 'status': 'passed' if result['passed'] else 'stopped',
             'failedGate': result.get('failedGate'), 'reason': result.get('reason'), 'updatedAt': now(), 'sealedAccess': 0})
    print(json.dumps({k: result.get(k) for k in ('passed', 'failedGate', 'reason')}, ensure_ascii=False), flush=True)
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    kernel = ctypes.windll.kernel32
    if not kernel.SetThreadExecutionState(0x80000001):
        raise RuntimeError('Phase B 防休眠锁获取失败')
    try:
        raise SystemExit(main())
    finally:
        kernel.SetThreadExecutionState(0x80000000)
