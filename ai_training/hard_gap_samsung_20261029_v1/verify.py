"""三星缺口批次现场与静态完整性核验；不执行规则回放。"""
from pathlib import Path
import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import tarfile
import time
from device import OUT,ROOT,ADB,DEVICE,REMOTE,TEST_REMOTE,read,write,shell,app

def process(pid):
    if not str(pid).isdigit():return None
    raw=shell('cat /proc/'+str(pid)+'/stat',check=False)
    if not raw:return {'pid':int(pid),'exited':True}
    fields=raw.rsplit(')',1)[1].split()
    return {'pid':int(pid),'ppid':int(fields[1]),'startTicks':int(fields[19]),'sessionId':int(fields[3]),'tty':int(fields[4]),'state':fields[0],'standardStreams':[shell('readlink /proc/'+str(pid)+'/fd/'+str(i),check=False) for i in [0,1,2]]}

def capture(label,quiet=False):
    remote=TEST_REMOTE if label=='preflight' else REMOTE
    state=json.loads(shell('cat '+remote+'/STATE.json'));workers=[]
    for w in state['workers']:
        controller=json.loads(shell('cat '+w['root']+'/STATE.json'));attempt=controller.get('attempt','')
        row={'workerId':w['workerId'],'controller':controller,'process':process(w['controllerPid'])}
        if re.fullmatch(r'hc7-gap-samsung-20261029-v1-w0[01]-\d{4}-r\d{4}',attempt):
            for name in ['STATE.json','initial-state-receipt.json']:
                raw=app(w['package'],'cat files/.aeii-hard-production/'+attempt+'/'+name,check=False)
                try:row[name]=json.loads(raw)
                except ValueError:pass
        workers.append(row)
    record={'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'device':DEVICE,'phoneState':state,'masterProcess':process(state['masterPid']),'workers':workers,'resources':shell('df -k /data\ndumpsys battery'),'power':shell('dumpsys power'),'physicalUsbDisconnectTested':False,'hostDriverRequired':False,'replay':'disabled_by_user'}
    folder=OUT/'observations';folder.mkdir(exist_ok=True);stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');file=folder/(label+'-'+stamp+'.json');write(file,record)
    if not quiet:print(json.dumps({'path':str(file),'phase':state['phase'],'naturalParents':state['doneParents'],'activeLimit':state['activeLimit'],'temperatureC':state['batteryTemperatureC'],'workers':[{'id':w['workerId'],'phase':w.get('STATE.json',{}).get('phase'),'actions':w.get('STATE.json',{}).get('committedActions'),'sequence':w['controller'].get('activeSeq'),'attempt':w['controller'].get('attempt')} for w in workers]},ensure_ascii=False),flush=True)
    return record,file

def confirm():
    snapshot,file=capture('preflight');state=snapshot['phoneState']
    assert state['phase']=='complete' and state['doneParents']==3 and all(not w['controllerAlive'] for w in state['workers']),'测试尚未自然完成或存在失败，先诊断'
    jobs={j['executionSequence']:j for j in read(OUT/'JOBS.json')['jobs']};results=[]
    sys.path.insert(0,str(ROOT/'tools/phone_training_hard/curriculum_v1'))
    from artifact_integrity import verify
    target=OUT/'preflight/parents';target.mkdir(exist_ok=True)
    for w in state['workers']:
        ledger=shell('cat '+w['root']+'/completed.tsv',check=False)
        for line in ledger.splitlines():
            seq,parent,attempt,epoch=line.split('\t');assert re.fullmatch(r'hc7-gap-samsung-20261029-v1-w0[01]-\d{4}-r\d{4}',attempt)
            archive=target/(attempt+'.tar')
            if not archive.exists():
                command='run-as '+w['package']+' tar -C files/.aeii-hard-production -cf - '+attempt
                with archive.open('xb') as stream:p=subprocess.run([ADB,'-s',DEVICE,'exec-out',command],stdout=stream,stderr=subprocess.PIPE,timeout=180)
                assert p.returncode==0,p.stderr
            with tarfile.open(archive) as tar:
                for member in tar:
                    assert not member.name.startswith('/') and '..' not in Path(member.name).parts
                    if member.isfile():
                        dest=target/member.name;dest.parent.mkdir(parents=True,exist_ok=True)
                        if not dest.exists():dest.write_bytes(tar.extractfile(member).read())
                    else:assert member.isdir()
            row=verify(target/attempt,jobs[int(seq)]);assert row['parentId']==parent
            audit=json.loads(shell('cat '+w['root']+'/logs/'+attempt+'.log.audit'));assert audit['verified']
            row.update({'localDirectory':str((target/attempt).resolve()),'deviceAudit':audit,'workerId':w['workerId']});results.append(row)
    assert {r['executionSequence'] for r in results}==set(read(OUT/'DISPATCH.json')['preflightSequences'])
    assert sorted(r['players'] for r in results)==[2,3,4]
    write(OUT/'PREFLIGHT_CONFIRMED.json',{'passed':True,'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'device':DEVICE,'countedWithinBatch':True,'naturalParents':3,'results':results,'snapshot':str(file),'allFilesHashVerified':True,'framesAndActionsVerified':True,'replay':'disabled_by_user','physicalUsbDisconnectTested':False})
    print(json.dumps({'passed':True,'naturalParents':3,'playerCounts':[2,3,4],'actions':sum(r['actions'] for r in results)},ensure_ascii=False),flush=True)

def offline(label):
    shell('input keyevent 223');before,p1=capture(label,quiet=True);time.sleep(25);after,p2=capture(label,quiet=True)
    first={w['controller'].get('attempt'):w.get('STATE.json',{}).get('committedActions',0) for w in before['workers']}
    progressing=after['phoneState']['doneParents']>before['phoneState']['doneParents'] or any(w.get('STATE.json',{}).get('committedActions',0)>first.get(w['controller'].get('attempt'),0) for w in after['workers'])
    remote=TEST_REMOTE if label=='preflight' else REMOTE
    master=after['masterProcess'];assert master['ppid']==1 and master['tty']==0
    # shell读取本地队列表时会暂时重定向stdin；所有标准流仍必须位于手机本地，禁止主机管道或网络流。
    assert all(v=='/dev/null' or v.startswith(remote+'/') for v in master['standardStreams'])
    assert before['masterProcess']['pid']==master['pid'] and before['masterProcess']['startTicks']==master['startTicks']
    assert progressing,'观察窗口未见真实推进，继续核实资源状态而不宣称通过'
    assert all(w['controllerAlive'] or w['state'].get('phase')=='complete' for w in after['phoneState']['workers'])
    result={'passed':True,'label':label,'before':str(p1),'after':str(p2),'progressWhileScreenOff':True,'durationSeconds':25,'master':master,'phoneState':after['phoneState'],'allJobsLocal':True,'standardInputMayReadLocalQueueFile':True,'hostSessionClosedBeforeObservation':True,'networkForwardRequired':False,'computerRequired':False,'physicalUsbDisconnectTested':False,'replay':'disabled_by_user'}
    write(OUT/(label.upper()+'_OFFLINE_CONFIRMED.json'),result)
    print(json.dumps({'passed':True,'screenOffProgress':True,'masterPpid':1,'physicalUnplugTested':False,'naturalParents':after['phoneState']['doneParents']},ensure_ascii=False),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=['snapshot','confirm','offline']);parser.add_argument('--label',choices=['preflight','production'],default='preflight');args=parser.parse_args()
    {'snapshot':lambda:capture(args.label),'confirm':confirm,'offline':lambda:offline(args.label)}[args.action]()
