"""预装414局完整原始输入与手机本地编码，核对摘要后启动同步续训。"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import struct
import subprocess
import tarfile
from device import HERE, PHONE, root, call, write

ROOTFS='/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs'
OLD=HERE.parent/'phone_2m_continue900_20261024'


def load(p):return json.loads(Path(p).read_text(encoding='utf-8'))


def sha(p):
    with Path(p).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def frames(p):
    raw=Path(p).read_bytes();offset=0;rows=[]
    while offset<len(raw):
        ml,bl=struct.unpack('<II',raw[offset:offset+8]);offset+=8
        meta=json.loads(raw[offset:offset+ml]);offset+=ml;body=raw[offset:offset+bl];offset+=bl
        assert hashlib.sha256(body).hexdigest()==meta['sha256'];rows.append(meta['sources'][0])
    assert offset==len(raw)
    return rows


def prepare():
    assert not (HERE/'DEPLOYED.json').exists()
    plan=load(HERE/'PLAN.json');protocol=load(HERE/'PROTOCOL.json')
    assert protocol['nodeRuntimeSha256']==root('sha256sum /data/local/tmp/aeii-2m-continue900-20261024/job/node/bin/node').split()[0]
    names=['PLAN.json','PROTOCOL.json','model.py','batch_model.py','accurate_ops.py','train_phone.py','workers_runtime.py','streaming.py','train_continue.py','encoder.bundle.mjs','start_encoder.mjs']
    auth={'serial':'c2357770','authorizedParents':414,'workers':2,'files':{n:sha(HERE/n) for n in names},
        'authorization':'用户明确要求继承2000局完整状态，2worker训练剩余414局，保存停止，不做重放校验','automaticBeyond2414':False}
    write(HERE/'PHONE_AUTHORIZED.json',auth)
    probe=HERE/'encoding-probe-work';probe.mkdir(exist_ok=True);shutil.copy2(HERE/'PLAN.json',probe/'PLAN.json')
    for parent in plan['inputs'][:1]:
        target=probe/'inputs'/parent['parentId'];target.mkdir(parents=True,exist_ok=True)
        for name,item in parent['coreFiles'].items():
            source=Path(parent['directory'])/name;assert sha(source)==item['sha256'];shutil.copy2(source,target/name)
    with (HERE/'encoder-probe-host.bin').open('wb') as out,(HERE/'encoder-probe-host.log').open('wb') as log:
        r=subprocess.run(['node',str(HERE/'start_encoder.mjs'),'--limit','16'],env=dict(os.environ,AEII_CONTINUE_WORK=str(probe),UV_THREADPOOL_SIZE='1'),stdout=out,stderr=log,timeout=120)
    assert r.returncode==0,(HERE/'encoder-probe-host.log').read_text(encoding='utf-8')
    sources=frames(HERE/'encoder-probe-host.bin');assert len(sources)==16
    write(HERE/'HOST_ENCODER_PROBE.json',{'passed':True,'samples':16,'sources':sources,'hostOptimizerUpdates':0,'strictReplayExecuted':False})
    archive=HERE/'payload.tar';checks=[]
    with tarfile.open(archive,'w') as tar:
        for name in names+['PHONE_AUTHORIZED.json']:
            tar.add(HERE/name,arcname='job/'+name);checks.append(sha(HERE/name)+'  '+PHONE+'/job/'+name)
        source=Path(plan['baseCheckpoint']);assert sha(source)==plan['baseCheckpointSha256']
        tar.add(source,arcname='job/base-checkpoint.pt');checks.append(plan['baseCheckpointSha256']+'  '+PHONE+'/job/base-checkpoint.pt')
        for parent in plan['inputs']:
            for name,item in parent['coreFiles'].items():
                source=Path(parent['directory'])/name;assert sha(source)==item['sha256'];tar.add(source,arcname='job/inputs/'+parent['parentId']+'/'+name)
                checks.append(item['sha256']+'  '+PHONE+'/job/inputs/'+parent['parentId']+'/'+name)
        for name in ['controller.sh','resource_monitor.sh']:tar.add(HERE/name,arcname=name);checks.append(sha(HERE/name)+'  '+PHONE+'/'+name)
    (HERE/'UPLOAD_SHA256SUMS').write_text('\n'.join(checks)+'\n',encoding='utf-8',newline='\n')
    free=int(root('df -k /data | tail -1').split()[3])*1024;required=archive.stat().st_size*2+180*1024**2+int(2.25*1024**3)
    assert free>required,(free,required)
    remote='/data/local/tmp/aeii-2m-continue414-payload-20261027.tar';call('push',archive,remote,timeout=180)
    assert root('sha256sum '+remote).split()[0]==sha(archive)
    root('set -e\ntest ! -e '+PHONE+'/job/CONTROLLER_STARTED.json\nmkdir -p '+PHONE+'/logs '+PHONE+'/job/logs '+ROOTFS+'/continue2414\ntar -xf '+remote+' -C '+PHONE+'\nif ! grep -Fq " '+ROOTFS+'/continue2414 " /proc/mounts; then mount -o bind '+PHONE+'/job '+ROOTFS+'/continue2414; fi\nsh -n '+PHONE+'/controller.sh\nsh -n '+PHONE+'/resource_monitor.sh',timeout=120)
    call('push',HERE/'UPLOAD_SHA256SUMS','/data/local/tmp/aeii-2m-continue414-upload-sha256sums')
    root('sha256sum -c /data/local/tmp/aeii-2m-continue414-upload-sha256sums > '+PHONE+'/logs/upload-hashes.log',timeout=120)
    version=root('chroot '+ROOTFS+' /continue900/node/bin/node --version')
    write(HERE/'DEPLOYED.json',{'stage':'deployed_not_started','phoneRoot':PHONE,'parents':414,'workers':2,'samples':plan['intendedSamples'],'updates':(plan['intendedSamples']+7)//8,
        'payloadSha256':sha(archive),'payloadBytes':archive.stat().st_size,'nodeVersion':version,'allInputHashesVerified':True,'freeBeforeBytes':free,'requiredBytesIncludingReserve':required,'trainingStarted':False})
    root('test "$(sha256sum '+remote+' | cut -d " " -f 1)" = '+sha(archive)+' && rm -f -- '+remote)
    write(HERE/'DEPLOYMENT_CACHE_CLEANED.json',{'remote':remote,'local':str(archive),'sha256':sha(archive),'bytes':archive.stat().st_size,'allDeployedInputsVerifiedBeforeRemoval':True})
    print(json.dumps({'deployed':True,'parents':414,'workers':2,'samples':plan['intendedSamples'],'payloadBytes':archive.stat().st_size,'allHashesVerified':True}),flush=True)


def probe():
    command='chroot '+ROOTFS+' /usr/bin/env AEII_CONTINUE_WORK=/continue2414 UV_THREADPOOL_SIZE=1 /continue900/node/bin/node /continue2414/start_encoder.mjs --limit 16'
    root(command+' > '+PHONE+'/job/encoder-probe-phone.bin 2>'+PHONE+'/logs/encoder-probe.log',timeout=120)
    temporary='/data/local/tmp/aeii-continue414-encoder-probe-20261027.bin'
    root('cp '+PHONE+'/job/encoder-probe-phone.bin '+temporary+'\nchmod 644 '+temporary);call('pull',temporary,HERE/'encoder-probe-phone.bin')
    assert (HERE/'encoder-probe-phone.bin').read_bytes()==(HERE/'encoder-probe-host.bin').read_bytes()
    write(HERE/'ENCODER_PROBE.json',{'passed':True,'samples':16,'exactHostPhoneBytesEqual':True,'sha256':sha(HERE/'encoder-probe-phone.bin'),'optimizerUpdates':0,'strictReplayExecuted':False})
    print(json.dumps({'encodingProbePassed':True,'samples':16,'exactTensorBytesEqual':True,'strictReplayExecuted':False}),flush=True)


def launch():
    assert load(HERE/'ENCODER_PROBE.json')['passed'] and load(HERE/'DEPLOYED.json')['allInputHashesVerified']
    value=root('test ! -e '+PHONE+'/job/CONTROLLER_STARTED.json || exit 2\nsetsid sh '+PHONE+'/controller.sh </dev/null > '+PHONE+'/logs/controller.log 2>&1 &\necho $!')
    write(HERE/'LAUNCHED.json',{'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'result':value,'workers':2,'cumulativeParentBudget':2414,'computerRequired':False,'automaticBeyond2414':False,'strictReplayExecuted':False})
    print(json.dumps({'launched':True,'controller':value,'workers':2,'stopAfter':2414}),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('stage',choices=['prepare','probe','launch']);args=parser.parse_args();globals()[args.stage]()
