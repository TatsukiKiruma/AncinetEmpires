"""Mac性能调优的版本化暂停、工程载荷和安全恢复编排。"""
import argparse
import json
from pathlib import Path
import shlex
import tarfile
import time
from device import HERE,DATA,REMOTE,ssh,scp,save
from prepare_inputs import read,sha

def pause():
    ssh('cd '+REMOTE+' && touch work/STOP')
    code='''import pathlib,json,time,os
r=pathlib.Path(ROOT);p=json.loads((r/'TRAINER_IDENTITY.json').read_text())['pid']
for _ in range(40):
 try:os.kill(p,0)
 except ProcessLookupError:break
 time.sleep(.5)
else:raise RuntimeError('等待完整更新停止超时，禁止强杀')
latest=json.loads((r/'work/training/LATEST.json').read_text())
progress=json.loads((r/'work/training/PROGRESS.json').read_text())
assert progress['phase']=='paused' and latest['updates']==progress['update']
assert latest['reason']=='user_stop'
print(json.dumps(dict(latest=latest,progress=progress),ensure_ascii=False))
'''.replace('ROOT',repr(REMOTE))
    result=json.loads(ssh('cd '+REMOTE+' && runtime/venv/bin/python -c '+shlex.quote(code),timeout=40))
    tag='tuning-'+str(result['latest']['updates'])+'-'+str(time.time_ns())
    result.update(tag=tag,sourceContractSha256=ssh('shasum -a256 '+REMOTE+'/work/MAC_CONTRACT.json').split()[0])
    backup=REMOTE+'/revisions/'+tag
    ssh('test ! -e '+backup+' && mkdir -p '+backup+'/work && cp '+REMOTE+'/work/*.py '+REMOTE+'/work/MAC_RUNTIME.json '+REMOTE+'/work/MAC_CONTRACT.json '+backup+'/work/ && cp '+REMOTE+'/controller.py '+REMOTE+'/launch-agent.plist '+backup+'/')
    save(HERE/'TUNING_PAUSE.json',result);save(DATA/'TUNING_PAUSE.json',result)
    print(json.dumps(dict(tag=tag,update=result['latest']['updates'],sha256=result['latest']['sha256'])),flush=True)

def deploy():
    pause=read(HERE/'TUNING_PAUSE.json');tag=pause['tag']
    source=DATA/tag;source.mkdir(exist_ok=False)
    for name in ['encoder_pool.py','benchmark.py']:
        (source/name).write_text((HERE/name).read_text('utf-8'),'utf-8',newline='\n')
    save(source/'BENCHMARK_CONFIG.json',dict(sourceCheckpoint=REMOTE+'/work/training/'+pause['latest']['file'],sourceSha256=pause['latest']['sha256'],
        sourceUpdate=pause['latest']['updates'],engineeringOnly=True,promotable=False,configs=[[4,1],[4,2],[3,2],[2,2],[2,4],[4,4]],
        warmupUpdates=8,measuredUpdates=80,maxSampledWholeCpuPercent=70,targetAverageWholeCpuPercent=55))
    archive=source/'benchmark-code.tar'
    with tarfile.open(archive,'w',format=tarfile.GNU_FORMAT) as tar:
        for file in source.iterdir():
            if file.suffix in ['.py','.json']:tar.add(file,arcname=file.name)
    target=REMOTE+'/engineering/'+tag
    ssh('test ! -e '+target+' && mkdir -p '+target)
    scp(archive,target+'/benchmark-code.tar')
    assert ssh('shasum -a256 '+target+'/benchmark-code.tar').split()[0]==sha(archive)
    print(ssh('cd '+target+' && tar --no-same-owner -xf benchmark-code.tar && '+REMOTE+'/runtime/venv/bin/python -m compileall -q .'),flush=True)
    save(HERE/'TUNING_ENGINEERING.json',dict(tag=tag,remote=target,local=str(source)))

def benchmark():
    value=read(HERE/'TUNING_ENGINEERING.json');target=value['remote']
    command='cd '+target+' && OMNI_WORK='+REMOTE+'/work PYTHONPATH='+REMOTE+'/work OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=4 VECLIB_MAXIMUM_THREADS=4 '+REMOTE+'/runtime/venv/bin/python -u benchmark.py > benchmark.log 2>&1; code=$?; tail -12 '+target+'/benchmark.log; exit $code'
    output=ssh(command,timeout=1200);print(output,flush=True)
    result=json.loads(ssh('cat '+target+'/BENCHMARK_RESULT.json'));save(HERE/'TUNING_BENCHMARK.json',result);save(DATA/'TUNING_BENCHMARK.json',result)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['pause','deploy','benchmark']);args=parser.parse_args();globals()[args.action]()
