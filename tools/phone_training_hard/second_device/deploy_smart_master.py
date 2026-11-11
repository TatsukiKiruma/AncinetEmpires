"""核对后只替换本任务总调度器，接管三个原控制器，保留在途局和完成索引。"""
import datetime as dt
import json
import re
import time
from device import TASK, call, shell
from prepare_queue import sha


def identity(pid):
    assert isinstance(pid,int) and pid>1
    stat=shell('cat /proc/'+str(pid)+'/stat')
    fields=stat.rsplit(')',1)[1].split()
    assert fields[0] not in {'Z','X','x'}
    uid=int(re.search(r'(?m)^Uid:\s*(\d+)',shell('cat /proc/'+str(pid)+'/status'))[1])
    return int(fields[19]),uid


def main():
    out=TASK/'adaptive-01'
    assert not (out/'HANDOFF.json').exists()
    expected=json.loads((out/'SHA256.json').read_text(encoding='utf-8'))
    for name,digest in expected.items():
        assert sha(out/name)==digest
    plan=json.loads((TASK/'production-03/PLAN.json').read_text(encoding='utf-8'))
    root=plan['remoteRoot']
    for name in ['master-smart-01.sh','smart_governor.sh','smart_governor_test.sh']:
        remote=root+'/'+name
        shell('test ! -e '+remote)
        call('push',out/name,remote)
        assert shell('sha256sum '+remote).split()[0]==sha(out/name)
        shell('chmod 644 '+remote+'; sh -n '+remote)
    result=shell('sh '+root+'/smart_governor_test.sh '+root+'/smart_governor.sh')
    assert json.loads(result)['passed']
    (out/'GOVERNOR_TEST.json').write_text(result+'\n',encoding='utf-8')
    before=json.loads(shell('cat '+root+'/STATE.json'))
    assert before['phase']=='running' and before['operatingCeiling']==3
    old=int(before['masterPid']);ticks,uid=identity(old);assert uid==2000
    lock=shell('cat '+root+'/master.lock/identity').split()
    assert [int(v) for v in lock]==[old,ticks]
    rows=[];children=[]
    for worker,live in zip(plan['workers'],before['workers']):
        assert worker['workerId']==live['workerId'] and live['controllerAlive']
        pid=int(live['controllerPid']);start,owner=identity(pid);assert owner==2000
        rows.append(f'{worker["workerId"]}\t{pid}\t{start}\t{worker["remoteRoot"]}\n')
        children.append({'workerId':worker['workerId'],'pid':pid,'startTicks':start,'uid':owner})
    adopt=out/'ADOPT_CHILDREN.tsv';adopt.write_text(''.join(rows),encoding='utf-8',newline='\n')
    shell('test ! -e '+root+'/ADOPT_CHILDREN.tsv')
    call('push',adopt,root+'/ADOPT_CHILDREN.tsv')
    assert shell('sha256sum '+root+'/ADOPT_CHILDREN.tsv').split()[0]==sha(adopt)
    shell('chmod 600 '+root+'/ADOPT_CHILDREN.tsv; umask 077; printf "3\\n" > '+root+'/SELECTED_LIMIT; test ! -e '+root+'/STRESS_MODE || mv '+root+'/STRESS_MODE '+root+'/history/STRESS_MODE-finished')
    # 旧总调度器的TERM会通知全部worker停止；这里仅对已双重核验的旧master结束调度，不触及任何控制器和应用。
    assert identity(old)==(ticks,2000)
    command=f'kill -STOP {old}; kill -KILL {old}; setsid sh {root}/master-smart-01.sh {root} </dev/null >{root}/launch-smart-01.log 2>&1 &'
    shell(command)
    time.sleep(6)
    after=json.loads(shell('cat '+root+'/STATE.json'))
    assert after['masterPid']!=old and after['adoptedControllers'] is True
    assert [int(w['controllerPid']) for w in after['workers']]==[c['pid'] for c in children]
    assert all(identity(c['pid'])==(c['startTicks'],2000) for c in children)
    record={'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'oldMaster':{'pid':old,'startTicks':ticks,'uid':2000},'newMasterPid':after['masterPid'],
            'childrenPreserved':children,'before':before,'after':after,'command':command,'operatingCeiling':3,'computerRequired':False,
            'remainingQueueAlreadyOnPhone':True,'completedParentsRepeated':False,'governorUnitTestPassed':True}
    (out/'HANDOFF.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'masterPid':after['masterPid'],'operatingCeiling':after['operatingCeiling'],'activeLimit':after['activeLimit'],'doneParents':after['doneParents'],'remainingParents':after['remainingParents'],'adoptedControllers':True,'governorTestPassed':True},ensure_ascii=False))


if __name__=='__main__':
    main()
