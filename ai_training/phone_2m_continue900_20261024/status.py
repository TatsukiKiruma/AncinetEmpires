"""只读核实本轮2worker续训、手机本地依赖和可拔线状态。"""
import datetime as dt
import json
import sys
from device import HERE,PHONE,root,write

sys.stdout.reconfigure(encoding='utf-8')


def read(name):return json.loads(root('cat '+PHONE+'/job/'+name))


def proc(identity,role):
    pid=identity['pid'];fields=root('cat /proc/'+str(pid)+'/stat').rsplit(')',1)[1].split()
    return {'role':role,'pid':pid,'startTicks':int(fields[19]),'expectedStartTicks':identity['startTicks'],'identityMatched':int(fields[19])==identity['startTicks'] and fields[0] not in {'Z','X'},
            'ppid':int(fields[1]),'sessionId':int(fields[3]),'state':fields[0],'fds':[root('readlink /proc/'+str(pid)+'/fd/'+str(n),check=False) for n in [0,1,2]]}


def main():
    progress=read('output/PROGRESS.json');resource=read('RESOURCE.json');workers=read('output/WORKERS.json');controller=proc(read('CONTROLLER_STARTED.json'),'controller')
    identities=[controller,proc(workers['coordinator'],'coordinator'),*[proc(w,'training_worker') for w in workers['workers']],proc(workers['encoder'],'local_encoder')]
    base=read('output/BASE_RESUME_VERIFIED.json');resume=read('output/RESTORE_VERIFIED.json');rng=read('output/WORKER_RNG_RESTORED.json');gradient=read('output/GRADIENT_VERIFIED.json');checkpoint=read('output/LATEST.json')
    previous=json.loads((HERE/'LIVE_STATUS.json').read_text(encoding='utf-8'))['output/PROGRESS.json']
    checks={'allInputsOnPhoneAndHashesVerified':json.loads((HERE/'DEPLOYED.json').read_text())['allInputHashesVerified'],
            'baseFullStateVerified':base['passed'],'resumeVerified':resume['passed'],'bothWorkerRngStatesVerified':rng['passed'],'parallelGradientVerified':gradient['passed'],
            'twoSynchronousTrainingWorkers':len(workers['workers'])==2,'allProcessIdentitiesMatched':all(p['identityMatched'] for p in identities),
            'controllerDetachedAndLocalStreams':controller['sessionId']==controller['pid'] and controller['fds'][0]=='/dev/null' and all(f.startswith(PHONE+'/logs/') for f in controller['fds'][1:]),
            'progressContinuedAfterLaunchSessionEnded':progress['segmentUpdates']>previous['segmentUpdates'] and progress['cursor']>previous['cursor'],
            'fullCheckpointAvailable':bool(checkpoint['sha256']),'resourceMonitoringValid':resource['valid'],
            'authorizedBudgetOnly':progress['parents']==900 and progress['workers']==2 and progress['automaticBeyond1000'] is False}
    report={'stage':'phone_training_in_progress','checkedUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'progress':progress,'resource':resource,'identities':identities,'checks':checks,
            'baseResumeVerified':base,'resumeVerified':resume,'workerRngVerified':rng,'gradientVerified':gradient,'latestCheckpoint':checkpoint,'hostOptimizerUpdates':0,'newReplayExecuted':False}
    write(HERE/'LATEST_STATUS.json',report)
    if all(checks.values()):
        write(HERE/'SAFE_TO_DISCONNECT.json',{'ready':True,'checkedUtc':report['checkedUtc'],'checks':checks,'serial':'c2357770','phoneRoot':PHONE,
              'before':{'segmentUpdates':previous['segmentUpdates'],'samples':previous['cursor']},'after':{'segmentUpdates':progress['segmentUpdates'],'samples':progress['cursor']},
              'physicalUsbUnplugTested':False,'hostSessionLifecycleTested':True,'hostRpcRequired':False,'adbForwardsUsed':[],'stopAfterCumulativeParents':1000,'trainingComplete':False})
    write(HERE/'STATUS.json',{'stage':'safe_to_disconnect_training_in_progress' if all(checks.values()) else 'training_progress_checked','workers':2,'newUpdates':progress['segmentUpdates'],'newSamples':progress['cursor'],
          'authorizedParents':900,'cumulativeParentBudget':1000,'safeToDisconnect':all(checks.values()),'temperatureC':resource['temperatureC'],'batteryPercent':resource['batteryPercent'],'hostOptimizerUpdates':0})
    print(json.dumps({'progress':progress,'resource':resource,'safeToDisconnect':all(checks.values()),'checks':checks},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
