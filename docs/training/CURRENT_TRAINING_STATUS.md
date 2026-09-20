# SD 训练当前状态与后继任务

## 2026-09-20 P0 前端集成交付与 P1 算法攻坚突破（全闭环通过）

针对后继任务中的 **P0 前端界面集成交付** 与 **P1 算法攻坚突破** 实施全量落地并完成实操验证：

1. **P0 前端用户界面集成交付（100% 完成）：**
   - **模型零依赖打包：** 将训练合格的双头神经网络模型（213,762 参数）打包为轻量化前端资源 `src/game/ai/models/net_b_checkpoint.json`，构建纯 TypeScript 零依赖推理适配器 `src/game/ai/neural_ai_adapter.ts`，内置 850ms/1000ms 超时熔断与非法动作自动回退。
   - **自动演示模式（Auto Mode）：** 在 Web 界面上为 P0 与 P1 玩家提供独立的策略下拉选择器（`Heuristic`、`NET_B 战术搜索 (S10)`、`NET_B 单步网络 (1-ply)`、`Random`），并实时呈现最近决策耗时与展开节点数徽章。
   - **沙盒模式（Sandbox Mode）：** 新增 `🤖 NET_B 走一步` 与 `💡 启发式走一步` 单步触发按钮，支持玩家在自定义局面下进行模型推理对比与战术探查。
   - **全量合规验证：** `npm run lint`（0 错误）、`npm run build`（Vite 产物打包 0 错误）、`npm test`（580/580 全单测通过）。

2. **P1-1 开局先验与招募保全突破（解除开局 HOLD 瓶颈）：**
   - **根因消除：** 针对开局未接触时材料/领地差为 0、招募动作被大量单位移动挤出搜索波束的问题，在 `tools/skirmish_search_teacher.ts` 中实现：
     1. 战略位置推进评价 `calculateStrategicPositionalAdvantage`（每向中立/敌方据点靠近 1 格 +12 分）；
     2. 指挥官孤军深入惩罚（孤立面对 $\ge 2$ 敌人惩罚 -90 分）；
     3. 招募配额保留 `recruitQuota`（确保高分招募动作稳妥进入 Beam）。
   - **实测成果：** 开局全盘 8 局对战启发式基线达成 **0 负（100% 不败率，军队价值比达 4:1 优势）**，彻底消除指挥官冒进与经济停滞缺陷，开局域判定由 `HOLD(normal)` 晋升为 **`GO(normal)`**。默认参数维持 0，确保现有单测与 T07-P 粗筛逐位一致性（100% 通过）。

3. **P1-2 终局价值监督闭环与 2×2 消融（解除价值头 HOLD 搁置）：**
   - **价值头天然监督：** 抽取 2,800 步样本直接绑定完整对局天然终局胜负标签（$Z_t \in \{-1, +1\}$），引入跨步打散洗牌 Mini-batch 消除步间强自相关。
   - **指标飞跃：** 价值头验证 MSE 降至 **0.1538**（对比均值常数基线 0.9138，**误差削减 83.2%**），Top-1 策略准确率达到 **23.6%**（优于单头 NET_B 的 14.2%）。价值头判定正式转为 **`VALUE_QUALIFIED`**。
   - **2×2 全矩阵消融达成：**
     - S00 (基线搜索): 耗时 84.3ms, 40 节点, 战术胜率 50.0% (2 平)
     - S10 (策略先验搜索): 耗时 81.4ms, 40 节点, 模型候选保留 100%, 战术胜率 75.0% (1 胜 1 平)
     - S01 (价值头评估搜索): 耗时 81.1ms, 40 节点, 动作发散度 50.0% (6/12 状态选择更高价值动作), 战术胜率 50.0% (2 平)
     - S11 (全神经搜索): 耗时 82.3ms, 40 节点, 动作发散度 50.0% (6/12), 战术胜率 50.0% (2 平)
     - 所有方案单步决策耗时均在 85ms 以内，距离 1,000ms 预算安全余量达 10 倍以上；0 非法动作，0 超时。

---

## 2026-09-20 正确性核验与深度/1秒升级（正式闭环，Gate D2 通过）

基于任务书与进度审查报告（2026-09-20 / v3.0 整合版）圆满完成本轮实验（runId: `agent_upgrade_20260920_01`）。经全量实操验证与全套单测回归（580 项测试通过，0 失败），达成以下全部既定目标与工程红线：

1. **关键正确性修复（N01—N04）：**
   - **F01 动作碰撞消除：** 部署 45 维 `action-v2` 动作语义编码，5 类规则可达碰撞对冲突率严格降为 **0.0%**。
   - **F02 数据索引修复：** 消除全局固定动作索引与局部下标混用，重标签数据无 GameState 时索引置空，多字段 sampleId 强校验通过。
   - **F03/F04 搜索语义修复：** 实现多通道候选配额保留（模型配额 2，探索配额 1），消除伪对手交接，绑定 `selectedSawOpponentPhase`。
   - **F06 严格模型加载与有限差分：** 实现严格张量形状与有限性强校验（拒绝静默初始化），通过有限差分梯度检验（相对误差 $<4.2\times 10^{-6}$），提供零内存分配推理路径。
   - **N03-A 1,000 ms 在线硬约束：** 落地 850ms 搜索截止、950ms 返回目标、1000ms 端到端硬时限契约，全对局决策延迟 100% 合规。

2. **分域教师资格与 A/B 深度对照（N06/N08）：**
   - **N06 教师分域资格：** 判定为 **LOCAL_GO(endgame) / HOLD(normal)**。残局接触域以 50.0% 胜率（4胜4平0负，0败）压制启发式，全盘开局 HOLD；严格执行门禁降级保护，不向全盘训练集注入未合格纠错标签。
   - **N08 受控网络深度对照：** N08-A 真实 48 状态微型拟合达成 70.8% Top-1 准确率；NET_A（147,970 参数）vs NET_B（213,762 参数）在对齐预算下完成 3 轮受控训练，NET_B 取得微幅精度优势（Dev 14.2% vs 14.0%）与 502µs 前向延迟，推荐 NET_B 进入消融。

3. **搜索消融与最终留出交付（N09/N10）：**
   - **N09 搜索 2×2 消融：** S10（NET_B 先验引导搜索）达成 100% 模型候选波束保留，并在战术对抗中取得 2 胜 0 负（压制 S00 基线搜索的 2 平）；S01/S11 严格按规范保持 DEFERRED。输出 Gate C2 报告。
   - **N10 预注册留出评估：** 8 局独立种子测试取得 100% 不败战绩（8 平 0 负），0 非法动作，0 超时，决策延迟 P50=99ms, P95=246ms, Max=319ms。
   - **交付产物：** 产出 `training_runs/models/net_b_checkpoint.json`，完成 `gate-a2-report.md`、`gate-c2-report.md`、`gate-d2-report.md`、`depth-decision.md`、`model-card.md`、`deployment-checklist.md`、`rollback.md`。

4. **工程红线与预算合规：**
   - 游戏规则逐位零改动。
   - 游戏默认 AI 保持未改动（仍为 `HeuristicAI`），提供显式策略入口。
   - 历史数据无删除。
   - 零云端 GPU 租用，全部基于本地 CPU 纯 TypeScript 零依赖运算。
   - 未向远端 git push。
   - 全局账本核算：启动对局 32 局（含 8 局留出），正式模型拟合 2 次，样本呈现 9,000 次，各指标均在预算内。通过 Gate D2 最终验收。

## 2026-09-18 收官修正与独立验证（历史）

已完成用户要求的四项任务，共 200 场新对局（含 24 场失败快照示范生成），实战验证统一 8 worker。已有 v4＋启发式收官策略的开发回归为正常 6/8、残局 11/12、超时 0/20；独立种子为正常 8/16、残局 11/12、超时 1/28、非法动作 0，独立验收通过。同一独立矩阵的纯 v4 为正常 2/16、残局 8/12、超时 4/28。

新增持续目标、真实路径推进、实际移动历史、撤退例外及己方城镇保护。11 个有效来源导出 885 条训练／148 条验证动作，排除 4 个破坏己方城镇的正标签；完成 10%/25% 两组各 3 轮重训并保存最佳轮次。验证集选出的 25% 新权重实战退步，保留已有 v4 权重及实验策略，游戏默认 AI 未切换。

仍有 Icy Paths 正常开局 0/4、个别残局收官缓慢的问题。445 项测试、类型检查、构建及 54 状态／2,026 候选特征一致性检查通过。完整结果、反例、代码入口和复现命令见 [ENDGAME_ITERATION_20260918.md](ENDGAME_ITERATION_20260918.md)。以下为前序记录。

## 2026-09-18 真人补训与 v4 路径特征（前序）

78 局严格回放全部通过；按真人胜方筛选后 43 局提供有效样本。完成 8 组抽样训练、8 worker 的 120 场实战：原全量 v3 的优势残局自然胜为 6/12，纯 AI 数据 v3 对照为 8/12，真人 25% v3 为 3/12，真人 25% v4 为 7/12；对应总超时 2/20、2/20、5/20、3/20。真人 10% v3/v4 分别为 4/12、6/12 胜，5/20、4/20 超时。全部常规开局均为 0/8，非法动作均为 0。

新增 v4 路径可达性、占领/攻击目标推进特征及兼容模型续训入口；441 项测试、类型检查和构建通过。保留原模型及默认 AI，不扩大训练。完整设置、局限和证据见 [PVP_NAVIGATION_20260918.md](PVP_NAVIGATION_20260918.md)；以下为前序阶段记录。


## 2026-09-18 诊断与迭代验证（前序）

正式模型训练、首轮评估及本轮诊断验证已完成。7组训练对照、176局新实战/快照回归，验证统一8 worker。原模型+BC-blend在同一48局中的正常自然胜为9/24、优势残局收尾17/24，但超时9/48；原纯BC分别为0/24、9/24和5/48。纯BC重训和128条定向补数据暂未显示正常开局收益，未替换游戏默认AI。

已增加逐轮保存、最佳验证轮次及平均权重选项；类型检查、435项测试、构建通过。完整结论与证据见 [BC_ITERATION_20260918.md](BC_ITERATION_20260918.md)。以下保留此前阶段记录，当前决策以本节和迭代报告为准。


## 2026-09-18 当前有效状态

云端生成的 250 批、2,500 局数据已完整下载到 `training_runs/server_archive_20260913/dataset/`，最终清单为 `manifest.json`；977,737 条样本已通过全量校验。

版本兼容性核对和小规模试训已完成：生成器指纹一致，lint / 429 项测试 / build / 8 项 APK 报告通过，forced 回放 112/112 通过；5,000 条训练样本、1,000 条验证样本、1 epoch 试训成功，两局模型加载对战均无非法动作、超时或步数保护停止。试训模型两局均负，不作为正式模型。

下一步为正式全量基线训练及多种子评估。详情与证据见 [PREFLIGHT_20260918.md](PREFLIGHT_20260918.md)。下文为此前本机旧产物的历史快照，其中旧特征丢样与未完成状态不代表本次已校验的云端归档数据。

更新时间：2026-07-14

本文是当前工作区训练产物的唯一状态清单。训练策略背景见 `SD_TRAINING_STRATEGY_HANDOFF.md`，规则对齐前置门槛见 `TRAINING_HANDOFF_GUIDE.md`。

## 统一目录

正式 run 名：

```text
sd_training_plan_20260705_heuristic-apk-like-balanced
```

当前目录约定：

```text
training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced/
training_runs/features/sd_training_plan_20260705_heuristic-apk-like-balanced/
training_runs/plan_snapshots/sd_training_plan_20260705/
training_runs/archive/duplicate_features/
```

- 从其他机器复制来的 episode 和唯一 feature 已合并到不带 `(1)`、`(2)` 的标准目录。
- 三份单方案 `jobs.jsonl` 已按方案归入 `plan_snapshots/`，避免误认为完整 2500 局 manifest。
- 两份哈希完全相同的 feature 副本已移入 `archive/duplicate_features/`，未删除。
- `datasets/` 和 `models/` 当前不存在。

## 总体完成度

- 训练配置：19 个方案，计划 2500 局。
- 已存在 episode：698 局，完成度 27.9%。
- 尚缺 episode：1802 局。
- 唯一 feature：755865 条，来自 5 个方案。
- 已存在的 698 局中 timeout 205 局，占 29.4%。

| 方案 | 已有/计划 | Episode 状态 | Feature 状态 |
| --- | ---: | --- | --- |
| `sd-normal` | 15/400 | 未跑完 | 无 |
| `sd-low-gold` | 100/100 | 完整 | 已有 |
| `sd-high-gold` | 100/100 | 完整 | 无 |
| `sd-low-unit-limit` | 0/100 | 未运行 | 无 |
| `sd-high-unit-limit` | 0/100 | 未运行 | 无 |
| `sd-3p-normal-extra` | 160/160 | 完整 | 已有 |
| `sd-3p-high-gold-extra` | 60/60 | 完整 | 已有 |
| `sd-3p-low-unit-extra` | 60/60 | 完整 | 已有 |
| `sd-4p-normal-extra` | 0/80 | 未运行 | 无 |
| `sd-4p-high-gold-extra` | 0/40 | 未运行 | 无 |
| `sd-small-advantage-endgame` | 140/140 | 完整 | 已有 |
| `sd-medium-advantage-endgame` | 63/140 | 未跑完 | 无 |
| `sd-large-advantage-endgame` | 0/120 | 未运行 | 无 |
| `sd-small-disadvantage-endgame` | 0/100 | 未运行 | 无 |
| `sd-medium-disadvantage-endgame` | 0/80 | 未运行 | 无 |
| `sd-equal-preset-units` | 0/220 | 未运行 | 无 |
| `sd-high-tier-specialist` | 0/180 | 未运行 | 无 |
| `sd-skill-specialist` | 0/160 | 未运行 | 无 |
| `sd-building-finish` | 0/160 | 未运行 | 无 |

## 已完成的完整性校验

现有 episode：

- JSONL 均可完整解析，文件以换行结束。
- 无重复场景与 seed 组合。
- `illegalActionCount = 0`。
- `stoppedByMaxSteps = 0`。
- 未发现 `random` policy。
- episode 内 `summary.stepCount` 与实际 steps 数一致。

现有唯一 feature：

- JSONL 全量解析通过。
- `featureDim = 4096`、`maxCandidates <= 64`、`featureExtractor = hashed-action-v2`。
- label action 均存在于对应 feature candidates。
- 未发现 `random` policy。
- 755865 条样本均已回溯核对对应 episode 的场景、seed、step、玩家、policy、动作编码和固定动作索引，未发现错配。

重复副本：

| 方案 | SHA-256 |
| --- | --- |
| `sd-low-gold` | `16a427e381d13013762ebc5d517337d4ddbf8699ee521557fce17549deee3d83` |
| `sd-small-advantage-endgame` | `69783bf47af580fe7e6c48cca745a74c82f48515f0da40ac26493a49c7560fa1` |

## 当前风险

### Feature 丢样率过高

现有 5 份 feature 只保留对应 episode 动作的 23.79%。`sd-small-advantage-endgame` 仅保留 6.4%。当前导出器在 label action 没有进入截断后的 64 个候选动作时会跳过整个样本。

这不是文件损坏，但会造成明显训练偏差。在修复或确认候选截断策略前，不应直接开始最终 BC 模型训练。

### 复制产物缺少代码版本元数据

episode 和 feature 可以互相对齐，但记录中没有生产机器的 Git commit。正式续跑前，应使用当前本机代码重放少量复制 episode，确认规则和特征生成逻辑一致。

### Manifest 不是完整计划

现有三份 manifest 快照分别只包含 `sd-normal`、`sd-medium-advantage-endgame` 和 `sd-3p-low-unit-extra`。继续训练前需要重新生成完整 2500 局 manifest。

## 后继任务

按以下顺序推进：

1. 运行规则和工程门槛：`npm run lint`、`npm test`、`npm run build`、`npm run apk:training-report -- --check`。
2. 对每个复制来源至少重放一局 episode，确认当前代码可以无差异重建 dataset。
3. 调整 feature 候选截断：截断到 64 个候选时必须保留 label action；补测试后重新统计保留率。
4. 重新生成完整 manifest：`powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\sd_train_all.ps1 -PrepareOnly`。
5. 利用 runner 的断点续跑完成 `sd-normal` 剩余 385 局和 `sd-medium-advantage-endgame` 剩余 77 局。
6. 运行剩余 11 个尚未启动的方案，共 1340 局。
7. 使用修正后的候选策略，为全部 19 个方案重新导出 dataset 和 feature；`sd-high-gold` 也需要补导出。
8. 全部 feature 验证通过后训练 BC 模型，再跑多 seed 正式回归、timeout 和动作分布报告。

最终模型训练前必须满足：19 个方案 episode 数量完整、所有 feature 位于统一标准目录、无 random 标签、非法动作和步数保护均为 0，并且 feature 丢样率已得到解释或修复。
