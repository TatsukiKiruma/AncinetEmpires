"""只刷新本阶段拥有的状态块，不改写其他研究记录。"""
from pathlib import Path
import json
HERE=Path(__file__).resolve().parent;p=HERE.parent/'status/CURRENT.md';current=p.read_bytes()
start=current.index(b'<!-- tactical-exit-20261019 -->');end=current.index(b'<!-- end-tactical-exit-20261019 -->')+len(b'<!-- end-tactical-exit-20261019 -->');old=current[start:end];nl=b'\r\n' if b'\r\n' in old else b'\n'
text=old.decode('utf-8').replace('R3重新完整150槽教师资格验收中；','R3完整150槽已结束但资格失败：固定搜索/纯策略均24胜；扩展搜索10胜、阶段3/纯策略13/12胜，搜索p95约975ms且墙钟截断1。87,985实际动作及208,219反扑见证动作全部strict。R4已增加普通移动时敌堡关键事件覆盖红/绿回归，并完成定向查询缓存、无用数组分配与招募价格直接读取的隔离等价验证，正在进行公共回归、完整轨迹与特征复核；')
text=text.replace('公共lint、372测试、build及阶段5类型检查通过','此前公共lint、测试、build及阶段5类型检查通过，新性能实现正在重新完整验证')
new=text.encode('utf-8');p.write_bytes(current[:start]+new+current[end:]);assert p.read_bytes().replace(new,old,1)==current
with (HERE/'WORKLOG.md').open('a',encoding='utf-8') as f:f.write('''
## R3完整失败与R4修订准备

R3完整150槽/87,985动作及208,219反扑见证strict，固定搜索24胜与pure持平；扩展搜索10胜，低于阶段3的13和pure的12，p95约975ms、墙钟截断1。teacher-r3-gate未过，专家采样仍为0。

R4修复普通移动未覆盖敌城堡关键候选：合法构造用例在R3原类预期失败、R4通过，Top6/24、全部系数及模型不变。性能优化包括定向权威查询缓存（41状态/8066查询/1241步等价）、只在反向传播构造未使用稠密输入（23状态全部梯度/前向逐项等价），以及招募价格/限制标量直接读取（38状态/10类规则变体/40,280检查一致）。CPU采样中getUnitCost调用的完整getRuleConfig复制占主要时间；100候选诊断风险时间约1515→276ms，此诊断不替代同并发完整面板。

单军战斗后效分组提案虽在44状态/3462分支与旧值/见证相同，实际提速不足，未接入搜索/编码。源码和两个版本测量全部保留。优先使用不改变风险算法的公共只读字段优化。R4需完成公共检查、立项前24局轨迹、151列旧特征和真实Chrome复核后才能启动新的完整资格150槽。
''')
print('已仅更新本阶段状态块与工作记录')
