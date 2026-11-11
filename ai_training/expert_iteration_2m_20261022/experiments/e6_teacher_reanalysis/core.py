"""复用原模型及只读张量解码；不运行旧实验入口。"""
import hashlib
import json
import os
import struct
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = HERE.parents[1]
ROOT = R.parents[1]
sys.path.insert(0, str(R))
from train import load_initial, decode, exact
from batch_model import collate, forward_batch
import torch

SEED = 221966910


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(2**20), b''):
            h.update(b)
    return h.hexdigest()


def write_new(path, value):
    path = Path(path)
    assert path.is_relative_to(HERE)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2, allow_nan=False)
        f.flush()
        os.fsync(f.fileno())


def check_budget():
    assert os.environ.get('E6_BUDGET'), '实验计算必须由E6预算入口启动'
    b = read(os.environ['E6_BUDGET'])
    if time.time() * 1000 >= min(b['totalDeadline'], b['stageDeadline']):
        raise TimeoutError('阶段或24小时预算到期')
    import shutil
    if shutil.disk_usage(HERE).free < 12 * 1024**3:
        raise OSError('可用空间低于12GiB，保留现场')


def frames(path):
    with Path(path).open('rb') as f:
        while header := f.read(8):
            assert len(header) == 8
            ms, ps = struct.unpack('<II', header)
            assert ms < 2**24 and ps < 2**28
            yield from decode(json.loads(exact(f, ms)), exact(f, ps))


def teacher_labels(rows, split):
    by_id = {}
    for path in (HERE / 'teacher' / split).glob('*/result.json'):
        r = read(path)
        assert r['id'] not in by_id
        by_id[r['id']] = r
    for s in rows:
        if s['source']['source'] != 'search-expert':
            continue
        r = by_id[s['source']['id']]
        assert r['canonical'] == s['source']['canonical']
        codes = s['source']['codes']
        s['source']['preferences'] = [[codes.index(p['better']), codes.index(p['worse'])] for p in r['preferences']]
    return rows


def tensor_hashes(model):
    return {n: hashlib.sha256(p.detach().numpy().tobytes()).hexdigest() for n, p in model.named_parameters()}
