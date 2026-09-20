# AncientEmpires AI 训练进度复核与后继决策

**版本：2026-09-20 / v4.0，固定提交审计**  
**分支：** `qwen`  
**本次审查提交：** `85a87a0edb64de18a8b8eced9226ffb1cd1b48e9`  
**提交时间：** 2026-09-20 01:17:56 UTC / 10:17:56 Asia/Tokyo  
**实现提交：** `dd6ccc7c35000fb4e3c79a7c87bc326684c7f0c7`；最新提交追加实验汇总文档。  
**前版审查基点：** `cfb07fcc97aff5c2155d3289ddb834ffd1f7522d`  
**配套执行规范：** `AncinetEmpires_AI_Agent_Taskbook_20260920_v4.md`

> 结论：已有真实的工程推进与小规模网络训练记录，但当前证据不足以支持“全局教师合格、价值头合格、1秒端到端验收通过、NET_B棋力优于NET_A、整体升级正式通过”。优先恢复可信的实验与运行时边界，再继续搜索和训练；不推倒已有系统，也不以加层数替代正确性修复。

## 0. 审查范围与证据等级

本次通过GitHub读取固定提交的根目录计划/报告相关章节、训练状态、关键训练/搜索/前端代码、架构比较、数据与分区清单、教师和最终逐局简要记录。**没有在项目环境独立执行 npm test、训练、对战、浏览器时延测试，也没有访问用户训练机的实时进程。** 被忽略的大型训练数据、完整episode轨迹与多数本地日志未取得；因此不能报告“此刻训练到第几轮”或用一个百分比概括训练完成度。

本文区分：**代码可确认**（直接可见的实现/逻辑）、**记录可确认**（已提交文件记载的数字）、**待本机复验**（数据真实性、关联关系、实际时延或棋力）。文中的HOLD是对结论的暂缓，不是删除模块或否认已经做过实验。[S01—S21]

## 1. 当前训练到底推进到哪里

### 1.1 可以保留并继续利用的成果

| 层面 | 当前可见进度 | 应如何理解 |
|---|---|---|
| 编码/数据接口 | 状态356维、动作45维；新增动作反例测试，数据索引与搜索接口有修复 | 是有价值的工程基础；仍需合法可达局面、实际训练入口一致性复验 |
| 双头网络 | NET_A/NET_B架构、保存加载、训练与推理入口存在；有真实局面tiny拟合和A/B结果 | 已达到可开展小规模实验的原型阶段，不是只停留在设计文档 |
| 搜索 | 多来源候选、模型/探索配额、己方续着、真实交接和对手回应trace存在 | 可继续优化；不是完整多回合搜索或已证明的minimax |
| 训练 | A/B各1500条训练、500条验证、3轮的记录存在 | 属于试验性拟合，不应称已完成大规模神经训练 |
| 价值监督 | 另有联合训练脚本，报告MSE下降 | 标签和分区存在实质性问题，泛化资格需撤回重验 |
| 应用 | 神经策略已通过可选入口接入Auto/Sandbox；有浏览器模型文件 | UI接线完成不等于在线1秒安全和棋力验收完成 |
| 工程测试 | 报告声称53套、580项测试通过，lint/build成功 | 本次未独立复跑；新增研究脚本的逻辑错误不因原有测试通过而消失 |

来源：[S02—S05][S08][S12—S16]。

### 1.2 历史大数据与本轮小试验不是同一件事

状态文档记载历史归档已有2500局、977737条样本。这是2026-09-18的归档/校验记录，不是当前NET_B实际使用的训练量。A/B入口实际读取`baseline_dataset/dataset_part_00.jsonl`的前2000条有效样本，按1500/500切开；本轮`dataset-manifest.json`却声明`dagger_round02`的3856条数据。三个数字分别代表不同层次，不能拼接成“NET_B已用近百万条可信DAgger数据训练”。[S03—S08]

建议当前状态页拆成“历史资产”“本轮实际输入”“当前候选模型”“被验证的能力范围”四块。每个训练结果只关联自己的manifest和checkpoint hash。

### 1.3 对当前资格的建议重标记

| 对象 | 建议状态 | 原因 |
|---|---|---|
| 工程实现进度 | `IMPLEMENTED_WITH_OPEN_DEFECTS` | 有实现，但评估与运行时缺陷尚未修复 |
| 神经训练阶段 | `PILOT_TRAINED` | 有2000样本量级试验记录 |
| NET_B优于NET_A | `NOT_ESTABLISHED` | 仅多答对1个验证状态，损失更差，分区也未严格隔离 |
| 全盘教师 | `HOLD` | 不同配置证据混用，新开局资格缺绑定原始对局与有效判据 |
| 残局教师 | `LOCAL_SIGNAL_ONLY` | 4次胜利全来自P0，另一侧均走到保护上限 |
| 价值头 | `VALUE_HOLD` | 自然/裁定/未知结果混用，逐步随机划分有泄漏风险 |
| 端到端1秒 | `NOT_VERIFIED` | 上报耗时被裁剪，前端同步路径没有独立看门狗 |
| 默认AI替换/棋力晋级 | `HOLD` | 缺少对历史冠军和可信留出矩阵的同协议比较 |

这些是本次审查意见，不是执行过新门禁后的机器结果。正式状态应由修复后的验证器重新产生。

## 2. 必须先修的关键发现

### F4-01｜“门禁通过”由模板直接写出，而非由测试条件算出【P0】

`skirmish_final_eval_runner.ts`在完成循环后无条件写入`QUALIFIED_CANDIDATE_FREEZE`，把`lossRate`和`illegalActionCount`固定为0；Gate文档模板固定为`OFFICIALLY PASSED`，还嵌入固定战绩和P95数字。`skirmish_ablation_runner.ts`也把价值资格、0.1538和83.2%直接写入对象。脚本成功退出只能说明脚本走到写文件，不能证明相应门禁通过。[S09][S11]

**影响：** 即使下一次运行失败、输了更多局、价值模型改变或发生超时，也可能产出相同“成功”文字。当前汇总、模型卡与资格声明不能互相循环引用作为证据。

**修复：** 指标聚合器和门禁判定器写成无副作用的纯函数，接受原始记录、冻结协议和模型hash；缺字段、全截断、错误模型或阈值不满足必须输出HOLD/FAIL。加入会失败的反例测试；Markdown只是JSON结果的渲染，不再自行决定成功。

### F4-02｜8局最终评估被写成平局，但全部到达150步上限【P0】

`final-eval.jsonl`的8条记录均为`stepCount=150`，且`winnerAlliance`与`adjudicatedWinnerAlliance`均为空。对应runner恰好设置`maxSteps:150`，用“没有有效胜者”直接判断`draw=true`，没有保存自然终局、预算停止或最大步数停止原因。[S09][S10]

**可以确定：** 该记录没有证明任何自然胜；8局均达到配置的步数上限。

**不能确定：** 在没有完整episode终止原因前，不能把8局都认定为规则自然平局；也不能把它们当自然失败。报告的“步数截断保护停止=0”未获这些记录支持。

**修复：** 游戏结果与执行停止原因分离。未知/保护截断不能获得0.5分、不能作为自然平局价值标签，更不能据此晋级。允许另报材料裁定，但必须单列，不进入自然胜率。

### F4-03｜“新种子留出”没有构成独立局面族留出【P0】

最终测试用9001—9008；根目录汇总写4001—4008。`createHoldoutScenario`只由`seed%2`改变两个单位的位置，形成两个几何模板，且教师方/候选方与奇偶几何关联；与开发消融`createTacticalState`共用同一组demo接触布局。这不是8个独立地图或根家族，换seed不能消除开发局面族重用。[S02][S09][S11]

**修复：** 冻结具体`rootFamilyId→partition`与初始状态hash，不只是声明`holdoutLocked:true`。每个局面/seed做双方换边，不能把几何与候选方绑在一起。最终集应有此前未用来调参的独立根家族，并覆盖实际地图与局势；本次已看过的demo族作为开发回归，不再宣称未见。

### F4-04｜价值训练混入裁定与未知结果，按状态而非对局分割【P0】

`test_dual_head_value_training.ts`使用：

```ts
const winAlliance = ep.summary?.winnerAlliance
  ?? ep.summary?.adjudicatedWinnerAlliance;
```

随后把未找到胜者的情况设为0，并用无seed的`Math.random()`打乱所有逐步样本，再75/25切训练/验证集。这样没有阻止同一episode相邻状态出现在两边，也没有保证0代表规则自然平局。仅用`episodeIndex`连接另一个文件中的结果，缺少档案/episode稳定身份，另有跨文件错配风险。[S08]

**影响：** MSE低可能来自同局相似状态跨集、裁定信号或来源错配，不足以称自然胜负泛化。代码证明防泄漏措施不足；具体重叠比例和错配数量仍需本机数据扫描，本文不虚构数字。

**修复：** 先按来源稳定ID和根家族划分，再在训练分区内部shuffle。只有规则确认的自然终局提供`+1/-1/0`；截断和未知设`null`并mask。旧裁定信号如有研究价值，可作独立辅助任务，不能伪装为自然结果。

### F4-05｜训练入口绕开已声明的可信数据与分区【P0】

A/B入口与价值入口直接读取旧`baseline_dataset`，未消费当前manifest声明的`dagger_round02`，也未消费具体根家族分区；A/B简单按文件前2000行分割。`parseSampleLine`捕获异常返回null，缺少逐原因统计。手工重建GameState未证明与统一重建器在pending、行动阶段及合法动作集合上完全相同。[S05—S08]

**修复：** 让manifest成为输入契约而非装饰文件。每次运行产出真实已使用的样本/根家族集合和hash，统一重建与动作校验，坏样本隔离并计数；首次发现错配就阻塞该数据来源，不默默跳过后报成功。

### F4-06｜上报耗时被裁剪，不能证明1000ms合规【P0】

搜索函数包含：

```ts
const elapsedMs = Math.min(deadlineMs, lastNow - startedAt);
```

`lastNow`来自最近一次检查，且此行在最终选择/返回之前。于是上报值既可能遗漏尾部工作，又永远不超过deadline；用它验证`allWithin1000Ms`无法检出真正超限。`returnTargetElapsedMs`在所读实现中被记录/返回，不构成950ms强制返回控制。[S12]

前端`getAiAction`同步执行搜索，S10耗时徽章直接显示`decision.elapsedMs`，不包括调用方完整耗时和首次模型加载；外层函数写`async`并没有把里面的同步搜索变成可中断任务。[S13][S14]

**修复：** 独立测量调用方实际end-to-end时延，永不裁剪；使用同一个请求预算。将昂贵计算移至worker，由调用方控制取消/过期响应与预校验的廉价合法回退。正常运行和故障注入都测冷启动、排队、编码、搜索、结果校验和发布。浏览器调度存在抖动，不能把看门狗包装成绝对实时保证，真实超限必须保留。[M03][M04]

### F4-07｜教师成绩、资格配置与实际应用不一致【P0/P1】

已提交`teacher-eval.jsonl`中，原残局测试4次`winnerAlliance=0`且教师为P0；教师为P1的另4局均200步无胜者。原开局测试有3次自然负，其余5局200步无胜者。不能把这份记录概括为“原开局0负”或把残局提升推广到双方、全地图。[S18][S19]

后来的`test_normal_qualification.ts`使用`strategicWeight=1,recruitQuota=1`，而搜索默认值为0、0；前端S10与最终runner也没有显式启用1、1。新的开局结果可能来自不同配置，不能拿旧逐局记录替新配置证明，也不能据新配置给默认配置资格。[S12][S13][S20]

**修复：** 教师身份是代码hash＋规则hash＋候选/搜索配置hash＋可选模型hash＋资格域。重新采集原始轨迹和同局换边结果。零失败不自动等于更强；军力4:1不自动等于自然胜。

### F4-08｜搜索“75%胜率”和质量成本前沿存在口径/来源问题【P1】

S10的1胜1“平”被`(W+0.5D)/N`算为75%，这是得分率而非胜率；即便平局有效，胜率也应为50%。若“平”实为截断，连75%得分率也不能作为正式指标。每arm只有2局，12个微基准又共享少量几何模板，不支持稳健晋级。[S02][S11]

消融runner中纯Heuristic的0.2ms/50%与纯神经的0.5ms/0%为直接填写的常量，未由该runner执行对应完整对局得出。没有其他独立日志前，这两个前沿点应标`NOT_MEASURED`。S10“100%保留”实际统计每个状态是否有至少一个model来源候选，不能等同于所有高分模型候选存活，更不能等同于棋力收益。[S11]

**修复：** 所有arms统一执行器，报告真实W/D/L/截断、动作调用次数和时延。分开“候选进入beam”“候选完成展开”“最终选中”“关键动作正确率”。动作变了只说明网络有影响，不能说变得更好。

### F4-09｜模型公共路径被重写，先前实验未与当前模型身份绑定【P0】

价值训练脚本每次最后一轮直接写到`training_runs/models/net_b_checkpoint.json`及浏览器同名资源。这会让策略-only B与后续联合训练B共享名字；已有消融/最终报告不含足以证明它们测试的是当前这份文件的不可变hash链。[S08][S09][S11]

**修复：** 训练输出只能新建run/model专属目录；“部署指针”与训练产物分离。先保护现有文件并计算hash，不盲目删除或恢复。只有通过相应验证的确切模型＋配置组合才能进入可选稳定通道；实验通道明确显示未认证。默认AI仍不擅自切换。

### F4-10｜当前状态表示并非“Feature Hashing且没有空间信息”【P1/P2】

当前神经状态输入由20维全局信息、4×4×6维网格分箱和双方各10×12维实体组成。它有坐标/空间汇总，但丢失细粒度拓扑，实体槽也有容量上限。根目录报告沿用了早期hashed特征/层数的描述，不适合当前网络。[S02][S15]

五类动作编码反例测试值得保留，但只是手工动作向量不相等，没有证明所有动作在测试状态中均引擎合法/可达，更不能推出整个动作空间无碰撞。[S16]

**修复：** 先做可达状态表示审计，再决定增加局部patch、精确网格和mask、威胁/路径特征或小CNN。更深MLP不能凭空恢复输入已经丢掉的信息；但当前数据与评估未修好前，无法证明空间编码就是主要棋力瓶颈。

## 3. 是否应继续增加网络深度

### 3.1 真实架构与结果

| 项目 | NET_A | NET_B |
|---|---:|---:|
| 共享干路 | [256,128] | [256,256,128] |
| 策略头隐藏层 | [64,64] | [64,64] |
| 价值头隐藏层 | [64] | [64] |
| 参数量 | 147970 | 213762 |
| 训练状态数 | 1500 | 1500 |
| 验证状态数 | 500 | 500 |
| 验证Top-1 | 14.0%，70/500 | 14.2%，71/500 |
| 验证策略损失 | 3.9046 | 3.9884 |
| 记录的前向均值 | 470μs | 502μs |

来源：[S04][S05]。前向均值不是完整AI动作调用的端到端耗时。A/B该轮valueTarget为空，属于双头架构的策略-only训练，不等于网络结构只有一个头。

B增加约44.46%参数，验证准确率只多1个状态、损失反而更差。没有独立分组切分、多训练seed与同预算实战，不足以选B为“更强网络”。也不能据此判定加深永远无效。

**建议：保留A与B，不再优先增加C/D更深网络。** 用干净数据、相同呈现/优化预算完成受控A/B。B只有同预算棋力更强，或在等质量下显著节约完整搜索成本，才具有选型理由；否则选A或旧冠军完全合理。

### 3.2 训练量如何增加

先从可信、跨episode/根家族、覆盖开局/接触/收官的5000—10000个状态建立小闭环，上限沿用前版建议30000个唯一状态。不是截取文件前几千行，也不是把历史近百万条数据无差别塞进新编码器。tiny过拟合、验证CE下降、真实棋力是三种不同测试。

本轮不承诺某个样本数必然有效。采用学习曲线判断欠拟合/过拟合，记录每个动作类型的表现和候选数分布；终止/招募等高频易动作不能掩盖击杀、救指挥官、占城等关键错误。

## 4. 1秒预算应该用来做什么

保留用户确定的**每个底层动作端到端1000ms**要求，不改为整回合，不强制每步等满1秒。先修时延测量与取消，再用约100/300/700ms搜索档位做质量—成本对照；850ms停止新增工作、950ms返回目标都是从同一个请求起点计算的工程余量，不是额外赠送时间。

当前搜索已有“根动作＋最多1个己方贪心续着＋交接＋少量对手动作”，不能简单说再把depth从1改2就能看到两回合。应明确记录底层动作数、玩家交接数、完整回合数和被选中分支是否看到有效对手阶段。优先测试move→attack、多人集火、招募→部署、占城与指挥官安全等真实序列。[S12]

我的优先顺序是：**可靠合法回退→可中断搜索→关键候选不会丢→有效对手行动覆盖→有预算的迭代加深/局部静态延伸→神经先验和价值消融。** 不把“更激进奖励”直接加到游戏结果中，也不拿平均80ms证明还有90%可自由使用的真实预算。

## 5. 后续训练路线是否要推翻

不需要推翻。“可信行为数据预训练＋较强搜索教师＋学生访问状态纠错＋受控神经搜索”仍是合理路线。DAgger针对学生行动造成的分布偏移；Expert Iteration把搜索规划与网络泛化连接起来。它们都不能自动修复错误标签、无资格教师和被污染的评估。[M01][M02]

建议只执行一轮有界闭环：

```text
可信规则/数据/结果/时延
 → 历史冠军和现有候选同协议基线
 → 分域合格的搜索教师
 → 学生实际访问状态的单轮纠错
 → 同一结构重训并保存不可变模型
 → 独立价值验证与2×2消融（条件任务）
 → 冻结候选后使用未见根家族评估
 → GO / 局部GO / HOLD，据实选择
```

暂缓从零PPO、大Transformer、多方联盟RL与全面CNN重写。只模仿教师并不直接优化胜率，缺少系统性突破来源；但“行为克隆在数学上绝不可能超越教师”也过于绝对。本项目是否有收益必须由有效比较证明。

必须纳入历史`v4＋启发式收官`候选。状态文档有其独立正常8/16、残局11/12的历史记录，而新方案未提供与它的同协议对照。由于样本、地图、预算不同，不能直接从旧数字判新网络退步，也不能绕过旧冠军宣布新网络升级。[S03]

## 6. 给执行Agent的交接结论

首先执行配套任务书R00—R04：修结果/报告、数据/标签、模型身份和1秒运行时；并准备R05冻结协议。这些是新发现缺口的修复，不是把前版N00—N10全部重做。已修好的索引、动作编码、严格加载与交接代码，应先回归后标`ALREADY_FIXED`。

之后才开展R06有效搜索、R07受控A/B，以及有资格且有预算时的R08单轮纠错/R09价值消融。R10负责同协议最终交付；R11空间表示研究有明确前置条件，不能变成绕开验收的另一个大项目。

最后报告必须回答：**实际训练了哪份数据、得到哪份不可变模型、测试的是哪份配置、自然胜/败/平与截断分别多少、真实端到端是否超限、相对哪个基线更好或没有更好。** 这六个问题比“完成多少任务编号”更重要。

## 证据索引（固定提交，不随分支移动）

下列仓库链接均固定到 `85a87a0edb64de18a8b8eced9226ffb1cd1b48e9`。定位以函数/字段为准。代码事实不等于运行结果；报告声明不等于本次独立复验。

- **[S01] 根目录前版完整任务书**：[AncinetEmpires_AI_Agent_Taskbook_20260920.md](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/AncinetEmpires_AI_Agent_Taskbook_20260920.md)。第0节、第4节、N08—N10：范围、预算、独立评估和1秒契约。
- **[S02] 根目录本轮实验汇总**：[AncinetEmpires_AI_Test_Results_20260920.md](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/AncinetEmpires_AI_Test_Results_20260920.md)。本次被审查的结果声明；不能独立替代原始证据。
- **[S03] 训练状态与历史结果**：[docs/training/CURRENT_TRAINING_STATUS.md](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/docs/training/CURRENT_TRAINING_STATUS.md)。2026-09-18归档/旧冠军与2026-09-20新候选分别阅读。
- **[S04] 实际网络A/B结果**：[docs/training/reports/agent_upgrade_20260920_01/architecture-comparison.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/docs/training/reports/agent_upgrade_20260920_01/architecture-comparison.json)。网络尺寸、参数量、1500/500样本、验证损失与准确率。
- **[S05] A/B训练入口**：[tools/skirmish_depth_comparison_runner.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/tools/skirmish_depth_comparison_runner.ts)。loadDataset、parseSampleLine、main；前2000条、逐行75/25分割、valueTarget=null。
- **[S06] 声明的数据清单**：[docs/training/reports/agent_upgrade_20260920_01/dataset-manifest.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/docs/training/reports/agent_upgrade_20260920_01/dataset-manifest.json)。声明dagger_round02，3856条；与S05/S08实际入口不同。
- **[S07] 声明的分区清单**：[docs/training/reports/agent_upgrade_20260920_01/split-manifest.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/docs/training/reports/agent_upgrade_20260920_01/split-manifest.json)。root_family政策及配额；所读文件没有具体根家族到分区的映射。
- **[S08] 价值训练脚本**：[tools/test_dual_head_value_training.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/tools/test_dual_head_value_training.ts)。loadDatasetWithValues、runDualHeadTraining；裁定值混用、逐步洗牌、2000条、覆盖公共模型路径。
- **[S09] 最终评估入口**：[tools/skirmish_final_eval_runner.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/tools/skirmish_final_eval_runner.ts)。createHoldoutScenario、main；maxSteps=150、无胜者即draw、固定PASS模板。
- **[S10] 最终逐局简要记录**：[docs/training/reports/agent_upgrade_20260920_01/final-eval.jsonl](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/docs/training/reports/agent_upgrade_20260920_01/final-eval.jsonl)。9001—9008，8条均stepCount=150且无winner。
- **[S11] 神经搜索消融入口**：[tools/skirmish_ablation_runner.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/tools/skirmish_ablation_runner.ts)。createTacticalState、runArmMatch、calcWinRate、frontierJson；2局/arm与常量指标。
- **[S12] 搜索教师实现**：[tools/skirmish_search_teacher.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/tools/skirmish_search_teacher.ts)。DEFAULT_SEARCH_TEACHER_CONFIG、searchTeacherAction、selectBeamCandidates；计时裁剪与阶段覆盖。
- **[S13] 浏览器同步适配器**：[src/game/ai/neural_ai_adapter.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/src/game/ai/neural_ai_adapter.ts)。getAiAction、getNetB；同步调用与上报decision.elapsedMs。
- **[S14] Auto调用路径**：[src/game/ai/play.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/src/game/ai/play.ts)。playAutoGame；同步getAiAction，p0默认heuristic、p1默认random。
- **[S15] 当前状态/动作编码**：[tools/skirmish_network_features.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/tools/skirmish_network_features.ts)。356维状态、45维动作；4×4分箱与敌我各10实体槽。
- **[S16] 动作编码反例测试**：[tools/skirmish_network_features_n02.test.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/tools/skirmish_network_features_n02.test.ts)。5类手工构造动作比较；没有引擎可达/合法性断言。
- **[S17] 教师资格声明**：[docs/training/reports/agent_upgrade_20260920_01/teacher-qualification.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/docs/training/reports/agent_upgrade_20260920_01/teacher-qualification.json)。GLOBAL_GO与VALUE_QUALIFIED声明。
- **[S18] 原教师资格入口**：[tools/skirmish_teacher_qualification_runner.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/tools/skirmish_teacher_qualification_runner.ts)。固定demo局面、8局/域、节点150、maxSteps=200、默认战略参数。
- **[S19] 原教师逐局记录**：[docs/training/reports/agent_upgrade_20260920_01/teacher-eval.jsonl](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/docs/training/reports/agent_upgrade_20260920_01/teacher-eval.jsonl)。残局4次P0自然胜；开局3负，其他无胜者且走到200步。
- **[S20] 后来开局资格脚本**：[tools/test_normal_qualification.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/tools/test_normal_qualification.ts)。strategicWeight=1、recruitQuota=1；仅控制台结果输出。
- **[S21] 已有工程命令**：[package.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/85a87a0edb64de18a8b8eced9226ffb1cd1b48e9/package.json)。lint/test/build、tsx依赖；新实验入口须先核对参数及副作用。

- **[M01] Ross, Gordon & Bagnell (2011)**. *A Reduction of Imitation Learning and Structured Prediction to No-Regret Online Learning*. [PMLR论文页](https://proceedings.mlr.press/v15/ross11a.html)。用于DAgger的分布偏移/聚合思路，不替本项目证明教师有资格。
- **[M02] Anthony, Tian & Barber (2017)**. *Thinking Fast and Slow with Deep Learning and Tree Search*. [作者论文页](https://arxiv.org/abs/1705.08439)。用于Expert Iteration的搜索—学习迭代思路，不意味着当前浅层搜索已经是该算法。
- **[M03] MDN**. [Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)。用于隔离同步计算、消息通信、终止worker的工程依据。
- **[M04] MDN**. [Performance.now()](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now)。用于单调时钟与实际耗时测量；主线程和worker的时钟来源须正确处理。

本次查阅日期：2026-09-20。方法文献只提供设计依据；任务中的阈值、预算和实验矩阵是本项目待执行的建议，不是文献给出的最优配置。
