"""最终只读运行回执：手机本地调度身份、锁屏进度和原用户安装保全。"""
import datetime as dt
import json
import re
import time
from device import TASK,shell,collection_paths


def states(plan):
    found={}
    for worker in plan['workers']:
        control=json.loads(shell('cat '+worker['remoteRoot']+'/STATE.json'))
        attempt=control.get('attempt')
        if attempt:
            text=shell('run-as '+worker['package']+' cat files/.aeii-hard-production/'+attempt+'/STATE.json',check=False)
            try:
                found[attempt]=json.loads(text)
            except json.JSONDecodeError:
                pass
    return found


def main():
    plan_path,_,active=collection_paths()
    plan=json.loads(plan_path.read_text(encoding='utf-8'))
    out=plan_path.parent if active else TASK
    root=plan['remoteRoot']
    shell('input keyevent 223')
    before=json.loads(shell('cat '+root+'/STATE.json'));first=states(plan)
    time.sleep(20)
    after=json.loads(shell('cat '+root+'/STATE.json'));last=states(plan)
    power=shell('dumpsys power')
    progress=after['doneParents']>before['doneParents'] or any(a in last and last[a].get('committedActions',0)>value.get('committedActions',0) for a,value in first.items())
    processes=[]
    for pid in [after['masterPid'],*[int(w['controllerPid']) for w in after['workers']],int(shell('cat '+root+'/recovery-guard.pid'))]:
        raw=shell('cat /proc/'+str(pid)+'/stat');fields=raw.rsplit(')',1)[1].split()
        links=[shell('readlink /proc/'+str(pid)+'/fd/'+str(fd)) for fd in (0,1,2)]
        processes.append({'pid':pid,'ppid':int(fields[1]),'startTicks':int(fields[19]),'standardStreams':links})
    original=json.loads((TASK/'INSTALLED.json').read_text(encoding='utf-8'))
    path=shell('pm path net.toyknight.aeii.android').removeprefix('package:')
    original_unchanged=shell('sha256sum '+path).split()[0]==original['originalInstalledSha256']
    wakefulness=re.search(r'mWakefulness=(\w+)',power)[1]
    display=re.search(r'Display Power: state=(\w+)',power)[1]
    assert after['phase']=='running' and after['operatingCeiling']==3 and after['recoveryTarget']==3
    assert all(w['controllerAlive'] for w in after['workers'])
    assert active or after['adoptedControllers']
    assert processes[0]['ppid']==1 and processes[0]['standardStreams'][0]=='/dev/null'
    assert all(p['standardStreams'][1].startswith(root) and p['standardStreams'][2].startswith(root) for p in processes)
    assert progress and original_unchanged
    record={'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'localTime':dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(),
            'master':after,'firstAttemptStates':first,'lastAttemptStates':last,'progressDuring20Seconds':progress,
            'wakefulness':wakefulness,'displayPowerState':display,'processes':processes,'originalInstalledApkUnchanged':original_unchanged,
            'allJobsDispatched':True,'dispatchedTotal':plan['total'],'globalZeroBasedRange':plan.get('globalZeroBasedRange',[1000,2000]),'computerRequired':False,'networkRequired':False,
            'physicalUsbDisconnectTested':False,'independentReplayDeferred':True,'automaticTrainingAdmission':False}
    (out/'RUNNING_CONFIRMED.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'localTime':record['localTime'],'done':after['doneParents'],'remaining':after['remainingParents'],'ceiling':3,'activeLimit':after['activeLimit'],
                      'cpu':after['cpuPercent'],'temperature':after['batteryTemperatureC'],'progressWhileLocked':progress,'wakefulness':wakefulness,'display':display,
                      'failedAttempts':sum(w['state'].get('failedAttempts',0) for w in after['workers']),'masterPid':after['masterPid'],'masterPpid':processes[0]['ppid']},ensure_ascii=False))


if __name__=='__main__':
    main()
