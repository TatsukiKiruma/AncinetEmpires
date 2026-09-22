# Ancient Empires 空间 AI 复核与后续 Agent 任务书 V9

**日期：2026-09-22**  
**仓库：`TatsukiKiruma/AncinetEmpires`**  
**审查分支：`path-b-spatial-ai`**  
**固定审查提交：`e95b65366186dc55482d5db77346936aaf255ae6`**  
**用途：解释当前训练与实战效果的落差，指导下一轮真实修复、训练和验收。**

> 首要结论：当前不是一个“已经充分训练、正确部署，但网络深度不够”的模型。已提交代码中同时存在前端内置 v1、最新评测使用的 100 状态冒烟 v2，以及较大批次 7,832 状态训练的 v2。先统一模型身份和真实调用入口；随后修复有效数据覆盖、搜索预算分配和纠错证据，再完成有对照的扩量训练。不得继续将“生成了一个 checkpoint”“通过若干测试”写成“AI 已经变强”。

---

## 0. 阅读方式、证据等级与执行边界

### 0.1 先执行什么

第一批执行 **V9-00 → V9-01**，然后并行推进 **V9-02、V9-03**。交付物必须包括真实可用的统一入口、模型身份回执、回归测试和正确权重的开发基线，不能仅增加一份“后续建议”。数据修复 V9-05 在身份核对后即可并行；无需等到所有搜索优化结束才开始修数据。

第二批完成 V9-04～V9-07：修搜索和采样、冻结验证分区、真正训练 10k 训练状态的 32ch/2-block 基线，并运行对局比较。DAgger 与扩深按结果进入，不要求把所有架构和所有历史分支同时重训一遍。

### 0.2 证据分层

| 标识 | 含义 | 本文如何使用 |
|---|---|---|
| 源码确认 | 在固定提交读取到实际实现 | 可证明调用路径、字段消费、循环与筛选规则 |
| 仓库报告 | 仓库中已提交的 JSON、manifest、日志或报告 | 反映该批次记录，不等于本次重新运行验证 |
| 独立隔离检查 | 随包脚本对源码中的小公式/输入投影做验证 | 可证明特定逻辑问题；不是 GameEngine 集成测试 |
| 待实测假设 | 需要真实权重、真实局面或更多对局才能判断 | 必须有后续实验，不写成已证实的输棋原因 |
| 建议阈值 | 本任务书提出的实验与验收起点 | 不是文献定律，也不是已经达到的指标 |

本次未访问用户电脑的活动训练进程、未重新跑完整对局矩阵、未重新训练模型、未下载并重算报告所列 v7/v8 本地权重的 SHA-256。当前进度以固定提交的源代码和已提交工件为准，不能据此报告用户电脑“正在第几个 epoch”。

文内 `[E01]` 等对应文末及 `evidence_manifest.json` 的固定提交来源。随包 `reviewed_metrics.json` 是对报告的整理，不冒充原始 `comparison.json`。

### 0.3 不得突破的边界

- 保留 `HeuristicAI` 生产默认；新增神经网络入口应明确标成实验策略。未经验收及授权，不自动替换默认、不自动 push、不租用付费算力。
- 不改变游戏规则、胜负判定、招募价格、指挥官复活限制或地图机制来换取胜率。规则模式、死亡次数和价格全部从引擎及当前配置读取，不把单一价格写死进 AI。
- 保留历史报告及权重；不得覆盖已有 runId、强制 reset、删除其他 agent 的工作。先记录 dirty diff 和未跟踪工件，再决定安全的工作目录。
- 缺权重、缺数据、错误与未运行须分别记录；禁止以初始化模型、另一模型或 `legal[0]` 冒充所请求的策略。
- 端到端预算按**一次原子决策请求**计，不把 1 秒误解为整回合，也不把网络前向耗时当成完整耗时。

---

## 1. 当前真实进度：已经有工程修复，但模型身份与训练闭环尚未贯通

### 1.1 三条不能混写的模型链路

| 链路 | 固定提交中实际指向 | 能够确认的状态 |
|---|---|---|
| 游戏前端 Spatial 选项 | `spatial_resnet_v1` → `spatial_neural_adapter.ts` → `src/game/ai/models/spatial_resnet_checkpoint.json` | 模型文件头为 `spatial-resnet-v1`；并非新 v2 训练目录 |
| 最新 120 场重评 | `tools/v8_run_reeval_02.ts` 固定 `training_runs/agent_upgrade_20260921_v7_01/checkpoints` | 报告认定现有 v7 权重仅由 100 状态（95 train / 5 val）训练，是冒烟规模 |
| 较大的一次训练 | `agent_upgrade_20260921_v8_final_01` | manifest 为 7,832 唯一状态：6,528 train / 1,304 val；有相应 v2、DAgger、NET_A 报告 |

来源：[E01–E11]。上述“前端实际指向”是已提交源码的调用关系；用户正在打开的网页可能是不同构建，须以页面运行时回执确认。

关键身份：

- 前端 v1 文件的 **Git blob 对象 ID**：`af6ab1644cb174796919704473d9db94ef9e01c4`。这不是权重文件的 SHA-256。[E04]
- 报告所列现有 100 状态 v2 文件 SHA-256：`43c0d74841453b5ddf20f1cbcb8d6d56297bfff953a8240e37f8c21bebba876b`。[E10]
- 报告所列较大批次基础 v2 SHA-256：`1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92`。[E10]
- 报告所列该批次 DAgger SHA-256：`efec05c0e16a707689f651b59262b41db30601fa3ce6b567ed9fc17c117fbf9b`。[E10]

Agent 必须对实际本地文件重新计算哈希。不能因为路径同名，就认为它仍是报告中的模型；也不能把旧模型改名后当成新训练结果。

### 1.2 已完成的内容，不应反复推倒重写

源码及最新修复摘要表明：Spatial 两参数 `predict(encodedState, candidateActions)` 契约、数值有限性校验、NET_A 索引/value 空标签相关修复、评测停滞截断删除、独立随机流、预算与来源记录、恢复窗口统计等已经有实质实现。最新报告还记录了真实入口测试和固定节点重放检查。[E05、E08、E18]

因此，不再把“之前只有文档、没有业务修复”当作当前结论。但是，工具内部入口的修复不等于前端旧入口也修好了；若生产路径仍有随机初始化或 `legal[0]`，不能由其他路径的通过测试替它背书。[E02、E03]

当前严格过拟合测试源码已要求 64 样本、20 epoch、训练准确率至少 95% 且 loss 小于 0.25。旧报告中“四个 epoch/验证准确率超过 20%”的文字不能代表当前测试标准。该测试又依赖本地训练数据，干净克隆是否能执行须另外处理。[E16、E19]

### 1.3 训练进度的正确表述

较大批次的 manifest 记录：[E11]

| 项目 | 实际记录 |
|---|---:|
| 唯一状态总数 | 7,832 |
| 普通对局状态 | 7,000 |
| 课程状态 | 832 |
| 训练 / 验证状态 | 6,528 / 1,304 |
| 根家族总数 | 93 |
| 普通对局根家族 | 从 manifest 计数为 19 |
| 过滤的重复状态 | 11,216 |
| 课程 A / B / C / D / E / F / G | 280 / 42 / 140 / 84 / 126 / 80 / 80 |

DAgger 报告为训练行数由 6,528 增至 6,589，新增 61 行，占混合训练集约 **0.93%**。[E10]

训练入口是 **policy-only 行为克隆**：普通样本的目标来自 Heuristic，`valueTarget=null`、`value-weight=0.0`；存在价值输出接口不代表已经学过可靠胜负价值。不能把当前阶段描述成成熟的自博弈强化学习体系。[E12、E14]

“10k pilot”是历史批次名称/目标，实际只有 7,832 状态，不是已完成 10,000。30k 扩量和系统性的 2-block/4-block 深度对照仍无完成证据。本文也没有证据确认 2,500 个历史回放已被这条生成—训练链路完整消费。[E09、E11、E12、E19]

### 1.4 最新 120 场到底说明什么

运行：`agent_upgrade_20260922_v8_reeval_02`。五图 × 两座位 × 两种子，每策略 20 场；对手为 Heuristic。协议：`maxTurns=45`、`maxAtomicSteps=800`、搜索 `20 nodes / 200ms soft / 900ms hard`，正常重评并非固定节点无墙钟模式。[E07–E09]

| 策略 | 自然胜 | 自然负 | 规则平 | 截断 | 胜 / 全部场次 | 胜 / 已分胜负场次 | 最大决策耗时 ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| HEURISTIC | 6 | 6 | 0 | 8 | 30% | 50.0% | 649.5 |
| SPATIAL_V2 | 0 | 15 | 0 | 5 | 0% | 0% | 38.0 |
| SPATIAL_DAGGER | 0 | 17 | 0 | 3 | 0% | 0% | 34.9 |
| NET_A | 0 | 20 | 0 | 0 | 0% | 0% | 5.1 |
| S00_SEARCH | 5 | 7 | 0 | 8 | 25% | 41.7% | 416.3 |
| S10_SPATIAL_SEARCH | 3 | 11 | 0 | 6 | 15% | 21.4% | 410.2 |

以上是**仓库报告数据，不是本次复跑**。[E09] 最新报告记录 120 场内引擎错误、模型加载错误、NOT_RUN、决策超过 1,000ms 均为零。这是工程进展，但不能推导所有浏览器入口和所有硬件都有硬实时保证。[E08、E09、E15]

必须保留四个限定：

1. 这批神经模型是旧 100 状态权重；不能把它们的失败直接当作 32ch/2-block 架构无效的证据。
2. 较大批次的旧报告中，基础 v2 也只有 2 胜、13 负、5 截断。因此，问题不只是“换个正确权重就一定变强”；有效学习仍未成功。[E10]
3. 截断不是自然平局。只报已分胜负局的胜率会隐藏终局能力差异，必须同时报 W/L/D/T 和 `W/N`。
4. 每臂 20 场只适合开发诊断；不同 checkpoint、代码、墙钟、对局协议的结果不能直接做提升归因。比较应以配对差值区间为主，而不是靠两条独立置信区间是否重叠下判断。

---

## 2. 为什么仍然很差：有可定位的代码原因，不应只归因于网络小

### 2.1 P0：前端 v1 根本看不到区分招募兵种的关键特征

已提交路径为：

```text
App / 自动对局 / 沙盒
  → neural_ai_adapter.getAiAction('spatial_resnet_v1', ...)
  → spatial_neural_adapter.getSpatialAiActionSync(...)
  → 内置 spatial_resnet_checkpoint.json（version = spatial-resnet-v1）
```

前端的 `net_b_s10` 也不是新评测中的 `S10_SPATIAL_SEARCH`，名称相似不代表同一模型和同一搜索实现。[E01–E04]

v2 编码器新增的招募类别、是否指挥官、花费、剩余金币、保留等级/经验，位于动作语义 **24～31**；指挥官死亡次数、动态招募价格、缺口、空城堡数量位于新增全局字段。[E06]

但 v1 策略分支只拼接：

```text
actor 的空间特征 + landing 的空间特征 + target 的空间特征 + semantics[0:24]
```

它没有将这些 v2 招募字段或全局经济向量送入策略打分。[E05] 对同一状态、同一城堡、同一部署坐标的不同兵种招募，v1 实际策略输入相同，确定性网络必然给出相同分数。最终选谁取决于候选排序和并列最大值处理，而不是学会了兵种价值。

注意：这不是“v1 收到 v2 长向量后一定报维度错误”。当前校验允许至少所需长度，v1 会截取前面的部分，因此更可能**静默丢弃特征**。正确修复是模型/编码版本绑定、真实 v2 入口和迁移测试，而不是随意放宽维度检查。

这是一项比“再加深两层”优先级更高的输入可辨识性问题。随包 P1 隔离检查证明了输入投影碰撞；实际游戏中的影响频率仍需记录运行时模型身份、候选特征与 logits。[E03–E06]

### 2.2 P0：模型加载失败仍可悄悄变成随机权重

`getDefaultSpatialPredictor` 的异常分支调用 `createInitializedSpatialResNet(20260920)`。同步入口还保留无效索引时的 `?? legalActions[0]`。这些路径不能被“评测工具已经 fail-closed”覆盖。[E03]

正式评测必须拒绝加载错误；交互前端可以显式回退至合法启发式动作，但回执应写清 `requestedPolicy / actualPolicy / fallbackReason`，且该回退不能计入神经模型实力。初始化权重只允许独立单元测试或明确的 random-weight 对照实验。

### 2.3 P0：最新评测在衡量旧冒烟模型，不是较大训练模型

新驱动中的 `CHECKPOINT_DIR` 被硬编码到 `agent_upgrade_20260921_v7_01`。这意味着再次训练到其他目录，或再跑一遍这个驱动，都不自动改变被测模型。[E07]

更大的训练 → 旧路径评测 → 前端 v1，这三者分离时，用户看到“训练又结束了，但游戏没变聪明”完全可能，并不说明优化器、数据量或网络深度没有作用。必须用机器可校验的模型 registry 把它们串起来。

### 2.4 P1：7,000 条普通状态不等于 7,000 个独立战局

普通状态来自 manifest 中 19 个根对局，状态之间高度相关；采样器每局最多 400 原子步骤，达到总体状态目标还会提前退出当前局。源码中的“Full trajectory to natural endgame”注释不能证明它真的跑到自然终局。[E11、E12]

最新报告还指出 ENDGAME 层缺样本、课程样本未达目标。因原始数据未在本次直接取得，具体阶段分布须由 agent 重新统计；但循环边界和 832 条课程的事实已经足以说明不能将该数据集称为“完整对局训练完成”。[E09、E11、E12]

新的采样需要同时报告“完成的根对局数、自然终局比例、每个根家族采样上限、阶段覆盖”，而不是只报 JSONL 行数。

### 2.5 P1：地图与金币的采样并没有独立

普通对局的代码使用：

```text
mapIndex = episodeCounter % 8
goldIndexP0 = (episodeCounter × 997 + 1013) % 8
goldIndexP1 = (episodeCounter × 617 + 2017) % 8
```

三者都只是 `episodeCounter mod 8` 的函数。因此，每一张地图永远绑定同一组金币偏移。随包 P2 对 800 次 episode 的公式检查得到每图仅一对偏移，证明“增加 episode 数”本身不能去掉这个绑定。[E12]

这不是说所有游戏状态完全相同；而是一个本应独立变化的训练维度没有变化。要改成独立、可重放的随机流，记录地图×经济×座位×种子的交叉覆盖，才能有效扩量。

### 2.6 P1：状态哈希仍漏掉真正的指挥官保留字段

`getBehavioralStateHash` 读取玩家 `reserveLevel / reserveExp / reserveGold`，而当前招募语义使用 `commanderReserveLevel / commanderReserveExp`。[E06、E12]

其他状态不变、只改变实际保留等级/经验时，当前玩家哈希片段不会变化。随包 P3 复现了这个遗漏。它说明去重键仍有行为信息遗漏风险，**并不说明已经证实某个数据集错误合并了多少行**。修复后要检查源状态、重新计算去重和分区，不能只修改函数而继续宣称旧统计完全有效。

### 2.7 P1：根隔离已有，但验证集不够代表实际对局

当前实现先用固定 seed 洗牌根家族，再取 15% 做验证；不是直接取生成顺序前 15%。但它仍没有地图/座位/课程分层，`v8_final_01` 的 13 个验证根家族不含 Duel、Liberty Port。[E11、E12]

此外，NET_A 训练入口在过滤后的 `trainSamples.length===0` 时会退回全部数据。正式流程应拒绝这种输入，而不是以“能训练”为由破坏分区。DAgger 缺基础分区时按样本序号创建 train/val 根，也不能代替真正的同局家族隔离。[E12、E14]

### 2.8 P1：当前搜索不是充分展开的对抗搜索

源代码保留了真实预算和搜索 trace，这是进展。但仍有如下限制：[E13]

| 实现 | 可能造成的后果 | 下一轮应如何测量 |
|---|---|---|
| 己方续走 `friendlySteps < 4` | 单位多时仍未走完己方回合，未真正看到敌方回应 | `reachedOpponent`、完整回合交接率、己方待行动单位数 |
| 对手优先 `find(type==='attack')` | 第一个合法攻击不一定是最危险回应 | 对手最佳可验证反击覆盖、移动后攻击覆盖 |
| 根候选按顺序逐个吃全局预算 | 前几个候选占满预算，后面的先验候选根本未评估 | 每候选节点增量、开始顺序、完成深度、未展开原因 |
| 1 个启发式第一名→战术→Spatial→其他启发式 | 总上限可使其他启发式候选配额为零 | 每类请求配额/实际保留/实际展开三个计数 |
| 深浅不同的叶子分数直接比较 | 可能混入地平线和时序偏差 | 每候选完整/不完整标记、同地平线对照 |

最新报告称平均每次决策实际只评估约 3 个根候选、约 13 个节点；搜索臂的各场比赛都出现过软预算超限。这不是“每次决策都超时”，也不是“已经用满 1 秒”。主协议软预算仅 200ms。[E09]

随包 P4 的构造说明：启发式第一名 + 4 个战术 + 5 个 Spatial 就可占满总数 10，随后启发式补充配额为 0。因此，“155 次诊断没有挤掉启发式第一名”不能证明其他启发式候选或搜索预算没受影响；第一名本来就被代码优先保留。[E09、E13]

目前合理结论是：先验对当前搜索的净效果尚未被隔离，可能既有排序质量问题，也有额外前向耗时和候选覆盖问题。不能仅凭 logit 极差小就证明先验无害；也不能仅凭 S10 输得多就证明空间架构有害。

### 2.9 P1：DAgger 有流程，但纠错量和因果证据不够

这轮新增 61 个状态、约占混合训练数据 0.93%。短对局诊断、样本重复和旧验证分区可能进一步影响实际学习信号；须测量，不能仅凭改了 SHA 判断改善。[E10、E14]

当前反事实有 A 学生继续、B 教师只替换一步、C 教师完全接管。代码使用 `B优于A 或 C优于A` 作确认。**C 更好并不能证明 B 中的那一个替换动作更好**：改善可能来自接管后的其他动作。非 divergence 的结构性疑似错误还可能在 `confirmed=false` 时进入纠错缓冲。[E14]

这不等于这些样本完全不能用于模仿学习，而是“教师标签”“疑似错误”“单步修复已获证据”必须分开，避免自己用启发式评分证明自己的所有标签都正确。

### 2.10 P0/P1：前端的定时器不是同步搜索的抢占式看门狗

`cancellable_ai_runner.ts` 先生成启发式 fallback，再设定 timer，用 `queueMicrotask` 调同步 `getAiAction`。同线程同步计算会占住事件循环，timer 不能在它中途抢占；`stateVersion` 在此文件主要用于记录，不构成落子前的新旧状态检查。沙盒还直接调用同步入口。[E01、E15、E21]

所以“评测报告 0 次超过 1 秒”只说明该批工具对局实测没有超限，不证明前端能取消长计算或避免过期动作。真正的前端边界需要 worker 或明确可中断的执行机制，并在应用动作前重新核对状态版本。浏览器不是硬实时系统，应设余量并诚实统计偶发超限，不承诺任何设备永不超过 1,000ms。

---

## 3. 总体路线与通过条件

```text
已有源码修复：保留并做回归
            ↓
模型/编码/数据身份闭合 → 真实前端/评测同入口
            ↓                         ↓
正确权重冻结重评                 Worker与取消/过期保护
            ↓
搜索候选与对手回应归因        有效采样+哈希+分层分区
            ↓                         ↓
合格教师（可选）             32ch/2块：真实10k → 30k
            └───────────────┬─────────┘
                        有对照DAgger
                             ↓
                  条件性容量/价值学习实验
                             ↓
                    冻结确认评测与交付
```

**不要将所有工程完善任务都设成训练的无限前置条件。** V9-01、V9-05、V9-06 通过后，基础 Heuristic 蒸馏可以训练；只有使用搜索教师的标签时才需要先通过 V9-04 的教师质量门槛。

**也不要无视门槛直接扩深。** 若前端仍用 v1、评测仍读 100 样本，或者去重/分区不可信，扩大到 30k 后仍无法归因结果。

---

## 4. 可执行任务详情

### V9-00｜P0｜模型身份与工件可获得性

**依赖：无。目标：回答每条路径到底使用哪个模型、该模型训练过什么。**

读取当前 HEAD、分支、dirty diff、工作树，确认与本任务书固定提交的差异。不得为“对齐本任务书”覆盖更新的用户修改。建立新 runId，例如 `agent_upgrade_20260922_v9_identity_01`；名字已存在时换新的，不复用。

建立 `model_registry.json`，至少登记 frontend-v1、smoke-v2、较大基础-v2、DAgger、NET_A、无模型的 Heuristic/S00。记录实际路径、字节 SHA-256、architecture、encoder/schema、训练目标、基础权重、dataset/split/consumed hashes、训练源代码来源、可用性和资格等级。

移除评测驱动对旧目录的隐含绑定，改成明确 registry/policy 映射。新增参数时须先实现 `--help` 与校验；不允许在报告里列不存在的命令。

本次固定提交的 `training_runs` 一级树仅含 v6 目录，v7/v8 数据和权重不能默认从公开克隆获得。[E20] agent 应只读盘点本地、已有工件包和明确配置的位置：本地找到则验哈希；找不到则标记 `ARTIFACT_MISSING`，先完成不依赖该权重的任务。需要从头训练时使用新 runId，并明确不是复现原模型。

**验收：** 同一文件在任一路径只对应同一 SHA；旧/新/随机权重不混淆；报告路径均可定位或明确缺失；no-op 的身份检查可在不训练的情况下运行。

**产物：** `source_snapshot.json`、`model_registry.json`、`artifact_availability.json`。

### V9-01｜P0｜统一真实入口，修复前端 v1 脱节

**依赖：V9-00。目标：页面选择的模型就是评测和训练产物中的同一个模型。**

修改重点：`neural_ai_adapter.ts`、`spatial_neural_adapter.ts`、`spatial_conv_net.ts`、`spatial_tensor_encoder.ts`、`App.tsx`，以及实际评测/DAgger调用处。提取共享策略执行接口，不必把所有训练代码引入浏览器。

v1 可以作为显式历史对照保留，但不能伪装成当前 v2。新增清楚的实验 v2 策略，并将模型 version、feature schema 与 checkpoint registry 绑定。若支持 v1 兼容模式，显式选择 v1 编码；正式 v2 路径采用严格维度/版本检查，禁止默默截取尾部修补不一致。

移除正式模型加载失败后的随机初始化。无效索引、非有限 logits、特征不匹配按错误处理；交互回退须注明实际策略，正式 benchmark 不允许悄悄回退后继续记作神经网络胜负。

**必须通过实际模块测试：**

| 测试 ID | 要求 |
|---|---|
| V9-01-A | 从同一状态及同一 checkpoint，经直接 predictor、评测 agent、前端共享入口、DAgger 入口，得到同一动作及可对齐 logits |
| V9-01-B | 同城堡同部署格不同兵种的 v1 输入碰撞被历史复现；v2 对指挥官/士兵有可辨识输入。不得要求任意未训练权重自动选指挥官 |
| V9-01-C | 两座位、候选 >20、候选重排、真实 pending、空/极小候选集、动态招募价格和城堡占用都覆盖；拿不到 fixture 不能通过直接 return 冒充测试 |
| V9-01-D | 错版本/损坏模型/缺模型/非有限数值分别触发可辨识错误，初始化函数和 `legal[0]` 不得悄悄接管 |
| V9-01-E | 浏览器页面能显示 requested/actual policy、完整或可展开 SHA、encoder、objective；显示的 v2 SHA 与 registry、benchmark 一致 |

政策层面的“所有招募动作都可区分”还须做完整候选特征碰撞审计；现有 v2 分类维度可能仍把某些同价同类别单位编码相近，不能只验证指挥官一个例子就宣布整个动作空间无损。

**产物：** `entrypoint_parity.json`、`feature_contract_tests.log`、`frontend_model_identity.json`。

### V9-02｜P0｜真实前端预算、取消与过期动作

**依赖：V9-01；可与 V9-03 并行。**

采用 worker 或能够实际让出执行权的方案，将重计算移出主线程。建议从请求发出开始预算：约 850ms 停止继续扩展，约 950ms 准备返回，1,000ms 为观测/看门狗阈值；这些是留余量的起点，不是任何硬件必达承诺。

时间必须覆盖 fallback 准备、clone/序列化、合法动作、编码、模型前向、搜索、合法性校验、跨线程返回。不得先做昂贵 Heuristic 再启动所谓端到端时钟。fallback 可以是预先验证的廉价安全动作；“合法 fallback”与“完整 Heuristic 策略”在遥测中分开。

外部取消或状态已更新时，禁止把旧 fallback 当成仍可应用的动作。返回 `CANCELLED/STALE`，调用者不落子；重新决策须用新状态和新请求。完成后清理 listener/timer，避免重复执行。

**验收：** 用故意持续占用计算线程的测试证明 UI 主线程仍能取消/超时返回；换图、重置、手动落子、并发请求均不施加过期响应。记录冷/热模型、两座位和大量候选的真实 p50/p95/p99/max、超时数及环境。不以纯 mock 或 Node 工具延迟代替浏览器验收。

**产物：** `browser_runtime.json`、`browser_runtime_tests.log`。

### V9-03｜P0｜冻结权重，先重评正确模型

**依赖：V9-00、V9-01。该任务不重训权重。**

优先使用已存在并验哈希的 `1721ca17…` 较大基础 v2。旧 100 状态模型可保留为清楚标注的 smoke control，但不能仍是 SPATIAL_V2 正式臂的隐含来源。

先做最小连通性检查，再运行五图×两座位×两个固定种子的开发矩阵。必需臂：Heuristic、基础 v2 直接策略、S00、S10-正确-v2。DAgger/NET_A仅在权重身份明确且有比较目的时追加，不让边缘对照拖住核心任务。

**先验消融不等于简单把 logits 全设成零：**

- 固定同一状态、合法动作、节点预算、seed 与叶评价，比较 S00、S10 真先验、S10 禁用先验；禁用臂应明确恢复什么候选/排序规则。
- 另设零值或置乱先验的机制对照时，显式记录并列排序规则；全零后保留原始数组顺序并不自动等价于 S00。
- 分开测试“候选相同、额外调用 predictor 的开销”和“候选改变带来的效果”，避免把少了几十毫秒搜索当作先验质量问题。
- 固定节点无墙钟用于逻辑比较；实时预算用于产品表现。二者报告分开，不能要求固定节点测试同时满足实时硬界限。

逐场保存 W/L/D/T/ERROR/NOT_RUN、终止原因、代码/权重/配置哈希、根ID、随机流、动作轨迹。开发阶段不宣称总体强弱；先用于确定应该修什么。

**产物：** `baseline_correct_checkpoint.json`、`prior_ablation.json`、逐场轨迹。

### V9-04｜P1｜搜索覆盖、公平预算及教师资格

**依赖：V9-03。先做最有区分力的失败局面，再修改搜索。**

首先增加真实遥测，而不是先扩大搜索树：每候选来源、保留原因、排序、独立节点增量、完成深度、是否到达对手、对手步数/攻击覆盖、叶评价阶段、未完成原因、各阶段耗时。不要把累计节点数误报成单候选节点数或把每场总节点误报成每决策节点。

明确候选配额是“保底”还是“上限”；若宣称保底，则在全局 cap 之前预留其空间。至少保护启发式第一名与经过证实的立即制胜/防止立即输棋动作。其他战术动作排序基于收益/危险程度，而非原始合法动作枚举顺序。

用根候选轮转、分阶段扩展或等价方案避免首个候选吃完预算。真实回合完成要根据引擎状态，不用固定 4 个己方动作代替。预算不够时记录 `INCOMPLETE_HORIZON`，不要将未看到回应的分支称为完整防守验证。

对手响应至少应覆盖最危险的可验证攻击和移动后攻击序列，而不是第一条合法攻击。按实际复杂度选择小集合最坏回应或较强的对手 rollout；这不是要求立即实现无限深度 minimax。

**必需 fixture：** 己方还需要超过四次动作才交接；对手第二个攻击比第一个致命；移动后才出现攻击；招募清城后再部署；立即获胜应压过非终局经济收益；不同候选对同一预算有公平覆盖。

预算扫描起点：固定节点 20/40/80，选少量有代表性的配额组合；不要做没有停止条件的全排列。实时扫描在实际设备观察是否能接近 850ms 扩展目标并保留返回余量。

**教师资格：** 先用同局面的错误率、动作收益和冻结开发对局证明新版 S00 改善；若没有证据优于 Heuristic，就保留 Heuristic 基础标签，不能把“搜索”这个名称当作更强教师认证。

**产物：** `search_coverage.json`、`search_profile.json`、`teacher_qualification.json`。

### V9-05｜P1｜有效采样、完整对局和行为哈希

**依赖：V9-00；可与前端/搜索任务并行。**

拆开地图选择、双方经济扰动、行为探索、引擎随机性等随机流。使用完整 seed/初始化配置与规则哈希，禁止以 `seed % 100` 冒充可追溯的唯一根标识。对相同根初态衍生的探索分支、反事实重放和数据增强，保留同一祖先家族关系。

每个对局运行到自然终局或预注册的资源上限。达到样本配额只停止继续选取样本或开启新局，不应让当前局的终止原因消失。若资源上限截断，明确保留 `TRUNCATED`；训练策略样本仍可使用合法教师标签，但不得给它伪造胜负 value 标签。

不要一局取几百个相邻原子状态就当成几百个独立决策经验。采用按阶段的蓄水池或间隔采样，记录每根家族的样本上限、同回合密度、独立局面分支及终局覆盖。完局比例和抽样覆盖分开计算。

课程 A～G 应扩展**有效条件组合**而非单纯扩大 for 循环次数：地图、双方兵力、真实经济缺口、死亡次数、城堡占用、pending、单位可行动状态、立即制胜/立即被杀、保留等级和经验。真实状态须经引擎验证，改过字段的快照不能仅凭目标动作仍“合法”就声称可从游戏规则到达。必要时用合法动作序列生成，再保存快照。

目标动作必须由真实合法动作集合定位；失败样本隔离并记录原因，禁止使用第一个动作顶替。去重、root归属和特征编码版本一起保存；完整 actionCode 不能退化为 `type:unitClass`。

修复哈希中的实际保留字段，检查地图内容/规则配置、单位身份与 pending 关联、影响行为的状态、所有训练使用字段。新增语义哈希版本，不覆盖旧版本统计；清楚区分字节文件哈希、状态语义哈希和根家族ID。

**验收：** 同地图有多个独立经济组合；课程不达目标会明确失败/部分完成；完整episode manifest可区分自然终局与截断；真实 reserve 字段变化能影响状态语义哈希；源码哈希回归测试直接调用仓库函数，而非只跑随附隔离脚本。

**产物：** `sampling_coverage.json`、`episode_manifest.jsonl`、`hash_audit.json`、`quarantine.jsonl`。

### V9-06｜P1｜固定、分层、无泄漏的验证和实际消费

**依赖：V9-05。**

先构造足够的真实根家族，再按地图、双方座位覆盖、经济/课程来源和关键阶段分层。一个根家族及其派生分支整体只能属于 train、validation、holdout 之一。座位是采样覆盖维度，不是把同一局双方状态拆到两边的理由。

区分两类检验：同地图新根/新种子的开发验证，与未参与调参的地图或地图族 holdout。数据不足以支持完整地图泛化时应缩小声明范围，不因为已有七张地图就自动声称泛化到所有地图。

修复 NET_A 空训练分区回退全量的问题。DAgger 必须继承固定的基础验证与祖先根归属，不得通过“给样本换 root 名字”绕过泄漏检查。解析失败、未知 root、重复 sampleId 或同状态跨分区应被拒绝或进入有计数的隔离队列。

所有模型训练保存实际读到并参与损失的样本清单：train/val IDs、去重状态数、有效候选数、丢弃原因、epochs、optimizer updates、样本重复曝光次数。`generated rows`、`unique states`、`root families`、`consumed examples`、`exposures`五个口径不混用。

**验收：** validation 包含目标开发地图（尤其补齐 Duel、Liberty Port）和双方座位；真实根祖先不交叉；所有消费计数可由manifest重算；数据/分区/schema变更时原 checkpoint 标为旧版来源而不是自动改登记。

**产物：** `split_manifest.json`、`consumed_samples_manifest.json`、`split_audit.json`。

### V9-07｜P1｜真正规模训练：先 10k，再按学习曲线决定 30k

**依赖：V9-01、V9-05、V9-06。模型起点：32ch、2 residual blocks、policy-only。**

本轮把 D10、D30 明确定义为**训练分区中实际消费的 10,000 / 30,000 个唯一状态**，不含固定 validation 和 holdout。它与旧报告“总数 7,832 的 10k pilot”不是同一口径；报告中注明差异。

建议实验起点如下，属于设计建议而非已验证最优配方：

| 项目 | D10 起点 | D30 扩量 |
|---|---|---|
| 唯一训练状态 | 10,000 | 30,000 |
| 独立根家族与采样密度 | 普通对局每根采样建议不超过 100；普通对局训练部分至少数十至上百个根，按实际混合比例设门槛 | 增加新根/新条件，不只从旧局加密抽样 |
| 混合来源建议 | 约 60% 完整对局分层状态、20% 机制/战术课程、20% 学生访问状态的教师标签 | 验证后调整，保留可追溯来源 |
| 验证 | 固定约 2,000 状态的分层根家族验证集；不足则如实降低并解释 | 使用同一份冻结验证，不随模型结果重选 |
| 网络 | 32ch/2 blocks | 同架构，先隔离数据量效果 |
| 随机种子 | 至少两次独立训练用于稳定性检查 | 候选晋级前争取三个训练seed；未跑足不得包装成稳定提升 |

这里“20% 学生访问状态”可以使用已有合格 v2 产生的训练根轨迹，也可以先用明确登记的探索策略，不能偷用验证/确认评测的失败局面回灌训练。如果暂时没有合格学生数据，先运行基础来源臂并如实命名，再增加对照，不伪造配比。

**训练步骤：**

1. 在真正多样的 64 状态上运行已有严格过拟合测试。它验证能否学习这批样本，不代表泛化或实战胜率。训练准确率不足时查标签、候选编码、mask、优化器、数值/反向传播；不得直接跳到更大网络。
2. 记录设备、框架、实际解释器、batch、lr、loss、梯度范数、参数范数、输出熵、候选数分桶表现。先确认本机实际可用训练设备，不假定“有显卡”就代表当前环境一定启用 GPU。
3. 在 D10 上训练到预注册的更新上限或验证指标早停。旧入口默认 4 epoch 只是默认值，不能作为已收敛证明；本次报告必须给出实际曲线。[E12]
4. 对导出的 best 与 last 区分保存；做 Python/TypeScript 推理一致性校验；使用同一 registry 将实际参评权重锁定。
5. 运行 V9-03 对应的开发对局协议及战术 fixture，比较旧较大 v2、新 D10 和 Heuristic。不要只拿 100 状态模型作唯一对照。
6. 若 D10 相对小数据在固定验证/实战上有持续改善，扩至 D30；无改善先定位标签、覆盖或表达问题。D30 对照尽量包括固定 optimizer updates 与合理训练到收敛两种视角，避免把多算了几倍更新全归因于数据更多。

**最低质量读数：** train/val cross-entropy、top-1、按候选规模/地图/阶段/动作类型分层的准确率、指挥官恢复机制测试、立即胜负动作漏选率、模型输出分布、真实对局 W/L/D/T。若存在多个等价好动作，单一 top-1不一致不直接认作战术错误，可在有可靠动作收益证据时补充排序/后悔值指标。

**停止与分流：** 64 状态都学不会→先修训练；train好val差→优先新根与分层数据；train和val都停滞→查标签冲突/表达能力再测容量；模仿准确率好而对局差→查学生访问分布、序列决策和教师质量；搜索臂差→回到搜索覆盖，不盲目重训全部模型。

**产物：** `learning_curves.json`、`training_config.json`、best/last 权重、消费清单、`checkpoint_registry.json`、`scale_benchmark.json`。

### V9-08｜P1｜有对照的 DAgger，而不是只追加几十行后宣布纠错

**依赖：V9-07、V9-03。若基础学习尚未成立，可暂缓。**

在训练根家族上采集完整学生对局及必要的失败窗口，覆盖两座位和多类局面。保留基础数据与验证，新增样本应携带原始对局祖先，不能每个样本伪造独立根。

拆开三种标签：`TEACHER_DISAGREEMENT`、`SUSPECTED_BLUNDER`、`VERIFIED_SINGLE_STEP_IMPROVEMENT`。A/B/C比较保留独立随机流和同一初态；B、C的增益分别报告。只有 B 有合适证据时才把它称为“教师这一动作修复了错误”；C有用但B无证据时，只能说明更长策略接管可能有价值。短期启发式收益是代理指标，不冒充真实获胜概率。

新增样本可按建议在 mini-batch 中占 10%～25% 进行初始消融，但必须同时报告唯一新状态数和重复曝光次数。重采样 61 行不等于拥有几千条新经验；优先扩大真实错误条件覆盖。

运行三个并列臂：基础 checkpoint、仅用旧数据继续训练、旧数据加新 DAgger；后两者更新数和优化设置一致。必须验证提升来自纠错信息而不只是多训练了一轮。评测集和错误来源不能混用。

**验收：** 不以新 SHA、缓冲区更长、重招募率更高作为棋力通过条件；需要分层行为改善和配对对局证据。没有提升仍交付真实失败结果，并冻结坏模型为对照，不自动替换基础模型。

**产物：** `dagger_corrections.jsonl`、`dagger_root_manifest.json`、`dagger_ablation.json`。

### V9-09｜P2｜条件性扩深与真实价值学习

**依赖：V9-07、V9-04。不是第一批必做，也不是默认换架构。**

**容量对照：** 在标签、输入、分区可靠且训练曲线提示可能欠拟合后，用相同数据、同一验证、同一评测协议比较 2/4 residual blocks。固定宽度32先隔离深度。记录参数量、实际更新、训练资源、前向延迟、完整决策延迟；计算量约束和收敛充分性分别说明。若 2块训练表现已经很好、仅泛化差，先扩新根而非把加深当作必然补救。

**价值头：** 当前 policy-only 应继续明确标识，不把 `result.value` 展示成校准胜率。只有收集自然终局、保证联盟/座位视角和标签可靠后，再进行 value loss 消融。自然胜/负/规则平可以在定义清楚的编码下生成标签；资源截断/错误/无结局不能强塞成0，也不能把启发式分数直接叫真实胜率。训练时对无有效value标签的样本显式mask，并验证梯度有限。

先测试价值模型是否有预测与校准价值，再决定是否用于搜索叶评价。不能同时换输入、扩数据、扩深、启用value、增加搜索预算，然后把综合变化全部归因于网络深度。

**产物：** `capacity_ablation.json`、`value_label_audit.json`，或具体说明未满足前置条件的 `NOT_RUN` 记录。

### V9-10｜P1｜确认评测、可复现交付和晋级

**依赖：V9-02、V9-03、V9-07。V9-08/09只在实际运行时纳入比较。**

开发矩阵的每臂20场不能作为长期棋力结论。候选确定后冻结模型、协议与种子，建议用五图×两座位×十个根种子，即每臂100场作为下一档确认规模起点。若多种子没有实际改变初态或行为，需识别重复轨迹，不能凭命名不同虚增有效样本。

统计单位以配对的地图/种子/初态家族为基础，两个座位作为同组，不直接把同一局的几百个动作当成几百个独立胜负。对候选与基线的配对差值做分组bootstrap或相应配对区间；若声称稳定优于基线，应有正向差值区间及未恶化的关键分层证据。100场不是自动达到显著性的保证。

保持双方一致的引擎与协议。截断多时，另做预注册的延长上限敏感性检查；不能只为候选延长、只为基线提前停，也不能删除难图、坏seed或输棋来改善数字。

交付可读报告、机器可读状态、数据/权重获取说明、所有实际命令和环境、哈希及协议。在新工作树或干净环境中验证重现路径；大工件不必硬塞Git，但必须有用户可获得且可校验的工件包/既有存储路径。不得擅自上传私有工件或租云服务。

**生产晋级条件：** 真实入口正确；无静默策略替换；数值和动作合法；浏览器取消/过期保护通过；延迟实测符合目标或清楚报告限制；确认对局中有稳定效益且没有灾难性地图/座位退化。未通过则默认Heuristic不变，实验模型仍可用于继续研究。

**产物：** `acceptance_report.md`、`task-status.json`、`release_manifest.json`、`reproduction.md`。

---

## 5. 必须固定的数据结构与报告口径

### 5.1 模型 registry 的建议结构

下面是**新接口设计示例**，不表示当前仓库已存在这些字段或实现。`UNRESOLVED` 必须被正式运行拒绝；agent 不得把示例拷贝进去当成完成身份核验。

```json
{
  "registryVersion": "v9",
  "policyId": "spatial_v2_experimental",
  "checkpoint": {
    "path": "UNRESOLVED",
    "sha256": "UNRESOLVED",
    "architecture": "spatial-resnet-32ch-2blocks",
    "encoderVersion": "v2",
    "featureSchemaHash": "UNRESOLVED",
    "objective": "policy-only",
    "valueHeadQualified": false
  },
  "training": {
    "runId": "UNRESOLVED",
    "datasetSha256": "UNRESOLVED",
    "splitManifestSha256": "UNRESOLVED",
    "consumedManifestSha256": "UNRESOLVED",
    "trainUniqueStates": null,
    "trainRootFamilies": null,
    "optimizerUpdates": null,
    "sourceCommit": "UNRESOLVED",
    "sourcePatchArtifact": null
  },
  "qualification": "UNVERIFIED"
}
```

明确 `sourceCommit` 是训练来源还是评测来源；若dirty，保存对应可获得的补丁/源快照，不仅保存一个无法还原的hash。文件路径尽量用仓库相对路径和独立工件根目录，而非写死 `C:\\code\\...`。

### 5.2 逐次决策回执

至少包括：`requestId`、`stateVersion`、`requestedPolicy`、`actualPolicy`、`checkpointSha256`、`encoderVersion`、`legalActionCount`、`chosenActionCode`、`fallbackUsed`、`fallbackReason`、`start/return monotonic time`、`e2eMs`、分阶段耗时、`deadlineMiss`。取消/过期时应有非动作结果，而不是伪造落子。

搜索另带候选筛选数、真实展开数、每候选trace、节点数、真实交接/对手攻击覆盖。网络value未训练时不得在UI上当胜率展示；可以显示“未训练value，不用于决策”。

### 5.3 训练覆盖

同时写：原始行数、合法行数、隔离行数、去重状态数、根家族数、完成对局数、自然终局比例、地图/座位/阶段/动作类型/课程分布、每根采样密度、实际被优化器消费的唯一ID及重复曝光次数。

指挥官相关至少覆盖：当前是否存活、死亡次数和引擎返回价格、金币与实际缺口、城堡占用、pending、保留等级/经验、是否存在当前合法重招募动作。不能因为“有钱”就假设当前一定可以招募；不能把“总是立即重招募”硬编码成一切局面的正确策略。

### 5.4 对局指标

令 W/L/D/T 分别为自然胜/自然负/规则平/资源截断，错误和未运行另列。区分计划场次、实际开始场次、正常结束场次；提供总账避免失败运行悄悄消失。

最少同时报 W/L/D/T、`W/N`、`W/(W+L)`（明确这是只在分胜负局上的条件比率）、截断率、各终止原因、双座位/地图分层。自然平局与截断不能合并。若报告给平局半分的得分，公式和分母必须明示，不能把截断自动赋0.5。

重招募单独报：合法决策机会数、恢复窗口数、完成窗口数、完成延迟、未完成原因。它是机制诊断，不是棋力。模型高频把指挥官送死又买回来，可能有很高恢复率但更差战局；不能用这个指标替换W/L。

延迟报 p50/p95/p99/max 和真实超限次数，说明硬件、运行时、冷热加载、包含哪些阶段。不要把每场的最大值再平均伪装成p99，也不要把每场总节点写成每决策节点。

---

## 6. 实验顺序与预算管理

| 阶段 | 主要回答的问题 | 必要实验 | 不要做的事 |
|---|---|---|---|
| A：身份和真实入口 | 用户到底运行了谁？ | 模型SHA对齐、v1碰撞回归、真实页面回执 | 先重训一批仍不部署的模型 |
| B：正确权重重评 | 现有较大模型在修复协议下如何？ | Heuristic/v2/S00/S10同协议开发矩阵 | 用100状态checkpoint代表架构上限 |
| C：覆盖和教师 | 是输入/数据问题还是搜索看错了？ | 同局面候选、回应、预算与标签审计 | 只增节点、不查对手是否曾行动 |
| D：扩量学习 | 更多有效经验是否带来提升？ | 2块D10→D30，固定分区、实际曲线和对局 | 把同局加密采样称作更多独立经验 |
| E：纠错与容量 | 哪种增量真正有收益？ | 继续训练对照DAgger；有条件2vs4块 | 同时改所有因素后只写“更深更好” |
| F：确认与交付 | 可否稳定用于实际游戏？ | 冻结确认矩阵、浏览器边界、可复现工件 | 20场小样本或通过测试就自动上线 |

资源不足时，优先保证A/B和D10的最小真实闭环；D30、更多训练seed或容量实验可以标记NOT_RUN并给出已测资源消耗、剩余任务和具体阻塞。不要将所有任务泛称“算力不足”，也不要擅自把样本目标缩小后仍沿用目标名称宣称完成。

生成器须有最大尝试数、无新增状态停止条件、流式写入与错误恢复，避免重复空间耗尽后无限生成。可保存已完成根对局的中间工件以便显式续跑；续跑要保留seed、计数和根家族一致性，不能拼接后重复计数。

---

## 7. 状态更新、协作分工与最终提交格式

### 7.1 状态语义

`TODO`：尚未执行。`IN_PROGRESS`：执行中。`IMPLEMENTED`：代码存在但未通过真实测试。`TESTED`：相应范围的真实测试通过。`MEASURED`：已运行且有实测工件。`ACCEPTED`：本任务定义的全部验收条件通过。`BLOCKED`：具体前置条件不可获得。`NOT_RUN`：选择未运行或尚未安排。

不得用一个总的 `QUALIFIED` 抹掉未执行的子项。拿不到真实pending fixture时记未覆盖，不得通过直接return让测试显示绿；找不到数据时不得拿随机数据冒充真实过拟合实验。

随包 `agent_tasks_v9.json` 所有后续任务初始为TODO。它不代表本次审查已执行这些任务。

### 7.2 可并行但不互相踩文件

身份/共享接口由一个主负责者确定；前端Worker、采样与分区、搜索诊断可在明确接口后分开推进。共享schema变更先记录版本，不让每个agent各自发明一套特征定义。

每个agent先读取当前HEAD与任务状态，声明负责文件及新runId。遇到其他agent的未提交改动，保留现场、选择不冲突文件或独立工作树；不得为了测试通过清除对方的目录或历史报告。

### 7.3 每批必须交付

每批结束写清：源码改了什么、运行了什么命令、真正通过哪些断言、实际生成/消费/训练/评测多少、工件位置及hash、没有做什么、下一项可执行任务。用数字和文件证据代替“全面完善”“彻底修复”“模型学会了战略”等描述。

建议新报告目录结构：

```text
training_runs/<new_run_id>/
  source_snapshot.json
  model_registry.json
  datasets/
  manifests/
  checkpoints/
  traces/
  raw_metrics/
docs/training/reports/<new_run_id>/
  acceptance_report.md
  task-status.json
  comparison.json
  coverage.json
  reproduction.md
```

这是建议布局，不要求机械搬迁旧目录。已有可用机制优先复用，但不得覆盖受保护历史。

---

## 8. 本次交付包与隔离检查的使用

`isolated_contract_probes_v9.cjs` 可独立运行：

```bash
node isolated_contract_probes_v9.cjs
```

它检查四个从源码摘取的逻辑事实：v1招募输入投影碰撞、地图/金币共模、保留字段哈希遗漏、默认候选插入顺序下其他启发式配额可被挤占。`isolated_probe_results.json` 是本次执行输出。

**严格限制：这些不是仓库集成测试。** 它们没有加载实际权重、没有运行GameEngine、没有测量胜率或原项目完整测试套件。Agent应把这些反例转成直接调用实际模块的测试。正式修复后，要证明原实现会失败、新实现通过，而不只是把随包公式也改成“通过”。

`reviewed_metrics.json` 保存报告数字整理，`evidence_manifest.json` 保存源路径与证据等级，`agent_tasks_v9.json` 保存执行依赖，`AGENT_START_PROMPT_v9.txt` 可直接作为agent首条任务指令。

---

## 9. 最终决策

保留空间分支；不恢复到“多试几个网络碰碰运气”的路线。当前优先级是：

**统一真实模型身份与前端特征 → 用正确权重重评 → 修有效采样/搜索覆盖 → 真实D10/D30学习曲线 → 有对照DAgger → 条件性深度/价值实验。**

增加数据是有必要验证的方向，但要增加新的根对局和关键局面，而非重复状态。增加深度可以成为后续实验，但无法修复前端仍用旧模型、招募动作在输入上完全相同、评测仍读冒烟权重、搜索未看到真实反击这些问题。

下一轮最重要的交付不是“又多训练了一个模型”，而是能从页面上的一条决策回执，追溯到同一个checkpoint、同一份实际消费数据、同一版特征和同一套可信评测。

---

## 10. 固定提交证据索引

以下来源均按本任务书固定提交读取；仓库报告的历史结论不自动视为当前事实，以上文源码核对和限定为准。

**[E01]** `src/App.tsx` — 前端入口、默认策略、同步沙盒调用。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/src/App.tsx)

**[E02]** `src/game/ai/neural_ai_adapter.ts` — 前端策略列表仍是旧Spatial v1及NET_B路径；不是V8实验S10。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/src/game/ai/neural_ai_adapter.ts)

**[E03]** `src/game/ai/spatial_neural_adapter.ts` — 绑定旧模型；加载失败初始化随机权重；索引异常回退legal[0]。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/src/game/ai/spatial_neural_adapter.ts)

**[E04]** `src/game/ai/models/spatial_resnet_checkpoint.json` — Git blob头确认spatial-resnet-v1。blob对象ID不是SHA-256。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/src/game/ai/models/spatial_resnet_checkpoint.json)

**[E05]** `src/game/ai/spatial_conv_net.ts` — v1策略仅消费前24维动作语义，不将全局向量拼入策略；v2扩展。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/src/game/ai/spatial_conv_net.ts)

**[E06]** `src/game/ai/spatial_tensor_encoder.ts` — v2招募特征24–31及全局16–19；真实保留字段commanderReserveLevel/Exp。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/src/game/ai/spatial_tensor_encoder.ts)

**[E07]** `tools/v8_run_reeval_02.ts` — 最新重评固定使用v7_01/checkpoints，不训练新权重。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/tools/v8_run_reeval_02.ts)

**[E08]** `docs/training/reports/agent_upgrade_20260922_v8_reeval_02/comparison.json` — 最新矩阵、协议、dirty来源及部分聚合数值；完整六策略表另见E09。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/docs/training/reports/agent_upgrade_20260922_v8_reeval_02/comparison.json)

**[E09]** `docs/training/reports/agent_upgrade_20260922_v8_reeval_02/NEXT_ACTION.md` — 六策略120场结果；100样本权重限定、先验诊断、未完成项。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/docs/training/reports/agent_upgrade_20260922_v8_reeval_02/NEXT_ACTION.md)

**[E10]** `docs/training/reports/agent_upgrade_20260921_v8_final_01/v8_final_audit_report.md` — 较大训练批次SHA、消费数、旧120场和61条DAgger记录；报告定性结论需与源码核对。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/docs/training/reports/agent_upgrade_20260921_v8_final_01/v8_final_audit_report.md)

**[E11]** `docs/training/reports/agent_upgrade_20260921_v8_final_01/split_manifest.json` — 7832=7000+832；6528/1304；93根家族；验证集缺Duel/Liberty Port。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/docs/training/reports/agent_upgrade_20260921_v8_final_01/split_manifest.json)

**[E12]** `tools/v7_training_pipeline.ts` — 普通数据采样、金币与地图共模、400步前缀、哈希字段、根分区、训练入口。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/tools/v7_training_pipeline.ts)

**[E13]** `tools/v7_heuristic_bounded_search.ts` — 候选插入顺序、总预算、4个己方续走动作、首个对手攻击、不同叶深度。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/tools/v7_heuristic_bounded_search.ts)

**[E14]** `tools/v7_counterfactual_dagger.ts` — A/B/C反事实、B或C确认为真、短对局收集、warm-start、根家族及分区风险。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/tools/v7_counterfactual_dagger.ts)

**[E15]** `src/game/ai/cancellable_ai_runner.ts` — 主线程queueMicrotask+setTimeout；fallback先于计时器；stateVersion只记录。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/src/game/ai/cancellable_ai_runner.ts)

**[E16]** `tools/v8_r8_06_spatial_learning_sanity.test.ts` — 当前真实源码要求64样本20epoch train_acc>=95%、loss<0.25；依赖本地数据。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/tools/v8_r8_06_spatial_learning_sanity.test.ts)

**[E17]** `tools/v8_r8_07_dagger_loop.test.ts` — DAgger回归依赖本地固定SHA权重及数据，测试输出进入临时目录。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/tools/v8_r8_07_dagger_loop.test.ts)

**[E18]** `docs/training/reports/agent_upgrade_20260922_v8_reeval_02/source_diff_summary.md` — 已落地修复来源；测试覆盖与pending路径尚未实际覆盖的限定。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/docs/training/reports/agent_upgrade_20260922_v8_reeval_02/source_diff_summary.md)

**[E19]** `docs/training/reports/agent_upgrade_20260921_v8_final_01/task-status.json` — 旧任务状态；10k名称与7832实际数量不一致，不照抄QUALIFIED。  
[固定来源](https://github.com/TatsukiKiruma/AncinetEmpires/blob/e95b65366186dc55482d5db77346936aaf255ae6/docs/training/reports/agent_upgrade_20260921_v8_final_01/task-status.json)

**[E20]** `training_runs/` — 本次读取的完整一级子树仅有agent_upgrade_20260921_v6_01；v7/v8训练工件未包含在该提交的此目录。  
[固定来源](https://api.github.com/repos/TatsukiKiruma/AncinetEmpires/git/trees/474d531004400d8a7df8ae41a6f6a5a8b6667e64)

**[E21]** `WHATWG HTML Standard` — WHATWG HTML事件循环：同一agent中的同步计算不能靠同线程定时器抢占。  
[固定来源](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)

