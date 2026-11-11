"""冻结101–1000局续训输入与100局完整检查点；不重放、不执行电脑训练。"""
from collections import Counter
import hashlib
import json
from pathlib import Path
import shutil
import sys
import urllib.request

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
BASE=HERE.parent/'phone_2m_scratch100_20261024'


def load(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):
    with Path(p).open('rb') as s:return hashlib.file_digest(s,'sha256').hexdigest()
def write(p,v):Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def main():
    assert not (HERE/'PLAN.json').exists(),'已有冻结计划，不覆盖'
    split=load(BASE/'SPLIT.json');order=load(BASE/'REFERENCE_ORDER.json')['epoch1'];byid={p['parentId']:p for p in split['train']}
    assert order[:100]==[p['parentId'] for p in split['pilot']]
    chosen=[byid[parent] for parent in order[100:1000]]
    assert len(chosen)==len({p['parentId'] for p in chosen})==900
    assert not {p['groupId'] for p in chosen}&{p['groupId'] for p in split['dev']}
    assert not {p['parentId'] for p in chosen}&set(split['knownFailedParentIds'])
    complete=load(BASE/'completion/output/COMPLETE.json');pointer=load(BASE/'completion/output/LATEST.json')
    assert complete['status']=='complete' and complete['samples']==73112 and complete['updates']==9139
    checkpoint=BASE/'completion/output'/pointer['file'];assert sha(checkpoint)==pointer['sha256']
    inputs=[]
    for i,p in enumerate(chosen,101):
        names=['config.bin','initial.bin','final.bin','actions.jsonl.gz','states.bin.gz','result.json']
        r=load(Path(p['directory'])/'result.json')
        assert r['parentId']==p['parentId'] and r['naturalEnd'] and not r['truncationReason']
        count=p['knownAtomicActions'] or p['intendedAtomicPositions']
        for n in names:assert sha(Path(p['directory'])/n)==p['files'][n]['sha256']
        inputs.append({**p,'trainingOrdinal':i,'expectedSamples':count,'nativeDirectory':'/continue900/inputs/'+p['parentId'],
                       'coreFiles':{n:p['files'][n] for n in names}})
    protocol=load(BASE/'PROTOCOL.json');protocol.update(authorization='用户明确授权2个同步训练worker继续第101–1000局，共追加900父局一遍，完成后停止',
        initialization='resume_full_state_after_first_100_parents',authorizedParents=900,authorizedEpochsOverPilot=1,workers=2,torchThreadsPerWorker=2,coordinatorThreads=1,
        encoderThreads=1,featureStorage='原始快照常驻手机，按需流式编码；不保存全量展开张量',resumeTestAfterUpdates=10,stopAfterCumulativeParents=1000)
    write(HERE/'PROTOCOL.json',protocol)
    plan={'schema':'phone-2m-continue900-v1','parentRange':[101,1000],'parents':900,'previousParents':100,'workers':2,'baseStep':9139,'baseSamples':73112,
          'baseCheckpoint':str(checkpoint),'baseCheckpointSha256':pointer['sha256'],'baseStateDigests':pointer['stateDigests'],
          'benchmark20BranchPreserved':True,'benchmark20BranchIsNotThisContinuationParent':True,'intendedSamples':sum(p['expectedSamples'] for p in inputs),
          'rawInputBytes':sum(x['bytes'] for p in inputs for x in p['coreFiles'].values()),'inputs':inputs,'trainDevSplitSha256':sha(BASE/'SPLIT.json'),
          'referenceOrderSha256':sha(BASE/'REFERENCE_ORDER.json'),'phoneOnlyOptimizerUpdates':True,'hostOptimizerUpdates':0,'newStrictReplayExecuted':False,
          'unknownStrictStatusIsNotPassed':True,'automaticBeyond1000':False,'featuresAndCandidates':'复用权威编码器全部候选，无实体/候选/每局状态数上限；仅同宏内部生成必要中间态'}
    write(HERE/'PLAN.json',plan)
    for name in ['model.py','batch_model.py','accurate_ops.py']:
        shutil.copy2(BASE/'payload'/name,HERE/name)
    shutil.copy2(BASE/'train_phone.py',HERE/'train_phone.py')
    device=(BASE/'device.py').read_text(encoding='utf-8').replace('/data/local/tmp/aeii-2m-scratch100-20261024','/data/local/tmp/aeii-2m-continue900-20261024')
    (HERE/'device.py').write_text(device,encoding='utf-8')
    print(json.dumps({'parents':900,'intendedSamples':plan['intendedSamples'],'rawInputBytes':plan['rawInputBytes'],'maps':dict(Counter(p['map'] for p in inputs))},ensure_ascii=False),flush=True)


def node():
    assets=HERE/'runtime-assets';assets.mkdir(exist_ok=True)
    version='v22.14.0';filename='node-'+version+'-linux-arm64.tar.xz';base='https://nodejs.org/dist/'+version+'/'
    sums=urllib.request.urlopen(base+'SHASUMS256.txt',timeout=45).read().decode();(assets/'NODE_SHASUMS256.txt').write_text(sums,encoding='utf-8')
    expected=next(line.split()[0] for line in sums.splitlines() if line.split()[-1]==filename)
    target=assets/filename
    if not target.exists():
        with urllib.request.urlopen(base+filename,timeout=60) as source,target.with_suffix('.pending').open('wb') as output:
            while block:=source.read(1024*1024):output.write(block)
        target.with_suffix('.pending').replace(target)
    assert sha(target)==expected
    write(assets/'NODE_SOURCE.json',{'version':version,'url':base+filename,'sha256':expected,'bytes':target.stat().st_size,'checksumUrl':base+'SHASUMS256.txt'})
    print(json.dumps({'nodeBytes':target.stat().st_size,'sha256':expected}),flush=True)


if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='node':node()
    else:main()
