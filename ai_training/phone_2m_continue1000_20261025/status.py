"""只读核实第1001—2000局训练、受控恢复及手机独立运行状态。"""
import datetime as dt
import json
from device import HERE, PHONE, root, write

JOB=PHONE+'/job'


def read(name,optional=False):
    command='cat '+JOB+'/'+name
    if optional:command='if test -f '+JOB+'/'+name+'; then cat '+JOB+'/'+name+'; fi'
    value=root(command)
    return json.loads(value) if value else None


def process(identity):
    pid=identity['pid'];raw=root('if test -r /proc/'+str(pid)+'/stat; then cat /proc/'+str(pid)+'/stat; fi')
    if not raw:return {'pid':pid,'identityMatched':False,'exited':True}
    fields=raw.rsplit(')',1)[1].split()
    return {'pid':pid,'startTicks':int(fields[19]),'state':fields[0],'sessionId':int(fields[3]),
        'identityMatched':int(fields[19])==identity['startTicks'] and fields[0] not in {'Z','X'},
        'exe':root('readlink /proc/'+str(pid)+'/exe'),'fds':[root('readlink /proc/'+str(pid)+'/fd/'+str(i),check=False) for i in range(3)]}


def main():
    names=['output/PROGRESS.json','output/BASE_RESUME_VERIFIED.json','output/RESTORE_VERIFIED.json','output/WORKER_RNG_RESTORED.json',
        'output/GRADIENT_VERIFIED.json','output/LATEST.json','output/WORKERS.json','output/RESUME_SOURCE.json','RESOURCE.json','CONTROLLER_STARTED.json','CONTROLLER_EXIT.json','output/COMPLETE.json']
    values={n:read(n,True) for n in names};now=int(root('date +%s'))
    errors=root('find '+JOB+' -maxdepth 2 -type f -name "*ERROR-*.json"')
    if values['CONTROLLER_EXIT.json'] or values['output/COMPLETE.json']:
        write(HERE/'LATEST_STATUS.json',{'checkedUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'values':values,'errorFiles':errors})
        print(json.dumps({'ended':values['CONTROLLER_EXIT.json'],'complete':values['output/COMPLETE.json'],'progress':values['output/PROGRESS.json'],'errorFiles':errors},ensure_ascii=False))
        return
    missing=[n for n in names if not values[n] and n not in {'CONTROLLER_EXIT.json','output/COMPLETE.json'}]
    if missing:
        write(HERE/'STARTUP_STATUS.json',{'checkedUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'missing':missing,'values':values,'errors':errors})
        print(json.dumps({'stage':'starting','waitingFor':missing,'progress':values['output/PROGRESS.json'],'errorFiles':errors},ensure_ascii=False));return
    plan=json.loads((HERE/'PLAN.json').read_text(encoding='utf-8'))
    progress=values['output/PROGRESS.json'];base=values['output/BASE_RESUME_VERIFIED.json'];restore=values['output/RESTORE_VERIFIED.json']
    rng=values['output/WORKER_RNG_RESTORED.json'];resource=values['RESOURCE.json'];latest=values['output/LATEST.json'];workers=values['output/WORKERS.json'];source=values['output/RESUME_SOURCE.json']
    identities={'controller':process(values['CONTROLLER_STARTED.json']),'coordinator':process(workers['coordinator']),
        **{'worker'+str(i):process(w) for i,w in enumerate(workers['workers'])},'encoder':process(workers['encoder'])}
    previous=json.loads((HERE/'LATEST_STATUS.json').read_text(encoding='utf-8')) if (HERE/'LATEST_STATUS.json').exists() else None
    checks={'modelAdamwSchedulerRngInherited':base['passed'] and all(base['checks'].values()) and base['sourceCheckpointSha256']==plan['baseCheckpointSha256'],
        'baseGlobalStepContinued':base['globalStep']==99308 and base['cursor']==0 and base['cumulativeSamples']==794464,
        'controlledResumePassed':restore['passed'] and all(restore['checks'].values()) and restore['sourceCheckpointSha256']==source['sha256'] and restore['globalStep']==source['globalStep'] and restore['cursor']==source['cursor'] and restore['globalStep']>=99318,
        'bothWorkerRngRestored':rng['passed'],'twoWorkers':len(workers['workers'])==2,'parallelGradientPassed':values['output/GRADIENT_VERIFIED.json']['passed'],
        'allProcessIdentitiesMatched':all(p['identityMatched'] for p in identities.values()),'trainingAdvancedAfterResume':progress['phase']=='training' and progress['cursor']>80,
        'newCheckpointSaved':latest['globalStep']>99308 and root('sha256sum '+JOB+'/output/'+latest['file']).split()[0]==latest['sha256'],
        'resourceMonitorValid':resource['valid'] and now-resource['epoch']<30,'noEncodingErrors':not errors,
        'localControllerDetached':identities['controller'].get('sessionId')==identities['controller']['pid'] and identities['controller'].get('fds',[None])[0]=='/dev/null',
        'sameAuthorizedBudget':progress['samples']==815544 and progress['parents']==1000 and progress['automaticBeyond2000'] is False}
    report={'checkedUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'checkedBeijing':dt.datetime.fromtimestamp(now,dt.timezone(dt.timedelta(hours=8))).isoformat(),
        'checks':checks,'progress':progress,'resource':resource,'baseRestore':base,'controlledResume':restore,'workerRng':rng,
        'gradient':values['output/GRADIENT_VERIFIED.json'],'latestCheckpoint':latest,'processes':identities,'errorFiles':errors,'hostOptimizerUpdates':0,'strictReplayExecuted':False,'automaticBeyond2000':False}
    if previous and 'progress' in previous:report['progressContinuedAfterPreviousAdbSession']=progress['cursor']>previous['progress']['cursor']
    write(HERE/'LATEST_STATUS.json',report)
    if all(checks.values()):
        write(HERE/'RUNNING_VERIFIED.json',report)
        write(HERE/'SAFE_TO_DISCONNECT.json',{'ready':True,'checkedUtc':report['checkedUtc'],'checks':checks,'serial':'c2357770','phoneRoot':PHONE,
            'physicalUsbUnplugTested':False,'hostSessionLifecycleTested':True,'hostRpcRequired':False,'adbForwardsUsed':[],'stopAfterCumulativeParents':2000,'trainingComplete':False})
        write(HERE/'STATUS.json',{'stage':'training','workers':2,'cumulativeCompletedParents':progress['cumulativeCompletedParents'],'cumulativeParentBudget':2000,
            'newUpdates':progress['segmentUpdates'],'newSamples':progress['cursor'],'temperatureC':resource['temperatureC'],'batteryPercent':resource['batteryPercent'],'safeToDisconnect':True,'hostOptimizerUpdates':0})
    print(json.dumps({'checkedBeijing':report['checkedBeijing'],'checks':checks,'progress':progress,'resource':resource,'progressContinuedAfterPreviousAdbSession':report.get('progressContinuedAfterPreviousAdbSession')},ensure_ascii=False))
    if not all(checks.values()):raise SystemExit(2)


if __name__=='__main__':main()
