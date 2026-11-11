"""任务完成后取回证据与检查点，生成两段耗时和资源占用对比。"""
import datetime as dt
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import sys
import tarfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'phone_2m_scratch100_20261024'))
from device import root, write, ADB, SERIAL

PHONE = '/data/local/tmp/aeii-2m-workers-20261024'


def load(p):
    return json.loads(p.read_text(encoding='utf-8'))


def main():
    result = json.loads(root('cat ' + PHONE + '/job/CONTROLLER_EXIT.json'))
    if result['returncode'] != 0 or result['phase'] != 'complete':
        raise RuntimeError('两段尚未成功完成：' + str(result))
    folder = HERE / 'completion'
    folder.mkdir(exist_ok=True)
    archive = folder / 'phone-output.tar'
    command = 'tar -cf - --exclude=shared -C ' + PHONE + '/job workers2 workers3 CONTROLLER_STARTED.json CONTROLLER_EXIT.json TRAINER_IDENTITY.json PHASE_TIMES.jsonl RESOURCE.json RESOURCE_HISTORY.jsonl COOLDOWN.json'
    with archive.open('wb') as stream:
        done = subprocess.run([ADB, '-s', SERIAL, 'exec-out', 'su -c ' + shlex.quote(command)], stdout=stream, stderr=subprocess.PIPE, timeout=180)
    if done.returncode:
        raise RuntimeError(done.stderr.decode('utf-8', 'replace'))
    with tarfile.open(archive) as stream:
        stream.extractall(folder, filter='data')
    comparison = {'status': 'complete', 'completedParentsCumulative': 120, 'newParents': 20, 'newSamples': 15288, 'hostOptimizerUpdates': 0,
                  'automaticFullTraining': False, 'newStrictReplayExecuted': False, 'segments': [], 'queriedUtc': dt.datetime.now(dt.timezone.utc).isoformat(),
                  'comparisonLimit': '两段分别十父局，样本量、地图和候选规模不同；吞吐率比值仅为本次观察，不是相同数据受控加速比',
                  'cpuDefinition': '进程CPU以单核100%计；除以8为占整机8核容量；整机CPU另由/proc/stat差分读取',
                  'memoryDefinition': 'PSS为按比例分摊共享页的进程总内存；RSS求和可能重复计算共享页'}
    for name in ['workers2', 'workers3']:
        q = folder / name
        complete = load(q / 'COMPLETE.json')
        latest = load(q / 'LATEST.json')
        with (q / latest['file']).open('rb') as stream:
            actual = hashlib.file_digest(stream, 'sha256').hexdigest()
        assert actual == latest['sha256']
        assert load(q / 'RESUME_VERIFIED.json')['passed'] and load(q / 'GRADIENT_VERIFIED.json')['passed']
        rows = [json.loads(line) for line in (q / 'PERFORMANCE.jsonl').read_text(encoding='utf-8').splitlines()]
        intervals = [r for r in rows if 'intervalSeconds' in r]
        seconds = sum(r['intervalSeconds'] for r in intervals)
        average = lambda key: sum(r[key] * r['intervalSeconds'] for r in intervals) / seconds
        phase = next(r for r in [json.loads(line) for line in (folder / 'PHASE_TIMES.jsonl').read_text().splitlines()] if r['workers'] == complete['workers'])
        item = {'workers': complete['workers'], 'parentRange': complete['parentRange'], 'parents': 10, 'samples': complete['samples'], 'updates': complete['updates'],
                'processWallSeconds': phase['endEpoch'] - phase['startEpoch'], 'timedWallSeconds': complete['wallSeconds'], 'samplesPerSecond': complete['samplesPerSecond'],
                'trainingSecondsExcludingGradientCheck': complete['timedTrainingSecondsExcludingGradientCheck'],
                'processCpuAverageOneCorePercent': average('processCpuPercentOneCore'), 'processCpuAverageOfEightCoresPercent': average('processCpuPercentOneCore') / 8,
                'deviceCpuAveragePercent': average('deviceCpuPercent'), 'deviceCpuPeakPercent': max(r['deviceCpuPercent'] for r in intervals),
                'peakPssMiB': max(r['sumPssKiB'] for r in rows) / 1024, 'peakSumRssMiB': max(r['sumRssKiB'] for r in rows) / 1024,
                'temperatureStartC': rows[0]['resource']['temperatureC'], 'temperaturePeakC': max(r['resource']['temperatureC'] for r in rows),
                'batteryStartPercent': rows[0]['resource']['batteryPercent'], 'batteryEndPercent': rows[-1]['resource']['batteryPercent'],
                'resourceWaitSeconds': complete['totals']['resourceWaitSeconds'], 'finalCheckpointSha256': actual, 'resumeAndGradientChecksPassed': True}
        comparison['segments'].append(item)
    comparison['observedThroughputRatio3Over2'] = comparison['segments'][1]['samplesPerSecond'] / comparison['segments'][0]['samplesPerSecond']
    comparison['cooldown'] = load(folder / 'COOLDOWN.json')
    write(HERE / 'COMPARISON.json', comparison)
    a, b = comparison['segments']
    lines = ['# 小米8完整2M模型两/三worker续训对比', '', '两段均继承完整模型和AdamW/scheduler状态，每批汇总梯度后只更新一次。每worker两计算线程，全局batch 8、微批次1；各段末批4条。', '',
             '| 项目 | 2 worker | 3 worker |', '|---|---:|---:|',
             f"| 父局范围 | 101–110 | 111–120 |", f"| 原子样本 | {a['samples']} | {b['samples']} |",
             f"| 训练墙钟（秒） | {a['timedWallSeconds']:.2f} | {b['timedWallSeconds']:.2f} |",
             f"| 进程总耗时（秒） | {a['processWallSeconds']} | {b['processWallSeconds']} |",
             f"| 样本/秒 | {a['samplesPerSecond']:.3f} | {b['samplesPerSecond']:.3f} |",
             f"| 整机CPU均值 | {a['deviceCpuAveragePercent']:.2f}% | {b['deviceCpuAveragePercent']:.2f}% |",
             f"| 训练进程CPU / 8核容量 | {a['processCpuAverageOfEightCoresPercent']:.2f}% | {b['processCpuAverageOfEightCoresPercent']:.2f}% |",
             f"| 峰值PSS（MiB） | {a['peakPssMiB']:.1f} | {b['peakPssMiB']:.1f} |",
             f"| 温度起点/峰值（℃） | {a['temperatureStartC']}/{a['temperaturePeakC']} | {b['temperatureStartC']}/{b['temperaturePeakC']} |", '',
             f"本次吞吐率比值3/2为 {comparison['observedThroughputRatio3Over2']:.3f}。两段地图、候选规模和样本量不同，该数值仅描述本次观察。", '',
             '记录包含首次梯度核对、数据读取、同步和检查点时间；额外梯度核对未增加优化器更新。冷却等待单列，不计训练耗时。CPU来自5秒间隔采样，PSS避免RSS简单求和的共享页重复计数。', '',
             '已累计完成120父局并停止；未执行新的严格重放校验、未启动全量训练。两个最终完整检查点及手机原件均保留。']
    (HERE / 'REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps(comparison, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
