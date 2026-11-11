"""V14/T14-04：规整 tiny_fit_acceptance.json 的 stage 结构。

为什么需要：`tiny_fit_acceptance.py` 在首次运行时还没有 `stages` 字段，
第二次带 `--merge-existing` 运行时把「旧的 runs」补成了 stageA，于是 stageA
被拆成 3 条记录。这里把同一 stage 的记录合并成一条，保留全部逐 seed 读数与消费数据，
保证报告里的阶段表与原始记录一一对应（不新增、不删除任何读数）。
"""

from __future__ import annotations

import io
import json
from collections import OrderedDict
from pathlib import Path

path = Path('v14/out/v14_20260925_t14b/T14-04/tiny_fit_acceptance.json')
report = json.loads(path.read_text(encoding='utf-8'))

merged: "OrderedDict[str, dict]" = OrderedDict()
for stage in report.get('stages', []):
    name = stage.get('stage')
    entry = merged.setdefault(name, {
        'stage': name,
        'updates': stage.get('updates'),
        'seeds': [],
        'seedsPassed': 0,
        'allPassed': None,
        'minTop1': None,
        'runs': [],
    })
    for run in stage.get('runs', []) or []:
        entry['runs'].append(run)
    for seed in stage.get('seeds', []) or []:
        if seed not in entry['seeds']:
            entry['seeds'].append(seed)

for name, entry in merged.items():
    entry['runs'].sort(key=lambda r: r.get('modelSeed') or 0)
    entry['seeds'] = [r.get('modelSeed') for r in entry['runs']] or entry['seeds']
    entry['updates'] = entry['runs'][0].get('updatesRequested') if entry['runs'] else entry['updates']
    if entry['updates'] is None:
        # 中文：stageA 的第一次运行发生在脚本支持 --stage/--updates 之前，
        # 记录里没有 updatesRequested；其真实预算是 M3 档的 8000 次总更新
        # （命令与 optimized.json 的 globalUpdateLimit 都是 8000），据实补上并标注来源。
        entry['updates'] = 8000
        entry['updatesSource'] = '由 optimized.json 的 globalUpdateLimit=8000 与运行命令确认（脚本当时尚未记录该字段）'
    entry['seedsPassed'] = sum(1 for r in entry['runs'] if r.get('acceptancePassed'))
    entry['allPassed'] = bool(entry['runs']) and entry['seedsPassed'] == len(entry['runs'])
    tops = [r.get('top1') for r in entry['runs'] if r.get('top1') is not None]
    entry['minTop1'] = min(tops) if tops else None

report['stages'] = list(merged.values())
report['summary'] = {
    'stages': [{k: v for k, v in entry.items() if k != 'runs'} for entry in merged.values()],
    'allStagesPassed': all(entry['allPassed'] for entry in merged.values()),
    'bestStageMinTop1': max((entry['minTop1'] or 0.0) for entry in merged.values()),
    'note': '中文：stageA 为预登记 M3 预算（8000 总更新），stageB 为同一配置的预算延长（16000）。'
            '两批都使用同一数据集、同一 split、同一 data-order seed，只改总更新上限。',
}
path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps(report['summary'], indent=1, ensure_ascii=False))
