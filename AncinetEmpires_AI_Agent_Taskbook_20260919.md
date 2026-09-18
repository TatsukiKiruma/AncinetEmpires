# AncientEmpires：AI 对战升级任务书（LLM Agent 执行版）

版本：2026-09-19 / v1.0  
仓库：`TatsukiKiruma/AncinetEmpires`  
参考提交：`0de019db9252d11e4ec1d00759f135e4c73f6ec0`  
状态：**这是任务计划，不是已执行报告；任务初始状态均为 TODO。**

## 1. 目标与范围

目标是提高 SD 遭遇战的自然对战胜率、关键战术可靠性与残局收官能力，同时给出真实的推理成本。先稳定两方对抗；三人、四人与联盟扩展独立进行。不得将训练损失下降、标签命中率上升或通过某个战术样例自动等同于棋力提升。

推荐路线：语义与候选正确性 → 可信评估与数据契约 → 修复后的轻量基线 → 有限预算搜索教师 → 学生自访状态纠错 → 紧凑策略/价值网络 → 网络辅助搜索与有界专家迭代。

本任务书没有要求从零 PPO、训练巨大 Transformer、重写游戏规则或立刻上线新 AI。当前启发式与目标/历史策略保留作基线和回退。

## 2. 已核对事实与需要避免的错误理解

**R01：当前代码提交。** 本文核对时 main 为上述 SHA。Agent 执行时必须再次读取本机版本；不能假定之后没有更新。

**R02：候选流水线不能一概而论。** `tools/skirmish_episode_feature_export.ts` 的 `buildFeatureSample()` 已调用 `selectStratifiedHardNegativeCandidates()`，后者按标签、教师高分竞争动作和动作类型分层采样。因此不要重新实施“从无到有的分层采样”，也不要把所有现有训练产物都说成前 K 截断。其他旧入口仍需逐一审计。

**R03：目标语义遗漏。** 参考提交的 `tools/skirmish_bc_train.ts::getTargetPosition()` 把 `destroy_town` 与 capture/repair/wait 放在同一分支，读取行动者位置；需要对有 `action.target` 的动作写规则层最小反例。此问题可以确认代码行为，但不能据此独断解释所有历史败局。

**R04：标签顺序风险。** `skirmish_candidate_sampling.ts` 截断路径先插入 label 并按插入顺序返回；`skirmish_bc_train.ts::predictCandidate()` 只在 `>` 时更新首选，因此同分保留第一项。组合存在应审计的标签顺序偏置。真实影响比例、旧权重受影响程度和纠正后棋力必须实测；不能声称所有验证已经无效。

**R05：现有状态与历史结果。** `CURRENT_TRAINING_STATUS.md` 最新段落记录 v4＋收官辅助在独立矩阵正常 8/16、残局 11/12，纯 v4 为 2/16、8/12；默认游戏 AI 未切换。这些是仓库历史报告，不是本次重新跑出的结果。文档下面保留较早的未完成状态，不要把旧状态覆盖最新段落。

**R06：组合策略不等于纯模型。** `tools/skirmish_endgame_policy.ts` 中模型可选，启发式与目标/历史提供主要控制。应补“无 BC 但相同目标/历史辅助”对照；useMemory 开关还影响多项修正，不能把联合效果全归给记忆。

## 3. Agent 总执行约束

1. 先读已有实现与当前工作区。不要覆写用户未提交代码，不做 reset --hard，不删训练产物，不自动升级全部依赖。
2. 只改与当前任务有关的文件；保留旧模型、旧特征语义、旧评估结果。所有新产物带唯一 runId、数据/规则/代码/模型 hash。
3. 前置验收未通过不能跳到大规模训练。预算内可以自主完成代码与有限实验，不需要每一步询问；遇到缺失资源或证据不足，记录 BLOCKED/HOLD 并继续独立任务，不编造。
4. 不擅自租云端 GPU、访问未授权服务器、发送数据到外部服务或切换默认 AI。计划不等于授权收费操作。
5. 规则合法性来自游戏引擎。策略觉得不好的合法动作仍是合法动作；禁止通过更改规则、排除困难地图/后手或删除超时记录来提高胜率。
6. 每个结论附实际命令、退出码、输入/输出 hash、日志和反例。测试未运行写 NOT_RUN；未通过不得修改预设阈值后再称通过。
7. 文中建议的新目录、脚本、schema 和参数均为待创建接口。先检查现有等价实现并复用，不向不存在的 CLI 传“想当然的参数”。

## 4. 依赖与阶段门槛

```text
T00 盘点
 ├─ T01 语义/版本修复 ─┐
 ├─ T02 候选/平分修复 ─┼─ T04 数据契约 ── T06 小型基线
 └─ T03 评估/分区 ────┘         │
       │                       │
       └─ T05 搜索接口 ── T07 搜索教师 ── T08 教师资格
                                       │
                  T04 + T06 + T08 ── T09 纠错聚合
                                       │
                                   T10 策略/价值网络
                                       │
                                   T11 网络辅助搜索
                                    ├─ T12 有界对手池迭代
                                    │     └─ T13 多方扩展（可选）
                                    └─ T14 部署候选/回退/交接
```

**Gate A（正确性）**：T01、T02、T03、T04 的关键验收通过。Gate A 前只允许夹具、审计与小样本导出，禁止全量训练。

**Gate B（教师资格）**：T08 对相应任务域给出 GO 或局部 GO。HOLD/NO_GO 不得生产大规模“强教师”标签。

**Gate C（学习闭环）**：T09、T10、T11 在相同协议下给出可复核收益；代码实现但无收益不是失败造假，可以降级为有明确限制的实验成果。

**Gate D（交付）**：最终冻结测试和运行预算通过，部署可回退；默认模型切换另遵循用户授权。若 T06 的轻量路线已满足冻结目标，可从 T06 直接进入 T14，不必为交付强行完成 T07—T13；T14 仍必须取得真实质量与部署验收证据。

## 5. 建议首批范围与资源限制

第一次交给执行 Agent：**完成 T00—T04，输出 Gate A 报告。** 不要求这批就把模型训练强，也不要求立即启动 T07—T12。这能避免把未解决的标签/表示问题带入新算法。

资源文件必须由 T00 创建并写入实测机器能力。无额外授权时的起步建议：smoke 对局不超过 8 场；小数据训练不超过 30,000 状态、3 轮；并发先用 2 worker，性能和隔离测试通过后可升至总计 8 worker。多个 Agent 共用这个总限额，不能各启动 8 worker。

开发筛选可从每候选 24 场配对对局开始（例如 8 个正常根局面与 4 个残局根局面，分别交换先后手），仅用于淘汰明显退步方案。最终样本量必须在看结果前根据预算与所需辨别能力冻结；小样本不够判断时写 HOLD。至少保证根局面独立、来源分区正确，不把更多相同 seed 重跑冒充更多证据。

搜索使用 nodeBudget 作可复現测试，实际运行另有 decisionMsBudget；具体上限由 T05 测量后冻结，不凭空规定几千模拟一定足够。离线教师与在线玩家可使用不同预算，但必须分开报告。

## 6. 任务总表

| ID | 优先级 | 任务 | 依赖 |
|---|---|---|---|
| T00 | P0 | 盘点真实工作区、数据与基线 | 无 |
| T01 | P0 | 修复动作目标语义并发布新特征版本 | T00 |
| T02 | P0 | 统一候选审计，消除标签顺序泄漏与平分偏置 | T00 |
| T03 | P0 | 建立冻结评估集和因子对照 | T00 |
| T04 | P0 | 建立可复用、可追溯的新数据契约 | T00, T01, T02, T03 |
| T05 | P1 | 建立搜索接口、回合语义测试和性能剖析 | T00, T01, T03 |
| T06 | P1 | 重建可信的线性与小型非线性基线 | T01, T02, T03, T04 |
| T07 | P1 | 实现有限预算的搜索教师 | T01, T02, T05 |
| T08 | P1 | 搜索教师资格验收 | T03, T07 |
| T09 | P2 | 构建模型自访状态上的纠错数据聚合 | T04, T06, T08 |
| T10 | P2 | 训练紧凑策略／价值网络 | T04, T06, T09 |
| T11 | P2 | 让网络辅助搜索并验证专家迭代闭环 | T03, T05, T07, T10 |
| T12 | P3 | 历史对手池和有限轮次自我对战 | T08, T09, T10, T11 |
| T13 | P3 | 可选：扩展三人、四人与联盟模式 | T11, T12 |
| T14 | P3 | 部署候选、回退机制与最终交接 | T03 ＋ 已验收候选（T06 或 T11） |

## T00｜盘点真实工作区、数据与基线

**优先级：** P0　**依赖：** 无　**建议负责人：** 主 Agent / 工程 Agent

**目标：** 把仓库文档、执行机器和实际训练产物对齐；确定真正可以复现的起点，不根据历史描述臆测文件存在。

**先读：** `README.md`；`package.json`；`docs/training/CURRENT_TRAINING_STATUS.md`；`docs/training/ENDGAME_ITERATION_20260918.md`；`docs/training/TRAINING_HANDOFF_GUIDE.md`；`docs/training/SD_TRAINING_STRATEGY_HANDOFF.md`。

**执行详情**

1. 记录 git commit、分支、git status --short、工作区已有未提交改动；若与任务书参考提交不同，先写差异摘要，不自动回退版本。
2. 盘点实际存在的模型、manifest、episode、完整状态/observation、派生特征和评估配置。对每个产物记录来源、SHA256、规则/特征版本、样本数及是否可读取。文档声称存在但本机缺失时，明确标为 unavailable。
3. 从入口到产物追踪真实调用链：对局生成 → 回放/重标注 → 候选采样 → 特征导出 → 训练 → 验证 → 实战。记录每份当前使用模型对应的导出器、采样器和配置，无法证明时填 unknown。
4. 记录操作系统、Node/Python、CPU、内存、实际可用计算后端；不要默认有 CUDA，也不要把显存利用率当作棋力指标。
5. 运行可用的现有工程检查；APK 资源缺失导致的报告不可运行与代码测试失败要分别记录。创建本轮独立输出目录与资源预算文件。

**验收标准**

- 代码版本、规则版本、模型文件与来源数据可以相互追踪；缺失项有清单。
- 真实执行的测试、退出码与日志齐全；不把历史“445 项通过”等记录写成本轮实测。
- 已记录本轮可支出的样本、对局、worker、搜索节点及训练轮数上限。

**交付文件（建议放到本轮任务目录）**：`inventory.json`、`pipeline-audit.md`、`engineering-baseline.json`、`budget.json`、`baseline-models.json`。

**停止／降级条件**

- 关键模型或原始数据缺失时阻塞依赖它的复现实验；仍可继续不依赖该数据的单元测试。
- 不擅自访问云服务器、购买算力、删除数据或覆盖默认模型。


## T01｜修复动作目标语义并发布新特征版本

**优先级：** P0　**依赖：** T00　**建议负责人：** 引擎 / 特征 Agent

**目标：** 让动作特征真正描述被操作对象，尤其修复 destroy_town 的远程目标；冻结旧 v4 语义。

**先读：** `tools/skirmish_bc_train.ts`；`tools/skirmish_navigation_features.ts`；`src/game/types.ts`；`src/game/env.ts`；`src/game/engine.ts`；`tools/skirmish_feature_export.ts`；`tools/skirmish_episode_feature_export.ts`。

**执行详情**

1. 先写失败测试：同一 destroyer 面对己方、敌方、中立且处于不同位置的建筑；确认规则层的真实 action.target，与旧特征提取输出对比。
2. 逐动作建立语义表：行动者位置、被作用对象位置、动作后落点必须分开。覆盖 move/post_attack_move、attack/heal/support、capture/repair/destroy_town、summon、两种 recruit、wait/end_turn/surrender。招募同时保留来源城堡与部署点。
3. 为新版本让 destroy_town 优先读取 action.target；缺省 target 的兼容语义由引擎规则确认。对所有依赖目标位置的归属、地形、距离、导航、特征上下文一起检查，不把导航中的单位落点直接等同于攻击目标。
4. 新建独立版本（建议 hashed-action-v5，若已占用则另取名）；旧 v1-v4 的行为用快照回归冻结。模型元数据、导出器、CLI 校验、生成器指纹与加载兼容性同步更新。
5. 新增哈希前可读语义 token 调试输出，分别测语义遗漏与哈希碰撞；不能仅验证在线、离线调用同一函数得到相同结果。

**验收标准**

- 关键目标差异在语义 token 层正确可见；测试不靠给每个动作强塞唯一 ID 来通过。
- 新模型与旧特征组合明确拒绝；旧模型继续走旧语义路径且回归不变。
- 真实目标语义测试、在线离线一致性和正常游戏规则回归通过；不得修改 APK 规则以掩盖策略错误。

**交付文件（建议放到本轮任务目录）**：`action-semantics.md`、`feature-v5-audit.json`、`feature-semantics-tests.log`、`model-compatibility-tests.log`。

**停止／降级条件**

- 若当前分支已修复该问题，记录修复提交并补足测试，不重复造版本。
- 发现规则本身有争议时单独建问题，不混入训练特征补丁。


## T02｜统一候选审计，消除标签顺序泄漏与平分偏置

**优先级：** P0　**依赖：** T00　**建议负责人：** 数据 / 训练 Agent

**目标：** 保留已存在的分层采样能力，查清实际产物；让模型预测不依赖标签位置、teacherRank 或输入数组顺序。

**先读：** `tools/skirmish_candidate_sampling.ts`；`tools/skirmish_episode_feature_export.ts`；`tools/skirmish_feature_export.ts`；`tools/skirmish_distill_export.ts`；`tools/skirmish_bc_train.ts`；`tools/skirmish_training_runner.ts`。

**执行详情**

1. 区分各导出入口，禁止将当前所有路径都概括成“前 64 个”。核对实际 manifest 与样本；现有 episode 导出器调用 selectStratifiedHardNegativeCandidates，应优先复用。
2. 复现截断采样 add(label) 首先插入、predictCandidate 同分取首项的组合。按 legalCount<=K / >K、动作类别、来源统计 labelPosition、topTieCount、zeroWeightAccuracy 与排序置换敏感性。影响结论必须来自实际数据，不能据代码就宣称全部验证失效。
3. 在输入模型前统一成与标签和教师评分无关的候选顺序；同分决策采用只依赖局面与动作身份的稳定规则。标签、teacherRank、selectionReason、源策略名不能作为学生输入。离线与在线使用相同 tie-break 约定。
4. 最终离线评估重建完整合法动作集合。训练可采样，但需要覆盖标签、教师高分竞争动作、当前学生误选高分动作、动作类型及单位分层；新采样方案版本化。
5. 补测候选去重、标签保留、教师第一名的排名范围、候选数为 1、没有普通动作及大候选集。以两个标签不同但相同候选输入的夹具证明推理不读取答案；换序后相同动作的分数保持不变。

**验收标准**

- 特征、动作身份和局面相同，仅置换候选数组，预测不发生顺序性变化。
- 零权重测试不会因导出器把标签放首位而系统性得到伪高分；同分率与去偏前后结果都有记录。
- 小集合与完整集合指标分开；无法恢复完整状态的数据明确不具备完整候选验收资格。
- 完整合法动作来自引擎，策略剪枝不能冒充规则合法性。

**交付文件（建议放到本轮任务目录）**：`candidate-pipeline-audit.json`、`tie-break-audit.json`、`full-action-eval.json`、`candidate-contract.md`。

**停止／降级条件**

- 完整集合评估或标签泄漏测试未通过时，不运行以验证命中率选模的大规模训练。
- 不得通过在线只取前 K 项、使用标签决定顺序或删掉高分错误动作来制造提升。


## T03｜建立冻结评估集和因子对照

**优先级：** P0　**依赖：** T00　**建议负责人：** 评估 Agent

**目标：** 明确真正要优化的自然对战能力，把模型、目标/历史辅助和搜索的贡献拆开。

**先读：** `tools/skirmish_iteration_eval.ts`；`tools/skirmish_training_runner.ts`；`tools/skirmish_endgame_policy.ts`；`tools/skirmish_endgame_memory.ts`；`docs/training/ENDGAME_ITERATION_20260918.md`。

**执行详情**

1. 定义训练、开发回归、最终留出三个分区，按根对局/根快照家族分组。原局、后继失败快照、纠错续局、镜像/阵营互换版本不能跨分区。已经用于调参的历史“独立种子”划回开发集。
2. 区分未见种子、未见初态、未见地图/布局与未见对手；不能把改 seed 但初态和确定性轨迹不变计作新的独立局面。无法建立真正陌生地图测试时公开限制。
3. 建立六组基线：纯 BC、原 HeuristicAI，以及 createEndgamePolicy 的模型有/无 × useMemory 真/假四组合。这里 useMemory 控制的是目标/历史/城镇修正组合，不得把联合变化全称为单纯记忆收益。
4. 按同一根局面和先后手配对，记录初态 hash、模型 hash、策略代码 hash。正常开局、优势残局、劣势残局及战术题分别汇总；纳入 Icy Paths 但不只优化它。
5. 在看结果前冻结指标、开发规模、正式样本量、停止条件和晋级阈值。自然胜分母包含超时/异常局；超时、裁定、非法动作、崩溃单列。时间指标含单动作、整回合、P50/P95；比较计算预算曲线。
6. 候选由开发集选出后才解封最终留出；失败后不得反向调参继续称同一集为最终测试。统计不确定性以根局面/配对组为单位，不把每一步或镜像局当独立样本。

**验收标准**

- 评估配置、分区 manifest 和晋级规则已冻结并带 hash。
- 六组对照可独立运行，缺失权重时明确相应组不可用；不伪造旧结果。
- 报告给出真实样本量和不确定性；正确区分轻量模型、增强策略与离线教师。

**交付文件（建议放到本轮任务目录）**：`eval-dev.json`、`eval-holdout.json`、`split-manifest.json`、`baseline-ablation.json`、`promotion-policy.json`。

**停止／降级条件**

- 发现数据污染，先修分区，不发布泛化结论。
- 预算只够 smoke 时仅报告接口运行成功，不宣称棋力提升。


## T04｜建立可复用、可追溯的新数据契约

**优先级：** P0　**依赖：** T00, T01, T02, T03　**建议负责人：** 数据 Agent

**目标：** 使原始局面、动作、标签、结果和来源长期可重建，不再依赖不可逆的旧哈希特征。

**先读：** `tools/skirmish_dataset_export.ts`；`tools/skirmish_dataset_artifacts.ts`；`tools/skirmish_dataset_validate.ts`；`tools/skirmish_episode_feature_export.ts`；`tools/skirmish_training_sampling.ts`。

**执行详情**

1. 优先扩展现有 manifest/分片实现，不重建另一套平行流水线。为每条数据关联 state 或可严格重建的状态引用、完整动作集合摘要、规则与表示版本、根来源分组、实际行为策略与标注教师。
2. 区分 behaviorAction、teacherAction、原局结果和反事实续局结果。重标注不能把未执行动作与原动作的 nextState 拼成 transition；原局最终结果不能当作新动作已获胜的证据。
3. 结果字段区分 naturalWin、naturalLoss、draw、timeout、maxSteps、stagnation 与运行错误；记录 terminated/truncated、结果视角、可靠性与 outcomeSource。只有经核验的自然终局才可直接赋明确胜负目标。
4. 按真实来源与状态去重，保留频次统计；采样按对局/局面家族、阶段和动作类型均衡，防止单个长局或 11 个来源的重复采样支配训练。
5. 所有标签做合法性与语义检查；获胜轨迹也逐动作审计。错误的自损/循环动作隔离为负例或诊断数据，不作为未经检查的正示范；不把所有自毁建筑行为全局改为非法。
6. 只先迁移小样本，输出旧/新版本对照和实际保留率；不能从旧哈希向量反推出遗漏的地图语义。

**验收标准**

- 任一新样本可追踪到原始来源、状态、标签生成方式和分区。
- 全部接纳样本都通过规则合法性检查、schema 校验与跨分区家族检查。
- 仅含紧凑特征而缺少可恢复状态的数据明确降级为历史基线用途。

**交付文件（建议放到本轮任务目录）**：`dataset-contract.md`、`dataset-vnext.schema.json`、`migration-manifest.json`、`data-quality-report.json`、`quarantine.jsonl`。

**停止／降级条件**

- 来源未知、状态无法重建或标签/结果串线的数据隔离，不静默补值。
- 小样本 schema 与重放验收通过前，不全量重导出近百万样本。


## T05｜建立搜索接口、回合语义测试和性能剖析

**优先级：** P1　**依赖：** T00, T01, T03　**建议负责人：** 引擎 / 搜索 Agent

**目标：** 在不改规则的前提下提供正确、可测量、可控预算的规划基础设施。

**先读：** `src/game/env.ts`；`src/game/engine.ts`；`src/game/ai/heuristic_ai.ts`；`src/game/ai/tactical_evaluation.ts`；`tools/skirmish_heuristic_relabel.ts`。

**执行详情**

1. 建立只读规划接口：读取局面、获取合法动作、复制/模拟动作、判断真实终局、识别当前玩家/联盟。先沿用准确引擎，暂不重写为 C++ 或 Rust。
2. 加入关键测试：同一玩家 move 后继续 attack 不换号；显式/自动推进按真实 currentPlayer/alliance 判定；pending/stacked 招募约束；胜利在中途动作触发；单位状态到期；分支复制不污染父局面或其他 worker。
3. 统一价值视角，第一版建议根阵营视角；不能按搜索深度奇偶机械取负。正式规则终局与外部预算截断分离；旧环境返回值保持兼容，必要时加 wrapper，不偷改旧 BC 的奖励含义。
4. 定义 rawActions、playerTurnTransitions、fullRounds 和 elapsedBudget 为不同计数。搜索深度覆盖对手回应；折扣必须说明按什么时间单位计算，不能因一个回合拆成更多动作而无意大幅折损价值。
5. 测量 clone、getState、getLegalActions、step、特征计算、批量教师评分的 CPU/分配成本与节点吞吐。比较逐动作和批量评分，验证分数、平分及随机噪声语义再做优化。
6. 若加缓存/置换表，key 包含规则、行动方、pending、行动标志、状态剩余时间等所有影响演算的字段；有历史依赖的教师另带历史状态，不能共享可变记忆。

**验收标准**

- 回合与视角测试通过；父状态 hash 在搜索前后相同。
- 相同节点预算的固定输入可复现；真实时间预算另做性能比较，避免把机器调度差异伪装为算法随机性。
- 达到预算后能返回已检查合法的动作；性能瓶颈有实测而非猜测。

**交付文件（建议放到本轮任务目录）**：`search-interface.md`、`turn-perspective-tests.log`、`search-profiling.json`、`budget-calibration.json`。

**停止／降级条件**

- 引擎一致性或视角错误未解决时，不进入搜索教师对战。
- 优化引发轨迹差异时回滚优化并保留反例，不能修改期望结果掩盖错误。


## T06｜重建可信的线性与小型非线性基线

**优先级：** P1　**依赖：** T01, T02, T03, T04　**建议负责人：** 模型 / 训练 Agent

**目标：** 先低成本判断：修复语义、候选和数据后，是否仍有必要升级模型容量。

**先读：** `tools/skirmish_bc_train.ts`；`tools/skirmish_averaged_weights.ts`；`tools/skirmish_training_runner.ts`。

**执行详情**

1. 冻结一份修复后、来源均衡的小数据集；建议首轮不超过 30,000 个状态、3 个 epoch。这是试验预算起点，不是最优超参或效果承诺。
2. 对照修复后的线性排序器、小型结构化特征 MLP、以及相同模型下的全量候选/采样候选；分开比较表示和损失，不能把所有变化归为“MLP 更强”。
3. 候选层做变长批处理与 mask，不设置巨大固定动作分类表。先做无冲突微型数据过拟合/梯度检查，再跑真实小数据；去掉重复状态矛盾标签后，微型训练应能明显拟合。
4. 采用分片洗牌/缓冲随机化并记录种子与来源配额；排序器平分处理统一。保持旧平均权重基线，记录有效独立来源数而非只记录采样次数。
5. 离线在完整合法集合上评价 top-1、近优集合命中、关键动作错误、平分率；开发对战检验自然胜与收官。线性从零训练不把统一正学习率缩放当主要搜索方向。

**验收标准**

- 训练微型样本可以拟合且没有标签/候选顺序泄漏。
- 可回答语义修复、采样修复、模型非线性各带来了什么变化；结果无提升也必须保留。
- 只保存为实验候选，不替换游戏默认 AI；完整命令、配置、权重与数据 hash 齐全。

**交付文件（建议放到本轮任务目录）**：`baseline-training-config.json`、`baseline-training-metrics.json`、`baseline-live-eval.json`、`baseline-decision.md`。

**停止／降级条件**

- 微型数据都不能拟合或全量候选评估失效，回到流水线诊断。
- 若小型模型已满足目标，可暂停更复杂模型路线；不要为实现算法而实现算法。


## T07｜实现有限预算的搜索教师

**优先级：** P1　**依赖：** T01, T02, T05　**建议负责人：** 搜索 Agent

**目标：** 让教师比较行动后的局势与对手回应，而不只是拟合现有单步打分。

**先读：** `src/game/ai/heuristic_ai.ts`；`src/game/ai/tactical_evaluation.ts`；`tools/skirmish_endgame_policy.ts`；`tools/skirmish_endgame_memory.ts`；`tools/skirmish_navigation_features.ts`。

**执行详情**

1. 第一版优先选可解释的 beam / 少量候选 rollout 搜索；有证据需要时再换 MCTS。接口与日志兼容后续策略/价值网络。
2. 构造多来源候选：启发式高分、模型高分、关键占领/防守、按单位和动作分层的探索项。马上获胜的动作优先保留；风险剪枝明确标注为策略而非规则，不保证剪枝后仍是全局最优。
3. 可构造 move→attack、move→capture 等局部组合，但逐个底层动作调用真实引擎校验；保留单步与单位交错行动路径，不把整回合强制成固定单位顺序。
4. 看过己方必要后续行动与至少一个对手行动阶段；计算预算不足时记录搜索截断位置。可对少量不同对手回应取保守聚合，但不得将启发式 rollout 称为已证明的 minimax。
5. 根视角叶节点评价先使用真实终局与可解释局面量，不把启发式分数直接当胜率。目标/历史教师需复制真实上下文；用于学生蒸馏的隐藏状态要显式记录或关闭。
6. 每个决策记录候选、最终选择、主要变化序列、评价、对手回应、节点与耗时、fallback 原因；可实时中断并给出合法动作。

**验收标准**

- 搜索不修改真实对局；同玩家连续动作视角正确；没有非法动作。
- 战术夹具覆盖移动后占领、反杀陷阱、招募堵路、援助顺序、必胜与保命，给出每题实际搜索轨迹。
- 节点上限有效；对预算外节点不隐性继续执行。

**交付文件（建议放到本轮任务目录）**：`search-teacher-config.json`、`search-teacher-tests.log`、`search-traces.jsonl`、`search-teacher-benchmark.json`。

**停止／降级条件**

- 搜索未看对手回应或出现规则偏差，不进入训练标签生产。
- 不因为“已经实现 MCTS/搜索”就宣称教师更强。


## T08｜搜索教师资格验收

**优先级：** P1　**依赖：** T03, T07　**建议负责人：** 评估 / 复核 Agent

**目标：** 以实际质量确定教师可教什么，避免大规模蒸馏一个更慢但更差的策略。

**先读：** `T03 的冻结开发评估配置`；`T07 搜索教师配置与轨迹`；`T00 基线模型清单`。

**执行详情**

1. 先少量 smoke，再按预先冻结开发矩阵对比搜索教师、原启发式、无 BC 的目标/历史策略和当前最强可复现组合；正常开局与残局分开。
2. 同时报告相同计算预算曲线和允许更高成本的离线教师结果。离线教师允许更慢，但质量必须证明，且单位样本生产成本不能隐瞒。
3. 默认开发门槛建议：正常自然胜率至少高于参考 5 个百分点、残局收官不降低、超时不高于参考、非法与状态污染为零；这些是启动前可调整并冻结的工程目标，不是已经实测的结果。
4. 用配对统计给出不确定性；若提升方向有利但样本不足，标记 HOLD 而非 GO。正式晋级另按 T03 冻结的统计与成本条件判断。
5. 若仅特定技能显著改善，给出局部教师资格，例如只标注占领/残局题，而不把它用于全部正常开局。

**验收标准**

- 产生 GO / HOLD / NO_GO 或明确局部资格，附完整证据。
- 达到预算但证据不足时如实停在 HOLD；不为过线剔除失败地图、超时或后手局。

**交付文件（建议放到本轮任务目录）**：`teacher-qualification.json`、`teacher-vs-baselines.json`、`teacher-cost-quality.md`。

**停止／降级条件**

- 未获相应教师资格，T09 的该类大规模标注不得启动。
- 不满足门槛时最多使用已声明的有限调试次数，不无限追加训练或数据。


## T09｜构建模型自访状态上的纠错数据聚合

**优先级：** P2　**依赖：** T04, T06, T08　**建议负责人：** 数据 / 训练 Agent

**目标：** 采用 DAgger 式流程：学生产生自己会遇到的状态，合格教师在这些状态上给出改进监督。

**先读：** `T04 数据契约`；`T06 学生模型`；`T08 教师资格`；`tools/skirmish_training_runner.ts`。

**执行详情**

1. 仅在训练分区运行学生或预先定义的教师/学生混合策略；记录每一步实际执行策略与动作。初期建议最多 200 个独立根局面来源，配额按来源而非重复动作计。
2. 优先询问完整集合高分误选、学生/教师分歧、局面退化、往返循环、错过占领和关键招募；同时保留部分均匀采样状态，不能只收濒死残局。
3. 分开保存原始行为轨迹、教师重标注与反事实 rollout。教师仅提出不同动作但未续局验证时，只是建议标签，不能伪称已获胜。
4. 对状态-动作复制与强相关长局降权；冻结复习数据、纠错数据及各家族的抽样比例。先比较“加新数据”与“等量旧数据重采样”控制组。
5. 教师依赖目标/历史时，把该上下文写入可部署学生输入；否则使用不依赖隐藏历史的教师重标注。全程不采集 holdout 状态做训练。

**验收标准**

- 纠错样本在分区、动作合法性和因果对应上通过验收。
- 报告独立来源数量、错误类型覆盖和比旧数据新增的信息；不能拿复制后的样本条数宣传多样性。
- 等量数据对照证明纠错是否带来真实对战收益，至少能定位无收益原因。

**交付文件（建议放到本轮任务目录）**：`dagger-round-01-manifest.json`、`error-coverage.json`、`relabel-audit.json`、`dagger-ablation.json`。

**停止／降级条件**

- 教师资格不足、隐藏上下文无法提供、数据跨分区或新标签质量差，停止接纳相关样本。
- 迭代收益不明确时先分析反例，不自动扩大到几千局。


## T10｜训练紧凑策略／价值网络

**优先级：** P2　**依赖：** T04, T06, T09　**建议负责人：** 模型 Agent

**目标：** 在正确数据上学习局面关系和候选动作分布，并为后续搜索提供有定义的价值估计。

**先读：** `T04 数据契约`；`T09 纠错数据`；`src/game/env.ts`；`src/game/types.ts`；`tools/skirmish_navigation_features.ts`。

**执行详情**

1. 优先复用原 TypeScript 引擎负责采集/规则，模型训练可用 Python；先探测真实后端并提供 CPU smoke。新增依赖单独锁版本，不能为选框架就复制一套游戏规则。
2. 编码地图、单位实体、全局规则与经济、行动方、动作描述。地图变化通过 padding/validTileMask 或其他明确方式支持。stacked/pending 同格多单位不能互相覆盖；必要时使用实体表/多实体聚合。
3. 候选评分读取行动单位、实际目标/落点、来源城堡等语义；保留有价值的路径特征。禁止将教师分数、标签位置、胜者、对局文件名、split、seed、策略来源、源模型身份等泄入预测输入。
4. 首个空间网络可从约 4 个残差块、64 通道、轻量动作评分头起步；这只是建议起点。继续保留小 MLP 对照，不预设网络越大越强。
5. 策略用完整或正确采样候选上的监督；同等好动作可给软目标/近优集合。价值头统一根/当前阵营的明确约定，先以经核验自然终局轨迹训练。截断样本没有可靠目标时屏蔽 value loss，不能随意赋 0 或按材料赋胜。
6. 训练先通过无冲突微型过拟合测试，随后记录 policy/value loss、校准、完整候选结果与开发对战。按对局与阶段加权，防止胜局前半段和动作数量主导全部目标。
7. 保存权重、优化器、采样 RNG、表示配置和 manifest hash，验证续训恢复；Python 与部署端候选分数/动作通过容差及 top-1 一致性测试。

**验收标准**

- 模型能在真实可用硬件运行，mask/梯度/值域/多实体表示和加载兼容性通过。
- 价值目标有结果视角与来源，不把启发式分当真实概率；对自举目标使用独立标记。
- 部署前后测试能复现动作；开发对战结果与纯网络/辅助策略贡献分开。

**交付文件（建议放到本轮任务目录）**：`network-spec.md`、`train-config.json`、`model-card.md`、`learning-curves.json`、`inference-parity.json`、`network-dev-eval.json`。

**停止／降级条件**

- 微型数据不收敛、掩码错误、训练部署不一致，停止扩大模型或轮数。
- 数据不足训练可靠价值头时可先保持策略头并标记价值能力尚未验证，不捏造价值收益。


## T11｜让网络辅助搜索并验证专家迭代闭环

**优先级：** P2　**依赖：** T03, T05, T07, T10　**建议负责人：** 搜索 / 模型 Agent

**目标：** 使网络负责更快地提出候选和估计局面，搜索负责进一步改进，而非简单叠加未经校准的分数。

**先读：** `T07 搜索接口`；`T10 模型与推理接口`；`T03 评估协议`。

**执行详情**

1. 策略分布用于动作排序/先验，价值头用于叶节点评价；保留必要的启发式候选与探索槽位，避免网络把有价值动作从搜索中永久排除。
2. 若从 beam 迁移到 MCTS，分别验证先验、访问次数目标、价值回传与联盟视角；不把 beam 分数冒充 MCTS 访问分布。
3. 做三项配对消融：原搜索、只有策略引导的搜索、策略＋价值搜索；另报纯网络。匹配预算，不把更长计算全部归为学习收益。
4. 只从实际更强的搜索结果生成下一轮监督；模型和教师版本分开编号，防止训练/评估混用。

**验收标准**

- 至少能量化网络是否改善同预算棋力或同质量成本；不能仅证明搜索调用了网络。
- 若价值头拖累性能，保留策略引导版本并记录原因，不强行启用全部模块。

**交付文件（建议放到本轮任务目录）**：`neural-search-ablation.json`、`expert-iteration-round-01.json`、`quality-cost-frontier.json`。

**停止／降级条件**

- 新搜索未超过参考且无成本优势时不继续自动批量生产。


## T12｜历史对手池和有限轮次自我对战

**优先级：** P3　**依赖：** T08, T09, T10, T11　**建议负责人：** 训练 / 评估 Agent

**目标：** 在已有可信改进闭环后扩展对手多样性，避免只学会对付单一版本。

**先读：** `T03 晋级协议`；`T08 教师资格`；`T11 首轮闭环产物`。

**执行详情**

1. 建立冻结版本对手池：原启发式、无 BC 目标策略、当前冠军、历史网络/搜索版本；标注已知弱点。模型回放和随机探索不等同于把随机动作当正确标签。
2. 预先冻结匹配比例、角色互换、数据配额和轮数，首轮默认最多 2 次有界迭代；champion/challenger 分离，新候选不立即替换所有对手。
3. 每轮记录对战矩阵、自然胜率、超时、失败类型、计算成本、训练数据来源及回退版本。收益只在同一规则/预算/评估分区内比较。
4. 候选在冻结开发集选定后才进正式留出；达到预设晋级与不确定性条件才能成为新冠军。

**验收标准**

- 历史版本、失败版本和完整日志可回溯；报告对各类对手表现而非只报总胜率。
- 收官和关键防守没有被单一克制策略替代；无证据时输出 HOLD。

**交付文件（建议放到本轮任务目录）**：`opponent-pool.json`、`league-matrix.json`、`promotion-record.json`、`iteration-report.md`。

**停止／降级条件**

- 预算到期、连续迭代无收益、教师质量下降或循环克制明显时暂停训练并诊断。
- 禁止无限自我对战、无限调参或自动租用外部资源。


## T13｜可选：扩展三人、四人与联盟模式

**优先级：** P3　**依赖：** T11, T12　**建议负责人：** 研究 / 规则 Agent

**目标：** 在两方 SD 已完成验收后单独验证多方价值与决策，不污染已稳定的两方基线。

**先读：** `src/game/rule_config.ts`；`src/game/types.ts`；`src/game/env.ts`；`T10 价值约定`。

**执行详情**

1. 先确定模式、联盟关系、收益与轮转语义；不能机械把所有其他玩家价值都等于自己的负值。
2. 评估按阵营价值向量或其他明确多方模型扩展；决策时基于实际行动者/联盟解释价值，队友关系单独处理。
3. 数据、模型头、配置与评估集单独版本化；保留两方回归，记录玩家数与联盟布局。

**验收标准**

- 多方/联盟语义测试、终局目标及对战评估独立通过；两方模型无回归。

**交付文件（建议放到本轮任务目录）**：`multiplayer-design.md`、`multiplayer-contract-tests.log`、`multiplayer-eval.json`。

**停止／降级条件**

- 本任务默认可选，不阻塞两方版本交付；目标不包含多方时标记 DEFERRED，不虚构完成。


## T14｜部署候选、回退机制与最终交接

**优先级：** P3　**依赖：** T03 ＋ 已验收候选（T06 轻量路线或 T11 搜索网络路线）　**建议负责人：** 主 Agent / 部署 Agent

**目标：** 把已验收成果做成可选择、可复现、可撤回的游戏 AI，而不是只留下训练日志。轻量路线已满足目标时允许直接交付；T12/T13 不是必要前提。

**先读：** `src/App.tsx`；`src/game/ai/play.ts`；`src/game/ai/heuristic_ai.ts`；`package.json`；`T03 晋级协议`；`T11 已验证策略`。

**执行详情**

1. 确认实际运行场景是浏览器、本地 Node 还是外部推理服务；按现有技术栈选择可用部署路径，不假设 Python 网络可以直接在浏览器加载。
2. 加入可选策略入口，包含权重版本、schema 校验、预算和超时回退。桌面/浏览器性能分别测；失败时回退已验证合法启发式，异常必须记录。
3. 清理推理依赖边界：浏览器模块不得导入 Node fs、训练脚本副作用或庞大训练数据。worker 状态、目标记忆、缓存按对局隔离。
4. 执行锁定最终测试。默认 AI 切换只在晋级条件通过且已有明确授权时做；否则保持原默认，但交付可选候选。
5. 更新 docs/training/CURRENT_TRAINING_STATUS.md 最新段落、任务看板、模型卡和复现命令；写明完成、实测通过、未运行、失败和延期任务。

**验收标准**

- 候选可选择运行，加载/版本错误可回退，原默认没有被未验收模型覆盖。
- 模型、配置、数据/代码指纹、测试结果、运行预算和回退步骤足够让另一个 Agent 复现。
- 最终报告不把代码完成、测试通过、模型棋力提升混为同一状态。

**交付文件（建议放到本轮任务目录）**：`release-candidate-manifest.json`、`runtime-parity.json`、`holdout-final-report.json`、`rollback.md`、`final-handoff.md`。

**停止／降级条件**

- 正式留出或运行预算失败：不升级默认；交付实际结论和反例。
- 未经用户授权不 push、不发布、不新增外部推理成本。

## 7. 共享数据最小契约（设计草案，不是当前现成接口）

每条样本至少能恢复以下含义；优先引用同一不可变状态/episode，避免把大状态重复复制进每个候选。

```text
sampleId / rootGroupId / episodeId / stepId / split
engineCommit / rulesHash / observationSchema / actionSchema / featureExtractor
stateRef / stateHash / legalActionsRef / legalActionsHash
actingPlayerId / actingAllianceId / valuePerspective
historyContextRef（仅当教师或学生使用历史时）
behaviorPolicyVersion / behaviorAction
teacherVersion / teacherAction / teacherBudget / teacherScoresScope
teacherDistributionType（单标签、近优集合、rollout分数或MCTS访问分布）
modelWrongTopActions / candidateSamplingVersion / samplingSeed
outcomeSource / naturalWinnerAlliance / terminated / truncated / truncationReason
valueTarget / valueTargetMask / qualityFlags
```

`teacherScoresScope` 必须明确 allLegal 还是 sampledSubset；多步搜索建议和实际已执行结果不能混在同一字段。`rootGroupId` 必须沿重采样、镜像、快照与续局传递，防止后续轮次重新制造数据泄漏。

## 8. 工程组织与多 Agent 协作

单 Agent 按依赖执行即可。具备并行工具时，主 Agent 统一契约、runId、分区和预算：引擎 Agent 负责 T01/T05/T07；数据 Agent 负责 T02/T04/T09；评估 Agent 负责 T03/T08；模型 Agent 负责 T06/T10/T11；主 Agent 最终集成 T12/T14。

先由主 Agent 定义共享类型与版本常量，再并行实现。`skirmish_bc_train.ts` 同时涉及特征和训练，两组不能在同一工作树无协调覆盖。使用独立分支/工作树，合并后重跑公共契约测试。没有并行能力时串行完成，不声称启动了不存在的子 Agent。

建议目录（均待 Agent 根据仓库现状创建或映射到已有等价目录）：

```text
docs/training/AI_UPGRADE_TASKBOOK.md
docs/training/AI_UPGRADE_PROGRESS.md
training_configs/ai_upgrade/
training_runs/agent_upgrade_<runId>/
  inventory.json
  budget.json
  task-board.json
  eval/
  datasets/
  models/
  traces/
  reports/
```

代码小型夹具进入测试目录；大型局面、权重、回放不自动提交到 Git。日志不得包含服务器密码、访问令牌或未经授权的外部账户信息。

## 9. 已存在的通用工程检查

先读取当前 `package.json` 确认脚本，再在仓库根目录运行：

```bash
git rev-parse HEAD
git status --short
npm run lint
npm test
npm run build
```

这些检查不是棋力验收。依赖未安装时按仓库锁文件和既有环境安装，不能为了一个新模型随意升级全项目。训练、导出和评估入口先读脚本帮助与 schema；新功能必须先实现、测试再给出可执行命令，禁止引用不存在的命令。

## 10. 单任务完成回报模板

```markdown
# Txx 执行报告
状态：DONE / BLOCKED / FAILED / DEFERRED
开始代码版本：
结束代码版本或 patch hash：
工作区已有改动如何保护：

## 实际修改
路径、符号、修改理由、兼容性影响。

## 实际执行
完整命令；数据/模型/config hash；退出码；日志路径。
未运行项明确标为 NOT_RUN，并说明缺少资源或预算。

## 验收逐项结果
每条标准：PASS / FAIL / NOT_RUN，附证据。
工程正确性、模型学习、自然对战收益分别给出。

## 实验结果
分组对局数、自然胜/负/超时/异常、关键错误、耗时与不确定性。

## 反例及已知限制
至少记录所有阻塞项，不只展示好看的局面。

## 决策
GO / HOLD / NO_GO；下一步可执行任务与阻塞依赖。
是否改变默认 AI：默认应为“否”。
```

任务 `DONE` 只表示该任务约定的产物和验收完整，不自动等于新模型值得上线。教师 NO_GO 的资格评估本身仍可 DONE；但其下游标注任务必须 BLOCKED。

## 11. 可直接交给执行 Agent 的启动指令

> 你接手 TatsukiKiruma/AncinetEmpires 的 AI 对战升级。请读取本任务书和仓库最新状态，首批执行 T00—T04，并输出 Gate A 报告。先核对实际版本、工作区改动和可用数据，再写最小失败测试，修复动作目标语义与候选/平分偏置，冻结数据分区和评估协议，完成小样本新数据契约。不要修改游戏规则来提高胜率，不要覆盖旧特征语义、模型或用户改动，不要切换默认 AI，不启动大规模训练或收费资源。现有 episode 导出器已具备分层困难负样本采样，先审计真实调用链并复用。所有新文件、CLI 和参数必须真实实现；每个任务附实际命令、退出码、hash、验收结果和反例。遇到缺失资源，阻塞相关实验但继续独立任务。最后更新任务 JSON 的真实状态，分别说明工程完成、测试通过与模型棋力是否经过实测。

## 12. 证据入口与方法参考

项目证据固定到本文参考提交，执行时若版本变化需重新定位：

- R01：仓库 main 分支元数据；核对 commit。
- R02：`tools/skirmish_episode_feature_export.ts::buildFeatureSample`；`tools/skirmish_candidate_sampling.ts::selectStratifiedHardNegativeCandidates`。
- R03：`tools/skirmish_bc_train.ts::getTargetPosition`；动作类型与合法性在 `src/game/types.ts`、`src/game/engine.ts`、`src/game/env.ts` 核对。
- R04：`tools/skirmish_candidate_sampling.ts` 的 `add(label, 'label')`；`tools/skirmish_bc_train.ts::predictCandidate` 的严格大于比较。
- R05：`docs/training/CURRENT_TRAINING_STATUS.md` 最新 2026-09-18 段落；`docs/training/ENDGAME_ITERATION_20260918.md`。
- R06：`tools/skirmish_endgame_policy.ts::createEndgamePolicy`；`tools/skirmish_endgame_memory.ts`。

DAgger 方法依据：Ross, Gordon, Bagnell（2011），A Reduction of Imitation Learning and Structured Prediction to No-Regret Online Learning。原文入口：`https://proceedings.mlr.press/v15/ross11a.html`。本文只借用在学习者诱导状态分布上聚合监督的思路，不将其理论保证直接套用于有噪声/不完备的本项目教师。

专家迭代方法依据：Anthony, Tian, Barber（2017），Thinking Fast and Slow with Deep Learning and Tree Search。原文入口：`https://arxiv.org/abs/1705.08439`。本文将搜索改进与网络泛化分开，具体棋力收益由本项目实验决定。

终局与截断处理依据：Gymnasium 官方 Handling Time Limits，`https://gymnasium.farama.org/tutorials/gymnasium_basics/handling_time_limits/`。外部截断与规则终局应区别处理；采用自举的价值更新须保留截断末状态价值，而没有可靠结果的纯监督样本可以屏蔽其 value loss。正式有限时域规则另需编码剩余时间。

本任务书中的网络尺寸、训练预算、试验规模及 5 个百分点开发门槛均为建议的启动条件，未经当前项目实测验证；执行前可在 budget/promotion 配置中调整并冻结，禁止事后为适配结果而调整。
