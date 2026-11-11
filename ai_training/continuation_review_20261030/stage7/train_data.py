"""读取训练专用 SQLite 分片；按人数与来源配额抽样。"""
from collections import OrderedDict
from functools import lru_cache
import gzip
import hashlib
from itertools import accumulate
import json
from pathlib import Path
import sqlite3
import struct

from fp32_forward import torch
from data import decode


class Dataset:
    def __init__(self, file, expected):
        self.db = sqlite3.connect(Path(file).resolve().as_uri() + '?mode=ro', uri=True)
        self.cache = OrderedDict()
        if self.db.execute("SELECT value FROM metadata WHERE key='identity'").fetchone() != (expected,):
            raise ValueError('数据身份不一致')

    def rows(self, key):
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        digest, blob = self.db.execute('SELECT sha,payload FROM chunks WHERE id=?', (key,)).fetchone()
        if hashlib.sha256(blob).hexdigest() != digest:
            raise ValueError('压缩分片摘要不符')
        body = gzip.decompress(blob)
        size, = struct.unpack_from('<I', body)
        rows = decode(json.loads(body[4:4 + size]), body[4 + size:])
        self.cache[key] = rows
        if len(self.cache) > 24:
            self.cache.popitem(last=False)
        return rows

    @lru_cache(maxsize=12)
    def pool(self, kind, players, teacher):
        column = 'teachers' if teacher else 'samples'
        # 列名是本地固定枚举，来源和人数通过参数绑定。
        entries = self.db.execute(f'SELECT id,{column} FROM chunks WHERE split=? AND kind=? AND players=? AND {column}>0 ORDER BY id',
                                  ('train', kind, players)).fetchall()
        if not entries:
            raise ValueError(f'样本层为空：{kind}/{players}/{teacher}')
        return [x[0] for x in entries], list(accumulate(x[1] for x in entries))

    def take(self, rng, kind, players, n, teacher=False):
        ids, weights = self.pool(kind, players, teacher)
        results = []
        for key in rng.choices(ids, cum_weights=weights, k=n):
            rows = self.rows(key)
            if teacher:
                rows = [r for r in rows if r['source']['teacherValid']]
            result = rng.choice(rows)
            if result['source']['split'] != 'train' or result['source']['players'] != players:
                raise ValueError('数据分区或人数错配')
            results.append(result)
        return results

    def sample(self, rng):
        result = []
        for players in (2, 3, 4):
            result += self.take(rng, 'fresh', players, 4)
            result += self.take(rng, 'fresh', players, 2, teacher=True)
            result += self.take(rng, 'replay5', players, 2)
            result += self.take(rng, 'replay6', players, 2)
        return result

    def dev(self):
        keys = self.db.execute("SELECT id FROM chunks WHERE split='dev' AND kind='offline-dev' ORDER BY id").fetchall()
        return [r for (key,) in keys for r in self.rows(key)]


def tensor_target(source, device):
    return torch.as_tensor(source['teacherMask'], dtype=torch.bool, device=device), torch.as_tensor(source['teacherProb'], device=device)
