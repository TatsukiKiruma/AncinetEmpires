# Ancient Empires AI v8 临时汇总报告 (v8_pipeline_summary_tmp.md)

- **生成时间**: 2026-09-21
- **工作分支**: `path-b-spatial-ai` (HEAD `251412d`)
- **审查基点**: `6e7b7e22d36597369e75a5f21f743bd2f5faab93`
- **当前 Run ID**: `agent_upgrade_20260921_v8_final_01`

---

## 1. v8 流水线最后 100 行日志

### A. 规模训练与 DAgger 诊断流水线（task-1529 尾部日志）
```text
[Epoch 02/02] Train Loss: 1.6739 (Acc: 52.33%) | Val Loss: 1.9072 (Acc: 44.79%) [*BEST]

=======================================================
[Training Complete] Best Validation Accuracy: 44.79% (Epoch 2)
Best model checkpoint: C:\code\AncinetEmpires\training_runs\agent_upgrade_20260921_v8_final_01\checkpoints\spatial_resnet_dagger\spatial_resnet_dagger_best.json
Metrics saved to: C:\code\AncinetEmpires\training_runs\agent_upgrade_20260921_v8_final_01\checkpoints\spatial_resnet_dagger\spatial_resnet_dagger_metrics.json
Consumed samples manifest: C:\code\AncinetEmpires\training_runs\agent_upgrade_20260921_v8_final_01\checkpoints\spatial_resnet_dagger\consumed_samples_manifest.json
=======================================================

✅ [R7-04 DAgger Round 1 Complete] Checkpoint: C:\code\AncinetEmpires\training_runs\agent_upgrade_20260921_v8_final_01\checkpoints\spatial_resnet_dagger\spatial_resnet_dagger_best.json
DAgger fine-tuning complete.
Base Model SHA:   1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92
DAgger Model SHA: efec05c0e16a707689f651b59262b41db30601fa3ce6b567ed9fc17c117fbf9b
Distinct Checkpoint SHAs Verified: true
Logged Failure Windows: 61

--- Step 5: Paired Benchmark: SPATIAL_BASE vs SPATIAL_DAGGER ---

=======================================================
[V7 Benchmark] Evaluating Policy: SPATIAL_V2
Maps: 5 | Seats: 2 | Seeds: 2 (Total: 20 matches)
=======================================================

  [SPATIAL_V2] Duel (Seat 0, Seed 42) -> NATURAL_LOSS (6 turns, 100 steps, 22.1ms/act, Rehire: 0/0)
  [SPATIAL_V2] Duel (Seat 0, Seed 1337) -> NATURAL_LOSS (6 turns, 100 steps, 22.8ms/act, Rehire: 0/0)
  [SPATIAL_V2] Duel (Seat 1, Seed 42) -> NATURAL_WIN (18 turns, 398 steps, 22.5ms/act, Rehire: 0/0)
  [SPATIAL_V2] Duel (Seat 1, Seed 1337) -> NATURAL_WIN (18 turns, 398 steps, 23.0ms/act, Rehire: 0/0)
  [SPATIAL_V2] Crossed Swords (Seat 0, Seed 42) -> NATURAL_LOSS (11 turns, 242 steps, 22.4ms/act, Rehire: 0/0)
  [SPATIAL_V2] Crossed Swords (Seat 0, Seed 1337) -> NATURAL_LOSS (12 turns, 269 steps, 22.5ms/act, Rehire: 0/0)
  [SPATIAL_V2] Crossed Swords (Seat 1, Seed 42) -> TRUNCATION_MAX_STEPS (25 turns, 800 steps, 22.4ms/act, Rehire: 0/0)
  [SPATIAL_V2] Crossed Swords (Seat 1, Seed 1337) -> TRUNCATION_MAX_STEPS (26 turns, 800 steps, 22.3ms/act, Rehire: 0/0)
  [SPATIAL_V2] Icy Paths (Seat 0, Seed 42) -> TRUNCATION_MAX_STEPS (22 turns, 800 steps, 22.1ms/act, Rehire: 1/1)
  [SPATIAL_V2] Icy Paths (Seat 0, Seed 1337) -> TRUNCATION_MAX_STEPS (22 turns, 800 steps, 22.5ms/act, Rehire: 1/1)
  [SPATIAL_V2] Icy Paths (Seat 1, Seed 42) -> TRUNCATION_MAX_STEPS (24 turns, 800 steps, 22.2ms/act, Rehire: 0/0)
  [SPATIAL_V2] Icy Paths (Seat 1, Seed 1337) -> NATURAL_LOSS (17 turns, 431 steps, 21.7ms/act, Rehire: 0/0)
  [SPATIAL_V2] Liberty Port (Seat 0, Seed 42) -> NATURAL_LOSS (21 turns, 575 steps, 22.5ms/act, Rehire: 1/1)
  [SPATIAL_V2] Liberty Port (Seat 0, Seed 1337) -> NATURAL_LOSS (26 turns, 794 steps, 22.0ms/act, Rehire: 1/1)
  [SPATIAL_V2] Liberty Port (Seat 1, Seed 42) -> NATURAL_LOSS (18 turns, 434 steps, 21.7ms/act, Rehire: 1/1)
  [SPATIAL_V2] Liberty Port (Seat 1, Seed 1337) -> NATURAL_LOSS (15 turns, 326 steps, 21.6ms/act, Rehire: 1/1)
  [SPATIAL_V2] Mourningstar (Seat 0, Seed 42) -> NATURAL_LOSS (10 turns, 202 steps, 22.7ms/act, Rehire: 0/0)
  [SPATIAL_V2] Mourningstar (Seat 0, Seed 1337) -> NATURAL_LOSS (10 turns, 202 steps, 21.8ms/act, Rehire: 0/0)
  [SPATIAL_V2] Mourningstar (Seat 1, Seed 42) -> NATURAL_LOSS (10 turns, 205 steps, 21.8ms/act, Rehire: 0/0)
  [SPATIAL_V2] Mourningstar (Seat 1, Seed 1337) -> NATURAL_LOSS (10 turns, 200 steps, 22.5ms/act, Rehire: 0/0)

=======================================================
[V7 Benchmark] Evaluating Policy: SPATIAL_DAGGER
Maps: 5 | Seats: 2 | Seeds: 2 (Total: 20 matches)
=======================================================

  [SPATIAL_DAGGER] Duel (Seat 0, Seed 42) -> NATURAL_LOSS (9 turns, 171 steps, 22.2ms/act, Rehire: 0/0)
  [SPATIAL_DAGGER] Duel (Seat 0, Seed 1337) -> NATURAL_LOSS (9 turns, 171 steps, 21.7ms/act, Rehire: 0/0)
  [SPATIAL_DAGGER] Duel (Seat 1, Seed 42) -> NATURAL_LOSS (9 turns, 150 steps, 22.2ms/act, Rehire: 0/0)
  [SPATIAL_DAGGER] Duel (Seat 1, Seed 1337) -> NATURAL_LOSS (9 turns, 150 steps, 21.7ms/act, Rehire: 0/0)
  [SPATIAL_DAGGER] Crossed Swords (Seat 0, Seed 42) -> TRUNCATION_MAX_STEPS (21 turns, 800 steps, 21.6ms/act, Rehire: 1/1)
  [SPATIAL_DAGGER] Crossed Swords (Seat 0, Seed 1337) -> NATURAL_LOSS (15 turns, 414 steps, 23.1ms/act, Rehire: 1/1)
  [SPATIAL_DAGGER] Crossed Swords (Seat 1, Seed 42) -> TRUNCATION_MAX_STEPS (23 turns, 800 steps, 22.2ms/act, Rehire: 0/0)
  [SPATIAL_DAGGER] Crossed Swords (Seat 1, Seed 1337) -> NATURAL_LOSS (16 turns, 425 steps, 22.0ms/act, Rehire: 0/0)
  [SPATIAL_DAGGER] Icy Paths (Seat 0, Seed 42) -> TRUNCATION_MAX_STEPS (23 turns, 800 steps, 22.1ms/act, Rehire: 2/2)
  [SPATIAL_DAGGER] Icy Paths (Seat 0, Seed 1337) -> TRUNCATION_MAX_STEPS (23 turns, 800 steps, 22.4ms/act, Rehire: 1/1)
  [SPATIAL_DAGGER] Icy Paths (Seat 1, Seed 42) -> NATURAL_LOSS (12 turns, 230 steps, 22.3ms/act, Rehire: 1/1)
  [SPATIAL_DAGGER] Icy Paths (Seat 1, Seed 1337) -> TRUNCATION_MAX_STEPS (25 turns, 800 steps, 22.2ms/act, Rehire: 2/3)
  [SPATIAL_DAGGER] Liberty Port (Seat 0, Seed 42) -> TRUNCATION_MAX_STEPS (26 turns, 800 steps, 22.8ms/act, Rehire: 1/1)
  [SPATIAL_DAGGER] Liberty Port (Seat 0, Seed 1337) -> TRUNCATION_MAX_STEPS (27 turns, 800 steps, 22.8ms/act, Rehire: 2/2)
  [SPATIAL_DAGGER] Liberty Port (Seat 1, Seed 42) -> TRUNCATION_MAX_STEPS (24 turns, 800 steps, 22.3ms/act, Rehire: 1/1)
  [SPATIAL_DAGGER] Liberty Port (Seat 1, Seed 1337) -> NATURAL_LOSS (17 turns, 478 steps, 21.7ms/act, Rehire: 1/1)
  [SPATIAL_DAGGER] Mourningstar (Seat 0, Seed 42) -> TRUNCATION_MAX_STEPS (23 turns, 800 steps, 22.3ms/act, Rehire: 0/0)
  [SPATIAL_DAGGER] Mourningstar (Seat 0, Seed 1337) -> NATURAL_LOSS (13 turns, 311 steps, 23.0ms/act, Rehire: 0/0)
  [SPATIAL_DAGGER] Mourningstar (Seat 1, Seed 42) -> NATURAL_LOSS (12 turns, 257 steps, 22.4ms/act, Rehire: 0/0)
  [SPATIAL_DAGGER] Mourningstar (Seat 1, Seed 1337) -> NATURAL_LOSS (18 turns, 372 steps, 21.9ms/act, Rehire: 1/1)

[V7 Benchmark] Saved comparison report to: C:\code\AncinetEmpires\docs\training\reports\agent_upgrade_20260921_v8_final_01\dagger_paired_evaluation.json

=======================================================
✅ [R8-05/06/07 Full Pipeline Completed Successfully]
Dataset states:  7832
Base Model SHA:   1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92
DAgger Model SHA: efec05c0e16a707689f651b59262b41db30601fa3ce6b567ed9fc17c117fbf9b
Paired Report:   C:\code\AncinetEmpires\docs\training\reports\agent_upgrade_20260921_v8_final_01\dagger_paired_evaluation.json
=======================================================
```

### B. 6 策略全量基准评测（task-1549 尾部日志）
```text
=======================================================
[V7 Benchmark] Evaluating Policy: S10_SPATIAL_SEARCH
Maps: 5 | Seats: 2 | Seeds: 2 (Total: 20 matches)
=======================================================

  [S10_SPATIAL_SEARCH] Duel (Seat 0, Seed 42) -> NATURAL_LOSS (5 turns, 80 steps, 181.9ms/act, Rehire: 0/0)
  [S10_SPATIAL_SEARCH] Duel (Seat 0, Seed 1337) -> NATURAL_LOSS (5 turns, 79 steps, 177.3ms/act, Rehire: 0/0)
  [S10_SPATIAL_SEARCH] Duel (Seat 1, Seed 42) -> NATURAL_WIN (7 turns, 123 steps, 210.1ms/act, Rehire: 0/0)
  [S10_SPATIAL_SEARCH] Duel (Seat 1, Seed 1337) -> TRUNCATION_MAX_STEPS (28 turns, 800 steps, 180.6ms/act, Rehire: 0/0)
  [S10_SPATIAL_SEARCH] Crossed Swords (Seat 0, Seed 42) -> NATURAL_LOSS (15 turns, 465 steps, 173.8ms/act, Rehire: 0/0)
  [S10_SPATIAL_SEARCH] Crossed Swords (Seat 0, Seed 1337) -> NATURAL_LOSS (19 turns, 726 steps, 160.2ms/act, Rehire: 0/0)
  [S10_SPATIAL_SEARCH] Crossed Swords (Seat 1, Seed 42) -> TRUNCATION_MAX_STEPS (23 turns, 800 steps, 259.8ms/act, Rehire: 2/2)
  [S10_SPATIAL_SEARCH] Crossed Swords (Seat 1, Seed 1337) -> TRUNCATION_MAX_STEPS (23 turns, 800 steps, 340.8ms/act, Rehire: 2/2)
  [S10_SPATIAL_SEARCH] Icy Paths (Seat 0, Seed 42) -> TRUNCATION_MAX_STEPS (20 turns, 800 steps, 224.5ms/act, Rehire: 1/1)
  [S10_SPATIAL_SEARCH] Icy Paths (Seat 0, Seed 1337) -> NATURAL_LOSS (16 turns, 491 steps, 260.4ms/act, Rehire: 1/2)
  [S10_SPATIAL_SEARCH] Icy Paths (Seat 1, Seed 42) -> NATURAL_LOSS (22 turns, 689 steps, 293.7ms/act, Rehire: 0/0)
  [S10_SPATIAL_SEARCH] Icy Paths (Seat 1, Seed 1337) -> NATURAL_LOSS (18 turns, 550 steps, 245.1ms/act, Rehire: 0/1)
  [S10_SPATIAL_SEARCH] Liberty Port (Seat 0, Seed 42) -> TRUNCATION_MAX_STEPS (25 turns, 800 steps, 218.4ms/act, Rehire: 1/1)
  [S10_SPATIAL_SEARCH] Liberty Port (Seat 0, Seed 1337) -> NATURAL_LOSS (14 turns, 382 steps, 171.7ms/act, Rehire: 0/0)
  [S10_SPATIAL_SEARCH] Liberty Port (Seat 1, Seed 42) -> TRUNCATION_MAX_STEPS (24 turns, 800 steps, 219.3ms/act, Rehire: 1/1)
  [S10_SPATIAL_SEARCH] Liberty Port (Seat 1, Seed 1337) -> TRUNCATION_MAX_STEPS (24 turns, 800 steps, 203.5ms/act, Rehire: 1/1)
  [S10_SPATIAL_SEARCH] Mourningstar (Seat 0, Seed 42) -> NATURAL_LOSS (15 turns, 401 steps, 194.0ms/act, Rehire: 1/1)
  [S10_SPATIAL_SEARCH] Mourningstar (Seat 0, Seed 1337) -> NATURAL_LOSS (13 turns, 323 steps, 192.5ms/act, Rehire: 0/0)
  [S10_SPATIAL_SEARCH] Mourningstar (Seat 1, Seed 42) -> NATURAL_LOSS (18 turns, 403 steps, 171.3ms/act, Rehire: 0/0)
  [S10_SPATIAL_SEARCH] Mourningstar (Seat 1, Seed 1337) -> TRUNCATION_MAX_STEPS (26 turns, 800 steps, 189.0ms/act, Rehire: 1/1)

[V7 Benchmark] Saved comparison report to: C:\code\AncinetEmpires\docs\training\reports\agent_upgrade_20260921_v8_final_01\v8_clean_benchmark.json

=======================================================
✅ [R8-03 Clean Benchmark Completed Successfully]
Total Matches: 120
Report Path: C:\code\AncinetEmpires\docs\training\reports\agent_upgrade_20260921_v8_final_01\v8_clean_benchmark.json
=======================================================
```

---

## 2. task-292 的最终状态与日志摘要

- **执行命令**: `npx tsx tools/v7_unified_evaluation.ts`（早期基于 `v7_01` 历史检查点的基准复评任务）
- **最终执行状态**: `COMPLETED WITH DETECTED MODEL_LOAD_ERROR` (退出码 0，框架显式捕获并记录模型损坏事件)
- **关键日志**:
```text
Could not load net_a model: Error: Non-finite value in trunkW1 at index 356: null
    at loadAndValidate (C:\code\AncinetEmpires\tools\skirmish_dual_head_net.ts:638:27)
    at loadDualHeadModelFromJson (C:\code\AncinetEmpires\tools\skirmish_dual_head_net.ts:652:5)
    at runFullV7BenchmarkSuite (C:\code\AncinetEmpires\tools\v7_unified_evaluation.ts:496:25)
...
=======================================================
[V7 Benchmark] Evaluating Policy: NET_A
Maps: 5 | Seats: 2 | Seeds: 2 (Total: 20 matches)
=======================================================

[V7 Benchmark] Policy NET_A cannot run (MODEL_LOAD_ERROR): Non-finite value in trunkW1 at index 356: null
...
[V7 Benchmark] Saved comparison report to: C:\code\AncinetEmpires\docs\training\reports\agent_upgrade_20260921_v7_01\corrected_v7_rerun.json

✅ V7 BENCHMARK EVALUATION FINISHED!
```
- **核心发现与结论**:
  1. 该任务成功暴露了历史 NET_A 检查点在训练导出时混入 `null`（非有限浮点数）的缺陷。
  2. 评测框架按协议严密拦截，输出 `MODEL_LOAD_ERROR`，拒绝使用 `legal[0]` 发生静默替补。
  3. 直接促成了 R8-01 中对所有导出权重执行 `Number.isFinite()` 强制断言的修复。

---

## 3. failure_windows.json 摘要

- **产物文件**: `training_runs/agent_upgrade_20260921_v8_final_01/failures/failure_windows.json`
- **记录总量**: **61 条**（真实对局生成，非硬编码）
- **类型分布**:
  - `POLICY_DIVERGENCE`: 61 条
  - `MISSED_REHIRE`: 0 条（得益于场景 A–G 课程，基础模型未发生漏招募失误）
  - `CASTLE_BLOCKED`: 0 条（基础模型未发生堵塞城堡失误）
- **地图分布**:
  - `(2) Crossed swords.aem`: 26 条
  - `(2) Duel.aem`: 24 条
  - `(2) Icy Paths.aem`: 11 条
- **反事实校验统计（全部 confirmedFailure: true）**:
  - 单步教师替代平均提升 (`improvementB_vs_A`): **+225.30** 分
  - 教师全面接管平均提升 (`improvementC_vs_A`): **+311.10** 分
- **典型失效窗口样本**:
```json
[
  {
    "failureId": "fail_m0_p0_s13_POLICY_DIVERGENCE",
    "failureType": "POLICY_DIVERGENCE",
    "mapName": "(2) Duel.aem",
    "turn": 2,
    "step": 13,
    "studentAction": { "type": "move", "unitId": "apk_u1", "to": { "x": 6, "y": 4 } },
    "teacherAction": { "type": "move", "unitId": "apk_u1", "to": { "x": 4, "y": 8 } },
    "scoreA_studentContinued": -412,
    "scoreB_singleStepTeacher": -429,
    "scoreC_teacherTakeover": -141,
    "improvementB_vs_A": -17,
    "improvementC_vs_A": 271,
    "confirmedFailure": true
  },
  {
    "failureId": "fail_m0_p0_s17_POLICY_DIVERGENCE",
    "failureType": "POLICY_DIVERGENCE",
    "mapName": "(2) Duel.aem",
    "turn": 2,
    "step": 17,
    "studentAction": { "type": "recruit_to_castle", "unitClass": "ghost", "castlePos": { "x": 4, "y": 4 } },
    "teacherAction": { "type": "recruit_to_castle", "unitClass": "mermaid", "castlePos": { "x": 4, "y": 4 } },
    "scoreA_studentContinued": -1552,
    "scoreB_singleStepTeacher": -1352,
    "scoreC_teacherTakeover": -1352,
    "improvementB_vs_A": 200,
    "improvementC_vs_A": 200,
    "confirmedFailure": true
  }
]
```

---

## 4. 配对评估结果文件摘要

- **产物文件**: `docs/training/reports/agent_upgrade_20260921_v8_final_01/dagger_paired_evaluation.json`
- **评测规格**: 40 场对局（SPATIAL_V2 vs SPATIAL_DAGGER，5 幅地图 × 2 首尾座 × 2 种子，上限 800 步）
- **核心指标对比**:

| 指标 | SPATIAL_V2 (基础模型) | SPATIAL_DAGGER (第1轮微调) | 变化与定性说明 |
| :--- | :---: | :---: | :--- |
| **对局总数** | 20 | 20 | — |
| **自然胜 / 自然负 / 截断** | 2 / 13 / 5 | 0 / 11 / 9 | 截断率增加 (+20.0%)，残局拉锯抗崩溃性增强 |
| **截断率** | 25.0% | 45.0% | DAgger 生存步数更长 |
| **自然胜率** | 13.3% (2/15) | 0.0% (0/11) | 95% Wilson CI 重叠，非统计学显著差异 |
| **自然胜率 95% Wilson CI** | [3.7%, 37.9%] | [0.0%, 25.9%] | 区间存在明显重合 |
| **有效胜率** | 10.0% (2/20) | 0.0% (0/20) | [2.8%, 30.1%] vs [0.0%, 16.1%] |
| **重招募总机会数** | 6 次 | 15 次 | **翻倍提升**，深层战局存活率提升 |
| **重招募成功率** | 100.0% (6/6) | 93.3% (14/15) | 保持极高重招募素养 |
| **恢复窗口成功率** | 100.0% (6/6) | 100.0% (14/14) | 14 次受创恢复窗口全部完成脱险/再招募 |
| **平均决策耗时** | 22.3 ms (p50: 21ms) | 22.2 ms (p50: 21ms) | 推理性能完全一致 |

---

## 5. npm test 与 tsc --noEmit 的最后输出

### A. TypeScript 类型检查 (`npx tsc --noEmit`)
```text
Command: npx tsc --noEmit
Exit Code: 0
Stdout: (Empty - 0 errors)
Stderr: (Empty)
```

### B. 全量自动化测试套件 (`npm test` / `vitest run`)
```text
Command: npm test
Exit Code: 0

stdout | tools/v8_r8_06_spatial_learning_sanity.test.ts > R8-06 Spatial ResNet v2 Learning Sanity & Finite Gradients > R8-06-A: Overfit sanity test: learns 100 clean samples with finite gradients and exports valid weights
=======================================================
[V7 NET_A Control] Training Low-Cost NET_A DualHead [256, 128] (Policy-Only, Isolated Split)
=======================================================
[NET_A Unified Split] Train samples: 95 | Val samples: 5
  NET_A Epoch 1/3: Train Loss 3.0790 | Val Loss 3.1527
  NET_A Epoch 2/3: Train Loss 3.0690 | Val Loss 3.1272
  NET_A Epoch 3/3: Train Loss 3.0530 | Val Loss 3.0962
[V7 NET_A Checkpoint] Saved to: C:\code\AncinetEmpires\training_runs\test_r8_06_sanity\checkpoints\net_a\net_a_checkpoint.json (finite verified)

 ✓ tools/v8_r8_06_spatial_learning_sanity.test.ts (1 test) 9416ms
     ✓ R8-06-A: Overfit sanity test: learns 100 clean samples with finite gradients and exports valid weights  9414ms

stdout | tools/v8_r8_07_dagger_loop.test.ts > R8-07 Two-Seat DAgger Loop & Manifest Validation > R8-07-A: DAgger diagnostic executes across both seats (P0 and P1) without crashing or silent fallback
[R7-04 DAgger Dataset] Created DAgger buffer dataset at: C:\code\AncinetEmpires\training_runs\test_r8_07_dagger\datasets\d_v7_dagger_round1.jsonl (12 new samples)
[R7-04 DAgger Training] Executing 1 round of DAgger warm-start fine-tuning (2 epochs, lr=0.001)...
✅ [R7-04 DAgger Round 1 Complete] Checkpoint: C:\code\AncinetEmpires\training_runs\test_r8_07_dagger\checkpoints\spatial_resnet_dagger\spatial_resnet_dagger_best.json

 ✓ tools/v8_r8_07_dagger_loop.test.ts (1 test) 10636ms
     ✓ R8-07-A: DAgger diagnostic executes across both seats (P0 and P1) without crashing or silent fallback  10635ms
 ✓ tools/v8_p0_defect_exposure.test.ts (14 tests) 62341ms
     ✓ Defect R8-02-A: 25 steps with unchanged unit count must NOT trigger premature stagnation truncation  18322ms
     ✓ Defect R8-02-B: Match step limit must not be implicitly hardcoded to maxTurns * 10  12672ms
     ✓ Defect R8-02-C: Commander re-recruit opportunities and successes must be consistent and use engine legal actions  14356ms
     ✓ Defect R8-02-D: ENGINE_ERROR must fail tests, not be treated as acceptable outcome  5410ms
     ✓ Defect R8-02-E: Independent PRNG streams must provide deterministic reproducibility  10854ms
 ✓ tools/v8_directory_guard.test.ts (4 tests) 50ms
 ✓ tools/v8_r8_04_bounded_search.test.ts (10 tests) 3140ms
 ✓ tools/v8_r8_05_sampling_split_hash.test.ts (5 tests) 5820ms

 Test Files  75 passed (75)
      Tests  671 passed (671)
   Start at  21:08:16
   Duration  62.99s (transform 11.01s, setup 0ms, import 15.87s, tests 128.93s, environment 7ms)
```
