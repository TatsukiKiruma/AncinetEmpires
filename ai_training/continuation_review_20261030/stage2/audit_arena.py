"""只读核查新40局原子摘要链、自然结果和延迟，不重放游戏。"""
import argparse
import json
from collections import Counter
from pathlib import Path


def read(path):
    return json.loads(path.read_text('utf-8-sig'))


def statistics(values):
    values = sorted(values)
    return dict(count=len(values), meanMs=sum(values) / max(1, len(values)),
                p50Ms=values[len(values) // 2] if values else None,
                p95Ms=values[min(len(values) - 1, int(len(values) * .95))] if values else None,
                maxMs=max(values, default=None), over1000ms=sum(v > 1000 for v in values))


def audit(folder):
    summary = read(folder / 'SUMMARY.json')
    games = summary['games']
    assert summary['attempted'] == len(games) == len({g['id'] for g in games}) == 40
    assert Counter(g['opponent'] for g in games) == {'hard': 20, 'simple': 20}
    assert not summary['finalTestEvaluated']
    outputs = {}
    for opponent in ['hard', 'simple']:
        selected = [g for g in games if g['opponent'] == opponent]
        latencies = {'model': [], 'opponent': []}
        rows_count = 0
        for game in selected:
            subfolder = folder / game['id']
            assert read(subfolder / 'result.json') == game
            rows = [json.loads(line) for line in (subfolder / 'steps.jsonl').read_text('utf-8').splitlines() if line]
            assert len(rows) == game['steps'] and all(r['step'] == i for i, r in enumerate(rows))
            assert all(a['after'] == b['before'] for a, b in zip(rows, rows[1:]))
            final = read(subfolder / 'final.json')
            if game['natural']:
                assert final['winner'] == game['winner'] and game['error'] is None and game['timeForfeit'] is None
            for row in rows:
                latencies[row['side']].append(row['ms'])
            rows_count += len(rows)
        outputs[opponent] = dict(outcomes=dict(Counter(g['classification'] for g in selected)),
                                 natural=sum(g['natural'] for g in selected), savedAtomicRows=rows_count,
                                 byMap={m: dict(Counter(g['classification'] for g in selected if g['map'] == m)) for m in sorted({g['map'] for g in selected})},
                                 byActualHand={h: dict(Counter(g['classification'] for g in selected if g['actualHand'] == h)) for h in ['first', 'second']},
                                 latency={key: statistics(value) for key, value in latencies.items()},
                                 telemetry={key: sum((g.get('hardTelemetry') or {}).get(key, 0) for g in selected) for key in ['runtimeDecisions', 'nativeFallbacks', 'rejectedPlans', 'runtimeErrors']},
                                 wallSeconds=sum(g['wallMs'] for g in selected) / 1000)
    return dict(passed=True, source=str(folder), attempted=40, opponents=outputs,
                gameReplays=0, newGames=0, optimizerUpdates=0, finalTestEvaluated=False,
                scope='逐局身份由批准compare_arena.py另核验；此处核对原子记录计数、静态摘要链与延迟')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.folder)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), 'utf-8')
    print(json.dumps({key: value['outcomes'] for key, value in result['opponents'].items()}))
