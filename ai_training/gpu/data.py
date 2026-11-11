"""读取已准入父局分片，验证字节身份；不重新实现编码或游戏规则。"""
import gzip
import hashlib
import json
import struct
import numpy as np
import torch
from common import sha


def exact(stream, count):
    value = stream.read(count)
    if len(value) != count:
        raise EOFError('训练分片截断')
    return value


def decode(meta, raw):
    if hashlib.sha256(raw).hexdigest() != meta['sha256']:
        raise ValueError('样本摘要不匹配')
    rows = [dict(source=source) for source in meta['sources']]
    for entry in meta['arrays']:
        data = raw[entry['offset']:entry['offset'] + entry['bytes']]
        if hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError('张量摘要不匹配')
        rows[entry.get('batch', 0)][entry['name']] = torch.from_numpy(np.frombuffer(data, dtype=entry['dtype']).copy().reshape(entry['shape']))
    return rows


def samples(dataset, directory, parents):
    reports = dataset['reports'][:parents]
    if len(reports) != parents or len({r['parentId'] for r in reports}) != parents:
        raise ValueError('唯一父局数量不足')
    for report in reports:
        path = directory / (report['parentId'] + '.frames.gz')
        if sha(path) != report['sha256']:
            raise ValueError('父局分片摘要不匹配：' + str(path))
        count = 0
        with gzip.open(path, 'rb') as stream:
            while first := stream.read(1):
                ms, bs = struct.unpack('<II', first + exact(stream, 7))
                if not 0 < ms < 2**24 or not 0 < bs < 2**29:
                    raise ValueError('样本长度无效')
                for row in decode(json.loads(exact(stream, ms)), exact(stream, bs)):
                    count += 1
                    yield row
        if count != report['samples']:
            raise ValueError('父局样本数不匹配')


def groups(rows, size):
    batch = []
    for row in rows:
        if batch and (len(batch) == size or batch[0]['spatial'].shape != row['spatial'].shape):
            yield batch
            batch = []
        batch.append(row)
    if batch:
        yield batch
