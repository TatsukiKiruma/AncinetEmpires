"""只读定位真实反扑未完成的分支，不以静态覆盖替代完成率。"""
import gzip
import json
import sys
from collections import Counter
from pathlib import Path

directory = Path(__file__).resolve().parent / (sys.argv[1] if len(sys.argv) > 1 else 'champion-search-arena/battles')
counts = Counter(); examples = []
for p in directory.glob('*/result.json'):
    for line in gzip.decompress((p.parent / 'actions.jsonl.gz').read_bytes()).splitlines():
        row = json.loads(line); t = row.get('telemetry') or {}
        if t.get('queued'): continue
        for risk in t.get('risks', []):
            if not risk['complete']:
                counts[str(risk['staticComplete'])] += 1
                if len(examples) < 20: examples.append(dict(slot=p.parent.name, step=row['i'], ms=row['ms'], risk=risk, nodes=t.get('nodes')))
print(json.dumps(dict(counts=counts, examples=examples), ensure_ascii=False, indent=2))
