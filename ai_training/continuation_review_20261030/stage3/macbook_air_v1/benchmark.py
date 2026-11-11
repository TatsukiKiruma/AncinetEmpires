"""固定同一暂停点和请求顺序的工程A/B；工程模型禁止晋升正式训练。"""
import argparse
import ctypes
import json
import os
from pathlib import Path
import statistics
import subprocess
import sys
import threading
import time

HERE=Path(__file__).resolve().parent

def read(path):return json.loads(Path(path).read_text('utf-8'))
def save(path,value):Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2),'utf-8')

class CpuSampler:
    def __init__(self,pids):
        self.pids=pids;self.samples=[];self.stop=threading.Event();self.high=0
        self.lib=ctypes.CDLL('/usr/lib/libSystem.B.dylib')
        self.lib.mach_host_self.restype=ctypes.c_uint
    def ticks(self):
        data=(ctypes.c_uint*4)();count=ctypes.c_uint(4)
        status=self.lib.host_statistics(self.lib.mach_host_self(),3,data,ctypes.byref(count))
        if status:raise RuntimeError('无法读取整机CPU计数')
        return list(data)
    def run(self):
        before=self.ticks()
        while not self.stop.wait(.5):
            after=self.ticks();delta=[(b-a)%2**32 for a,b in zip(before,after)];before=after
            usage=(1-delta[2]/max(1,sum(delta)))*100
            raw=subprocess.run(['/bin/ps','-p',','.join(map(str,self.pids)),'-o','rss='],capture_output=True,text=True).stdout
            rss=sum(int(s) for s in raw.split())*1024
            self.samples.append(dict(wholeCpuPercent=usage,rssBytes=rss,epoch=time.time()))
            self.high=self.high+1 if usage>75 else 0
    def start(self):self.thread=threading.Thread(target=self.run,daemon=True);self.thread.start()
    def close(self):self.stop.set();self.thread.join(timeout=5)

def case(threads,workers,folder):
    import copy
    from concurrent.futures import ThreadPoolExecutor
    import random
    import torch
    from mac_core import WORK,read as core_read,sha,instantiate,update,tensor_digest,snapshot,validate,cpu_tree,resource
    from sampler_mobile import MobileSampler
    from encoder_pool import EncoderPool
    cfg=read(HERE/'BENCHMARK_CONFIG.json');folder=Path(folder);folder.mkdir(exist_ok=False)
    assert sha(cfg['sourceCheckpoint'])==cfg['sourceSha256']
    original=torch.load(cfg['sourceCheckpoint'],map_location='cpu',weights_only=False)
    science=core_read(WORK/'SCIENCE_CONFIG.json');contract=validate()
    torch.set_num_interop_threads(1)
    model,optimizer,scheduler,restore=instantiate(original,science,torch.device('cpu'));torch.set_num_threads(threads)
    sampler=MobileSampler(WORK,science['seed']);sampler.load_state_dict(original['sampler'])
    dropout=random.Random(0);dropout.setstate(original['dropoutRng'])
    encoder=EncoderPool(folder,workers);prefetch=ThreadPoolExecutor(max_workers=1)
    def prepare():
        preview=copy.copy(sampler);preview.rng=random.Random(0);preview.load_state_dict(sampler.state_dict())
        request=preview.effective_batch()
        return prefetch.submit(encoder.rows,request),preview.state_dict()
    pending=prepare();digests=[];measured=[];meter=None;start=None
    total=cfg['warmupUpdates']+cfg['measuredUpdates']
    try:
        for index in range(total):
            tick=time.monotonic();job,next_state=pending;rows=job.result(timeout=320)
            digests.append(tensor_digest({str(i):row for i,row in enumerate(rows)}))
            sampler.load_state_dict(next_state)
            pending=prepare() if index+1<total else None
            wait=time.monotonic()-tick
            u=cfg['sourceUpdate']+index+1
            result=update(model,optimizer,scheduler,rows,torch.device('cpu'),dropout,u,science)
            if index==0:
                torch.save(torch.cat([p.grad.flatten().detach().cpu() for p in model.parameters()]),folder/'FIRST_GRADIENT.pt')
            if index==cfg['warmupUpdates']-1:
                meter=CpuSampler([os.getpid()]+[p.process.pid for p in encoder.encoders]);meter.start();start=time.monotonic()
            if index>=cfg['warmupUpdates']:
                measured.append(dict(update=u,seconds=time.monotonic()-tick,encoderWaitSeconds=wait,**result))
                if meter.high>=4:raise RuntimeError('整机CPU连续超过75%，该配置退出以避免持续高占用')
                if index%10==0 and resource()['thermalState']>=2:raise RuntimeError('出现严重热压力，该配置退出')
        elapsed=time.monotonic()-start;meter.close()
        state=snapshot(model,optimizer,scheduler,sampler,dropout,u,science,contract,[])
        state.update(engineeringOnly=True,promotable=False,benchmarkThreads=threads,benchmarkWorkers=workers)
        torch.save(state,folder/'ENGINEERING_ONLY.pt')
        loads=[x['wholeCpuPercent'] for x in meter.samples];rss=[x['rssBytes'] for x in meter.samples]
        result=dict(passed=True,threads=threads,workers=workers,measuredUpdates=cfg['measuredUpdates'],seconds=elapsed,
            secondsPerUpdate=elapsed/cfg['measuredUpdates'],updatesPerSecond=cfg['measuredUpdates']/elapsed,
            averageWholeCpuPercent=statistics.mean(loads),p95WholeCpuPercent=sorted(loads)[min(len(loads)-1,int(len(loads)*.95))],
            peakWholeCpuPercent=max(loads),peakRssBytes=max(rss),encoderWaitSecondsPerUpdate=statistics.mean(r['encoderWaitSeconds'] for r in measured),
            dataDigests=digests,modelDigest=tensor_digest(state['model']),optimizerDigest=tensor_digest(state['optimizer']),
            samplerDigest=tensor_digest(state['sampler']),dropoutState=repr(dropout.getstate()),
            restore=restore,engineeringOnly=True,formalUpdates=0,sealedAccess=0,folder=str(folder),cpuSamples=meter.samples,resource=resource())
        save(folder/'RESULT.json',result)
    finally:
        if meter:meter.close()
        encoder.close();prefetch.shutdown(wait=True,cancel_futures=True)

def main():
    cfg=read(HERE/'BENCHMARK_CONFIG.json');results=[]
    for threads,workers in cfg['configs']:
        folder=HERE/f'case-t{threads}-w{workers}'
        log=HERE/f'case-t{threads}-w{workers}.log'
        environment=dict(os.environ,OMP_NUM_THREADS=str(threads),VECLIB_MAXIMUM_THREADS=str(threads))
        with log.open('wb') as output:
            result=subprocess.run([sys.executable,str(Path(__file__).resolve()),'--case',str(threads),str(workers),'--folder',str(folder)],
                cwd=HERE,env=environment,stdout=output,stderr=output,timeout=300)
        if result.returncode:
            record=dict(passed=False,threads=threads,workers=workers,error=log.read_text('utf-8')[-3000:]);results.append(record)
            print(json.dumps(record),flush=True);continue
        record=read(folder/'RESULT.json');results.append(record)
        print(json.dumps({k:record[k] for k in ['passed','threads','workers','secondsPerUpdate','averageWholeCpuPercent','p95WholeCpuPercent','peakRssBytes']}),flush=True)
    baseline=next(r for r in results if r['passed'] and r['threads']==4 and r['workers']==1)
    import torch
    reference=torch.load(Path(baseline['folder'])/'FIRST_GRADIENT.pt',weights_only=False)
    for record in results:
        if not record['passed']:continue
        assert record['dataDigests']==baseline['dataDigests'],'编码样本或顺序变化'
        assert record['samplerDigest']==baseline['samplerDigest'] and record['dropoutState']==baseline['dropoutState'],'采样或dropout顺序变化'
        gradient=torch.load(Path(record['folder'])/'FIRST_GRADIENT.pt',weights_only=False)
        relative=float((gradient-reference).double().norm()/reference.double().norm())
        assert relative<1e-4,(record['threads'],record['workers'],relative)
        record['firstGradientRelativeL2']=relative
        if record['threads']==4:
            assert record['modelDigest']==baseline['modelDigest'] and record['optimizerDigest']==baseline['optimizerDigest'],'同线程worker对照未逐位一致'
            record['full88UpdatesModelOptimizerBitwiseExact']=True
        record['inputOrderExact']=True
    eligible=[r for r in results if r['passed'] and r['averageWholeCpuPercent']<=55 and r['p95WholeCpuPercent']<=70 and r['resource']['thermalState']<2]
    assert eligible,'没有满足CPU余量要求的配置'
    fastest=min(r['secondsPerUpdate'] for r in eligible)
    near=[r for r in eligible if r['secondsPerUpdate']<=fastest*1.10]
    chosen=min(near,key=lambda r:(r['averageWholeCpuPercent'],r['peakRssBytes'],r['workers']))
    result=dict(passed=True,sourceCheckpointSha256=cfg['sourceSha256'],sourceUpdate=cfg['sourceUpdate'],results=results,
        chosen={k:chosen[k] for k in ['threads','workers','secondsPerUpdate','averageWholeCpuPercent','p95WholeCpuPercent','peakRssBytes','firstGradientRelativeL2']},
        choiceRule='整机平均≤55%、P95≤70%；距离最快合格配置不超过10%时选择CPU占用更低者',
        formalUpdates=0,engineeringStatesPromotable=False,sealedAccess=0)
    save(HERE/'BENCHMARK_RESULT.json',result);print(json.dumps(dict(chosen=result['chosen'],passed=True)),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--case',nargs=2,type=int);parser.add_argument('--folder');args=parser.parse_args()
    case(*args.case,args.folder) if args.case else main()
