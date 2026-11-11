# 阶段4：集火、价值头与模型化BattleSearchAI

执行状态：completed_with_observed_battle_regression。480训练/120开发父局、原四臂200槽及事件守卫修订50槽，共250槽，全部已提交动作strict重放完成。组校准门禁：True；价值分阶段基线门禁：True。未通过的门禁不改写为通过。

开发门禁、三端数值一致性和strict合法性通过，不等于搜索实战增益通过。Value直接重排的负面结果与所有截断完整保留；本轮没有晋升模型或接入应用。

固定面板自然胜场（依次Random/ApkLikeAI/HeuristicAI，各10槽）：阶段3 **10/6/6**，新纯策略 **10/6/7**，Value重排 **10/1/2**，初版有界搜索 **10/5/7**，事件守卫修订 **10/6/5**。修订版逐档胜场及截断率均不退于阶段3的描述性检查：False；这不是新增预注册门禁。完整截断、配对变化和扩展开发根结果见下表。

扩展开发根对HeuristicAI自然胜场（各20槽）：阶段3 **13**、新纯策略 **11**、Value重排 **7**、初版搜索 **6**、修订搜索 **6**。扩展根胜场及截断率均不退于阶段3的描述性检查：False。验收完成时间：2026-10-19T00:42:35.159635+08:00；目录日期保留立项标识。

两版搜索在扩展根各有10/20槽预算截断，搜索时延和墙钟目标未达成。修订版固定面板没有截断，但HeuristicAI胜场退至5/10；离线Value改善没有转化为可靠的局中搜索收益。

本次为已消费开发材料和标准地图上的受控实验，不宣称独立泛化、模型晋升或应用接入。手机/ADB操作为0。阶段3全部文件SHA保持，既有工作区代码、模型、数据和报告未回滚。

历史保全复核发现80个阶段2packed/*.pkl已缺失，完整历史快照门禁为False；阶段3全部4771文件、新目录600份训练缓存SHA均通过。独立存储清理记录列出了阶段2缓存类别清理（163件），但无逐文件清单，不能逐件严格归因。原快照、首次失败清单和清理记录副本全部保留，未重建旧缓存或改写预期SHA。详见preservation-check.json；这项缺件不冒称保全通过。

## 数据与策略

完整候选无裁剪，实际训练156517条、开发40712条非平凡原子；自动换手平凡end_turn剔除6618条。全部来源标签在当前权威轨迹合法，压缩分片和无损float32缓存按SHA绑定。新增特征中段审计60父局，逐float32误差0。

所选600父局合计可信胜方标签41604、可信败方标签19629、价值mask关闭135996。只有valueEligible及完整自然终局strict证据通过的父局进入价值梯度；原生赢家字段单独存在不足以放行。本次只消费所选600父局，不能把背景全部双人SD价值标签数量当成本次训练量。

阶段3的141维候选输入完整保留，新增10维集火/收尾信号，总151维。热启动新输入权重为零，23探针的原策略/组logits和argmax误差0。PC float64 AdamW，胜方可信策略样本权重1.5，实际4轮/19568次更新，训练墙钟1357.85秒。最终策略epoch=4。

两敌军集火反例：单军最大伤害35<目标60HP，但两次move→attack可合法致死。落点冲突反例：松弛伤害70，贪心合法累计仅35、一个攻击者，不能误标致死。relaxed列是固定快照放松占位冲突的三军伤害和；greedy列才是逐动作可重放的累计净损血与致死见证，最多三个不同攻击者。

can_still_recruit来自当前完整合法招募集合，覆盖空城堡、金币和权威规则限制；has_free_attack表示存在正伤害且行动者无即时损血的合法攻击，不保证后续回合或全队零风险。两者作为全局候选信号注入，包括end_turn候选。集火松弛值不声称敌方整个回合的形式化伤害上界。

## 同一120父局开发比较

|模型|top1|groupTop1|组内移动|组内招募|攻击机会/选择攻击|有机会却wait|有招募却end|
|---|---|---|---|---|---|---|---|
|stage3|58.4275%|74.7224%|55.5876%|44.2465%|11449/24436 (46.8530%)|1647|590|
|stage4_uncalibrated|59.2405%|75.2383%|56.4332%|45.7167%|11407/24436 (46.6811%)|1422|527|
|stage4_calibrated|59.1865%|75.1916%|56.4332%|45.7167%|11611/24436 (47.5160%)|1347|414|

五类联合L-BFGS原定9组均未通过；追加4组更强end降权，最终选择wait=0.6/end=0.35。追加探索不属于原定参数网格，但全部门禁保持预注册原值：wait不高于阶段3和未校准阶段4、漏招募至少下降20%、攻击机会率不降、top1回退不超过1个百分点。通过：True；选择未使用实战胜负。详情见calibration-candidates.json、原定9组失败收据与calibration-extension-protocol.json。

## 价值头

独立两层MLP基底，64隐藏维、LayerNorm/ReLU/tanh，策略骨干冻结。最终输入为260维策略实体池化上下文＋原24维摘要＋1维公共calculateArmyValue双方差值/1024，总285维。MLP各层先接受自然价值梯度训练，最后固定已训练首层和LayerNorm，使用训练分区L-BFGS拟合输出层及六个可学习分阶段军力跳连参数；最终为BCE目标、L2=0.01。跳连属于神经模型参数，没有调用HeuristicAI评分。实际训练42967条/90自然终局父局，开发18266条/31父局。训练按父局及开/中/后期等权，原宏权重在各桶内归一化。

原284维MLP未通过中盘和后期强军力基线；追加军力输入的285维MLP及训练分区输出温度校准仍未通过中盘。保留两版模型和全部失败收据后，追加可学习跳连，16个训练拟合候选中按原门禁和开发三阶段MSE选择。此架构与参数探索属于追加开发研究，不伪称原预注册架构一次通过；未使用实战结果。

|阶段|估计器|行数/父局|MSE|Brier|符号准确率|ROC-AUC|
|---|---|---|---|---|---|---|
|opening|Value|4523/31|0.442621|0.110655|0.837276|0.925899|
|opening|constant|4523/31|1.071026|0.267757|0.540792|0.500000|
|opening|phase_constant|4523/31|1.006511|0.251628|0.540792|0.500000|
|opening|static|4523/31|0.733432|0.183358|0.750829|0.857813|
|opening|fitted_static|4523/31|0.596221|0.149055|0.751935|0.871100|
|opening|army_static|4523/31|0.797507|0.199377|0.701526|0.781257|
|opening|fitted_army|4523/31|0.765407|0.191352|0.699315|0.781257|
|middle|Value|9058/31|0.129824|0.032456|0.951755|0.992971|
|middle|constant|9058/31|0.883994|0.220999|0.670567|0.500000|
|middle|phase_constant|9058/31|0.897491|0.224373|0.670567|0.500000|
|middle|static|9058/31|0.401983|0.100496|0.897328|0.969536|
|middle|fitted_static|9058/31|0.229115|0.057279|0.912232|0.980787|
|middle|army_static|9058/31|0.181300|0.045325|0.940826|0.992936|
|middle|fitted_army|9058/31|0.141952|0.035488|0.949879|0.992936|
|late|Value|4685/17|0.024131|0.006033|0.990822|0.999611|
|late|constant|4685/17|0.637472|0.159368|0.841622|0.500000|
|late|phase_constant|4685/17|0.533198|0.133300|0.841622|0.500000|
|late|static|4685/17|0.085876|0.021469|0.988047|0.999733|
|late|fitted_static|4685/17|0.038591|0.009648|0.988901|0.999411|
|late|army_static|4685/17|0.034473|0.008618|0.988260|0.999640|
|late|fitted_army|4685/17|0.026428|0.006607|0.989755|0.999640|
|all|Value|18266/31|0.180170|0.045042|0.933428|0.985992|
|all|constant|18266/31|0.867077|0.216769|0.682306|0.500000|
|all|phase_constant|18266/31|0.831050|0.207762|0.682306|0.631013|
|all|static|18266/31|0.402978|0.100745|0.884321|0.962744|
|all|fitted_static|18266/31|0.271150|0.067788|0.892204|0.971001|
|all|army_static|18266/31|0.296225|0.074056|0.893737|0.966378|
|all|fitted_army|18266/31|0.266700|0.066675|0.898062|0.966378|

常数、分阶段常数及静态公式系数均只在训练集确定；fitted_static仅使用金币、总HP、兵数和收入差；army_static/fitted_army复用公共calculateArmyValue，招募成本和有效最大HP来自权威规则，拟合尺度仅消费训练集。Brier使用p=(Value+1)/2。某阶段缺少两类自然结果时AUC记不可用。完整指标和未通过门禁见value-evaluation.json。

## 数值与搜索框架

初始与最佳Policy＋Value均经PyTorch自动微分、独立TS解析反向和真实Chrome原始状态重编码。包括batch32、实际末批、胜方加权batch及mask=false，策略骨干收到的价值梯度为零。

|模型/运行端|前向最大误差|全参数梯度最大误差|loss最大误差|通过|
|---|---|---|---|---|
|initial/numeric|1.42e-14|7.55e-15|1.42e-14|True|
|initial/browser|1.42e-14|7.55e-15|1.42e-14|True|
|army-initial/numeric|1.42e-14|1.07e-14|1.07e-14|True|
|army-initial/browser|1.42e-14|1.07e-14|1.07e-14|True|
|residual-initial/numeric|1.42e-14|8.88e-15|1.07e-14|True|
|residual-initial/browser|1.42e-14|8.88e-15|1.07e-14|True|
|best/numeric|1.42e-14|8.88e-15|1.07e-14|True|
|best/browser|1.42e-14|8.88e-15|1.07e-14|True|

按补充要求直接移植src/game/ai/battle_search_ai.ts控制框架，见FRAMEWORK_MAPPING.md。默认和Top6先验、3步friendlyRolloutSteps均由分层网络产生。Maximin比较三单位集火、movingThreat补充和对手策略回应；移动回应继续探测同单位合法攻击。实战前补齐对称失城净变化项，系数不变，修订前版本与search-amendment-castle-net.json保留。叶子采用Value＋引擎双方总HP净变化（含招募与治疗）、双方指挥官减少差及双方城堡夺取净变化；自然终局±4主导。

单步48/整局2400显式搜索树节点，30秒/600秒墙钟及2000实际动作。特征构造和集火见证内部结算不计树节点，其耗时包含在决策与整局墙钟内，集火每次最多三个不同攻击者。Takeover间隔0.08，Veto间隔0.03。初版危险线−0.5或已探测真实致死；修订版移除仅凭负Value否决。预算不足的候选不参加接管；耗尽整局节点预算继续使用模型默认策略。连动序列在完整实际状态和合法集合匹配后执行。所有系数在各自实战前冻结。

独立依赖图证明搜索无HeuristicAI/旧启发式叶子依赖。响应回归实际拦截了单军不致死、两军移动攻击累计致死的指挥官；己方3步均逐步核对为分层网络选择；同一真实占城动作的双方净变化为+1/-1。固定节点探针重复决策和分支完全一致，快速Value叶子与完整Value前向误差0；摘要专用路径省略未被Value使用的actor风险，23状态的24维摘要逐值误差0。Maximin仅覆盖有界探测分支，不是敌方整个回合的穷举最坏值。

初版在ApkLikeAI上为5/10（含墙钟截断），纯策略6/10，Value重排1/10。静态审查确认原通用Takeover只有分差和损失条件，没有强制验证实际事件，因此独立追加事件守卫修订，不替换原200槽。普通动作只允许实际增加敌指挥官击杀或敌城堡夺取时接管；默认end/wait还可由新增击杀、占领、招募、零即时损血攻击纠正。事件只在己方真实引擎连动结束时统计，不把敌方回应中的反击伤亡冒充己方当回合斩杀。Veto要求合法致死威胁或实际关键损失，取消负Value单独否决；触发探测最多六次权威移动后动作查询，另计triggerProbes，耗时进入墙钟。Policy/Value权重、分差系数、TopK及树预算不变。此修订属于追加开发探索，不能作为独立泛化结论。

## 配对实战

固定五图双座位，Random/ApkLikeAI/HeuristicAI各10槽/臂；另10个新增开发父局前缀双座位，对HeuristicAI各20槽/臂。原四臂200槽全部保留，追加修订50槽，共250槽。第四臂value_rerank执行根候选并结算至回合末后按Value重排，不做己方连动或对手Maximin，用于区分Value重排与完整搜索贡献。全部提交动作strict核对完整合法集合、动作、前后态与终态hash；不把截断、超时、错误当作自然胜利。

|面板|对手|模型|胜/负/和|动作/墙钟/决策截断|自然胜率|p50/p95/p99 ms|第10轮收入差/到达局数|漏招募/模型动作|单军致死/集火致死/已知移动|
|---|---|---|---|---|---|---|---|---|---|
|fixed|random|hierarchical|10/0/0|0/0/0|100.0%|61.6/262.2/433.8|428.571429/7|76/3555|9/74/1286|
|fixed|random|pure|10/0/0|0/0/0|100.0%|156.2/705.9/945.5|441.666667/6|59/4185|12/85/1509|
|fixed|random|value_rerank|10/0/0|0/0/0|100.0%|224.7/1079.2/1719.0|300.000000/10|68/6356|53/151/2182|
|fixed|random|bounded|10/0/0|0/0/0|100.0%|176.7/3809.9/7267.2|381.250000/8|64/4517|36/86/1618|
|fixed|apk_like|hierarchical|6/3/0|1/0/0|60.0%|60.6/289.7/935.3|7.500000/10|70/4439|54/202/1639|
|fixed|apk_like|pure|6/4/0|0/0/0|60.0%|172.2/1082.5/1777.8|16.666667/9|47/4533|59/195/1757|
|fixed|apk_like|value_rerank|1/7/0|1/1/0|10.0%|454.2/2070.1/2779.8|-216.666667/9|30/3478|86/293/1292|
|fixed|apk_like|bounded|5/4/0|0/1/0|50.0%|178.4/4458.1/9739.0|-13.888889/9|39/4466|48/148/1670|
|fixed|heuristic|hierarchical|6/4/0|0/0/0|60.0%|59.3/316.4/933.8|58.333333/9|64/5381|95/346/2088|
|fixed|heuristic|pure|7/2/0|0/1/0|70.0%|160.7/1158.4/1714.3|108.333333/9|45/4432|52/191/1830|
|fixed|heuristic|value_rerank|2/6/0|1/1/0|20.0%|325.8/1718.3/2229.0|-175.000000/9|49/4173|93/305/1551|
|fixed|heuristic|bounded|7/3/0|0/0/0|70.0%|173.3/4669.8/9214.6|112.500000/10|31/3879|32/120/1497|
|expanded|heuristic|hierarchical|13/6/0|0/1/0|65.0%|144.3/834.0/1807.1|250.000000/15|79/7382|89/392/2877|
|expanded|heuristic|pure|11/7/0|0/2/0|55.0%|317.8/1541.7/3315.8|76.923077/13|64/6998|127/434/2757|
|expanded|heuristic|value_rerank|7/7/0|0/6/0|35.0%|734.2/3909.8/5454.3|-23.333333/15|24/5406|85/377/2042|
|expanded|heuristic|bounded|6/4/0|0/6/4|30.0%|452.2/11520.7/21152.9|45.454545/11|30/3611|33/189/1428|
|fixed|random|bounded_verified|10/0/0|0/0/0|100.0%|137.5/3570.3/7758.3|441.666667/6|47/3655|27/94/1416|
|fixed|apk_like|bounded_verified|6/4/0|0/0/0|60.0%|143.5/4046.4/7973.8|75.000000/9|29/3398|53/166/1323|
|fixed|heuristic|bounded_verified|5/5/0|0/0/0|50.0%|141.1/4045.8/7085.8|83.333333/9|20/2961|55/214/1170|
|expanded|heuristic|bounded_verified|6/4/0|0/4/6|30.0%|348.0/11954.3/21090.7|97.222222/9|33/3435|55/207/1347|

自然胜率分母为该组全部槽位，截断不算自然胜利。单步时延包括未提交的超时决策。

|面板/对手/模型|选择攻击/攻击机会|有招募却end/end总数|集火已知移动|搜索触发/改选/节点|
|---|---|---|---|---|
|fixed/random/hierarchical|338/992 (34.07%)|76/76|1286|0/0/0|
|fixed/random/pure|376/1162 (32.36%)|59/59|1509|0/0/0|
|fixed/random/value_rerank|552/1984 (27.82%)|68/68|2182|2100/260/23999|
|fixed/random/bounded|403/1331 (30.28%)|64/64|1618|504/53/22552|
|fixed/apk_like/hierarchical|658/1641 (40.10%)|70/70|1639|0/0/0|
|fixed/apk_like/pure|635/1655 (38.37%)|47/47|1757|0/0/0|
|fixed/apk_like/value_rerank|717/1630 (43.99%)|30/31|1292|1552/352/17139|
|fixed/apk_like/bounded|620/1606 (38.61%)|39/39|1670|561/71/23931|
|fixed/heuristic/hierarchical|863/2497 (34.56%)|64/64|2088|0/0/0|
|fixed/heuristic/pure|635/1779 (35.69%)|45/45|1830|0/0/0|
|fixed/heuristic/value_rerank|874/2113 (41.36%)|49/49|1551|1589/341/17538|
|fixed/heuristic/bounded|547/1385 (39.49%)|31/31|1497|555/72/23999|
|expanded/heuristic/hierarchical|1246/3451 (36.11%)|79/80|2877|0/0/0|
|expanded/heuristic/pure|1238/3233 (38.29%)|64/65|2757|0/0/0|
|expanded/heuristic/value_rerank|1051/2530 (41.54%)|24/42|2042|3277/712/37810|
|expanded/heuristic/bounded|699/1656 (42.21%)|30/32|1428|882/90/39701|
|fixed/random/bounded_verified|361/1249 (28.90%)|47/47|1416|477/25/21628|
|fixed/apk_like/bounded_verified|538/1329 (40.48%)|29/29|1323|537/34/23999|
|fixed/heuristic/bounded_verified|503/1471 (34.19%)|20/20|1170|519/37/23999|
|expanded/heuristic/bounded_verified|742/1759 (42.18%)|33/34|1347|826/45/37205|

|面板/对手/模型（相对阶段3配对）|新增自然胜/丢失自然胜|胜率差|双方均到第10轮的收入差变化/局数|
|---|---|---|---|
|fixed/random/pure|0/0|+0.0%|70.00/5|
|fixed/random/value_rerank|0/0|+0.0%|-110.71/7|
|fixed/random/bounded|0/0|+0.0%|-42.86/7|
|fixed/apk_like/pure|3/3|+0.0%|50.00/9|
|fixed/apk_like/value_rerank|0/5|-50.0%|-183.33/9|
|fixed/apk_like/bounded|1/2|-10.0%|19.44/9|
|fixed/heuristic/pure|1/0|+10.0%|71.88/8|
|fixed/heuristic/value_rerank|0/4|-40.0%|-181.25/8|
|fixed/heuristic/bounded|1/0|+10.0%|38.89/9|
|expanded/heuristic/pure|0/2|-10.0%|-107.69/13|
|expanded/heuristic/value_rerank|0/6|-30.0%|-202.08/12|
|expanded/heuristic/bounded|0/7|-35.0%|90.62/8|
|fixed/random/bounded_verified|0/0|+0.0%|70.00/5|
|fixed/apk_like/bounded_verified|1/1|+0.0%|108.33/9|
|fixed/heuristic/bounded_verified|1/2|-10.0%|28.12/8|
|expanded/heuristic/bounded_verified|0/7|-35.0%|-119.44/9|

完整结局分类（包括循环、投降和错误）：

|面板/对手/模型|分类计数|
|---|---|
|fixed/random/hierarchical|natural_win=10|
|fixed/random/pure|natural_win=10|
|fixed/random/value_rerank|natural_win=10|
|fixed/random/bounded|natural_win=10|
|fixed/apk_like/hierarchical|action_truncation=1, natural_loss=3, natural_win=6|
|fixed/apk_like/pure|natural_loss=4, natural_win=6|
|fixed/apk_like/value_rerank|action_truncation=1, natural_loss=7, natural_win=1, wall_truncation=1|
|fixed/apk_like/bounded|natural_loss=4, natural_win=5, wall_truncation=1|
|fixed/heuristic/hierarchical|natural_loss=4, natural_win=6|
|fixed/heuristic/pure|natural_loss=2, natural_win=7, wall_truncation=1|
|fixed/heuristic/value_rerank|action_truncation=1, natural_loss=6, natural_win=2, wall_truncation=1|
|fixed/heuristic/bounded|natural_loss=3, natural_win=7|
|expanded/heuristic/hierarchical|natural_loss=6, natural_win=13, wall_truncation=1|
|expanded/heuristic/pure|natural_loss=7, natural_win=11, wall_truncation=2|
|expanded/heuristic/value_rerank|natural_loss=7, natural_win=7, wall_truncation=6|
|expanded/heuristic/bounded|decision_timeout=4, natural_loss=4, natural_win=6, wall_truncation=6|
|fixed/random/bounded_verified|natural_win=10|
|fixed/apk_like/bounded_verified|natural_loss=4, natural_win=6|
|fixed/heuristic/bounded_verified|natural_loss=5, natural_win=5|
|expanded/heuristic/bounded_verified|decision_timeout=6, natural_loss=4, natural_win=6, wall_truncation=4|

合计250槽、136511个提交动作strict通过。固定分臂调度出现负载失衡后改为相同8并发共享队列，原先完成的35局结果逐文件SHA保持；8局运行中前缀一律归档并按原模型、初态与种子重跑。另有4693个归档动作strict通过，与重跑共享部分4693动作逐状态/动作/随机状态一致。全部局内源码、模型和预算哈希保持，未丢弃已完成的失败或截断。第10轮均值只包含实际到达该轮对局；提前结束不按零混入。致死落点为反事实风险，并不等同实际死亡次数。完整整数分母、搜索干预与逐局记录见BATTLES.md和battle-summary.json。

## 交付与限制

公共lint、368测试和build通过；本阶段独立类型与专用门禁通过。训练工作区总lint仍有既有版本类型错误；总测试447通过、64失败，原日志保留，未修改旧用例或模型补缺。本阶段检查不能替代历史版本修复。

最终模型SHA-256：`e93a212f07fa7a91348c4e7311dc93f2ece4d3b8ea14d559d40a4d3cbe4f6421`。Policy参数（含5类偏置）66956，替换Value头参数18503；兼容保留的旧冻结Value块不参与推理。数据、schema、源码、原始失败/中断现场、全部模型与检查点均由DELIVERY_MANIFEST.json绑定。
