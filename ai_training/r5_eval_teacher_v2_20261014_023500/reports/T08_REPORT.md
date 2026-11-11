# T08: 搜索正确性、预算与可复现性报告

- **执行日期**：2026-10-14 02:43:00
- **工作区路径**：`C:\code\AncinetEmpires\ai_training\r5_eval_teacher_v2_20261014_023500`
- **交付代码**：`research/candidate_selector.ts`、`research/search_teacher_v1.ts`、`research/search_teacher_v1.test.ts`
- **测试状态**：**PASS** (5/5 通过)

## 1. 核心问题修复与架构改进

1. **推演相位对齐与完成状态严格区分**：
   - 当本方推演达到 20 步上限且未换手时，标记 `incomplete_own_limit`，`isCompleted = false`；
   - 当对手模拟达到步数上限且未到达 root 联盟下次行动时，标记 `incomplete_opp_limit`，`isCompleted = false`；
   - 未完成候选绝不伪装为完整统一相位，施加相应惩罚，优先采信已完成候选。
2. **完整 CandidateEvaluationTrace 审计记录**：
   - 记录 `actionCode`、`selectionReason`、`engineStepCalls`、`actualHandoffs`、`leafPhase`、`opponentPolicy`、`isCompleted`、`stopReason`、`valueComponents` 和 `finalQ`。
3. **预算耗尽与安全 Fallback 策略**：
   - 墙钟超时前若有部分候选完成，选择最佳已完成候选并记录 `fallbackReason: 'completed_partial_budget'`；
   - 若全部未完成，安全回退到启发式推荐 top-1 动作，记录 `fallbackReason: 'heuristic_top1'`。
4. **确定性与探索配额保证**：
   - 候选选择中严格落实 `nonTopPriorFraction`（保留探索槽位并通过注入种子确定性抽取）；
   - 最终候选按动作编码确定性排序，消除遍历顺序波动。
5. **建立修复版 v1 对照 (CorrectedSearchTeacherV1)**：
   - 仅修复正确性与确定性，保持原评估函数特征，作为后续 T10 单变量改进实验的法定基准对照组。
