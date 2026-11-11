# R6 阶段正式主验收报告 (FINAL_EVALUATION)

- **生成时间**: 2026-10-14T08:18:00+08:00
- **工作区**: `ai_training/r6_model_training_20261014_063500`
- **评测引擎**: `apk-4.2.5.1-rules-20261013-r4`
- **对手策略**: 固定版本 `frozen_heuristic` (HeuristicAI)
- **正式裁定文件**: [final_acceptance_verdict.json](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/artifacts/final_acceptance_verdict.json) (SHA-256: `87135e097c4288a33c9e1d3dcd0ea3b80a9975f13108ce4b522c0793fd2d306d`)
- **冻结清单**: [frozen_candidate_manifest.json](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/artifacts/frozen_candidate_manifest.json) (SHA-256: `1c17238e49a5e0f964ef1417987be6681394beeb2ee640a6198df39636f7a954`)

---

## 1. 最终主验收合同与门槛

根据用户核心指令与裁定（方案 A）：
1. **主验收对手**: 仅使用固定版本的 `HeuristicAI`。
2. **测试面板**: 预先固定 10 组确凿双人地图槽位（共 20 局，配对交换先后手），种子基准 `baseSeed=20261014`。绝不纳入任何含近似地块的地图。
3. **合格判定标准**:
   - 同一个冻结纯模型在 20 局中自然获胜 $\ge 16$ 局（80.0%），视为本阶段成功；
   - 自然平局、超时截断、步数截断均不计胜利；
   - 存在规则或推理错误时不能宣称验收有效；
   - 主验收对象仅限纯神经网络模型策略；搜索教师（B100）作为基线对照另列，不得替代纯模型成绩；
   - 未达到目标时如实报告实际局数与胜率，不通过重跑、挑选结果或修改标准掩盖。

---

## 2. 冻结候选策略身份

- **候选策略 ID**: `arm_a_warm_start`
- **模型格式**: TypeScript / 前端权威引擎兼容的 SpatialResNet JSON
- **权重文件路径**: [arm_a_warm_start.json](file:///C:/code/AncinetEmpires/ai_training/r6_model_training_20261014_063500/artifacts/models/arm_a_warm_start.json)
- **权重文件 SHA-256**: `6df0fc279348df4f0ab1b27d4d55bcdbdb1261f45b5583a8c38e0b92a3ecda6f`
- **网络规格**: `spatial-resnet-v2`, 34 通道空间张量, 32 通道主干残差网络（2 个 ResBlock）, 全局特征 20 维, 动作语义 53 维, Policy Dense 拼接维度 169。
- **选择理由**: 在 R6-05 单变量双臂实验中，Arm A 验证集泛化 Top-1 达到 **40.94%**，在 DEV 面板中对战韧性明显超越从零训练的 Arm B（Arm B 胜率为 0%，Arm A 具备 10% 胜率且单局存活至 1300 步）。

---

## 3. 正式主验收 20 局逐局对战明细

| 局号 | 地图名称 | 模型执手 | 对手执手 | 步数 | 耗时 (s) | 获胜方 | 终局状态 | 结果判定 |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **0** | (2) Duel.aem | 先手 (Seat0) | 后手 (Seat1) | 542 | 13.6 | Player 1 (Heuristic) | 自然终局 | 负 |
| **1** | (2) Duel.aem | 后手 (Seat1) | 先手 (Seat0) | 210 | 4.8 | **Player 1 (Model)** | 自然终局 | **胜** |
| **2** | (2) Liberty Port.aem | 先手 (Seat0) | 后手 (Seat1) | 1300 | 47.9 | 无 | 三折重复局面截断 | 截断 |
| **3** | (2) Liberty Port.aem | 后手 (Seat1) | 先手 (Seat0) | 1060 | 35.4 | Player 0 (Heuristic) | 自然终局 | 负 |
| **4** | (2) Swamplands.aem | 先手 (Seat0) | 后手 (Seat1) | 251 | 5.8 | 无 | 三折重复局面截断 | 截断 |
| **5** | (2) Swamplands.aem | 后手 (Seat1) | 先手 (Seat0) | 73 | 1.1 | Player 0 (Heuristic) | 自然终局 | 负 |
| **6** | (2) The Crossing.aem | 先手 (Seat0) | 后手 (Seat1) | 1160 | 29.4 | Player 1 (Heuristic) | 自然终局 | 负 |
| **7** | (2) The Crossing.aem | 后手 (Seat1) | 先手 (Seat0) | 429 | 13.8 | Player 0 (Heuristic) | 自然终局 | 负 |
| **8** | (2) Icy Paths.aem | 先手 (Seat0) | 后手 (Seat1) | 849 | 36.6 | Player 1 (Heuristic) | 自然终局 | 负 |
| **9** | (2) Icy Paths.aem | 后手 (Seat1) | 先手 (Seat0) | 592 | 26.3 | Player 0 (Heuristic) | 自然终局 | 负 |
| **10** | (2) Peak Island.aem | 先手 (Seat0) | 后手 (Seat1) | 270 | 8.3 | Player 1 (Heuristic) | 自然终局 | 负 |
| **11** | (2) Peak Island.aem | 后手 (Seat1) | 先手 (Seat0) | 274 | 8.7 | Player 0 (Heuristic) | 自然终局 | 负 |
| **12** | (2) Crossed swords.aem | 先手 (Seat0) | 后手 (Seat1) | 3000 | 212.3 | 无 | 3000步上限截断 | 截断 |
| **13** | (2) Crossed swords.aem | 后手 (Seat1) | 先手 (Seat0) | 1693 | 141.0 | Player 0 (Heuristic) | 自然终局 | 负 |
| **14** | (2) Duel.aem [R2] | 先手 (Seat0) | 后手 (Seat1) | 263 | 11.1 | Player 1 (Heuristic) | 自然终局 | 负 |
| **15** | (2) Duel.aem [R2] | 后手 (Seat1) | 先手 (Seat0) | 3000 | 137.0 | 无 | 3000步上限截断 | 截断 |
| **16** | (2) The Crossing.aem [R2] | 先手 (Seat0) | 后手 (Seat1) | 447 | 21.4 | Player 1 (Heuristic) | 自然终局 | 负 |
| **17** | (2) The Crossing.aem [R2] | 后手 (Seat1) | 先手 (Seat0) | 1213 | 70.8 | Player 0 (Heuristic) | 自然终局 | 负 |
| **18** | (2) Swamplands.aem [R2] | 先手 (Seat0) | 后手 (Seat1) | 112 | 2.9 | Player 1 (Heuristic) | 自然终局 | 负 |
| **19** | (2) Swamplands.aem [R2] | 后手 (Seat1) | 先手 (Seat0) | 67 | 1.0 | Player 0 (Heuristic) | 自然终局 | 负 |

---

## 4. 最终成绩与裁定结论

- **总对局数**: 20
- **自然获胜局数**: **1**
- **自然失败局数**: 15
- **自然平局局数**: 0
- **截断局数**: 4 (2 次重复局面，2 次步数上限)
- **程序/规则错误**: **0** (全部 20 局 100% 正常合法推进完成)
- **实际自然胜率**: **5.0%** (1 / 20)
- **验收目标**: $\ge 16$ 胜 / 20 局 (80.0%)
- **正式判定结果**: **NOT_MET (未达到 80% 胜率标准)**

> [!IMPORTANT]
> **真实报告原则**: 依据用户第一节约束，严禁通过挑选种子、修改对局数、调低标准或将截断算作胜局等方式掩盖结果。本阶段冻结纯模型 `arm_a_warm_start` 实测自然胜率为 5.0%，**未达到本阶段训练成功目标**。

---

## 5. 战术与规则复盘：纯模型未能击败 HeuristicAI 的深层原因

通过对 20 局对战全日志（共 17,040 原子步）的复盘，识别出纯前向神经网络模型面对规则专家（HeuristicAI）时的三大结构性瓶颈：

1. **宏观经济与扩张节奏劣势**:
   - `HeuristicAI` 内部内置强烈的“空闲村庄占领权重”与“金币滚雪球收益计算”。在游戏前 10 个回合中，HeuristicAI 会分兵快速占领全图绝大多数村庄，形成每回合 200~300 金币的经济压制。
   - 纯模型策略缺乏宏观规划目标，只能根据局部 20x20 卷积视野感知附近敌人与地形，经常将兵力集中于防守或无效折返，导致在中后期面对 HeuristicAI 源源不断的兵海时被耗尽金币战败。
2. **缺乏前向推演导致战术兑子失误**:
   - `HeuristicAI` 对单位伤害、护甲克制（如轻骑兵对弓手、弓手对水族等）进行精确结算，并且只在“击杀”或“大优势换血”时发动攻击。
   - 纯模型依赖单步 Argmax 采样，在狭窄关隘（如 Icy Paths、The Crossing）极易送入落单脆弱单位被 HeuristicAI 围歼集火。
3. **僵局打破能力不足与重复局面截断**:
   - 在均势残局（如 Crossed swords、Duel R2、Liberty Port）中，双方兵力对峙于城堡两侧。纯模型没有多步树搜索指导长线突破，常在防御点来回移动，最终触发 3 折重复局面截断或 3000 步上限截断。

---

## 6. 教师与辅助策略对照（参考研究成果，不替代主验收）

| 策略形态 | 决策方式 | 开发面板 DEV 胜率 | 优劣势简评 |
| :--- | :--- | :---: | :--- |
| **纯模型 (`arm_a_warm_start`)** | 单步 ResNet 纯前向推理 (~2ms) | **10.0%** | 推理极快，但在大图中缺乏多步推演视野与经济战略。 |
| **从零训练 (`arm_b_scratch`)** | 单步 ResNet 纯前向推理 (~2ms) | **0.0%** | 缺乏预训练先验，在开局迅速崩溃。 |
| **搜索教师 (`B100-Q` / `B100-R`)** | 战术树展开 + Rollout 评估 (~150ms) | **30.0%** | 具备局部多步杀伤与反制计算，但大地图易超时截断。 |

**结论**：在当前冻结 r4 规则下，纯依靠当前有限规模数据（~2900 样本）进行行为克隆微调，无法让纯前向模型直接跨越战略决策鸿沟击败深度规则优化的 HeuristicAI。未来攻克 HeuristicAI 的可行路线必然需要引入**强化学习自弈推演（PPO / AlphaZero 式 MCTS-Guided Policy）**，通过长序列回报强化宏观占领意识与经济运营。
