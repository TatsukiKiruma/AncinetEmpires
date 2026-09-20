# AncientEmpires 指挥官重招募专项复核
## 2026-09-21 / v6.0

**审查分支：path-b-spatial-ai；HEAD：a0a9dcdd483cb951a72734805504c947176d5d79。**  
**qwen HEAD：85a87a0edb64de18a8b8eced9226ffb1cd1b48e9。**

本次重新读取远端分支和相关源码，二者HEAD与上一轮一致；并完整阅读了对话附件v5任务书。本次未运行用户项目测试、训练、完整对局或浏览器验证。未取得用户所述那一局完整状态，也未扫描其本地2500局档案，因此不能为该局锁定单一根因、不能报告重招募样本实际为零。

## 1. 直接回答

**不是“死了一次就不能再买”。规则已经支持SD指挥官阵亡后重招募和累次涨价。问题在于部分实际训练/评测入口并未启用这套规则，空间动作编码又缺少区分招募兵种的必要信息。**

无价格覆盖的SD中：基础400；阵亡1次后500；2次600；3次700。费用由getUnitCost和玩家commanderDeathCount计算，不应在模型侧写死。[S01][S02]

SO在当前项目中明确禁用指挥官招募；战役可能有自己的失败/招募限制。“非战役”不能在代码里直接等同于“一律允许重招募”。本轮主要修SD正常遭遇战，不修改SO/战役规则。[S02]

## 2. 机制接入到哪一层

| 层次 | 核查结论 | 证据 |
|---|---|---|
| 死亡与涨价规则 | 已实现 | 死亡计数、费用函数、保留等级/经验、招募执行 |
| 合法动作 | 已实现条件校验 | 名单、现金、单位数、城堡占位、pending等 |
| Observation输出 | 相关信息存在 | 动态recruitCosts、deathCount、reserve等 |
| 旧MLP动作 | 已表达兵种与动态费用 | 45维action-v2招募段 |
| 空间动作 | 有明确缺口 | 同地同动作类型不同招募兵种可能相同输入 |
| 空间策略全局条件 | 不完整 | global仅进入value，不直接进入policy |
| pilot空间数据生成 | 使用禁招默认规则 | 无参createDemoState |
| 空间benchmark/200回合工具 | 同样使用裸demo | 不能验证SD重招募能力 |
| 历史2500局与30k训练实际覆盖 | 未知，需要扫描 | 文件存在/总条数不能代替实际消费证明 |
| 模型是否已学会合理恢复 | 尚未证明 | 需专项独立根及整局前后对照 |

来源：[S01—S14]。

## 3. 有钱仍不招募的几种不同情况

**规则/状态不允许：** 已自然终局、仍有存活/待部署指挥官、不是有效行动方、SO或禁招名单、金币没有达到涨价后费用、单位数已满、没有己方城堡、城堡被普通己军或敌军占据、pending未处理。[S01][S04]

当前指挥官population=0，因此不能仅因人口达到上限就认定应禁招；单位数量上限仍有效。最常被忽略的是**己方普通单位占据城堡**：金币足够也可能必须先移开该单位。[S04][S22]

**候选丢失：** 原始合法动作有commander，但数据/检索/搜索粗筛把它删掉。后面的深网络无法选择一个已经不在候选中的动作。[S13][S23]

**模型不理解或选择错误：** 空间编码未区分兵种/费用、缺少缺席期间的恢复条件、训练示范覆盖不足、教师选择不理想。当前源码只证明前几项结构/入口问题，不证明本地样本数量。[S10—S15]

**执行/展示问题：** 加载失败其实在用初始化权重或fallback；状态过期、模型版本不一致、招募后pending卡住。需要实际modelHash与逐步动作证据。[S16—S19]

**策略上合理延后：** 先解除迫近威胁、先取得自然胜利、先腾城堡。不能把“有钱就必招”做成全局死规则。Heuristic本身已有恢复偏好，但其受威胁城堡分支更早执行，因此不能把每个不招选择都判错。[S15]

## 4. 本轮最直接的新发现

空间数据生成函数generateSpatialEpisodeSamples、空间benchmark和200回合工具都用无参createDemoState。该函数不注入SD规则，而DEFAULT_RULE_CONFIG.commanderRecruitBaseCost为null。[S01][S05—S08]

因此，**这几条路径中的指挥官重招募不是“模型没学会选”，而是规则根本没有提供该动作**。应修调用入口并测试生效rules，而不是把DEFAULT_RULE_CONFIG全局改成SD，破坏原有负对照与自定义规则。

这不代表默认应用界面那一局也是裸demo：应用默认初态走官方遭遇战构造。必须输出用户实际失败状态的effective rules和合法动作，不能把一个确定的局部缺陷扩大为所有场景的根因。[S19]

另需修正以前表述：一些runner的seed未注入状态/策略RNG，但Heuristic使用Math.random。所以准确说法是**seed未控制随机性、地图家族未独立**，不是断言这些对局必然逐步完全一致。[S07][S15]

## 5. 新任务书的顺序

先冻结旧模型与所有策略，捕获失败状态；验证真实死亡→涨价→重招募→pending解锁的生命周期；完成模式、编码、重建、候选和分区的最小前置；扫描全部合格历史档案并补专项课程；对全部当前有效学习模型重训；分别测试每个共享权重wrapper；然后继续v5的Worker、空间搜索、统一评测及数据量/深度对照。

这满足“先专项重训与对比，再继续其余修复”，但不会在已知无法表达正确动作的输入上先浪费一次训练。浏览器工作可并行，不阻塞独立离线重训。

每个模型重训，不等于每个策略都独立训练：Heuristic/Random无权重；NET_B-1ply与NET_B-S10共享checkpoint但分别验证；BC/blend/收官同理。NET_A、NET_B、当前活跃BC和Spatial都应覆盖，不只训练空间模型。

3万/15万×2块/4块矩阵在修复后正式安排；有收益后向30万及合格训练分区全量推进。不会把此前5k—10k流程smoke当最终训练，也不会让旧助手建议预算变成永久禁止扩容的硬限制。

## 6. 验收不只是“终于买了一次”

必须同时验证：多次涨价、正确扣费、已存活时不重复、存钱/让城堡/解pending、禁招或已输时不伪招；无争议应招例的恢复率与延迟；复杂局势合理延后；恢复后是否立即送死；正常开局棋力是否退化；所有模型/策略身份及真实时延。

指挥官死亡不能直接产生自然-1标签，重招募成功也不能直接产生自然+1标签。自然结果由整局真实终止决定，外部保护截断单列。数据聚合与学生状态纠错可以借鉴[M01][M02]，但具体策略必须由本项目实验验证。

完整执行细节、反例、模型覆盖、预算和交接规范见配套v6任务书。文档包内没有伪造的新训练结果；实际结果由执行Agent在新run目录产生。

## 固定提交来源

- **[S01] 规则配置与动态费用**：[src/game/rule_config.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/rule_config.ts)。DEFAULT_RULE_CONFIG、getUnitCost、getRecruitableUnits、canRecruitUnitClass：默认 commander 价格为空；按死亡次数涨价；单位数限制与人口分别校验。
- **[S02] SD/SO遭遇战规则**：[src/game/apk_skirmish.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/apk_skirmish.ts)。getApkSkirmishRuleConfig：SD base=400/growth=100，SO禁用指挥官招募；官方场景构造注入规则。
- **[S03] 死亡、保留等级与招募执行**：[src/game/engine.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/engine.ts)。recordCommanderDeaths/removeDeadUnits、recruit_to_castle/recruit_and_deploy：记录死亡次数与保留等级/经验、扣费及pending；终局由引擎决定。
- **[S04] 合法招募动作生成**：[src/game/rules.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/rules.ts)。getLegalActions 招募段：pending限制、城堡所有权与占位、合法兵种；不能凭有钱直接判定动作合法。
- **[S05] 裸demo初态**：[src/game/demo_map.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/demo_map.ts)。createDemoState(rules?)：无参不注入SD规则；默认规则禁用指挥官购买。
- **[S06] 空间试训数据生成**：[tools/skirmish_spatial_dataset_export.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/skirmish_spatial_dataset_export.ts)。generateSpatialEpisodeSamples 使用无参createDemoState；这条路径不会生成合法指挥官重招募示范。
- **[S07] 空间短局基准**：[tools/skirmish_spatial_match_benchmark.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/skirmish_spatial_match_benchmark.ts)。无参createDemoState、默认80个底层动作；seed仅记录并未传入策略RNG；Heuristic自身会调用Math.random，不能宣称对局必定确定。
- **[S08] 200回合诊断入口**：[tools/run_match_evaluation_200turns.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/run_match_evaluation_200turns.ts)。无参createDemoState；记录seed并不等于控制随机性；需要统一规则、动作/墙钟保护与终局口径。
- **[S09] 训练观察输出**：[src/game/env.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/env.ts)。Observation/getObservation含commanderDeathCount、recruitCosts、reserve等级经验及价格规则；Observation不等于可直接赋给GameState。
- **[S10] MLP状态与45维动作**：[tools/skirmish_network_features.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/skirmish_network_features.ts)。encodeGameActionV2招募段包含unitClass和getUnitCost；状态层仍需审核缺席期间的死亡次数/费用/保留信息。
- **[S11] 空间状态/动作编码**：[src/game/ai/spatial_tensor_encoder.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/ai/spatial_tensor_encoder.ts)。24维动作没有精确招募兵种/价格；空间全局量缺重招募经济链；不是证明历史样本为零。
- **[S12] 空间网络结构**：[python/spatial_resnet_model.py](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/python/spatial_resnet_model.py)。32通道2残差块；global进入value而不进入policy。
- **[S13] 历史归档转换**：[tools/convert_archive_to_spatial.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/convert_archive_to_spatial.ts)。PvP优先顺序截取30k、前48候选、手工重建、局部winnerAfter标签；缺完整消费/来源证明。
- **[S14] 空间训练入口**：[python/train_spatial_resnet.py](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/python/train_spatial_resnet.py)。逐状态random_split、全量JSON载入内存、默认直接部署；重训前需最小修复。
- **[S15] 启发式招募**：[src/game/ai/heuristic_ai.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/ai/heuristic_ai.ts)。scoreRecruit已有shouldRestoreCommander、高恢复优先级和存钱逻辑；受威胁城堡防守分支在前，不能把它的每个选择当绝对最优。
- **[S16] 空间加载与单步选择**：[src/game/ai/spatial_neural_adapter.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/ai/spatial_neural_adapter.ts)。直接argmax；加载异常会使用初始化权重；value仅显示不能当校准胜率。
- **[S17] 策略注册与旧NET_B搜索**：[src/game/ai/neural_ai_adapter.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/ai/neural_ai_adapter.ts)。heuristic/random/net_b_s10/net_b_1ply/spatial_resnet_v1；同一NET_B权重可用于多个策略。
- **[S18] Auto真实调用**：[src/game/ai/play.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/ai/play.ts)。同步getAiAction、200底层动作保护；需后续Worker接入及终止原因展示。
- **[S19] 默认应用初态**：[src/game/default_state.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/default_state.ts)。应用默认通过官方遭遇战地图构造；不能把裸demo缺陷直接归因于用户界面每一局。
- **[S20] 评估与晋级**：[tools/skirmish_evaluation_core.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/skirmish_evaluation_core.ts)。已有纯函数但部分缺失证据可漏检；本轮必须缺字段拒绝资格。
- **[S21] 训练状态与历史资产**：[docs/training/CURRENT_TRAINING_STATUS.md](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/docs/training/CURRENT_TRAINING_STATUS.md)。2500局/977737条为历史资产记录；不等于当前checkpoint的实际训练量。
- **[S22] 已有规则报告**：[tools/apk_skirmish_rule_report.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/apk_skirmish_rule_report.ts)。规则报告源包含SD commander基础费400、population=0；复用对应项目探针并补专项反例。
- **[S23] 搜索教师**：[tools/skirmish_search_teacher.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/skirmish_search_teacher.ts)。候选粗筛/配额/回应搜索需实际trace证明指挥官候选的去向。
- **[S24] 基础命令**：[package.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/package.json)。npm run lint、npm test、npm run build及apk:skirmish-rule-report是现有脚本。
- **[M01] Ross, Gordon & Bagnell (2011)**：[DAgger原论文页面](https://proceedings.mlr.press/v15/ross11a)。支持学生访问状态纠错思路，不保证当前教师的棋力。
- **[M02] Farama Foundation**：[Terminated/Truncated说明](https://farama.org/Gymnasium-Terminated-Truncated-Step-API)。自然终局与外部保护截断必须区分；本项目仍按自己的引擎接口实现。
