"""接续在途 P1：只读固定主键，采样 GPU 利用率并写轻量进度。"""
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import time

import psutil

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage7_20261108_v1')


def now():
    return datetime.now(timezone.utc).astimezone().isoformat()


def read_json(file):
    return file and json.loads(file.read_text(encoding='utf-8-sig'))


def save(file, value):
    import os
    tmp = file.with_suffix(f'.{os.getpid()}.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    tmp.replace(file)


def processes():
    tracked = ('throughput_gate.ts', 'service_v2.py', 'service_model.py', 'phase_b_watch.py', 'phase_b_manager.py', 'phase_c.ts', 'phase_d.ts', 'phase_e.ts',
               'train_candidate.py', 'parity_python.py', 'sealed_offline_stage7.py', 'hold_awake.py', 'legacy_infer.py')
    result = []
    for p in psutil.process_iter(['pid', 'name', 'cmdline', 'ppid', 'create_time']):
        args = [a.lower().replace('\\', '/') for a in (p.info['cmdline'] or [])]
        label = next((name for name in tracked if any(a.endswith('/stage7/' + name) for a in args)), None)
        if label:
            result.append(dict(pid=p.pid, parentPid=p.info['ppid'], name=p.info['name'], created=p.info['create_time'], label=label))
    return result


def snapshot(phase):
    rows = []
    for i in range(12 if phase == 'P1' else 6):
        file = DATA / f'throughput-{phase}' / f'game-{i}.sqlite'
        if not file.exists():
            continue
        try:
            with sqlite3.connect(file.resolve().as_uri() + '?mode=ro', uri=True, timeout=2) as db:
                row = db.execute("SELECT json_extract(value,'$.steps'),json_extract(value,'$.fullRoots'),json_extract(value,'$.state.turn'),json_extract(value,'$.complete'),json_extract(value,'$.natural') FROM progress WHERE id=1").fetchone()
            if row:
                rows.append(dict(zip(('index', 'steps', 'fullRoots', 'turn', 'complete', 'natural'), (i, *row))))
        except sqlite3.OperationalError as exc:
            rows.append({'index': i, 'readError': str(exc)})
    good = [r for r in rows if 'readError' not in r]
    return {'started': len(rows), 'finished': sum(bool(r['complete']) for r in good), 'natural': sum(bool(r['natural']) for r in good),
            'steps': sum(r['steps'] for r in good), 'fullRoots': sum(r['fullRoots'] for r in good), 'rows': rows}


def gpu_sample(pids):
    if not pids:
        return None
    ids = '|'.join(str(pid) for pid in pids)
    command = (r"Get-Counter '\GPU Engine(*)\Utilization Percentage' -MaxSamples 1 -ErrorAction Stop | "
               r"Select-Object -ExpandProperty CounterSamples | "
               rf"Where-Object {{ $_.InstanceName -match '^pid_({ids})_.*engtype_(compute|3d)' }} | "
               r"Select-Object InstanceName,CookedValue | ConvertTo-Json -Compress -AsArray")
    run = subprocess.run(['pwsh', '-NoProfile', '-Command', command], capture_output=True, encoding='utf-8', errors='replace',
                         timeout=15, creationflags=subprocess.CREATE_NO_WINDOW)
    if run.returncode:
        return {'error': run.stderr[-450:]}
    utilization = {}
    for row in json.loads(run.stdout or '[]'):
        name = row['InstanceName'].lower().split('_', 2)[2]
        utilization[name] = utilization.get(name, 0.) + row['CookedValue']
    return {'maxOwnedComputeEnginePct': min(100., max(utilization.values(), default=0.)), 'byEngine': utilization}


def watch(phase):
    output = HERE / f'B_{phase}.json'
    clock = HERE / f'B_{phase}_CLOCK.json'
    misses = 0
    while True:
        active = processes()
        pending = [p for p in active if p['label'] == 'throughput_gate.ts']
        decision = HERE / 'PHASE_B_DECISION.json'
        if decision.exists() and not output.exists() and not read_json(decision)['passed']:
            save(HERE / f'B_{phase}_LIVE.json', {'updatedAt': now(), 'status': 'stopped_by_controller', 'phase': phase,
                 **snapshot(phase), 'sealedAccess': 0})
            return 0
        if output.exists():
            try:
                result = read_json(output)
            except json.JSONDecodeError:
                time.sleep(2)
                continue
            save(HERE / f'B_{phase}_LIVE.json', {'updatedAt': now(), 'status': 'result_written', 'phase': phase,
                 'complete': result['complete'], 'failure': result['failure'], 'active': active, 'sealedAccess': 0})
            return 0
        if not pending:
            misses += 1
        else:
            misses = 0
        s = snapshot(phase)
        started = read_json(clock)['startedMs'] if clock.exists() else None
        elapsed = (time.time() * 1000 - started) / 1000 if started else 0.
        status = {'updatedAt': now(), 'status': 'control_interruption' if misses >= 3 else 'running', 'phase': phase,
                  **s, 'active': active, 'elapsedSeconds': elapsed, 'sealedAccess': 0}
        save(HERE / f'B_{phase}_LIVE.json', status)
        save(HERE / 'RUN_STATUS.json', {'phase': 'B', 'status': f'{phase}_{status["status"]}', 'updatedAt': status['updatedAt'],
             'started': s['started'], 'finished': s['finished'], 'natural': s['natural'], 'steps': s['steps'],
             'fullRoots': s['fullRoots'], 'elapsedSeconds': elapsed, 'sealedAccess': 0,
             'activeCount': len(active), 'liveDetail': f'B_{phase}_LIVE.json'})
        if misses >= 3:
            return 2
        try:
            selected = [p['pid'] for p in active if p['label'] == 'service_v2.py']
            gpu = gpu_sample(selected)
        except (subprocess.TimeoutExpired, ValueError) as exc:
            gpu = {'error': str(exc)}
        if gpu:
            with (DATA / f'throughput-{phase}-gpu-samples.jsonl').open('a', encoding='utf-8') as stream:
                stream.write(json.dumps({'at': now(), 'pids': selected, **gpu}, ensure_ascii=False) + '\n')
        time.sleep(55)


if __name__ == '__main__':
    assert sys.argv[1] in ('P1', 'P2')
    raise SystemExit(watch(sys.argv[1]))
