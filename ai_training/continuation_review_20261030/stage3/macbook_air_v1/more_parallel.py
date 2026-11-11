"""补测3编码worker和6计算线程；独立工程记录，不覆盖上一轮证据。"""
import argparse
import json
import shlex
import tarfile
import time
from device import HERE,DATA,REMOTE,ssh,scp,save
from prepare_inputs import read,sha

def pause():
    ssh('cd '+REMOTE+' && touch work/STOP')
    code='''import pathlib,json,time,os
r=pathlib.Path(ROOT);pid=json.loads((r/'TRAINER_IDENTITY.json').read_text())['pid']
for _ in range(40):
 try:os.kill(pid,0)
 except ProcessLookupError:break
 time.sleep(.5)
else:raise RuntimeError('完整更新暂停超时，不强杀')
p=json.loads((r/'work/training/PROGRESS.json').read_text());c=json.loads((r/'work/training/LATEST.json').read_text())
assert p['phase']=='paused' and p['update']==c['updates'] and c['reason']=='user_stop'
print(json.dumps(dict(progress=p,checkpoint=c)))
'''.replace('ROOT',repr(REMOTE))
    result=json.loads(ssh('cd '+REMOTE+' && runtime/venv/bin/python -c '+shlex.quote(code),timeout=40))
    result['tag']='more-parallel-'+str(result['checkpoint']['updates'])+'-'+str(time.time_ns())
    result['sourceContractSha256']=ssh('shasum -a256 '+REMOTE+'/work/MAC_CONTRACT.json').split()[0]
    target=REMOTE+'/revisions/'+result['tag']
    ssh('test ! -e '+target+' && mkdir -p '+target+'/work '+target+'/training && cp '+REMOTE+'/work/*.py '+REMOTE+'/work/MAC_RUNTIME.json '+REMOTE+'/work/MAC_CONTRACT.json '+target+'/work/ && cp '+REMOTE+'/controller.py '+target+'/ && cp '+REMOTE+'/work/training/last.bin '+REMOTE+'/work/training/last.json '+REMOTE+'/work/training/RESULT.json '+REMOTE+'/work/training/LATEST.json '+target+'/training/')
    save(HERE/'MORE_PAUSE.json',result);save(DATA/'MORE_PAUSE.json',result)
    print(json.dumps(dict(update=result['checkpoint']['updates'],tag=result['tag'])),flush=True)

def deploy():
    paused=read(HERE/'MORE_PAUSE.json');tag=paused['tag'];source=DATA/tag;source.mkdir(exist_ok=False)
    pool=(HERE/'encoder_pool.py').read_text('utf-8')
    assert 'size=32//self.workers' in pool
    pool=pool.replace('workers not in [1,2,4]','workers not in [1,2,3,4]').replace('编码worker仅支持1、2、4','编码worker仅支持1、2、3、4')
    pool=pool.replace('        size=32//self.workers\n','        # 任意worker数按连续区间划分，合并后仍保持32个原始请求顺序。\n')
    pool=pool.replace('requests[index*size:(index+1)*size]','requests[index*32//self.workers:(index+1)*32//self.workers]')
    (source/'encoder_pool.py').write_text(pool,'utf-8',newline='\n')
    bench=(HERE/'benchmark.py').read_text('utf-8')
    bench=bench.replace("r['threads']==4 and r['workers']==1","r['threads']==2 and r['workers']==2")
    bench=bench.replace("if record['threads']==4:","if record['threads']==baseline['threads']:")
    (source/'benchmark.py').write_text(bench,'utf-8',newline='\n')
    save(source/'BENCHMARK_CONFIG.json',dict(sourceCheckpoint=REMOTE+'/work/training/'+paused['checkpoint']['file'],sourceSha256=paused['checkpoint']['sha256'],
        sourceUpdate=paused['checkpoint']['updates'],engineeringOnly=True,promotable=False,configs=[[2,2],[2,3],[3,3],[4,3],[6,2],[6,3]],
        warmupUpdates=8,measuredUpdates=80,maxSampledWholeCpuPercent=70,targetAverageWholeCpuPercent=55))
    archive=source/'engineering-more.tar'
    with tarfile.open(archive,'w',format=tarfile.GNU_FORMAT) as tar:
        for file in source.iterdir():
            if file.suffix in ['.py','.json']:tar.add(file,arcname=file.name)
    target=REMOTE+'/engineering/'+tag;ssh('test ! -e '+target+' && mkdir -p '+target);scp(archive,target+'/engineering-more.tar')
    assert ssh('shasum -a256 '+target+'/engineering-more.tar').split()[0]==sha(archive)
    ssh('cd '+target+' && tar --no-same-owner -xf engineering-more.tar')
    save(HERE/'MORE_ENGINEERING.json',dict(tag=tag,local=str(source),remote=target))

def benchmark():
    target=read(HERE/'MORE_ENGINEERING.json')['remote']
    output=ssh('cd '+target+' && OMNI_WORK='+REMOTE+'/work PYTHONPATH='+REMOTE+'/work OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=2 VECLIB_MAXIMUM_THREADS=2 '+REMOTE+'/runtime/venv/bin/python -u benchmark.py > benchmark.log 2>&1; code=$?; tail -12 '+target+'/benchmark.log; exit $code',timeout=1200)
    print(output,flush=True)
    result=json.loads(ssh('cat '+target+'/BENCHMARK_RESULT.json'));save(HERE/'MORE_BENCHMARK.json',result);save(DATA/'MORE_BENCHMARK.json',result)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['pause','deploy','benchmark']);args=parser.parse_args();globals()[args.action]()
