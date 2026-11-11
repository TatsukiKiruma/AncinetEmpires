# R6 阶段正确性修复与验证报告 (CORRECTNESS_REPORT.md)

- **执行日期**：2026-10-14
- **工作区路径**：`C:\code\AncinetEmpires\ai_training\r6_model_training_20261014_063500`
- **冻结规则版本**：`apk-4.2.5.1-rules-20261013-r4`
- **验证结论**：针对历史审计与证据链确认的 5 项核心正确性缺陷已全部修复，回归测试 5/5 全部通过。

---

## 1. 本轮修复的核心正确性问题与实证

| 序号 | 缺陷项 | 历史代码位置 | 修复措施 | 回归测试验证 |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **状态恢复与初始收入** | `engine.ts` 构造器选项 | 评测器与环境恢复中严格保持 `applyInitialTurnStart: false`（默认值），严禁对已结算开局二次结算金币。 | `correctness.test.ts:10-25` 验证恢复前后双方初始金币 100% 保持不变。 |
| **2** | **重复状态 Key 漏字段** | `research/state_hash.ts:69-73` | 将 `players.gold`, `unitCount`, `units.status`, `level`, `exp` 等核心规则状态全部纳入 `gameplayCore`。 | `correctness.test.ts:27-42` 证实金币或所有权变动必然产生不同哈希，彻底杜绝假死锁。 |
| **3** | **实体特征容量溢出截断** | `research/features.ts:104` | 实体表容量由 48 扩充至 64（覆盖双人 60 单位上限 + pending + 冗余）；超出容量时显式抛出 `EntityOverflowError`，严禁静默丢弃。 | `correctness.test.ts:44-67` 构造 65 个单位，实测显式抛出 Fatal 异常。 |
| **4** | **探索配额向下取整为 0** | `research/candidate_selector.ts:70` | 修复计算公式：当 $K \ge 2$ 且 $nonTopPriorFraction > 0$ 时，`explorationQuota = Math.max(1, Math.round(K * nonTopPriorFraction))`，消除向下取整归零。 | `correctness.test.ts:69-90` 验证 $K=3$ 与 $K=4$ 时均分配 $\ge 1$ 探索槽位。 |
| **5** | **随机源未受控与 Math.random 泄漏** | 历史 AI 默认构造函数 | 实现可置种、可序列化、纯净的 `DeterministicPRNG` (Mulberry32)，并显式向 `HeuristicAI(rng)` 及候选选择器注入独立流。 | `correctness.test.ts:92-105` 验证 PRNG 状态保存与恢复重放一致性。 |

---

## 2. 针对未处理历史问题的说明

1. **题库重复状态与人工最优解标记 (审计 E10)**：
   - 本阶段最终主验收标准聚焦于纯模型在完整 20 局对战中自然获胜 $\ge 16$ 局，不再将战术题作为 Gate B 阻断条件。因此对历史战术题库中的部分存疑人工标记予以记录隔离，不在本轮投入精力大规模重修题库。
2. **多余历史版本的整套重构**：
   - 对于已弃用的历史脚本（如 V10~V13 等早期未迁入模块），如实保留历史现状，不进行无必要的额外重构，严格遵循只重构复用模块的原则。
