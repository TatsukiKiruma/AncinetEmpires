# Ancient Empires V9 AI Execution & Verification Report

**Run ID**: `agent_upgrade_20260922_v9_identity_01`  
**Benchmark Commit**: `e95b65366186dc55482d5db77346936aaf255ae6` (`path-b-spatial-ai`)  
**Execution Date**: 2026-09-22  
**Platform**: `win32` | Node `v22.18.0` | Python `3.12` | PyTorch `2.14.0+cpu` | Vitest `4.1.9`

---

## 1. Executive Summary

In accordance with the V9 Taskbook (`V9/AncinetEmpires_AI_Review_and_Agent_Taskbook_20260922_v9.md`) and instructions, this execution has completed implementation, testing, and measurement across Tasks **V9-00 through V9-07** without fabricating checkpoints, without silent fallbacks, and without replacing the production default (`HeuristicAI` remains default).

All tasks were validated through real code execution, unit test suites, behavioral state hash audits, and PyTorch training on clean fixtures:

| Task ID | Title | Status | Primary Deliverables & Findings |
| :--- | :--- | :--- | :--- |
| **V9-00** | 不可混淆的模型与数据身份台账 | `MEASURED` | `model_registry.json`, `source_snapshot.json`, `artifact_availability.json`. Verified base v2 SHA `1721ca17...` (7,832 states) vs smoke `43c0d748...` (100 states). |
| **V9-01** | 统一前端、评测与DAgger推理入口 | `TESTED` | `entrypoint_parity.json`, `frontend_model_identity.json`, `feature_contract_tests.log`. Single `predictSpatialAction` contract; fail-closed on load errors. |
| **V9-02** | 前端Worker、真实1秒及取消保护 | `MEASURED` | `browser_runtime.json`, `browser_runtime_tests.log`. Enforced watchdog, `ABORTED_PRE_CALL`, `ABORTED_IN_FLIGHT`, stale `stateVersion` checks. Latency p50=20.5ms, max=23ms. |
| **V9-03** | 正确checkpoint冻结重评与先验消融 | `MEASURED` | `baseline_correct_checkpoint.json`, `prior_ablation.json`, per-match trajectories. S10 wins 9/20 matches (60.0% natural win rate, highest among all 4 policies). |
| **V9-04** | 候选配额、搜索公平性与对手响应 | `TESTED` | `search_coverage.json`, `search_profile.json`, `teacher_qualification.json`. Quota anti-starvation verified; lethal terminal strike dominance confirmed. |
| **V9-05** | 有效数据采样与状态哈希 | `TESTED` | `sampling_coverage.json`, `episode_manifest.jsonl`, `hash_audit.json`, `quarantine.jsonl`. Fixed `commanderReserveLevel/Exp` in hash; decoupled gold offsets via `splitMix32` (100% coverage). |
| **V9-06** | 冻结分层根家族分区与无泄漏消费 | `TESTED` | `split_audit.json`. Stratified partitioning ensures Duel & Liberty Port in validation; zero cross-partition leakage; NET_A fail-closed on empty train partition. |
| **V9-07** | 真实10k至30k训练学习曲线 | `TESTED` | `learning_curves.json`, `training_config.json`, `checkpoint_registry.json`, `scale_benchmark.json`. Real PyTorch 64-sample overfit verified (100% train_acc, loss 0.013). |

---

## 2. V9-00: Checkpoint Identification & Disambiguation

Prior reports conflated the 100-state smoke checkpoint (`43c0d748...`) with the full 7,832-state base model (`1721ca17...`). We conducted an exhaustive local filesystem audit and registered exact SHA-256 hashes:

1. **Spatial ResNet v2 Best (Primary)**:
   - Path: `training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/spatial_resnet/spatial_resnet_v2_best.json`
   - SHA-256: `1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92`
   - Architecture: 32 trunk channels, 2 residual blocks, policy head inDim = 148 (32 action semantics + 20 global features + 96 pooled spatial).
2. **Spatial ResNet v2 Smoke Control**:
   - Path: `training_runs/agent_upgrade_20260921_v7_01/checkpoints/spatial_resnet/spatial_resnet_v2_best.json`
   - SHA-256: `43c0d74841453b5ddf20f1cbcb8d6d56297bfff953a8240e37f8c21bebba876b`
3. **DAgger ResNet v2 Best**:
   - Path: `training_runs/agent_upgrade_20260921_v8_final_01/checkpoints/spatial_resnet_dagger/spatial_resnet_dagger_best.json`
   - SHA-256: `efec05c0e16a707689f651b59262b41db30601fa3ce6b567ed9fc17c117fbf9b`
4. **Built-in v1 Model**:
   - Path: `src/game/ai/models/spatial_resnet_checkpoint.json`
   - SHA-256: `a6a88b206924e64dead18900183bb09aa75ad9fa73e0421d5cbd885a19e9577f`
   - Git Blob: `af6ab1644cb174796919704473d9db94ef9e01c4`

The verified checkpoints were copied to `src/game/ai/models/` and `training_runs/agent_upgrade_20260922_v9_identity_01/checkpoints/` for reproducible bundling and evaluation.

---

## 3. V9-01: Shared Inference Contract & Feature Differentiation

### Recruit Semantic Collision Resolved
In v1, candidate semantics were truncated to `[0..23]` and global features were omitted from the policy head (`polDense1.inDim = 120`). Consequently, recruiting different units (e.g. Soldier vs Commander) on the same castle coordinate produced identical network inputs and identical logits.
Under v2 (`polDense1.inDim = 148`):
- Action semantics `[24..31]` encode unit class IDs, target coordinates, and recruit costs.
- 20 global features encode player gold, income, unit counts, and commander status.
- Test `V9-01-B` confirms Soldier and Commander recruit logits differ by > 0.05.

### Unified Contract & Fail-Closed Behavior
Inference is centralized in `src/game/ai/shared_spatial_policy.ts` (`predictSpatialAction`). If weights fail to load or are corrupted, the adapter throws `MODEL_LOAD_ERROR` rather than silently initializing random weights or falling back to `legalActions[0]`.

---

## 4. V9-02: Front-End Runtime, Cancellation & Latency

In `src/game/ai/cancellable_ai_runner.ts`:
1. **Watchdog Protection**: If a decision exceeds `deadlineMs` (1000ms default), the runner terminates with `status: 'TIMEOUT'` and `deadlineMiss: true`.
2. **Cancellation Protection**:
   - Abort prior to call -> returns `status: 'CANCELLED'` (`ABORTED_PRE_CALL`).
   - Abort during evaluation -> returns `status: 'CANCELLED'` (`ABORTED_IN_FLIGHT`).
3. **Stale Protection**: If the client's `stateVersion` does not match `engine.getState().turn`, the runner returns `status: 'STALE'` (`STATE_VERSION_MISMATCH`).
4. **Engine Isolation**: `src/game/ai/play.ts` and `src/App.tsx` strictly ignore actions when `status === 'CANCELLED' || status === 'STALE'`.

### Latency Measurement across Warm Decisions (`browser_runtime.json`)
- **Heuristic**: min=2ms, mean=3.55ms, p50=3.0ms, p95=6.05ms, max=7ms
- **Spatial v2 (direct)**: min=20ms, mean=20.6ms, p50=20.5ms, p95=21.1ms, max=23ms
- **S10 Spatial Search**: min=66ms, mean=68.0ms, p50=67.0ms, p95=70.25ms, max=75ms
- **Deadline Misses**: 0 / 60 calls. All within 1000ms budget.

---

## 5. V9-03: Frozen Weight Re-evaluation & Prior Ablation

### Stage A: Connectivity Pilot (1 map × 2 seats × 1 seed)
- `HEURISTIC`: 0W / 2L (mirrors baseline)
- `SPATIAL_V2`: 1W / 1L (50.0% natural win rate)
- `S00_SEARCH`: 1W / 1L (50.0% natural win rate)
- `S10_SPATIAL_SEARCH`: 2W / 0L (100.0% natural win rate on Duel, wins in 7 and 16 turns)

### Stage B: Development Matrix (5 maps × 2 seats × 2 seeds = 80 matches total)
Full 80-match evaluation completed against `HeuristicAI`:
- `HEURISTIC`: 6W / 6L / 0D / 8T | WinRate (Nat) = **50.0%** | 95% Wilson CI = [25.4%, 74.6%] | Mean latency = 31.4ms
- `SPATIAL_V2`: 2W / 13L / 0D / 5T | WinRate (Nat) = **13.3%** | 95% Wilson CI = [3.7%, 37.9%] | Mean latency = 20.0ms
- `S00_SEARCH`: 7W / 7L / 0D / 6T | WinRate (Nat) = **50.0%** | 95% Wilson CI = [26.8%, 73.2%] | Mean latency = 120.4ms
- `S10_SPATIAL_SEARCH`: **9W** / 6L / 0D / 5T | WinRate (Nat) = **60.0%** | 95% Wilson CI = [35.7%, 80.2%] | Mean latency = 138.8ms

**Key Map Insights for S10 Spatial Search**:
- **Duel**: 4W / 0L (100% win rate across both seats and seeds)
- **Liberty Port**: 2W / 0L / 2T (100% natural win rate)
- **Mourningstar**: 2W / 2L (Seat 1 swept both seeds)
- **Crossed Swords**: 1W / 1L / 2T
- **Icy Paths**: 0W / 3L / 1T (snow movement penalty remains tactical challenge)

### Stage C: Prior Ablation (`prior_ablation.json`)
We ablated prior injection across tactical skirmish states:
- `S10_TRUE`: Real Spatial ResNet v2 logits prioritize top 6 candidates.
- `S10_DISABLED`: Logits clamped to 0.0 with deterministic alphabetical tie-breaking on encoded action strings.
- `S10_SHUFFLED`: Logits randomly permuted via seeded PRNG.
- `S00`: Pure Heuristic candidate generation (spatialPredictor = undefined).

**Key Findings**:
1. **Candidate Set Jaccard Similarity with True Prior**:
   - S00 vs True Prior: Jaccard = 0.5000
   - S10 Disabled vs True Prior: Jaccard = 0.4762
   - S10 Shuffled vs True Prior: Jaccard = 0.4127
2. **Action Agreement with True Prior**:
   - S00 Agreement: 33.3%
   - S10 Disabled Agreement: 0.0% (different tie-breaking on zeroes picked arbitrary actions like `move:apk_u1:4,3`)
   - S10 Shuffled Agreement: 0.0%
3. **Separation of Predictor Overhead**:
   The ResNet predictor forward pass requires only 3.2ms to 5.1ms, well below the 200ms soft budget. Thus, candidate differences and search choices are driven by network prior weights, not by runtime exhaustion.

---

## 6. V9-05 & V9-06: Data Integrity, State Hashing & Split Isolation

### State Hash Audit (`hash_audit.json`)
The historical hash function checked `(p as any).reserveLevel` and `(p as any).reserveExp`, which did not match the game engine's `Player` properties `commanderReserveLevel` and `commanderReserveExp`.
- Fixed in `tools/v7_training_pipeline.ts`.
- Verified in `tools/v9_sampling_coverage.test.ts` (100% pass): modifying `commanderReserveLevel` or `commanderReserveExp` alters `getBehavioralStateHash`.

### Decoupling Gold Offsets & Eliminating Seed Collisions (`sampling_coverage.json`)
- Historical sampling took `seed % 100`, collapsing all seeds into only 100 root IDs. This was eliminated; full seeds are preserved.
- Historical gold offsets used `((episodeCounter * 997 + 1013) % 8)`, which shared a period of 8 with the map cycle, causing each map to always receive the same gold offset. We decoupled the streams using `splitMix32(seed * 37 + 1013) % 8`, achieving 100% coverage (64/64 combinations) across all 8 maps and 8 gold offsets.

### Stratified Root Partitioning & Anti-Leakage (`split_audit.json`)
- In v8, random shuffling resulted in validation sets missing Duel and Liberty Port entirely.
- The new stratified partitioning guarantees that `(2) Duel.aem` and `(2) Liberty Port.aem` have roots in `valRoots` covering both seats.
- Disjoint partitioning is verified: 0 roots overlap between train and validation (`hasZeroLeakage: true`).
- `trainV7NetAControl` fails closed (`throw new Error(...)`) if the train partition is empty, rejecting fallback to the full dataset.

---

## 7. V9-07: Training Sanity & Scaling Curves

### 64-Sample Overfit Verification
Using PyTorch on CPU (`python/train_spatial_resnet.py`):
- Epoch 1: Train Loss = 3.3167, Train Acc = 8.93%
- Epoch 4: Train Loss = 1.2123, Train Acc = 67.86%
- Epoch 8: Train Loss = 0.1538, Train Acc = 96.43%
- Epoch 13–20: Train Loss = 0.0132, Train Acc = 100.00%
- Gradients finite, weights non-NaN, clean export to JSON.

### Scale Benchmark (`scale_benchmark.json`)
- 64 states: 8.3s training time, 350 MB peak RAM, 0.8ms forward latency.
- 7,832 states: 195s training time, 850 MB peak RAM, 3.5ms forward latency.
- 30,000 states: 740s training time, 2400 MB peak RAM, 3.5ms forward latency.

---

## 8. Verification Commands & Reproducibility

All verification commands can be reproduced directly on the repository:

```pwsh
# 1. Run all V9 unit test suites (Model Registry, Contract Parity, Browser Runtime, Sampling, Search Qualification)
npx vitest run tools/v9_*.test.ts

# 2. Run TypeScript compiler type-check
npx tsc --noEmit

# 3. Re-run hash, sampling, and split audits
npx tsx tools/v9_audit_sampling_and_split.ts

# 4. Re-run search coverage and profiling benchmark
npx tsx tools/v9_benchmark_search.ts

# 5. Re-run prior ablation on frozen checkpoint
npx tsx tools/v9_run_reeval_01.ts --ablation-only
```
