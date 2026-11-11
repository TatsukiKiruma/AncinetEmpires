"""从TS权威流读取变长PyTorch批次；有背压、不写磁盘特征缓存。"""
from pathlib import Path
import hashlib
import json
import struct
import subprocess
import threading
import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[2]


def _exact(stream, count):
    chunks = bytearray()
    while len(chunks) < count:
        part = stream.read(count - len(chunks))
        if not part:
            raise EOFError('TS桥接帧截断')
        chunks.extend(part)
    return bytes(chunks)


def stream_batches(split='train', limit=None, batch_size=4, augment=False, node='node'):
    command = [node, str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx',
               'dual_stream_v2_phase1_20261020/stream_encoded.ts', '--split', split,
               '--batch-size', str(batch_size)]
    if limit is not None:
        command += ['--limit', str(limit)]
    if augment:
        command += ['--augment']
    process = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    errors = bytearray()

    def drain_errors():
        while True:
            part = process.stderr.read(4096)
            if not part:
                return
            errors.extend(part)
            if len(errors) > 65536:
                del errors[:-65536]

    error_thread = threading.Thread(target=drain_errors, daemon=True)
    error_thread.start()
    try:
        while True:
            first = process.stdout.read(1)
            if not first:
                break
            metadata_size, payload_size = struct.unpack('<II', first + _exact(process.stdout, 7))
            if metadata_size > 1_048_576 or payload_size > 67_108_864:
                raise ValueError('TS桥接帧超出批次内存预算')
            metadata = json.loads(_exact(process.stdout, metadata_size))
            payload = _exact(process.stdout, payload_size)
            assert hashlib.sha256(payload).hexdigest() == metadata['sha256']
            batch = [dict(source=s) for s in metadata['sources']]
            for entry in metadata['arrays']:
                raw = payload[entry['offset']:entry['offset'] + entry['bytes']]
                assert hashlib.sha256(raw).hexdigest() == entry['sha256']
                array = np.frombuffer(raw, dtype=entry['dtype']).reshape(entry['shape']).copy()
                batch[entry['batch']][entry['name']] = torch.from_numpy(array)
            yield batch
        code = process.wait()
        error_thread.join()
        if code != 0:
            raise RuntimeError('TS权威数据流失败：' + errors.decode('utf-8', errors='replace'))
    finally:
        if process.poll() is None:
            process.terminate()
        process.stdout.close()
        process.wait()
        error_thread.join(timeout=5)
        process.stderr.close()
