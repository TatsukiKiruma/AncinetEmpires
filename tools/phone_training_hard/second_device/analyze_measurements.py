"""从冻结原始采样重算真实并发，排除已经退出但缓存STATE仍标为running的尝试。"""
from pathlib import Path
import json
import sys
from device import TASK
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import concurrency_metrics as metrics


def actual(sample):
    count=0
    for root in sample['roots'].values():
        if not root or not root.get('attempt'):
            continue
        process=sample['processes'].get(str(root.get('appPid','')),{}).get('cpu')
        if not process or process['state'] in {'Z','X','x'}:
            continue
        if any('/'+root['attempt']+'/STATE.json' in path and state.get('phase')=='running' and state.get('stage')=='collecting'
               for path,state in sample['attemptStates'].items()):
            count+=1
    return count


def main():
    reports=[]
    for directory in sorted((TASK/'measurements').iterdir()):
        samples=[json.loads(p.read_text(encoding='utf-8')) for p in sorted(directory.glob('sample-*.json'))]
        if not samples:
            continue
        declared=int(directory.name[-1]);intervals=[];stable=[];consecutive=longest=0
        counts=[actual(s) for s in samples]
        for i in range(1,len(samples)):
            value=metrics.interval(samples[i-1],samples[i])
            value['actualWorkersAtEndpoints']=counts[i-1:i+1]
            value['limitAtEndpoints']=[s['masterState']['activeLimit'] for s in samples[i-1:i+1]]
            intervals.append(value)
            if value['actualWorkersAtEndpoints']==[declared,declared] and value['limitAtEndpoints']==[declared,declared]:
                stable.append(value);consecutive+=value['seconds'];longest=max(longest,consecutive)
            else:
                consecutive=0
        summary=metrics.summarize(samples,intervals,declared)
        seconds=sum(i['seconds'] for i in stable)
        ticks=sum(i['cpuTotalTicksDelta'] for i in stable)
        summary.update({'directory':str(directory),'actualWorkerSamples':counts,'activeLimitSamples':[s['masterState']['activeLimit'] for s in samples],
                        'stableTargetSeconds':seconds,'longestConsecutiveTargetSeconds':longest,
                        'stableTargetActionsPerSecond':sum(i['actionsDelta'] for i in stable)/seconds if seconds else None,
                        'stableTargetCpuPercent':sum(i['machineCpuPercent']*i['cpuTotalTicksDelta'] for i in stable)/ticks if ticks else None,
                        'failedAttemptsDelta':sum((s or {}).get('failedAttempts',0) for s in samples[-1]['roots'].values())-sum((s or {}).get('failedAttempts',0) for s in samples[0]['roots'].values()),
                        'autoThrottleObserved':any(s['masterState']['activeLimit']!=declared for s in samples),
                        'rendererTrackedSamples':sum(any('renderer' in p['roles'] for p in s['processes'].values()) for s in samples),
                        'cpuCoolingActiveObserved':None,'coolingDeviceInterpretation':'本机thermal-cpufreq cur_state读数为1900800/2361600，不能按非零值推断热降频；频率上限单独比较。',
                        'method':'实际并发要求当前控制器attempt匹配、宿主PID/startTicks采样仍存活、当前尝试为collecting；原始样本不覆盖。',
                        'stableTargetIntervals':stable})
        (directory/'ANALYSIS.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        reports.append(summary)
    (TASK/'BENCHMARKS.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    for report in reports:
        print(json.dumps({k:report[k] for k in ['directory','declaredWorkers','seconds','machineCpuPercent','peakIntervalCpuPercent','actionsPerSecond','naturalParentsDelta','failedAttemptsDelta','stableTargetSeconds','longestConsecutiveTargetSeconds','stableTargetActionsPerSecond','stableTargetCpuPercent','trackedPssPeakMiB','availableMemoryMinMiB','actualWorkerSamples']},ensure_ascii=False))


if __name__=='__main__':
    main()
