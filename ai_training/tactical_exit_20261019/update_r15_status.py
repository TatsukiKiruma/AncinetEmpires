"""记录明确未采纳的策略假设及v2排序域，不覆盖v1与阶段块外内容。"""
from pathlib import Path
import json,hashlib
HERE=Path(__file__).resolve().parent;c=json.loads((HERE/'search-scale/teacher-calibration.json').read_text(encoding='utf-8'));assert c['protocolVersion']=='search-scale-v2'
note=f'''
## R15 Veto叶子目标与普通融合分域

R14在90实际槽位结束，55730实际动作全部strict；固定搜索22/30胜（pure24），p95=207.4ms，两类超时0，质量失败，专家0。绝对同actor优先只是局部策略假设，红绿通过不代表棋力正确，未获支持后不采纳；旧veto_actor_regression.ts与完整R14源码、束、日志和报告保留为历史材料，不作为当前规范。

R15在新评测前登记search_scale_protocol_v2.json及ACTIVE_SEARCH_PROTOCOL.json，原始v1及固定900父局/1557根池不改。已知致死否决中按原叶子score选择满足原有全部安全、净收益、原受威胁单位及逐指挥官健康门槛的备选，不再让已被否决策略的置信分或绝对actor次序盖过更高叶子值；同分时才优先原actor。普通接管保留rankScore策略融合，系数仍用原固定网格按开发NLL选择。没有新增候选、规则、分支策略前向或节点预算。

两个实际帧旧R14在更高可行叶子参考面前失败，新版通过；普通系数改1.6也不改变Veto。当前门禁为veto_objective_regression.ts及verify_veto_objective.mjs，明确取代未采纳的绝对actor假设。所有原有风险与健康守卫仍执行。当前core SHA={hashlib.sha256((HERE/'model_battle_search_ai.ts').read_bytes()).hexdigest()}。

固定1557根重采后，候选输入、覆盖、叶子分和安全标记与R14逐项相同；新增rankingMode字段导致完整记录字节不同，不称全记录逐字节相同。评测排重刷新1556日志/946542实际动作、226797个beforeHash。v2条件训练342行/300父局（普通337/Veto5），开发59行/51父局（普通57/Veto2）；固定Veto域不拟合系数，普通域按原规则选{c['selected']['priorWeight']}，v2开发NLL {c['baseline']['validation']['nll']:.6f}→{c['selected']['validation']['nll']:.6f}、top1 {c['baseline']['validation']['correct']}/59→{c['selected']['validation']['correct']}/59。不能与v1选择结果当同一曲线，也不能把2行Veto开发样本称充分棋力验证。

完整前置复核进行中；仍无合格教师，40局专家、蒸馏、最终Value/Chrome及200槽没有完成，不宣称交付或晋升。
'''
for name in ['WORKLOG.md','DESIGN.md']:
    with (HERE/name).open('a',encoding='utf-8') as f:f.write(note)
p=HERE.parent/'status/CURRENT.md';current=p.read_bytes();a=current.index(b'<!-- tactical-exit-20261019 -->');b=current.index(b'<!-- end-tactical-exit-20261019 -->')+len(b'<!-- end-tactical-exit-20261019 -->');old=current[a:b];block=old.decode('utf-8')
oldText='完整150槽教师资格运行中，尚无合格教师或专家轨迹。';assert block.count(oldText)==1;block=block.replace(oldText,'R14质量失败，90槽/55730动作全部strict，固定搜索22/30胜低于pure24；同actor绝对优先未采纳，原件保留。',1)
paragraph='R15已登记v2排序协议：Veto按原叶子分选择，仅同分优先原actor；普通接管继续校准策略融合，原安全/净收益/指挥官健康守卫不放宽。两帧旧红新绿，普通系数不影响Veto。1557根输入与叶子字段同R14，新增rankingMode明确导致记录字节不同；刷新1556日志/946542动作排重。v2条件开发59行（普通57/Veto2），按原网格仍选0.8，NLL 1.372203→1.136855、top1 20/59→32/59；不与v1曲线混比，不称充分棋力验证。R15完整前置复核进行中，专家自走0。'
nl='\r\n' if '\r\n' in block else '\n';block=block.replace('<!-- end-tactical-exit-20261019 -->',paragraph+nl+nl+'<!-- end-tactical-exit-20261019 -->').encode('utf-8');p.write_bytes(current[:a]+block+current[b:]);assert p.read_bytes().replace(block,old,1)==current
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='r15分域排序协议与校准完成，完整前置复核进行中；R14假设不采纳，专家0'),ensure_ascii=False),encoding='utf-8');print('R15状态已更新，CURRENT块外字节不变')
