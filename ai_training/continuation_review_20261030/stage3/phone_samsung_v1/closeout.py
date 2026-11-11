"""三星停训完整备份：先验收本机归档，清理由独立入口严格授权执行。"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import shlex
import shutil
import tarfile
import time
from device import HERE,call,shell,save
from runtime_setup import termux,PREFIX,HOME
from linux_setup import PHONE,guest

BASE=Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1/phone_samsung_v1')
POINTER=HERE/'CURRENT_CLOSEOUT.json'

def read(path):return json.loads(Path(path).read_text('utf-8-sig'))
def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def state():return read(POINTER)

def prepare():
    assert PHONE==read(HERE/'DELIVERY.json')['phoneRoot']
    assert termux('readlink -f '+PHONE)==PHONE
    stamp=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).strftime('%Y%m%dT%H%M%S')
    local=BASE/'closeouts'/stamp;local.mkdir(parents=True,exist_ok=False)
    code='''import pathlib,json
r=pathlib.Path('/phone');t=r/'work/training'
p=json.loads((t/'PROGRESS.json').read_text());q=json.loads((t/'LATEST.json').read_text());result=json.loads((t/'RESULT.json').read_text())
closures=[json.loads(f.read_text()) for f in t.glob('RUN_CLOSURE-*.json')]
matched=[v for v in closures if v['completedUpdates']==q['updates'] and v['stopReason']=='user_stop' and v['error'] is None]
assert p['phase']=='paused' and result['stopReason']=='user_stop' and len(matched)>=1
assert p['update']==q['updates']==result['updates'] and result['samples']==q['updates']*32
assert q['permanent'] and q['reason']=='user_stop'
print(json.dumps(dict(progress=p,latest=q,controllerExit=json.loads((r/'CONTROLLER_EXIT.json').read_text()),closure=matched[-1],resultSummary={k:result[k] for k in ['phase','stopReason','updates','samples','modelDigest','optimizerDigest','lastExport']}),ensure_ascii=False))'''
    stopped=json.loads(guest('/opt/torch-env/bin/python -c '+shlex.quote(code),timeout=60))
    identities={name:json.loads(termux('cat '+PHONE+'/'+name)) for name in ['CONTROLLER_IDENTITY.json','TRAINER_IDENTITY.json']}
    for identity in identities.values():
        pid=identity['pid'];command=termux('if test -r /proc/'+str(pid)+'/cmdline; then tr "\\0" " " < /proc/'+str(pid)+'/cmdline; fi')
        assert PHONE not in command,'本任务进程仍然存活：'+str(pid)
    termux('mkdir -p '+PHONE+'/closeout')
    boot=read(HERE/'BOOT_ENTRY.json');expected=hashlib.sha256(boot['content'].encode()).hexdigest()
    if termux('test -f '+boot['file']+' && echo yes || echo no')=='yes':
        actual=termux('sha256sum '+boot['file']).split()[0];assert actual==expected
        termux('mv '+boot['file']+' '+PHONE+'/closeout/ORIGINAL_BOOT_ENTRY.sh')
    else:assert termux('sha256sum '+PHONE+'/closeout/ORIGINAL_BOOT_ENTRY.sh').split()[0]==expected
    modes=[]
    for name in ['work','phone']:
        path=PHONE+'/rootfs/'+name
        if termux('test -d '+path+' && echo yes || echo no')=='yes':
            modes.append(dict(path=path,mode=termux("stat -c '%a %u %F' "+path)))
            termux('test ! -L '+path+' && chmod u+rwx '+path)
        else:modes.append(dict(path=path,absentAfterProotExit=True))
    size=int(termux('du -sk '+PHONE,timeout=120).split()[0])*1024
    available=int(shell('df -k /data').splitlines()[-1].split()[3])*1024
    assert available>size+2**30 and shutil.disk_usage(local).free>size*2+2**30
    value=dict(schema='samsung-stop-closeout-v1',tag=stamp,root=PHONE,local=str(local),sourceBytesApprox=size,
        remoteArchive='/data/local/tmp/aeii-omni-stage3-closeout-'+stamp+'.tar',
        sourceStopped=stopped,identities=identities,bootDisabled=True,bootOriginalSha256=expected,
        placeholderOriginalModes=modes,placeholderPermissionChangeOnly=['rootfs/work','rootfs/phone'],macNotTouched=True)
    save(POINTER,value);save(local/'STOP_VERIFIED.json',value)
    termux('printf %s '+shlex.quote(json.dumps(value,ensure_ascii=False,indent=2))+' > '+PHONE+'/closeout/STOP_VERIFIED.json')
    print(json.dumps(dict(stoppedUpdate=stopped['latest']['updates'],samples=stopped['latest']['samples'],sourceBytesApprox=size,local=str(local),bootDisabled=True)),flush=True)

def archive():
    value=state();remote=value['remoteArchive'];local=Path(value['local'])
    command='set -o pipefail; cd '+PHONE+" && find . -type f ! -path './closeout/FILES.sha256' -print0 | sort -z | xargs -0 sha256sum > closeout/FILES.sha256"
    termux(PREFIX+'/bin/bash -c '+shlex.quote(command),timeout=900)
    manifest_sha=termux('sha256sum '+PHONE+'/closeout/FILES.sha256').split()[0]
    shell('test ! -e '+remote+' && touch '+remote+' && chmod 0666 '+remote)
    output=termux(PREFIX+'/bin/tar --numeric-owner --one-file-system -cf '+remote+' -C '+HOME+' '+Path(PHONE).name,timeout=900)
    digest=termux('sha256sum '+remote,timeout=600).split()[0]
    size=int(shell("stat -c '%s' "+remote));shell('chmod 0600 '+remote)
    record=dict(file=remote,bytes=size,sha256=digest,manifestSha256=manifest_sha,tarOutput=output)
    save(local/'PHONE_ARCHIVE.json',record);save(HERE/'CLOSEOUT_PHONE_ARCHIVE.json',dict(local=str(local),**record))
    print(json.dumps(record),flush=True)

def transfer():
    value=state();local=Path(value['local']);record=read(local/'PHONE_ARCHIVE.json')
    target=local/'samsung-complete-task.tar'
    assert not target.exists()
    call('pull',record['file'],target,timeout=2400)
    assert target.stat().st_size==record['bytes'] and sha(target)==record['sha256']
    save(local/'TRANSFER_VERIFIED.json',dict(passed=True,file=str(target),bytes=target.stat().st_size,sha256=record['sha256']))
    print(json.dumps(dict(passed=True,bytes=target.stat().st_size,file=str(target))),flush=True)

def verify():
    value=state();local=Path(value['local']);record=read(local/'PHONE_ARCHIVE.json');transfer=read(local/'TRANSFER_VERIFIED.json')
    assert transfer['passed'];archive=Path(transfer['file']);assert sha(archive)==record['sha256']
    prefix=Path(PHONE).name+'/'
    with tarfile.open(archive,'r:') as tar:
        members=tar.getmembers()
        for member in members:
            name=member.name.rstrip('/')
            assert name==prefix.rstrip('/') or (name.startswith(prefix) and '..' not in Path(name).parts),name
        manifest=tar.extractfile(prefix+'closeout/FILES.sha256').read()
        assert hashlib.sha256(manifest).hexdigest()==record['manifestSha256']
        count=0;total=0
        with (local/'FILES_VERIFIED.jsonl').open('x',encoding='utf-8') as output:
            for line in manifest.decode('utf-8').splitlines():
                assert not line.startswith('\\'),'遇到需显式解析的特殊文件名，禁止不完整验收'
                digest,name=line.split('  ',1);name=name.removeprefix('./')
                member=tar.getmember(prefix+name)
                assert member.isfile() or member.islnk(),name
                with tar.extractfile(member) as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
                assert actual==digest,name
                count+=1;total+=member.size
                output.write(json.dumps(dict(file=name,sha256=digest,bytes=member.size),ensure_ascii=False)+'\n')
        extract=local/'restored-artifacts';extract.mkdir(exist_ok=False)
        selected=[m for m in members if m.name.startswith(tuple(prefix+p for p in ['work/training/','work/engineering/','logs/','closeout/'])) and (m.isfile() or m.isdir())]
        tar.extractall(extract,members=selected,filter='data')
    restored=extract/Path(PHONE).name;training=restored/'work/training'
    pointer=read(training/'LATEST.json');assert pointer==value['sourceStopped']['latest']
    checkpoint=training/pointer['file'];assert sha(checkpoint)==pointer['sha256']
    result=read(training/'RESULT.json')
    for file,digest in result['lastExport'].items():assert sha(training/file)==digest
    import torch
    import numpy as np
    saved=torch.load(checkpoint,map_location='cpu',weights_only=False)
    assert saved['updates']==pointer['updates'] and saved['sampler']['cursor']==pointer['samples'] and saved['scheduler']['last_epoch']==pointer['updates']
    assert not saved.get('engineeringOnly') and not saved.get('pendingAccumulatedGradients')
    assert sum(item['exp_avg'].numel() for item in saved['optimizer']['state'].values())==1966910
    metadata=read(training/'last.json');raw=(training/'last.bin').read_bytes()
    for entry in metadata['tensors']:
        array=np.frombuffer(raw,dtype='<f4',count=entry['length'],offset=entry['offset']*4).reshape(entry['shape'])
        assert np.array_equal(array,saved['model'][entry['name']].numpy()),entry['name']
    record=dict(passed=True,archive=str(archive),archiveSha256=transfer['sha256'],archiveBytes=transfer['bytes'],
        manifestFilesVerified=count,manifestBytesVerified=total,allPhoneRegularFilesPreserved=True,
        restoredArtifacts=str(restored),latestUpdate=pointer['updates'],samples=pointer['samples'],latestCheckpoint=str(checkpoint),
        latestCheckpointSha256=pointer['sha256'],inferenceWeights=str(training/'last.bin'),modelTensorsBitwiseVerified=True,
        fullResumeStatePresent=True,macNotTouched=True,phoneStillNotDeleted=True)
    save(local/'BACKUP_VERIFIED.json',record);save(HERE/'CLOSEOUT_BACKUP_VERIFIED.json',dict(local=str(local),**record))
    print(json.dumps(record),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','archive','transfer','verify']);args=parser.parse_args();globals()[args.action]()
