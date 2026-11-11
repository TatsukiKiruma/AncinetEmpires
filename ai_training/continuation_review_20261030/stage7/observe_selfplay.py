"""按固定任务编号读取事务检查点；不扫描目录、不把在途样本当作完整基准。"""
import json
import sqlite3
import sys
from pathlib import Path

phase = sys.argv[1] if len(sys.argv) > 1 else 'P1'
assert phase in ('P1', 'P2')
data = Path('D:/AncientEmpiresData/continuation_stage7_20261108_v1')
rows = []
for index in range(12 if phase == 'P1' else 6):
    file = data / f'throughput-{phase}' / f'game-{index}.sqlite'
    if not file.exists():
        continue
    with sqlite3.connect(file.as_uri() + '?mode=ro', uri=True, timeout=2) as db:
        row = db.execute("SELECT json_extract(value,'$.steps'),json_extract(value,'$.fullRoots'),json_extract(value,'$.teachers'),json_extract(value,'$.state.turn'),json_extract(value,'$.complete'),json_extract(value,'$.natural') FROM progress WHERE id=1").fetchone()
        if row:
            rows.append(dict(zip(('index', 'steps', 'fullRoots', 'teachers', 'turn', 'complete', 'natural'), (index, *row))))
print(json.dumps({'phase': phase, 'started': len(rows), 'finished': sum(bool(r['complete']) for r in rows),
    'natural': sum(bool(r['natural']) for r in rows), 'steps': sum(r['steps'] for r in rows),
    'fullRoots': sum(r['fullRoots'] for r in rows), 'rows': rows}, ensure_ascii=False))
