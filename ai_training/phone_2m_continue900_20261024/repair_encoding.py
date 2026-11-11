"""保全故障现场、部署人口规则修复并从既有完整状态恢复；不执行对局重放。"""
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
from device import HERE, PHONE, ROOT, call, root, write

REPAIR=HERE/'repairs/03'
JOB=PHONE+'/job'
REMOTE=JOB+'/repairs/03'
ROOTFS='/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs'


def sha(p):
    with Path(p).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def read(name):return json.loads(root('cat '+shlex.quote(JOB+'/'+name)))


def assert_stopped():
    assert read('CONTROLLER_EXIT.json')['returncode']==1
    assert read('output/PROGRESS.json')['phase']=='blocked_input_pipeline'
    workers=read('output/WORKERS.json')
    for item in [read('CONTROLLER_STARTED.json'),workers['coordinator'],*workers['workers'],workers['encoder']]:
        raw=root('if test -r /proc/'+str(item['pid'])+'/stat; then cat /proc/'+str(item['pid'])+'/stat; fi')
        if raw:
            fields=raw.rsplit(')',1)[1].split()
            assert int(fields[19])!=item['startTicks'] or fields[0] in ['Z','X'],item


def backup():
    assert_stopped()
    latest=read('output/LATEST.json')
    assert latest['globalStep']==85236 and latest['cursor']==608776 and latest['reason']=='input_pipeline_error'
    assert root('sha256sum '+JOB+'/output/'+latest['file']).split()[0]==latest['sha256']
    root('set -e\ntest ! -e '+REMOTE+'/before\nmkdir -p '+REMOTE+'/before\ncp '+JOB+'/output/checkpoint-0.pt '+JOB+'/output/checkpoint-1.pt '+REMOTE+'/before/\ncp '+JOB+'/output/LATEST.json '+JOB+'/output/PROGRESS.json '+JOB+'/output/RESTORE_VERIFIED.json '+JOB+'/output/WORKER_RNG_RESTORED.json '+REMOTE+'/before/\ncp '+JOB+'/train_continue.py '+JOB+'/encoder.bundle.mjs '+JOB+'/PHONE_AUTHORIZED.json '+REMOTE+'/before/\ncp '+JOB+'/CONTROLLER_STARTED.json '+JOB+'/CONTROLLER_EXIT.json '+JOB+'/TRAINER_IDENTITY.json '+REMOTE+'/before/')
    temporary='/data/local/tmp/aeii-continue900-repair03-checkpoint.pt'
    root('cp '+JOB+'/output/'+latest['file']+' '+temporary+'\nchmod 644 '+temporary)
    call('pull',temporary,REPAIR/'source-checkpoint.pt',timeout=120)
    assert sha(REPAIR/'source-checkpoint.pt')==latest['sha256']
    write(REPAIR/'SOURCE_CHECKPOINT.json',latest)
    write(REPAIR/'BACKUP.json',{'checkedUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'source':latest,'phoneBefore':REMOTE+'/before','computerCheckpointSha256':sha(REPAIR/'source-checkpoint.pt'),'strictReplayExecuted':False})
    print(json.dumps({'backedUp':True,'checkpoint':latest},ensure_ascii=False))


def frames(p):
    data=Path(p).read_bytes();offset=0;rows=[]
    while offset<len(data):
        ml,bl=struct.unpack('<II',data[offset:offset+8]);offset+=8
        meta=json.loads(data[offset:offset+ml]);offset+=ml;body=data[offset:offset+bl];offset+=bl
        assert hashlib.sha256(body).hexdigest()==meta['sha256']
        rows.append({'meta':meta,'body':body})
    assert offset==len(data)
    return rows


def prepare():
    latest=json.loads((REPAIR/'SOURCE_CHECKPOINT.json').read_text())
    before=json.loads((REPAIR/'before/ai_training/phone_2m_continue900_20261024/PHONE_AUTHORIZED.json').read_text(encoding='utf-8'))
    compatibility={'repair':'apk-population-limit-20261025','reason':'APK上限按人口占用计算，旧项目错误按实体个数计算；仅修正规则及显式恢复身份登记',
        'sourceCheckpointSha256':latest['sha256'],'globalStep':latest['globalStep'],'cursor':latest['cursor'],'sourceIdentity':before['files'],
        'dataOrderChanged':False,'sampleBudgetChanged':False,'optimizerOrSchedulerChanged':False,'strictReplayExecuted':False}
    write(HERE/'RESUME_COMPATIBILITY.json',compatibility)
    auth=dict(before);auth['files']={n:sha(HERE/n) for n in before['files']}
    auth['files']['RESUME_COMPATIBILITY.json']=sha(HERE/'RESUME_COMPATIBILITY.json')
    auth['authorization']='用户2026-10-25明确要求排查并修复编码错误，从最新检查点继续到1000局，不做重放校验'
    changed={n for n in set(before['files'])|set(auth['files']) if before['files'].get(n)!=auth['files'].get(n)}
    assert changed=={'encoder.bundle.mjs','train_continue.py','RESUME_COMPATIBILITY.json'},changed
    write(HERE/'PHONE_AUTHORIZED.json',auth)
    work=REPAIR/'probe-work';work.mkdir(exist_ok=True);shutil.copy2(HERE/'PLAN.json',work/'PLAN.json')
    plan=json.loads((HERE/'PLAN.json').read_text(encoding='utf-8'))
    for parent in [plan['inputs'][0],next(p for p in plan['inputs'] if p['parentId']=='native-hard-20261022-1947')]:
        directory=work/'inputs'/parent['parentId'];directory.mkdir(parents=True,exist_ok=True)
        for n,item in parent['coreFiles'].items():
            source=Path(parent['directory'])/n;assert sha(source)==item['sha256'];shutil.copy2(source,directory/n)
    env=dict(os.environ,AEII_CONTINUE_WORK=str(work),UV_THREADPOOL_SIZE='1')
    for label,skip,limit in [('first',0,1),('resume',latest['cursor'],16)]:
        with (REPAIR/(label+'-host.bin')).open('wb') as out,(REPAIR/(label+'-host.log')).open('wb') as log:
            result=subprocess.run(['node',str(HERE/'start_encoder.mjs'),'--skip',str(skip),'--limit',str(limit)],env=env,stdout=out,stderr=log,timeout=120)
        assert result.returncode==0,(REPAIR/(label+'-host.log')).read_text(encoding='utf-8')
    first=frames(REPAIR/'first-host.bin')[0];old=frames(HERE/'encoder-probe.bin')[0]
    assert first==old,'未触发上限修复的既有首样本必须保持逐字节一致'
    resumed=frames(REPAIR/'resume-host.bin');assert len(resumed)==16
    assert any(r['meta']['sources'][0]['macro']==1300 and r['meta']['sources'][0]['code']=='recruit_to_castle:witch:13,4' for r in resumed)
    write(REPAIR/'HOST_PROBE.json',{'passed':True,'firstSampleUnchanged':True,'resumeSamples':len(resumed),'sources':[r['meta']['sources'][0] for r in resumed],
        'hostOptimizerUpdates':0,'strictReplayExecuted':False,'files':auth['files']})
    archive=REPAIR/'update.tar'
    with tarfile.open(archive,'w') as tar:
        for n in ['train_continue.py','encoder.bundle.mjs','RESUME_COMPATIBILITY.json','PHONE_AUTHORIZED.json']:tar.add(HERE/n,arcname='job/'+n)
        tar.add(HERE/'controller_repair03.sh',arcname='controller_repair03.sh')
    print(json.dumps({'prepared':True,'changedFiles':sorted(changed),'resumeSamples':len(resumed),'firstSampleUnchanged':True}))


def deploy():
    assert_stopped();archive=REPAIR/'update.tar';remote='/data/local/tmp/aeii-continue900-repair03-update.tar'
    call('push',archive,remote);assert root('sha256sum '+remote).split()[0]==sha(archive)
    root('tar -xf '+remote+' -C '+PHONE+'\nsh -n '+PHONE+'/controller_repair03.sh')
    auth=json.loads((HERE/'PHONE_AUTHORIZED.json').read_text(encoding='utf-8'))
    for n,digest in auth['files'].items():assert root('sha256sum '+JOB+'/'+n).split()[0]==digest,n
    command='chroot '+ROOTFS+' /usr/bin/env AEII_CONTINUE_WORK=/continue900 UV_THREADPOOL_SIZE=1 /continue900/node/bin/node /continue900/start_encoder.mjs --skip 608776 --limit 16'
    root(command+' > '+REMOTE+'/resume-phone.bin 2>'+REMOTE+'/resume-phone.log',timeout=120)
    temporary='/data/local/tmp/aeii-continue900-repair03-probe.bin'
    root('cp '+REMOTE+'/resume-phone.bin '+temporary+'\nchmod 644 '+temporary)
    call('pull',temporary,REPAIR/'resume-phone.bin')
    assert (REPAIR/'resume-phone.bin').read_bytes()==(REPAIR/'resume-host.bin').read_bytes(),'手机与电脑候选、标签或张量字节不一致'
    write(REPAIR/'PHONE_PROBE.json',{'passed':True,'samples':16,'exactHostPhoneBytesEqual':True,'sha256':sha(REPAIR/'resume-phone.bin'),'optimizerUpdates':0,'strictReplayExecuted':False})
    print(json.dumps({'deployed':True,'allRuntimeFilesVerified':True,'phoneEncodingProbePassed':True,'strictReplayExecuted':False}))


def resume():
    assert_stopped();assert json.loads((REPAIR/'PHONE_PROBE.json').read_text())['passed']
    latest=read('output/LATEST.json');assert latest==json.loads((REPAIR/'SOURCE_CHECKPOINT.json').read_text())
    root('set -e\ntest "$(readlink -f '+JOB+')" = '+JOB+'\ntest ! -e '+REMOTE+'/pre-resume\nmkdir -p '+REMOTE+'/pre-resume\nfor NAME in CONTROLLER_STARTED.json CONTROLLER_EXIT.json TRAINER_IDENTITY.json SESSION_ENDED resource-monitor.pid; do test ! -e '+JOB+'/$NAME || mv '+JOB+'/$NAME '+REMOTE+'/pre-resume/$NAME; done\nfor FILE in '+JOB+'/ENCODING_ERROR-*.json '+JOB+'/output/ERROR-*.json '+JOB+'/output/MONITOR_ERRORS.jsonl; do test ! -f "$FILE" || mv "$FILE" '+REMOTE+'/pre-resume/; done')
    launched=root('setsid sh '+PHONE+'/controller_repair03.sh </dev/null > '+PHONE+'/logs/controller-repair03.log 2>&1 &\necho $!')
    write(REPAIR/'LAUNCHED.json',{'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'result':launched,'sourceCheckpoint':latest,'workers':2,'cumulativeParentBudget':1000,'automaticBeyond1000':False,'strictReplayExecuted':False})
    print(json.dumps({'launched':True,'controller':launched,'resumeGlobalStep':latest['globalStep'],'cursor':latest['cursor']}))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('stage',choices=['backup','prepare','deploy','resume']);args=parser.parse_args();globals()[args.stage]()
