"""只读取本轮手机训练回执和已登记进程身份，不启动或恢复任务。"""
import datetime as dt
import json
from device import HERE,PHONE,root,write


def read(name):return json.loads(root('cat '+PHONE+'/job/'+name))


def process(identity,role):
    pid=identity['pid'];fields=root('cat /proc/'+str(pid)+'/stat').rsplit(')',1)[1].split()
    result={'role':role,'pid':pid,'startTicks':int(fields[19]),'registeredStartTicks':identity['startTicks'],'ppid':int(fields[1]),'sessionId':int(fields[3]),'state':fields[0],
            'fds':[root('readlink /proc/'+str(pid)+'/fd/'+str(n),check=False) for n in [0,1,2]]}
    result['identityMatched']=result['startTicks']==identity['startTicks'] and result['state'] not in {'Z','X'}
    return result


def main():
    progress=read('output/PROGRESS.json');resume=read('output/RESUME_VERIFIED.json');first=read('output/FIRST_UPDATE.json');latest=read('output/LATEST.json');resource=read('RESOURCE.json')
    controller=process(read('CONTROLLER_STARTED.json'),'controller');trainer=process(read('TRAINER_IDENTITY.json'),'trainer')
    parents=[];parent=controller['ppid']
    while parent>1 and len(parents)<4:
        fields=root('cat /proc/'+str(parent)+'/stat').rsplit(')',1)[1].split()
        item={'pid':parent,'ppid':int(fields[1]),'startTicks':int(fields[19]),'fds':[root('readlink /proc/'+str(parent)+'/fd/'+str(n),check=False) for n in [0,1,2]]}
        parents.append(item);parent=item['ppid']
    result={'stage':'phone_training_started','utc':dt.datetime.now(dt.timezone.utc).isoformat(),'progress':progress,'resume':resume,'firstUpdate':first,'latestCheckpoint':latest,'resource':resource,
            'controller':controller,'trainer':trainer,'phoneParentChain':parents,'hostOptimizerUpdates':0,'automaticFullTraining':False,'sourceModelsLoaded':False,'newReplayExecuted':False}
    write(HERE/'LIVE_STATUS.json',result)
    write(HERE/'STATUS.json',{'stage':'phone_training_started','globalStep':progress['global_step'],'samples':progress['cursor'],'authorizedSamples':73112,'authorizedParents':100,'temperatureC':resource['temperatureC'],
                            'resumeVerified':resume['passed'],'hostOptimizerUpdates':0,'automaticFullTraining':False})
    print(json.dumps({'step':progress['global_step'],'samples':progress['cursor'],'phase':progress['phase'],'temperatureC':resource['temperatureC'],'batteryPercent':resource['batteryPercent'],
                      'resumeVerified':resume['passed'],'controller':controller,'trainer':trainer,'phoneParentChain':parents},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
