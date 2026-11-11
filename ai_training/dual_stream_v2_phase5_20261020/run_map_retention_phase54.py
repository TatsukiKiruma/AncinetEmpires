"""预登记的对象布局保留参数对照，复用原双进程诊断器，不修改正式收据。"""
import gzip
import json
from pathlib import Path
import time
import run_gc_threads_phase54 as runner


BASE = runner.AUDIT / 'map-retention-comparison'


def prepare():
    assert not BASE.exists(), '既有布局保留诊断不得覆盖'
    BASE.mkdir()
    protocol = dict(rounds=3, lanes=2, gamesPerMode=6, orders=[['baseline', 'retained'], ['retained', 'baseline'], ['baseline', 'retained']], runtimeSha256=runner.read(runner.AUDIT / 'gc-threads-comparison/protocol.json')['runtimeSha256'], diagnosticOnly=True, argument='--retain-maps-for-n-gc=100000', hypothesis='显式老生代GC可能回收对象布局并使gameStateEquals优化代码因weak objects失效；保留布局是否降低真实队列尖峰须对照验证，禁止预先宣称有效。', timing='不启用trace日志，原始逐动作performance.now，不扣GC或调度')
    runner.save(BASE / 'protocol.json', protocol)
    source = runner.read(runner.AUDIT / 'gc-threads-comparison/parallel/round-0/lane-0/plan.json')
    for mode in ['baseline', 'retained']:
        for repetition in range(3):
            for lane in range(2):
                target = BASE / mode / f'round-{repetition}' / f'lane-{lane}'
                target.mkdir(parents=True)
                plan = json.loads(json.dumps(source))
                plan['slots'][0]['id'] = f'league-4-000-map-{mode}-r{repetition}-l{lane}'
                if mode == 'retained':
                    plan['executionContract']['nodeArgs'].append(protocol['argument'])
                runner.save(target / 'plan.json', plan)


def summarize():
    result = dict(diagnosticOnly=True, protocolSha256=runner.digest(BASE / 'protocol.json'), modes={})
    sequences = []
    for mode in ['baseline', 'retained']:
        queues = []
        games = []
        for repetition in range(3):
            for lane in range(2):
                target = BASE / mode / f'round-{repetition}' / f'lane-{lane}'
                plan = runner.read(target / 'plan.json')
                folder = target / 'games' / plan['slots'][0]['id']
                terminal = runner.read(folder / 'result.json')
                strict = runner.read(folder / 'strict-replay.json')
                assert strict['passed'] and strict['actions'] == terminal['actions']
                sequence = []
                with gzip.open(folder / 'actions.jsonl.gz', 'rt', encoding='utf-8') as stream:
                    for line in stream:
                        row = json.loads(line)
                        sequence.append([row['code'], row['beforeHash'], row['afterHash'], row['rngAfter']])
                        if (row.get('telemetry') or {}).get('queued'):
                            queues.append(row['ms'])
                sequences.append(sequence)
                games.append(dict(round=repetition, lane=lane, classification=terminal['classification'], actions=terminal['actions'], rawSha256=runner.digest(folder / 'actions.jsonl.gz')))
        result['modes'][mode] = dict(queueLatency=runner.quantiles(queues), games=games)
    result['allActionStateRngSequencesEqual'] = all(sequence == sequences[0] for sequence in sequences)
    result['scope'] = '仅预登记工程初态的配对诊断；参数即使有效也必须重新冻结并完整60+112验收。'
    runner.save(BASE / 'comparison.json', result)
    runner.save(BASE / 'status.json', dict(stage='complete', endedAt=time.time()))
    print(json.dumps({mode: rows['queueLatency'] for mode, rows in result['modes'].items()}, ensure_ascii=False), flush=True)


def main():
    if not BASE.exists():
        prepare()
    runner.BASE = BASE
    for repetition, modes in enumerate(runner.read(BASE / 'protocol.json')['orders']):
        for mode in modes:
            runner.verify()
            runner.wave(mode, repetition)
    summarize()


if __name__ == '__main__':
    main()
