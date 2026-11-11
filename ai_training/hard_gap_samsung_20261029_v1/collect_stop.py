"""正常停采后取回所有成功原件及本批控制、失败证据；不清理手机、不重放。"""
from pathlib import Path
from collections import Counter
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
import tarfile
import time
from device import OUT,ROOT,ADB,DEVICE,REMOTE,read,write,shell,app

DEST=OUT/'closeout-pc320-20261029'
def save(name,value):
    file=DEST/name;file.parent.mkdir(parents=True,exist_ok=True)
    file.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def unpack(archive,target):
    target.mkdir(parents=True,exist_ok=True)
    with tarfile.open(archive) as tar:
        for m in tar:
            assert not m.name.startswith('/') and '..' not in Path(m.name).parts
            if m.isfile():
                file=target/m.name;file.parent.mkdir(parents=True,exist_ok=True);data=tar.extractfile(m).read()
                if file.exists():assert file.read_bytes()==data
                else:file.write_bytes(data)
            else:assert m.isdir(),m.name
def download(command,archive,target):
    if not archive.exists():
        with archive.open('xb') as f:p=subprocess.run([ADB,'-s',DEVICE,'exec-out',command],stdout=f,stderr=subprocess.PIPE,timeout=300)
        assert p.returncode==0,p.stderr
    unpack(archive,target)
    return {'archive':str(archive),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}

def main():
    DEST.mkdir(exist_ok=True)
    for _ in range(30):
        state=json.loads(shell('cat '+REMOTE+'/STATE.json'))
        if state['phase']=='stopped' and all(not w['controllerAlive'] for w in state['workers']):break
        print('等待正常收尾',state['phase'],state['doneParents'],flush=True);time.sleep(3)
    else:raise RuntimeError('手机停止尚未确认，不启动电脑采集')
    assert not shell('test -d /proc/'+str(state['masterPid'])+' && cat /proc/'+str(state['masterPid'])+'/stat',check=False)
    plan=read(OUT/'production/PLAN.json')
    for w in plan['workers']:assert not shell('pidof '+w['package'],check=False)
    save('STOPPED_STATE.json',state)
    control_names=[REMOTE.rsplit('/',1)[-1]]+[w['remoteRoot'].rsplit('/',1)[-1] for w in plan['workers']]
    controls=download('tar -C /data/local/tmp -cf - '+' '.join(control_names),DEST/'task-roots.tar',DEST/'task-roots')
    jobs={j['executionSequence']:j for j in read(OUT/'JOBS.json')['jobs']}
    sys.path.insert(0,str(ROOT/'tools/phone_training_hard/curriculum_v1'))
    from artifact_integrity import verify
    verified=[];failures=[];inventory=[]
    for w in plan['workers']:
        wid=w['workerId'];remote=w['remoteRoot'];package=w['package'];ledger=shell('cat '+remote+'/completed.tsv',check=False)
        completed=[line.split('\t') for line in ledger.splitlines() if line.strip()]
        names=[r[2] for r in completed]
        assert all(re.fullmatch(r'hc7-gap-samsung-20261029-v1-w0[01]-\d{4}-r\d{4}',n) for n in names)
        target=DEST/(wid+'-raw')
        archive=download('run-as '+package+' tar -C files/.aeii-hard-production -cf - '+' '.join(names),DEST/(wid+'-success.tar'),target)
        output=app(package,'cd files/.aeii-hard-production && find '+' '.join(names)+' -type f -exec sha256sum {} +',timeout=180)
        (DEST/(wid+'-phone-sha256.txt')).write_text(output,encoding='utf-8')
        count=0
        for line in output.splitlines():
            digest,name=line.split(None,1);assert hashlib.sha256((target/name).read_bytes()).hexdigest()==digest,name;count+=1
        for seq,parent,attempt,epoch in completed:
            job=jobs[int(seq)];assert job['parentId']==parent
            row=verify(target/attempt,job);row['localDirectory']=str((target/attempt).resolve());row['phoneDevice']='samsung';verified.append(row)
        failed=[line.split('\t') for line in shell('cat '+remote+'/failure.tsv',check=False).splitlines() if line.strip()]
        failure_names=list(dict.fromkeys(r[2] for r in failed));present=[]
        for name in failure_names:
            assert re.fullmatch(r'hc7-gap-samsung-20261029-v1-w0[01]-\d{4}-r\d{4}',name)
            if app(package,'test -d files/.aeii-hard-production/'+name+' && echo present',check=False)=='present':present.append(name)
        failure_archives=[]
        for offset in range(0,len(present),32):
            subset=present[offset:offset+32]
            failure_archives.append(download('run-as '+package+' tar -C files/.aeii-hard-production -cf - '+' '.join(subset),DEST/(wid+'-failures-'+str(offset//32)+'.tar'),DEST/(wid+'-failed')))
        for seq,parent,attempt,reason,epoch in failed:
            directory=DEST/(wid+'-failed')/attempt;error=directory/'worker-error.json';latest=directory/'STATE.json'
            failures.append({'executionSequence':int(seq),'parentId':parent,'attemptId':attempt,'reason':reason,'epoch':int(epoch),'workerId':wid,'error':read(error) if error.exists() else None,'state':read(latest) if latest.exists() else None,'localDirectory':str(directory) if directory.exists() else None})
        inventory.append({'workerId':wid,'successfulFilesPhoneShaVerified':count,'successArchive':archive,'failureArchives':failure_archives})
        print('取回并核验',wid,len(completed),'成功父局',len(failed),'失败尝试',flush=True)
    assert len(verified)==state['doneParents'] and len({r['parentId'] for r in verified})==len(verified)
    done={r['parentId'] for r in verified};remaining=[j for j in jobs.values() if j['parentId'] not in done]
    save('VERIFIED_PARENTS.json',verified);save('FAILED_ATTEMPTS.json',failures);save('REMAINING_JOBS.json',{'jobs':remaining})
    save('TRANSFER_REPORT.json',{'created':dt.datetime.now(dt.timezone.utc).isoformat(),'phoneStopped':True,'allControllersExited':True,'workerAppsExited':True,'naturalParents':len(verified),'actions':sum(r['actions'] for r in verified),'failedAttempts':len(failures),'failureReasons':dict(Counter(f['reason'] for f in failures)),'remainingPhonePlanParents':len(remaining),'successfulRawFileShaVerified':True,'controlArchive':controls,'inventory':inventory,'phoneOriginalsDeleted':False,'training':False,'historicalReplay':False,'tensorGeneration':False})
    print(json.dumps({'stopped':True,'naturalParents':len(verified),'actions':sum(r['actions'] for r in verified),'failures':len(failures),'destination':str(DEST)},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
