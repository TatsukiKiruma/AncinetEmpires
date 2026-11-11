"""无root实测：复用整机CPU口径，补充实际运行worker数与失败增量。"""
from pathlib import Path
import argparse
import datetime as dt
import json
import re
import sys
import time
from device import TASK, DEVICE, ADB, shell
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import concurrency_metrics as metrics


def renderer_pids(services, main_pids, package):
    # Android9的服务转储没有callerPackage，仍要求精确服务包名与本次宿主Client绑定同时成立。
    result = set()
    for block in re.split(r'(?m)^\s*\* ServiceRecord\{',services)[1:]:
        if f' {package}/org.chromium.content.app.SandboxedProcessService' not in block:
            continue
        clients = set(re.findall(r'Client AppBindRecord[^\n]* (\d+):'+re.escape(package)+r'/',block))
        renderer = re.search(r'isolatedProc=ProcessRecord\{\S+ (\d+):[^\n]*/u0a\d+i-?\d+}',block)
        if clients & main_pids and renderer:
            result.add(renderer[1])
    return result


metrics.renderer_pids = renderer_pids


class Sampler(metrics.Sampler):
    def shell(self, command):
        match = re.match(r"cat (/data/user/0/(net\.toyknight\.aeii\.worker1[123])/[^ ]+)$",command)
        if match:
            command = 'run-as '+match[2]+' '+command
        return shell(command,timeout=20)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers',type=int,required=True,choices=[1,2,3])
    parser.add_argument('--duration',type=int,default=120)
    args = parser.parse_args()
    plan = json.loads((TASK/'production-03/PLAN.json').read_text(encoding='utf-8'))
    session = TASK/'measurements'/(dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+f'-w{args.workers}')
    session.mkdir(parents=True,exist_ok=False)
    config = argparse.Namespace(adb=ADB,device=DEVICE,task_root=[w['remoteRoot'] for w in plan['workers']],package=[w['package'] for w in plan['workers']],
                               data_root=[f'/data/user/0/{w["package"]}/files/.aeii-hard-production' for w in plan['workers']],state_path=[],pid=[])
    sampler = Sampler(config)
    samples,intervals,started = [],[],time.monotonic()
    while True:
        sample = sampler.sample()
        master = json.loads(shell('cat '+plan['remoteRoot']+'/STATE.json'))
        sample['masterState'] = master
        active = []
        for root in sample['roots'].values():
            if not root or not root.get('attempt'):
                continue
            pid = str(root.get('appPid',''))
            process = sample['processes'].get(pid,{})
            stat = process.get('cpu')
            if not stat or stat['state'] in {'Z','X','x'}:
                continue
            for path,state in sample['attemptStates'].items():
                if '/'+root['attempt']+'/STATE.json' in path and state.get('phase') == 'running' and state.get('stage') == 'collecting':
                    active.append(state)
        sample['actuallyRunningWorkers'] = len(active)
        sample['failedAttempts'] = sum((s or {}).get('failedAttempts',0) for s in sample['roots'].values())
        (session/f'sample-{len(samples):03d}.json').write_text(json.dumps(sample,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        if samples:
            value = metrics.interval(samples[-1],sample)
            value['actualWorkersAtEndpoints'] = [samples[-1]['actuallyRunningWorkers'],sample['actuallyRunningWorkers']]
            value['limitAtEndpoints'] = [samples[-1]['masterState']['activeLimit'],master['activeLimit']]
            intervals.append(value)
        samples.append(sample)
        summary = metrics.summarize(samples,intervals,args.workers)
        summary['cpuCoolingActiveObserved'] = None
        summary['coolingDeviceInterpretation'] = '三星thermal-cpufreq的cur_state读数等于频率值，不能以非零判定热降频；另行比较scaling_max_freq和cpuinfo_max_freq。'
        summary['actualWorkerSamples'] = [s['actuallyRunningWorkers'] for s in samples]
        summary['activeLimitSamples'] = [s['masterState']['activeLimit'] for s in samples]
        summary['failedAttemptsDelta'] = samples[-1]['failedAttempts']-samples[0]['failedAttempts']
        summary['stableTargetIntervals'] = [i for i in intervals if i['actualWorkersAtEndpoints'] == [args.workers,args.workers] and i['limitAtEndpoints'] == [args.workers,args.workers]]
        summary['stableTargetSeconds'] = sum(i['seconds'] for i in summary['stableTargetIntervals'])
        summary['autoThrottleObserved'] = any(s['masterState']['activeLimit'] != args.workers for s in samples)
        (session/'SUMMARY.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'session':str(session),'samples':len(samples),'seconds':summary['seconds'],'cpu':summary['machineCpuPercent'],'actionsPerSecond':summary['actionsPerSecond'],'actualWorkers':sample['actuallyRunningWorkers'],'activeLimit':master['activeLimit'],'done':master['doneParents'],'failedDelta':summary['failedAttemptsDelta'],'temperature':sample['battery']['temperatureC']},ensure_ascii=False),flush=True)
        if time.monotonic()-started >= args.duration:
            break
        time.sleep(8)


if __name__ == '__main__':
    main()
