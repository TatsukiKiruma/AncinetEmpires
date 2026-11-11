"""按固定快照既有宏动作量分配续跑父局；不生成对局，不改任何原始数据。"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
status = json.loads((HERE/'snapshot_20261016_001729/05_continuation-status.json').read_text(encoding='utf8'))
parents = {s['original_id'] for s in status['segments'] if int(s['original_id'][1:]) <= 250}
cost = {p: sum(s['actions'] for s in status['segments'] if s['original_id'] == p) for p in parents}
groups, weights = [[], []], [0, 0]
for parent in sorted(parents, key=lambda p: (-cost[p], p)):
    selected = weights.index(min(weights))
    groups[selected].append(parent)
    weights[selected] += cost[parent]
assert groups[0] and groups[1] and set(groups[0]).isdisjoint(groups[1])
assert set(groups[0] + groups[1]) == parents
report = {'schema': 'existing-parent-continuation-partition-v1', 'snapshot': 'snapshot_20261016_001729',
          'scope': '只分配本轮既有段，不生成新对局', 'mainParents': groups[0], 'helperGParents': groups[1],
          'macroBudgets': weights, 'helperStartCondition': '仅在空闲槽位或实测后新增的资源预算内启动；当前最多8个持续重放',
          'allOtherParents': '已由A/B/C/D/E/F独立覆盖；全部最终分段仍须合并验收'}
(HERE/'continuation-partition.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print(json.dumps(report, ensure_ascii=False))
