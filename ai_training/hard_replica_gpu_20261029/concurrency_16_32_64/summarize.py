"""汇总逐秒GPU采样及独立新对局文件身份；不执行历史动作。"""
import hashlib
import json
from pathlib import Path
import statistics

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def read(path):
    return json.loads(path.read_text('utf-8-sig'))


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def percentile(values, fraction):
    data = sorted(values)
    position = (len(data)-1)*fraction
    lower = int(position)
    upper = min(lower+1, len(data)-1)
    return data[lower] + (data[upper]-data[lower])*(position-lower)


rows = []
baseline = None
for workers in (16, 32, 64):
    for repeat in (1, 2):
        directory = ROOT / f'bench-concurrency-{workers}-r{repeat}'
        progress = read(directory/'PROGRESS.json')
        results = read(directory/'RESULTS.json')
        assert progress['phase'] == 'complete' and progress['errors'] == 0
        assert progress['maxActive'] == workers and len(results) == 100
        samples = [json.loads(line) for line in (directory/'GPU_UTILIZATION.jsonl').read_text('utf-8').splitlines()]
        valid = [s for s in samples if s.get('available') and s.get('epoch', 0)*1000 >= progress['measurementStartedAt']]
        assert valid, '没有有效GPU占用样本，不能记为0%'
        utilization = [s['processMaxEnginePercent'] for s in valid]
        identities = {r['executionSequence']: digest(directory/f"parent-{r['executionSequence']}"/f"attempt-{r['attempt']}"/'decisions.jsonl.gz') for r in results}
        if baseline is None:
            baseline = identities
        assert identities == baseline, '不同并发的逐步记录身份不同'
        total_steps = sum(r['steps'] for r in results)
        gpu = progress['gpu']
        rows.append(dict(workers=workers, repeat=repeat, directory=directory.name,
                         seconds=progress['measuredSeconds'], wallSeconds=progress['wallSeconds'],
                         steps=total_steps, stepsPerSecond=total_steps/progress['measuredSeconds'],
                         natural=sum(r['natural'] for r in results), maxActive=progress['maxActive'],
                         nodePeakRssGiB=progress['maxRssBytes']/1024**3,
                         gpuSamples=len(valid), gpuMean=statistics.mean(utilization),
                         gpuP95=percentile(utilization, .95), gpuPeak=max(utilization),
                         adapterPeak=max(s['adapterMaxEnginePercent'] for s in valid),
                         maxThrottleMs=max(s.get('throttleMs', 0) for s in valid),
                         gpuRequests=gpu['requests'], batches=gpu['batches'],
                         meanBatch=gpu['requests']/gpu['batches'], maxBatch=gpu['maxBatch']))

groups = []
for workers in (16, 32, 64):
    group = [r for r in rows if r['workers'] == workers]
    groups.append(dict(workers=workers, meanSeconds=statistics.mean(r['seconds'] for r in group),
                       meanStepsPerSecond=statistics.mean(r['stepsPerSecond'] for r in group),
                       gpuMean=sum(r['gpuMean']*r['gpuSamples'] for r in group)/sum(r['gpuSamples'] for r in group),
                       gpuPeak=max(r['gpuPeak'] for r in group),
                       nodePeakRssGiB=max(r['nodePeakRssGiB'] for r in group)))
report = dict(trajectoryParity=True, independentRuns=6, jobsPerRun=100, maxActionsPerJob=100,
              productionRemainsStopped=True, gpuMetric='Windows PDH当前GPU服务进程的最大引擎占用；仅计算采集计时区间内的有效逐秒样本',
              sampling='均值按有效样本等权；单次采样近似1秒，时间序列保留在每个运行的GPU_UTILIZATION.jsonl',
              groups=groups, runs=rows)
(HERE/'RESULTS.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
