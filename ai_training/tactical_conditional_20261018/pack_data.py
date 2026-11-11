"""有SHA约束的无损张量缓存；静态token字典去重，不裁剪任何候选或标签。"""
import gzip
import hashlib
import json
import pickle
from pathlib import Path
import time
import subprocess
import sys
import numpy as np

HERE=Path(__file__).resolve().parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
schema=read(HERE/'schema.json')
F,C=len(schema['token']['keys']),len(schema['candidate']['keys'])
parents=read(HERE/'selection.json')['parents']
if len(sys.argv)==1:
    # 每个父局独立去重，八进程只写各自固定分片，不改变训练顺序。
    processes=[]
    flags=getattr(subprocess,'BELOW_NORMAL_PRIORITY_CLASS',0)|getattr(subprocess,'CREATE_NO_WINDOW',0)
    for lane in range(8):
        processes.append(subprocess.Popen([sys.executable,'-X','utf8',str(Path(__file__).resolve()),str(lane),'8'],creationflags=flags))
    codes=[p.wait() for p in processes]
    assert not any(codes),codes
    manifest=[read(HERE/f"packed/{p['parentId']}.receipt.json") for p in parents]
    (HERE/'packed-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
    sys.exit(0)
lane,lanes=map(int,sys.argv[1:3])
manifest=[]
for index,parent in enumerate(parents):
    if index%lanes!=lane:continue
    ident=parent['parentId'];source=HERE/f'data-v3/{ident}.jsonl.gz'
    receipt=read(HERE/f'data-v3/{ident}.receipt.json')
    digest=hashlib.sha256(source.read_bytes()).hexdigest();assert digest==receipt['sha256']
    target=HERE/f'packed/{ident}.pkl';check=target.with_suffix('.receipt.json')
    if check.exists():
        item=read(check);assert item['sourceSha256']==digest and hashlib.sha256(target.read_bytes()).hexdigest()==item['sha256'];manifest.append(item);continue
    target.parent.mkdir(exist_ok=True)
    started=time.perf_counter();definitions=[];lookup={};rows=[]
    def define(sparse):
        key=tuple((int(i),float(v)) for i,v in sparse)
        if key not in lookup:
            vector=np.zeros(F,dtype=np.float32)
            indexes,values=zip(*key)
            assert len(set(indexes))==len(indexes)
            vector[list(indexes)]=values
            assert all(float(vector[i])==v for i,v in key)
            lookup[key]=len(definitions);definitions.append(vector)
        return lookup[key]
    with gzip.open(source,'rt',encoding='utf-8') as stream:
        for line in stream:
            original=json.loads(line)
            candidates=np.zeros((len(original['candidates']),C),dtype=np.float32)
            for j,sparse in enumerate(original['candidates']):
                indexes,values=zip(*sparse)
                assert len(set(indexes))==len(indexes)
                candidates[j,list(indexes)]=values
                assert all(float(candidates[j,i])==v for i,v in sparse)
            token_ids=np.array([define(sparse) for sparse in original['tokens']],dtype=np.int32)
            groups=np.array(original['groups'],dtype=np.int32)
            refs=np.array(original['refs'],dtype=np.int32)
            assert refs.min()>=-1 and refs.max()<len(token_ids)
            original.update(tokens=token_ids,candidates=candidates,groups=groups,refs=refs,_packed=True)
            rows.append(original)
    if target.exists():target.rename(target.with_name(target.name+'.interrupted-'+str(time.time_ns())))
    with target.open('xb') as stream:pickle.dump(dict(tokenTable=np.stack(definitions),rows=rows),stream,protocol=5)
    assert len(rows)==receipt['kept']
    item=dict(parent=ident,path=str(target.relative_to(HERE)).replace('\\','/'),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),sourceSha256=digest,
        rows=len(rows),uniqueTokens=len(definitions),tokenOccurrences=sum(len(r['tokens']) for r in rows),candidates=sum(len(r['candidates']) for r in rows),bytes=target.stat().st_size,
        float32ConversionLossless=True,candidateLabelsAndOrderRetained=True,seconds=time.perf_counter()-started)
    check.write_text(json.dumps(item,ensure_ascii=False),encoding='utf-8');manifest.append(item)
    print(json.dumps(item,ensure_ascii=False),flush=True)
(HERE/f'packed-manifest-{lane}.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
