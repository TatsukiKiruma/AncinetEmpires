"""仅比较本轮新采集文件摘要并汇总测量，不执行任何对局回放。"""
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
def read(path): return json.loads(path.read_text('utf-8'))
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def percentile(values, q):
    values = sorted(values)
    return values[max(0, math.ceil(len(values)*q)-1)] if values else None
def gpu_summary(samples):
    valid = [s['processMaxEnginePercent'] for s in samples if s.get('available')]
    adapter = [s['adapterMaxEnginePercent'] for s in samples if s.get('available')]
    return dict(samples=len(samples), valid=len(valid), unknown=len(samples)-len(valid), average=sum(valid)/len(valid) if valid else None, p95=percentile(valid,.95), peak=max(valid) if valid else None,adapterAverage=sum(adapter)/len(adapter) if adapter else None,adapterPeak=max(adapter) if adapter else None)

def summarize(name):
    directory=ROOT/name
    progress=read(directory/'PROGRESS.json'); run=read(directory/'RUN.json'); results=read(directory/'RESULTS.json'); device=read(directory/'DEVICE.json'); measurement=read(directory/'CPU_GPU_MEASUREMENT.json')
    assert progress['phase']=='complete' and len(results)==32 and all(r['natural'] and r['stop']=='natural' for r in results)
    assert run['singleBatch'] and run['workers']==32 and run['limit']==32 and not run.get('maxActions') and not run['verify']
    assert sorted(r['executionSequence'] for r in results)==list(range(2001,2033))
    series=[json.loads(line) for line in (directory/'CPU_TIMESERIES.jsonl').read_text('utf-8').splitlines()]
    gpu=[json.loads(line) for line in (directory/'EXTERNAL_GPU.jsonl').read_text('utf-8').splitlines()]
    begin=progress['measurementStartedAt']/1000; end=begin+progress['measuredSeconds']
    phase_gpu=[s for s in gpu if begin<=s.get('epoch',0)<=end]
    processes=measurement['processes']; node=[p for p in processes if p['name'].lower()=='node.exe']; service=[p for p in processes if p['name'].lower()=='python.exe']
    cpu=sum(p['cpuSeconds'] for p in node+service); logical=measurement['logicalProcessors']; wall=measurement['totalWallSeconds']
    peak=max(sum(p['normalizedPercent'] for p in s['processes'] if p['name'].lower() in ('node.exe','python.exe')) for s in series)
    background=[]
    for s in series[1:]: background.append(max(0.,s['systemCpuPercent']-sum(p['normalizedPercent'] for p in s['processes'])))
    native_queries={k:sum(r.get('nativeQueries',{}).get(k,0) for r in results) for k in ['movementInput','averageDistance','threat']} if name.startswith('candidate') else None
    return dict(name=name,natural=32,actions=sum(r['steps'] for r in results),totalWallSeconds=wall,phaseWallSeconds=progress['measuredSeconds'],runtimeWallSeconds=progress['wallSeconds'],maxActive=progress['maxActive'],nodeCpuSeconds=sum(p['cpuSeconds'] for p in node),separateGpuServiceCpuSeconds=sum(p['cpuSeconds'] for p in service),combinedCpuSeconds=cpu,averageCores=cpu/wall,averageNormalizedCpuPercent=cpu/wall/logical*100,peakNormalizedCpuPercent=peak,nodePeakRssBytes=max(p['peakRss'] for p in node),separateGpuServicePeakRssBytes=max((p['peakRss'] for p in service),default=0),hipThreadCpuSecondsSubset=progress['gpu'].get('gpuCpuSeconds'),systemAverageCpuPercent=measurement['systemCpuAveragePercent'],systemPeakCpuPercent=measurement['systemCpuPeakPercent'],backgroundAverageCpuPercent=sum(background)/len(background),gpuFull=gpu_summary(gpu),gpuPhase=gpu_summary(phase_gpu),gpuApproxPhaseCoveragePercent=len([s for s in phase_gpu if s.get('available')])/progress['measuredSeconds']*100,device=device,requests=progress['gpu']['requests'],batches=progress['gpu']['batches'],maxBatch=progress['gpu']['maxBatch'],scoreCandidates=progress['gpu']['candidates'],rangeRequests=progress['gpu']['rangeRequests'],gpuMilliseconds=progress['gpu']['gpuMs'],serviceSeconds=progress['gpu']['serviceSeconds'],nativeQueries=native_queries,inputSha256=run['identity']['jobsSha256'],sources=run['identity']['sources'],sourceIdentitySha256=digest(directory/'RUN.json'),measurementSha256=digest(directory/'CPU_GPU_MEASUREMENT.json'))

a=summarize('baseline_full'); b=summarize(sys.argv[1] if len(sys.argv)>1 else 'candidate_full_v2')
assert a['inputSha256']==b['inputSha256']
assert a['device']['kernelSha256']==b['device']['kernelSha256']
for filename in ['src/game/engine.ts','src/game/rules.ts','ai_training/gpu/hard_jobs.ts','ai_training/gpu/hard_score.hip','ai_training/gpu/parallel/range.hip']:
    assert a['sources'][filename]==b['sources'][filename],filename
for filename,sha in b['sources'].items():
    assert digest(REPO/filename)==sha,('候选源码已改变',filename)
checks=[]
for seq in range(2001,2033):
    left=ROOT/'baseline_full'/f'parent-{seq}'/'attempt-1';right=ROOT/b['name']/f'parent-{seq}'/'attempt-1'
    item=dict(sequence=seq,files={})
    for filename in ['job.json','initial.json','final.json','decisions.jsonl.gz']:
        x=digest(left/filename);y=digest(right/filename);assert x==y,(seq,filename,x,y);item['files'][filename]=x
    lr=read(left/'result.json');rr=read(right/'result.json')
    for key in ['steps','stop','natural','winner','finalSha256','telemetry']: assert lr[key]==rr[key],(seq,key)
    item['actions']=lr['steps'];checks.append(item)
verification=read(ROOT/('verify_final_current' if b['name']!='candidate_full' else 'verify_32_current')/'RESULTS.json')
assert len(verification)==32 and all(not r['error'] for r in verification)
for r in verification:
    assert all(c['actual']==c['shadow'] for c in r['randomStreamCounts'].values())
comparison=dict(baseline=a,candidate=b,totalWallReductionPercent=(1-b['totalWallSeconds']/a['totalWallSeconds'])*100,phaseWallReductionPercent=(1-b['phaseWallSeconds']/a['phaseWallSeconds'])*100,cpuSecondsReductionPercent=(1-b['combinedCpuSeconds']/a['combinedCpuSeconds'])*100,averageCpuPercentagePointChange=b['averageNormalizedCpuPercent']-a['averageNormalizedCpuPercent'],speedup=a['totalWallSeconds']/b['totalWallSeconds'],verification=dict(parents=32,actions=sum(r['steps'] for r in verification),natural=sum(r['natural'] for r in verification),truncated=sum(not r['natural'] for r in verification),randomStreamsEqual=True,nativeQueries={k:sum(r['nativeQueries'][k] for r in verification) for k in ['movementInput','averageDistance','threat']}),traceIdentity=dict(parents=32,actions=sum(i['actions'] for i in checks),allFilesByteIdentical=True,historicalReplayExecuted=False),monitorSourceSha256=digest(REPO/'ai_training/gpu/native/benchmark.py'))
(ROOT/'TRACE_IDENTITY.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
(ROOT/'COMPARISON.json').write_text(json.dumps(comparison,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in comparison.items() if k not in ['baseline','candidate']},ensure_ascii=False))
