"""手机本地编码管道，最多预取两个有效batch，不保存全量张量缓存。"""
import hashlib
import json
import os
from pathlib import Path
import queue
import struct
import subprocess
import threading
import time
import numpy as np
import torch

WORK=Path('/continue2000')


class Stream:
    def __init__(self,skip):
        self.items=queue.Queue(maxsize=16);self.closed=threading.Event();self.log=(WORK/'logs/encoder-stderr.log').open('ab')
        env=dict(os.environ,AEII_CONTINUE_WORK=str(WORK),UV_THREADPOOL_SIZE='1')
        command=['/continue900/node/bin/node',str(WORK/'start_encoder.mjs'),'--skip',str(skip)]
        self.process=subprocess.Popen(command,cwd=WORK,stdout=subprocess.PIPE,stderr=self.log,env=env)
        self.reader=threading.Thread(target=self.read,name='bounded-feature-prefetch',daemon=True);self.reader.start()

    def put(self,item):
        while not self.closed.is_set():
            try:self.items.put(item,timeout=1);return
            except queue.Full:pass

    def exact(self,n):
        chunks=[];remaining=n
        while remaining:
            b=self.process.stdout.read(remaining)
            if not b:raise EOFError('手机编码管道截断')
            chunks.append(b);remaining-=len(b)
        return b''.join(chunks)

    def read(self):
        try:
            while not self.closed.is_set():
                first=self.process.stdout.read(1)
                if not first:break
                ms,bs=struct.unpack('<II',first+self.exact(7))
                if not 0<ms<2**24 or not 0<bs<2**29:raise ValueError('编码管道帧长度无效')
                meta=json.loads(self.exact(ms));raw=self.exact(bs)
                if hashlib.sha256(raw).hexdigest()!=meta['sha256']:raise ValueError('手机编码管道样本摘要不符')
                row={'source':meta['sources'][0]}
                for a in meta['arrays']:
                    data=raw[a['offset']:a['offset']+a['bytes']]
                    row[a['name']]=torch.from_numpy(np.frombuffer(data,dtype=a['dtype']).copy().reshape(a['shape']))
                self.put(row)
            code=self.process.wait()
            if code:raise RuntimeError('手机编码器退出，代码='+str(code))
            self.put(None)
        except BaseException as error:
            self.put(error)

    def __iter__(self):return self
    def __next__(self):
        try:item=self.items.get(timeout=300)
        except queue.Empty:raise RuntimeError('手机编码管道300秒未产出样本')
        if item is None:raise StopIteration
        if isinstance(item,BaseException):raise item
        return item

    def close(self):
        self.closed.set()
        if self.process.poll() is None:
            self.process.terminate()
            try:self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:self.process.kill();self.process.wait()
        self.reader.join(10);self.log.close()
