"""有界预取、多模式批次训练与开发指标；所有编码来自TS权威流。"""
import os
import hashlib
import json
import math
import queue
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path
import numpy as np
import torch

DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]
sys.path.insert(0, str(DIR.parent / 'dual_stream_v2_phase2_20261020'))
from model_torch import DualStreamModel
sys.path.insert(0, str(DIR.parent / 'dual_stream_v2_phase3_20261020'))
from batch_model import collate, forward_batch, losses


def save(name, obj):
    (DIR / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def load_model(prefix):
    m = DualStreamModel()
    prefix = os.environ.get('LEAGUE_MODEL', prefix)
    meta = json.loads((DIR / (prefix + '.json')).read_text('utf-8'))
    raw = np.frombuffer((DIR / (prefix + '.bin')).read_bytes(), dtype='<f4')
    m.load_state_dict({e['name']: torch.from_numpy(raw[e['offset']:e['offset'] + e['length']].copy().reshape(e['shape'])) for e in meta['tensors']})
    return m


def exact(stream, n):
    chunks = bytearray()
    while len(chunks) < n:
        part = stream.read(n - len(chunks))
        if not part:
            raise EOFError('编码流截断')
        chunks.extend(part)
    return chunks


def decode(meta, raw):
    assert hashlib.sha256(raw).hexdigest() == meta['sha256']
    samples = [dict(source=s) for s in meta['sources']]
    for e in meta['arrays']:
        data = raw[e['offset']:e['offset'] + e['bytes']]
        assert hashlib.sha256(data).hexdigest() == e['sha256']
        samples[e['batch']][e['name']] = torch.from_numpy(np.frombuffer(data, dtype=e['dtype']).copy().reshape(e['shape']))
    return samples


def batches(split, epoch=0, limit=None, stream=None, env=None):
    q = queue.Queue(maxsize=2)
    command = ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', stream or os.environ.get('LEAGUE_STREAM', 'dual_stream_v2_phase5_20261020/stream.ts'), split, str(epoch)]
    if limit is not None:
        command += [str(limit)]
    p = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env={**os.environ, **(env or {})})
    error = bytearray()
    def drain():
        for line in iter(p.stderr.readline, b''):
            error.extend(line)
            if len(error) > 65536:
                del error[:-65536]
    threading.Thread(target=drain, daemon=True).start()
    def produce():
        try:
            while first := p.stdout.read(1):
                ms, ps = struct.unpack('<II', first + exact(p.stdout, 7))
                assert ms <= 1048576 and ps <= 67108864
                meta = json.loads(exact(p.stdout, ms)); raw = exact(p.stdout, ps)
                q.put(decode(meta, raw))
            assert p.wait() == 0, error.decode('utf-8', errors='replace')
        except BaseException as e:
            q.put(e)
        finally:
            q.put(None)
    threading.Thread(target=produce, daemon=True).start()
    try:
        while True:
            item = q.get()
            if item is None:
                break
            if isinstance(item, BaseException):
                raise item
            yield item
    finally:
        if p.poll() is None:
            p.terminate()
        p.wait()
        p.stdout.close(); p.stderr.close()


