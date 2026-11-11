"""只按自然终局计胜；超时、截断、错误独立保留。"""
import json
import gzip
import math
import sys
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
    retaliation_attempts = retaliation_complete = static_complete = expanded_chains = 0
    finite = True
    for slot in plan['slots']:
        prefix = arena / 'battles' / slot['id']
        if not (prefix / 'result.json').exists(): missing.append(slot['id']); continue
        r = json.loads((prefix / 'result.json').read_text('utf-8')); results.append(r)
        with gzip.open(prefix / 'actions.jsonl.gz', 'rt', encoding='utf-8') as stream:
            for line in stream:
                row = json.loads(line); t = row.get('telemetry')
                finite = finite and math.isfinite(row['ms'])
                if t and not t['queued']:
                    retaliation_attempts += t['retaliationAttempts']; retaliation_complete += t['retaliationComplete']
                    finite = finite and math.isfinite(t['rootValue'])
                    for risk in t.get('risks', []):
                        static_complete += int(risk['staticComplete']); expanded_chains += risk['expandedChains']
                        finite = finite and math.isfinite(risk['penalty'])
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
    # 超时按未提交决策的真实归属统计，错误与自然胜负分别保留。
    model_timeouts = [r['slot']['id'] for r in results if r['classification'] == 'decision_timeout' and r.get('failedDecision', {}).get('owner') == 'model']
    opponent_timeouts = [r['slot']['id'] for r in results if r['classification'] == 'decision_timeout' and r.get('failedDecision', {}).get('owner') == 'opponent']
    unknown = [r['slot']['id'] for r in results if r['classification'] == 'decision_timeout' and not r.get('failedDecision')]
    arena.update(zeroModelTimeouts=complete and not model_timeouts, zeroOpponentTimeouts=complete and not opponent_timeouts, zeroExecutionErrors=complete and all(not r.get('error') and r['classification'] != 'error' for r in results), zeroWallStops=complete and all(r['classification'] != 'wall_truncation' for r in results), zeroUnknownStops=complete and not unknown, modelTimeoutSlots=model_timeouts, opponentTimeoutSlots=opponent_timeouts, unknownStopSlots=unknown, retaliation=dict(attempts=retaliation_attempts, complete=retaliation_complete, staticComplete=static_complete, expandedChains=expanded_chains, contract='equal-two-chain-v2', fullEnemySearch=False), retaliationComplete100=not searches or retaliation_attempts > 0 and retaliation_attempts == retaliation_complete, finiteNumerics=finite, rootMaxWithin1000ms=not searches or bool(roots) and max(roots) <= 1000, identityVerified=plan.get('runContractSha256') == __import__('hashlib').sha256((DIR / 'RUN_CONTRACT.json').read_bytes()).hexdigest())
    output = DIR / arena_path if arena_path else folder
    save(output / ('arena-partial.json' if partial else 'arena-summary.json'), arena)
    print(json.dumps({k: arena[k] for k in ['generation', 'complete', 'completedSlots', 'strictAllAttempts', 'noTimeoutOrWall', 'groups']}, ensure_ascii=False), flush=True)
    if not partial: assert complete, '面板尚未跑完'
    return arena


if __name__ == '__main__': summarize(int(sys.argv[1]), '--partial' in sys.argv)
