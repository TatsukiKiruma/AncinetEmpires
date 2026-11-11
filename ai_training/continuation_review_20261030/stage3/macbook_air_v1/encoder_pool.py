"""多个独立权威编码器并行读取，严格按请求原序合并，不持有采样器。"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import uuid
from mac_core import Encoder

class EncoderPool:
    def __init__(self,folder,workers):
        if workers not in [1,2,4]:raise ValueError('编码worker仅支持1、2、4')
        self.workers=workers;self.executor=ThreadPoolExecutor(max_workers=workers,thread_name_prefix='ordered-authoritative-encoder')
        root=Path(folder)/('encoders-'+uuid.uuid4().hex);root.mkdir()
        self.encoders=[]
        for index in range(workers):
            child=root/str(index);child.mkdir();self.encoders.append(Encoder(child))

    def rows(self,requests,timeout=300.):
        if len(requests)!=32:raise ValueError('编码池只接收完整32样本')
        size=32//self.workers
        futures=[self.executor.submit(encoder.rows,requests[index*size:(index+1)*size],timeout) for index,encoder in enumerate(self.encoders)]
        rows=[row for future in futures for row in future.result(timeout=timeout)]
        if len(rows)!=32:raise ValueError('并行编码结果数量不符')
        return rows

    def close(self):
        for encoder in self.encoders:encoder.close()
        self.executor.shutdown(wait=True,cancel_futures=True)
