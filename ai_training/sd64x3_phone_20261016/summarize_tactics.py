import json, pathlib, gzip, struct, hashlib
import numpy as np

ROOT=pathlib.Path(__file__).resolve().parent
config=json.loads((ROOT/'config.json').read_text(encoding='utf-8'))
counts=np.zeros(10,dtype=np.int64);positive=counts.copy()
minimum=np.full(10,np.inf);maximum=np.full(10,-np.inf)
rows=candidates=0
for entry in config['files']:
    path=ROOT/'tactics'/pathlib.Path(entry['path']).name.replace('.dict.gz','.tac.gz')
    assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['tacticSha256']
    with gzip.open(path,'rb') as stream:
        magic,length=struct.unpack('>ii',stream.read(8))
        assert magic==0x54414333 and length==entry['rows']
        for _ in range(length):
            header=stream.read(68);assert len(header)==68
            n=struct.unpack('>i',header[:4])[0];assert 0<n<=100000
            values=np.frombuffer(stream.read(n*40),dtype='>f4').reshape(n,10)
            assert np.all(np.isfinite(values))
            assert np.all((values[:,8]==0)|(values[:,8]==1))
            assert np.all(values[:,6]>=0) and np.all((values[:,7]==0)|(values[:,7]==1))
            assert np.all(values[values[:,8]==0,6:8]==0)
            counts+=np.count_nonzero(values,axis=0);positive+=np.count_nonzero(values>0,axis=0)
            minimum=np.minimum(minimum,values.min(axis=0));maximum=np.maximum(maximum,values.max(axis=0))
            rows+=1;candidates+=n
        assert stream.read(1)==b''
audit=json.loads((ROOT/'data-audit.json').read_text(encoding='utf-8'))
assert rows==312413 and candidates==audit['candidates']
result=dict(passed=True,rows=rows,candidates=candidates,nonzero=counts.tolist(),positive=positive.tolist(),minimum=minimum.tolist(),maximum=maximum.tolist(),replyKnownFraction=int(counts[8])/candidates,configSha256=hashlib.sha256((ROOT/'config.json').read_bytes()).hexdigest(),meaning='按完整候选计数，单位数变化为净损失；立即合法攻击风险不包含移动后攻击；未知风险不补作安全')
(ROOT/'tactic-coverage.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result))
