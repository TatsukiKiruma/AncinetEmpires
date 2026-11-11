"""把当前已验证事实写入本阶段记录；不把探针记为正式面板通过。"""
from pathlib import Path
import json,hashlib
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
proof=read('revisions/r21/performance-consistency-gate.json');comparison=read('revisions/r21/candidate-scalars-exact.json');assert proof['passed'] and comparison['passed']
text='\n\n## R21 同单位安全完结与权威查询优化\n\n纯性能分支冻结于source-freeze-r21-performance-only.json，在全部1557根上与R20的15921个候选、动作、完整计划及风险见证逐项一致，98497个见证动作全部strict。权威规则新增普通move有序子集和同源就绪计数，未指定查询时完整候选顺序不变；标量规则热路径保持自有可枚举覆盖语义；事件仍在执行前独立复制；已有step隔离快照复用。路径缓存复用完整几何并加入淘汰代数，避免编号复用碰撞。原阶段3路径/威胁文件未改。原公共campaign_events.ts已复制到public_before并纳入显式授权保全；原件SHA受立项基线校验。\n\n安全修复只在贪心叶子已有真实致死见证时，对原24节点枚举中已经执行的同actor完整分支补算最多两个完整叶子，优先攻击真实见证中的威胁者或治疗被威胁单位；必须已知双非致死、净收益不低于原-.15且完整叶子分严格提高才替换。不增加己方step或分支infer；getAction的全部根Veto/Takeover守卫逐字相同。真实641步反例红绿通过，当前根move:u_45:5,9→attack:u_45:u_55，旧版选attack:u_45:u_60；风险见证完整重放。\n\n当前新修复1557根重新采集：根输入、默认、覆盖及先验全部一致，15833候选完全相同、88个候选换成更高且安全的完整物理叶子，不伪称旧叶子矩阵全部相同。全部已消费评测前态刷新排重，原网格仍选0.8；条件开发74行/62父局、NLL=1.430231、top1=33/74，分母不同于R20的72行，不能直接当全量策略精度提升。\n\n初始、教师和提议全部重新实际Chrome155：最大前向2.84e-14、全参数梯度1.78e-14，编码零差、argmax一致；数值bundle=1840130d5b67229233102124147ebd6f9cfc5c3e6cab6222e9f986223477d061，绑定39份源码。Value230次p95=1.8830/max4.3111ms，每指挥官focus最多1次；完整根24状态48次p95=182.7053/max209.4374ms，分支策略前向0。失败局第1905步43单位最大慢帧同机交替，冻结R20/R21纯性能分支总6714.75→5327.69ms、p951741.86→1377.26ms，全部决定/元数据相同；该单帧4次非首轮诊断仍不能替代四进程完整面板。\n\n7200动作/576克隆/7200mask、3313移动及2922伤害对照已再跑通过；其余守卫与公共检查正在完整复验。原03353a53模型、Top12/24/300、两面板胜率、全步与根p95<=600、零超时门槛不变。真正专家0、未蒸馏、未最终200槽，所有失败与诊断原件保留。\n'
with (HERE/'WORKLOG.md').open('a',encoding='utf-8',newline='') as out:out.write(text)
current=ROOT/'ai_training/status/CURRENT.md';b=current.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';assert b.count(marker)==1
line='R21前置进展：纯性能1557根/15921候选/98497风险见证全部精确一致；安全完结重采新增88个更高且非致死物理叶子，其余15833候选相同，原根守卫逐字不变。三模型均实际重跑Chrome，误差约1e-14，Value p95=1.883/max4.311ms，完整根单进程p95=182.705ms；7200动作/576克隆/7200mask再次一致。原门槛不降，完整公共/安全复验结束后运行150槽资格；不提前计教师通过，专家0。\n'.encode()
current.write_bytes(b.replace(marker,line+marker));print({'documented':True,'complete':False})
