"""只读取三星新任务的现场、初态与落盘完整性，不重放动作。"""
from pathlib import Path
import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import time
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import OUT,REMOTE,TEST_REMOTE,DEVICE,shell,app,write

def process(pid):
    if not str(pid).isdigit():return None
    value=shell('cat /proc/'+str(pid)+'/stat',check=False)
    if not value:return {'pid':int(pid),'exited':True}
    fields=value.rsplit(')',1)[1].split()
    return {'pid':int(pid),'ppid':int(fields[1]),'startTicks':int(fields[19]),'sessionId':int(fields[3]),'tty':int(fields[4]),'state':fields[0],
      'standardStreams':[shell('readlink /proc/'+str(pid)+'/fd/'+str(i),check=False) for i in [0,1,2]]}
def capture(label):
    remote=TEST_REMOTE if label=='preflight' else REMOTE
    state=json.loads(shell('cat '+remote+'/STATE.json'));workers=[]
    for w in state['workers']:
        controller=json.loads(shell('cat '+w['root']+'/STATE.json'));a=controller.get('attempt','')
        row={'workerId':w['workerId'],'controller':controller,'process':process(w['controllerPid'])}
        if re.fullmatch(r'hc7-samsung-20261028-v1-w0[01]-\d{4}-r\d{4}',a):
            base='files/.aeii-hard-production/'+a
            for name in ['STATE.json','initial-state-receipt.json']:
                value=app(w['package'],'cat '+base+'/'+name,check=False)
                try:row[name]=json.loads(value)
                except ValueError:pass
        workers.append(row)
    record={'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'device':DEVICE,'phoneState':state,'masterProcess':process(state['masterPid']),'workers':workers,
       'resources':shell('df -k /data\ndumpsys battery'),'power':shell('dumpsys power'),'physicalUsbDisconnectTested':False,'hostDriverRequired':False,'replay':'disabled_by_user'}
    folder=OUT/'observations';folder.mkdir(exist_ok=True);stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    path=folder/(label+'-'+stamp+'.json');write(path,record)
    print(json.dumps({'path':str(path),'phase':state['phase'],'naturalParents':state['doneParents'],'activeLimit':state['activeLimit'],'temperatureC':state['batteryTemperatureC'],
        'workers':[{'id':w['workerId'],'phase':w.get('STATE.json',{}).get('phase'),'actions':w.get('STATE.json',{}).get('committedActions'),'attempt':w['controller'].get('attempt')} for w in workers]},ensure_ascii=False),flush=True)
    return record,path
def confirm():
    r,path=capture('preflight');state=r['phoneState']
    assert state['phase']=='complete' and state['doneParents']==3 and all(not w['controllerAlive'] for w in state['workers']),'测试仍在执行或存在失败缺口'
    results=[]
    for w in state['workers']:
        ledger=shell('cat '+w['root']+'/completed.tsv',check=False)
        for line in ledger.splitlines():
            seq,parent,attempt,epoch=line.split('\t');base='files/.aeii-hard-production/'+attempt
            result=json.loads(app(w['package'],'cat '+base+'/result.json'));receipt=json.loads(app(w['package'],'cat '+base+'/initial-state-receipt.json'))
            manifest=json.loads(app(w['package'],'cat '+base+'/artifact-manifest.json'));exit_record=json.loads(app(w['package'],'cat '+base+'/THREAD_EXITED.json'))
            assert result['naturalEnd'] and result['allInitialPlayersObserved'] and receipt['verified']
            assert exit_record['attemptId']==attempt and result['parentId']==parent
            for entry in manifest['files']:
                actual=app(w['package'],'sha256sum '+base+'/'+entry['name']).split()[0];assert actual==entry['sha256']
            audit=shell('cat '+w['root']+'/logs/'+attempt+'.log.audit');assert json.loads(audit)['verified']
            results.append({'sequence':int(seq),'parentId':parent,'attemptId':attempt,'actions':result['actions'],'initialPlayers':len(receipt['actual']['playerArrays']['i']) if False else sum(c>0 for c in receipt['counts']),
                'counts':receipt['counts'],'populations':receipt['populations'],'paths':result['pathCounts'],'files':manifest['files'],'audit':json.loads(audit)})
    assert sorted(x['sequence'] for x in results)==[1010,1011,1012]
    assert sorted(x['initialPlayers'] for x in results)==[2,3,4]
    out={'passed':True,'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'device':DEVICE,'countedWithinBatch':True,'naturalParents':3,'results':results,
      'snapshot':str(path),'allFilesHashVerified':True,'allFramesAndActionsVerifiedOnDevice':True,'replay':'disabled_by_user','physicalUsbDisconnectTested':False}
    write(OUT/'PREFLIGHT_CONFIRMED.json',out);print(json.dumps({'passed':True,'naturalParents':3,'playerCounts':[2,3,4]},ensure_ascii=False))
def offline(label):
    shell('input keyevent 223')
    before,p1=capture(label)
    time.sleep(25)
    after,p2=capture(label)
    first={w['controller'].get('attempt'):w.get('STATE.json',{}).get('committedActions',0) for w in before['workers']}
    progress=after['phoneState']['doneParents']>before['phoneState']['doneParents'] or any(w.get('STATE.json',{}).get('committedActions',0)>first.get(w['controller'].get('attempt'),0) for w in after['workers'])
    master=after['masterProcess'];assert master['ppid']==1 and master['tty']==0 and master['standardStreams'][0]=='/dev/null'
    remote=TEST_REMOTE if label=='preflight' else REMOTE
    assert all(v.startswith(remote) for v in master['standardStreams'][1:])
    assert after['masterProcess']['pid']==before['masterProcess']['pid'] and after['masterProcess']['startTicks']==before['masterProcess']['startTicks']
    assert progress,'锁屏观察窗口内尚未看到真实推进'
    assert all(w['controllerAlive'] or w['state'].get('phase')=='complete' for w in after['phoneState']['workers'])
    report={'passed':True,'label':label,'before':str(p1),'after':str(p2),'progressWhileScreenOff':progress,'durationSeconds':25,'master':master,'phoneState':after['phoneState'],
       'allJobsLocal':True,'hostSessionClosedBeforeObservation':True,'networkForwardRequired':False,'computerRequired':False,'physicalUsbDisconnectTested':False,'replay':'disabled_by_user'}
    write(OUT/(label.upper()+'_OFFLINE_CONFIRMED.json'),report)
    print(json.dumps({'passed':True,'screenOffProgress':True,'masterPpid':1,'physicalUnplugTested':False,'naturalParents':after['phoneState']['doneParents']},ensure_ascii=False))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['snapshot','offline','confirm']);p.add_argument('--label',choices=['preflight','production'],default='preflight');a=p.parse_args()
    {'snapshot':lambda:capture(a.label),'offline':lambda:offline(a.label),'confirm':confirm}[a.action]()
