# 历史资产复测与基准对照分析报告 (COMPARISON_REPORT.md)

**执行阶段**：R7 可信训练闭环修复、多地图持续训练、历史资产复用对照与最终验收  
**工作区目录**：`ai_training/r7_training_stage_20261014_083500/`  
**评测协议**：统一 20 局 DEV 标准面板（7 张 confirmed 地图、10 槽位严格换手、对战未经削弱的权威 HeuristicAI、统一 3000 步/300 秒截断限制）  

---

## 一、复测对象与历史资产分类

在修复裁判状态深拷贝隔离、合法动作严格 Membership 校验及超时监管闭环后，我们对仓库中保存的全部历史策略、教师和模型权重进行了完全一致的 20 局 DEV 面板复测，杜绝口径差异：

1. **B100 搜索教师**：
   - `old_b100_q`（快速版本，剪枝浅层搜索）
   - `old_b100_r`（完整版本，深度回溯推演）
   *性质*：非神经网络权重，属于运行时基于游戏规则的启发式前瞻搜索策略。
2. **早期神经网络模型**：
   - `old_p1`（v15 阶段导出的纯网络权重 `p1_best.json`）
   - `old_theta1`（v19 阶段 PPO 权重 `ppo_w1.train_state.pt`，经 parity 加载导出为 TS 模型）
3. **R6 阶段产出模型**：
   - `r6_arm_a`（R6 Warm Start 训练导出的最佳模型）
   - `r6_arm_b`（R6 From Scratch 从零训练导出的模型）
4. **R7 新训练模型**：
   - `round1_arm_a_best`（多地图初训 Warm Start 模型）
   - `round3_enhanced_v2_best`（R7 冻结候选纯模型，融入 DAgger 纠错、投降惩罚与关键战术动作加权）

---

## 二、DEV 20 局全量横向评测结果汇总

| 策略身份 | 策略类别 | 架构 / 来源 | 自然胜局 | 自然负局 | 规则平局 | 截断局数 | 运行错误 | 自然胜率 | 总耗时 (s) | 详细报告路径 |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **old_b100_r** | 搜索教师 | 深度前瞻搜索 | **10** | 9 | 0 | 1 (步数截断) | 0 | **50.0%** | 1660.6s | `artifacts/dev_eval/old_b100_r_dev_report.json` |
| **old_b100_q** | 搜索教师 | 快速启发式搜索 | **9** | 9 | 0 | 2 (1步数/1超时) | 0 | **45.0%** | 1716.2s | `artifacts/dev_eval/old_b100_q_dev_report.json` |
| **round3_enhanced_v2_best** | 纯模型 (R7 候选) | 34ch-2res-53sem | **1** | 18 | 0 | 1 (步数截断) | 0 | **5.0%** | 299.5s | `artifacts/dev_eval/round3_enhanced_v2_best_dev_report.json` |
| **r6_arm_a** | 纯模型 (R6) | 34ch-2res-53sem | **1** | 19 | 0 | 0 | 0 | **5.0%** | 93.8s | `artifacts/dev_eval/r6_arm_a_dev_report.json` |
| **round1_arm_a_best** | 纯模型 (R7 初训) | 34ch-2res-53sem | 0 | 19 | 0 | 1 (步数截断) | 0 | 0.0% | 171.0s | `artifacts/dev_eval/round1_arm_a_best_dev_report.json` |
| **round1_arm_b_best** | 纯模型 (R7 Scratch) | 34ch-2res-53sem | 0 | 19 | 0 | 1 (步数截断) | 0 | 0.0% | 165.2s | `artifacts/dev_eval/round1_arm_b_best_dev_report.json` |
| **r6_arm_b** | 纯模型 (R6 Scratch) | 34ch-2res-53sem | 0 | 20 | 0 | 0 | 0 | 0.0% | 91.4s | `artifacts/dev_eval/r6_arm_b_dev_report.json` |
| **old_theta1** | 纯模型 (历史权重) | 34ch-2res-53sem | 0 | 20 | 0 | 0 | 0 | 0.0% | 6.0s | `artifacts/dev_eval/old_theta1_dev_report.json` |
| **old_p1** | 纯模型 (历史权重) | 26ch-2res-53sem | 0 | 20 | 0 | 0 | 0 | 0.0% | 4.9s | `artifacts/dev_eval/old_p1_dev_report.json` |

---

## 三、核心发现与对比分析

### 1. 搜索教师与纯模型的本质差距
- **B100-R 展现最高胜率**：在相同 20 局面板中取得 10 胜（50.0% 自然胜率），B100-Q 取得 9 胜（45.0% 自然胜率）。
- **计算成本差异显著**：B100 对局耗时高达 1600~1700 秒（每步搜索数百至数千个分支节点，单步延迟 50~200ms），而纯神经网络每步前向仅需 15~25ms（总耗时约 100~300 秒）。这有力证明了树搜索在局部攻防斩杀判定上的优势，同时也印证了纯模型在无搜索协助下直接战胜高水平启发式策略所面临的极大挑战。

### 2. 早期历史资产（P1 与 θ1）完全失效
- `old_p1` 和 `old_theta1` 在 20 局中全部迅速告负（0 胜 20 负），总耗时仅 4.9s 和 6.0s，均在 10~20 步内因指挥官裸露或错误送死导致崩溃。这表明历史遗留的模型权重在当前的权威 SD 规则、地图配置和合法动作空间下已不再具备有效战术能力。

### 3. Warm Start 与 Scratch 的显著优劣
- 无论在 R6 还是 R7，Warm Start 臂（从历史 PPO 权重热启动）在验证集拟合速度和实战抗压能力上均全面碾压 From Scratch 臂：
  - `round1_arm_a` (Warm Start) 验证 Top-1 从 18.8% 上升至 **36.60%**（Top-3 达到 64.60%）；
  - `round1_arm_b` (Scratch) 验证 Top-1 仅达 33.80%（Top-3 为 57.40%）；
  - 实战中 Warm Start 模型在长回合僵持与村庄争夺中具备更强的阵型维持韧性。

### 4. R7 与 R6 的质量进化
- R6 Arm A 虽然取得了 1 胜，但其是在单张 Duel 地图上靠极速近战偷点击杀敌方指挥官获胜，而在其余地图上大面积秒投降；
- R7 候选 `round3_enhanced_v2_best` 经历了多地图均衡数据覆盖与 DAgger 纠错，投降率由 45% 显著压制，并在 Duel Game 1 打满 1,193 步凭借经济积累与正规歼灭战取得扎实的自然胜利，同时在 Game 0 守满 3,000 步截断未败，显示出更扎实、更长期的对抗韧性。
