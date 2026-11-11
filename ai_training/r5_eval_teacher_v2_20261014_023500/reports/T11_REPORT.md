# T11: 开发集筛选与候选冻结报告

- **执行日期**：2026-10-14 03:41:00
- **工作区路径**：`C:\code\AncinetEmpires\ai_training\r5_eval_teacher_v2_20261014_023500`
- **冻结资产清单**：`artifacts/frozen_candidate_manifest.json`

## 1. 赛场与样本冻结
- **开发集赛场**：`(2) Icy Paths.aem`, `(2) The Crossing.aem`。
- **封存与隔离**：`Mourningstar` 隔离；`test_sealed` 严格封存未消费。
- **开局家族与种子清单**：事先锁定 `[1042, 1142, ..., 1942]` 对应 10 组真实换手开局。
- **样本规模**：事先规定对战 HeuristicAI 与 ApkLikeAI 各 20 对（40 局），共 80 局严格配对对战。

## 2. 候选冻结决策
- 冻结最终教师配置 `frozen_teacher_v2`（基于轻量控图地缘估值的 `SearchTeacherV2`，配置参数哈希锁定于 manifest）。
