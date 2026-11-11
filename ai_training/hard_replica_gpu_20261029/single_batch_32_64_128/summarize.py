"""单批完整对局统计；原始逐步记录只做文件身份比较，不执行回放。"""
import csv
import hashlib
import json
from pathlib import Path
import statistics

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent

def read(path):return json.loads(path.read_text('utf-8-sig'))
def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def percentile(values,fraction):
    values=sorted(values);position=(len(values)-1)*fraction;lower=int(position);upper=min(lower+1,len(values)-1)
    return values[lower]+(values[upper]-values[lower])*(position-lower)

rows=[];sample_rows=[];traces={};shared_parity=[]
completions={r['workers']:r for r in [json.loads(line) for line in (HERE/'COMPLETIONS.jsonl').read_text('utf-8-sig').splitlines()]}
for workers in [32,64,128]:
    directory=ROOT/f'bench-single-batch-{workers}'
    run=read(directory/'RUN.json');p=read(directory/'PROGRESS.json');results=read(directory/'RESULTS.json')
    assert run['singleBatch'] and run['limit']==workers and run.get('maxActions') is None
    assert p['phase']=='complete' and p['maxActive']==workers and len(results)==workers
    assert all(r['attempt']==1 for r in results)
    samples=[json.loads(line) for line in (directory/'GPU_UTILIZATION.jsonl').read_text('utf-8').splitlines()]
    valid=[s for s in samples if s.get('available') and s.get('epoch',0)*1000>=p['measurementStartedAt']]
    assert valid,'GPU占用缺失，不能记作0'
    for s in valid:sample_rows.append([workers,s['epoch']-p['measurementStartedAt']/1000,s['processMaxEnginePercent'],s['adapterMaxEnginePercent'],s.get('throttleMs',0)])
    natural=sum(r['natural'] for r in results)
    status={name:sum(r['stop']==name for r in results) for name in sorted({r['stop'] for r in results})}
    slowest=max(results,key=lambda r:r['wallSeconds'])
    total_seconds=completions[workers]['processWallSeconds']
    rows.append(dict(workers=workers,launched=len(results),maxActive=p['maxActive'],natural=natural,status=status,totalSeconds=total_seconds,
                     batchSeconds=p['measuredSeconds'],startupIncludedSeconds=p['wallSeconds'],
                     naturalGamesPerMinute=natural/total_seconds*60,
                     estimatedSecondsFor128=128/natural*total_seconds if natural else None,
                     actions=sum(r['steps'] for r in results),gpuMean=statistics.mean(s['processMaxEnginePercent'] for s in valid),
                     sharedFirst32LastGameSeconds=max(r['wallSeconds'] for r in results if r['executionSequence']<=2032),
                     gpuP95=percentile([s['processMaxEnginePercent'] for s in valid],.95),
                     gpuPeak=max(s['processMaxEnginePercent'] for s in valid),gpuSamples=len(valid),
                     sampledSecondsRatio=min(1,len(valid)/p['measuredSeconds']),
                     adapterPeak=max(s['adapterMaxEnginePercent'] for s in valid),maxThrottleMs=max(s.get('throttleMs',0) for s in valid),
                     nodePeakRssGiB=p['maxRssBytes']/1024**3,
                     slowest=dict(sequence=slowest['executionSequence'],steps=slowest['steps'],seconds=slowest['wallSeconds'],stop=slowest['stop']),
                     gpuRangeSearches=p['gpu']['rangeRequests'],maxGpuBatch=p['gpu']['maxBatch']))
    for r in results:
        name=f"parent-{r['executionSequence']}/attempt-1/decisions.jsonl.gz"
        sha=digest(directory/name)
        previous=traces.get(r['executionSequence'])
        if previous is not None:
            assert previous==sha,'相同初态在不同并发中的轨迹不一致'
            shared_parity.append([workers,r['executionSequence']])
        traces[r['executionSequence']]=sha

with (HERE/'GPU_TIMESERIES.csv').open('w',encoding='utf-8-sig',newline='') as stream:
    writer=csv.writer(stream);writer.writerow(['并发数','批次已运行秒','任务GPU占用百分比','适配器最大引擎占用百分比','软限流毫秒']);writer.writerows(sample_rows)
report=dict(mode='每个worker仅一个完整对局，不补局，不设100步截断，保留冻结job异常保护',
            gpuMode='距离和落点评分加FIFO移动范围搜索',gpuMetric='PDH当前GPU服务进程最大引擎占用的有效逐秒样本',
            rows=rows,fastestBatch=min(rows,key=lambda r:r['totalSeconds'])['workers'],
            bestObservedThroughput=max(rows,key=lambda r:r['naturalGamesPerMinute'])['workers'],
            sharedTrajectoryChecks=len(shared_parity),sharedTrajectoryParity=True,
            caveat='每组局数不同且只测一批；吞吐是这批样本的实测，折算128局是估算，不代表另取同数新局的实测时间')
(HERE/'RESULTS.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
