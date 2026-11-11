"""三星第二段只读检查和增量取回，保留手机队列及历史电脑证据。"""
from collections import Counter
import datetime as dt
import json
from pathlib import Path
import re
import shutil
import time

from archive_snapshot import archive
from device import TASK,DEVICE,shell,app,collection_paths
from verify_completed import digest,verify


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def write(path,value):
    Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')


def read_rows(text,columns,bounds=(1000,2000)):
    result=[]
    for line in text.splitlines():
        if not line.strip():
            continue
        fields=line.split();assert len(fields)==columns,line
        assert fields[0].isdigit() and bounds[0]<int(fields[0])<=bounds[1]
        assert re.fullmatch(r'[A-Za-z0-9_-]{1,79}',fields[1])
        assert re.fullmatch(r'[A-Za-z0-9_-]{1,79}',fields[2])
        result.append(fields)
    return result


def capture(out,plan,number):
    target=out/f'snapshot-{number:02d}';target.mkdir()
    root=plan['remoteRoot']
    before=json.loads(shell('cat '+root+'/STATE.json'));write(target/'master-before.json',before)
    completed=[];failures=[];states={};markers={}
    for worker in plan['workers']:
        local=target/worker['workerId'];local.mkdir()
        for filename in ['STATE.json','completed.tsv','failure.tsv','current-state.json','important-targets.tsv']:
            value=shell('cat '+worker['remoteRoot']+'/'+filename,check=False).replace('\r','')
            (local/filename).write_text(value,encoding='utf-8',newline='\n')
        states[worker['workerId']]=json.loads((local/'STATE.json').read_text(encoding='utf-8'))
        for row in read_rows((local/'completed.tsv').read_text(encoding='utf-8'),4,plan.get('globalZeroBasedRange',(1000,2000))):
            completed.append((worker,row))
        for row in read_rows((local/'failure.tsv').read_text(encoding='utf-8'),5,plan.get('globalZeroBasedRange',(1000,2000))):
            failures.append((worker,row))
        text=shell('ls '+worker['remoteRoot']+'/DONE_SEQS').replace('\r','')
        markers[worker['workerId']]=sorted(int(v) for v in text.split() if v.isdigit())
    after=json.loads(shell('cat '+root+'/STATE.json'));write(target/'master-after.json',after)
    assert len(completed)==len({row[1] for _,row in completed})==len({row[0] for _,row in completed}),'完成父局出现重复'
    for worker,row in completed:
        assert int(row[0]) in markers[worker['workerId']],'完成索引没有对应DONE标记'
    result={'utc':now(),'completed':completed,'failures':failures,'workerStates':states,'doneMarkerSequences':markers,
            'masterBefore':before,'masterAfter':after,'completedParents':len(completed),'failedAttempts':len(failures)}
    write(target/'SNAPSHOT.json',result)
    print(json.dumps({'phase':'snapshot','directory':str(target),'completedParents':len(completed),'masterDone':after['doneParents'],'failedAttempts':len(failures),'activeLimit':after['activeLimit'],'cpu':after['cpuPercent'],'temperature':after['batteryTemperatureC']},ensure_ascii=False),flush=True)
    return result


def cache_candidates(out):
    found={}
    paths=list((TASK/'archives').glob('*/INDEX.json'))+list((TASK/'sync').glob('*/INDEX.json'))
    for path in paths:
        if out in path.parents:
            continue
        value=json.loads(path.read_text(encoding='utf-8'))
        for record in value.get('parents',[]):
            directory=Path(record['directory']).resolve()
            if directory.is_relative_to(TASK.resolve()):
                found.setdefault(record['attemptId'],[]).append(directory)
    # 中断同步仍保留逐局成功回执，下次重新核对后可以复用。
    for path in (TASK/'sync').glob('*/verified.jsonl'):
        if out in path.parents:
            continue
        for line in path.read_text(encoding='utf-8').splitlines():
            if line.strip():
                record=json.loads(line);directory=Path(record['directory']).resolve()
                if directory.is_relative_to(TASK.resolve()):
                    found.setdefault(record['attemptId'],[]).append(directory)
    return found


def diagnostics(out,plan,snapshot):
    target=out/'diagnostics';target.mkdir()
    failures=[]
    for worker in plan['workers']:
        local=target/worker['workerId'];local.mkdir()
        selected=[row for w,row in snapshot['failures'] if w['workerId']==worker['workerId']]
        attempts=' '.join(row[2] for row in selected)
        raw=''
        if attempts:
            command='for a in '+attempts+'; do printf "__AEII_ATTEMPT__%s\\n" "$a"; cat files/.aeii-hard-production/"$a"/STATE.json 2>/dev/null; printf "\\n"; done'
            raw=app(worker['package'],command).replace('\r','')
        (local/'failure-states.raw.txt').write_text(raw,encoding='utf-8',newline='\n')
        records={}
        for block in raw.split('__AEII_ATTEMPT__')[1:]:
            attempt,_,body=block.partition('\n')
            try:
                value=json.loads(body.strip())
            except json.JSONDecodeError:
                value=None
            records[attempt.strip()]=value
        for row in selected:
            state=records.get(row[2])
            record={'sequenceIndex':int(row[0]),'parentId':row[1],'attemptId':row[2],'reason':row[3],'epoch':int(row[4]),
                    'package':worker['package'],'workerId':worker['workerId'],'stateAvailable':state is not None,'state':state,'naturalCompletionCounted':False}
            failures.append(record)
            write(local/(row[2]+'.json'),record)
        text=shell('cat '+worker['remoteRoot']+'/logs/controller-*.log',check=False).replace('\r','')
        (local/'controller.log').write_text(text,encoding='utf-8',newline='\n')
        services=shell('dumpsys activity services '+worker['package'])
        (local/'services.txt').write_text(services.replace('\r',''),encoding='utf-8',newline='\n')
    for filename,command in {
        'master.log':'cat '+plan['remoteRoot']+'/logs/master-*.log',
        'recovery-events.tsv':'cat '+plan['remoteRoot']+'/recovery-events.tsv',
        'battery.txt':'dumpsys battery',
        'storage.txt':'df -k /data',
        'memory.txt':'cat /proc/meminfo',
        'power.txt':'dumpsys power',
        'process-events.txt':'logcat -b events -d -t 8000 | grep -E "am_kill|am_crash|am_proc_died" | grep -E "net.toyknight.aeii.worker1[123]"',
    }.items():
        text=shell(command,check=False).replace('\r','')
        (target/filename).write_text(text,encoding='utf-8',newline='\n')
    live=[]
    receipt=Path(plan.get('runningReceipt',TASK/'RUNNING_CONFIRMED.json'))
    old=json.loads(receipt.read_text(encoding='utf-8')) if receipt.is_file() else {'processes':[]}
    expected={p['pid']:p['startTicks'] for p in old['processes']}
    current=json.loads(shell('cat '+plan['remoteRoot']+'/STATE.json'))
    for pid in [current['masterPid'],*[int(w['controllerPid']) for w in current['workers']]]:
        # 完成后的控制器会正常退出；无法读取身份不应阻断已完成数据取回。
        raw=shell('cat /proc/'+str(pid)+'/stat',check=False)
        try:
            fields=raw.rsplit(')',1)[1].split()
            live.append({'pid':pid,'state':fields[0],'ppid':int(fields[1]),'startTicks':int(fields[19]),
                         'sameAsDispatch':expected.get(pid)==int(fields[19]),'identityReadable':True})
        except (IndexError,ValueError):
            live.append({'pid':pid,'identityReadable':False,'sameAsDispatch':None,
                         'note':'进程已退出或无权读取；不能仅凭旧PID认定仍存活'})
    write(target/'process-identities.json',live)
    write(target/'FAILURES.json',failures)
    return failures,live


def main():
    stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    out=TASK/'sync'/stamp;out.mkdir(parents=True,exist_ok=False)
    assert shell('getprop ro.product.model')=='SM-N9500'
    plan_path,segment_path,active=collection_paths()
    plan=json.loads(plan_path.read_text(encoding='utf-8'))
    if active:
        plan['runningReceipt']=active['runningReceipt']
    segment=json.loads(segment_path.read_text(encoding='utf-8'))
    jobs={v['index']:v for v in segment['jobs']}
    segment_sha=digest(segment_path)
    for worker in plan['workers']:
        assert shell('sha256sum '+worker['installedPath']).split()[0]==worker['sha256'],'安装APK身份改变'
    source=out/'source';source.mkdir()
    for name in ['sync_completed.py','verify_completed.py','archive_snapshot.py','device.py']:
        shutil.copy2(Path(__file__).with_name(name),source/name)
    write(out/'REQUEST.json',{'utc':now(),'device':DEVICE,'segmentPlanSha256':segment_sha,'globalZeroBasedRange':segment['globalZeroBasedRange'],
                             'remoteRoot':plan['remoteRoot'],'readOnlyPhone':True,'sourceSha256':{p.name:digest(p) for p in source.iterdir()}})
    candidates=cache_candidates(out)
    first=capture(out,plan,0);snapshot=first
    verified={};errors=[];cache_rejected=[];downloaded=0;reused=0;started=time.monotonic()
    for pass_number in range(4):
        pending=[(w,row) for w,row in snapshot['completed'] if row[2] not in verified]
        for worker,row in pending:
            seq,parent,attempt,epoch=row;job=jobs[int(seq)]
            assert job['parentId']==parent and int(seq) in worker['sequences']
            record=None
            for directory in candidates.get(attempt,[]):
                try:
                    record=verify(directory,row,worker,job,segment_sha,segment['sourceApkSha256'])
                    record['transfer']='reused_verified_local';reused+=1;break
                except (AssertionError,ValueError,OSError,EOFError) as error:
                    cache_rejected.append({'attemptId':attempt,'directory':str(directory),'error':str(error)})
            if record is None:
                destination=out/'data'/worker['workerId'];destination.mkdir(parents=True,exist_ok=True)
                try:
                    transfer=archive(worker['package'],attempt,destination)
                    assert transfer['available'],str(transfer)
                    record=verify(transfer['directory'],row,worker,job,segment_sha,segment['sourceApkSha256'])
                    record['transfer']='downloaded';record['archiveSha256']=transfer['archiveSha256'];downloaded+=1
                except (AssertionError,ValueError,OSError,EOFError) as error:
                    errors.append({'attemptId':attempt,'parentId':parent,'error':str(error)})
                    print(json.dumps({'phase':'download_error','attemptId':attempt,'error':str(error)},ensure_ascii=False),flush=True)
                    continue
            verified[attempt]=record
            with (out/'verified.jsonl').open('a',encoding='utf-8',newline='\n') as stream:
                stream.write(json.dumps(record,ensure_ascii=False)+'\n')
            if len(verified)%25==0 or len(verified)==len(snapshot['completed']):
                print(json.dumps({'phase':'transfer','verified':len(verified),'snapshotCompleted':len(snapshot['completed']),'newlyDownloaded':downloaded,'reused':reused,'seconds':round(time.monotonic()-started,1)},ensure_ascii=False),flush=True)
        snapshot=capture(out,plan,pass_number+1)
        if all(row[2] in verified for _,row in snapshot['completed']):
            break
    failures,live=diagnostics(out,plan,snapshot)
    parents=sorted(verified.values(),key=lambda r:r['sequenceIndex'])
    completed_ids={r['parentId'] for r in parents}
    for record in failures:
        record['parentCompletedInLocalIndex']=record['parentId'] in completed_ids
    write(out/'diagnostics/FAILURES.json',failures)
    reasons=Counter(r['reason'] for r in failures)
    error_text=Counter((r['state'] or {}).get('error') for r in failures if (r['state'] or {}).get('error'))
    failed_parents={r['parentId'] for r in failures}
    index={'schema':'samsung-second-incremental-sync-v1','utc':now(),'device':DEVICE,'directory':str(out.resolve()),'completedParents':len(parents),
           'total':segment['total'],'globalZeroBasedRange':segment['globalZeroBasedRange'],'humanGameNumbers':segment['humanGameNumbers'],
           'parents':parents,'newlyDownloadedParents':downloaded,'reusedVerifiedParents':reused,'failedAttempts':len(failures),
           'failureReasonCounts':dict(reasons),'errorTextCounts':dict(error_text),'failedUniqueParents':len(failed_parents),
           'failedParentsLaterCompleted':len(failed_parents & completed_ids),'failedParentsStillPending':len(failed_parents-completed_ids),
           'failureStatesAvailable':sum(r['stateAvailable'] for r in failures),'snapshotCompletedParents':snapshot['completedParents'],
           'notYetDownloaded':[row[2] for _,row in snapshot['completed'] if row[2] not in verified],
           'actions':sum(r['actions'] for r in parents),'bytes':sum(r['bytes'] for r in parents),'quota':dict(Counter(r['map'] for r in parents)),
           'errors':errors,'rejectedLocalCache':cache_rejected,'initialMaster':first['masterBefore'],'snapshotMaster':snapshot['masterAfter'],
           'processIdentities':live,'transferHashesVerified':not errors,'gzipAndRecordCountsVerified':True,
           'independentReplayDeferred':True,'automaticTrainingAdmission':False,'elapsedSeconds':time.monotonic()-started}
    write(out/'INDEX.json',index)
    print(json.dumps({k:v for k,v in index.items() if k not in {'parents','errorTextCounts','initialMaster','snapshotMaster','processIdentities','rejectedLocalCache'}},ensure_ascii=False),flush=True)


if __name__=='__main__':
    main()
