"""只读核实修复后的训练状态、完整恢复和手机本地进程身份。"""
import datetime as dt
import json
from device import HERE, PHONE, root, write

JOB=PHONE+'/job'


def read(name):return json.loads(root('cat '+JOB+'/'+name))


def process(identity):
    pid=identity['pid'];raw=root('if test -r /proc/'+str(pid)+'/stat; then cat /proc/'+str(pid)+'/stat; fi')
    if not raw:return {'pid':pid,'identityMatched':False,'exited':True}
    fields=raw.rsplit(')',1)[1].split()
    return {'pid':pid,'startTicks':int(fields[19]),'state':fields[0],'sessionId':int(fields[3]),
        'identityMatched':int(fields[19])==identity['startTicks'] and fields[0] not in {'Z','X'},
        'exe':root('readlink /proc/'+str(pid)+'/exe'),'fds':[root('readlink /proc/'+str(pid)+'/fd/'+str(i),check=False) for i in range(3)]}


def main():
    progress=read('output/PROGRESS.json');restore=read('output/RESTORE_VERIFIED.json');rng=read('output/WORKER_RNG_RESTORED.json')
    resource=read('RESOURCE.json');latest=read('output/LATEST.json');workers=read('output/WORKERS.json')
    source=json.loads((HERE/'repairs/03/SOURCE_CHECKPOINT.json').read_text())
    identities={'controller':process(read('CONTROLLER_STARTED.json')),'coordinator':process(workers['coordinator']),
        **{'worker'+str(i):process(w) for i,w in enumerate(workers['workers'])},'encoder':process(workers['encoder'])}
    now=int(root('date +%s'));errors=root('find '+JOB+' -maxdepth 2 -type f -name "*ERROR-*.json"')
    checks={'fullStateRestored':restore['passed'] and all(restore['checks'].values()) and restore['sourceCheckpointSha256']==source['sha256'],
        'sameStartingStepAndCursor':restore['globalStep']==source['globalStep'] and restore['cursor']==source['cursor'],
        'workerRngRestored':rng['passed'],'twoWorkers':len(workers['workers'])==2,
        'allProcessIdentitiesMatched':all(p['identityMatched'] for p in identities.values()),
        'trainingAdvancedPastBadLabel':progress['phase']=='training' and progress['cursor']>=source['cursor']+8,
        'newCheckpointSaved':latest['cursor']>source['cursor'],
        'resourceMonitorValid':resource['valid'] and now-resource['epoch']<30,'noNewEncodingError':not errors,
        'localControllerDetached':identities['controller'].get('sessionId')==identities['controller']['pid'] and identities['controller'].get('fds',[None])[0]=='/dev/null',
        'sameAuthorizedBudget':progress['samples']==721352 and progress['parents']==900 and progress['automaticBeyond1000'] is False}
    report={'checkedUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'checkedBeijing':dt.datetime.fromtimestamp(now,dt.timezone(dt.timedelta(hours=8))).isoformat(),
        'checks':checks,'progress':progress,'resource':resource,'restore':restore,'workerRng':rng,'latestCheckpoint':latest,'processes':identities,
        'errorFiles':errors,'hostOptimizerUpdates':0,'strictReplayExecuted':False,'automaticBeyond1000':False}
    write(HERE/'repairs/03/RUNNING_VERIFIED.json',report)
    if all(checks.values()):
        write(HERE/'SAFE_TO_DISCONNECT.json',{'ready':True,'checkedUtc':report['checkedUtc'],'checks':checks,'serial':'c2357770','phoneRoot':PHONE,
            'physicalUsbUnplugTested':False,'hostSessionLifecycleTested':True,'hostRpcRequired':False,'adbForwardsUsed':[],'stopAfterCumulativeParents':1000,'trainingComplete':False})
        write(HERE/'STATUS.json',{'stage':'repair03_resumed_training','workers':2,'newUpdates':progress['segmentUpdates'],'newSamples':progress['cursor'],
            'cumulativeCompletedParents':progress['cumulativeCompletedParents'],'cumulativeParentBudget':1000,'safeToDisconnect':True,'temperatureC':resource['temperatureC'],'batteryPercent':resource['batteryPercent'],'hostOptimizerUpdates':0})
    print(json.dumps(report,ensure_ascii=False))
    if not all(checks.values()):raise SystemExit(2)


if __name__=='__main__':main()
