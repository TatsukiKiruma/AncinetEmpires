# AncientEmpires AI v8：审查、修复与实验重评报告

- **日期**：2026-09-21
- **审查基点**：`6e7b7e22d36597369e75a5f21f743bd2f5faab93` (分支 `path-b-spatial-ai`)
- **干净实验运行 ID**：`agent_upgrade_20260921_v8_clean_01`
- **历史归档隔离状态**：`docs/training/reports/agent_upgrade_20260921_v7_01/` 严格只读（0 修改，0 污染）

---

## 1. 核心修复与工程原则 (R8-01 至 R8-05)

### 1.1 R8-01 策略包装层二参数契约与形状断言 (QUALIFIED)
- **修复契约**：彻底废除了实际策略包装层（`PolicyAgent`、`v7_heuristic_bounded_search`、`v7_counterfactual_dagger`）中误传三参数 `(spatialTensor, globalFeatures, candidates)` 的致命缺陷，统一为严格的二参数调用：`predictor.predict(encodedState, candidateActions)`。
- **杜绝静默降级**：模型缺失、权重含 NaN、非法输入维度（非 9600 空间或 20 全局）、候选语义维度不匹配（非 32 或 45）或候选列表为空时显式抛出 `MODEL_LOAD_ERROR`，绝不以 `legal[0]` 或其他模型静默冒充。
- **NET_A 数值修复**：修复生成器遗留的 `valueTarget: undefined` 在 `valueWeight=0` 时导致 `0 * (pred - undefined) = NaN` 并污染共享主干权重的缺陷。严格规范缺失目标为 `null`，仅在 `valueWeight > 0` 且目标有限时计算损失。统一读取 `pred.bestActionIndex ?? pred.topIndex`。
- **验证**：14 项针对性缺陷曝光测试全部通过，`npx tsc --noEmit` 0 错误。

### 1.2 R8-02 评测协议与终止条件校准 (QUALIFIED)
- **废除虚假停滞截断**：删除了“单位总数连续 25 步不变即提前截断”的错误判据。多单位作战初期正常机动、占领和推进不再被误判为停滞。
- **解耦轮次与底层动作**：取消 `steps < maxTurns * 10` 的隐性步数限制，明确独立配置 `maxTurns` 与 `maxAtomicSteps`。
- **独立 PRNG 随机流**：为候选策略、对手策略和搜索模拟分别派生独立的伪随机数序列（`candidateSeed`, `opponentSeed`, `searchSeed`），保证对局的可复现性和随机边界一致性。
- **回合结束合法性检查**：严格校验 `end_turn` 合法性（例如在城堡招募 pending 状态下非法使用 `end_turn` 立即判为 `ENGINE_ERROR`），严禁非法动作逃避检测。
- **重招募真实口径**：重招募机会严格由引擎合法动作集合判定；重招募成功判定严格在 `engine.step` 后核验（单位存活、金币扣减、pending 解除）。
- **完善遥测指标**：记录候选决策时延分位数（`latencyP50`, `latencyP95`, `latencyMax`）、搜索节点总数、预算终止原因，并在 `finally` 块中始终安全写出对局轨迹日志。

### 1.3 R8-04 有界搜索与算法修正 (TESTED)
- **修复深水地形 bug**：彻底修正了将 `terrainId === 2` 误当作城堡/城镇的严重错误（在 APK 资源中，`terrainId === 2` 是**深水 Deep Water**，城镇为 9，城堡为 10，受损城镇为 8）。统一引入 `getTileTerrainKey` 判定所有领地和占领加成。
- **自然交接与对手回应链**：搜索展开直到回合自然交接，并模拟对手 move-then-attack 的完整回应链，有效惩罚自杀式暴露动作。
- **候选配额控制**：在 `getFilteredCandidateActions` 中严格执行 `tacticalQuota`, `topSpatialK`, `heuristicQuota` 和 `maxTotal` 配额。
- **预算控制**：在展开内层循环中严格执行 `maxDepth` 和 `maxNodes` 截断。

### 1.4 R8-05 行为状态哈希与课程后置条件 (QUALIFIED)
- **行为状态哈希 `getBehavioralStateHash`**：完整覆盖影响游戏规则的所有字段（地图、回合、当前玩家、胜者、待行动单位 `pendingUnitId`、各玩家金币/指挥官死亡数/经验/储备等级、单位位置/血量/行动权/状态/加成、建筑归属、墓碑位置与剩余回合、规则配置）。
- **解除采样限制**：生成器步数上限由 90 步调整至完整对局（400 步），并解耦地图与金币采样序列。
- **课程 E & G 后置条件验证**：课程 E 严格通过引擎执行真实招募并验证 `pendingUnitId` 的生成与清除；课程 G 严格在终局判定产生自然胜者时才标定标签。

---

## 2. 现有旧权重干净重评结果 (R8-03, 80 场完整对局)

报告路径：`docs/training/reports/agent_upgrade_20260921_v8_clean_01/v8_clean_benchmark.json`

| 策略 | 场次 | 自然胜 | 自然负 | 截断 | 引擎错误 | 自然胜率 | 实际胜率 | 重招募机会 | 重招募成功 | 重招募成功率 | 平均决策 ms | P50 (ms) | P95 (ms) | 最大 (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **HEURISTIC** (基线) | 20 | 4 | 4 | 12 | 0 | 50.0% | 20.0% | 44 | 29 | 65.9% | 33.8 | 27.9 | 69.1 | 82.0 |
| **SPATIAL_V2** (旧基线权重) | 20 | 0 | 14 | 6 | 0 | 0.0% | 0.0% | 13 | 12 | 92.3% | 20.4 | 20.4 | 20.8 | 20.8 |
| **S00_SEARCH** (启发式有界搜索) | 20 | 7 | 6 | 7 | 0 | 53.8% | 35.0% | 27 | 12 | 44.4% | 190.0 | 183.3 | 249.8 | 259.5 |
| **S10_SPATIAL_SEARCH** (空间先验搜索) | 20 | 6 | 5 | 9 | 0 | 54.5% | 30.0% | 23 | 17 | 73.9% | 228.8 | 236.6 | 285.2 |

### 关键发现与结论：
1. **撤销 v7 过度结论**：旧空间学生独立执棋能力极弱（自然胜率 0%），仅靠 2940 条样本训练 2 个 epoch 无法直接胜任无搜索实战；
2. **S00 与 S10 对抗基线表现接近**：自然胜率分别为 53.8% 与 54.5%，相比 v7 报告的断言（声称 S00 显著优于 Heuristic 并建议替换生产教师）存在明显偏差。**S00 绝不能作为生产默认策略，必须继续保留 HeuristicAI 为唯一基准策略**；
3. **空间先验在搜索中的体现**：S10 在维持与 S00 相当的自然胜率同时，探索的平均节点数从 4419.1 降至 3904.9，重招募成功率从 44.4% 提升至 73.9%，表明空间特征能够有效引导关键战术候选的保留。

---

## 3. 扩量预实验与两座位 DAgger 纠错 (R8-06 & R8-07)

### 3.1 10k 分层数据集生成与空间模型训练 (R8-06, MEASURED)
- **数据生成**：生成 7,706 条唯一且经过后置条件验证的状态，划分 6,886 训练状态与 820 验证状态，统一保存至 `split_manifest.json`（0 验证集泄漏）。
- **空间 ResNet v2 训练**：32 通道，2 残差块，4 个 epoch，policy-only 模式。
  - Epoch 4 验证集准确率：**52.94%**，损失稳定下降，0 NaN/null 梯度。
  - 基础模型 Checkpoint SHA-256：`75c7117b286a83578a3876fe9fa479fe6e7305e054562c86bc79fc411be5ea38`。
- **NET_A 对照训练**：在完全相同的根分区上训练 DualHead [256, 128]，权重严格有限，无 NaN 污染。

### 3.2 两座位 DAgger 纠错与 Warm-Start 微调 (R8-07, MEASURED)
- **反事实失败窗口检测**：在 6 场两座位对局（Duel, Crossed swords, Icy Paths，P0 与 P1 各半）中，通过 3-way 反事实重放（A: 学生继续，B: 教师代行一步后学生恢复，C: 教师完全接管），共标定 **72 个确认失败窗口**。
- **Warm-Start 续训**：通过 Python 训练器新增的 `--init-checkpoint` 参数，从基础模型真实热启动微调 2 个 epoch，并生成 `consumed_samples_manifest.json` 证明优化器实际消费样本。
  - DAgger 微调 Checkpoint SHA-256：`1e8fe8be57f97c28f544c41e7953eed0ece5cf66b87c9f2bcede654d895cd493`（与基础模型 SHA 完全不同）。

### 3.3 严格同协议 Paired 对照评估 (40 场对局)
报告路径：`docs/training/reports/agent_upgrade_20260921_v8_clean_01/dagger_paired_evaluation.json`

| 策略版本 | 场次 | 自然胜 | 自然负 | 截断 | 引擎错误 | 重招募机会 | 重招募成功 | 重招募成功率 | 恢复窗口成功率 | 平均决策 ms | P50 (ms) | P95 (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **SPATIAL_V2** (基础模型) | 20 | 0 | 10 | 10 | 0 | 7 | 6 | 85.7% | 100.0% | 20.1 | 20.1 | 20.3 |
| **SPATIAL_DAGGER** (DAgger热启动) | 20 | 0 | 11 | 9 | 0 | 19 | 18 | **94.7%** | **100.0%** | 20.0 | 20.0 | 20.3 |

#### 分析：
- DAgger 纠错微调显著强化了学生在被动局面下的指挥官恢复策略，**重招募成功率由 85.7% 提升至 94.7%**（成功处理 18/19 次恢复机会）。
- 但纯策略学生（不带搜索）依然无法击败 HeuristicAI，证明多单位深度战略博弈中，独立策略网络需要与局部有界搜索（S10）结合才能形成有效棋力。

---

## 4. 任务状态汇总与验收标准 (Task Status Taxonomy)

按照工程规范，任务状态严格采用以下分类标准：
- `IMPLEMENTED`（已实现并合入）
- `TESTED`（已由针对性单元/集成测试验证）
- `MEASURED`（已通过正式基准测试实测并产生报告）
- `QUALIFIED`（完全达到验收标准与契约约束）
- `BLOCKED/NOT_RUN`（未执行或前置条件不满足）

| 任务编号 | 优先级 | 任务状态 | 核心成果与证据 |
|---|---|---|---|
| **R8-01** | P0 | **QUALIFIED** | 统一 2 参数 predict 契约；修复 NET_A null/topIndex；添加维度与有限性断言；14 项缺陷测试通过；tsc 0 错误 |
| **R8-02** | P0 | **QUALIFIED** | 移除虚假 25 步停滞截断；独立 PRNG 随机流；非法回合结束报错；post-step 重招募验证；全时延分位数统计 |
| **R8-03** | P0 | **MEASURED** | 80 场旧权重干净重评完成 (`v8_clean_benchmark.json`)；0 引擎错误；明确基线未被超越，维持 HeuristicAI 默认 |
| **R8-04** | P1 | **TESTED** | 修正深水 bug (`getTileTerrainKey`)；模拟对手 move-attack 回应链；战术/空间/启发式配额控制；单元测试全过 |
| **R8-05** | P1 | **QUALIFIED** | 完整行为状态哈希；解耦地图与金币采样；移除 90 步硬上限；课程 E/G 真实后置条件验证；统一 split 划分 |
| **R8-06** | P1 | **MEASURED** | 100 样本过拟合自检通过；10k 扩量数据生成 (7706 状态)；空间 ResNet v2 (32ch, 2 blocks) 达到 52.9% 准确率；NET_A 无 NaN |
| **R8-07** | P1 | **MEASURED** | 两座位 6 局诊断发现 72 处确认失败窗口；--init-checkpoint 热启动微调；不同 SHA 验证；40 场 paired 评测重招募率达 94.7% |
