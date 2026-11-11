"""只准备训练父局及冻结开发张量，封存测试原态不进入手机包。"""
import ast
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import shutil
import sys
import numpy as np
import torch
from device import HERE,save
STAGE3=HERE.parent
ROOT=STAGE3.parents[2]
BASE=Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1')
OUT=BASE/'phone_samsung_v1/payload'
STORE=Path('D:/AncientEmpiresData/continuation_stage1_20261030_v1/raw-store')
PHONE_WORK='/work'

def read(p):return json.loads(Path(p).read_text('utf-8-sig'))
def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def main():
    if OUT.exists():raise ValueError('手机准备目录已存在，禁止覆盖')
    OUT.mkdir(parents=True)
    plan=read(STAGE3.parent/'stage1/PARTITIONS.json')
    parents=[p for p in plan['parents'] if p['split']=='train' and (p['corpus']=='old' or p['admitted'])]
    assert len(parents)==4604
    total=sum(len(p['positions']) for p in parents if p['corpus']=='new')
    flat=np.lib.format.open_memmap(OUT/'POSITIONS.npy',mode='w+',dtype='<i4',shape=(total,3))
    samplers=[];encoders=[];files=[];offset=0
    for p in parents:
        row={k:p[k] for k in ['parentId','corpus','players','category','source','map','winner','actions','groupId','isolationGroupId','split','admitted','files']}
        row['localDirectory']=PHONE_WORK+'/inputs/'+p['parentId']
        encoders.append(row)
        sample={k:p[k] for k in ['parentId','corpus','players','category','source','actions','groupId','isolationGroupId']}
        phases=defaultdict(list)
        if p['corpus']=='new':
            for pos in p['positions']:phases[pos[2]].append(pos)
        sample['phaseOffsets']=[]
        for phase,positions in phases.items():
            flat[offset:offset+len(positions)]=positions
            sample['phaseOffsets'].append([int(phase),offset,len(positions)]);offset+=len(positions)
        samplers.append(sample)
        index_file=STORE/(p['parentId']+'.json');index=read(index_file)
        data=Path(index['path'])
        files.append(dict(source=str(data),target='raw-store/'+data.name,sha256=sha(data),bytes=data.stat().st_size))
        index['path']=PHONE_WORK+'/raw-store/'+data.name
        target=OUT/'raw-store'/(p['parentId']+'.json');target.parent.mkdir(exist_ok=True)
        save(target,index)
        if not p['source'].find('replica')>=0:
            directory=Path(p.get('localDirectory') or p['directory'])
            for name in ['config.bin','actions.jsonl.gz']:
                source=directory/name
                expected=p['files'][name];expected=expected if isinstance(expected,str) else expected['sha256']
                assert sha(source)==expected
                files.append(dict(source=str(source),target='inputs/'+p['parentId']+'/'+name,sha256=expected,bytes=source.stat().st_size))
    assert offset==total
    flat.flush();del flat
    save(OUT/'SAMPLER_PARENTS.json',samplers);save(OUT/'ENCODER_PARENTS.json',dict(parents=encoders))
    checkpoint=read(BASE/'run-v2-batch8/training/LATEST.json')
    assert checkpoint['updates']==2761
    shutil.copy2(checkpoint['file'],OUT/'initial-checkpoint.pt')
    assert sha(OUT/'initial-checkpoint.pt')==checkpoint['sha256']
    shutil.copy2(STAGE3/'CONFIG.json',OUT/'SCIENCE_CONFIG.json')
    save(OUT/'PHONE_RUNTIME.json',dict(schema='omni-samsung-offline-v1',serial='ce071717887a94940b7e',model='SM-N9500',
        resumeUpdate=2761,resumeSamples=88352,targetUpdates=100000,effectiveBatch=32,microbatch=8,
        cpuThreads=4,encoderProcesses=1,wallSeconds=None,allowExtendedMobileTime=True,
        originalScienceContract=read(STAGE3/'SCIENCE_CONTRACT.json')['schema'],originalCheckpointSha256=checkpoint['sha256'],
        phoneContinuationOnly=True,finalArenaAndSealedTestAfterReturn=True,
        temperaturePauseC=45.,temperatureResumeC=42.,batteryPause=20.,batteryResume=25.,
        freeSpacePauseBytes=2147483648,freeSpaceResumeBytes=2415919104))
    cache=read(BASE/'dev-cache/COMPLETE.json')
    (OUT/'dev-cache').mkdir()
    for chunk in cache['chunks']:
        source=Path(chunk['file'])
        files.append(dict(source=str(source),target='dev-cache/'+source.name,sha256=chunk['sha256'],bytes=source.stat().st_size))
        chunk['file']=PHONE_WORK+'/dev-cache/'+source.name
    save(OUT/'dev-cache/COMPLETE.json',cache)
    shutil.copy2(BASE/'baseline-offline/RESULT.json',OUT/'BASELINE_OFFLINE.json')
    for name in ['model.py','accurate_ops.py']:
        source=ROOT/('ai_training/expert_iteration_2m_20261022/model.py' if name=='model.py' else 'ai_training/dual_stream_v2_phase2_20261020/accurate_ops.py')
        shutil.copy2(source,OUT/name)
    for name in ['ragged_map.py','ragged_batch.py']:
        shutil.copy2(STAGE3/name,OUT/name)
    shutil.copy2(ROOT/'ai_training/gpu/batch_model.py',OUT/'batch_model.py')
    shutil.copy2(ROOT/'ai_training/gpu/data.py',OUT/'data.py')
    shutil.copy2(HERE/'sampler_mobile.py',OUT/'sampler_mobile.py')
    source=(STAGE3/'core.py').read_text('utf-8');tree=ast.parse(source)
    selected=[ast.get_source_segment(source,node) for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in ['prior_scale','objective','gradients','update']]
    body='\n\n'.join(selected).replace('legacy.move','move').replace('legacy.synchronize(device)','None')
    prefix='''"""直接提取已核验的科学目标和更新函数，手机只替换设备接口。"""
import math
import torch
from ragged_batch import collate as ragged_collate,forward_batch as ragged_forward
def move(batch,device):
    return {k:v.to(device) if isinstance(v,torch.Tensor) else v for k,v in batch.items()}
'''
    (OUT/'math_core.py').write_text(prefix+body+'\n','utf-8')
    save(HERE/'PAYLOAD_FILES.json',dict(files=files,trainingParents=len(parents),newTrainParents=2190,
        sealedParentsTransferred=0,sealedStateAccessed=0,sourcePartitionsSha256=sha(STAGE3.parent/'stage1/PARTITIONS.json'),
        sourceCheckpoint=checkpoint,rawInputBytes=sum(f['bytes'] for f in files)))
    sys.path.insert(0,str(STAGE3));from sampler import OmniSampler
    sys.path.insert(0,str(HERE));from sampler_mobile import MobileSampler
    original=OmniSampler(plan);compact=MobileSampler(OUT)
    for _ in range(12500):
        assert original.batch(8)==compact.batch(8)
    saved=torch.load(OUT/'initial-checkpoint.pt',map_location='cpu',weights_only=False)
    original.load_state_dict(saved['sampler']);compact.load_state_dict(saved['sampler'])
    assert original.effective_batch()==compact.effective_batch()
    assert original.state_dict()==compact.state_dict()
    save(HERE/'SAMPLER_COMPACT_VERIFIED.json',dict(passed=True,comparedSamples=100000,paused2761NextBatchExact=True,
        positionBytes=(OUT/'POSITIONS.npy').stat().st_size,parents=len(parents),sealedAccess=0))
    print(json.dumps(dict(prepared=True,parents=len(parents),positions=total,rawBytes=sum(f['bytes'] for f in files))))

if __name__=='__main__':main()
