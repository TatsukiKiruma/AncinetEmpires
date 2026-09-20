# AncientEmpires AI 后继任务书
## v4.0：恢复可信实验、落实1秒运行时、完成有界棋力验证

**日期：** 2026-09-20  
**仓库与分支：** `TatsukiKiruma/AncinetEmpires` / `qwen`  
**审查基点：** `85a87a0edb64de18a8b8eced9226ffb1cd1b48e9`  
**配套报告：** `AncinetEmpires_AI_Progress_Review_20260920_v4.md`  
**机器可读导航：** `AncinetEmpires_AI_Agent_Tasks_20260920_v4.json`  
**性质：** 下一执行轮的规范与验收标准；不是已经执行过的测试/训练报告。

> 不推倒项目，不把所有旧任务从头重做。先修复会让坏实验显示为成功的链路，再比较搜索和模型。允许结论为“没有提升，保留原冠军”；禁止把GO写成脚本固定输出。

## 0. 执行Agent的入口约定

### 0.1 文档优先级

先读取仓库有效`AGENTS.md`等约定和工作区状态，再通读本书与配套v4审查报告。保留旧版：

```text
<项目根目录>/
  AncinetEmpires_AI_Agent_Taskbook_20260920_v4.md
  AncinetEmpires_AI_Progress_Review_20260920_v4.md
  AncinetEmpires_AI_Agent_Tasks_20260920_v4.json    # 可选任务导航
  AncinetEmpires_AI_Agent_Start_20260920_v4.txt    # 可选启动指令
  AncinetEmpires_AI_Agent_Taskbook_20260920.md     # v3，保留
  AncinetEmpires_AI_Progress_Review_20260920.md    # v3，保留
```

用户最新明确要求与安全/工程约束优先；本轮工作以v4为准。v3中仍有效的规则保护、数据分轨、模型加载、1秒和预算约束继续保留，相关必要要求已在本书重述。代码和可复验产物决定事实；不要为了符合审查报告回退后来已经修好的实现。JSON只是任务索引，不能代替正文。

本书不要求执行者停留在再次写计划。**先完成R00—R04的可执行修复和测试，并准备R05协议；门禁通过且资源允许时继续后续任务。** 缺少某项本地数据则标明BLOCKED，继续独立的代码/合成反例/浏览器故障测试，不伪造训练结果，也不为每个普通修改等待额外确认。

### 0.2 已确定的目标与边界

**范围：** 两方SD对战，保持游戏引擎和规则语义；当前AI以合法动作决策，不扩大到多方联盟RL。

**预算目标：** 每个引擎底层Action，从调用方接受该决策请求到结果返回并完成当前状态合法性校验，端到端目标上限1000ms。包括队列等待、必要的数据准备/传递、冷加载、编码、推理、搜索与返回校验。不是每个候选、每个worker或每层各有1秒；不是整回合1秒。整回合累计时间必须另报。

**保护要求：** 不`reset --hard`，不覆盖dirty改动，不自动切分支、不删除旧数据/模型、不改默认AI、不上传数据、不调用收费云资源、不自动push或发布。不读取无关凭据，不把`服务器交接.md`当远端执行授权。需要资源时先核对本机可用路径，不在日志里泄露密钥。

**实验目标：** 确认具体模型/搜索组合在可信同协议下更强，或等质量下更低成本；不预设NET_B、价值头、DAgger、更多时间必然有用。

### 0.3 事实基线与当前暂定状态

固定提交的实际网络为NET_A共享干路`[256,128]`与NET_B`[256,256,128]`，策略头`[64,64]`、价值头`[64]`；状态356维、动作45维。A/B记录为1500训练/500验证、14.0%与14.2%。当前原始最终8局均到150步且没有winner；代码会裁剪上报耗时并输出固定PASS。详细证据在配套报告和本书末索引。[S04][S09][S10][S12][S15]

本轮初始质量判断为`HOLD`，但实现状态不能统一写成“未做”。已有动作语义、固定索引、严格加载、梯度检验、真实交接等先核验，已修复者标`ALREADY_FIXED`并引用测试。旧N任务编号仅保留历史，以下使用R编号。

### 0.4 状态与门禁不得混为一列

每个任务至少记录：

```text
implementationStatus = NOT_STARTED / IN_PROGRESS / IMPLEMENTED / ALREADY_FIXED
verificationStatus   = NOT_RUN / PASS / FAIL / BLOCKED_RESOURCE
qualityStatus        = NOT_APPLICABLE / NOT_EVALUATED / LOCAL_SIGNAL / HOLD / QUALIFIED
runtimeStatus        = NOT_APPLICABLE / NOT_RUN / PASS_IN_TESTED_ENV / FAIL
```

`IMPLEMENTED`不自动变成`PASS`；单测PASS不自动变成棋力QUALIFIED；探索性评估可运行但不能成为稳定部署的资格。模型、搜索参数或编码任一hash改变，相关旧资格失效，不能沿用同名文件的资格。

## 1. 总路线、依赖与第一批交付

| 编号 | 优先级 | 任务 | 前置依赖 | 主要交付 |
|---|---|---|---|---|
| R00 | P0 | 不可变盘点、真实报告与失败型门禁 | 无 | 证据索引、运行契约、门禁反例测试 |
| R01 | P0 | 自然结果与保护截断分离 | R00 | 结果契约、重算审计、统一聚合器 |
| R02 | P0 | 来源/根家族分区/状态重建 | R00 | 真正消费的manifest、泄漏与重建审计 |
| R03 | P0 | 价值标签与模型身份修复 | R01、R02 | 可信标签、不可变模型注册、旧资格降级 |
| R04 | P0 | 真实时延与可取消在线执行 | R00 | worker服务、故障测试、端到端遥测 |
| R05 | P1 | 冻结多域、同局换边的比较协议 | R01、R02；正式在线比较需R04 | 场景分区、基线矩阵、晋级规则 |
| R06 | P1 | 有效对手阶段与有界搜索改进 | R04、R05 | 搜索trace、质量成本结果、分域教师资格 |
| R07 | P1 | 干净数据上的NET_A/B对照 | R02、R03、R05 | 学习曲线、逐seed结果、深度决策 |
| R08 | P1/条件 | 单轮学生访问状态纠错 | R06合格域、R07/可信学生 | DAgger数据、同结构重训结果 |
| R09 | P1/条件 | 独立价值验证与2×2搜索消融 | R03、R05、可信模型 | 价值资格、S00/S10/S01/S11比较 |
| R10 | P1 | 冻结留出、可选接入、交接 | R04、R05及选中候选的质量证据 | 最终结果、模型卡、可运行选择入口 |
| R11 | P2/条件 | 空间表示瓶颈与轻量替代 | R02、R05、R07；独立预算 | 信息丢失反例与小型对照，或DEFERRED |

可并行R01/R02/R04，但公共schema和门禁由主Agent统一；子Agent分文件所有权，不各自启动一套8-worker作业。R06与R07可在依赖满足后并行；教师HOLD不阻塞可信历史行为数据上的A/B。R08/R09不能靠复制QUALIFIED字段绕开依赖。

第一批交付必须包括R00—R04的实际代码差异、已运行测试/未运行原因、`gate-trust.json`和`NEXT_ACTION.md`。仅出现新的计划表或空报告不算完成第一批。

## 2. R00｜保护现有成果，重建证据与门禁【P0】

### 目标与切入位置

解决固定PASS、固定指标、runId/模型路径复用与无法追溯。重点检查`skirmish_final_eval_runner.ts`、`skirmish_ablation_runner.ts`、`skirmish_teacher_qualification_runner.ts`、`skirmish_depth_comparison_runner.ts`、`test_dual_head_value_training.ts`及相关报告。[S05][S08][S09][S11][S18]

### 实施要求

1. 保存当前分支、HEAD、dirty diff指纹、锁文件hash、Node/npm版本及必要本地资源存在性。新建唯一runId；不得覆盖`agent_upgrade_20260920_01`历史记录。先为已存在公共模型路径计算SHA256和字节数，复制到本地不可变归档后再改训练输出。
2. 建立`RunManifest`、`ArtifactRef`、`EvaluationRecord`与`GateDecision`的类型/运行时验证。记录代码/规则/编码器/样本集合/分区/模型/完整有效搜索配置的hash，及命令、起止时间、退出码、失败原因。缺失字段保持null并阻塞需要该字段的门禁。
3. 所有指标从逐条机器记录计算，所有Markdown由这些指标渲染。移除固定胜负、固定0非法、固定0超时、固定MSE、固定QUALIFIED和固定PASS。描述性文字也必须与同一份结果一致。
4. 资格判定写为纯函数，例如`evaluatePromotion(evidence, frozenProtocol)`。样本数为0、仅截断、模型hash不符、关键资源未验、数据泄漏、超限/非法未解决时，不得输出QUALIFIED。
5. 实验入口不得在模块import时开始训练或写模型；提取纯逻辑，提供显式main与参数解析。至少支持明确runId、输入manifest、输出目录、预算文件和模式；具体CLI参数在实现前不是现成命令。`--help`和纯import不得产生训练副作用。
6. 恢复已有实验的证据链：汇总/原始记录不一致时标`DISPUTED`并列出来源，不凭更漂亮的数字覆盖较差记录。无法恢复完整证据的结果只保留历史说明，不用于正式晋级。

### 必须运行的反例测试

- 全部输棋；全部未终局；缺少模型hash；空JSONL；非法动作非0；某个请求耗时1200ms；输入分区重叠：均不能得到晋级PASS。
- 模拟缺少原始值，验证报告输出“未测”而非0；改变模型字节，旧资格不能继续通过。
- 同一原始记录重新生成报告，指标与判定一致；所有摘要中的W/D/L/截断数字与JSON一致。
- 导入实验模块和调用`--help`不创建checkpoint、不扣训练配额、不启动对局。

### 验收与交付

交付`inventory.json`、`evidence-index.json`、`historical-evidence-audit.md`、`run-manifest.json`、纯聚合/门禁模块与测试日志。验收以“坏记录会被拒绝”为核心，不以生成更多PASS文件为核心。重实验尚未运行时测试状态如实标NOT_RUN。

## 3. R01｜自然胜负、自然平局与执行中止分开【P0】

### 实施要求

统一所有教师、消融、最终评估、训练结果解析器，禁止：

```ts
winnerAlliance ?? adjudicatedWinnerAlliance // 当作自然胜者
winner == null                            // 当作自然平局
```

引擎规则本身不变，只修记录与消费语义。真实规则有自然平局才记录draw；不知道是否终局就记unknown，不擅自补一个平局规则。

每局最少保存：

```text
episodeId, rootFamilyId, initialStateHash, seed, candidateSeat, candidateAllianceId,
policyIds, resolvedConfigHashes, modelHashes, rulesHash,
engineTerminal, naturalOutcome, winnerAlliance,
terminationCause, stoppedByMaxSteps, stoppedByPlyLimit, stoppedByWallBudget,
adjudicatedWinnerAlliance, adjudicationMethod,
rawActionCount, playerTurnTransitions, fullRounds,
illegalActionCount, fallbackCount, decisionDeadlineMissCount,
startedAt, finishedAt, completeTraceRef
```

`naturalOutcome`建议为`WIN/LOSS/DRAW/UNRESOLVED`；`terminationCause`建议区分`RULE_TERMINAL/MAX_STEPS/PLY_LIMIT/WALL_BUDGET/ABORT/ERROR/UNKNOWN`。这些名称需映射实际引擎，不改变规则的含义。若游戏原规则的回合上限本来就决定终局，必须凭规则证据区分它与评估器人为预算上限，不能只看字段名字。

### 指标口径

令W/L/D为自然胜/负/平，T为未解决截断，E为执行错误，N为全部启动局数。报告每项原始计数，不隐藏错误和失败。

- 自然胜占启动局比例：`W/N`，清楚标注分母；不要把T说成自然败。
- 已解决局得分率：`(W+0.5D)/(W+L+D)`，只作条件描述；有T时存在选择偏差，不能单独用它晋级。
- 在E=0时，全部启动局的结果不确定性范围为`[(W+0.5D)/N, (W+0.5D+T)/N]`；不得把T默认填0.5。正式比较可使用预注册的保守上下界，或完成足够多自然终局后评估；不能事后选择较好口径。
- `scoreRate`与`winRate`分字段；材料优势、自然胜、不败率和覆盖率分别命名。

### 历史重算

先针对当前8条150步最终记录与16条教师记录恢复完整episode。如找不到，记录“到达步数上限、终止原因缺失，不能认证自然平局”，不篡改原JSONL。把旧报告的8平、不败、零截断标成待重验。新增重算文件保留引用链。[S10][S19]

### 必须运行的测试与验收

自然胜、自然平、maxSteps且无winner、仅有裁定胜者、超时、异常、联盟ID不等于playerID均覆盖；单个字段缺失不能误判自然终局。聚合器必须检验计数总和、分母与记录条数相符。自然标签消费与对战指标消费使用同一结果解释器。

交付`outcome-contract.md`、`outcome-audit.json`、`historical-outcome-reanalysis.json`、反例与回归日志。没有终止原因的旧样本只能进入UNKNOWN/隔离区，不能靠手工描述恢复为合格标签。

## 4. R02｜让实际训练消费可信数据与根家族分区【P0】

### 实施要求

1. 统一稳定来源身份。至少`archiveHash + sourceEpisodeId + rootFamilyId + stepIndex + subjectPlayer/alliance`，必要时包含分片身份。不能用另一个文件第几行当全局episode身份，不能把同一档案不同分片的episodeIndex相同视为同局。[S08]
2. 建立可枚举的根家族映射。原局、截取快照、续局、镜像/旋转增广继承同一分区。先划分根，再在训练分区内shuffle；开发和最终集不进入训练/标准化统计/教师调参。
3. Loader显式消费manifest所列文件和split映射，验证文件hash、schema、编码版本、规则版本及指定用途。输出`actual-consumed-samples.jsonl`或可验证的等价索引，含唯一状态/episode/根家族数，不能只报“采样2000条”。
4. 拒绝“文件前N行”作为正式训练抽样。采用确定性、跨根家族和阶段分层抽样；记录每根最多样本数、权重与重复状态分布，防止单局长轨迹主导验证。
5. 统一GameState重建入口；逐字段处理pending、已移动/已行动、单位待部署/堆叠、当前玩家、经济、地形、规则等当前引擎必需信息。以引擎生成的合法动作集合和单步结果校验，不能仅把字段填成null就称重建完成。
6. 复查动作index/code/候选顺序。标签必须映射到本状态真实候选；候选置换后语义标签不变。坏行不默默吞掉，按JSON损坏、规则版本、重建、非法标签、索引错配等分别计数和隔离。
7. 旧977737条归档只是待审资产；先以可恢复的完整观察/episode导出小批。无法可靠还原完整状态的旧hashed-only特征可保留旧模型用途，不能冒充356/45输入的新网络数据。

### 强制测试

- 同一个根的镜像、续局不跨分区；不同分片同episodeIndex不会错连。
- 训练/开发/最终根集合交集为0；精确重复状态与近重复家族另报，不只查seed。
- 样本标签不在候选、错序fixed index、错误player/alliance、缺pending状态、错schema均被拒绝。
- 至少对不同阶段、特殊动作与大单位数的真实可达状态做重建后合法动作集合/执行结果对照；数量预注册且记录覆盖，不拿5个手工向量例子宣称全空间无碰撞。
- 训练命令指定的manifest与实际打开文件一致；换错文件/hash必失败。

### 验收与交付

`dataset-manifest-v4.json`、具体`split-manifest-v4.json`、`leakage-audit.json`、`reconstruction-parity.json`、`quarantine.jsonl`、消费索引与日志。正式训练准入至少满足根集合无交集、标签合法、实际输入一致和规则/编码器版本明确。

## 5. R03｜修复自然价值标签与模型注册【P0】

### 实施要求

只有R01确认规则自然终局且R02来源精确匹配时，生成从样本subject阵营视角的结果：赢+1、输-1、规则自然平0；未解决、裁定、未知或身份无法匹配为`valueTarget=null`，价值损失mask掉。所有样本仍可按各自行为标签资格单独决定能否参与policy训练，不因value缺失粗暴删除合法行为数据。

保存`valueTargetSource`、`terminalEpisodeId/hash`、`subjectAllianceId`和`valueMask`。默认不加伪终局收益、不因材料优势赋+1、不因为缺winner赋0。若确需材料辅助任务，独立字段/头/权重/指标，不替代自然结果头。

值训练脚本统一使用R02 loader；训练内随机顺序有显式seed；开发仅评估、不参与shuffle后重新切分。报告2000或2800必须来自实际消费计数。[S08]

训练输出使用`training_runs/<runId>/checkpoints/<modelId>/`，模型文件不可变；metadata绑定数据/分区/编码/优化配置、训练seed和参数数量。恢复训练的optimizer checkpoint与仅推理部署模型分开。

禁止训练脚本直接写`src/game/ai/models/net_b_checkpoint.json`或覆盖全局`training_runs/models/net_b_checkpoint.json`。提供显式部署/实验通道指针更新步骤，校验资格对应确切hash后才更新；用户默认AI保持不变。

旧价值头暂记`VALUE_HOLD`。S01/S11可为调试显式启用，但界面/报告标“未认证价值头”，不可把它们当已通过部署与训练教师资格的分支。当前浏览器文件不因HOLD自动删除；先归档hash，保留显式实验选择和稳定回退。

### 必须运行的测试与验收

自然胜/败/平视角正确，联盟号与玩家号不同仍正确；截断/裁定mask=0；缺失源episode拒绝关联。相同输入与seed的采样集合和初始权重可复验。训练不会改动任何旧checkpoint或浏览器模型文件。模型变更后旧资格不能通过。

交付`value-label-audit.json`、`model-registry.json`、`checkpoint-manifest.json`、反例日志与迁移说明。本任务通过仅代表标签/产物链正确，**不意味着VALUE_QUALIFIED**；值泛化在R09验证。

## 6. R04｜去掉假合规，建立真实1秒请求边界【P0】

### 6.1 计时与控制边界

删除`Math.min(deadlineMs, elapsed)`式上限裁剪；最终时间取当前时钟，不使用上次轮询缓存值。日志必须保留1200ms就是1200ms，不能显示1000ms或999ms。测量使用单调时钟；以调用方请求t0/tEnd计算权威端到端时间。[S12—S14][M04]

搜索内部各阶段单独计时用于诊断，不拿内部search时间替代完整动作耗时。主线程/worker的`performance.now()`原点不能直接假定相同；使用明确的时钟规范或调用方看门狗＋保守剩余预算。首次加载若发生于请求内必须计入；启动前预加载可单列启动成本，但不得隐去首次请求的等待。

从一个t0起算：建议850ms不再开始新搜索工作，950ms为返回/验证目标，1000ms为调用方截止目标。配置小于1000ms时各阈值同步缩小且严格有序。设置阈值本身不等于控制已落实。

### 6.2 执行架构

把昂贵搜索/推理移入可终止的worker或等价隔离执行单元。单纯`async`/`Promise.race`包住主线程同步循环不能使计算可中断。[M03]

每个请求包含`gameId, requestId, stateVersion/stateHash, playerId, policyId, modelHash, configHash`。调用方保有当前状态与至少一个经过校验、可在余量内交付的合法回退；禁止超时以后再启动一次可能很慢的完整Heuristic搜索。提前生成回退需要的成本也应在对应请求/明确预计算阶段记账。

取消、换图、下一步、切换策略、停止Auto、重开对局后，旧worker响应不得施加到新状态。超时作废请求并使用同状态合法回退，必要时终止/重建worker；每对局最多一个有效待执行AI请求。若状态已变化，旧动作直接丢弃，不能套用旧候选合法性。

浏览器主线程调度与操作系统并非硬实时环境。实现的是可取消/可降级的截止策略；**真实超限仍必须作为超限记录**，不能宣称对任何机器任何负载绝不超过1秒。UI保持可响应与决策超时是两个分别验收的指标。

### 6.3 故障注入与测量矩阵

测试冷加载/热缓存、正常/密集单位/候选爆炸、无可行动单位、即刻自然终局、模型缺失/损坏/NaN、评分器故意慢于1200ms、worker不回复/抛错、迟到响应、连续取消及换图、恢复标签页/人为主线程阻塞。

必须证明慢worker不会阻塞UI处理取消，超时不会施加迟到动作，日志保留真正超限；不同环境分别报告，不通过去除慢样本提高合规率。目标环境没有浏览器测试能力时记`BLOCKED_RESOURCE`，不能用Node微基准替代浏览器验收。

每个请求记录：`e2eMs, queueMs, stateTransferMs, modelLoadMs, encodeMs, policyMs, searchMs, validateMs, actualReturnMs, deadlineMiss, fallbackUsed, cancellationReason`，不一定所有字段可相加（并行阶段应标注）；未测字段为null。汇总计数、P50/P95/P99/Max、超限比例、fallback比例、冷/热分层及整回合累计等待。

### 验收与交付

`online-contract-v4.md`、`decision-telemetry.jsonl`、`browser-fault-tests`日志、`online-latency-report.json`、异步适配器与调用方更新。正常冻结矩阵若有1000ms超限则该环境性能门禁FAIL并继续定位；故障注入重点验收正确降级与诚实遥测，不能故意制造主线程阻塞再伪造全部合规。

## 7. R05｜冻结可比较的评估，而不是只换种子【P1】

### 基线与场景

至少核对并按用途纳入：原Heuristic、可恢复的历史`v4＋启发式收官`冠军、纯NET_A/NET_B策略、S00无神经搜索、S10神经先验搜索；S01/S11只在R09条件满足后作为合格候选，未满足时仅作诊断。旧冠军本地资源缺失则标BLOCKED，不以Random冒充替代。所有前沿点必须真实测量。[S03][S11]

场景覆盖实际正常开局、接触中盘、优势/均势/劣势残局、水路/瓶颈、经济招募、特殊行动等。优先从合法episode抽取可达快照；手工局面必须通过状态/占位/地形/规则校验。不要把同一demo的两个坐标变体包装成大规模泛化集。

先建立具体train/dev/final根家族映射。每个根场景与seed对候选和基线用一致初态，并交换双方座位；记录几何与阵营映射，避免“候选为P0总是容易布局”。随机数种子和引擎RNG状态显式控制；搜索展开顺序不得悄悄改变真实对局的RNG流。

### 双预算面板

- 节点/调用预算固定：比较算法在可比搜索资源下的质量，同时记录完整CPU时间和编码成本。
- 调用方墙钟固定：比较真实产品预算下的结果；worker开销、fallback和未完成搜索均计入。

硬件、线程数、冷热状态、编译模式、浏览器版本、实际生效配置都写进报告。网络前向μs与整步搜索ms不能混成同一成本轴。测试战略/招募改动时明确`strategicWeight`与`recruitQuota`，不能从不同配置的资格取最好部分拼成一个模型。

### 冻结判据

在看本轮正式结果前写`eval-protocol-v4.json`：主假设、主对手、比较方式、自然终局/截断口径、最大steps/plies/墙钟、独立根家族最低数、每域分配、置信区间方法、可接受退化范围、停止条件与晋级方式。

建议先用不超过8局作为接口smoke，随后按多域开发矩阵筛选**一个**最终候选。最多128场最终额度可分配为32个独立根家族×2座位×2个对手；这是预算规划示例，不是保证统计功效充分。实际分配必须在运行前冻结，若资源不足下调并标明证据强度。

对于针对特定对手的棋力优越声明，建议以同局换边成对得分为主，在根家族层计算95%不确定区间；完整解决且无错误时，区间下界须高于0.5才称本轮有可信优越信号。与旧冠军的非劣界、分域容忍度和成本改善幅度也必须事前明确，不能看完结果后放宽。

多个seed复用同根的轨迹不当独立根计数；同局几百个动作不能当几百局样本。全是真正自然平局可证明某些事实，但不能证明更强；全截断既不能证明非劣，也不能靠bootstrap生成看似精确的平局区间。有未解决结果时采用事前冻结的保守界或HOLD，不删除这些局。

### 验收与交付

场景/分区/对手/候选hash冻结、同局换边可复验、结果分母明确、成本来自真实请求。交付`scenario-manifest.json`、`baseline-matrix-v4.json`、`eval-protocol-v4.json`、`promotion-policy-v4.json`、接口smoke原始记录。最终集此时不用于调参；已查阅的旧holdout转为开发回归。

## 8. R06｜把预算花在有效对手阶段，而非盲目加深【P1】

### 目标与基线

以现有搜索作为可复验基线，保留真实引擎clone、合法动作检查、根阵营视角、规则终局优先、模型/探索候选和交接修复。当前默认只多补1个己方行动、每条回应最多1个对手行动，不足以等同完整对方回合；“看到了一个对手move”也不代表看到了move→attack或多单位集火。[S12]

### 实施要求

1. 为当前搜索建立可解释轨迹：完整动作序列（含交接动作）、各步行动玩家/阵营、终局与截断、候选进入/展开/完成状态。`selectedSawOpponentPhase`必须来自实际选中分支，不用其他分支的全局flag替代。
2. 定义`rawActionDepth`、`playerTurnTransitions`、`fullRounds`、`opponentActionsCompleted`、`opponentPhaseComplete`。不要给同一个`depth=2`同时赋予两个动作与两回合含义。
3. 先实现有界的对手阶段补全/威胁延伸：对手move后可能攻击、多个单位集火指挥官、占城与反占、招募/部署等。每条延伸设动作上限、节点上限和剩余墙钟检查；不能为“完整回合”无限展开。当前只回一个动作给真实引擎，长序列仅供规划，每步真实执行后重新校验。
4. 使用迭代加深或分层beam的已完成迭代作为可随时返回结果。未看到对手的浅叶与已完整响应的深叶不能无标记混排；预算不够时保留上一个可比深度的最佳合法动作，或使用明确的可信回退。完整终局可直接短路。
5. 候选保留必须作用于真正的展开集合。有限`prefilterWidth`下，要测试高优先模型/关键占领/必要防守/招募动作是否在前置粗筛已丢失；后面的quota不能挽救已删动作。模型、启发式与探索的合并去重/配额顺序明确，关键候选数量超出预算时诚实记录被裁剪情况。
6. 不以固定进攻奖励逼模型冲锋。任何tempo/推进/指挥官安全改动作为独立启发式消融，仅用于非终局评估，不改自然胜负。根阵营价值视角、终局优先量级、伤亡/经济尺度要可解释。
7. 只选少量预算档做对照：建议搜索目标约100/300/700ms，仍受R04同一1000ms端到端约束。节点面板另冻结对应上限，不把墙钟超过的运行隐去。先profile合法动作生成、克隆、启发式评分、网络批次等成本；1秒不是必须等待到的时长。

### 战术反例集

至少含：移动后攻击、己方组合后遭对手集火、指挥官受威胁但材料看似占优、能自然结束的斩杀、招募被移动候选挤出、占领后反占、不同座位同一逻辑局面、预算恰好在交接前耗尽、预算在首个对手move后耗尽。每例用引擎回放确认路径合法，不伪造value与胜利。

### 教师资格

教师资格绑定`code/rules/config/model/encoder hash + domain + evaluationProtocolId`。在R05开发矩阵中与Heuristic和可用旧冠军比较，实际自然胜/负、截断、决策错误和成本共同决定资格。若仅某类残局有效，资格仅限该域；零自然胜、全截断不能因“不败”获得GO。

旧endgame的4次胜利全来自P0，需明确复验另一侧；新开局战略参数为1/1的配置必须单独登记，不给默认0/0配置借用其结果。[S19][S20]

### 验收与交付

`search-horizon-contract.md`、`search-profile-v4.json`、`candidate-survival-v4.json`、`selected-branch-traces.jsonl`、`teacher-eval-v4.jsonl`、`teacher-qualification-v4.json`和失败局面。允许`LOCAL_QUALIFIED/HOLD`；未合格的教师不得开始该域正式纠错标签生产。

## 9. R07｜受控NET_A/NET_B：先验证深度有没有收益【P1】

### 实验设置

首先核对模型实际spec，不抄根报告错误的128-64或256-128-64描述。主实验固定状态356/动作45输入、相同heads：

```text
NET_A: trunk=[256,128],     policy=[64,64], value=[64]
NET_B: trunk=[256,256,128], policy=[64,64], value=[64]
```

这比较的是“加一层且增加参数”的实用选型，不是纯粹深度因果实验。若要拆分深度与容量，参数量匹配的加宽控制组只能作为另一个条件实验，不能在有限fit预算里自动追加。

采用R02可信数据。起步5000—10000唯一状态可按实际可用资源下调，最多30000；跨根、阶段、动作类别，不能挑选容易拟合的开局前几千行。训练/验证/最终分区固定，标准化只拟合训练集。

A/B使用相同优化器、学习率计划、batch策略、样本呈现预算、候选处理和验证次数。目标各3个初始化seed，起步3epochs；最大12epochs须预先冻结且总呈现预算允许。只有一个seed时报告“单seed试验”，不能宣称架构普遍优越。若某模型不收敛，学习率变更必须给A/B公平的预注册处理，不只给B额外优化机会。

### 三种不同的检查

**数值/可学性：** 沿用并复验已有梯度/加载测试。在最多64个真实状态上做tiny拟合，包含不同动作与困难状态；检查梯度、有限性和标签一致性。未达到很高准确率时检查冲突标签、等价动作及不可区分输入，不机械追求100%后宣布棋力达标。

**离线泛化：** 保存每轮policy CE、Top-1/Top-k、按动作类别与阶段分组准确率、合法候选数分布、样本/根家族数。多个等价最优动作应有集合标签/软标签或单独容错统计；总体Top-1不能惩罚等价选择又奖励无关高频动作。

**实际能力：** 对固定checkpoint，在R05同一基线/地图/座位/预算下测纯策略和S10用途。前向耗时、完整候选评分、端到端动作时延分别报告。A/B每个seed的坏结果同样保留。

### 选型规则

14.0%到14.2%只对应500条中多1条，不能复制旧推荐作为本轮结果。[S04] 在冻结主指标上B有足够证据更强、或同质量搜索成本更低，才选择B；否则选择A、保留并列候选或旧冠军都合格。架构选型与具体单个checkpoint的胜负结论分开，不能把某个seed幸运表现推广为架构结论。

### 验收与交付

`architecture-specs/`、`train-configs/`、逐seed不可变checkpoint、`learning-curves.json`、`architecture-comparison-v4.json`、`depth-decision-v4.md`。每个指标可由实际数据重算。训练fit配额不足则完成已注册的最小对照，剩余记DEFERRED，不能隐形启动额外拟合。

## 10. R08｜一轮有界DAgger/搜索纠错【条件任务】

### 准入

有可信学生和R06取得资格的教师域；R00—R05无相关阻塞；预算账本有查询、样本和fit剩余。教师开局HOLD时只允许合格残局域；不能为了完成任务把GLOBAL_GO手工打开。

DAgger针对学生自己行动后访问的状态，不能只把启发式轨迹重新贴标签就声称已纠正学生的分布偏移。搜索—学习交替可借鉴Expert Iteration，但当前实现与资格仍需本项目检验。[M01][M02]

### 实施要求

1. 冻结学生和教师hash，在训练根家族中运行学生/冻结混合策略，采集实际访问状态。优先查询学生/教师分歧、明显失败前局面、关键防守/招募遗漏；先对采样策略预注册，不从最终集寻找反例再训练。
2. 每条记录保存state重建证据、行为动作、教师建议、候选/评分、预算、选中分支阶段覆盖、是否截断、标签来源和资格域。行为、建议、结果是三条不同轨道；不得用教师score伪造自然z值。
3. 教师预算耗尽、关键候选未完成、公认反例未处理时，不作为高置信正式纠错标签。探索性标签另存，并记录拒收原因和占比。
4. 教师查询上限沿用全局<=2000；同一状态不同教师/配置分别计数。离线教师可以用预注册的更大但有限预算，明确它不是线上1秒档；成本计入同一总账。
5. 合并可信旧行为与新纠错数据时冻结混合比例/采样权重，避免少量长局统治训练。使用同一已选网络结构、相同初始化/训练预算对比纠错前后；没有对应公平基线就先补证据而不是同时改架构。
6. 默认只做1轮。若没有正收益，保留反例和模型，不继续自动加轮、加奖励或扩样直到赢。

### 验收与交付

`dagger-query-log.jsonl`、`dagger-dataset-manifest.json`、`teacher-acceptance-audit.json`、不可变学生checkpoint、同协议开发比较和`dagger-round-decision.md`。允许“新数据没有收益”；不凭训练loss下降宣布纠错成功。

## 11. R09｜独立价值资格与2×2消融【条件任务】

### 11.1 价值模型准入

使用R03自然结果标签与R02独立根划分；标签有足够自然胜/败/平及阶段覆盖。只有少量同一局邻近状态时标数据不足，不进行VALUE_QUALIFIED认证。

最低比较包括训练集均值常数基线，以及在开发集冻结的简单材料/局面基线；不能只挑非常差的基线制造大百分比收益。报告MSE、每类/每阶段误差、结果分布与样本/episode/根家族数；近终局预测好不代表开局价值有效。训练均值不可用开发标签计算。

加入标签随机置换/错连接的负对照，检验数据管线不会把明显错误标签也认证为成功。负对照在独立分区上若异常优秀，应调查泄漏/信息捷径；并非要求有限小样本下某个数值严格等于理论常数。

R09训练若与既有policy-only模型比较，输入、分区、初始化seed、policy训练预算保持一致，只改变明确的价值损失因素；若同时改数据和网络，就不能把收益单独归因于价值头。

价值资格至少需要：输入链正确、自然标签正确、独立开发效果优于冻结基线且非单类/单阶段假象、推理有限且视角正确。只有数学误差改善而无搜索收益，最多称“价值预测通过开发检验”，不称“完整神经搜索棋力通过”。

### 11.2 2×2搜索矩阵

| 分支 | 候选先验 | 非终局叶评估 |
|---|---|---|
| S00 | 启发式 | 冻结启发式局面值 |
| S10 | 神经策略先验＋明确候选配额 | 同S00 |
| S01 | 同S00 | 已独立验证的价值头 |
| S11 | 同S10 | 同S01 |

同局、同座位、同预算、相同根候选规则和相同checkpoint身份；纯策略、Heuristic也要真实执行才能进入质量成本图。不能手写0.2ms/0.5ms、0%/50%或沿用其他模型的结果。[S11]

真实终局仍由规则短路，网络不能覆盖自然胜负。价值尺度与启发式值不同，融合/缩放参数必须在开发集冻结；原来的`scale:1000`只是配置，不是已校准的正确量级。对NaN/非有限/错误视角拒绝使用并记录fallback。

分别报告候选注入率、完成展开率、选中率、动作变化率、战术正确率、自然对局结果与成本。动作不同不等于更高价值。若S01/S11无实战收益，则选择S10或S00；不能为了双头“闭环完整”强行启用value。

### 验收与交付

`value-qualification-v4.json`、`value-baseline-eval.json`、`neural-search-ablation-v4.json`、全部逐局/逐请求原始记录、`quality-cost-frontier-v4.json`。模型/分区/配置hash变化后旧资格不再适用。fit配额不足或自然结果不足则DEFERRED/HOLD，不挪用无资格数据。

## 12. R10｜冻结候选、一次留出评估与可选交付【P1】

### 正式评估

从开发结果选出一个候选，锁定全部模型、搜索、编码与规则hash，记录选择理由及适用域。按R05预注册最终矩阵运行；不在看到结果后调参继续称同一holdout“未见”。最终失败或精度不足可以HOLD，消耗过的根家族必须标已见。

正式结果由R00/R01自动聚合，给出主比较、分域/座位、自然结果与截断/错误、P50/P95/P99/Max和成本。不得以“零负”“材料领先”“代码测试全通过”代替质量判据。所有启动和中途失败对局进入记录和预算。

### 产品接入

前端AI服务使用R04异步可取消边界，Auto/Sandbox保持现有功能；状态改变时旧动作作废。将推理核心与训练fs/目录扫描等副作用分离，检查浏览器bundle不会导入训练入口。显示具体模型版本、实验/合格状态、真实耗时、fallback和取消原因。

允许保留显式实验策略，但没有资格的模型不能叫“已验证升级”。只有具体hash组合通过对应门禁才更新可选稳定指针。默认AI不自动切换；当前Auto默认双方策略各自原样保留，不把Random一侧擅自改成别的策略。[S14]

回退采用显式策略/版本指针或保留的合法基线，不建议删模型文件。浏览器静态打包模型与本地训练路径不是同一运行时资源，回退测试必须覆盖真实加载路径。

### 最终交接

更新`CURRENT_TRAINING_STATUS.md`顶部为本轮真实状态，旧记录下沉为历史且不删除。模型卡写清数据、模型、配置、验证域、不确定性与未测环境。交付`final-eval-v4.jsonl`、`promotion-record-v4.json`、`deployment-checklist-v4.md`、`rollback-v4.md`、`NEXT_ACTION.md`和最小复现命令。

允许三种结束：具体候选通过；仅局部域通过并限定使用；未证实改进而保留旧冠军。均要求真实结果与完整交接，不要求强行写“所有任务100%通过”。

## 13. R11｜空间表示研究，仅在证据指向它时启动【P2】

当前输入是4×4分箱＋有限实体槽，不是完全无空间信息。加深MLP不能恢复丢掉的细节，但当前棋力差也可能来自标签、教师、搜索和评估问题；不要先把所有问题归因CNN缺失。[S15]

在R02/R05/R07通过且有额外已冻结资源时，构造实际可达且最佳行动不同的局面：细格通道/遮挡不同、关键低威胁单位被10槽截断、同分箱目标需要不同路径、相似材料但指挥官暴露不同。测输入是否不可区分、误差是否集中在这些场景。

若确有信息瓶颈，可选一个最小替代：精确网格＋有效区域mask、行动者/目标局部patch、显式可达/威胁通道，或轻量CNN加实体/动作头。选择一种，不自动铺开大网格。地图尺寸padding与mask、同格实体、规则阶段及视角处理必须正确。网络成本以完整搜索吞吐衡量，不以参数越大越好。

新表示/网络改变需独立版本、新checkpoint与原模型对照；数据、搜索、训练预算固定。没有明确反例或fit资源，交付`representation-decision.md: DEFERRED`即可。大Transformer、从零PPO、多方对抗另开项目，不属于本轮捷径。

## 14. 门禁总表：失败要真的能阻塞晋级

| 门禁 | 最低条件 | 阻塞范围 |
|---|---|---|
| G0 证据/结果可信 | R00/R01反例通过、真实输出可重算、结果语义完整 | 所有正式质量声明 |
| G1 数据/标签可信 | R02分区/重建通过，R03标签与模型链正确 | 依赖该数据的训练与值资格 |
| G2 在线运行时 | R04目标环境实际测量与故障保护通过 | 扩大在线预算、稳定前端性能资格 |
| G3 教师分域 | R06按冻结协议取得具体域/配置资格 | 该域正式纠错采集 |
| G4 模型/搜索质量 | R07/R08/R09中相关候选通过有效开发比较 | 候选进入最终矩阵 |
| G5 最终交付 | 冻结最终结果满足预注册条件，R10接入验证通过 | 稳定可选升级；默认切换仍需用户授权 |

若G3失败，不阻塞独立G1数据上的policy-only基线；若value失败，不阻塞S00/S10；若目标浏览器未测，不宣称G2通过，但可继续离线诊断。一个模块HOLD不得使全项目停在只写文档，也不得因此降低其他门槛。

## 15. 有限资源预算与停止规则

下表沿用前版的有限本地执行上限作为本轮建议；不是运行耗时承诺或收费授权。先读取用户已明确的有效预算与旧账本，较严格者优先。新runId只是产物命名，不能靠改名重置同一轮已用额度；同一轮前面的P1训练/控制台对局也要补计。明确进入新轮时仍记录累计历史与本轮分别花费。

| 资源 | 建议上限/起步 | 计数说明 |
|---|---:|---|
| 初始对局smoke | ≤8 | 包含在总量，不额外赠送 |
| 本轮新启动游戏 | ≤512 | 采集续局、教师/学生、开发、各arm、最终、失败重试全计 |
| 最终未见评估预留 | 上述总量中≤128 | 先预留，不被开发耗完 |
| 正式模型fit | ≤8 | A/B各3个seed共6fit，R08/R09共享余下配额；不各自再领8次 |
| 正式状态呈现 | ≤1200000 | 每样本每次进入优化均计；候选计算量另报 |
| 唯一训练状态 | ≤30000；可先5000—10000 | 必须跨可信根家族，不取文件前N行 |
| 教师状态查询 | ≤2000 | 不同配置重复查询各计；与对局搜索调用分开记账并报总CPU成本 |
| 非对局性能探针 | ≤2000请求 | 包含故障注入；重复状态只增加时延样本，不增加独立棋力根数 |
| tiny检查 | ≤64状态，≤2000更新/配置 | 单独记账，不能冒充正式训练 |
| 每fit遍历 | 起步3；预注册最多12 | 同时满足总呈现预算，不为B额外放宽 |
| 全局并发 | 初始2，核验后最多8worker | 搜索嵌套线程同样计入全局，不按Agent重复分配 |
| 纠错迭代 | 默认1轮 | 二轮非自动任务 |
| 本地重计算累计窗口 | ≤28800秒 | 预算上限，不是交付时间估计；到限保存交接，不留下无限作业 |

资源不足时优先R00—R05正确性和基线，然后R06/R07的关键对照。R08/R09依据最主要瓶颈与剩余fit选择，不强制两个都训练完成；R11默认DEFERRED。能够复用的历史模型须有可靠hash和可比配置，否则不能靠复用省掉必要对照。

账本采用启动前原子预留、结束后真实核销；取消/异常也记账。累计使用、预留和剩余不能出现负数后仍继续启动。补账无法确定时保留UNKNOWN并保守预留，不把未知记0；无法确认剩余额度则暂停新增重任务，继续轻量修复/交接。

停止新增重任务的条件：规则/索引/结果语义破坏、训练分区泄漏、标签身份不明、数值非有限、不可控在线错误、账本不一致、上限耗尽、当前假设已被否定且无新受控假设。停止不等于丢弃结果；保存失败局面、checkpoint和下一步。

## 16. 命令、产物与报告规范

### 16.1 已确认存在的基础命令

先在真实项目根目录检查环境；以下来自固定提交的package.json。本文作者没有执行这些项目命令。[S21]

```sh
git rev-parse HEAD
git branch --show-current
git status --short
node --version
npm --version
npm run lint
npm test
npm run build
```

当前四组新增回归文件可定向运行：

```sh
npm test -- tools/skirmish_dataset_vnext_n01.test.ts tools/skirmish_network_features_n02.test.ts tools/skirmish_search_teacher_n03.test.ts tools/skirmish_dual_head_net_n04.test.ts
```

新R任务测试名称由实际实现决定，不假定已经存在。缺依赖按锁文件和项目约定准备，禁止全面升级。**不要直接运行旧实验runner来“再验一次”**：R00保护输出、修复入口与门禁前，它们可能覆盖模型/旧报告并继续产生固定PASS。

### 16.2 建议产物树

```text
docs/training/reports/<newRunId>/
  run-manifest.json
  evidence-index.json
  task-status.json
  budget.json
  budget-ledger.jsonl
  historical-evidence-audit.md
  outcome-audit.json
  dataset-manifest-v4.json
  split-manifest-v4.json
  leakage-audit.json
  value-label-audit.json
  online-latency-report.json
  eval-protocol-v4.json
  architecture-comparison-v4.json
  teacher-qualification-v4.json
  promotion-record-v4.json
  gate-trust.json
  NEXT_ACTION.md
training_runs/<newRunId>/
  episodes/
  snapshots/
  datasets/
  checkpoints/<modelId>/
  decisions/
  evaluations/
  logs/
```

已有等价组织可复用；不为了目录齐全生成空“通过”文件。每个小报告有大产物相对路径、字节数、SHA256、生成命令和可恢复说明。不要把本机`file:///C:/...`当其他Agent可用的证据链接。

### 16.3 每任务固定报告格式

```text
任务ID、假设与适用范围
审查基点、实际HEAD与dirty-diff hash
实际改动文件；已有修复是否复用
实际输入/模型/配置/规则hash
运行命令、环境、退出码、日志路径
通过/失败/未运行/资源阻塞分别列出
真实质量/成本结果及不确定性
新发现的反例、已消耗预算
是否允许下一任务；NEXT_ACTION
```

模板中的未知值为null，不自动填0/true/PASS。审查报告中的问题是测试假设与修复依据，不是允许把期望结果预填到实验输出。

## 17. 可复制启动Prompt

```text
请在当前AncinetEmpires项目中执行本轮AI后继任务。
先读取有效AGENTS.md等工程约定，记录当前分支、HEAD和dirty改动；不要切分支、重置、删除或覆盖用户文件。
完整阅读根目录的AncinetEmpires_AI_Progress_Review_20260920_v4.md与AncinetEmpires_AI_Agent_Taskbook_20260920_v4.md。可读取配套任务JSON作导航，不能替代正文。旧v3文档保留，当前事实以实际源码和可复验产物为准。
以审查提交85a87a0edb64de18a8b8eced9226ffb1cd1b48e9为对照；工作区若更新，逐项核验，已修好者标ALREADY_FIXED，不重复重写。
先落实R00—R04并准备R05冻结协议：修固定PASS/固定指标，分开自然结果与截断，修来源身份与根家族分区，修自然value标签和不可变checkpoint，移除耗时裁剪并实现调用方1秒可取消运行时。
不要直接启动会覆盖公共模型和历史报告的旧实验脚本。训练前先通过失败型测试：全截断、裁定混入、分区泄漏、错误模型hash、真实超限都不能获得晋级PASS。
完成可执行代码修改和测试，不要只再写一份计划。缺数据/浏览器/模型时记录具体BLOCKED或NOT_RUN，并继续不依赖该资源的任务。门禁通过且预算有余额时按依赖继续R06/R07，再按教师资格与剩余fit决定R08/R09；R11没有证据与资源就DEFERRED。
保持游戏规则、默认AI、旧模型与数据不变；不访问无关凭据，不调用收费云资源，不自动push/发布。每个底层动作端到端预算为1000ms，真实耗时不能裁剪或只报搜索内部时间。
用新runId保存不可变结果，继承有效预算且补计失败/重试。阶段结束输出真实状态、命令、退出码、hash、未解决问题和NEXT_ACTION。最终允许HOLD或保留旧冠军，禁止为了“完成”硬写QUALIFIED。
```


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
