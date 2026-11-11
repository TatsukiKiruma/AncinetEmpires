"""应用补测选择或保留原配置，然后从原完整暂停点恢复。"""
import json
import re
from pathlib import Path
import shlex
import shutil
import tarfile
import time
from device import HERE,DATA,REMOTE,ssh,scp,save
from prepare_inputs import PAYLOAD,read,sha

paused=read(HERE/'MORE_PAUSE.json');bench=read(HERE/'MORE_BENCHMARK.json');eng=read(HERE/'MORE_ENGINEERING.json')
assert bench['passed'] and bench['sourceCheckpointSha256']==paused['checkpoint']['sha256']
runtime=read(PAYLOAD/'MAC_RUNTIME.json');chosen=bench['chosen'];before=(runtime['cpuThreads'],runtime['encoderProcesses']);after=(chosen['threads'],chosen['workers'])
assert chosen['averageWholeCpuPercent']<=55 and chosen['p95WholeCpuPercent']<=70
assert sha(PAYLOAD/'MAC_CONTRACT.json')==paused['sourceContractSha256']
changed=before!=after
if changed:
    backup=DATA/'revisions'/paused['tag'];backup.mkdir(parents=True,exist_ok=False)
    for name in ['MAC_RUNTIME.json','MAC_CONTRACT.json','encoder_pool.py']:shutil.copy2(PAYLOAD/name,backup/name)
    runtime.update(cpuThreads=after[0],encoderProcesses=after[1],profile='balanced-more-v4',tuningSourceUpdate=paused['checkpoint']['updates'])
    save(PAYLOAD/'MAC_RUNTIME.json',runtime)
    shutil.copy2(Path(eng['local'])/'encoder_pool.py',PAYLOAD/'encoder_pool.py')
    save(PAYLOAD/'MORE_SELECTION.json',dict(chosen=chosen,sourceUpdate=paused['checkpoint']['updates'],benchmarkSha256=sha(HERE/'MORE_BENCHMARK.json'),userPrefersCpuHeadroom=True))
    contract=read(PAYLOAD/'MAC_CONTRACT.json');contract['schema']='mac4500-omni-contract-balanced-v4'
    for name in ['MAC_RUNTIME.json','encoder_pool.py','MORE_SELECTION.json']:contract['files'][name]=sha(PAYLOAD/name)
    contract['resumeTransition']=dict(sourceCheckpointSha256=paused['checkpoint']['sha256'],fromContractSha256=paused['sourceContractSha256'],sourceUpdate=paused['checkpoint']['updates'])
    save(PAYLOAD/'MAC_CONTRACT.json',contract)
    archive=Path(eng['local'])/'production-more-v4.tar'
    with tarfile.open(archive,'w',format=tarfile.GNU_FORMAT) as tar:
        for name in ['MAC_RUNTIME.json','encoder_pool.py','MORE_SELECTION.json','MAC_CONTRACT.json']:tar.add(PAYLOAD/name,arcname='work/'+name)
    scp(archive,REMOTE+'/production-more-v4.tar')
    assert ssh('shasum -a256 '+REMOTE+'/production-more-v4.tar').split()[0]==sha(archive)
    ssh('cd '+REMOTE+' && test -f work/STOP && tar --no-same-owner -xf production-more-v4.tar')
assert ssh('cd '+REMOTE+'/work && ../runtime/venv/bin/python -c '+shlex.quote('from mac_core import validate;print(validate())')).splitlines()[-1]==sha(PAYLOAD/'MAC_CONTRACT.json')
ssh('cd '+REMOTE+' && mv work/STOP revisions/'+paused['tag']+'/STOP-before-more-tests')
launch=read(HERE/'LAUNCH_AGENT.json');ssh('launchctl kickstart '+launch['domain']+'/'+launch['label'])
save(HERE/'MORE_APPLIED.json',dict(passed=True,changed=changed,before=before,after=after,chosen=chosen,sourceUpdate=paused['checkpoint']['updates'],
    sourceCheckpointSha256=paused['checkpoint']['sha256'],contractSha256=sha(PAYLOAD/'MAC_CONTRACT.json'),engineeringStatesNotPromoted=True,learningScheduleNotReset=True))
code='''import pathlib,json,time,subprocess
r=pathlib.Path(ROOT);t=r/'work/training'
def rows():
 f=max(t.glob('METRICS-*.jsonl'),key=lambda p:p.stat().st_mtime)
 s=f.read_text();return f,[json.loads(v) for v in s[:s.rfind('\\n')+1].splitlines() if v.strip()]
for _ in range(100):
 time.sleep(.4)
 f,v=rows()
 if v and v[-1]['update']>=SOURCE+40:break
 if (t/'BLOCKED.json').exists():raise RuntimeError('恢复后正式训练异常')
else:raise RuntimeError('恢复后推进不足')
restore=json.loads((t/('RESTORE-'+f.name[len('METRICS-'):-len('.jsonl')]+'.json')).read_text())
assert restore['update']==SOURCE and restore['sourceSha256']==SOURCE_SHA
assert all(restore[k] for k in ['modelExact','adamWMomentsAndStepsExact','cpuRngBytesExact','samplerCursorExact','dropoutRngExact'])
trainer=json.loads((r/'TRAINER_IDENTITY.json').read_text());children=subprocess.run(['/usr/bin/pgrep','-P',str(trainer['pid'])],capture_output=True,text=True).stdout.split()
assert len(children)==WORKERS
resource=json.loads((t/'RESOURCE.json').read_text());assert resource['thermalState']<2
print(json.dumps(dict(passed=True,sourceUpdate=SOURCE,lastObservedUpdate=v[-1]['update'],restore=restore,trainer=trainer,encoderPids=children,resource=resource,monitoringStopped=True,trainingStopped=False),ensure_ascii=False))
'''.replace('ROOT',repr(REMOTE)).replace('SOURCE_SHA',repr(paused['checkpoint']['sha256'])).replace('WORKERS',str(after[1]))
code=re.sub(r'\bSOURCE\b',str(paused['checkpoint']['updates']),code)
result=json.loads(ssh('cd '+REMOTE+' && runtime/venv/bin/python -c '+shlex.quote(code),timeout=60))
save(HERE/'MORE_RESUME_VERIFIED.json',result);save(DATA/'MORE_RESUME_VERIFIED.json',result)
print(json.dumps(dict(passed=True,changed=changed,threads=after[0],workers=after[1],update=result['lastObservedUpdate'],monitoringStopped=True)),flush=True)
