"""读取当前2M张量帧；不加载优化器，也不启动训练。"""
import gzip
import hashlib
import json
import struct
import numpy as np
import torch

def exact(stream, size):
    data=stream.read(size)
    if len(data)!=size: raise ValueError('张量帧截断')
    return data

def read_frames(path, purpose='train'):
    if purpose not in {'train','dev','inspect'}: raise ValueError('读取用途不支持')
    with gzip.open(path,'rb') as stream:
        while first:=stream.read(1):
            ms,bs=struct.unpack('<II',first+exact(stream,7))
            if not 0<ms<2**24 or not 0<bs<2**29: raise ValueError('帧长度越界')
            meta=json.loads(exact(stream,ms));raw=exact(stream,bs)
            if meta['protocol']!='dual-v2-le-typedarrays-v1' or meta['batches']!=1: raise ValueError('协议不匹配')
            if hashlib.sha256(raw).hexdigest()!=meta['sha256']: raise ValueError('张量摘要不匹配')
            source=meta['sources'][0]
            if purpose=='train' and (source['admission']!='train_admitted' or source['split']!='train'): raise ValueError('该样本不允许进入训练')
            if purpose=='dev' and source['admission']!='dev': raise ValueError('不是开发样本')
            row={'source':source}
            for a in meta['arrays']:
                b=raw[a['offset']:a['offset']+a['bytes']]
                if hashlib.sha256(b).hexdigest()!=a['sha256']: raise ValueError('数组摘要不匹配')
                row[a['name']]=torch.from_numpy(np.frombuffer(b,dtype=a['dtype']).copy().reshape(a['shape']))
            if row['valueMask'].item() or not np.isfinite(source['prior']).all(): raise ValueError('人类value屏蔽或prior无效')
            if purpose=='train' and not row['policyMask'].item(): raise ValueError('训练策略mask关闭')
            if not 0<=row['policyTarget'].item()<len(row['pointers']): raise ValueError('策略索引越界')
            yield row
