# AncientEmpires AI v8 closure_02 corrected report

**Run id**: `agent_upgrade_20260921_v8_closure_02`
**Fact source (read-only)**: `agent_upgrade_20260921_v8_closure_01` → `docs/training/reports/agent_upgrade_20260921_v8_closure_01/v8_clean_benchmark.json`
**Fact source SHA-256**: `9d367317e10b89656d8b021e1b71ed6cd2bf308932a4b58de12e3576b7f293ff`
**Source benchmark run id / evaluated at**: `agent_upgrade_20260921_v8_closure_01` / `2026-09-21T14:52:14.646Z`
**Branch**: `path-b-spatial-ai`
**Review base commit**: `6e7b7e22d36597369e75a5f21f743bd2f5faab93`
**Generated at**: `2026-09-21T18:52:37.580Z` by `tools/v8_closure_report.ts`
**Default production policy**: `HeuristicAI` (unchanged)

> Every number in this document is machine generated from the benchmark JSON and the
> on-disk artifacts by `tools/v8_closure_report.ts`, and re-verified by
> `tools/v8_verify_report_consistency.ts`. Hand-transcribed values are not permitted, and
> `tools/v8_report_consistency.test.ts` fails when any quoted number disagrees with the facts.

---

## 1. Corrected fact base

### 1.1 Checkpoints (hashes recomputed from disk)

| Model identity | Path | SHA-256 (recomputed from disk) |
| :--- | :--- | :--- |
| **SPATIAL_V2** | `training_runs/agent_upgrade_20260921_v8_closure_02/checkpoints/spatial_resnet/spatial_resnet_v2_best.json` | `1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92` |
| **SPATIAL_DAGGER** | `training_runs/agent_upgrade_20260921_v8_closure_02/checkpoints/spatial_resnet_dagger/spatial_resnet_dagger_best.json` | `efec05c0e16a707689f651b59262b41db30601fa3ce6b567ed9fc17c117fbf9b` |
| **NET_A** | `training_runs/agent_upgrade_20260921_v8_closure_02/checkpoints/net_a/net_a_checkpoint.json` | `ededeb349a252d75c8dd66d40a29dcae8d0716669911285c39da870bebfc4edf` |

### 1.2 Match outcomes (source benchmark, read-only)

120 matches — 5 maps × 2 seats × 2 seeds (42, 1337) — maxTurns 45, maxAtomicSteps 800. 25168 candidate decisions in total.

| Policy | Description | Matches | Natural W | Natural L | Natural D | Truncations | Truncation rate | Natural win rate | Effective win rate | 95% Wilson CI (natural) | 95% Wilson CI (effective) | Engine/model errors + not-run |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- | :--- | ---: |
| **HEURISTIC** | HeuristicAI (production default / benchmark control) | 20 | 6 | 6 | 0 | 8 | 40.0% | 50.0% (6/12) | 30.0% | [25.4%, 74.6%] | [14.5%, 51.9%] | 0 |
| **SPATIAL_V2** | Spatial ResNet v2 (policy-only, no value head) | 20 | 2 | 13 | 0 | 5 | 25.0% | 13.3% (2/15) | 10.0% | [3.7%, 37.9%] | [2.8%, 30.1%] | 0 |
| **SPATIAL_DAGGER** | Spatial ResNet v2 + 1 round DAgger warm start | 20 | 0 | 11 | 0 | 9 | 45.0% | 0.0% (0/11) | 0.0% | [0.0%, 25.9%] | [0.0%, 16.1%] | 0 |
| **NET_A** | NET_A DualHead control (value_weight = 0) | 20 | 0 | 18 | 0 | 2 | 10.0% | 0.0% (0/18) | 0.0% | [0.0%, 17.6%] | [0.0%, 16.1%] | 0 |
| **S00_SEARCH** | S00 bounded adversarial search (HeuristicAI leaf evaluation) | 20 | 4 | 7 | 0 | 9 | 45.0% | 36.4% (4/11) | 20.0% | [15.2%, 64.6%] | [8.1%, 41.6%] | 0 |
| **S10_SPATIAL_SEARCH** | S10 bounded adversarial search (spatial prior candidate ordering) | 20 | 6 | 5 | 0 | 9 | 45.0% | 54.5% (6/11) | 30.0% | [28.0%, 78.7%] | [14.5%, 51.9%] | 0 |

`truncationRate = truncations / matchesPlayed`. The natural win rate denominator is
`naturalWins + naturalLosses`; the effective win rate denominator is every played match.
Both Wilson intervals come from `computeWilsonScoreInterval` in `tools/v7_unified_evaluation.ts`.

### 1.3 Decision latency and runtime fallback

| Policy | Decisions | p50 | p95 | p99 | max | Decisions > 1000ms | Deadline fallbacks | Fallback rate | Matches with any soft deadline breach |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **HEURISTIC** | 5657 | 13.8ms | 154.6ms | 303.5ms | 526.4ms | 0 | 0 | 0.00% | 0/20 |
| **SPATIAL_V2** | 2489 | 20.2ms | 22.0ms | 23.8ms | 34.6ms | 0 | 0 | 0.00% | 0/20 |
| **SPATIAL_DAGGER** | 2379 | 20.6ms | 25.8ms | 31.8ms | 36.6ms | 0 | 0 | 0.00% | 0/20 |
| **NET_A** | 1476 | 0.9ms | 3.1ms | 4.4ms | 6.2ms | 0 | 0 | 0.00% | 0/20 |
| **S00_SEARCH** | 6576 | 163.9ms | 351.7ms | 487.4ms | 634.8ms | 0 | 2040 | 31.02% | 20/20 |
| **S10_SPATIAL_SEARCH** | 6591 | 171.5ms | 264.4ms | 364.3ms | 614.1ms | 0 | 1910 | 28.98% | 20/20 |

Percentiles use the interpolating `computePercentile` helper, not a floor index.
`deadlineFallbackCount` counts decisions where bounded search returned the HeuristicAI top
action without evaluating any candidate. "Matches with any soft deadline breach" is the number
of matches whose `wallClockExceededCount > 0` — it is not a count of >1000ms decisions.

### 1.4 Dataset and training-data facts

Dataset: `training_runs/agent_upgrade_20260921_v8_final_01/datasets/d_v7_spatial.jsonl`

- Dataset SHA-256 (recomputed): `fd6b0b12b9f80697dbc2b666d79dafc84529e433bea8745f1e3a906b5dfcf5dd`
- Dataset rows (streamed): **7,832**
- Split manifest: `training_runs/agent_upgrade_20260921_v8_closure_02/split_manifest.json` (SHA-256 `ea1cbfb2c9afe2d65d2652e276e2178d4e120c4d910fbcf843197e73c698f688`)
- Consumed-sample manifest: `training_runs/agent_upgrade_20260921_v8_closure_02/checkpoints/spatial_resnet/consumed_samples_manifest.json` (SHA-256 `bdea68523990f92db69473bfa0471dfd684c7b4435725267f109353aa4c7bc2c`)
- Train / val samples: **6,528 / 1,304**
- Train ∩ val sample-id intersection: **0**
- Dataset rows whose sampleId appears in the consumed manifest: **7,832**
- Root families: 93 (80 train / 13 val)
- `valueTarget === null`: **7,832** of 7,832 rows; non-null: **0**
- Duplicate states filtered during generation: 11,216; quarantined: 0

#### Phase distribution
| Phase (`scenarioGroup`) | Samples | Share |
| :--- | ---: | ---: |
| `SKIRMISH_MIDGAME` | 3,092 | 39.5% |
| `SKIRMISH_ENGAGEMENT` | 2,063 | 26.3% |
| `SKIRMISH_OPENING` | 1,028 | 13.1% |
| `SKIRMISH_COMMANDER_RECOVERY` | 817 | 10.4% |
| `CURRICULUM_REHIRE` | 280 | 3.6% |
| `CURRICULUM_UNBLOCK` | 140 | 1.8% |
| `CURRICULUM_PENDING` | 126 | 1.6% |
| `CURRICULUM_INFLATION` | 84 | 1.1% |
| `CURRICULUM_DEFENSE` | 80 | 1.0% |
| `CURRICULUM_NATURAL_WIN` | 80 | 1.0% |
| `CURRICULUM_SAVING` | 42 | 0.5% |

#### Curriculum sub-scenarios
| Scenario | Samples |
| :--- | ---: |
| A_rehire | 280 |
| B_saving | 42 |
| C_unblock | 140 |
| D_inflation | 84 |
| E_pending | 126 |
| F_defense | 80 |
| G_victory | 80 |

### 1.5 Stage 3+ scale status

**30k scale: `BLOCKED/NOT_RUN`.** The 30,000-state scale run stays BLOCKED/NOT_RUN: it may only start once report consistency, the bounded-search runtime fallback gate, a genuine overfit sanity check, the terminal value label scheme, and the teacher qualification gate are all satisfied.

---

## 2. Corrections against closure_01

The closure_01 `task-status.json` and `v8_closure_audit_report.md` §2.3/§2.4/§6 contain
figures that contradict the closure_01 benchmark JSON in the same directory. The legacy
quotations below are reproduced only so the correction is auditable;
`tools/v8_report_consistency.test.ts` asserts that they are confined to this marked region.

<!-- legacy-claims-allowed:start -->

**Legacy (incorrect) S00 claim** — closure_01 `task-status.json` `overallVerdict.s00HardBotStatus`:
`10W-8L-2T`, natural win rate `55.6%`, 95% Wilson CI `[33.7%, 75.4%]`, and S00 labelled an
"offline Hard Bot". The same numbers appear in `v8_closure_audit_report.md` §2.3.

**Legacy (incorrect) S10 claim** — closure_01 `task-status.json` `overallVerdict.s10Status` and
`v8_closure_audit_report.md` §2.4: `1W-11L-8T` with effective win rate `5.0%`.

These legacy figures are `v8_final_01`-era numbers carried into a `v8_closure_01` report.
The closure_01 benchmark JSON in the same directory does not reproduce them, and this cycle
re-derives every number from that JSON instead of copying the narrative forward.

<!-- legacy-claims-allowed:end -->

### 2.1 Corrected S00_SEARCH statement

S00_SEARCH scored 4-7-9 (natural wins-losses-truncations) over 20 matches. Natural win rate 36.4% (4/11), effective win rate 20.0%, 95% Wilson CI [15.2%, 64.6%]. S00_SEARCH is NOT a Hard Bot and is NOT QUALIFIED for deployment.

S00_SEARCH fell back to the HeuristicAI top action on 2040 of 6576 decisions (31.02%), far above the 10% gate.

S00_SEARCH is a bounded adversarial search policy. It is **not** a Hard Bot, it is **not**
superior to HeuristicAI on this evidence, and it is **not** qualified for deployment.

### 2.2 Corrected S10_SPATIAL_SEARCH statement

S10_SPATIAL_SEARCH scored 6-5-9 over 20 matches. Natural win rate 54.5% (6/11), effective win rate 30.0%, 95% Wilson CI [28.0%, 78.7%]. S10_SPATIAL_SEARCH is NOT QUALIFIED for deployment.

S10_SPATIAL_SEARCH fell back to the HeuristicAI top action on 1910 of 6591 decisions (28.98%), far above the 10% gate.

### 2.3 Root cause of the legacy error

The closure_01 narrative was written from an earlier (`v8_final_01`) benchmark and never
reconciled with the freshly written `v8_clean_benchmark.json`. The latency table in the legacy
audit report also used a floor-index percentile instead of the interpolating
`computePercentile`, which is why its p95/p99 values differ in the last digit from the
machine-computed aggregates. The upgraded verifier now fails on both classes of error.

---

## 3. Task C: Runtime fallback re-measurement (closure_02)

Source: `docs/training/reports/agent_upgrade_20260921_v8_closure_02/runtime_fallback_analysis.json` (SHA-256 `c124123b8e5e767596817f18c441cde944813983dd943339059b2011286ddfab`, run `agent_upgrade_20260921_v8_closure_02`).

Gate thresholds: hard fallback rate < 10%, hard fallbacks per match < 50, p99 < 1000ms, max < 1000ms, average candidates evaluated per decision >= 1.

| Policy | Decisions | Hard fallbacks | Hard fallback rate | Hard fallbacks / match | Soft deadline decisions | Soft deadline rate | Avg candidates evaluated | Avg shallow evaluations | p99 | max | Gate |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| **HEURISTIC** | 5657 | 0 | 0.00% | 0.00 | 0 | 0.00% | 0.000 | 0.000 | 346.7ms | 599.7ms | PASS |
| **S00_SEARCH** | 4989 | 0 | 0.00% | 0.00 | 2202 | 44.14% | 2.962 | 0.021 | 339.0ms | 405.2ms | PASS |
| **S10_SPATIAL_SEARCH** | 7768 | 0 | 0.00% | 0.00 | 3800 | 48.92% | 2.842 | 0.022 | 323.6ms | 438.2ms | PASS |

**Overall runtime fallback gate: PASS.**

Every bounded-search policy in the re-measured run keeps the hard fallback rate below the 10% gate while holding p99 and max below 1000ms. The refactor made the soft budget stop expansion while still forcing at least one real candidate evaluation, so the emergency heuristic fallback path is now reached only on a genuine hard-ceiling breach.

### Root-cause profile of the pre-refactor fallback

Replayed read-only from `training_runs/agent_upgrade_20260921_v8_closure_01/trajectories/match_S00_SEARCH_seat0__2__Crossed_swords_aem_s1337.json` (map `(2) Crossed swords.aem`, candidate seat 0) with the
post-refactor budget `{"maxMs":200,"maxNodes":20,"hardMaxMs":900}`. Profile artifact: `docs/training/reports/agent_upgrade_20260921_v8_closure_02/search_stage_profile.json`
(SHA-256 `28861307ce44d60829104b8ec6c38f2dff6795a2f7cc848f9ee5d31cbd590cf4`).

| Step | Turn | Legal actions | HeuristicAI full scoring | Legacy fixed overhead (getAction + filter) | New fixed overhead (one scoring pass + filter) | Leaf evaluation | Full bounded search | Candidates evaluated | Shallow evaluations | Hard fallbacks | Soft deadline |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| 40 | 3 | 3 | 1.40ms | 23.85ms | 21.34ms | 0.21ms | 61.80ms | 3 | 0 | 0 | no |
| 120 | 6 | 103 | 73.81ms | 167.85ms | 93.15ms | 0.21ms | 234.96ms | 1 | 0 | 0 | yes |
| 160 | 7 | 34 | 35.88ms | 80.79ms | 50.47ms | 0.21ms | 214.14ms | 4 | 0 | 0 | yes |
| 280 | 11 | 15 | 15.44ms | 61.72ms | 44.86ms | 0.21ms | 133.85ms | 5 | 0 | 0 | no |
| 360 | 14 | 6 | 3.83ms | 29.00ms | 27.06ms | 0.39ms | 220.95ms | 4 | 0 | 0 | yes |
| 600 | 20 | 4 | 7.09ms | 31.96ms | 26.61ms | 0.24ms | 361.57ms | 1 | 0 | 0 | yes |

`Legacy fixed overhead` measures the two calls the pre-refactor decision path always made before
the first candidate could be evaluated: a standalone `HeuristicAI.getAction()` for the fallback top
action, plus `getFilteredCandidateActions()`, which performed its own full `HeuristicAI` scoring
pass. `New fixed overhead` measures the post-refactor path: a single scoring pass whose result is
reused by the candidate filter. On these states the legacy fixed overhead reaches 167.85ms against
a 200ms soft budget, leaving almost nothing for the candidate loop; that is consistent with the
measured closure_01 outcome, where the heuristic top action was returned on 31.02% / 28.98% of
decisions. After the refactor the same states evaluate real candidates and the heuristic fallback
is reserved for a genuine hard-ceiling breach. The profile is a single recorded trajectory, so it
explains the mechanism rather than proving the population-wide share.

---

## 4. R8-07 round 2 DAgger evidence

A second DAgger round was executed against the clean closure SPATIAL_V2 checkpoint. Machine summary:
`docs/training/reports/agent_upgrade_20260921_v8_closure_02/dagger_round2_summary.json` (SHA-256 `ff807ab9a11e77131f322955fbc357aeac14b940aecd6b593ae2720f70a2d010`).

| Property | Value |
| :--- | :--- |
| Student checkpoint (warm start) | `1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92` |
| Round 2 DAgger checkpoint | `cb96e2028c27dda5267bca54ad4bc4394553351351fd516e08bcb60e91d857a5` |
| Distinct checkpoint hashes | yes |
| Verified failure windows | 40 (POLICY_DIVERGENCE=40) |
| Base dataset rows (read-only, streamed) | 7832 |
| DAgger buffer rows | 7872 (+40 new) |
| New DAgger root families | 2 |
| Paired pre/post matches | 40 |
| Paired report | `docs/training/reports/agent_upgrade_20260921_v8_closure_02/dagger_round2_paired_evaluation.json` (SHA-256 `04ca025f259c124796020dbaeb1acd93044de9a8c1a2a8b2861b8e2a3918cc47`) |
| Warm-start interpreter | `py -3.12` (torch 2.14.0+cpu) |

### Paired pre/post aggregates

| Policy | Matches | Natural W | Natural L | Natural D | Truncations | Truncation rate | Natural W% | Effective W% | 95% CI (natural) | p99 | max | >1000ms | Rehire | Recovery windows |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- | ---: | ---: | ---: | ---: | ---: |
| **SPATIAL_V2** | 20 | 2 | 13 | 0 | 5 | 25.0% | 13.3% | 10.0% | [3.7%, 37.9%] | 32.1ms | 36.3ms | 0 | 6/6 | 6 |
| **SPATIAL_DAGGER** | 20 | 0 | 16 | 0 | 4 | 20.0% | 0.0% | 0.0% | [0.0%, 19.4%] | 33.0ms | 35.7ms | 0 | 13/17 | 13 |

The CI column is the 95% Wilson score interval produced by `computeWilsonScoreInterval`.

### Correction-signal quality

All 40 failure windows are POLICY_DIVERGENCE: each was confirmed only by the 3-way counterfactual replay (scoreB > scoreA or scoreC > scoreA). No structural blunder class (MISSED_REHIRE, CASTLE_BLOCKED, SUICIDE_ATTACK, TACTICAL_DEFENSE_BLUNDER) was detected. A divergence-only correction set is a weaker signal than a mixed failure set: it shows the student deviates from the teacher on states the teacher's one-step/rollout value favours, but it does not by itself prove the student committed a tactical error. It is therefore reported as a divergence-correction set, not as verified blunder repair.

```json
{
  "nonZeroCorrections": true,
  "distinctShas": true,
  "datasetGrew": true,
  "addedRootFamilies": true,
  "pairedReportComplete": true,
  "verdict": "Correction signal is divergence-only. Each window is confirmed by counterfactual replay, but no structural blunder class fired, so this round demonstrates behaviour change and label coverage rather than proven tactical blunder repair."
}
```

Round 2 therefore demonstrates a **non-zero, reproducible correction signal with a distinct student
checkpoint and a complete paired pre/post report**, but it does **not** demonstrate improved playing
strength. `SPATIAL_DAGGER` remains `NOT_QUALIFIED` for deployment, and `HeuristicAI` remains the
production default.

---

## 5. Qualification and deployment verdict

A challenger policy is `QUALIFIED` for promotion only when it has zero harness errors, zero
decisions above 1000ms, `p99 < 1000ms`, `max < 1000ms`, a lower 95% Wilson bound on the natural
win rate strictly above 50%, and (for bounded-search policies) a hard fallback rate below 10%.

| Policy | Role | Promotion verdict | Runtime gate | Reasons |
| :--- | :--- | :--- | :--- | :--- |
| **HEURISTIC** | INCUMBENT_DEFAULT | NOT_QUALIFIED | N/A | Not a challenger: HeuristicAI is the incumbent production default and therefore the control baseline. Natural win rate 50% over 12 decided matches has 95% Wilson CI [25.4%, 74.6%], whose lower bound does not exceed 50%. |
| **SPATIAL_V2** | CHALLENGER | NOT_QUALIFIED | N/A | Natural win rate 13.3% over 15 decided matches has 95% Wilson CI [3.7%, 37.9%], whose lower bound does not exceed 50%. |
| **SPATIAL_DAGGER** | CHALLENGER | NOT_QUALIFIED | N/A | Natural win rate 0% over 11 decided matches has 95% Wilson CI [0%, 25.9%], whose lower bound does not exceed 50%. |
| **NET_A** | CONTROL | NOT_QUALIFIED | N/A | Not a challenger: NET_A is retained only as the DualHead control arm. Natural win rate 0% over 18 decided matches has 95% Wilson CI [0%, 17.6%], whose lower bound does not exceed 50%. |
| **S00_SEARCH** | CHALLENGER | NOT_QUALIFIED | FAIL | Natural win rate 36.4% over 11 decided matches has 95% Wilson CI [15.2%, 64.6%], whose lower bound does not exceed 50%. Runtime fallback gate failed: 2040/6576 decisions (31.02%) fell back to the HeuristicAI top action without evaluating a candidate. |
| **S10_SPATIAL_SEARCH** | CHALLENGER | NOT_QUALIFIED | FAIL | Natural win rate 54.5% over 11 decided matches has 95% Wilson CI [28%, 78.7%], whose lower bound does not exceed 50%. Runtime fallback gate failed: 1910/6591 decisions (28.98%) fell back to the HeuristicAI top action without evaluating a candidate. |

**Default production policy remains `HeuristicAI`.** No challenger policy is
deployed, and no default strategy or game rule was modified in this cycle.

---

## 6. Stage 1–4 roadmap and Stage 1 design

The full Stage 1 design (natural-terminal outcome collection, `z ∈ {+1, -1, 0}` value targets
with a `valueTarget: null` truncation mask, phase stratification, the 30k split manifest and
consumption-record contract, and the acceptance gates) lives in
`stage1_training_design.md` in this directory.

| Stage | Objective | Entry gate | Exit gate |
| :--- | :--- | :--- | :--- |
| 1 | Natural-terminal value supervision | Report consistency + runtime fallback gates pass; genuine overfit sanity check retained | ≥30,000 unique states with non-null `z` on natural terminals and explicit `null` mask on truncations; train/val isolated by `rootFamilyId`; recorded consumed sample ids |
| 2 | Policy + value dual-head training (`value_weight ≈ 0.5`) | Stage 1 dataset accepted | Value MSE / calibration / policy top-1 / natural-terminal win rate all reported; no regression on the closure gates |
| 3 | Teacher qualification + multi-round DAgger | A teacher policy beats HeuristicAI significantly over ≥100 matches with a qualified runtime gate | Each DAgger round shows non-zero verified corrections, a distinct student checkpoint, and a paired pre/post report |
| 4 | Scale and ablation study (10k → 30k → 100k; 2 vs 4 blocks; value on/off; search distillation) | Stage 2–3 gates pass | Ablations reproduced with machine-generated reports; MCTS / AlphaZero-style self-play considered only after Stage 4 |

### 6.1 Current fact base for Stage 1 planning

- Unique verified states available now: **7,832** (6,528 train / 1,304 val).
- Curriculum samples: A_rehire 280, B_saving 42, C_unblock 140, D_inflation 84, E_pending 126, F_defense 80, G_victory 80.
- `valueTarget` is `null` for **7,832** of 7,832 rows — no terminal value supervision exists yet.
- 30k target: `BLOCKED/NOT_RUN`.

---

## 7. Reproduction

```text
# regenerate the corrected report from the read-only fact source
node --loader <ts-loader> tools/v8_closure_report.ts \
  --report-run-id agent_upgrade_20260921_v8_closure_02 --source-run-id agent_upgrade_20260921_v8_closure_01

# re-verify every number against the benchmark JSON
node --loader <ts-loader> tools/v8_verify_report_consistency.ts \
  --report-run-id agent_upgrade_20260921_v8_closure_02 --source-run-id agent_upgrade_20260921_v8_closure_01

# re-measure the runtime fallback gate
node --loader <ts-loader> tools/v8_runtime_fallback_benchmark.ts
```

---

## Appendix A: embedded machine facts

The block below is the exact object written to `v8_closure_facts.json`. The verifier parses it
and re-derives every value from the benchmark JSON before accepting this report.

<!-- MACHINE_FACTS_BEGIN -->

```json
{
  "factsVersion": 1,
  "generator": "tools/v8_closure_report.ts",
  "generatedAt": "2026-09-21T18:52:37.580Z",
  "reportRunId": "agent_upgrade_20260921_v8_closure_02",
  "sourceRunId": "agent_upgrade_20260921_v8_closure_01",
  "branch": "path-b-spatial-ai",
  "reviewBaseCommit": "6e7b7e22d36597369e75a5f21f743bd2f5faab93",
  "sourceBenchmark": {
    "path": "docs/training/reports/agent_upgrade_20260921_v8_closure_01/v8_clean_benchmark.json",
    "sha256": "9d367317e10b89656d8b021e1b71ed6cd2bf308932a4b58de12e3576b7f293ff",
    "runId": "agent_upgrade_20260921_v8_closure_01",
    "evaluatedAt": "2026-09-21T14:52:14.646Z",
    "maps": [
      "(2) Duel.aem",
      "(2) Crossed swords.aem",
      "(2) Icy Paths.aem",
      "(2) Liberty Port.aem",
      "(2) Mourningstar.aem"
    ],
    "seeds": [
      42,
      1337
    ],
    "maxTurns": 45,
    "maxAtomicSteps": 800,
    "totalMatches": 120,
    "totalDecisions": 25168
  },
  "checkpoints": [
    {
      "identity": "SPATIAL_V2",
      "path": "training_runs/agent_upgrade_20260921_v8_closure_02/checkpoints/spatial_resnet/spatial_resnet_v2_best.json",
      "sha256": "1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92"
    },
    {
      "identity": "SPATIAL_DAGGER",
      "path": "training_runs/agent_upgrade_20260921_v8_closure_02/checkpoints/spatial_resnet_dagger/spatial_resnet_dagger_best.json",
      "sha256": "efec05c0e16a707689f651b59262b41db30601fa3ce6b567ed9fc17c117fbf9b"
    },
    {
      "identity": "NET_A",
      "path": "training_runs/agent_upgrade_20260921_v8_closure_02/checkpoints/net_a/net_a_checkpoint.json",
      "sha256": "ededeb349a252d75c8dd66d40a29dcae8d0716669911285c39da870bebfc4edf"
    }
  ],
  "policies": [
    {
      "policy": "HEURISTIC",
      "label": "HeuristicAI (production default / benchmark control)",
      "matchesPlayed": 20,
      "naturalWins": 6,
      "naturalLosses": 6,
      "naturalDraws": 0,
      "truncations": 8,
      "winLossTruncation": "6-6-8",
      "truncationRatePct": 40,
      "winRateNaturalOnlyPct": 50,
      "effectiveWinRatePct": 30,
      "winRateNaturalOnlyNumerator": 6,
      "winRateNaturalOnlyDenominator": 12,
      "confidenceInterval95Natural": [
        25.4,
        74.6
      ],
      "confidenceInterval95Effective": [
        14.5,
        51.9
      ],
      "engineErrors": 0,
      "modelLoadErrors": 0,
      "notRuns": 0,
      "decisionCount": 5657,
      "latencyP50": 13.8,
      "latencyP95": 154.6,
      "latencyP99": 303.5,
      "latencyMax": 526.4,
      "latenciesOver1000ms": 0,
      "deadlineFallbackCount": 0,
      "deadlineFallbackRatePct": 0,
      "wallClockExceededMatches": 0,
      "totalRehireOpportunities": 47,
      "totalRehireSuccesses": 31,
      "rehireSuccessRatePct": 66,
      "totalRecoveryWindows": 38,
      "totalRecoverySuccesses": 31,
      "recoveryWindowSuccessRatePct": 81.6,
      "candidateSearchApplicable": false,
      "qualification": {
        "role": "INCUMBENT_DEFAULT",
        "promotionEligible": false,
        "promotionQualified": false,
        "runtimeGateApplicable": false,
        "runtimeGateQualified": true,
        "reasons": [
          "Not a challenger: HeuristicAI is the incumbent production default and therefore the control baseline.",
          "Natural win rate 50% over 12 decided matches has 95% Wilson CI [25.4%, 74.6%], whose lower bound does not exceed 50%."
        ]
      }
    },
    {
      "policy": "SPATIAL_V2",
      "label": "Spatial ResNet v2 (policy-only, no value head)",
      "matchesPlayed": 20,
      "naturalWins": 2,
      "naturalLosses": 13,
      "naturalDraws": 0,
      "truncations": 5,
      "winLossTruncation": "2-13-5",
      "truncationRatePct": 25,
      "winRateNaturalOnlyPct": 13.3,
      "effectiveWinRatePct": 10,
      "winRateNaturalOnlyNumerator": 2,
      "winRateNaturalOnlyDenominator": 15,
      "confidenceInterval95Natural": [
        3.7,
        37.9
      ],
      "confidenceInterval95Effective": [
        2.8,
        30.1
      ],
      "engineErrors": 0,
      "modelLoadErrors": 0,
      "notRuns": 0,
      "decisionCount": 2489,
      "latencyP50": 20.2,
      "latencyP95": 22,
      "latencyP99": 23.8,
      "latencyMax": 34.6,
      "latenciesOver1000ms": 0,
      "deadlineFallbackCount": 0,
      "deadlineFallbackRatePct": 0,
      "wallClockExceededMatches": 0,
      "totalRehireOpportunities": 6,
      "totalRehireSuccesses": 6,
      "rehireSuccessRatePct": 100,
      "totalRecoveryWindows": 6,
      "totalRecoverySuccesses": 6,
      "recoveryWindowSuccessRatePct": 100,
      "candidateSearchApplicable": false,
      "qualification": {
        "role": "CHALLENGER",
        "promotionEligible": true,
        "promotionQualified": false,
        "runtimeGateApplicable": false,
        "runtimeGateQualified": true,
        "reasons": [
          "Natural win rate 13.3% over 15 decided matches has 95% Wilson CI [3.7%, 37.9%], whose lower bound does not exceed 50%."
        ]
      }
    },
    {
      "policy": "SPATIAL_DAGGER",
      "label": "Spatial ResNet v2 + 1 round DAgger warm start",
      "matchesPlayed": 20,
      "naturalWins": 0,
      "naturalLosses": 11,
      "naturalDraws": 0,
      "truncations": 9,
      "winLossTruncation": "0-11-9",
      "truncationRatePct": 45,
      "winRateNaturalOnlyPct": 0,
      "effectiveWinRatePct": 0,
      "winRateNaturalOnlyNumerator": 0,
      "winRateNaturalOnlyDenominator": 11,
      "confidenceInterval95Natural": [
        0,
        25.9
      ],
      "confidenceInterval95Effective": [
        0,
        16.1
      ],
      "engineErrors": 0,
      "modelLoadErrors": 0,
      "notRuns": 0,
      "decisionCount": 2379,
      "latencyP50": 20.6,
      "latencyP95": 25.8,
      "latencyP99": 31.8,
      "latencyMax": 36.6,
      "latenciesOver1000ms": 0,
      "deadlineFallbackCount": 0,
      "deadlineFallbackRatePct": 0,
      "wallClockExceededMatches": 0,
      "totalRehireOpportunities": 15,
      "totalRehireSuccesses": 14,
      "rehireSuccessRatePct": 93.3,
      "totalRecoveryWindows": 14,
      "totalRecoverySuccesses": 14,
      "recoveryWindowSuccessRatePct": 100,
      "candidateSearchApplicable": false,
      "qualification": {
        "role": "CHALLENGER",
        "promotionEligible": true,
        "promotionQualified": false,
        "runtimeGateApplicable": false,
        "runtimeGateQualified": true,
        "reasons": [
          "Natural win rate 0% over 11 decided matches has 95% Wilson CI [0%, 25.9%], whose lower bound does not exceed 50%."
        ]
      }
    },
    {
      "policy": "NET_A",
      "label": "NET_A DualHead control (value_weight = 0)",
      "matchesPlayed": 20,
      "naturalWins": 0,
      "naturalLosses": 18,
      "naturalDraws": 0,
      "truncations": 2,
      "winLossTruncation": "0-18-2",
      "truncationRatePct": 10,
      "winRateNaturalOnlyPct": 0,
      "effectiveWinRatePct": 0,
      "winRateNaturalOnlyNumerator": 0,
      "winRateNaturalOnlyDenominator": 18,
      "confidenceInterval95Natural": [
        0,
        17.6
      ],
      "confidenceInterval95Effective": [
        0,
        16.1
      ],
      "engineErrors": 0,
      "modelLoadErrors": 0,
      "notRuns": 0,
      "decisionCount": 1476,
      "latencyP50": 0.9,
      "latencyP95": 3.1,
      "latencyP99": 4.4,
      "latencyMax": 6.2,
      "latenciesOver1000ms": 0,
      "deadlineFallbackCount": 0,
      "deadlineFallbackRatePct": 0,
      "wallClockExceededMatches": 0,
      "totalRehireOpportunities": 17,
      "totalRehireSuccesses": 3,
      "rehireSuccessRatePct": 17.6,
      "totalRecoveryWindows": 8,
      "totalRecoverySuccesses": 3,
      "recoveryWindowSuccessRatePct": 37.5,
      "candidateSearchApplicable": false,
      "qualification": {
        "role": "CONTROL",
        "promotionEligible": false,
        "promotionQualified": false,
        "runtimeGateApplicable": false,
        "runtimeGateQualified": true,
        "reasons": [
          "Not a challenger: NET_A is retained only as the DualHead control arm.",
          "Natural win rate 0% over 18 decided matches has 95% Wilson CI [0%, 17.6%], whose lower bound does not exceed 50%."
        ]
      }
    },
    {
      "policy": "S00_SEARCH",
      "label": "S00 bounded adversarial search (HeuristicAI leaf evaluation)",
      "matchesPlayed": 20,
      "naturalWins": 4,
      "naturalLosses": 7,
      "naturalDraws": 0,
      "truncations": 9,
      "winLossTruncation": "4-7-9",
      "truncationRatePct": 45,
      "winRateNaturalOnlyPct": 36.4,
      "effectiveWinRatePct": 20,
      "winRateNaturalOnlyNumerator": 4,
      "winRateNaturalOnlyDenominator": 11,
      "confidenceInterval95Natural": [
        15.2,
        64.6
      ],
      "confidenceInterval95Effective": [
        8.1,
        41.6
      ],
      "engineErrors": 0,
      "modelLoadErrors": 0,
      "notRuns": 0,
      "decisionCount": 6576,
      "latencyP50": 163.9,
      "latencyP95": 351.7,
      "latencyP99": 487.4,
      "latencyMax": 634.8,
      "latenciesOver1000ms": 0,
      "deadlineFallbackCount": 2040,
      "deadlineFallbackRatePct": 31.02,
      "wallClockExceededMatches": 20,
      "totalRehireOpportunities": 20,
      "totalRehireSuccesses": 16,
      "rehireSuccessRatePct": 80,
      "totalRecoveryWindows": 16,
      "totalRecoverySuccesses": 16,
      "recoveryWindowSuccessRatePct": 100,
      "candidateSearchApplicable": true,
      "qualification": {
        "role": "CHALLENGER",
        "promotionEligible": true,
        "promotionQualified": false,
        "runtimeGateApplicable": true,
        "runtimeGateQualified": false,
        "reasons": [
          "Natural win rate 36.4% over 11 decided matches has 95% Wilson CI [15.2%, 64.6%], whose lower bound does not exceed 50%.",
          "Runtime fallback gate failed: 2040/6576 decisions (31.02%) fell back to the HeuristicAI top action without evaluating a candidate."
        ]
      }
    },
    {
      "policy": "S10_SPATIAL_SEARCH",
      "label": "S10 bounded adversarial search (spatial prior candidate ordering)",
      "matchesPlayed": 20,
      "naturalWins": 6,
      "naturalLosses": 5,
      "naturalDraws": 0,
      "truncations": 9,
      "winLossTruncation": "6-5-9",
      "truncationRatePct": 45,
      "winRateNaturalOnlyPct": 54.5,
      "effectiveWinRatePct": 30,
      "winRateNaturalOnlyNumerator": 6,
      "winRateNaturalOnlyDenominator": 11,
      "confidenceInterval95Natural": [
        28,
        78.7
      ],
      "confidenceInterval95Effective": [
        14.5,
        51.9
      ],
      "engineErrors": 0,
      "modelLoadErrors": 0,
      "notRuns": 0,
      "decisionCount": 6591,
      "latencyP50": 171.5,
      "latencyP95": 264.4,
      "latencyP99": 364.3,
      "latencyMax": 614.1,
      "latenciesOver1000ms": 0,
      "deadlineFallbackCount": 1910,
      "deadlineFallbackRatePct": 28.98,
      "wallClockExceededMatches": 20,
      "totalRehireOpportunities": 13,
      "totalRehireSuccesses": 13,
      "rehireSuccessRatePct": 100,
      "totalRecoveryWindows": 13,
      "totalRecoverySuccesses": 13,
      "recoveryWindowSuccessRatePct": 100,
      "candidateSearchApplicable": true,
      "qualification": {
        "role": "CHALLENGER",
        "promotionEligible": true,
        "promotionQualified": false,
        "runtimeGateApplicable": true,
        "runtimeGateQualified": false,
        "reasons": [
          "Natural win rate 54.5% over 11 decided matches has 95% Wilson CI [28%, 78.7%], whose lower bound does not exceed 50%.",
          "Runtime fallback gate failed: 1910/6591 decisions (28.98%) fell back to the HeuristicAI top action without evaluating a candidate."
        ]
      }
    }
  ],
  "dataset": {
    "datasetPath": "training_runs/agent_upgrade_20260921_v8_final_01/datasets/d_v7_spatial.jsonl",
    "datasetSha256": "fd6b0b12b9f80697dbc2b666d79dafc84529e433bea8745f1e3a906b5dfcf5dd",
    "datasetRows": 7832,
    "splitManifestPath": "training_runs/agent_upgrade_20260921_v8_closure_02/split_manifest.json",
    "splitManifestSha256": "ea1cbfb2c9afe2d65d2652e276e2178d4e120c4d910fbcf843197e73c698f688",
    "consumedManifestPath": "training_runs/agent_upgrade_20260921_v8_closure_02/checkpoints/spatial_resnet/consumed_samples_manifest.json",
    "consumedManifestSha256": "bdea68523990f92db69473bfa0471dfd684c7b4435725267f109353aa4c7bc2c",
    "trainSampleCount": 6528,
    "valSampleCount": 1304,
    "trainValSampleIdIntersection": 0,
    "datasetSampleIdsCovered": 7832,
    "phaseDistribution": [
      {
        "phase": "SKIRMISH_MIDGAME",
        "count": 3092,
        "pct": 39.5
      },
      {
        "phase": "SKIRMISH_ENGAGEMENT",
        "count": 2063,
        "pct": 26.3
      },
      {
        "phase": "SKIRMISH_OPENING",
        "count": 1028,
        "pct": 13.1
      },
      {
        "phase": "SKIRMISH_COMMANDER_RECOVERY",
        "count": 817,
        "pct": 10.4
      },
      {
        "phase": "CURRICULUM_REHIRE",
        "count": 280,
        "pct": 3.6
      },
      {
        "phase": "CURRICULUM_UNBLOCK",
        "count": 140,
        "pct": 1.8
      },
      {
        "phase": "CURRICULUM_PENDING",
        "count": 126,
        "pct": 1.6
      },
      {
        "phase": "CURRICULUM_INFLATION",
        "count": 84,
        "pct": 1.1
      },
      {
        "phase": "CURRICULUM_DEFENSE",
        "count": 80,
        "pct": 1
      },
      {
        "phase": "CURRICULUM_NATURAL_WIN",
        "count": 80,
        "pct": 1
      },
      {
        "phase": "CURRICULUM_SAVING",
        "count": 42,
        "pct": 0.5
      }
    ],
    "curriculumBreakdown": {
      "A_rehire": 280,
      "B_saving": 42,
      "C_unblock": 140,
      "D_inflation": 84,
      "E_pending": 126,
      "F_defense": 80,
      "G_victory": 80
    },
    "rootFamiliesTotal": 93,
    "trainRootFamilies": 80,
    "valRootFamilies": 13,
    "valueTargetNullCount": 7832,
    "valueTargetNonNullCount": 0,
    "duplicateStatesFiltered": 11216,
    "quarantinedSamples": 0
  },
  "runtimeFallback": {
    "analysisPath": "docs/training/reports/agent_upgrade_20260921_v8_closure_02/runtime_fallback_analysis.json",
    "analysisSha256": "c124123b8e5e767596817f18c441cde944813983dd943339059b2011286ddfab",
    "runId": "agent_upgrade_20260921_v8_closure_02",
    "benchmarkPath": "docs/training/reports/agent_upgrade_20260921_v8_closure_02/v8_runtime_fallback_benchmark.json",
    "sourceBenchmarkPath": "docs/training/reports/agent_upgrade_20260921_v8_closure_01/v8_clean_benchmark.json",
    "gate": {
      "maxHardFallbackRatePct": 10,
      "maxHardFallbackDecisionsPerMatch": 50,
      "maxP99Ms": 1000,
      "maxMaxMs": 1000,
      "minAvgCandidatesEvaluated": 1
    },
    "overallPassed": true,
    "policies": [
      {
        "policy": "HEURISTIC",
        "totalCandidateDecisions": 5657,
        "hardFallbackDecisions": 0,
        "hardFallbackRatePct": 0,
        "hardFallbackDecisionsPerMatch": 0,
        "softDeadlineDecisions": 0,
        "softDeadlineRatePct": 0,
        "avgCandidatesEvaluatedPerDecision": 0,
        "avgShallowEvaluationsPerDecision": 0,
        "latencyP99": 346.7,
        "latencyMax": 599.7,
        "gatePassed": true,
        "gateFailures": []
      },
      {
        "policy": "S00_SEARCH",
        "totalCandidateDecisions": 4989,
        "hardFallbackDecisions": 0,
        "hardFallbackRatePct": 0,
        "hardFallbackDecisionsPerMatch": 0,
        "softDeadlineDecisions": 2202,
        "softDeadlineRatePct": 44.14,
        "avgCandidatesEvaluatedPerDecision": 2.962,
        "avgShallowEvaluationsPerDecision": 0.021,
        "latencyP99": 339,
        "latencyMax": 405.2,
        "gatePassed": true,
        "gateFailures": []
      },
      {
        "policy": "S10_SPATIAL_SEARCH",
        "totalCandidateDecisions": 7768,
        "hardFallbackDecisions": 0,
        "hardFallbackRatePct": 0,
        "hardFallbackDecisionsPerMatch": 0,
        "softDeadlineDecisions": 3800,
        "softDeadlineRatePct": 48.92,
        "avgCandidatesEvaluatedPerDecision": 2.842,
        "avgShallowEvaluationsPerDecision": 0.022,
        "latencyP99": 323.6,
        "latencyMax": 438.2,
        "gatePassed": true,
        "gateFailures": []
      }
    ]
  },
  "searchProfile": {
    "profilePath": "docs/training/reports/agent_upgrade_20260921_v8_closure_02/search_stage_profile.json",
    "profileSha256": "28861307ce44d60829104b8ec6c38f2dff6795a2f7cc848f9ee5d31cbd590cf4",
    "source": "training_runs/agent_upgrade_20260921_v8_closure_01/trajectories/match_S00_SEARCH_seat0__2__Crossed_swords_aem_s1337.json",
    "mapName": "(2) Crossed swords.aem",
    "seat": 0,
    "budget": {
      "maxMs": 200,
      "maxNodes": 20,
      "hardMaxMs": 900
    },
    "rows": [
      {
        "step": 40,
        "turn": 3,
        "legalActions": 3,
        "heuristicScoreAllMs": 1.4,
        "filteredCandidatesMs": 22.58,
        "legacyFixedOverheadMs": 23.85,
        "newFixedOverheadMs": 21.34,
        "leafEvalMs": 0.21,
        "boundedSearchMs": 61.8,
        "boundedSearchFallback": 0,
        "boundedSearchCandidatesEvaluated": 3,
        "boundedSearchShallowEvaluations": 0,
        "boundedSearchWallClockExceeded": false
      },
      {
        "step": 120,
        "turn": 6,
        "legalActions": 103,
        "heuristicScoreAllMs": 73.81,
        "filteredCandidatesMs": 96.08,
        "legacyFixedOverheadMs": 167.85,
        "newFixedOverheadMs": 93.15,
        "leafEvalMs": 0.21,
        "boundedSearchMs": 234.96,
        "boundedSearchFallback": 0,
        "boundedSearchCandidatesEvaluated": 1,
        "boundedSearchShallowEvaluations": 0,
        "boundedSearchWallClockExceeded": true
      },
      {
        "step": 160,
        "turn": 7,
        "legalActions": 34,
        "heuristicScoreAllMs": 35.88,
        "filteredCandidatesMs": 49.15,
        "legacyFixedOverheadMs": 80.79,
        "newFixedOverheadMs": 50.47,
        "leafEvalMs": 0.21,
        "boundedSearchMs": 214.14,
        "boundedSearchFallback": 0,
        "boundedSearchCandidatesEvaluated": 4,
        "boundedSearchShallowEvaluations": 0,
        "boundedSearchWallClockExceeded": true
      },
      {
        "step": 280,
        "turn": 11,
        "legalActions": 15,
        "heuristicScoreAllMs": 15.44,
        "filteredCandidatesMs": 36.93,
        "legacyFixedOverheadMs": 61.72,
        "newFixedOverheadMs": 44.86,
        "leafEvalMs": 0.21,
        "boundedSearchMs": 133.85,
        "boundedSearchFallback": 0,
        "boundedSearchCandidatesEvaluated": 5,
        "boundedSearchShallowEvaluations": 0,
        "boundedSearchWallClockExceeded": false
      },
      {
        "step": 360,
        "turn": 14,
        "legalActions": 6,
        "heuristicScoreAllMs": 3.83,
        "filteredCandidatesMs": 24.79,
        "legacyFixedOverheadMs": 29,
        "newFixedOverheadMs": 27.06,
        "leafEvalMs": 0.39,
        "boundedSearchMs": 220.95,
        "boundedSearchFallback": 0,
        "boundedSearchCandidatesEvaluated": 4,
        "boundedSearchShallowEvaluations": 0,
        "boundedSearchWallClockExceeded": true
      },
      {
        "step": 600,
        "turn": 20,
        "legalActions": 4,
        "heuristicScoreAllMs": 7.09,
        "filteredCandidatesMs": 26.64,
        "legacyFixedOverheadMs": 31.96,
        "newFixedOverheadMs": 26.61,
        "leafEvalMs": 0.24,
        "boundedSearchMs": 361.57,
        "boundedSearchFallback": 0,
        "boundedSearchCandidatesEvaluated": 1,
        "boundedSearchShallowEvaluations": 0,
        "boundedSearchWallClockExceeded": true
      }
    ]
  },
  "daggerRound2": {
    "summaryPath": "docs/training/reports/agent_upgrade_20260921_v8_closure_02/dagger_round2_summary.json",
    "summarySha256": "ff807ab9a11e77131f322955fbc357aeac14b940aecd6b593ae2720f70a2d010",
    "roundLabel": "round2",
    "failuresCount": 40,
    "failureTypeCounts": {
      "POLICY_DIVERGENCE": 40
    },
    "policyDivergenceOnly": true,
    "correctionSignalNote": "All 40 failure windows are POLICY_DIVERGENCE: each was confirmed only by the 3-way counterfactual replay (scoreB > scoreA or scoreC > scoreA). No structural blunder class (MISSED_REHIRE, CASTLE_BLOCKED, SUICIDE_ATTACK, TACTICAL_DEFENSE_BLUNDER) was detected. A divergence-only correction set is a weaker signal than a mixed failure set: it shows the student deviates from the teacher on states the teacher's one-step/rollout value favours, but it does not by itself prove the student committed a tactical error. It is therefore reported as a divergence-correction set, not as verified blunder repair.",
    "baseDatasetPath": "training_runs/agent_upgrade_20260921_v8_final_01/datasets/d_v7_spatial.jsonl",
    "baseDatasetRowsRead": 7832,
    "daggerDatasetRows": 7872,
    "daggerSampleRowsAppended": 40,
    "daggerAddedRootCount": 2,
    "baseModelSha256": "1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92",
    "daggerSha256": "cb96e2028c27dda5267bca54ad4bc4394553351351fd516e08bcb60e91d857a5",
    "distinctCheckpointShas": true,
    "pythonCommand": "py -3.12",
    "torchVersion": "2.14.0+cpu",
    "pairedReportPath": "docs/training/reports/agent_upgrade_20260921_v8_closure_02/dagger_round2_paired_evaluation.json",
    "pairedReportSha256": "04ca025f259c124796020dbaeb1acd93044de9a8c1a2a8b2861b8e2a3918cc47",
    "pairedMatches": 40,
    "pairedAggregates": [
      {
        "policy": "SPATIAL_V2",
        "matchesPlayed": 20,
        "naturalWins": 2,
        "naturalLosses": 13,
        "naturalDraws": 0,
        "truncations": 5,
        "truncationRatePct": 25,
        "winRateNaturalOnlyPct": 13.3,
        "effectiveWinRatePct": 10,
        "confidenceInterval95Natural": [
          3.7,
          37.9
        ],
        "confidenceInterval95Effective": [
          2.8,
          30.1
        ],
        "latencyP50": 22,
        "latencyP95": 27.3,
        "latencyP99": 32.1,
        "latencyMax": 36.3,
        "latenciesOver1000ms": 0,
        "wallClockExceededMatches": 0,
        "totalRehireOpportunities": 6,
        "totalRehireSuccesses": 6,
        "totalRecoveryWindows": 6,
        "totalRecoverySuccesses": 6,
        "checkpointSha256": "1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92"
      },
      {
        "policy": "SPATIAL_DAGGER",
        "matchesPlayed": 20,
        "naturalWins": 0,
        "naturalLosses": 16,
        "naturalDraws": 0,
        "truncations": 4,
        "truncationRatePct": 20,
        "winRateNaturalOnlyPct": 0,
        "effectiveWinRatePct": 0,
        "confidenceInterval95Natural": [
          0,
          19.4
        ],
        "confidenceInterval95Effective": [
          0,
          16.1
        ],
        "latencyP50": 22.4,
        "latencyP95": 28.6,
        "latencyP99": 33,
        "latencyMax": 35.7,
        "latenciesOver1000ms": 0,
        "wallClockExceededMatches": 0,
        "totalRehireOpportunities": 17,
        "totalRehireSuccesses": 13,
        "totalRecoveryWindows": 13,
        "totalRecoverySuccesses": 13,
        "checkpointSha256": "cb96e2028c27dda5267bca54ad4bc4394553351351fd516e08bcb60e91d857a5"
      }
    ],
    "qualityAssessment": {
      "nonZeroCorrections": true,
      "distinctShas": true,
      "datasetGrew": true,
      "addedRootFamilies": true,
      "pairedReportComplete": true,
      "verdict": "Correction signal is divergence-only. Each window is confirmed by counterfactual replay, but no structural blunder class fired, so this round demonstrates behaviour change and label coverage rather than proven tactical blunder repair."
    }
  },
  "thirtyKStatus": {
    "status": "BLOCKED/NOT_RUN",
    "reason": "The 30,000-state scale run stays BLOCKED/NOT_RUN: it may only start once report consistency, the bounded-search runtime fallback gate, a genuine overfit sanity check, the terminal value label scheme, and the teacher qualification gate are all satisfied."
  },
  "defaultProductionPolicy": "HeuristicAI"
}
```

<!-- MACHINE_FACTS_END -->
