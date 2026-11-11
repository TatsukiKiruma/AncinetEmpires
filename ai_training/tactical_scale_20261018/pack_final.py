"""将最终v3阈值收据绑定到缓存；仅有变化的父局另存，不覆盖中间文件。"""
from pathlib import Path
import gzip,json,pickle,hashlib,time,sys,subprocess
HERE=Path(__file__).resolve().parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
parents=read(HERE/'selection.json')['parents'];oldCount=read(HERE/'old-schema.json')['candidate']['keys'].__len__()
if len(sys.argv)==1:
    procs=[subprocess.Popen([sys.executable,'-X','utf8',__file__,str(i),'4'],creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)) for i in range(4)]
    codes=[p.wait() for p in procs];assert not any(codes),codes
    # 原打包器先结束，避免其中间合同覆盖最终合同。
    while not (HERE/'scale-contract.json').exists():time.sleep(.5)
    prior=read(HERE/'scale-contract.json');(HERE/'scale-contract.interim.json').write_text(json.dumps(prior),encoding='utf-8')
    files=[read(HERE/f"packed-final/{p['parentId']}.receipt.json") for p in parents]
    contract=dict(prior,files=files,canonicalV3Threshold=True,thresholdChanges=sum(f.get('thresholdChanges',0) for f in files),
        sampleParityCandidates=sum(f.get('sampleParity',{}).get('candidates',0) for f in files),
        sourceBinding={f:sha(HERE/f) for f in ['tactics.ts','threat.ts','path_cache.ts','complete_tactics.ts','canonicalize_data.ts','pack_final.py','group_model.ts','group_train.py','../../src/game/engine.ts','../../src/game/clone_state.ts','../../src/game/rule_config.ts']})
    (HERE/'scale-contract.json').write_text(json.dumps(contract),encoding='utf-8');print('最终合同',contract['trainRows'],contract['devRows'],contract['thresholdChanges'],flush=True);sys.exit()
lane,lanes=map(int,sys.argv[1:3]);(HERE/'packed-final').mkdir(exist_ok=True)
for i,p in enumerate(parents):
    if i%lanes!=lane:continue
    ident=p['parentId'];targetReceipt=HERE/f'packed-final/{ident}.receipt.json'
    if targetReceipt.exists():continue
    receipt=HERE/f'data-final/{ident}.receipt.json';packed=HERE/f'packed/{ident}.receipt.json'
    while not receipt.exists() or not packed.exists():time.sleep(.5)
    r=read(receipt);prior=read(packed);assert sha(r['path'])==r['sha256'];assert sha(prior['packedPath'])==prior['packedSha256']
    item=dict(r,packedPath=prior['packedPath'],packedSha256=prior['packedSha256'],float32ConversionLossless=True)
    if r.get('thresholdChanges'):
        assert r['priorDataSha256']==prior['sha256']
        with Path(prior['packedPath']).open('rb') as stream:data=pickle.load(stream)
        changes=0
        with gzip.open(r['path'],'rt',encoding='utf-8') as stream:
            for row,raw in zip(data['rows'],stream):
                current=json.loads(raw);assert row['codes']==current['codes'];assert row['target']==current['target']
                for j,sparse in enumerate(current['candidates']):
                    value=dict(sparse).get(oldCount-3,0)
                    changes+=float(row['candidates'][j,oldCount-3])!=value;row['candidates'][j,oldCount-3]=value
        assert changes==r['thresholdChanges']
        target=HERE/f'packed-final/{ident}.pkl';assert not target.exists()
        with target.open('xb') as stream:pickle.dump(data,stream,protocol=5)
        item.update(packedPath=str(target),packedSha256=sha(target))
    targetReceipt.write_text(json.dumps(item),encoding='utf-8')
