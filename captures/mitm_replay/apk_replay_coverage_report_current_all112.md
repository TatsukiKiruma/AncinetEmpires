# APK 回放覆盖率审计

- 扫描目录：`C:\code\AncinetEmpires\captures`
- 报告过滤：仅 APK 强制执行报告
- 目标唯一回放数：120
- game_get 文件数：125
- 唯一 SHA 数：112
- 重复文件数：13
- 已由全通过报告覆盖的唯一 SHA：112
- 未被全通过报告覆盖的唯一 SHA：0
- 距目标仍缺唯一回放：8

## 全通过报告

- `mitm_replay/_probe_forced_unique_tail.json`：passed=12, parsed=12, force=true
- `mitm_replay/20260704_122259/project_validation_report_forced_current.json`：passed=2, parsed=2, force=true
- `mitm_replay/20260704_125059/project_validation_report_forced_current.json`：passed=4, parsed=4, force=true
- `mitm_replay/20260704_131004/project_validation_report_065_078_097_forced_event_gate.json`：passed=3, parsed=3, force=true
- `mitm_replay/20260704_131004/project_validation_report_097_forced_after_2115_regression.json`：passed=1, parsed=1, force=true
- `mitm_replay/20260704_131004/project_validation_report_097_forced_after_revert_counter_snapshot.json`：passed=1, parsed=1, force=true
- `mitm_replay/20260704_131004/project_validation_report_chunk_000_019_forced.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_chunk_020_039_forced.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_chunk_040_059_forced.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_chunk_060_079_forced.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_chunk_080_099_forced.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_chunk_100_105_forced.json`：passed=6, parsed=6, force=true
- `mitm_replay/20260704_131004/project_validation_report_chunk_106_111_forced.json`：passed=6, parsed=6, force=true
- `mitm_replay/20260704_131004/project_validation_report_forced_offset_001_020.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_forced_offset_021_040.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_forced_offset_041_060.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_forced_offset_061_080.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_forced_offset_081_100.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_forced_offset_101_120.json`：passed=12, parsed=12, force=true
- `mitm_replay/20260704_131004/project_validation_report_forced_parallel_001_020.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_forced_parallel_021_040.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_forced_parallel_041_060.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_forced_parallel_061_080.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_forced_parallel_081_100.json`：passed=20, parsed=20, force=true
- `mitm_replay/20260704_131004/project_validation_report_forced_parallel_101_112.json`：passed=12, parsed=12, force=true
- `mitm_replay/20260704_131004/project_validation_report_offset_smoke.json`：passed=1, parsed=1, force=true
- `mitm_replay/agent_forced_001_020.json`：passed=20, parsed=20, force=true
- `mitm_replay/agent_forced_021_040.json`：passed=20, parsed=20, force=true
- `mitm_replay/agent_forced_041_060.json`：passed=20, parsed=20, force=true
- `mitm_replay/agent_forced_061_080_corrected.json`：passed=20, parsed=20, force=true
- `mitm_replay/agent_forced_081_100_corrected.json`：passed=20, parsed=20, force=true
- `mitm_replay/agent_forced_081_100.json`：passed=20, parsed=20, force=true
- `mitm_replay/forced_single_probe_001_20.json`：passed=1, parsed=1, force=true
- `mitm_replay/forced_unique_061_080_after_classification.json`：passed=20, parsed=20, force=true
- `mitm_replay/forced_unique_resume_after_cap_001_020.json`：passed=20, parsed=20, force=true
- `mitm_replay/forced_unique_resume_after_cap_021_040.json`：passed=20, parsed=20, force=true
- `mitm_replay/forced_unique_resume_after_exact_001_020.json`：passed=20, parsed=20, force=true
- `mitm_replay/forced_unique_resume_after_exact_021_040.json`：passed=20, parsed=20, force=true
- `mitm_replay/forced_unique_resume_after_exact_041_060.json`：passed=20, parsed=20, force=true
- `mitm_replay/forced_unique_resume_after_exact_061_080.json`：passed=20, parsed=20, force=true
- `mitm_replay/forced_unique_resume_after_exact_081_100.json`：passed=20, parsed=20, force=true
- `mitm_replay/forced_unique_resume_after_exact_101_120.json`：passed=12, parsed=12, force=true
- `mitm_replay/main_forced_101_120.json`：passed=12, parsed=12, force=true
- `mitm_replay/probe_single_001.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_002_100.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_002_1000.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_002_2000.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_002_4000.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_002_500.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_002_after_eof_fallback.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_002_after_exact_candidate.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_002_default_after_max_cap.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_003.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_004.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_005.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_044_after_eof_fallback.json`：passed=1, parsed=1, force=true
- `mitm_replay/probe_single_044_after_exact_candidate.json`：passed=1, parsed=1, force=true
- `mitm_replay/project_validation_report_forced_unique_061_080_after_strict_triage.json`：passed=20, parsed=20, force=true
- `mitm_replay/project_validation_report_forced_unique_081_100_after_strict_triage.json`：passed=20, parsed=20, force=true
- `mitm_replay/project_validation_report_forced_unique_101_120.json`：passed=12, parsed=12, force=true

## 重复 SHA

- `8917e542b931` count=5
  - `mitm_replay/_offline_122259/game_get_20260705_142823_001.bin`
  - `mitm_replay/_offline_batch_122259_escalated/game_get_20260705_143033_001.bin`
  - `mitm_replay/_offline_batch_122259/game_get_20260705_142902_001.bin`
  - `mitm_replay/20260704_122259/game_get_20260704_122310_001.bin`
  - `mitm_replay/20260704_131004/game_get_20260704_131113_005.bin`
- `a706d70a4e6e` count=5
  - `mitm_replay/_offline_122259/game_get_20260705_142823_002.bin`
  - `mitm_replay/_offline_batch_122259_escalated/game_get_20260705_143033_002.bin`
  - `mitm_replay/_offline_batch_122259/game_get_20260705_142902_002.bin`
  - `mitm_replay/20260704_122259/game_get_20260704_122329_002.bin`
  - `mitm_replay/20260704_131004/game_get_20260704_131130_008.bin`
- `bf67e73547fc` count=3
  - `mitm_replay/20260704_125059/game_get_20260704_125148_001.bin`
  - `mitm_replay/20260704_125059/game_get_20260704_125206_002.bin`
  - `mitm_replay/20260704_131004/game_get_20260704_131052_003.bin`
- `cfd8d0fadd57` count=2
  - `mitm_replay/20260704_125059/game_get_20260704_125247_003.bin`
  - `mitm_replay/20260704_131004/game_get_20260704_131256_021.bin`
- `544233d74082` count=2
  - `mitm_replay/20260704_125059/game_get_20260704_125313_004.bin`
  - `mitm_replay/20260704_131004/game_get_20260704_131421_039.bin`
- `81ca1179d3a4` count=2
  - `mitm_replay/20260704_125059/game_get_20260704_125336_005.bin`
  - `mitm_replay/20260704_131004/game_get_20260704_131634_059.bin`

## 未覆盖唯一回放

- 无
