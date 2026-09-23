# V10 fix_01 执行总结

生成时间：2026-09-23T03:10:44.812Z
Run ID：agent_upgrade_20260923_v10_fix_01

## 任务状态
- T1001: corrected analysis complete; large confirmation NOT_RUN
- T1002: complete (real split, replay, unique-state accounting)
- T1003: complete: no verified gain (honest)
- T1004: partial: DEV_20_MATCHES_PER_ARM
- T1005: complete: real 3-arm ablation (no winner declared)
- T1006: complete: value not qualified, downstream blocked
- T1007: NOT_RUN
- T1008: NOT_RUN

## 关键实测
- T10-01: pure newBest W/(W+L)=0% vs old=13.3%; S10=38.5% vs S00=41.2%.
- T10-02: episodes=454, natural=349, uniqueStates=79595, trainRoots=37, valIdRoots=17, valOodRoots=36, testRoots=100.
- T10-03: A/B/C natural W/(W+L)=0% / 0% / 0%; C consumed new=3980/3980.
- T10-05: Arm1/2/3 OOD=29.5% / 29.5% / 29.75%; Arm2 GAP implemented.
- T10-06: valueHeadQualified=false; Arm2 pearson=0.0556, MSE=0.8656.
- T10-07: NOT_RUN T10-03 has no positive natural-terminal gain (delta=0).; T10-06 value head is not qualified.

## 未完成/阻塞
- T10-01 large same-protocol confirmation NOT_RUN; only "no verified strength improvement" is claimed.
- T10-04 formal 80-match equal-work comparison remains partial; real fixtures + current smoke comparison only.
- T10-07/T10-08 blocked by conditional dependencies and P0 results, correctly NOT_RUN.

## 产物
- v10/fix_01/T10-01_confirmation.json
- v10/fix_01/T10-01_corrected_report.json
- v10/fix_01/T10-02_summary.json
- v10/fix_01/T10-03_extra_prepare.json
- v10/fix_01/T10-03_prepare.json
- v10/fix_01/T10-03_report_881states.json
- v10/fix_01/T10-04_formal_comparison.json
- v10/fix_01/T10-05_loss_ablation.json
- v10/fix_01/T10-05_loss_prepare.json
- v10/fix_01/T10-05_prepare.json
- v10/fix_01/T10-06_prepare.json
- v10/fix_01/T10-06_search_value_comparison.json
- v10/fix_01/TASKS_1_5_RESULTS.md
- v10/fix_01/V10_FIX_01_SUMMARY.md
- v10/fix_01/browser_e2e.json
- v10/fix_01/confirmation_results.json
- v10/fix_01/dagger_controlled_report.json
- v10/fix_01/dataset_v10_manifest.json
- v10/fix_01/expert_iteration_round1.json
- v10/fix_01/policy_value_ablation.json
- v10/fix_01/representation_ablation.json
- v10/fix_01/search_comparison.json
- v10/fix_01/split_v10.json
- v10/fix_01/tasks_1_5_status.json
- v10/fix_01/tasks_v10_fix_01.json
- v10/fix_01/turn_search_profile.json
- v10/fix_01/value_calibration.json
- v10/fix_01/value_gate.json