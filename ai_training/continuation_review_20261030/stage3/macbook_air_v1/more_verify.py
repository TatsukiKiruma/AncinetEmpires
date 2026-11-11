"""恢复后只读确认完整来源与40次真实推进，兼容刚创建但尚空的指标文件。"""
import json
import re
import shlex
from device import HERE,DATA,REMOTE,ssh,save
from prepare_inputs import read

paused=read(HERE/'MORE_PAUSE.json');applied=read(HERE/'MORE_APPLIED.json')
code='''import pathlib,json,time,subprocess
r=pathlib.Path(ROOT);t=r/'work/training'
def records():
 f=max(t.glob('METRICS-*.jsonl'),key=lambda p:p.stat().st_mtime)
 s=f.read_text();return f,[json.loads(v) for v in s[:s.rfind('\\n')+1].splitlines() if v.strip()]
for _ in range(100):
 time.sleep(.4);f,v=records()
 if (t/'BLOCKED.json').exists():raise RuntimeError('恢复后正式训练异常')
 if v and v[-1]['update']>=SOURCE+40:break
else:raise RuntimeError('恢复后推进不足')
restore=json.loads((t/('RESTORE-'+f.name[len('METRICS-'):-len('.jsonl')]+'.json')).read_text())
assert restore['update']==SOURCE and restore['sourceSha256']==SOURCE_SHA
assert all(restore[k] for k in ['modelExact','adamWMomentsAndStepsExact','cpuRngBytesExact','samplerCursorExact','dropoutRngExact'])
trainer=json.loads((r/'TRAINER_IDENTITY.json').read_text());children=subprocess.run(['/usr/bin/pgrep','-P',str(trainer['pid'])],capture_output=True,text=True).stdout.split()
assert len(children)==WORKERS
resource=json.loads((t/'RESOURCE.json').read_text());assert resource['thermalState']<2
print(json.dumps(dict(passed=True,sourceUpdate=SOURCE,lastObservedUpdate=v[-1]['update'],restore=restore,trainer=trainer,encoderPids=children,resource=resource,monitoringStopped=True,trainingStopped=False),ensure_ascii=False))
'''.replace('ROOT',repr(REMOTE)).replace('SOURCE_SHA',repr(paused['checkpoint']['sha256'])).replace('WORKERS',str(applied['after'][1]))
code=re.sub(r'\bSOURCE\b',str(paused['checkpoint']['updates']),code)
result=json.loads(ssh('cd '+REMOTE+' && runtime/venv/bin/python -c '+shlex.quote(code),timeout=60))
save(HERE/'MORE_RESUME_VERIFIED.json',result);save(DATA/'MORE_RESUME_VERIFIED.json',result)
print(json.dumps(dict(passed=True,threads=applied['after'][0],workers=applied['after'][1],lastObservedUpdate=result['lastObservedUpdate'],monitoringStopped=True)),flush=True)
