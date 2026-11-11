"""从已有手机单调时钟事件分段，不连接设备或重跑对局。"""

from __future__ import annotations

import collections
import gzip
import json
import math
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parent
events = [json.loads(line) for line in gzip.decompress((ROOT / 'failed-native/decision-evidence.jsonl.gz').read_bytes()).decode('utf-8').splitlines()]
rows: dict[int, dict] = collections.defaultdict(dict)
for event in events:
    if type(event.get('actionIndex')) is int:
        rows[event['actionIndex']][event['kind']] = event

stages = ['decision_begin', 'choose_enter', 'browser_enter', 'browser_task_queued', 'browser_callback',
          'browser_return', 'create_action_return', 'choose_return', 'decision_return', 'decision_accepted', 'action_committed']


def statistics_for(values: list[float]) -> dict:
    ordered = sorted(values)
    return {'n': len(values), 'sumSeconds': sum(values), 'meanSeconds': statistics.mean(values),
            'medianSeconds': statistics.median(values), 'p95Seconds': ordered[math.ceil(len(ordered) * .95) - 1], 'maxSeconds': max(values)}


def delta(first: dict, second: dict) -> float:
    return (int(second['deviceNanos']) - int(first['deviceNanos'])) / 1e9


cycles = [delta(rows[i]['decision_begin'], rows[i + 1]['decision_begin']) for i in range(901)]
segments = {}
for index, name in enumerate(stages):
    next_name = stages[index + 1] if index + 1 < len(stages) else 'next_decision_begin'
    values = [delta(rows[i][name], rows[i][next_name] if index + 1 < len(stages) else rows[i + 1]['decision_begin']) for i in range(901)]
    segments[name + ' -> ' + next_name] = {**statistics_for(values), 'fractionOfCycles': sum(values) / sum(cycles)}
response_window = segments['browser_task_queued -> browser_callback']['sumSeconds']
report = {'schema': 'saved-hard-audit-timing-v1', 'events': len(events), 'committedActions': 901, 'attemptedFailedActionIndex': 901,
          'cycles': statistics_for(cycles), 'segments': segments,
          'browserResponseWindowSeconds': response_window, 'outsideBrowserResponseWindowSeconds': sum(cycles) - response_window,
          'browserResponseWindowFraction': response_window / sum(cycles),
          'windows': {f'{start}-{end-1}': statistics_for(cycles[start:end]) for start, end in [(0, 120), (120, 192), (192, 901)]},
          'eventKinds': dict(collections.Counter(event['kind'] for event in events)),
          'limits': ['事件时间在逐条写盘之前采集，分段包含观察器开销。', '网页响应窗口包含队列、日志和回调，不能等同纯JS计算。',
                     '没有无钩子/无全VM去优化/批量sync的受控对照，不能分别给出各项因果占比。']}
path = ROOT / 'TIMING_BREAKDOWN.json'
with path.open('x', encoding='utf-8') as stream:
    json.dump(report, stream, ensure_ascii=False, indent=2)
print(json.dumps({key: report[key] for key in ['events', 'cycles', 'browserResponseWindowSeconds', 'outsideBrowserResponseWindowSeconds', 'browserResponseWindowFraction', 'windows']}, ensure_ascii=False))
