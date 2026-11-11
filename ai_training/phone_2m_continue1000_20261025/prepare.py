"""冻结第1001—2000局、继承1000局完整状态；不做重放或电脑优化器更新。"""
from collections import Counter
import hashlib
import json
from pathlib import Path
from device import HERE, ROOT, write

OLD=HERE.parent/'phone_2m_continue900_20261024'
FIRST=HERE.parent/'phone_2m_scratch100_20261024'


def load(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))


def sha(p):
    with Path(p).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def main():
    assert not (HERE/'PLAN.json').exists(),'已有冻结计划，不能覆盖'
    sync=load(HERE/'SYNC_1000.json');assert sync['allFileHashesVerified']
    complete=sync['complete'];assert complete['cumulativeParents']==1000 and complete['globalStep']==99308
    split=load(FIRST/'SPLIT.json');order=load(FIRST/'REFERENCE_ORDER.json')['epoch1'];byid={p['parentId']:p for p in split['train']}
    previous=load(OLD/'PLAN.json');assert order[100:1000]==[p['parentId'] for p in previous['inputs']]
    chosen=[byid[pid] for pid in order[1000:2000]]
    assert len(chosen)==len({p['parentId'] for p in chosen})==1000
    assert len({byid[pid]['groupId'] for pid in order[:2000]})==2000
    assert not {p['groupId'] for p in chosen}&{p['groupId'] for p in split['dev']}
    assert not {p['parentId'] for p in chosen}&set(split['knownFailedParentIds'])
    assert sha(FIRST/'REFERENCE_ORDER.json')==previous['referenceOrderSha256']
    assert sha(FIRST/'SPLIT.json')==previous['trainDevSplitSha256']
    inputs=[]
    for ordinal,parent in enumerate(chosen,1001):
        names=['config.bin','initial.bin','final.bin','actions.jsonl.gz','states.bin.gz','result.json']
        result=load(Path(parent['directory'])/'result.json')
        assert result['parentId']==parent['parentId'] and result['naturalEnd'] and not result['truncationReason']
        count=parent['knownAtomicActions'] or parent['intendedAtomicPositions'];assert count>0
        for name in names:assert sha(Path(parent['directory'])/name)==parent['files'][name]['sha256']
        inputs.append({**parent,'trainingOrdinal':ordinal,'expectedSamples':count,'nativeDirectory':'/continue2000/inputs/'+parent['parentId'],
            'coreFiles':{name:parent['files'][name] for name in names}})
    protocol=load(OLD/'PROTOCOL.json')
    protocol.update(schema='phone-2m-continue1000-protocol-v1',authorization='用户授权同步并清理已备份缓存后，用2worker从1000局续训第1001—2000局，共1000父局，不做重放校验',
        initialization='resume_full_state_after_1000_parents',authorizedParents=1000,stopAfterCumulativeParents=2000,
        previousParents=1000,restoreBothWorkerRngFromBase=True,nodeRuntime='/continue900/node/bin/node')
    protocol['nodeRuntimeSha256']=next(line.split()[0] for line in (OLD/'UPLOAD_SHA256SUMS').read_text().splitlines() if line.endswith('/node/bin/node'))
    checkpoint=Path(sync['finalCheckpoint']);assert sha(checkpoint)==sync['finalCheckpointSha256']
    source_auth=load(OLD/'completion/job/PHONE_AUTHORIZED.json')
    plan={'schema':'phone-2m-continue1000-v1','parentRange':[1001,2000],'parents':1000,'previousParents':1000,'workers':2,
        'baseStep':complete['globalStep'],'baseSamples':complete['cumulativeSamples'],'baseSegmentSamples':complete['samples'],
        'baseCheckpoint':str(checkpoint),'baseCheckpointSha256':sync['finalCheckpointSha256'],'baseStateDigests':complete['finalCheckpoint']['stateDigests'],
        'baseCheckpointIdentity':source_auth['files'],'baseParentOrder':[p['parentId'] for p in previous['inputs']],
        'intendedSamples':sum(p['expectedSamples'] for p in inputs),'rawInputBytes':sum(f['bytes'] for p in inputs for f in p['coreFiles'].values()),
        'inputs':inputs,'trainDevSplitSha256':sha(FIRST/'SPLIT.json'),'referenceOrderSha256':sha(FIRST/'REFERENCE_ORDER.json'),
        'phoneOnlyOptimizerUpdates':True,'hostOptimizerUpdates':0,'newStrictReplayExecuted':False,'unknownStrictStatusIsNotPassed':True,
        'automaticBeyond2000':False,'apkUnitLimitUsesPopulation':True,'featuresAndCandidates':'权威编码器全部候选，无实体、候选和状态数量上限；只在宏内生成必要中间态'}
    write(HERE/'PLAN.json',plan);write(HERE/'PROTOCOL.json',protocol)
    print(json.dumps({'parents':1000,'range':[1001,2000],'samples':plan['intendedSamples'],'updates':(plan['intendedSamples']+7)//8,
        'rawInputBytes':plan['rawInputBytes'],'maps':dict(Counter(p['map'] for p in inputs))},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
