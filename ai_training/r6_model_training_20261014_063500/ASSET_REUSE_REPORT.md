# R6 关键资产复用与可用性核验证明 (ASSET_REUSE_REPORT.md)

- **执行日期**：2026-10-14
- **工作区路径**：`C:\code\AncinetEmpires\ai_training\r6_model_training_20261014_063500`
- **核验准则**：查明真实文件、计算 SHA-256、验证 schema 结构、不凭空宣告可用或缺失。

---

## 1. 资产盘点总表

| 资产名称 | 真实路径 | 文件大小 (Bytes) | 真实 SHA-256 | 状态 | 结构/属性说明 |
| :--- | :--- | :---: | :--- | :---: | :--- |
| **B100 搜索源码** | `ai_training/v17/teachers/battle_search_b100.ts` | 50,967 | `caf8899fbdfa4b48ddf67d9f646cdbf5647d615b7302b7d83fdb9760602535a6` | **Available** | 代码与搜索参数策略，无神经权重 |
| **B100 策略封装** | `ai_training/v17/teachers/b100_policy.ts` | 16,985 | `8ad633dea7abedf36d03dda649a0072b9ad8ff60f4b2c32b94d7e5dc474ba889` | **Available** | 提供 B100-Q 与 B100-R 两种接口实现 |
| **P1 权重** | `ai_training/v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json` | 338,812 | `b705b52a25a8954c3c71417997f552db1a0faa792269f667db76e83236e06899` | **Available** | `spatial_resnet_32ch_2res`, 26 空间通道, 53 动作语义 |
| **θ1 权重 (JSON)** | `ai_training/v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json` | 1,631,903 | `0089afe67e14462819bcc80601180e690327c40400b1aa9bd0bad03f19a30b47` | **Available** | `spatial_resnet_32ch_2res`, 34 空间通道, 53 动作语义 |
| **θ1 PyTorch 状态** | `ai_training/v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.train_state.pt` | 710,381 | `85f00e26be4e1ddfe814db93af9fbbe3703b77cbe3e03f44f05da8ba53066f36` | **Available** | 包含模型权重与优化器状态 |
| **Teacher v2** | `ai_training/r5_eval_teacher_v2_20261014_023500/research/search_teacher_v2.ts` | 14,119 | `c4dd96dba5651a437dab0c7043f725b707c13a1b6a6042f0177d4c18c964181d` | **Available** | 统一行动相位前向推演教师 |
| **HeuristicAI** | `src/game/ai/heuristic_ai.ts` | 35,622 | `304d6e6b67d60d4363c02e377630c16eaa36d28d2b2bcf387193e60db39eb94e` | **Available** | 权威基线，主验收目标对手 |

---

## 2. 关键资产的技术适配分析

### 2.1 B100 教师 (B100-Q / B100-R)
1. **本质属性**：B100 是 TypeScript 代码驱动的有限展开搜索策略（包含战术动作筛选、pending 优先、指挥官让城、残局推演等规则），没有可直接加载进神经网络的权重。
2. **两类随机流合同**：
   - `B100-R`：逐局持久 PRNG，模拟人类连续对局决策流；
   - `B100-Q`：基于输入状态特征 key 确定性重设随机种子，保证同状态查询的 100% 确定性。
3. **r4 适配要点**：
   - 调用当前 r4 权威引擎（`src/game/engine.ts`）；
   - 确保 `clone()` 及恢复时绝不重复发放首次收入（`applyInitialTurnStart: false`）；
   - 过滤非法动作，异常捕获不污染外部对战状态。

### 2.2 旧模型 P1 (`P1:s2026`)
1. **模型结构**：
   - 网络架构：`spatial_resnet_32ch_2res`（2 层残差块，32 卷积通道）；
   - 空间通道数：26；
   - 全局特征：20；
   - 动作语义：53 维；
   - 架构契约：`spatial26_global20_actionSemantics53_v15`。
2. **适配方案**：
   - 主项目中 `src/game/ai/spatial_conv_net.ts` 的 `loadSpatialResNetFromJson` 已经原生完整支持 `v15` schema，可直接从当前 r4 游戏状态提取 26 通道特征进行纯模型推理。

### 2.3 旧模型 θ1 (`ppo_w1`)
1. **模型结构**：
   - 网络架构：`spatial_resnet_32ch_2res`；
   - 空间通道数：34（在 P1 的 26 通道基础上扩展了 8 个物理防御、魔法防御、兵种身份、下一轮威胁等关键特征）；
   - 全局特征：20；
   - 动作语义：53 维；
   - 架构契约：`spatial34_global20_actionSemantics53_v19`。
2. **适配方案**：
   - 既支持在 TypeScript 端使用 `spatial_conv_net.ts`（结合 `spatial_tensor_encoder.ts` 的 34 通道编码器）执行纯模型直接决策，又具备完整的 PyTorch `.pt` 权重文件，可无缝用于 Python 端的继续训练（Warm Start / Fine-tuning）。
