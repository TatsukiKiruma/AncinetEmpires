# r4 规则下的新 AI 研究基础与搜索教师资格验证 - 阶段结题总报告 (STAGE_REPORT.md)

- **执行日期**：2026-10-13
- **研究工作区**：`C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700`
- **冻结规则版本**：`apk-4.2.5.1-rules-20261013-r4`
- **交付包 SHA-256**：`323924ab76a8272322f4b122d64e4af4ff2574a85c6a4d996bf4cb9680bffea8`
- **计算资源与预算记账**：Node.js v22.18.0, Python 3.12.10, PyTorch 2.14.0 (CPU 模式), AMD Ryzen 16-Core, 47.1GB RAM；累计墙钟运算约 9.5 小时（严格控制在 12 小时预算上限以内）。
- **受保护文件变动数**：**0**（主项目 `src/`、`tools/`、`package.json` 等 14 个核心文件 100% 零修改）

---

## Executive Summary (阶段执行总括)

本阶段完整实现了《AncientEmpires AI 战略方案》规定的 **T00 至 T06** 全流程，在完全隔离的研究工作区中，对 2026-10-13 最新修复的 r4 规则（包括地形解析、移动成本、致盲技能、召唤经验、城堡扣血与墓碑刷新对齐）构建了可信裁判、完备数据协议、战术题库与根候选搜索教师，并执行了严格的消融与资格评测。

### 核心结论快速答复：

1. **当前研究环境、裁判、数据协议和评测是否可靠？**
   - **完全可靠 (PASS)**。独立环境顺利通过全部 285 项规则回归测试、Lint、Build 与 Smoke；严格裁判器在 1,157 步对战中实现 100% 确定性重放一致性；支持子进程硬超时终止；特征 Schema（`features-v1.json`，哈希 `711019e84844...`）与 269 份 Golden 样本支持 100% 精确双向重建；Gate A 工程指标全线通过。
2. **新搜索教师是否在冻结规则下优于项目规则基线？**
   - **否，未展现出显著优势**。在 40 局严格配对对决中，面对最强冻结基线 `HeuristicAI` 取得 0 胜 0 负 20 截断（截断率 100.0%），保守得分（95% CI 下界）为 **0.00%**；面对次级基线 `ApkLikeAI` 取得 1 胜 0 负 19 截断（截断率 95.0%），保守得分亦为 **0.00%**。
3. **是否具备进入新数据生产和新模型训练阶段的资格？**
   - **不具备资格 (Gate B: FAIL)**。未达到“保守得分≥60%”、“CI下界>50%”、“截断率≤10%”以及“战术题验收率≥80%”的门槛。依照战略方案硬性规范，**严禁启动大规模数据生产、学生蒸馏或网络训练“碰碰运气”**。
4. **若不具备，最主要的失败原因与证据是什么？**
   - **最主要失败原因为：守势价值偏置（Defensive Bias）与缺乏宏观推进势场，导致战局在长盘中 97.5% 陷入死锁循环截断（endgame_loop: 39/40）**。
   - 证据已完整归档至 `artifacts/gate_b_verdict.json` 及 `artifacts/failed_replays/`（含 10 份代表性完整轨迹回放）。

---

## 阶段任务完成情况一览表 (T00–T06)

| 阶段任务 | 任务名称 | 目标交付物 | 验证状态 | 核心成果指标 |
| :---: | :--- | :--- | :---: | :--- |
| **T00** | 环境与版本冻结 | `artifacts/source_manifest.json`<br>`artifacts/environment.json` | **PASS** | 62 交付文件哈希 100% 匹配；npm test 285/285 全过 |
| **T01** | 严格裁判与回放协议 | `research/match_runner.ts`<br>`research/policy_worker.ts` | **PASS** | 1,157 步精确重放无漂移；进程超时 100% 强制终止 |
| **T02** | 赛场划分与战术题 | `configs/scenario_split.json`<br>`eval/tactical_suite.json` | **PASS** | 划分 Train/Dev/Test/隔离图；44 道战术题全部合法 |
| **T03** | 固定动作与特征契约 | `artifacts/features-v1.json`<br>`artifacts/golden/` | **PASS** | 特征协议哈希锁定；269 份 Golden 样本 100% 重建 |
| **T04** | 基线微基准与 Gate A | `artifacts/gate_a.json` | **PASS** | 确定 Heuristic 为最强基线；PyTorch 算子验证通过 |
| **T05** | 根候选搜索教师实现 | `research/search_teacher.ts` | **PASS** | 统一行动相位推演；固定 root 联盟视角；单测全过 |
| **T06** | 消融实验与资格裁决 | `artifacts/ablation_results.json`<br>`artifacts/gate_b_verdict.json` | **FAIL** | 战术题命中 53.1%；Arena 截断率 97.5%；门槛未过 |

---

## 一、T00–T04 研究基础设施建设详解

### 1. 环境版本与安全性隔离 (T00)
- 从交付物 `AncientEmpires-clean-environment.zip` 严格解压至 `env/` 目录；
- 解压后计算压缩包 SHA-256，与引用值 `323924ab76a8272322f4b122d64e4af4ff2574a85c6a4d996bf4cb9680bffea8` **完全一致**；
- 记录 62 个规则核心文件的 SHA-256，锁定 `apk-4.2.5.1-rules-20261013-r4` 为唯一法定只读规则；
- 启动与收尾时自动核验主项目 14 个核心文件，变动数为 0。

### 2. 严格裁判协议与可重复性 (T01)
- 实现了不依赖任何 UI 和外部服务的严格对局执行器 [match_runner.ts](file:///C:/code/AncinetEmpires/ai_training/r4_teacher_stage_20261013_121700/research/match_runner.ts)；
- **防伪装保证**：严禁 forced 动作、严禁静默回退、严禁使用金币/军力代理胜负，只有引擎原生 `winnerAlliance` 判定胜负；
- **重放一致性**：记录动作语义编码、初始状态与确定性 SHA-256 状态哈希。在单元测试中实测 1,157 步转移重放差异为 0；
- **真硬超时**：通过独立的 Node.js 子进程 Worker [policy_worker.ts](file:///C:/code/AncinetEmpires/ai_training/r4_teacher_stage_20261013_121700/research/policy_worker.ts) 执行策略决策，硬超时超时后发送 `SIGKILL` 强杀进程，彻底解决伪超时问题。

### 3. 赛场划分与 44 道战术用例套件 (T02)
- **赛场划分 [scenario_split.json](file:///C:/code/AncinetEmpires/ai_training/r4_teacher_stage_20261013_121700/configs/scenario_split.json)**：
  - `train`: `Duel`, `Liberty Port`, `Swamplands`
  - `dev`: `(2) Icy Paths.aem`, `(2) The Crossing.aem`
  - `test_sealed`: `(2) Peak Island.aem`, `(2) Crossed swords.aem`（本阶段严格封存，未消费）
  - `quarantine`: `Mourningstar`（因 2 处 approximate 地形证据被严格隔离）
- **战术题套件 [tactical_suite.json](file:///C:/code/AncinetEmpires/ai_training/r4_teacher_stage_20261013_121700/eval/tactical_suite.json)**：
  - 共 44 道题，分为 32 道可证明最优解的验收题与 12 道诊断题；
  - 覆盖致死指挥官、城堡抢占、残血治疗、卡位造肉盾、解致盲、反隐破雾、经验控级等 15 类战术。

### 4. 数据契约与 Golden 样本集 (T03)
- **特征 Schema [features-v1.json](file:///C:/code/AncinetEmpires/ai_training/r4_teacher_stage_20261013_121700/artifacts/features-v1.json)**：
  - 契约哈希：`711019e84844d2b3a2f14e557ce8735efbf6ce98ceaf5c7d26d86ffae94fb658`；
  - 规定了空间平面 `[28, 15, 15]`、全局标量 `[16]`、离散实体 `[64, 24]` 与三种 Mask；
  - 针对同一格叠放（pending 招募、骷髅墓碑并存）进行实体槽完整保留；
  - 完整合法候选动作绝不静默截断为 256。
- **Golden 数据集 [golden_samples.json](file:///C:/code/AncinetEmpires/ai_training/r4_teacher_stage_20261013_121700/artifacts/golden/golden_samples.json)**：
  - 包含 269 份覆盖全部 13 类动作的样本，在 `features.test.ts` 中完成 100% 精确可逆重建。

### 5. 基线 Pilot 与 Gate A 审查 (T04)
- **微基准分析**：`engine.clone()` p50=0.10ms，`getLegalActions()` p50=0.08ms，`HeuristicAI` p50=7.30ms，`ApkLikeAI` p50=2.90ms；
- **基线配对 Pilot（40 局）**：`HeuristicAI` vs `ApkLikeAI`，Heuristic 胜 20 局，ApkLike 胜 1 局，平 0，截断 19 局。**确立 HeuristicAI 为最强冻结基线**；
- **PyTorch 算子验证**：CPU 前向/反向 112.4ms/batch，梯度有限无 NaN；
- **Gate A 裁定**：**PASS**，准许进入教师实现与验证。

---

## 二、T05–T06 搜索教师架构与 Gate B 实测

### 1. 根候选搜索教师核心架构 (T05)
- **统一行动相位 (Common Handoff Phase)**：在根节点选定 K 个候选动作试走后，使用基线策略推演本方回合剩余行动，并推进对手完整回合回应，直到游戏重新轮转回根观察者的行动相位，消除单原子步相位失配；
- **固定 Root 视角**：评估器始终以根观察者联盟为基准，避免反号翻转错误；
- **双策略对抗 Min 聚合**：同时使用 Heuristic 与 ApkLike 推演对手，取最保守悲观叶值；
- **候选覆盖**：优先保留启发式 top-1、解 pending 动作、高威胁战术动作并混合 20% 探索性动作。

### 2. 消融实验数据对比 (T06)
在 `artifacts/ablation_results.json` 中记录了 5 组消融：
1. **根贪心 (`rootGreedy`)**：战术题解决率高达 75.0%，但在 Arena 对战中因无防守预判直接输掉 2 局；
2. **单一 H 回应 (`hOnly`)**：战术题解决率降至 43.8%，证明双策略对抗更具鲁棒性；
3. **K=8 候选膨胀 (`k8`)**：战术题解决率显著下滑至 34.4%，过多分支稀释了搜索精度；
4. **去除建筑估值 (`materialOnly`)**：战术题诊断题解决率彻底跌为 **0.0% (0/12)**，证明建筑估值不可或缺。

### 3. Gate B 正式对战核验 (vs 冻结基线)

在 dev 地图上对战冻结基线（各 20 局配对赛）：

| 对决项 | 局数 | 胜 | 负 | 平 | 截断 (Trunc) | 截断率 | 保守得分 (95% CI 下界) | 门槛要求 | 判定 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **vs HeuristicAI** | 20 | 0 | 0 | 0 | **20** | **100.0%** | **0.00%** | $\ge 60.0\%$ | ❌ **FAIL** |
| **vs ApkLikeAI** | 20 | 1 | 0 | 0 | **19** | **95.0%** | **0.00%** | $\ge 50.0\%$ | ❌ **FAIL** |
| **44题战术套件** | 32 验收 | 17 | - | - | - | - | **53.1%** | $\ge 80.0\%$ | ❌ **FAIL** |

**Gate B 综合裁决**：**FAIL**。

---

## 三、失败原因全面归因与证据链

在 40 局正式对战中，异常统计分布如下：
- `candidate_miss`: 0
- `perspective_error`: 0
- `phase_mismatch`: 0
- `leaf_evaluation`: 0
- `throughput_timeout`: 0
- `rule_protocol`: 0
- **`endgame_loop` (终局相持死锁)**: **39 / 40 (97.5%)**

### 根本机理解析：
1. **守势价值偏置（Defensive Bias）**：
   - 当前叶值函数只评估己方与敌方的兵力、金币及占有建筑。当单位守在己方基地和城堡附近时，拥有地形高防御与回血优势；
   - 一旦主动进攻，在单步前向推演中往往会承受被敌方集火的局部劣势。因此搜索教师与基线 AI 双方均倾向于在阵地前沿固守，绝不冒险突破；
2. **缺乏推进势场与控图激励（Lack of Pushing Incentive）**：
   - 估值函数中缺少“距离敌方指挥官/主城曼哈顿距离”或“领地前沿推移”的渐进势场，导致长盘对抗中无法组织有目的的协同突破；
3. **单次换手搜索深度的视野局限**：
   - 复杂战棋的破局通常需要 3~5 轮换手的多兵种迂回包抄，单次换手推演无法看到跨轮次的牺牲突破收益。

### 失败回放资产：
10 份最具代表性的长盘死锁回放已完整存储于：
[artifacts/failed_replays/](file:///C:/code/AncinetEmpires/ai_training/r4_teacher_stage_20261013_121700/artifacts/failed_replays)
包含地图初始状态、逐步语义编码与状态转移 SHA-256 哈希，供后续算法改进复查。

---

## 四、后续工作建议与交接说明

1. **坚决遵守任务规范**：Gate B 未通过，**不启动学生网络蒸馏或数据生产**；
2. **改进建议（Teacher v2）**：
   - 引入 **Voronoi 领地面积** 与 **目标压迫势场** 作为状态估值项，打破龟缩死锁；
   - 扩展试走深度至多步换手，或引入轻量启发式引导先验以提高分支有效性；
3. **资产保护与复现**：
   - 运行工作区根目录的 [reproduce.ps1](file:///C:/code/AncinetEmpires/ai_training/r4_teacher_stage_20261013_121700/reproduce.ps1) 即可自动化回归全量测试；
   - 完整交接说明见 [HANDOFF.md](file:///C:/code/AncinetEmpires/ai_training/r4_teacher_stage_20261013_121700/HANDOFF.md)。
