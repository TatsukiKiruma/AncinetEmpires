"""完整候选无损float32缓存；由单父局收据触发打包。"""
from pathlib import Path
import json,gzip,pickle,hashlib,sys,time
import numpy as np
HERE=Path(__file__).resolve().parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def pack(p):
    ident=p['parentId'];target=HERE/f'packed/{ident}.pkl';receipt=HERE/f'packed/{ident}.receipt.json'
    if receipt.exists():return
    if target.exists():target.rename(str(target)+'.interrupted-'+str(int(time.time())))
    source=read(HERE/f'data/{ident}.receipt.json');assert sha(source['path'])==source['sha256']
    definitions=[];lookup={};rows=[]
    def define(sparse):
        key=tuple((int(i),float(v)) for i,v in sparse)
        if key not in lookup:
            vector=np.zeros(301,dtype=np.float32)
            for i,v in key:vector[i]=v;assert float(vector[i])==v
            lookup[key]=len(definitions);definitions.append(vector)
        return lookup[key]
    with gzip.open(source['path'],'rt',encoding='utf-8') as stream:
        for line in stream:
            r=json.loads(line);c=np.zeros((len(r['candidates']),151),dtype=np.float32)
            for j,sparse in enumerate(r['candidates']):
                assert len(set(i for i,v in sparse))==len(sparse)
                for k,v in sparse:c[j,k]=v;assert float(c[j,k])==v
            r.update(tokens=np.array([define(s) for s in r['tokens']],dtype=np.int32),candidates=c,groups=np.array(r['groups'],dtype=np.int32),refs=np.array(r['refs'],dtype=np.int32),_packed=True)
            rows.append(r)
    assert len(rows)==source['rows'];target.parent.mkdir(exist_ok=True)
    with target.open('xb') as f:pickle.dump(dict(tokenTable=np.stack(definitions),rows=rows),f,protocol=5)
    valueRows=sum(bool(r['valueMask']) for r in rows)
    receipt.write_text(json.dumps(dict(source,packedPath=str(target),packedSha256=sha(target),valueRows=valueRows,lossless=True)),encoding='utf-8')
if __name__=='__main__':
    for p in read(HERE/'selection.json')['parents']:
        while not (HERE/f"data/{p['parentId']}.receipt.json").exists():time.sleep(1)
        pack(p)
    files=[read(HERE/f"packed/{p['parentId']}.receipt.json") for p in read(HERE/'selection.json')['parents']]
    (HERE/'contract.json').write_text(json.dumps(dict(files=files,trainRows=sum(f['rows'] for f in files if f['split']=='train'),devRows=sum(f['rows'] for f in files if f['split']=='validation'),valueRows=sum(f['valueRows'] for f in files),sourceBinding={n:sha(HERE/n) for n in ['value_state.ts','prepare.ts','pack.py']})),encoding='utf-8')
