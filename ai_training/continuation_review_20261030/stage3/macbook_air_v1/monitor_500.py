"""仅观察一个500更新窗口并退出，不停止Mac训练、不创建定时监听。"""
import json
import shlex
import time
from device import HERE,REMOTE,ssh,save

def query(start=None):
    code='''import pathlib,json,time
r=pathlib.Path(ROOT);t=r/'work/training'
def read(p):return json.loads(p.read_text())
rows=[]
for file in t.glob('METRICS-*.jsonl'):
 for line in file.read_text().splitlines():
  if line.strip():
   row=json.loads(line)
   if START is None or row['update']>=START:rows.append(dict(row,metricsFile=file.name))
rows.sort(key=lambda v:v['update'])
if START is None:rows=rows[-1:]
flags={name:read(t/name) for name in ['BLOCKED.json','CONTROLLER_BLOCKED.json','COMPLETE.json'] if (t/name).exists()}
print(json.dumps(dict(rows=rows,progress=read(t/'PROGRESS.json'),resource=read(t/'RESOURCE.json'),latestCheckpoint=read(t/'LATEST.json'),flags=flags,controller=read(r/'CONTROLLER_IDENTITY.json'),trainer=read(r/'TRAINER_IDENTITY.json'),epoch=time.time()),ensure_ascii=False))
'''.replace('ROOT',repr(REMOTE)).replace('START',repr(start))
    return json.loads(ssh('cd '+REMOTE+' && runtime/venv/bin/python -c '+shlex.quote(code)))

def main():
    before=query();first=before['rows'][-1];start=first['update'];target=start+500;observed=time.monotonic()
    state=dict(phase='monitoring',startUpdate=start,targetUpdate=target,windowUpdates=500,startedEpoch=time.time(),before=before,
        stopMonitoringAfterWindow=True,trainingMustContinue=True)
    save(HERE/'MONITOR_500_STATE.json',state)
    print(json.dumps(dict(startUpdate=start,targetUpdate=target,observedUpdates=0)),flush=True)
    while True:
        time.sleep(20)
        snapshot=query(start)
        if snapshot['flags']:
            save(HERE/'MONITOR_500_INTERRUPTED.json',dict(state,snapshot=snapshot,error='训练在窗口完成前退出或阻断'))
            raise RuntimeError('训练提前退出或阻断，未完成500更新测速')
        last=snapshot['rows'][-1]
        print(json.dumps(dict(update=last['update'],observedUpdates=min(500,last['update']-start),targetUpdate=target,
            battery=snapshot['resource']['batteryPercent'],thermalState=snapshot['resource']['thermalState'])),flush=True)
        if last['update']<target:continue
        by_update={row['update']:row for row in snapshot['rows']}
        assert all(u in by_update for u in range(start,target+1)),'测速区间指标缺失'
        end=by_update[target]
        assert first['metricsFile']==end['metricsFile'],'窗口内发生进程重启，禁止跨计时基准计算速率'
        seconds=end['macWallSeconds']-first['macWallSeconds']
        assert seconds>0
        result=dict(passed=True,monitoringStopped=True,trainingStopped=False,startUpdate=start,endUpdate=target,
            updates=500,samples=16000,seconds=seconds,secondsPerUpdate=seconds/500,
            updatesPerSecond=500/seconds,samplesPerSecond=16000/seconds,
            estimatedRemainingHours=(100000-end['update'])*seconds/500/3600,
            firstMetric=first,lastMetric=end,lastObservedUpdate=last['update'],before=before,after=snapshot,
            source='同一Mac训练进程记录的精确500次完整更新墙钟，包含编码等待和周期保存开销',
            hostObservedSeconds=time.monotonic()-observed,completedEpoch=time.time(),futurePollingScheduled=False)
        save(HERE/'MONITOR_500_RESULT.json',result)
        state.update(phase='complete',monitoringStopped=True,endUpdate=target,completedEpoch=result['completedEpoch'])
        save(HERE/'MONITOR_500_STATE.json',state)
        print(json.dumps({k:result[k] for k in ['passed','monitoringStopped','startUpdate','endUpdate','seconds','secondsPerUpdate','updatesPerSecond','samplesPerSecond','estimatedRemainingHours','lastObservedUpdate']}),flush=True)
        return

if __name__=='__main__':main()
