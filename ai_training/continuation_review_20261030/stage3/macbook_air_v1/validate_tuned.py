"""只观察调优后有限200更新，验证正式恢复、占用余量和新永久断点。"""
import json
import shlex
from device import HERE,DATA,REMOTE,ssh,save
from prepare_inputs import read

pause=read(HERE/'TUNING_PAUSE.json');eng=read(HERE/'TUNING_ENGINEERING.json');applied=read(HERE/'TUNING_APPLIED.json')
code='''import sys,pathlib,json,time,subprocess,os,statistics
sys.path.insert(0,ENGINEERING)
from benchmark import CpuSampler
r=pathlib.Path(ROOT);t=r/'work/training';trainer=json.loads((r/'TRAINER_IDENTITY.json').read_text());controller=json.loads((r/'CONTROLLER_IDENTITY.json').read_text())
pid=trainer['pid'];children=[int(v) for v in subprocess.run(['/usr/bin/pgrep','-P',str(pid)],capture_output=True,text=True).stdout.split()]
assert len(children)==2,children
def records():
 file=max(t.glob('METRICS-*.jsonl'),key=lambda p:p.stat().st_mtime)
 text=file.read_text();return file,[json.loads(s) for s in text[:text.rfind('\\n')+1].splitlines() if s.strip()]
file,rows=records();warm_target=rows[-1]['update']+20
while rows[-1]['update']<warm_target:time.sleep(.3);file,rows=records()
first=rows[-1];target=first['update']+200
meter=CpuSampler([pid]+children);meter.start()
while True:
 time.sleep(.5);current_file,rows=records()
 assert current_file==file,'正式进程在验证窗口重启'
 if (t/'BLOCKED.json').exists():raise RuntimeError('正式训练异常阻断')
 if rows[-1]['update']>=target:break
meter.close();last=next(row for row in rows if row['update']==target)
seconds=last['macWallSeconds']-first['macWallSeconds']
cpu=[v['wholeCpuPercent'] for v in meter.samples]
mean=statistics.mean(cpu);p95=sorted(cpu)[min(len(cpu)-1,int(len(cpu)*.95))]
assert mean<=55 and p95<=70,(mean,p95)
restore=json.loads((t/('RESTORE-'+file.name[len('METRICS-'):-len('.jsonl')]+'.json')).read_text())
assert restore['update']==PILOT_UPDATE and restore['sourceSha256']==PILOT_SHA
assert all(restore[k] for k in ['modelExact','adamWMomentsAndStepsExact','cpuRngBytesExact','samplerCursorExact','dropoutRngExact'])
latest=json.loads((t/'LATEST.json').read_text());resource=json.loads((t/'RESOURCE.json').read_text())
assert resource['thermalState']<2 and latest['updates']>=11000
import torch
checkpoint=torch.load(t/latest['file'],map_location='cpu',weights_only=False)
assert checkpoint['runtime']['threads']==2 and checkpoint['contractSha256']==CONTRACT
result=dict(passed=True,startUpdate=first['update'],endUpdate=target,lastObservedUpdate=rows[-1]['update'],updates=200,seconds=seconds,
 secondsPerUpdate=seconds/200,updatesPerSecond=200/seconds,averageWholeCpuPercent=mean,p95WholeCpuPercent=p95,
 peakWholeCpuPercent=max(cpu),peakRssBytes=max(v['rssBytes'] for v in meter.samples),cpuSamples=meter.samples,
 controller=controller,trainer=trainer,encoderPids=children,restore=restore,latestCheckpoint=latest,resource=resource,
 monitoringStopped=True,trainingStopped=False,selectedThreadsVerified=2,selectedWorkersVerified=2,sealedAccess=0)
print(json.dumps(result,ensure_ascii=False))
'''.replace('ENGINEERING',repr(eng['remote'])).replace('ROOT',repr(REMOTE)).replace('PILOT_UPDATE',str(applied['pilotUpdate'])).replace('PILOT_SHA',repr(applied['pilotCheckpoint']['sha256'])).replace('CONTRACT',repr(applied['newContractSha256']))
result=json.loads(ssh('cd '+REMOTE+' && runtime/venv/bin/python -c '+shlex.quote(code),timeout=180))
save(HERE/'TUNING_LIVE_VERIFIED.json',result);save(DATA/'TUNING_LIVE_VERIFIED.json',result)
print(json.dumps({k:result[k] for k in ['passed','startUpdate','endUpdate','lastObservedUpdate','secondsPerUpdate','averageWholeCpuPercent','p95WholeCpuPercent','peakRssBytes','monitoringStopped']}),flush=True)
