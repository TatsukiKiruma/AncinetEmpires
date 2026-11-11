"""正式验收完成后执行预登记的双进程GC配对诊断，不改写正式对局。"""
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import time


DIR = Path(__file__).resolve().parent
ROOT = DIR.parent.parent
AUDIT = DIR / 'phase54-audit/v5-deep-r2'
BASE = AUDIT / 'gc-threads-comparison'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def verify():
    status = read(AUDIT / 'status.json')
    assert status['stage'] in ['full_evaluation_complete', 'quality_unmet', 'promoted'], '正式对局尚未完成，禁止额外诊断负载'
    assert (AUDIT / 'gate-summary.json').exists(), '正式审计尚未完成，等待后处理收尾'
    frozen = read(AUDIT / 'runtime-freeze.json')
    for path, expected in {**frozen['runtime'], **frozen['harness']}.items():
        assert digest(ROOT / path) == expected, f'源码身份发生变化:{path}'
    assert digest(ROOT / 'src/ai_runtime/dual_v2/turn_search_ai.ts') == read(BASE / 'protocol.json')['runtimeSha256']


def wave(mode, round_index):
    processes = []
    handles = []
    try:
        for lane in range(2):
            target = BASE / mode / f'round-{round_index}' / f'lane-{lane}'
            plan = read(target / 'plan.json')
            assert len(plan['slots']) == 1
            result = target / 'games' / plan['slots'][0]['id'] / 'result.json'
            if result.exists():
                assert (target / 'profile.json').exists(), '完成对局缺少诊断收据，保留原件并停止'
                continue
            assert not (target / 'run.log').exists(), '既有未完成诊断不得覆盖或重跑'
            handle = (target / 'run.log').open('xb')
            handles.append(handle)
            args = ['node', str(ROOT / 'ai_training/run.mjs'), 'node', *plan['executionContract']['nodeArgs'], '--import', 'tsx', 'dual_stream_v2_phase5_20261020/diagnose_gc_phase54.ts', '0', '1']
            env = {**os.environ, 'LEAGUE_PHASE54': '1', 'LEAGUE_GC_TARGET': 'engineering', 'LEAGUE_ENGINEERING': target.relative_to(DIR).as_posix(), 'LEAGUE_GC_DIAGNOSTIC_OUTPUT': (target / 'profile.json').relative_to(DIR).as_posix()}
            processes.append(subprocess.Popen(args, cwd=ROOT, env=env, stdout=handle, stderr=subprocess.STDOUT))
        save(BASE / 'status.json', dict(stage='diagnosing', mode=mode, round=round_index, pids=[p.pid for p in processes], startedAt=time.time()))
        codes = [p.wait() for p in processes]
        assert all(code == 0 for code in codes), f'诊断执行失败，原始前缀已保留:{codes}'
    finally:
        for handle in handles:
            handle.close()


def quantiles(values):
    values = sorted(values)
    if not values:
        return dict(count=0, p50=None, p95=None, max=None)
    return dict(count=len(values), p50=values[math.ceil(len(values) * .5) - 1], p95=values[math.ceil(len(values) * .95) - 1], max=values[-1])


def summarize():
    summary = dict(protocolSha256=digest(BASE / 'protocol.json'), diagnosticOnly=True, modes={})
    all_sequences = []
    for mode in ['parallel', 'serial']:
        times = []
        games = []
        local_overlap = cross_overlap = slow_count = 0
        for round_index in range(3):
            profiles = [read(BASE / mode / f'round-{round_index}' / f'lane-{lane}' / 'profile.json') for lane in range(2)]
            for lane, profile in enumerate(profiles):
                target = BASE / mode / f'round-{round_index}' / f'lane-{lane}'
                plan = read(target / 'plan.json')
                folder = target / 'games' / plan['slots'][0]['id']
                result = read(folder / 'result.json')
                strict = read(folder / 'strict-replay.json')
                assert strict['passed'] and strict['actions'] == result['actions']
                assert profile['actualRuntimeSha256'] == read(BASE / 'protocol.json')['runtimeSha256']
                sequence = []
                with gzip.open(folder / 'actions.jsonl.gz', 'rt', encoding='utf-8') as stream:
                    for line in stream:
                        row = json.loads(line)
                        sequence.append([row['code'], row['beforeHash'], row.get('afterHash'), row.get('rngBefore'), row.get('rngAfter')])
                        if (row.get('telemetry') or {}).get('queued'):
                            times.append(row['ms'])
                all_sequences.append(sequence)
                other = profiles[1 - lane]
                for slow in profile['slow']:
                    slow_count += 1
                    local_overlap += bool(slow['overlaps'])
                    start = profile['timeOrigin'] + slow['start']
                    end = start + slow['ms']
                    cross_overlap += any(other['timeOrigin'] + event['start'] < end and other['timeOrigin'] + event['start'] + event['duration'] > start for event in other['events'])
                games.append(dict(round=round_index, lane=lane, classification=result['classification'], actions=result['actions'], profileSha256=digest(target / 'profile.json'), rawSha256=digest(folder / 'actions.jsonl.gz')))
        summary['modes'][mode] = dict(queueLatency=quantiles(times), games=games, sampledSlowCalls=slow_count, localGcOverlaps=local_overlap, otherLaneGcOverlaps=cross_overlap)
    summary['allActionStateSequencesEqual'] = all(sequence == all_sequences[0] for sequence in all_sequences)
    summary['interpretation'] = '只报告原始墙钟与事件重叠；GC区间重叠不能单独证明因果，无重叠也不能排除系统调度。采样含预热，正式SLA只认完整正式面板。'
    save(BASE / 'comparison.json', summary)
    save(BASE / 'status.json', dict(stage='complete', endedAt=time.time()))
    print(json.dumps({mode: details['queueLatency'] for mode, details in summary['modes'].items()}, ensure_ascii=False), flush=True)


def main():
    verify()
    protocol = read(BASE / 'protocol.json')
    for round_index, modes in enumerate(protocol['orders']):
        for mode in modes:
            verify()
            wave(mode, round_index)
    summarize()


if __name__ == '__main__':
    main()
