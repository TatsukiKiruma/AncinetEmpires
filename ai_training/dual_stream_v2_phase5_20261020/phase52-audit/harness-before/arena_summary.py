"""只按自然终局计胜；超时、截断、错误独立保留。"""
import json
import sys
import subprocess
from collections import Counter
from pathlib import Path
import numpy as np
from calibrate import save

DIR = Path(__file__).resolve().parent


def q(values):
    a = sorted(values)
    return dict(count=len(a), p50=float(np.quantile(a, .5, method='higher')) if a else None, p95=float(np.quantile(a, .95, method='higher')) if a else None, max=max(a) if a else None)


def summarize(gen, partial=False, arena_path=None):
    folder = DIR / f'generations/gen_{gen:02d}'; arena = DIR / arena_path if arena_path else folder / 'arena'
    plan = json.loads((arena / 'plan.json').read_text('utf-8'))
    groups = {}; results = []; missing = []; strict = True; action_total = witness_total = 0
    for slot in plan['slots']:
        prefix = arena / 'battles' / slot['id']
        if not (prefix / 'result.json').exists(): missing.append(slot['id']); continue
        r = json.loads((prefix / 'result.json').read_text('utf-8')); results.append(r)
        receipt = json.loads((prefix / 'strict-replay.json').read_text('utf-8')) if (prefix / 'strict-replay.json').exists() else dict(passed=False)
        strict = strict and receipt['passed'] and receipt.get('actions') == r['actions']; action_total += receipt.get('actions', 0); witness_total += receipt.get('witnessActions', 0)
        key = slot['mode'] + '/' + slot['panel']
        if key not in groups: groups[key] = dict(slots=0, outcomes=Counter(), times=[], roots=[], queues=[], round10=[], endWithRecruit=0, unmovedWaits=0, focusDeaths=0)
        g = groups[key]; g['slots'] += 1; g['outcomes'][r['classification']] += 1
        g['times'].extend(r['latencySamples']['model']); g['roots'].extend(r.get('rootTimes', [])); g['queues'].extend(r.get('queueTimes', []))
        if r['round10'].get('reached'): g['round10'].append(r['round10']['recurringIncomeDifference'])
        for key2 in ['endWithRecruit', 'unmovedWaits', 'focusDeaths']: g[key2] += r['metrics']['model'][key2]
    for g in groups.values():
        for old, new in [('times', 'latency'), ('roots', 'rootLatency'), ('queues', 'queueLatency')]: g[new] = q(g.pop(old))
        vals = g.pop('round10'); g['meanRound10IncomeDiff'] = sum(vals) / len(vals) if vals else None
    complete = not missing
    no_timeouts = complete and all(r['classification'] not in ['error', 'decision_timeout', 'wall_truncation'] and not r.get('error') for r in results)
    searches = [r for r in results if r['slot']['mode'] == 'turn_search']
    roots = [x for r in searches for x in r.get('rootTimes', [])]; queues = [x for r in searches for x in r.get('queueTimes', [])]; times = [x for r in searches for x in r['latencySamples']['model']]
    arena = dict(generation=gen, complete=complete, expectedSlots=len(plan['slots']), completedSlots=len(results), missing=missing, groups=groups, strictAllAttempts=complete and strict, actualActions=action_total, witnessActions=witness_total, noTimeoutOrWall=no_timeouts, searchLatency=q(times), rootLatency=q(roots), queueLatency=q(queues), p95=bool(roots) and q(roots)['p95'] <= 1000 and q(times)['p95'] <= 1000, queueBelow1ms=bool(queues) and max(queues) < 1)
    output = DIR / arena_path if arena_path else folder
    save(output / ('arena-partial.json' if partial else 'arena-summary.json'), arena)
    print(json.dumps({k: arena[k] for k in ['generation', 'complete', 'completedSlots', 'strictAllAttempts', 'noTimeoutOrWall', 'groups']}, ensure_ascii=False), flush=True)
    if not partial: assert complete, '面板尚未跑完'
    return arena


if __name__ == '__main__':
    generation = int(sys.argv[1]); partial = '--partial' in sys.argv
    summarize(generation, partial)
    if generation == 2 and not partial:
        # 晋升前先核对本代实际训练输入与新评测完整/等价态，失败即保留证据并停止晋升。
        command = ['node', str(DIR.parent / 'run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_phase5_20261020/isolation_phase51.ts']
        subprocess.run(command, cwd=DIR.parents[1], check=True)
