"""全侧车完成后冻结PC合同、文件身份与实际消费分母。"""
import hashlib
import json
from pathlib import Path
from train import HERE, read, save

selection = read(HERE/'selection.json')
files = []
bindings = None
for parent in selection['parents']:
    ident = parent['parentId']
    receipt = read(HERE/f'data-v3/{ident}.receipt.json')
    packed = read(HERE/f'packed/{ident}.receipt.json')
    filename = f'data-v3/{ident}.jsonl.gz'
    assert hashlib.sha256((HERE/filename).read_bytes()).hexdigest() == receipt['sha256']
    if bindings is None: bindings = receipt['sourceBinding']
    assert receipt['sourceBinding'] == bindings
    for source,digest in bindings.items():
        assert hashlib.sha256((HERE/source).read_bytes()).hexdigest() == digest
    assert hashlib.sha256((HERE/packed['path']).read_bytes()).hexdigest()==packed['sha256'] and packed['sourceSha256']==receipt['sha256']
    files.append(dict(path=filename,parent=ident,split=parent['split'],rows=receipt['kept'],originalRows=receipt['originalRows'],trivial=receipt['trivial'],weight=receipt['weight'],sha256=receipt['sha256'],packedPath=packed['path'],packedSha256=packed['sha256']))
train = [f for f in files if f['split']=='train']
dev = [f for f in files if f['split']=='validation']
assert len(train)==64 and len(dev)==16
assert abs(sum(e['weight'] for e in train)-(11829-sum(e['trivial'] for e in train)))<1e-6
assert abs(sum(e['weight'] for e in dev)-(4353-sum(e['trivial'] for e in dev)))<1e-6
assert read(HERE/'numeric-gate-initial.json')['passed']
assert read(HERE/'numeric-gate-initial.json')['decoderParity']
assert read(HERE/'browser-parity-initial.json')['passed']
assert read(HERE/'browser-parity-initial.json')['decoderParity']
assert read(HERE/'packed-gate.json')['passed']
browser_gate=read(HERE/'browser-parity-initial.json')
assert browser_gate['modelFileSha256']==hashlib.sha256((HERE/'model-initial.json').read_bytes()).hexdigest()
assert browser_gate['inputFileSha256']==hashlib.sha256((HERE/'parity-inputs.json').read_bytes()).hexdigest()
assert read(HERE/'feature-probes.json')['passed']
assert read(HERE/'feature-probes-v3.json')['passed']
assert read(HERE/'threat-exhaustive-parity.json')['passed']
assert read(HERE/'aura-guard-probe.json')['passed']
contract = dict(files=files,trainParents=64,devParents=16,trainRows=sum(e['rows'] for e in train),devRows=sum(e['rows'] for e in dev),
    originalTrainRows=sum(e['originalRows'] for e in train),originalDevRows=sum(e['originalRows'] for e in dev),
    trivialTrainRows=sum(e['trivial'] for e in train),trivialDevRows=sum(e['trivial'] for e in dev),
    seed=20261018,batch=32,learningRate=.001,weightDecay=.0001,maxEpochs=8,earlyStoppingPatience=2,clipNorm=1.,
    scheduler='5% warmup + cosine to 5% lr',dtype='float64',optimizer='PC PyTorch AdamW',initialization='He normal; frozen baseline value head',
    arms={'legacy':'相同141输入架构，屏蔽新增22列，原64x3旧特征基底','new':'新22列与原基底，原子CE','conditional':'同new，原子CE+0.5目标组内条件CE'},
    sourceBinding=bindings,selectionSha256=hashlib.sha256((HERE/'selection.json').read_bytes()).hexdigest(),
    initialSha256=hashlib.sha256((HERE/'initial.json').read_bytes()).hexdigest(),independentEvaluation=False,phoneOperations=0,valueFrozen=True,
    candidatePolicy='过滤surrender后完整合法候选；不裁剪移动落点或招募兵种',automaticHandoff=True,
    macroWeights='保留原宏每原子1/k；仅删除独立end_turn平凡宏，batch按实际权重和归一化',
    schemaSha256=hashlib.sha256((HERE/'schema.json').read_bytes()).hexdigest())
contract['epochParentOrder']={str(epoch):[e['parent'] for e in sorted(train,key=lambda e:hashlib.sha256(f"20261018:{epoch}:{e['parent']}".encode()).hexdigest())] for epoch in range(1,9)}
contract['batching']='父局按epochParentOrder；父局内完整128行窗口按候选数稳定排序，末窗口保持原序；跨父局连续batch32、末批保留'
contract['packedCache']='逐值检查所有特征可无损存float32；训练collate提升float64；静态token字典去重，保留全部候选/标签；LRU缓存4父局'
contract['execution']='三臂独立进程并行，各4个CPU线程；优化器/输出/检查点隔离，固定初始化与排序不变'
save('contract.json',contract)
print(json.dumps({k:v for k,v in contract.items() if k not in ('files','sourceBinding')},ensure_ascii=False))
