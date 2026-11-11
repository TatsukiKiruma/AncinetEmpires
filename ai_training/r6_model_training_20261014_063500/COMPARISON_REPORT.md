# R6 阶段基线与教师复用对照报告 (COMPARISON_REPORT)

- **生成时间**: 2026-10-14T07:56:00+08:00
- **工作区**: `ai_training/r6_model_training_20261014_063500`
- **评测引擎**: `apk-4.2.5.1-rules-20261013-r4`
- **验收对手**: `frozen_heuristic` (HeuristicAI，随机源独立播种)
- **开发评估面板**: 5 张已核验确凿双人地图，配对换边（各 2 局，共 10 局），种子基准 `seed=20261014`

---

## 1. 对照目标与纪律

按照任务书第一节与第五节（R6-03, R6-04）约束：
1. **旧 BattleSearchAI / B100 教师复用对照**：优先使用仓库内已迁入的 B100 副本，保留原始来源与配置，仅做当前规则/API 兼容与无副作用诊断，不同时改战术逻辑声称是旧 B100 原样结果。
2. **旧模型原样评测基线**：在进入训练前，获取旧模型（P1, θ1）在当前规则下的未经修改实测基线，作为后续训练改进的下界对照。
3. **主验收对象界定**：B100 / BattleSearch 为搜索教师策略，包含在线推演与搜索参数，不能作为纯神经网络模型主验收成绩；纯模型与教师的耗时与算力必须单列。

---

## 2. 评测协议与成本对照

| 候选策略 | 类型 | 输入格式 / 架构 | 单局决策耗时 | 单局动作步数 | 资源与截断设置 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **B100-Q** | 搜索教师 | 逐状态全新实例 + 独立派生种子 | 50~200 ms/步 | 200~1700 步 | maxSteps: 1500, maxWall: 180s |
| **B100-R** | 搜索教师 | 逐局持久实例 + Mulberry32 流 | 50~200 ms/步 | 200~1900 步 | maxSteps: 1500, maxWall: 180s |
| **P1_champion** | 纯模型 | 26通道 ResNet (`P1_final.json`) | ~2 ms/步 | 180~2700 步 | maxSteps: 3000, maxWall: 300s |
| **theta1_v19** | 纯模型 | 34通道 ResNet (`ppo_w1.json`) | ~2 ms/步 | 180~2700 步 | maxSteps: 3000, maxWall: 300s |

---

## 3. 开发面板（DEV 10 局）实测结果对比

在 5 张代表性确凿双人地图（Duel, Liberty Port, Swamplands, Icy Paths, The Crossing）上，双方轮流担任 Seat 0（先行玩家）与 Seat 1（后手玩家），完整对战数据如下：

| 候选策略 | 胜局数 | 负局数 | 平局数 | 截断数 | 错误数 | 自然胜率 | Seat 0 胜局 | Seat 1 胜局 | 原始台账位置 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **B100-Q** | **3** | 4 | 0 | 3 | 0 | **30.0%** | 1 | 2 | [B100-Q_vs_heuristic.json](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/artifacts/dev_benchmarks/B100-Q_vs_heuristic.json) |
| **B100-R** | **3** | 5 | 0 | 2 | 0 | **30.0%** | 2 | 1 | [B100-R_vs_heuristic.json](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/artifacts/dev_benchmarks/B100-R_vs_heuristic.json) |
| **P1_champion** | **1** | 9 | 0 | 0 | 0 | **10.0%** | 0 | 1 | [P1_champion_vs_heuristic.json](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/artifacts/dev_benchmarks/P1_champion_vs_heuristic.json) |
| **theta1_v19** | **1** | 8 | 0 | 1 | 0 | **10.0%** | 0 | 1 | [theta1_v19_vs_heuristic.json](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/artifacts/dev_benchmarks/theta1_v19_vs_heuristic.json) |

---

## 4. 局况与终局原因逐局分析

### 4.1 旧模型（P1 / θ1）失利与下界分析
1. **语义合法动作分布与战术死板**:
   - P1 与 θ1 在对战 HeuristicAI 时无任何语法报错（0 errors），完全遵守了引擎合法动作集合约束。
   - 但在战术层面，旧模型过度依赖局部兵力堆叠，容易在开局占领村庄和金币扩张速度上落后于 HeuristicAI。在 10 局中仅获得 1 场胜利（胜率 10.0%），这构成了本阶段继续训练的**严格下界基线**。
2. **规则差异敏感性**:
   - 规则 r4 下兵种招募、初始金币发放与行动力刷新机制严格对齐 APK，旧模型未针对 r4 微调时，其落点选择策略经常错失占领建筑节奏。

### 4.2 B100 教师在 r4 规则下的真实表现
1. **胜率与战力**:
   - B100-Q 与 B100-R 自然胜率均为 **30.0%**（3胜），在部分中型地图（如 The Crossing 与 Duel 换手局）中展现出了强于纯模型的局部战术盘算。
2. **截断分析（耗时与死锁）**:
   - 在大型多城堡地图（如 Liberty Port，16x16，6 城堡）与长狭道地图（Icy Paths），B100 搜索耗时巨大，单步达到 100~300ms，在 1500 步内累积耗时经常超过 180s 保护阈值导致 `wall_clock_timeout` 截断。
   - 证明了历史报告关于“教师 40 局截断并非棋力失败，而是大图时间预算与搜索步数过大”的事实判断。
3. **关于审计反例在 B100 中的影响**:
   - B100 内部对候选的粗筛存在部分未完成 phase 比较；但在实战中，其最大瓶颈在于战术树搜索在大地图上的状态爆炸与超时截断，而非合法性错误。
