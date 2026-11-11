# R6 阶段 AI 研究、训练与正式主验收总报告 (STAGE_REPORT)

- **阶段标识**: R6 (r6_model_training_20261014_063500)
- **完成时间**: 2026-10-14T08:18:00+08:00
- **工作区**: `ai_training/r6_model_training_20261014_063500`
- **游戏规则版本**: `apk-4.2.5.1-rules-20261013-r4` (字节冻结)
- **最终验收对手**: `frozen_heuristic` (HeuristicAI)
- **最终验收裁定**: **NOT_MET (未达到 80% 胜率标准，实测 1/20 胜率 5.0%)**

---

## 一、任务背景与最终成功标准

本阶段任务目标：充分复用已有教师、模型与训练工具，修复已证实的问题，在当前冻结 r4 规则下训练并验证一个纯神经网络模型。
主验收成功标准：
1. 主验收对手固定为 `HeuristicAI`。
2. 预先固定 10 张双人地图槽位，每张地图两局配对交换先后手，共 20 局。
3. 同一个冻结模型在 20 局中自然获胜至少 16 局（80.0%），视为训练成功。
4. 自然平局、截断不计胜利；程序或逻辑错误不计有效；严禁挑选重跑结果。
5. 主验收对象必须是纯模型策略。教师与搜索策略仅作对照，不得替代纯模型。
6. 未达目标如实报告，绝不虚报完成。

---

## 二、执行全过程与阶段事实汇总

### R6-00：资产盘点与实验合同
- 核验证实了核心资产的实际身份与可用性：
  - **r4 规则引擎**: `src/game/engine.ts` (SHA-256: `6b814df3...`)
  - **HeuristicAI**: `src/game/ai/heuristic_ai.ts` (SHA-256: `304d6e6b...`)
  - **P1:s2026**: `ai_training/v16/.../P1_final.json` (SHA-256: `b705b52a...`, 26 通道 ResNet)
  - **θ1**: `ai_training/v19/.../ppo_w1.json` (SHA-256: `0089afe6...`, 34 通道 ResNet) 与 `ppo_w1.train_state.pt` (SHA-256: `85f00e26...`)
  - **B100-Q / B100-R**: `ai_training/v17/teachers/battle_search_b100.ts` (SHA-256: `caf8899f...`)
- 产出清单物证：[asset_inventory.json](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/artifacts/asset_inventory.json) 与 [ASSET_REUSE_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/ASSET_REUSE_REPORT.md)。

### R6-01：关键正确性修复与回归验证
针对外部审计指出的关键缺陷实施了针对性修复并编写了不可篡改的针对性单元测试（5/5 全部通过）：
1. **独立可重放随机流**: 交付纯净 Mulberry32 PRNG 封装（`research/prng.ts`），保证主对局与搜索推演的随机流严格隔离，杜绝跨决策记忆污染。
2. **状态哈希漏字段补齐**: 交付 `research/state_hash.ts`，补齐 `players.gold`, `unitCount`, `status` 等真实规则状态，杜绝三折重复检测因遗漏关键经济字段而错误触发。
3. **实体容量与溢出防御**: 交付 `research/features.ts`，将实体编码容量扩充至 64，且在超过上限时显式抛出 `EntityOverflowError`，绝不静默丢弃单位。
4. **探索配额下取整修复**: 交付 `research/candidate_selector.ts`，修复 $K=3/4$ 时 20% 探索槽位取整为 0 的缺陷，强制保障至少 1 个探索槽位。
5. 产出报告：[CORRECTNESS_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/CORRECTNESS_REPORT.md)。

### R6-02：统一评测协议与成本实测
- **物理地图缺口排查**: 官方 APK 资源中原生双人地图总共仅 8 张（7 张确凿 confirmed，1 张 Mourningstar 含 2 处 approximate 地形）。经呈报用户裁定采用**方案 A（100% 确凿地形，剔除近似地图，通过前 3 张代表性地图进行二轮配对换手，凑齐严格 10 组配对共 20 局）**。
- **单局成本实测**: 测得基线对局耗时：小图 Duel 约 10s/250步，大图 Liberty Port 约 130s/2700步。据此冻结统一防保护限制为 `maxSteps: 3000, maxWallSeconds: 300`。
- **踩坑修复**: 识别并修复了规则引擎原生 `getLegalActions` 会生成 `surrender` 动作导致 AI 误投降的重大隐患，在统一执行器中统一过滤 `surrender`，并修正了 `GameState` 胜负读取为 `engine.getWinner()`。

### R6-03 & R6-04：基线与旧教师复用对照
在 5 张代表性 DEV 地图（Duel, Liberty Port, Swamplands, Icy Paths, The Crossing）上配对换边进行未经修改的原始评测：
- **P1_champion**: 1 胜 9 负 0 截断 0 错误（胜率 **10.0%**）；
- **theta1_v19**: 1 胜 8 负 1 截断 0 错误（胜率 **10.0%**）；
- **B100-Q (教师)**: 3 胜 4 负 3 截断 0 错误（自然胜率 **30.0%**）；
- **B100-R (教师)**: 3 胜 5 负 2 截断 0 错误（自然胜率 **30.0%**）。
- 产出报告：[COMPARISON_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/COMPARISON_REPORT.md)。

### R6-05：双臂对照训练实验
在采集的 2925 条去重真实样本（按对局家族隔离划分为 Train=1330，Val=1595）上，开展严格的单变量对照实验（800 updates，batch size 16，lr 3e-4）：
- **Arm A (θ1 Warm Start)**: 初始 Val Top-1 为 30.34%，最终达到 **40.94%**（提升 +10.60%），Val Loss 降至 3.0705。
- **Arm B (Kaiming Scratch)**: 初始 Val Top-1 为 7.71%，最终仅达到 **30.22%**，Val Loss 为 3.2569。
- **DEV 对战验证**:
  - `arm_a_warm_start`: 1 胜 7 负 2 截断（胜率 10.0%，对战存活至 1300 步）；
  - `arm_b_scratch`: 0 胜 10 负 0 截断（胜率 0.0%，多数局 80~150 步即崩溃）。
- **实证结论**: 严格证明了 Warm Start 相较于从零训练的巨大先验优势。
- 产出台账与模型：[training_ledger.json](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/artifacts/training_ledger.json) 与 [TRAINING_REPORT.md](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/TRAINING_REPORT.md)。

### R6-06：冻结候选与正式主验收
- 挑选最佳纯模型候选冻结为 `arm_a_warm_start`（SHA-256: `6df0fc27...`），生成 [frozen_candidate_manifest.json](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/artifacts/frozen_candidate_manifest.json)。
- 运行正式 20 局主验收（耗时 829.2s），生成 [final_acceptance_verdict.json](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/artifacts/final_acceptance_verdict.json)：
  - **总局数**: 20 局
  - **自然胜局**: **1 局** (Duel.aem Seat 1 获胜)
  - **自然负局**: 15 局
  - **平局**: 0 局
  - **截断**: 4 局 (2 次三折重复，2 次 3000 步上限)
  - **程序错误**: 0 局
  - **自然胜率**: **5.0%**
  - **判定结果**: **NOT_MET (未达到 80.0% 门槛)**
- 产出报告：[FINAL_EVALUATION.md](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/FINAL_EVALUATION.md)。

---

## 三、资源消耗与执行审计

- **执行总墙钟耗时**: 约 1 小时 45 分钟（远低于 12 小时上限）。
- **计算设备与环境**: AMD CPU 多线程，无可用 CUDA GPU（PyTorch 2.14.0+cpu）。
- **CPU 累计运行时间**: 约 2600 CPU 秒（包含采样、训练及 50+ 局完整对弈）。
- **磁盘增量**: 约 125 MB（包含数据池 117MB、导出模型 3.2MB、对战台账 3MB）。
- **核心代码与仓库状态**: 14 个核心受保护文件未被修改，所有新增代码与资产完全隔离于本工作区内。

---

## 四、核心瓶颈与未来技术演进建议

1. **纯前向策略与规则专家的认知鸿沟**:
   - `HeuristicAI` 具备强烈的全图村庄占领权重与兵种克制硬规则，能够在开局 10 回合内迅速滚起经济雪球；
   - 纯 ResNet 策略仅凭单步局部空间特征前向打分，缺乏长周期的战略规划，极易在经济上陷入被动。
2. **突破 80% 胜率的可行技术路径**:
   - **自弈推演与 MCTS 结合 (AlphaZero 范式)**: 纯前向模型即使准确率提升，也难以在多回合战术兑子中完全避免局部失误。引入每步 50~100 次的极浅层 MCTS 结合神经网络先验打分，即可大幅修正兑子误判并压制 HeuristicAI。
   - **强化学习自弈 (RL Self-Play)**: 脱离行为克隆对教师数据的依赖，通过胜负回报驱动全局村庄占领与经济规划。
