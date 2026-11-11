"""边生成边封存无损缓存；历史缓存只读复用，保留完整候选。"""
from pathlib import Path
import gzip, hashlib, json, pickle, sys, time, subprocess
import numpy as np
HERE=Path(__file__).resolve().parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
parents=read(HERE/'selection.json')['parents'];schema=read(HERE/'schema.json');F=len(schema['token']['keys']);C=len(schema['candidate']['keys'])
if len(sys.argv)==1:
    processes=[subprocess.Popen([sys.executable,'-X','utf8',__file__,str(i),'4'],creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)) for i in range(4)]
    codes=[p.wait() for p in processes];assert not any(codes),codes
    files=[read(HERE/f"packed/{p['parentId']}.receipt.json") for p in parents]
    contract=dict(files=files,trainParents=240,devParents=60,trainRows=sum(f['rows'] for f in files if f['split']=='train'),devRows=sum(f['rows'] for f in files if f['split']=='validation'),
        removedTrivial=sum(f['trivial'] for f in files),batch=32,seed=20261018,maxEpochs=8,optimizer='PC PyTorch AdamW',lr=.001,weightDecay=.0001,earlyStoppingPatience=2,
        selectionSha256=sha(HERE/'selection.json'),sourceBinding={f:sha(HERE/f) for f in ['tactics.ts','threat.ts','path_cache.ts','complete_tactics.ts','group_model.ts','group_train.py','../../src/game/engine.ts','../../src/game/clone_state.ts','../../src/game/rule_config.ts']})
    (HERE/'scale-contract.json').write_text(json.dumps(contract),encoding='utf-8');print(contract['trainRows'],contract['devRows']);sys.exit()
lane,lanes=map(int,sys.argv[1:3]);(HERE/'packed').mkdir(exist_ok=True)
for i,p in enumerate(parents):
    if i%lanes!=lane:continue
    ident=p['parentId'];receipt=HERE/f'data/{ident}.receipt.json';check=HERE/f'packed/{ident}.receipt.json'
    if check.exists():continue
    while not receipt.exists():time.sleep(.5)
    r=read(receipt);source=Path(r['path']);assert sha(source)==r['sha256'];target=HERE/f'packed/{ident}.pkl'
    old=HERE.parent/'tactical_conditional_20261018'/f'packed/{ident}.receipt.json'
    if r.get('reusedFrozenV3') and old.exists():
        pr=read(old);oldfile=old.parent.parent/pr['path'];assert sha(oldfile)==pr['sha256'];assert pr['sourceSha256']==r['sha256']
        item=dict(r,packedPath=str(oldfile),packedSha256=pr['sha256'],float32ConversionLossless=True)
        check.write_text(json.dumps(item),encoding='utf-8');continue
    definitions=[];lookup={};rows=[]
    def define(sparse):
        key=tuple((int(i),float(v)) for i,v in sparse)
        if key not in lookup:
            vector=np.zeros(F,dtype=np.float32)
            for i,v in key:vector[i]=v;assert float(vector[i])==v
            lookup[key]=len(definitions);definitions.append(vector)
        return lookup[key]
    with gzip.open(source,'rt',encoding='utf-8') as stream:
        for line in stream:
            row=json.loads(line);c=np.zeros((len(row['candidates']),C),dtype=np.float32)
            for j,sparse in enumerate(row['candidates']):
                assert len(set(i for i,v in sparse))==len(sparse)
                for k,v in sparse:c[j,k]=v;assert float(c[j,k])==v
            row.update(tokens=np.array([define(s) for s in row['tokens']],dtype=np.int32),candidates=c,groups=np.array(row['groups'],dtype=np.int32),refs=np.array(row['refs'],dtype=np.int32),_packed=True)
            rows.append(row)
    assert len(rows)==r['rows'];assert not target.exists()
    with target.open('xb') as stream:pickle.dump(dict(tokenTable=np.stack(definitions),rows=rows),stream,protocol=5)
    item=dict(r,packedPath=str(target),packedSha256=sha(target),float32ConversionLossless=True)
    check.write_text(json.dumps(item),encoding='utf-8');print(ident,len(rows),flush=True)
