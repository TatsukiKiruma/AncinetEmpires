"""冻结手机独立包；源数据只引用准入训练父局和固定开发张量。"""
import ast
import io
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tarfile
import torch
from device import HERE,save
from prepare_data import OUT,ROOT,STAGE3,BASE,read,sha

def sources():
    for name in ['phone_core.py','phone_offline.py','probe_mobile.py','train_mobile.py','sampler_mobile.py']:
        shutil.copy2(HERE/name,OUT/name)
    (OUT/'common.py').write_text('"""只提供数据模块需要的流式摘要。"""\nimport hashlib\nfrom pathlib import Path\ndef sha(path):\n    with Path(path).open("rb") as stream:return hashlib.file_digest(stream,"sha256").hexdigest()\n','utf-8')
    source=(STAGE3/'core.py').read_text('utf-8');tree=ast.parse(source)
    body='\n\n'.join(ast.get_source_segment(source,n) for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['prior_scale','objective','reference_gradients','gradients','update'])
    body=body.replace('legacy.move','move').replace('legacy.collate','native_collate').replace('legacy.forward_batch','native_forward').replace('legacy.synchronize(device)','None')
    header='''"""直接提取冻结科学目标；保持全32样本分母和四个真实8样本微批。"""
import math
import torch
from ragged_batch import collate as ragged_collate,forward_batch as ragged_forward
from batch_model import collate as native_collate,forward_batch as native_forward
def move(batch,device):
    return {k:v.to(device) if isinstance(v,torch.Tensor) else v for k,v in batch.items()}
'''
    (OUT/'math_core.py').write_text(header+body+'\n','utf-8')
    parents=read(OUT/'ENCODER_PARENTS.json')
    for p in parents['parents']:p['storeIndexSha256']=sha(OUT/'raw-store'/(p['parentId']+'.json'))
    save(OUT/'ENCODER_PARENTS.json',parents)
    runtime=read(OUT/'PHONE_RUNTIME.json')
    runtime.update(hostScienceContractSha256=sha(STAGE3/'SCIENCE_CONTRACT.json'),hostCompletedArmSeconds=894.5950205,
        extendedTimeAuthorization='用户明确选择以完成100k为目标，允许手机延长运行',hostArmId='52eb59a8-2782-4bd8-ac9c-e1176b668020')
    save(OUT/'PHONE_RUNTIME.json',runtime)
    archive=ROOT/'ai_training/phone_2m_continue900_20261024/runtime-assets/node-v22.14.0-linux-arm64.tar.xz'
    assert sha(archive)=='08bfbf538bad0e8cbb0269f0173cca28d705874a67a22f60b57d99dc99e30050'
    with tarfile.open(archive) as tar:
        for target,member in [('node/bin/node','node-v22.14.0-linux-arm64/bin/node'),('node/LICENSE','node-v22.14.0-linux-arm64/LICENSE')]:
            path=OUT/target;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(tar.extractfile(member).read())
    assert sha(OUT/'node/bin/node')=='f15053488b3c49d16eb4b0da25593b459a79839248381f6aa61a876bcce54966'
    subprocess.run(['node',str(HERE/'prepare_encoder.mjs')],cwd=ROOT,check=True)

def fixture():
    sys.path.insert(0,str(HERE));from sampler_mobile import MobileSampler
    saved=torch.load(OUT/'initial-checkpoint.pt',map_location='cpu',weights_only=False)
    sampler=MobileSampler(OUT);sampler.load_state_dict(saved['sampler']);requests=sampler.effective_batch()
    save(OUT/'PROBE_REQUESTS.json',requests)
    encoded=(json.dumps(requests)+'\n').encode()
    original=HERE/'host-original.frames';mobile=HERE/'host-mobile-bundle.frames'
    environment=dict(os.environ,OMNI_PARENTS=str(STAGE3.parent/'stage1/PARTITIONS.json'),OMNI_RAW_STORE='D:/AncientEmpiresData/continuation_stage1_20261030_v1/raw-store')
    for file,command,env in [(original,['node','--import','tsx',str(STAGE3/'encode_server.ts')],None),(mobile,['node','--openssl-legacy-provider',str(OUT/'encoder.bundle.mjs')],environment)]:
        with file.open('wb') as stdout,(file.with_suffix('.stderr.log')).open('wb') as stderr:
            subprocess.run(command,input=encoded,stdout=stdout,stderr=stderr,cwd=ROOT,env=env,timeout=240,check=True)
    assert sha(original)==sha(mobile)
    sys.path.insert(0,str(OUT));from model import DualStreamModel
    from data import exact,decode
    from batch_model import collate,forward_batch
    torch.set_num_threads(4)
    model=DualStreamModel(seed=read(OUT/'SCIENCE_CONFIG.json')['seed']).accurate_reductions(False)
    model.load_state_dict(saved['model']);model.eval();outputs=[]
    with original.open('rb') as stream,torch.no_grad():
        for _ in range(4):
            ms,bs=struct.unpack('<II',exact(stream,8));rows=decode(json.loads(exact(stream,ms)),exact(stream,bs))
            out=forward_batch(model,collate(rows));outputs.append({k:out[k][0].tolist() for k in ['logits','valueLogits','valueProbs']})
    save(OUT/'PROBE_REFERENCE.json',dict(framesSha256=sha(original),outputs=outputs,sourceCheckpointSha256=sha(OUT/'initial-checkpoint.pt'),originalVsBundleExact=True,torch=torch.__version__))
    save(HERE/'HOST_ENCODER_PARITY.json',dict(passed=True,requests=32,framesSha256=sha(original),sealedAccess=0))

def archive():
    references=read(HERE/'PAYLOAD_FILES.json')['files']
    entries={f['target']:f for f in references}
    assert len(entries)==len(references),'输入目标文件名发生冲突'
    for path in sorted(OUT.rglob('*')):
        if not path.is_file() or '__pycache__' in path.parts or path.name in ['MOBILE_CONTRACT.json','PAYLOAD_INDEX.json','SHA256SUMS']:continue
        name=path.relative_to(OUT).as_posix()
        assert name not in entries
        entries[name]=dict(source=str(path),target=name,sha256=sha(path),bytes=path.stat().st_size)
    index=dict(schema='mobile-inputs-v1',files=[{k:v for k,v in row.items() if k!='source'} for row in entries.values()],sealedParents=0,
        trainingParents=4604,developmentStates=1299,completeThroughUpdate=2761,targetUpdates=100000)
    save(OUT/'PAYLOAD_INDEX.json',index)
    critical={name:row['sha256'] for name,row in entries.items() if name.endswith(('.py','.mjs','.json')) and not name.startswith(('raw-store/','inputs/'))}
    critical['PAYLOAD_INDEX.json']=sha(OUT/'PAYLOAD_INDEX.json');native={}
    for name in ['controller.sh','guest.sh','status_watch.sh','resume.sh']:
        native[name]=(HERE/name).read_text('utf-8').replace('\r\n','\n').encode()
        import hashlib
        critical['/phone/'+name]=hashlib.sha256(native[name]).hexdigest()
    critical['node/bin/node']=sha(OUT/'node/bin/node')
    contract=dict(schema='samsung-omni-offline-v1',files=critical,payloadManifestSha256=sha(OUT/'PAYLOAD_INDEX.json'),hostContractSha256=sha(STAGE3/'SCIENCE_CONTRACT.json'),
        original2414CheckpointSha256='338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b',resumeCheckpointSha256=sha(OUT/'initial-checkpoint.pt'),
        wallLimit=None,targetUpdates=100000,immutableScience=True,sealedTransferred=False,finalAcceptanceAfterReturn=True)
    save(OUT/'MOBILE_CONTRACT.json',contract)
    for name in ['PAYLOAD_INDEX.json','MOBILE_CONTRACT.json']:
        path=OUT/name;entries[name]=dict(source=str(path),target=name,sha256=sha(path),bytes=path.stat().st_size)
    sums=''.join(f'{row["sha256"]}  work/{name}\n' for name,row in entries.items())
    import hashlib
    sums+=''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name,data in native.items())
    (OUT/'SHA256SUMS').write_text(sums,'utf-8',newline='\n')
    destination=BASE/'phone_samsung_v1/independent-payload-v1.tar'
    if destination.exists():raise ValueError('完整交付包已存在，禁止覆盖')
    with tarfile.open(destination,'w',format=tarfile.GNU_FORMAT) as tar:
        for name,row in entries.items():
            path=Path(row['source']);assert path.stat().st_size==row['bytes']
            info=tar.gettarinfo(str(path),arcname='work/'+name);info.mode=0o700 if name=='node/bin/node' else 0o600;info.uid=info.gid=0
            with path.open('rb') as stream:tar.addfile(info,stream)
        for name,data in native.items():
            info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o700;tar.addfile(info,io.BytesIO(data))
        data=sums.encode();info=tarfile.TarInfo('SHA256SUMS');info.size=len(data);info.mode=0o600;tar.addfile(info,io.BytesIO(data))
    save(HERE/'PACKAGE.json',dict(file=str(destination),bytes=destination.stat().st_size,sha256=sha(destination),files=len(entries)+len(native),
        mobileContractSha256=sha(OUT/'MOBILE_CONTRACT.json'),payloadManifestSha256=sha(OUT/'PAYLOAD_INDEX.json'),sealedTransferred=0))
    print(json.dumps(read(HERE/'PACKAGE.json')),flush=True)

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['sources','fixture','archive']);args=parser.parse_args();globals()[args.action]()
