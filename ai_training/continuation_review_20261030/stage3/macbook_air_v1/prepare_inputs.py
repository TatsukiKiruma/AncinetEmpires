"""Mac独立分支只复制准入训练输入和固定开发张量，封存测试不打包。"""
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tarfile
from device import HERE,STAGE3,ROOT,DATA,REMOTE,save,ssh,scp

PHONE=STAGE3/'phone_samsung_v1'
BASE=Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1')
SOURCE=BASE/'phone_samsung_v1/payload'
PAYLOAD=DATA/'payload'
CHECKPOINT=BASE/'phone_samsung_v1/returns/20261030T204810-71377923/phone-snapshot/checkpoint-004500.pt'

def read(path):return json.loads(Path(path).read_text('utf-8-sig'))
def sha(path):
    import hashlib
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def prepare():
    PAYLOAD.mkdir(parents=True,exist_ok=False)
    for name in ['model.py','accurate_ops.py','batch_model.py','data.py','common.py','ragged_batch.py','ragged_map.py','math_core.py',
        'sampler_mobile.py','encoder.bundle.mjs','POSITIONS.npy','SAMPLER_PARENTS.json','SCIENCE_CONFIG.json','BASELINE_OFFLINE.json']:
        shutil.copy2(SOURCE/name,PAYLOAD/name)
    assert sha(CHECKPOINT)=='93db8a6361ee127f44142e54f6d1987677c011b25eb5691dc5030218aa3d50b5'
    shutil.copy2(CHECKPOINT,PAYLOAD/'initial-checkpoint.pt')
    (PAYLOAD/'raw-store').mkdir()
    for file in (SOURCE/'raw-store').glob('*.json'):
        value=read(file);value['path']=REMOTE+'/work/raw-store/'+Path(value['path']).name;save(PAYLOAD/'raw-store'/file.name,value)
    parents=read(SOURCE/'ENCODER_PARENTS.json')
    for p in parents['parents']:
        p['localDirectory']=REMOTE+'/work/inputs/'+p['parentId']
        p['storeIndexSha256']=sha(PAYLOAD/'raw-store'/(p['parentId']+'.json'))
    assert len(parents['parents'])==4604 and all(p['split']=='train' for p in parents['parents'])
    save(PAYLOAD/'ENCODER_PARENTS.json',parents)
    (PAYLOAD/'dev-cache').mkdir();cache=read(SOURCE/'dev-cache/COMPLETE.json')
    for row in cache['chunks']:row['file']=REMOTE+'/work/dev-cache/'+Path(row['file']).name
    save(PAYLOAD/'dev-cache/COMPLETE.json',cache)
    print('MAC_TRAIN_AND_DEV_INPUTS_PREPARED',flush=True)

def fixture():
    import torch
    sys.path.insert(0,str(PAYLOAD));from sampler_mobile import MobileSampler
    from model import DualStreamModel
    from data import decode,exact
    from batch_model import collate,forward_batch
    saved=torch.load(PAYLOAD/'initial-checkpoint.pt',map_location='cpu',weights_only=False)
    assert saved['updates']==4500 and saved['sampler']['cursor']==144000
    sampler=MobileSampler(PAYLOAD);sampler.load_state_dict(saved['sampler']);requests=sampler.effective_batch()
    save(PAYLOAD/'PROBE_REQUESTS.json',requests)
    frame=HERE/'host-original-4501.frames'
    with frame.open('wb') as output,(HERE/'host-original-4501.stderr.log').open('wb') as error:
        subprocess.run(['node','--import','tsx',str(STAGE3/'encode_server.ts')],input=(json.dumps(requests)+'\n').encode(),
            stdout=output,stderr=error,cwd=ROOT,check=True,timeout=180)
    model=DualStreamModel(seed=saved['config']['seed']).accurate_reductions(False);model.load_state_dict(saved['model']);model.eval()
    torch.set_num_threads(4);outputs=[]
    with frame.open('rb') as stream,torch.no_grad():
        for _ in range(4):
            ms,bs=struct.unpack('<II',exact(stream,8));rows=decode(json.loads(exact(stream,ms)),exact(stream,bs));out=forward_batch(model,collate(rows))
            outputs.append({k:out[k][0].tolist() for k in ['logits','valueLogits','valueProbs']})
    save(PAYLOAD/'PROBE_REFERENCE.json',dict(framesSha256=sha(frame),outputs=outputs,sourceCheckpointSha256=sha(CHECKPOINT),originalAuthority=True,sealedAccess=0))
    print('MAC_4501_REFERENCE_READY',flush=True)

def package():
    entries={row['target']:row for row in read(PHONE/'PAYLOAD_FILES.json')['files']}
    for file in PAYLOAD.rglob('*'):
        if file.is_file() and '__pycache__' not in file.parts:
            name=file.relative_to(PAYLOAD).as_posix();assert name not in entries
            entries[name]=dict(source=str(file),target=name,sha256=sha(file),bytes=file.stat().st_size)
    index=dict(schema='mac4500-inputs-v1',files=[{k:v for k,v in row.items() if k!='source'} for row in entries.values()],
        trainingParents=4604,newTrainParents=2190,developmentStates=1299,sealedParents=0,resumeUpdate=4500,targetUpdates=100000)
    save(PAYLOAD/'BASE_INPUTS_INDEX.json',index)
    entries['BASE_INPUTS_INDEX.json']=dict(source=str(PAYLOAD/'BASE_INPUTS_INDEX.json'),target='BASE_INPUTS_INDEX.json',sha256=sha(PAYLOAD/'BASE_INPUTS_INDEX.json'),bytes=(PAYLOAD/'BASE_INPUTS_INDEX.json').stat().st_size)
    sums=''.join(f'{row["sha256"]}  work/{name}\n' for name,row in entries.items())
    (PAYLOAD/'INPUT_SHA256SUMS').write_text(sums,'utf-8',newline='\n')
    archive=DATA/'base-inputs-v1.tar'
    if archive.exists():raise ValueError('Mac输入归档已存在，禁止覆盖')
    with tarfile.open(archive,'w',format=tarfile.GNU_FORMAT) as tar:
        for name,row in entries.items():
            path=Path(row['source']);info=tar.gettarinfo(str(path),arcname='work/'+name);info.uid=info.gid=0;info.mode=0o600
            with path.open('rb') as stream:tar.addfile(info,stream)
        tar.add(PAYLOAD/'INPUT_SHA256SUMS',arcname='INPUT_SHA256SUMS')
    save(HERE/'BASE_PACKAGE.json',dict(file=str(archive),sha256=sha(archive),bytes=archive.stat().st_size,files=len(entries),
        inputsIndexSha256=sha(PAYLOAD/'BASE_INPUTS_INDEX.json'),sealedParents=0))
    print(json.dumps(read(HERE/'BASE_PACKAGE.json')),flush=True)

def deploy():
    record=read(HERE/'BASE_PACKAGE.json');target=REMOTE+'/base-inputs-v1.tar'
    scp(record['file'],target,timeout=1800)
    assert ssh('shasum -a256 '+target,timeout=180).split()[0]==record['sha256']
    result=ssh('cd '+REMOTE+' && /usr/bin/tar --no-same-owner -xf base-inputs-v1.tar && shasum -a256 -c INPUT_SHA256SUMS > logs/INPUT_SHA256_VERIFY.log 2>&1 && echo ALL_MAC_INPUTS_PASSED',timeout=900)
    assert result=='ALL_MAC_INPUTS_PASSED'
    import shlex
    command='import json,pathlib,time; p=pathlib.Path('+repr(REMOTE+'/work/INPUTS_VERIFIED.json')+');p.write_text(json.dumps(dict(passed=True,inputsIndexSha256='+repr(record['inputsIndexSha256'])+',epoch=time.time(),sealedParents=0)));print(p.read_text())'
    output=ssh('cd '+REMOTE+' && runtime/venv/bin/python -c '+shlex.quote(command))
    save(HERE/'MAC_INPUTS_VERIFIED.json',json.loads(output));print(output,flush=True)

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','fixture','package','deploy']);args=parser.parse_args();globals()[args.action]()
