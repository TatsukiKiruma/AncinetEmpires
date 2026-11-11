"""跨进程持久化预留写入预算；失败写入也不退款，账本保存在C盘。"""
import json
from contextlib import closing
from pathlib import Path
import shutil
import sqlite3
import sys

ROOT = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')
DATABASE = Path(__file__).resolve().parent / 'WRITE_BUDGET.sqlite3'


def reserve(size):
    if not isinstance(size, int) or size < 0:
        raise ValueError('写入预留必须是非负整数')
    with closing(sqlite3.connect(DATABASE, timeout=30)) as db:
        db.execute('CREATE TABLE IF NOT EXISTS reservations (id INTEGER PRIMARY KEY, bytes INTEGER NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL)')
        db.execute('BEGIN IMMEDIATE')
        baseline = db.execute("SELECT value FROM metadata WHERE key='baseline_bytes'").fetchone()
        if baseline is None:
            present = sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file())
            used = db.execute('SELECT COALESCE(SUM(bytes),0) FROM reservations').fetchone()[0]
            db.execute("INSERT INTO metadata VALUES ('baseline_bytes', ?)", (present,))
            db.execute("INSERT INTO metadata VALUES ('reserved_bytes', ?)", (used,))
        else:
            present = baseline[0]
            used = db.execute("SELECT value FROM metadata WHERE key='reserved_bytes'").fetchone()[0]
        # 原有不可覆盖收据按实际体积纳入；新文件同时计入预留及体积，保守重复计费。
        if shutil.disk_usage(ROOT).free < 15_000_000_000 or present + used + size > 3_000_000_000:
            raise RuntimeError('全阶段写入预算或剩余空间护栏触发')
        db.execute('INSERT INTO reservations(bytes) VALUES (?)', (size,))
        db.execute("UPDATE metadata SET value=? WHERE key='reserved_bytes'", (used + size,))
        db.commit()
        return {'reservedBytes': used + size, 'presentBytes': present, 'limitBytes': 3_000_000_000}


if __name__ == '__main__':
    print(json.dumps(reserve(int(sys.argv[1]))))
