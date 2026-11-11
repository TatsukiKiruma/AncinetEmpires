"""只读汇总本轮持久化进度，不改写对局或收据。"""
import gzip
import json
from collections import Counter
from pathlib import Path

DIR = Path(__file__).resolve().parent
for folder in ['champion-search-arena/battles', 'generations/gen_03/games', 'generations/gen_03/arena/battles']:
    totals = Counter(); queue_max = 0.; rows = list((DIR / folder).glob('*/result.json'))
    for path in rows:
        result = json.loads(path.read_text('utf-8')); totals[result['classification']] += 1
        for line in gzip.decompress((path.parent / 'actions.jsonl.gz').read_bytes()).splitlines():
            row = json.loads(line); telemetry = row.get('telemetry') or {}
            if telemetry.get('queued'): queue_max = max(queue_max, row['ms'])
            else:
                totals['retaliationAttempts'] += telemetry.get('retaliationAttempts', 0)
                totals['retaliationComplete'] += telemetry.get('retaliationComplete', 0)
    print(json.dumps(dict(folder=folder, games=len(rows), totals=dict(totals), queueMaximumMs=queue_max)), flush=True)
