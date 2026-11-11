"""只针对模型可见输入的跨分区指纹，不包含标签、权重、来源元数据或ID文本。"""
import hashlib
import numpy as np
def token_hashes(table):
    return np.stack([np.frombuffer(hashlib.sha256(row.astype('<f4',copy=False).tobytes()).digest(),dtype=np.uint8) for row in table])
def packet_hash(row,hashes):
    h=hashlib.sha256();h.update(np.asarray([len(row['tokens']),len(row['candidates'])],dtype='<i4').tobytes())
    h.update(hashes[row['tokens']].tobytes());h.update(np.asarray(row['groups'],dtype='<i4').tobytes());h.update(np.asarray(row['refs'],dtype='<i4').tobytes());h.update(np.asarray(row['candidates'],dtype='<f4').tobytes())
    names={};groups=[]
    for name in row['actionGroups']:
        if name not in names:names[name]=len(names)
        groups.append(names[name])
    h.update(np.asarray(groups,dtype='<i4').tobytes());return h.hexdigest()
