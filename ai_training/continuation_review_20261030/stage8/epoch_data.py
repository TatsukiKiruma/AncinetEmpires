"""按父局留出并无放回遍历；不改写原SQLite分区或旧模型。"""
import hashlib
import math
import random

class EpochData:
    def __init__(self, dataset, jobs, seed=20261111):
        self.dataset = dataset
        self.jobs = {j['gameId']: j for j in jobs}
        held = set()
        for n in (2,3,4,5,6):
            candidates = [j for j in jobs if j['players'] == n and not j.get('cut')]
            candidates.sort(key=lambda j: hashlib.sha256((str(seed)+j['gameId']).encode()).hexdigest())
            if len(candidates) < 4:
                raise ValueError('独立父局留出数量不足')
            held.update(j['gameId'] for j in candidates[:4])
        chunks = iter(dataset.db.execute('SELECT id,players,samples,teachers FROM chunks ORDER BY id').fetchall())
        self.train, self.validation = [], []
        for parent, samples in dataset.db.execute('SELECT id,samples FROM jobs ORDER BY rowid').fetchall():
            if parent not in self.jobs:
                raise ValueError('未知训练父局')
            used = 0
            for _ in range(math.ceil(samples/12)):
                key, players, count, teachers = next(chunks)
                if players != self.jobs[parent]['players'] or count != min(12, samples-used):
                    raise ValueError('分片与父局映射不一致')
                entry = (key, parent, players, count, teachers)
                (self.validation if parent in held else self.train).append(entry)
                used += count
            assert used == samples
        if next(chunks, None) is not None:
            raise ValueError('存在未归属的分片')
        self.seed = seed
        self.count = sum(r[3] for r in self.train)
        self.by_players = {n: sum(r[3] for r in self.train if r[2] == n) for n in (2,3,4,5,6)}
        self.teacher_counts = {n: sum(r[4] for r in self.train if r[2] == n) for n in (2,3,4,5,6)}
        self.holdout_parents = sorted(held)

    def rows(self, entry):
        rows = self.dataset.rows(entry[0])
        assert len(rows) == entry[3]
        assert all(r['source']['parentId'] == entry[1] and r['source']['split'] == 'train' for r in rows)
        return rows

    def epoch(self, epoch, skip=0):
        rng = random.Random(self.seed+epoch)
        chunks = self.train[:]
        rng.shuffle(chunks)
        for entry in chunks:
            indices = list(range(entry[3])); rng.shuffle(indices)
            if skip >= len(indices):
                skip -= len(indices); continue
            rows = self.rows(entry)
            for i in indices[skip:]:
                yield rows[i]
            skip = 0

    def validation_panel(self):
        result = []
        for parent in self.holdout_parents:
            chunks = [r for r in self.validation if r[1] == parent]
            selected = sorted({min(len(chunks)-1, int((i+.5)*len(chunks)/4)) for i in range(min(4,len(chunks)))})
            for i in selected:
                result += self.rows(chunks[i])
        return result
