"""只对本轮新记录做流式摘要比较，汇总完整A/B及逻辑I/O，不回放规则。"""
import gzip
import hashlib
import json
import math
import sys
from pathlib import Path
DIR=Path(__file__).resolve().parent
REPO=DIR.parents[2]
def read(file):return json.loads(file.read_text('utf-8-sig'))
def digest(file):
    value=hashlib.sha256()
    with file.open('rb') as stream:
        while block:=stream.read(1024*1024):value.update(block)
    return value.hexdigest()
def decoded(file):
    value=hashlib.sha256();length=lines=0
    with gzip.open(file,'rb') as stream:
        while block:=stream.read(1024*1024):value.update(block);length+=len(block);lines+=block.count(b'\n')
    return dict(sha256=value.hexdigest(),bytes=length,lines=lines)
def gpu_summary(samples):
    valid=sorted(s['processMaxEnginePercent'] for s in samples if s.get('available'))
    return dict(validSamples=len(valid),unknownSamples=len(samples)-len(valid),averagePercent=sum(valid)/len(valid) if valid else None,p95Percent=valid[math.ceil(len(valid)*.95)-1] if valid else None,peakPercent=max(valid) if valid else None)
def summarize(name):
    folder=DIR/name;run=read(folder/'RUN.json');progress=read(folder/'PROGRESS.json');results=read(folder/'RESULTS.json');measurement=read(folder/'CPU_GPU_MEASUREMENT.json')
    assert run['singleBatch'] and run['workers']==32 and run['limit']==32 and not run.get('maxActions') and not run['verify']
    assert progress['phase']=='complete' and progress['maxActive']==32 and len(results)==32 and all(r['natural'] and not r['error'] for r in results)
    assert sorted(r['executionSequence'] for r in results)==list(range(2001,2033))
    node=[p for p in measurement['processes'] if p['name'].lower()=='node.exe'];cpu=sum(p['cpuSeconds'] for p in node);wall=measurement['totalWallSeconds'];logical=measurement['logicalProcessors'];peak=max(p['peakRss'] for p in node)
    samples=[json.loads(line) for line in (folder/'CPU_TIMESERIES.jsonl').read_text('utf-8').splitlines()]
    gpu=[json.loads(line) for line in (folder/'EXTERNAL_GPU.jsonl').read_text('utf-8').splitlines()];begin=progress['measurementStartedAt']/1000;end=begin+progress['measuredSeconds'];phase_gpu=[s for s in gpu if begin<=s.get('epoch',0)<=end]
    io={key:sum(p['io'].get(key,0) for p in node) for key in ['readOperations','writeOperations','otherOperations','readBytes','writeBytes','otherBytes']}
    recording=dict(records=sum(r['steps'] for r in results),compressedBytes=sum((folder/f"parent-{r['executionSequence']}/attempt-1/decisions.jsonl.gz").stat().st_size for r in results),appendOperations=sum(r.get('recording',{}).get('members',r['steps']) for r in results),fileOpens=sum(r.get('recording',{}).get('fileOpens',r['steps']) for r in results))
    raw={k:sum(r.get('recording',{}).get(k,0) for r in results) for k in ['rawBytes','peakPendingBytes']}
    background=[max(0.,s['systemCpuPercent']-sum(p['normalizedPercent'] for p in s['processes'])) for s in samples[1:]]
    return dict(name=name,natural=32,actions=recording['records'],totalWallSeconds=wall,phaseWallSeconds=progress['measuredSeconds'],cpuSeconds=cpu,averageCores=cpu/wall,averageCpuPercent=cpu/wall/logical*100,peakCpuPercent=max(sum(p['normalizedPercent'] for p in s['processes'] if p['name'].lower()=='node.exe') for s in samples),nodePeakRssBytes=peak,systemAverageCpuPercent=measurement['systemCpuAveragePercent'],systemPeakCpuPercent=measurement['systemCpuPeakPercent'],backgroundAverageCpuPercent=sum(background)/len(background),io=io,recording=recording,gpuPhase=gpu_summary(phase_gpu),gpuApproxSampleCoveragePercent=len([s for s in phase_gpu if s.get('available')])/progress['measuredSeconds']*100,gpu=progress['gpu'],nativeQueries={k:sum(r.get('nativeQueries',{}).get(k,0) for r in results) for k in ['movementInput','averageDistance','threat','packDistanceField']},cacheStats=[r.get('cacheStats') for r in results],assets=read(folder/'ASSET_IO.json') if (folder/'ASSET_IO.json').exists() else {'mapFileReadOperations':64,'mapFileReadBytes':None,'workersReadSharedMemory':False},workerCode=read(folder/'WORKER_CODE_IO.json') if (folder/'WORKER_CODE_IO.json').exists() else None,device=read(folder/'DEVICE.json'),runSha256=digest(folder/'RUN.json'),inputSha256=run['identity']['jobsSha256'],sources=run['identity']['sources'])
a=summarize('baseline_full');b=summarize(sys.argv[1] if len(sys.argv)>1 else 'candidate_full')
assert a['inputSha256']==b['inputSha256']
for file in ['src/game/engine.ts','src/game/rules.ts','ai_training/gpu/hard_score.hip','ai_training/gpu/parallel/range.hip','ai_training/gpu/native/hip.cpp','ai_training/gpu/native/build/kernel.hip','ai_training/gpu/native/build/hard_native.node']:assert a['sources'][file]==b['sources'][file]
for file,expected in b['sources'].items():assert digest(REPO/file)==expected,('候选源码改变',file)
checks=[];raw_bytes=0
for seq in range(2001,2033):
    left=DIR/a['name']/f'parent-{seq}/attempt-1';right=DIR/b['name']/f'parent-{seq}/attempt-1';item=dict(sequence=seq,files={})
    for file in ['job.json','initial.json','final.json']:
        x=digest(left/file);y=digest(right/file);assert x==y,(seq,file);item['files'][file]=x
    x=decoded(left/'decisions.jsonl.gz');y=decoded(right/'decisions.jsonl.gz');assert x==y,(seq,'解压后的记录不同');item['records']=x;raw_bytes+=x['bytes']
    lr=read(left/'result.json');rr=read(right/'result.json')
    for key in ['steps','stop','natural','winner','finalSha256','telemetry']:assert lr[key]==rr[key],(seq,key)
    assert x['lines']==lr['steps'];checks.append(item)
assert sum(c['records']['lines'] for c in checks)==44310
verification=read(DIR/'verify_current/RESULTS.json');assert len(verification)==32 and all(not r['error'] for r in verification)
for r in verification:assert all(s['actual']==s['shadow'] for s in r['randomStreamCounts'].values())
reduction=lambda old,new:(1-new/old)*100
comparison=dict(baseline=a,candidate=b,changes=dict(totalWallReductionPercent=reduction(a['totalWallSeconds'],b['totalWallSeconds']),phaseWallReductionPercent=reduction(a['phaseWallSeconds'],b['phaseWallSeconds']),cpuSecondsReductionPercent=reduction(a['cpuSeconds'],b['cpuSeconds']),rssReductionPercent=reduction(a['nodePeakRssBytes'],b['nodePeakRssBytes']),readOperationsReductionPercent=reduction(a['io']['readOperations'],b['io']['readOperations']),writeOperationsReductionPercent=reduction(a['io']['writeOperations'],b['io']['writeOperations']),readBytesReductionPercent=reduction(a['io']['readBytes'],b['io']['readBytes']),writeBytesReductionPercent=reduction(a['io']['writeBytes'],b['io']['writeBytes']),recordAppendReductionPercent=reduction(a['recording']['appendOperations'],b['recording']['appendOperations']),recordBytesReductionPercent=reduction(a['recording']['compressedBytes'],b['recording']['compressedBytes'])),traceIdentity=dict(parents=32,actions=44310,decodedBytesEachArm=raw_bytes,decodedRecordsByteIdentical=True,historicalReplayExecuted=False),verification=dict(parents=32,actions=sum(r['steps'] for r in verification),natural=sum(r['natural'] for r in verification),errors=0,randomStreamsEqual=True),monitorSourceSha256=digest(REPO/'ai_training/gpu/native/benchmark.py'),physicalDiskIoMeasured=False)
(DIR/'TRACE_IDENTITY.json').write_text(json.dumps(checks,indent=2),encoding='utf-8');(DIR/'COMPARISON.json').write_text(json.dumps(comparison,indent=2),encoding='utf-8')
print(json.dumps({k:comparison[k] for k in ['changes','traceIdentity','verification']},ensure_ascii=False))
