"""正式冻结前补充经CPU诊断和等价验证的反扑依赖裁剪，保留初稿。"""
from run_league import DIR, read, save, sha

audit = DIR / 'phase54-audit/v5-deep-r3'
assert not (audit / 'runtime-freeze.json').exists(), '冻结后禁止修改协议'
assert not (audit / 'protocol-before-combat-cache.json').exists()
protocol = read(audit / 'protocol.json'); save(audit / 'protocol-before-combat-cache.json',protocol)
protocol['algorithmContract'].update(exactSparseCounterProjection=True,exactReverseGoalPaths=True)
protocol['reason'] += '；CPU采样定位权威反击预测的全图JSON克隆，预筛使用双单位稀疏地形依赖视图，仍调用原权威函数；整数地形按目标反向距离缓存，非整数及极端地形回退共享原实现。'
save(audit / 'protocol.json',protocol)
for arm in ['champion-search-arena','candidate-search-arena','engineering60']:
    plan = read(audit / arm / 'plan.json'); plan.update(algorithmContract=protocol['algorithmContract'],protocolSha256=sha(audit / 'protocol.json'))
    save(audit / arm / 'plan.json',plan)
print('正式冻结前算法补充已登记，初稿及失败热点诊断保留')
