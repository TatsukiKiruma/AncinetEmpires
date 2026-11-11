"""冻结手机执行源码并部署必要运行时检查或100局完整分片。"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import shlex
import tarfile

from device import HERE,ROOT,PHONE,root,call,write


def sha(p):
    with Path(p).open('rb') as s:return hashlib.file_digest(s,'sha256').hexdigest()


def sources():
    folder=HERE/'payload';folder.mkdir(exist_ok=True)
    for name,p in {'model.py':ROOT/'ai_training/expert_iteration_2m_20261022/model.py',
                   'batch_model.py':ROOT/'ai_training/expert_iteration_2m_20261022/batch_model.py',
                   'accurate_ops.py':ROOT/'ai_training/dual_stream_v2_phase2_20261020/accurate_ops.py',
                   'train_phone.py':HERE/'train_phone.py','probe_phone.py':HERE/'probe_phone.py','PROTOCOL.json':HERE/'PROTOCOL.json'}.items():
        shutil.copy2(p,folder/name)
    return folder


def upload(archive,label):
    remote='/data/local/tmp/aeii-2m-'+label+'.tar'
    call('push',archive,remote,timeout=180)
    assert root('sha256sum '+remote).split()[0]==sha(archive)
    root('tar -xf '+remote+' -C '+PHONE+'/job',timeout=60)


def probe():
    folder=sources();first=sorted((HERE/'data').glob('*.json'))[0];r=json.loads(first.read_text(encoding='utf-8'))
    write(folder/'PROBE_DATASET.json',{'reports':[r]})
    archive=HERE/'probe-payload.tar'
    with tarfile.open(archive,'w') as t:
        for p in folder.iterdir():t.add(p,arcname=p.name)
        t.add(HERE/'data'/(r['parentId']+'.frames.gz'),arcname='data/'+r['parentId']+'.frames.gz')
    upload(archive,'probe-payload')
    rfs=PHONE+'/runtime/rootfs'
    root('mkdir -p '+rfs+'/sys\nmount -o bind /sys '+rfs+'/sys')
    command='chroot '+rfs+' /usr/bin/env PATH=/opt/torch-env/bin:/usr/sbin:/usr/bin:/sbin:/bin OPENBLAS_NUM_THREADS=1 /bin/bash -c '+shlex.quote('cd /work && python -u probe_phone.py')
    print(root(command+' >'+PHONE+'/logs/probe.log 2>&1',timeout=60),flush=True)
    print(root('cat '+PHONE+'/job/PROBE_REPORT.json; tail -8 '+PHONE+'/logs/probe.log',check=False))


def deploy():
    folder=sources();data=json.loads((HERE/'DATASET.json').read_text(encoding='utf-8'))
    assert sha(HERE/'PROTOCOL.json')==data['protocolSha256']
    with tarfile.open(HERE/'probe-payload.tar') as probe_tar:
        for name in ['model.py','batch_model.py','accurate_ops.py']:
            assert hashlib.sha256(probe_tar.extractfile(name).read()).hexdigest()==sha(folder/name),'模型与手机前反向检查源码不同'
    for name in ['DATASET.json','SPLIT.json','REFERENCE_ORDER.json']:shutil.copy2(HERE/name,folder/name)
    core=['model.py','accurate_ops.py','batch_model.py','train_phone.py','PROTOCOL.json','DATASET.json']
    auth={'serial':'c2357770','authorizedParents':100,'seed':20261024,'parameters':1966910,'files':{n:sha(folder/n) for n in core},'automaticFullTraining':False,'authorizationSourceThread':'01a1699b-21af-74b0-a8cd-1f2f6a804534','authorization':'用户审阅新模型方案后明确要求发布手机100局试训任务'}
    write(folder/'PHONE_AUTHORIZED.json',auth)
    archive=HERE/'training-payload.tar'
    with tarfile.open(archive,'w') as t:
        for p in folder.iterdir():t.add(p,arcname=p.name)
        for report in data['reports']:
            p=HERE/'data'/(report['parentId']+'.frames.gz')
            assert sha(p)==report['sha256'];t.add(p,arcname='data/'+p.name)
    # 还需容纳传输tar、解包分片、双槽和恢复证据检查点并保留2.25GiB。
    free=int(root('df -k '+PHONE+' | tail -1').split()[3])*1024
    required=archive.stat().st_size+data['compressedBytes']+128*1024**2+int(2.25*1024**3)
    assert free>required,{'free':free,'required':required}
    upload(archive,'training-payload')
    checks='\n'.join(sha(p)+'  '+PHONE+'/job/'+p.name for p in folder.iterdir())+'\n'
    checks+='\n'.join(r['sha256']+'  '+PHONE+'/job/data/'+r['parentId']+'.frames.gz' for r in data['reports'])+'\n'
    (HERE/'UPLOAD_SHA256SUMS').write_text(checks,encoding='utf-8',newline='\n');call('push',HERE/'UPLOAD_SHA256SUMS','/data/local/tmp/aeii-2m-upload-sha256sums')
    root('sha256sum -c /data/local/tmp/aeii-2m-upload-sha256sums > '+PHONE+'/logs/upload-hashes.log',timeout=60)
    for name in ['controller.sh','resource_monitor.sh']:
        call('push',HERE/name,'/data/local/tmp/aeii-2m-'+name);root('cp /data/local/tmp/aeii-2m-'+name+' '+PHONE+'/'+name+'\nsh -n '+PHONE+'/'+name)
    receipt={'stage':'deployed','parameters':1966910,'initialization':'random_seed_20261024','parents':100,'samples':data['samples'],'updates':data['updates'],'dataBytes':data['compressedBytes'],
             'phoneRoot':PHONE,'allUploadHashesVerified':True,'trainingStarted':False,'automaticFullTraining':False,'freeBeforeUploadBytes':free,'requiredBytesWithReserve':required,'trainingArchiveSha256':sha(archive)}
    write(HERE/'DEPLOYED.json',receipt);print(json.dumps(receipt,ensure_ascii=False),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('stage',choices=['probe','deploy']);args=parser.parse_args();globals()[args.stage]()
