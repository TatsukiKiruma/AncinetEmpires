# Stage 1 design: natural-terminal value supervision

**Run id**: `agent_upgrade_20260921_v8_closure_02`
**Generated at**: `2026-09-21T18:52:37.580Z` by `tools/v8_closure_report.ts`
**Fact source**: `docs/training/reports/agent_upgrade_20260921_v8_closure_01/v8_clean_benchmark.json` (SHA-256 `9d367317e10b89656d8b021e1b71ed6cd2bf308932a4b58de12e3576b7f293ff`)

## 1. Current fact base (must not be rounded away)

| Fact | Value |
| :--- | :--- |
| Unique verified states on disk | 7,832 |
| Train / val samples | 6,528 / 1,304 |
| Train ∩ val sample-id intersection | 0 |
| Curriculum A / B / C / D / E / F / G | 280 / 42 / 140 / 84 / 126 / 80 / 80 |
| Rows with `valueTarget === null` | 7,832 / 7,832 |
| Rows with a non-null `valueTarget` | 0 |
| 30k scale run | `BLOCKED/NOT_RUN` |

Phase distribution as measured:

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

## 2. Natural-terminal outcome collection

1. Every collection match runs from the APK skirmish initial state to a **natural terminal**
   (a victory condition reached inside the engine) or to the `maxTurns` / `maxAtomicSteps` bound.
2. A match that stops on a bound is written with an explicit truncation marker
   (`TRUNCATION_MAX_TURNS` / `TRUNCATION_MAX_STEPS`) and **never** receives a value label.
3. Truncated matches stay in the dataset as policy-only samples so the policy head still learns from
   them, but they are excluded from value supervision.
4. The per-match outcome record keeps the same schema as `v8_clean_benchmark.json` outcomes so traces
   remain comparable with the closure_01 baseline.

## 3. Value target specification

- `z = +1` if the sample's `playerId` seat wins naturally.
- `z = -1` if the sample's `playerId` seat loses naturally.
- `z = 0` for a natural draw.
- `valueTarget = null` for every truncated match, and for every sample whose match has no natural
  terminal outcome. `null` is the **mask**: the trainer must not back-propagate a value loss on a
  `null` target, and must not read `null` as `0`.
- No discounting is applied by default. If discounted targets are ever introduced, they must be
  written as a separate field so the undiscounted `z` remains auditable.
- Every sample records the terminating `matchId`, `turn`, and `terminationReason` so a label can be
  recomputed from the match record alone.

## 4. Phase stratification

Phases follow the existing `scenarioGroup` naming so manifests stay comparable:

| Phase | Meaning | Target share |
| :--- | :--- | ---: |
| `SKIRMISH_OPENING` | 开局: opening development | as measured, rebalanced toward 25% |
| `SKIRMISH_MIDGAME` | 中盘: mid-game expansion and positioning | as measured, rebalanced toward 40% |
| `SKIRMISH_ENGAGEMENT` | 接触战: contact battles and contested buildings | as measured |
| `SKIRMISH_COMMANDER_RECOVERY` | 指挥官恢复: commander loss, retreat and castle re-hire | as measured, floor enforced |
| `SKIRMISH_ENDGAME` | 收官: closing phase — enemy commander down or one side reduced to a single castle | new stratum, floor of 500 samples, currently unrepresented |
| `CURRICULUM_TACTICAL` | hand-authored curriculum scenarios A–G | floor of 150 samples per scenario |

The endgame stratum is **not yet represented** in the 7,832-state dataset: every measured
`scenarioGroup` falls into the opening, midgame, engagement, commander-recovery or curriculum
buckets. Stage 1 must add it explicitly, because value supervision is least well constrained exactly
where the game becomes decisive.

Curriculum B (saving) and E (pending move deployment) are the thinnest arms and must be topped up to
the per-scenario floor before Stage 1 is declared complete.

## 5. 30k split manifest and consumption record

- `split_manifest.json` partitions **by `rootFamilyId`**, never by sample. A root family appears in
  exactly one of train or val; the intersection must be empty and is asserted by test.
- The val partition is **frozen**: once a root family is assigned to val it stays there for every
  subsequent run, so metrics stay comparable across 10k → 30k → 100k.
- `consumed_samples_manifest.json` records the literal train/val `sampleId` lists actually consumed by
  a training run, plus the dataset path and SHA-256 it read them from.
- The acceptance check is: `trainIds ∩ valIds === ∅`, and every dataset `sampleId` is accounted for by
  either the train or the val list (no silent drops).
- Curriculum arms are stratified across both partitions so each arm is represented in train and val.

## 6. Acceptance gates for Stage 1

1. ≥30,000 unique verified states, all with provenance (map, seat, seed, turn, `rootFamilyId`).
2. Every naturally terminated match contributes labels; **zero** `valueTarget` values on truncated
   matches (mask honoured).
3. Non-null `z` labels exist in every phase and every curriculum arm.
4. `trainRootFamilies ∩ valRootFamilies === ∅` and consumed-manifest coverage is complete.
5. The closure gates still hold: report consistency passes and the bounded-search runtime fallback
   gate passes.
6. R8-06 real overfit sanity still passes on the enlarged dataset.

## 7. Stage 1–4 roadmap

| Stage | Objective | Entry gate | Exit gate |
| :--- | :--- | :--- | :--- |
| 1 | Natural-terminal value supervision | closure_02 report consistency + runtime fallback gates pass; overfit sanity retained | ≥30k labelled states, mask honoured, frozen val split, complete consumption record |
| 2 | Policy + value dual-head training (`value_weight ≈ 0.5`) | Stage 1 dataset accepted | value MSE, value calibration, policy top-1 and natural-terminal win rate all machine reported; closure gates unchanged |
| 3 | Teacher qualification and multi-round DAgger | a teacher policy beats HeuristicAI significantly over ≥100 matches **and** passes the runtime gate | each round shows non-zero verified corrections, a distinct student SHA, and a complete paired pre/post report |
| 4 | Scale and ablation (10k → 30k → 100k, 2 vs 4 blocks, value on/off, search distillation) | Stage 2–3 gates pass | ablations reproduced with machine-generated reports; MCTS / AlphaZero-style self-play evaluated only after this stage |

## 8. Why the 30k run stays blocked

`BLOCKED/NOT_RUN` — The 30,000-state scale run stays BLOCKED/NOT_RUN: it may only start once report consistency, the bounded-search runtime fallback gate, a genuine overfit sanity check, the terminal value label scheme, and the teacher qualification gate are all satisfied.
