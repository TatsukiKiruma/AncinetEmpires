"""记录有实际见证支持的Veto修订，保留CURRENT阶段块之外的全部字节。"""
from pathlib import Path
import json
HERE=Path(__file__).resolve().parent
note='''
## R13 Veto逐指挥官健康不退化

R12在87槽停止新增，53115实际动作全部strict；固定搜索29槽22胜，剩余1槽全胜亦低于pure24，未获教师资格。性能p95=206.4ms，两类超时0。低军力正净交换扫描没有找到同时满足既有显著接管阈值的漏接管实例，因此未据此修改守卫。

确认了实际Veto的高优先级资产保护问题：apk_like-teacher_search-m1-s0第57步、heuristic-teacher_search-m1-s0第56步，默认250军力弓手行动可被真实集火致死；旧Veto却为保弓手改选指挥官前移，指挥官可被三军打掉84/90HP，而默认分支仅受0/9伤害。两帧完整前缀及所有反扑见证保留。

R13仅增加Veto的逐指挥官见证后剩余HP不退化条件：复用已经算出的风险，不再模拟候选或增加反扑调用；每个原有指挥官都单独比较，不能平均抵销。已知自然失败或指挥官已损失时以0为基线，仍允许救回；未知默认风险用当前HP上界作保守比较，不伪装已知安全。高价值单位与原受威胁行动者保护、自然胜接管等原守卫不放宽。strict从实际重放叶子和相同风险见证独立复算健康证明。

同一真实帧旧R12红、新版绿，原高价值致死仍被Veto，实际选出的指挥官健康不再退化。新增审计初次类型检查漏导入GameState，修复后类型检查及原守卫回归通过；不涉及运行算法变化。当前core SHA=49708c95848d633c525007a397dcb326ca7c3bbf2939b7780289b2489e4874a9。

重新采集1557前态、47874反扑见证；四路候选输入、覆盖、叶子分和安全标记与R12逐字节相同，实际选择及风险元数据允许改变。刷新1366日志/831061实际动作、211852个beforeHash，按原固定规则仍选0.8，条件开发59行/51父局NLL 1.372203→1.133332、top1 20/59→31/59。完整前置复核进行中，专家40局、蒸馏与最终200槽仍未完成。

事实订正：此前“36HP三级幽灵换掉满血狼”的表述不准确。真实引擎记录是幽灵自身阵亡、对敌狼造成150军力损失，己方损失73、净值77；敌狼没有被击杀。已修正文档措辞，原始计算、源码快照和失败收据不变。
'''
for name in ['WORKLOG.md','DESIGN.md']:
    with (HERE/name).open('a',encoding='utf-8') as f:f.write(note)
p=HERE.parent/'status/CURRENT.md';current=p.read_bytes();a=current.index(b'<!-- tactical-exit-20261019 -->');b=current.index(b'<!-- end-tactical-exit-20261019 -->')+len(b'<!-- end-tactical-exit-20261019 -->');old=current[a:b];block=old.decode('utf-8')
block=block.replace('完整150槽教师资格运行中，未采专家。','R12在87槽停止新增，53115动作全部strict，固定搜索29槽22胜，未获教师资格。',1)
paragraph='R13修复Veto为保护普通高价值单位而让指挥官承受更大集火的问题：两帧默认指挥官伤害0/9，旧Veto所选分支为84/90。新增逐指挥官见证后剩余HP不退化，复用已有风险、没有新增反扑搜索，仍允许救回已知失败局面，strict独立复算。旧红新绿及原守卫回归通过；1557前态重新采集47874见证，候选输入与叶子记录和R12逐字节相同，刷新1366日志/831061动作排重，按原规则仍选0.8。R13完整前置复核进行中，专家自走0，尚未蒸馏或最终200槽验收。'
nl='\r\n' if '\r\n' in block else '\n';block=block.replace('<!-- end-tactical-exit-20261019 -->',paragraph+nl+nl+'<!-- end-tactical-exit-20261019 -->').encode('utf-8');p.write_bytes(current[:a]+block+current[b:]);assert p.read_bytes().replace(block,old,1)==current
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='r13指挥官健康守卫和重新校准完成，完整前置复核进行中；专家自走0'),ensure_ascii=False),encoding='utf-8')
print('R13状态已更新，CURRENT块外字节不变')
