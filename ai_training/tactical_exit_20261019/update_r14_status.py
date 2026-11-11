"""记录同单位Veto优先修订，只编辑本阶段状态块与本目录说明。"""
from pathlib import Path
import json
HERE=Path(__file__).resolve().parent
note='''
## R14已知安全同单位Veto优先

R13固定30槽最终23胜/6负/1动作截断，低于pure24胜；停止新增后实际100槽、59751实际动作全部strict。扩展仅运行3个搜索槽（1胜2负），不补为完整20槽。固定搜索p95=219.5ms、部分扩展380.9ms，两类超时0；质量失败，不采专家。

R13已避免指挥官额外承受集火，但两帧Veto仍先移动指挥官至3,3，再在下一次决策否决原弓手危险动作，而同根已存在弓手自身的完整安全完结。R14只调整通过原有完整、已知非致死、净收益门槛、逐指挥官健康及原受威胁单位保护之后的选择次序：优先默认actor自己的完整解，没有才考虑其他actor；各子集内仍按同一rankScore。没有新增阈值、反扑搜索、叶子权重或节点预算。

同两帧旧R13红、新实现绿，实际权威重放确认弓手已完成行动、指挥官仍未行动。新夹具首次读取了日志中故意省略的state而失败，保留失败日志；改为重放root与后续后再核验，完整红绿通过。strict复算vetoSameActorPreferred所对应的原actor、完整性、真实风险和指挥官健康；审计复用实际重放分支，不重新构造引擎状态。当前core SHA=adad1b2da5ae0e38e74a69867180f2f63e9bcddf333d4d254f5e3de3f158098b。

固定1557前态重新采集47651反扑见证。四路候选输入、覆盖、分数和安全标记与R13逐字节相同；选择与风险元数据不同。评测排重刷新1466日志/890812动作、219189个beforeHash。固定协议仍选0.8，条件开发59行/51父局NLL 1.372203→1.133332、top1 20/59→31/59。R14完整前置复核进行中；40局专家、蒸馏、最终Chrome与200槽仍未完成。
'''
for name in ['WORKLOG.md','DESIGN.md']:
    with (HERE/name).open('a',encoding='utf-8') as f:f.write(note)
p=HERE.parent/'status/CURRENT.md';current=p.read_bytes();a=current.index(b'<!-- tactical-exit-20261019 -->');b=current.index(b'<!-- end-tactical-exit-20261019 -->')+len(b'<!-- end-tactical-exit-20261019 -->');old=current[a:b];block=old.decode('utf-8')
oldText='完整150槽教师资格运行中，专家自走0，尚未蒸馏或最终200槽验收。'
newText='R13固定23/30胜低于pure24胜，停止新增后100槽/59751动作strict，未获教师资格；扩展仅3个搜索槽，不补齐。专家自走0，尚未蒸馏或最终200槽验收。'
assert block.count(oldText)==1;block=block.replace(oldText,newText,1)
paragraph='R14修复Veto已有同单位完整安全解却先消耗队友行动的问题：通过原有风险、净收益、指挥官健康及原受威胁单位保护后，优先原actor自己的完整解，再考虑其他actor；不放宽门槛。真实两帧旧红新绿，弓手完成、指挥官仍未行动。1557前态及47651反扑见证重采，候选输入与叶子记录逐字节同R13，刷新1466日志/890812动作排重，按原规则仍选0.8。R14完整前置复核进行中，尚无合格教师或专家轨迹。'
nl='\r\n' if '\r\n' in block else '\n';block=block.replace('<!-- end-tactical-exit-20261019 -->',paragraph+nl+nl+'<!-- end-tactical-exit-20261019 -->').encode('utf-8');p.write_bytes(current[:a]+block+current[b:]);assert p.read_bytes().replace(block,old,1)==current
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='r14同单位Veto优先及重新校准完成，完整前置复核进行中；专家自走0'),ensure_ascii=False),encoding='utf-8');print('R14状态已更新，CURRENT块外字节不变')
