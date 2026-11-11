"""只替换本阶段持有的状态块，其余原有字节不动。"""
from pathlib import Path
import json
HERE=Path(__file__).resolve().parent
note='''
## R12空城新兵部署与真实叶子

R11固定搜索29槽/22胜，余1槽全胜仍仅23胜<纯策略24胜，停止新增；在途正常结束后共89槽、56681实际动作及105031反扑见证动作全部strict。没有专家采样。搜索实际p95=211.7ms，两类超时0；性能通过不能替代质量。单个正净值交换未提交疑点只有极小净收益，未据此改策略。

确认并修复空城新兵叶子不一致：旧版后续排除move，却按wait后的完结状态评分，实际又因新兵仍可移动而不提交wait。R11 apk_like-teacher_search-m0-s0第2步的recruit_to_castle:soldier:4,4有权威前缀和状态哈希反例，见deployment-real-witness-gate.json。

新deployment_candidates只给权威合法移动排序，几何预估只作候选覆盖，不作为合法性或收益证据。保留原地有效完结；另最多4个有即时占领/作战机会的部署落点，每落点至多3个轻量完结初选，必要时最多2个突击落点，全部实际节点共享原24后续预算，按真实已知非致死且有收益叶子选完整计划。没有有效完整方案则叶子保留真实招募后的未行动状态，deploymentDeferred明确未完成、计划为空；合法招募的零致死接管仍可选根，后续交真实策略，不虚构wait。strict独立核验新兵未动、仍有合法move、实际收益和无待机队列。

部署占村、延后状态真实性、部署攻击后突击移动在旧R11失败、新实现通过；原地攻击两版通过，队友不被跳过。突击夹具首次金币不足600导致合法招募前提失败，保留日志；补足夹具金币后重新完整红绿，未修改规则。npx入口首次不存在，改用实际typescript/bin/tsc后独立类型通过。

重新采集固定1557前态与47976反扑见证；刷新1279日志/777946实际动作、204883个评测beforeHash。条件子集342训练行/300父局、59开发行/51父局；固定规则仍选0.8，开发NLL 1.372203→1.133332、top1 20/59→31/59。只属于条件覆盖指标，不称完整开发或实战改进。前置全检查正在复核，40专家、蒸馏及最终200槽仍未完成。
'''
for name in ['WORKLOG.md','DESIGN.md']:
    with (HERE/name).open('a',encoding='utf-8') as f:f.write(note)
p=HERE.parent/'status/CURRENT.md';current=p.read_bytes();a=current.index(b'<!-- tactical-exit-20261019 -->');b=current.index(b'<!-- end-tactical-exit-20261019 -->')+len(b'<!-- end-tactical-exit-20261019 -->');old=current[a:b];block=old.decode('utf-8')
block=block.replace('R11完整150槽资格进行中，40局专家、蒸馏及最终200槽尚未完成，不宣称交付。','R11在89槽停止新增，56681实际动作和105031反扑见证动作全部strict；固定搜索29槽22胜，余1槽全胜仍低于pure24，未获教师资格。40局专家、蒸馏及最终200槽尚未完成，不宣称交付。')
paragraph='R12已修复空城新兵按未提交wait状态评分的问题；新增有即时收益的合法部署移动与完结，含突击二次移动，仍共享原24后续节点预算，无分支策略前向。没有有效完整方案时按真实招募后未行动状态估值并明确部署延后；strict核验状态真实性和移动机会。三项旧红/新绿、原地攻击不退化及真实第2步见证通过。固定1557前态重新采集47976见证，刷新1279日志/777946动作的排重索引；条件开发59行/51父局NLL 1.372203→1.133332、top1 20/59→31/59，按原规则仍选0.8。R12完整前置复核进行中，未采专家。'
nl='\r\n' if '\r\n' in block else '\n';block=block.replace('<!-- end-tactical-exit-20261019 -->',paragraph+nl+nl+'<!-- end-tactical-exit-20261019 -->').encode('utf-8')
p.write_bytes(current[:a]+block+current[b:]);assert p.read_bytes().replace(block,old,1)==current
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='r12重新校准完成，完整前置复核进行中；专家自走0'),ensure_ascii=False),encoding='utf-8')
print('R12状态已登记，CURRENT块外字节保持')
