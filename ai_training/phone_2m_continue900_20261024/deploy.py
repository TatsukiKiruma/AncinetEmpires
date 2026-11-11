"""打包完整原始输入与离线编码器，复用现有ARM64 PyTorch，不重放。"""
import argparse
import datetime as dt
import gzip
import hashlib
import io
import json
from pathlib import Path
import shlex
import struct
import tarfile

from device import HERE,PHONE,ROOT,root,call,write

BASE=HERE.parent/'phone_2m_scratch100_20261024'
BENCH=HERE.parent/'phone_2m_workers_20261024'
ROOTFS='/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs'


def sha(p):
    with Path(p).open('rb') as s:return hashlib.file_digest(s,'sha256').hexdigest()


def prepare():
    plan=json.loads((HERE/'PLAN.json').read_text(encoding='utf-8'))
    node=json.loads((HERE/'runtime-assets/NODE_SOURCE.json').read_text(encoding='utf-8'));archive=HERE/'runtime-assets/node-v22.14.0-linux-arm64.tar.xz'
    assert sha(archive)==node['sha256']
    monitor=(BASE/'resource_monitor.sh').read_text(encoding='utf-8').replace('/data/local/tmp/aeii-2m-scratch100-20261024',PHONE)
    (HERE/'resource_monitor.sh').write_text(monitor,encoding='utf-8',newline='\n')
    names=['PLAN.json','PROTOCOL.json','model.py','batch_model.py','accurate_ops.py','train_phone.py','workers_runtime.py','streaming.py','train_continue.py','encoder.bundle.mjs','start_encoder.mjs']
    auth={'serial':'c2357770','authorizedParents':900,'workers':2,'files':{n:sha(HERE/n) for n in names},'authorization':'用户明确要求2worker从100局主检查点继续第101–1000局，共900父局；先清理已备份缓存','automaticBeyond1000':False}
    write(HERE/'PHONE_AUTHORIZED.json',auth)
    payload=HERE/'payload.tar';checks=[]
    with tarfile.open(payload,'w') as t:
        for n in names+['PHONE_AUTHORIZED.json']:
            t.add(HERE/n,arcname='job/'+n);checks.append(sha(HERE/n)+'  '+PHONE+'/job/'+n)
        base=Path(plan['baseCheckpoint']);assert sha(base)==plan['baseCheckpointSha256'];t.add(base,arcname='job/base-checkpoint.pt');checks.append(plan['baseCheckpointSha256']+'  '+PHONE+'/job/base-checkpoint.pt')
        for p in plan['inputs']:
            for n,item in p['coreFiles'].items():
                source=Path(p['directory'])/n;assert sha(source)==item['sha256'];t.add(source,arcname='job/inputs/'+p['parentId']+'/'+n);checks.append(item['sha256']+'  '+PHONE+'/job/inputs/'+p['parentId']+'/'+n)
        with tarfile.open(archive,'r:xz') as source:
            for n in ['bin/node','LICENSE']:
                entry=source.getmember('node-v22.14.0-linux-arm64/'+n);data=source.extractfile(entry).read()
                if n=='bin/node':assert data[:4]==b'\x7fELF' and int.from_bytes(data[18:20],'little')==183
                member=tarfile.TarInfo('job/node/'+n);member.size=len(data);member.mode=0o755 if n=='bin/node' else 0o644;t.addfile(member,io.BytesIO(data));checks.append(hashlib.sha256(data).hexdigest()+'  '+PHONE+'/job/node/'+n)
        for n in ['controller.sh','resource_monitor.sh']:t.add(HERE/n,arcname=n)
    (HERE/'UPLOAD_SHA256SUMS').write_text('\n'.join(checks)+'\n',encoding='utf-8',newline='\n')
    free=int(root('df -k /data | tail -1').split()[3])*1024
    required=payload.stat().st_size*2+180*1024**2+int(2.25*1024**3)
    assert free>required,(free,required)
    remote='/data/local/tmp/aeii-2m-continue900-payload.tar';call('push',payload,remote,timeout=180);assert root('sha256sum '+remote).split()[0]==sha(payload)
    root('test ! -e '+PHONE+'/job/CONTROLLER_STARTED.json || exit 2\nmkdir -p '+PHONE+'/job/logs '+PHONE+'/logs\ntar -xf '+remote+' -C '+PHONE+'\nmkdir -p '+ROOTFS+'/continue900\nmount -o bind '+PHONE+'/job '+ROOTFS+'/continue900\nsh -n '+PHONE+'/controller.sh\nsh -n '+PHONE+'/resource_monitor.sh',timeout=60)
    call('push',HERE/'UPLOAD_SHA256SUMS','/data/local/tmp/aeii-2m-continue900-upload-sha256sums');root('sha256sum -c /data/local/tmp/aeii-2m-continue900-upload-sha256sums > '+PHONE+'/logs/upload-hashes.log',timeout=60)
    version=root('chroot '+ROOTFS+' /continue900/node/bin/node --version')
    write(HERE/'DEPLOYED.json',{'stage':'deployed_not_started','phoneRoot':PHONE,'parents':900,'workers':2,'samples':plan['intendedSamples'],'updates':(plan['intendedSamples']+7)//8,'payloadSha256':sha(payload),'payloadBytes':payload.stat().st_size,'nodeVersion':version,'allInputHashesVerified':True,'freeBeforeBytes':free,'requiredBytesIncludingReserve':required,'trainingStarted':False})
    print(json.dumps({'stage':'deployed','parents':900,'workers':2,'nodeVersion':version,'samples':plan['intendedSamples'],'payloadBytes':payload.stat().st_size}),flush=True)


def probe():
    command='chroot '+ROOTFS+' /usr/bin/env AEII_CONTINUE_WORK=/continue900 UV_THREADPOOL_SIZE=1 /continue900/node/bin/node /continue900/start_encoder.mjs --limit 1 > '+PHONE+'/job/encoder-probe.bin 2>'+PHONE+'/logs/encoder-probe.log'
    root('if test ! -f '+PHONE+'/job/encoder-probe.bin; then '+command+'; fi',timeout=60)
    root('cp '+PHONE+'/job/encoder-probe.bin /data/local/tmp/aeii-2m-continue900-encoder-probe.bin\nchmod 644 /data/local/tmp/aeii-2m-continue900-encoder-probe.bin')
    call('pull','/data/local/tmp/aeii-2m-continue900-encoder-probe.bin',HERE/'encoder-probe.bin')
    actual=(HERE/'encoder-probe.bin').read_bytes();m,b=struct.unpack('<II',actual[:8]);meta=json.loads(actual[8:8+m]);body=actual[8+m:8+m+b]
    assert hashlib.sha256(body).hexdigest()==meta['sha256']
    first=json.loads((HERE/'PLAN.json').read_text(encoding='utf-8'))['inputs'][0]['parentId']
    file=BENCH/'data'/(first+'.frames.gz')
    with gzip.open(file,'rb') as stream:
        header=stream.read(8);rm,rb=struct.unpack('<II',header);ref=json.loads(stream.read(rm));raw=stream.read(rb)
    assert meta['sources']==ref['sources'] and meta['arrays']==ref['arrays'] and body==raw,'手机按需编码与既有同状态特征字节不一致'
    write(HERE/'ENCODER_PROBE.json',{'passed':True,'parentId':first,'sameSourceAndCandidateMetadata':True,'exactTensorBytesEqual':True,'sha256':meta['sha256'],'rawBytes':b,'optimizerUpdates':0,'replayExecuted':False})
    print(json.dumps({'encoderProbePassed':True,'exactTensorBytesEqual':True,'bytes':b}),flush=True)


def launch():
    assert json.loads((HERE/'ENCODER_PROBE.json').read_text())['passed']
    cmd='test ! -e '+PHONE+'/job/CONTROLLER_STARTED.json || exit 2\nsetsid sh '+PHONE+'/controller.sh </dev/null >'+PHONE+'/logs/controller.log 2>&1 &\necho $!'
    result=root(cmd,timeout=30)
    write(HERE/'LAUNCHED.json',{'launchResult':result,'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'parents':900,'workers':2,'computerRequired':False,'automaticBeyond1000':False})
    print(result,flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('stage',choices=['prepare','probe','launch']);a=p.parse_args();globals()[a.stage]()
