"""汇总扩展GPU搜索的有效计时区间占用。"""
import json
from pathlib import Path
import statistics

here=Path(__file__).resolve().parent
runs=[]
for workers in [16,32,64]:
    directory=here.parent/f'bench-range{workers}-compact'
    p=json.loads((directory/'PROGRESS.json').read_text('utf-8'))
    assert p['phase']=='complete' and p['errors']==0
    samples=[json.loads(line) for line in (directory/'GPU_UTILIZATION.jsonl').read_text('utf-8').splitlines()]
    valid=[s for s in samples if s.get('available') and s.get('epoch',0)*1000>=p['measurementStartedAt']]
    assert valid
    runs.append(dict(workers=workers,seconds=p['measuredSeconds'],wallSeconds=p['wallSeconds'],
                     gpuMean=statistics.mean(s['processMaxEnginePercent'] for s in valid),
                     gpuPeak=max(s['processMaxEnginePercent'] for s in valid),samples=len(valid),
                     maxThrottleMs=max(s.get('throttleMs',0) for s in valid),
                     rangeSearches=p['gpu']['rangeRequests'],maxBatch=p['gpu']['maxBatch'],
                     nodePeakRssGiB=p['maxRssBytes']/1024**3))
output=dict(jobsPerRun=100,maxActionsPerJob=100,repeats=1,runs=runs)
(here/'RANGE_RESULTS.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(output,ensure_ascii=False,indent=2))
