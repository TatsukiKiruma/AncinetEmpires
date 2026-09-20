# AncientEmpires AI：v7训练决策与执行任务书
## 停止四路重复盲训：先修正实际输入，再构建强教师、空间学生与搜索迭代

日期：2026-09-21。审查分支：`path-b-spatial-ai`。
固定提交：`55177b8ea9459d1b30a83e44eb412fb2f112a4c4`。
对照旧提交：`a0a9dcdd483cb951a72734805504c947176d5d79`。

**性质：源码和已提交报告复核＋待执行建议，不是本次已经完成的项目训练、完整对战或浏览器测试。** 本文作者仅在独立Node程序中复现了课程数组操作和消费上限，不曾独立运行这个仓库的完整引擎。报告事实、源码推导、建议实验分别标注。用户当前需求是解释四模型为何仍弱并给出新的训练路线；不是授权远程发布、租用算力或删除历史产物。

## 1. 结论与方向

这轮不能解释为“四种成熟训练算法都失败，所以需要更大网络”。实际是四个学习模型主要用同一个有缺陷的监督数据流程，最终比赛全部采用直接候选argmax。没有测试NET_B S10或空间神经搜索，不能把40场结果当作搜索路线失败。[E01–E06]

推荐主线：

`冻结Heuristic基线 → 校正数据/模型身份 → 真实多地图policy-only空间学生 → 学生访问状态纠错 → Heuristic引导搜索形成更强教师 → 空间先验改善搜索 → 可信自然value（条件项）`。

保留Spatial-v2的空间编码和PyTorch基础，首轮仍用32通道2残差块；NET_A保留为低成本结构对照；暂停NET_B和临时BC变体的重复大规模重训。这个选型是工程投入建议，不是声称当前Spatial已经优于其他模型。真正的Heuristic仍是当前有实战依据的产品基线。

## 2. 五地图战报能说明什么

来源为`docs/training/reports/agent_upgrade_20260921_v6_01/`下用户指定的Markdown和JSON。[E01][E02]

| 模型 | 自然胜 | 报告记录的自然败 | 未终局截断 | 报告平均决策耗时 |
|---|---:|---:|---:|---:|
| 新BC Ranker | 0 | 9 | 1 | 1.59ms |
| NET_A | 0 | 10 | 0 | 1.11ms |
| NET_B | 0 | 10 | 0 | 1.29ms |
| Spatial-v2 2块 | 0 | 10 | 0 | 22.26ms |

共39次自然败记录、1次截断，不是40次自然败。四模型累计指挥官死亡40次、选出的指挥官重招募动作0次。统计器在`engine.step`之前计重招募，没有验证执行成功；这里的零说明未选出该动作，不能证明40次死亡后都曾出现合法重招募机会。

BC在Duel后手那局达到101回合、5446动作，军力7950:0仍未结束；原始JSON为`MAX_TURNS_TRUNCATION`，Markdown胜者列错误写Heuristic。此局应研究收官，不判为自然失败，也不以军力判自然胜。

JSON只是每局摘要，丢弃了生成器内部的完整末态统计和请求序列；没有保存完整逐步状态、合法候选/分数、实付招募费用、每次失败原因。不能据此逐步还原哪一回合漏招募、何时丢城堡。

这些五张图已经被查阅，属于开发基准。不要继续称其为从未见过的最终留出。每模型只有五图各换边一次，不足以对架构高低作强统计结论；但大面积败北是需要处理的明显开发信号。

## 3. 已证实的核心问题

### F7-01：历史覆盖审计并未实际扫描历史数据【P0】

`tools/v6_commander_specialist_pipeline.ts::runCoverageAudit()`直接构造固定对象，写入2500、2280、1142、618等数值；函数没有逐文件读取、解析或逐局统计。`assetsScanned`只是字符串数组。不能把其报告当作已扫描2500局或实际消费618条重招募示范的证据。[E03]

这不说明历史2500局资产不存在；只说明这轮的审计统计不来自实际扫描。未知值必须保留null，不能再用常量补齐。

### F7-02：本轮D_R30不是2500局历史数据训练集【P0】

`generateCurriculumDataset()`生成21000条一般状态：反复`createDemoState(sdRules)`，每局最多70个底层动作；之后追加9000条手写课程。没有消费历史归档。`seed`主要用于名字与`root_gen_${seed % 50}`，不是50个真实独立地图家族。[E03]

9000课程按代码仅改变A的5种金币、B的3种金币、D的2种死亡计数，其余C/E/F/G各1种配置；忽略样本/episode命名后，最多14种手写状态参数组合，并非9000个独立且合法可达的局面。课程均从P0方向构造。不要据此推断一般状态部分也只有14种；那部分含真实Heuristic轨迹，但起点仍是相同demo。

### F7-03：BC与NET_A/B实际没有消费新增专项课程【P0】

BC循环只遍历`Math.min(dualHeadSamples.length, 10000)`；NET_A与NET_B各只遍历前12000条。课程排在一般状态21000条之后，因此三个模型的新增课程消费数均为0。四轮训练分别是40000/48000/48000次状态呈现，而不是每轮30000条。最终覆盖报告却统一写`trainedSamples: dualHeadSamples.length`。[E04]

必须从实际DataLoader/训练循环记录消费ID，而非报告数据集容器长度。不能仅删除上限后继续用同一批坏课程。

### F7-04：课程生成的单位索引和动作标签存在实质错误【P0】

原demo数组顺序为`u1(P0 commander), u2(P1 commander), u3(P0 soldier), u4(P1 soldier)`。删除u1以后，`state.units[0]`是敌方指挥官u2，不是己方士兵。[E05][E12]

- C“腾空城堡”：把敌方指挥官移到己方城堡，不是让己方士兵占城。
- F“紧急防守”：修改的是敌方指挥官，并让敌军与u3同在(1,0)；构造的攻击者属于P1而请求主体是P0。
- G“立即获胜”：攻击者与目标都变成u2；而且SD下杀死指挥官本身不能自动等同终局。
- E“pending部署”：目标(1,0)仍有u3，且阶段字段需要引擎核验，不能只凭动作名字认定合法。

`addSample()`找不到目标合法动作时，把标签改为`legalActions[0]`后继续训练。这会掩盖课程错误、制造与课程意图无关的监督。[E03][E05]

随包最小复现验证了C/F/G的数组身份问题，但不是完整引擎合法性测试；Agent必须在真实引擎中补上合法、执行成功、后状态符合课程意图的三层断言。

### F7-05：value并非自然终局监督【P0】

一般状态直接`curPlayer === 0 ? 0.3 : -0.3`，课程手填0.1、0.6、0.8、0.9、1.0。NET_A/B和空间训练仍以0.5权重训练value。这不是从自然胜负回填的目标，不能称为胜率模型或直接用作搜索叶值。[E03][E04][E05][E07]

首轮关闭value loss，policy-only重训。可以将有定义且经验证的启发式量另作辅助任务，但不能冒充自然结果。现有value对共享干路影响的大小需要消融，不在报告中虚构贡献比例。

### F7-06：验证/保存与4块部署链不一致【P0】

空间训练已经增加按root/episode分组，这是进步；但`seed%50`假根不能保证不同几何/轨迹家族独立。若无训练分区，代码反而把全数据作为训练，再取前一段验证，直接产生重叠，应失败而非兜底。[E07]

保存条件`is_best or epoch == args.epochs`使末轮必定覆盖先前最佳文件，报告仍显示best_epoch。2块和4块输出在同目录时又共用`train_metrics.json`，不能可靠绑定到同一个checkpoint。[E07][E13]

Python导出`numBlocks=4`和res3/res4；TypeScript loader只加载res1/res2，甚至把architectureId设成2res；predict也仅计算前两块。4块权重经当前TS路径运行不是训练时的网络。[E08][E09]

当前40场比赛加载的是2块文件，因此“丢弃后两块”不是这40场2块模型失败的直接原因；它使后继深度实验及相关性能声明不可信。

### F7-07：BC名称掩盖了特征实现变化【P1】

新pipeline没有调用已经导入的标准`trainSkirmishBcModel/buildCandidateFeatures`，而用45维动作向量自制`(d*73+floor(abs(c[d])*100))%4096`的感知机；仍标`hashed-action-v4`。导出的BC样本文件甚至是`features:[[0,1]]`占位数据，但真实新BC训练绕过该文件，使用上述自制映射。[E03][E04][E06]

不要错误地说“这次BC只训练常量特征”；准确问题是临时算法/特征被命名成原始BC模型，存在身份和兼容风险。此次benchmark按同一个自制映射推理，不能直接指称该benchmark的BC训练推理映射不一致。标准运行时兼容需另外测试。

### F7-08：测试不能验证所宣称的能力【P0/P1】

课程核验把“不招募指挥官”当作存钱成功，即使买普通兵也会通过；把“不招指挥官”当作腾城成功，无需移开占位单位；pending仅检查move/wait。0次机会也返回100%。[E10][E11]

40场报告的文本分析还固定写“第3场2次重招募”，与这份表格和JSON的全零不一致。不得依据这一段宣布完成闭环或部署资格。[E01][E06]

### F7-09：四个被测模型都是即时模仿策略，不是四种不同规划算法【P1】

benchmark对BC、NET_A/B、Spatial一律评分后argmax，没有使用搜索或未来value；Heuristic则组合战术规则，攻击评分还执行引擎克隆与动作模拟。现在是在以简化的模仿策略替换一个已有战术推演的程序。[E06][E14]

这不意味着模仿学习绝不能超过教师；它说明单靠当前同图短轨迹的下一动作标签，没有建立可靠的策略改进机制。DAgger用于补学生访问分布，Expert Iteration用于搜索与学习交替。[M01][M02]

## 4. 新任务：修复到能回答问题为止，不再无限审计

### R7-01｜冻结事实与增加真正的失败型测试

保护旧权重、旧报告、dirty改动；记录实际HEAD/hash。历史统计不重写成新结果，另出更正报告。修pipeline入口防护：import、--help、--dry-run不得自动生成数据/启动训练；当前底部直接main()不安全。

至少写会在当前缺陷上失败的测试：目标动作非法必须拒收；消费范围不得漏课程；0/0输出null；4块不得静默变2块；best与last分别保存；审计空目录不得返回2500；报告胜者与termination一致；BC特征schema不匹配必须拒绝。

**交付：** `audit-v7.json`、测试日志、确切源码位置、当前模型注册表。只列真实可确认的缺陷，不要求补齐所有历史日志才继续。

### R7-02｜统一真实数据与模型身份

扫描历史manifest所列资产，输出实际可读episode、规则、自然终局、合法标签和重招募机会数量。原始数据无读取权限或文件缺失就BLOCKED，不用demo替代后继续声称历史全量训练。

原局、续局、镜像及相邻状态继承真实根ID；按地图家族/初态与来源定义根，不按seed取模。做精确状态去重和近重复说明。先冻结train/dev/final，再生成训练采样。所有实际消费ID至少包括来源、episode、step、subject、stateHash、encoderHash。坏数据按原因隔离，禁止静默换答案。

优先重新生成合法真实课程：从引擎执行“死亡→金币变化→城堡状态→重招募→pending解决”，不直接删除单位冒充完整生命周期。确需手工状态时逐项验证人员归属、占位、可达、动作合法、执行后变化与非终局/终局。

第一轮候选池应覆盖训练分区可用的真实地图、两座位、接触中盘和收官，而不是同图前70步。数量建议先30000个去重有效状态用于修复后基线；这是实际唯一状态，不是JSON行数。课程权重独立记录，复制只增加权重，不增加独立样本数。

**交付：** 实扫manifest、split/去重/隔离记录、真实消费清单、按模型/动作/阶段统计。

### R7-03｜可信模型重训与跨语言一致性

首轮主模型：Spatial-v2、32ch、2残差块、policy-only。输入保持当前已有的指挥官标识、费用和全局信息；补齐明显剩余的同类同价不同兵种混淆时升级schema。精确兵种映射不能以粗类别永久代替。先做64个覆盖多动作的真实状态tiny拟合，再做实际训练。

保存`best.pt/best.json`、`last.pt/last.json`、optimizer、scheduler、RNG和每epoch指标；metrics放每个独立modelId目录并绑定hash/numBlocks/data/split。明确seed、batch、优化预算，统计每类实际消费，不能前N截断。

NET_A只作一次相同训练池/验证协议的低成本对照，不同步重复NET_B/BC多轮网格。BC若评估，恢复标准实现或给临时映射单独schema，不冒充原模型。

2块和4块都用同一golden输入核对Python/TS各层、全候选logit/value/actionCode。4块未实现runtime支持则明确拒载，不能偷偷少跑层。实际棋力实验只用通过一致性检查的模型。

先报告policy准确率、按动作类召回、合法候选规模、等价动作容错、关键错误率和自主对局；不能以高Top-1替代实战。损坏模型使用明确fallback，fallback结果与纯模型分开统计。

**交付：** 一份真正训练完成的空间学生、一份可选NET_A对照、学习曲线、消费证据和parity。无必要不追求同时完成四种模型。

### R7-04｜先诊断连续行为，再做一轮学生状态纠错

在开发根运行学生对Heuristic，保存关键状态：初次不必要冒进、关键占领遗漏、城堡让位失败、可招募却持续漏选、漏防守、军力领先而无法收官。不要只保存终局。

给每个失败窗口固定stateHash，重放三种策略：原学生、只替换当前动作/短动作段为教师后回到学生、教师接管剩余对局。反事实必须相同RNG边界，不能从不同随机轨迹直接作因果比较。选择明显改善的状态做纠错，区分“当前步错误”与“后续长期规划仍弱”。

这一阶段允许Heuristic作纠错教师，目标是接近已知基线，不要求Heuristic先证明能击败自己。标签仍需合法和局部合理；不把教师偏好当作全局最优。

做一轮DAgger式补训：同一架构、匹配优化预算，比较原始训练数据与加入学生状态后的结果。最终集不参与。默认先一轮，有改善再申请/安排下一轮，不无限自动迭代。[M01]

**交付：** 关键失败回放、学生访问状态集、教师标签来源、补训前后同协议比较。

### R7-05｜更强教师先从Heuristic＋有界搜索产生

冻结原Heuristic作为对手。复用已有搜索引擎，但初始不使用伪value；叶评估用明确冻结的启发式局势函数，不能简单累加不同状态的行动优先分当作价值。真实终局优先。

根候选必须包含原Heuristic选择、关键防守/占领/指挥官恢复候选、空间学生建议与少量探索；配额在粗筛之前生效。用动作code去重，不用`type:unitClass`丢掉位置和目标。

搜索针对“己方有效行动序列→真正交接→对手move+attack/集火/反占”而不是只多看一个底层move。记录底层动作深度、玩家交接数、对手完成度。连续己方Action不翻转价值符号。只返回下一个Action，执行后重规划。

设少数工作预算档100/300/700ms，全部满足一个Action约1000ms端到端目标；另做固定节点比较。保留已完成且可比较深度的最佳结果；未完成分支不能靠乐观浅叶冒充已验证优势。搜索无改进证据时回到基线候选是实用保护，不是数学棋力保证。

离线教师可用单独预注册的更高有限预算，但必须与线上预算分开记账。只有在某域的真实对照中获得正向证据，才把该域搜索标签称为更强教师监督。

**交付：** 原Heuristic与搜索增强Heuristic的同根换边结果、成本、选中分支trace。搜索未更强就先修搜索/叶值，而不是让学生蒸馏更差建议。

### R7-06｜搜索蒸馏与空间先验搜索

让通过对应域检验的教师对训练根、学生访问状态生成候选偏好/搜索策略。保存完整候选和搜索预算，软标签或等价最佳集合优于无依据逼学生复刻随机平分决策。普通模仿标签与搜索改进标签分开记录。[M02]

比较四个实际策略：Heuristic、搜索增强Heuristic(S00)、纯空间学生、空间先验＋同一启发式叶值(S10)。S10不应再悄悄使用旧NET_B模型。比较节点与墙钟两面板；若网络开销抵消搜索收益，保持网络用于离线蒸馏或只用于根候选排序，不强行每叶前向。

只有完整自然终局数据来源和独立验证可信之后，才另做value loss与S01/S11。自然胜+1/败-1/真平0从当前样本主体联盟视角生成；截断为null。不要直接使用本轮伪value权重进入搜索。

**交付：** 具体模型/配置hash的质量—成本比较，不以模型名字评定优劣。

### R7-07｜扩大数据与加深：带触发条件，不取消也不盲做

修复后的30k基线完成后，按曲线决定：

- 训练好、独立地图/根差：优先增加不同地图、阶段和学生失败状态；比较30k与100k–150k。
- 训练与开发都差：先检查动作表达、梯度、优化、候选与标签；确认欠拟合后比较2块与4块。
- 离线指标好、实战差：优先DAgger、关键错误和搜索，不直接加epoch。
- 搜索教师也无收益：先改进教师/终局目标与计划范围；更多教师标签不自动更强。

可以沿用`30k/150k × 2块/4块`矩阵，但先运行能回答当前假设的两条边，再补组合。所有arm共享合法schema、真正独立split和训练协议；4块必须先通过TS/Python一致性。固定呈现预算和收敛预算两种比较分开，避免把更多更新次数当纯数据效应。

有稳定收益再到300k及合格训练分区全量。完整扫描2500局≠把全部作为训练；留出数据和不兼容数据不可混入。流式/分片存储并记录峰值内存；不要把近百万条展开JSON对象一次性放RAM。任何规模仅是待注册实验，不是当前已运行或既定最优值。

### R7-08｜真实评测、部署与最终交接

用一个统一runner执行实际模型/策略注册表，不为每轮再写一份旁路。先8局接口smoke，再按有效预算做例如5张开发图×2座位×3种已登记初始化/RNG配置=30局/候选；这只有5个地图家族，不能按30张独立图做置信推断。涉及对手随机性，必须实际注入种子，不能只写文件名。

报告自然W/L/D、截断T、错误E；全部启动对局计入。因资源停止的T不算平、不算输赢，也不得被删除。规则自然结果与材料辅助指标分开。每次step检查success/invalid，重复不进展保护必须生效。每个root同初态换边，模型、规则、配置hash明确。

重招募至少报告：真实死亡事件、仍有恢复可能的窗口、可合法招募窗口、选择、实际成功、随后存活/经济变化。零机会率为null；“腾空”必须检查占位者移开且恢复动作出现，“存钱”必须检查开销和下一窗口，而非只检查没招指挥官。

每局保存可重放动作序列、初态、规则、逐次RNG或确定性种子规范；失败窗口保存状态与候选、policy logits、teacher/search评分、后状态。逐请求e2e由调用方测量；预计算和fallback计入，冷加载单列。真Worker/浏览器验证可并行做，不能以未完成UI阻止可信离线训练，也不能以Node测试授予浏览器1秒资格。

最终只选一个开发候选，在预先冻结未使用的根/地图范围做一次确认。数据少或差异不确定就降低结论范围。默认Heuristic不自动替换；未经授权不push。当前40场的直接greedy模型也保留作历史对照，不改名成“搜索后已胜”。

## 5. 本轮不再犯的决策错误

1. 不能用固定统计、空分母100%、宽松课程判据替代真正验证。
2. 不能把一张demo的短轨迹与少量模板重复，称为完整多地图训练。
3. 不能用新入口绕开既有数据、特征、模型注册和测试，然后仍沿用旧模型名。
4. 不能要求所有UI工作先完成才训练，也不能因为想尽快训练而跳过标签/消费/parity。
5. 不把深网络视为必然更好，不把纯模仿视为永远无法超过教师；用实际比较区分问题。
6. 当前不优先从零PPO/大型Transformer或训练四套庞大网格；先得到一个可信学生和一个实际更强的搜索策略。

## 6. 建议交接结构

```text
training_runs/<new_run_id>/
  inventory/                  # 历史hash与当前代码状态
  datasets/                   # 原始状态/动作、可信split、隔离记录
  consumed_samples/           # 每模型、每epoch真实消费索引
  checkpoints/<model_id>/     # best/last/optimizer/metrics各自绑定
  trajectories/               # 完整初态与可重放行动
  failures/                   # 关键窗口、反事实对照
  search_traces/              # 实际完成的选中分支
  evaluations/                # 自然结果与逐请求成本
  logs/
docs/training/reports/<new_run_id>/
  corrected-v6-evidence.md
  task-status.json
  data-and-training-coverage.json
  inference-parity.json
  comparison.json
  NEXT_ACTION.md
```

每项分开IMPLEMENTED、TESTED、QUALITY、RUNTIME四种状态。任务完成可以是“未证实改进，保留Heuristic”，但不能只有计划或把预期结果填入报告。

## 7. 固定提交证据索引

以下是本次读取的主要源码/报告；不是独立重跑记录。链接固定到审查提交。

- **[E01] 五地图Markdown战报**：[docs/training/reports/agent_upgrade_20260921_v6_01/all_models_vs_heuristic_5maps_benchmark.md](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/docs/training/reports/agent_upgrade_20260921_v6_01/all_models_vs_heuristic_5maps_benchmark.md)。

- **[E02] 五地图JSON摘要**：[docs/training/reports/agent_upgrade_20260921_v6_01/all_models_vs_heuristic_5maps_benchmark.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/docs/training/reports/agent_upgrade_20260921_v6_01/all_models_vs_heuristic_5maps_benchmark.json)。

- **[E03] 数据审计、生成与目标回退**：[tools/v6_commander_specialist_pipeline.ts#L81-L285](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/tools/v6_commander_specialist_pipeline.ts#L81-L285)。

- **[E04] BC/NET_A/NET_B实际训练循环**：[tools/v6_commander_specialist_pipeline.ts#L390-L578](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/tools/v6_commander_specialist_pipeline.ts#L390-L578)。

- **[E05] 手工课程A–G**：[tools/v6_commander_specialist_pipeline.ts#L279-L383](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/tools/v6_commander_specialist_pipeline.ts#L279-L383)。

- **[E06] 真正参赛的四个模型与结果输出**：[tools/v6_all_models_vs_heuristic_5maps_benchmark.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/tools/v6_all_models_vs_heuristic_5maps_benchmark.ts)。

- **[E07] 空间训练、分组与检查点保存**：[python/train_spatial_resnet.py](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/python/train_spatial_resnet.py)。

- **[E08] Python动态残差块与导出**：[python/spatial_resnet_model.py](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/python/spatial_resnet_model.py)。

- **[E09] TypeScript仅加载/执行2块**：[src/game/ai/spatial_conv_net.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/src/game/ai/spatial_conv_net.ts)。

- **[E10] 课程验证判据**：[tools/v6_commander_curriculum_verify.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/tools/v6_commander_curriculum_verify.ts)。

- **[E11] 零机会返回100%的评测实现**：[tools/v6_commander_specialist_pipeline.ts#L735-L812](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/tools/v6_commander_specialist_pipeline.ts#L735-L812)。

- **[E12] demo原始单位数组顺序**：[src/game/demo_map.ts#L40-L60](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/src/game/demo_map.ts#L40-L60)。

- **[E13] 深度实验记录**：[docs/training/reports/agent_upgrade_20260921_v6_01/c68-depth-data-matrix.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/docs/training/reports/agent_upgrade_20260921_v6_01/c68-depth-data-matrix.json)。

- **[E14] Heuristic战术评分与引擎模拟**：[src/game/ai/heuristic_ai.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/src/game/ai/heuristic_ai.ts)。

- **[E15] 统一写成30k的模型覆盖报告**：[docs/training/reports/agent_upgrade_20260921_v6_01/all-model-training-coverage.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/docs/training/reports/agent_upgrade_20260921_v6_01/all-model-training-coverage.json)。

- **[E16] 共享目录下的训练指标**：[training_runs/agent_upgrade_20260921_v6_01/checkpoints/spatial_resnet/train_metrics.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/training_runs/agent_upgrade_20260921_v6_01/checkpoints/spatial_resnet/train_metrics.json)。

- **[E17] 已经扩展的空间v2编码**：[src/game/ai/spatial_tensor_encoder.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/55177b8ea9459d1b30a83e44eb412fb2f112a4c4/src/game/ai/spatial_tensor_encoder.ts)。

- **[M01] Ross, Gordon & Bagnell (2011), DAgger**：[论文页](https://proceedings.mlr.press/v15/ross11a.html)。学生访问状态分布与迭代数据聚合；不保证本项目棋力。

- **[M02] Anthony, Tian & Barber (2017), Expert Iteration**：[论文页](https://arxiv.org/abs/1705.08439)。搜索改进与学习泛化交替；不是当前实现已经符合该算法的证明。

## 附：本次独立复现

`reproduce_v6_curriculum_indexing.cjs`复制了已读取源码中的数组顺序和操作，在Node v22.16.0运行，结果见`isolated_probe_result.json`。验证单位身份、F/G目标及前N消费的关系，不导入/执行仓库引擎，不读取用户完整训练数据，不属于项目单测。
