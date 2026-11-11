# T07–T12 阶段任务计划书 (TASK_PLAN.md)

- **阶段名称**：评测修正、Teacher v2 改进与资格复验
- **执行时间**：2026-10-14 02:35:00
- **工作区绝对路径**：`C:\code\AncinetEmpires\ai_training\r5_eval_teacher_v2_20261014_023500`
- **冻结规则版本**：`apk-4.2.5.1-rules-20261013-r4`
- **独立环境交付包 SHA-256**：`323924ab76a8272322f4b122d64e4af4ff2574a85c6a4d996bf4cb9680bffea8`
- **时间与预算上限**：建议墙钟上限 12 小时，全过程详细记账。

---

## 1. 任务范围与依赖关系

```
[T07: 证据/裁判/统计协议审计]
       │
       ▼
[T08: 搜索正确性/预算/v1对照]
       │
       ▼
[T09: 战术题审计/局部穷举/题库冻结]
       │
       ▼
[T10: Teacher v2 单变量改进与消融]
       │
       ▼
[T11: 开发集筛选/开局冻结/候选冻结]
       │
       ▼
[T12: Gate B 正式复验与交付报告]
```

---

## 2. 关键任务与验收标准

### T07：证据、裁判与评测协议审计
- **问题核验**：
  1. `scratch/evaluate_gate_b.ts` 将所有截断盲目归入 `endgame_loop`；
  2. `research/evaluate.ts` 中 `4_handoff`、`8_handoff` 实际执行原子动作而非真实换手；
  3. `uniqueTrajectoriesCount` 使用终态哈希去重；
  4. 分层 Bootstrap 未真正按地图分层，未做开局家族簇处理；
  5. `conservativeScoreA` 与 `ci95Lower` 概念重叠。
- **目标产物**：
  - 修正版动作协议与裁判 `match_runner.ts`、`outcomes.ts`；
  - 真实换手开局生成器 `openings.ts`；
  - 严格分层分簇 Bootstrap 统计器 `statistics.ts`；
  - `AUDIT_REPORT.md`。

### T08：搜索正确性、预算与可复现性
- **问题核验**：
  1. `search_teacher.ts` 中推演达到 20 步或对手达到步数上限后未到统一相位就直接评估；
  2. 候选选择 `candidate_selector.ts` 中 `nonTopPriorFraction` 未生效，探索槽位被固定类型抢占；
  3. 缺乏确定性种子与固定候选排序。
- **目标产物**：
  - 记录完备 trace 的统一相位搜索教师；
  - 修复版确定性搜索教师 v1 对照（Frozen v1 对照组）；
  - 边界单元测试 `search_teacher_v1.test.ts`。

### T09：战术题审计与候选覆盖诊断
- **问题核验**：
  1. 逐题排查旧 15 道失败题，定位城堡招募干扰、动作等价性与预期动作单一性；
  2. 权威引擎局部穷举验证；
  3. 冻结修订题库，并双轨报告旧 32 题与修订题库表现。
- **目标产物**：
  - 审计题库诊断表与复核脚本；
  - 冻结修订战术题库 `eval/tactical_suite_v2.json`。

### T10：Teacher v2 单变量改进
- **评估维度**：
  - A. 候选优先级与覆盖改进（探索配额保证、战术类别加权、排除非必要城堡招募干扰）；
  - B. 目标推进估值（基于真实地形移动成本的可达性/推进势场，结合威胁与价值）；
  - C. 控图估值（区域地缘控制/距离势场辅助估值，自然终局始终绝对支配）；
  - D. 两轮完整换手推演；
  - E. 最佳组合版本。
- **目标产物**：
  - 各维度消融数据与耗时分析 `EXPERIMENT_REPORT.md`。

### T11：开发集筛选与候选冻结
- **规则规范**：
  - 严格隔离 Mourningstar，封存 test_sealed；
  - 仅在 dev 地图（`(2) Icy Paths.aem`, `(2) The Crossing.aem`）上进行配对筛选；
  - 事先冻结开局家族清单、随机种子清单与正式评测样本量；
  - 冻结最终 Teacher v2 候选配置。

### T12：Gate B 正式复验
- **对决对象**：
  - 主基线：冻结 `HeuristicAI`；
  - 次级基线：冻结 `ApkLikeAI`。
- **判定门槛**：
  - 保守得分下界 $\ge 60\%$；
  - 95% CI 下界 $> 50\%$；
  - 截断率 $\le 10\%$；
  - 运行错误 $= 0$；
  - 次级基线无退步（胜率 $\ge 50\%$）；
  - 战术验收率 $\ge 80\%$（且旧 32 题口径 $\ge 26$ 题）。
- **交付物**：
  - `gate_b_verdict.json`、代表性回放、`STAGE_REPORT.md`、`HANDOFF.md`。
