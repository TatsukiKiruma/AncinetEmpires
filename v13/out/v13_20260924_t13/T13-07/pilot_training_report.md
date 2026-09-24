# T13-07 · B0: explicit `heuristic` teacher, real training and evaluation

Status of the B0 baseline: **trained and evaluated**. The head-line result is a
**negative learning result**, and the reason for it is a defect in the training data
that this run finally made measurable.

## What was trained

| Item | Value |
|---|---|
| Teacher | `heuristic` only — every written row has `labelTeacherId = "heuristic"` |
| Rows | 2,439 (1,962 train / 477 validation) |
| Roots | 20 (16 train / 4 validation), no root appears in both |
| Decision selection | action-space breadth ≥ 8 legal actions, phase window [0.10, 0.90], ≤ 160 rows/root |
| Pool SHA-256 | `da14e9611e8cdc4d…` (train `da14e961…`, val `dae35fc1…`) |
| Fixed split manifest | `v13/out/v13_20260924_t13/T13-07/data_v3_b0/split_manifest.json` |
| Update budget | `--global-update-limit 3000` (never reached) |
| Actual updates | **496 per run**, 15,696 sample exposures, `uniqueOptimized = 1962/1962`, `plannedNeverOptimized = 0` |
| Epochs | 8 (the data was exhausted before the update cap) |
| Seeds | model 42 / 1337 / 2026; split seed fixed at 42; data-order seed = model seed |

## Results

| Model seed | Best val acc | Best epoch | Train acc @ last | Weight SHA-256 (head) |
|---|---|---|---|---|
| 42 | 41.30% | 7 | 54.28% | `29f12678aedf80e0…` |
| 1337 | 42.98% | 6 | 56.42% | `c7d63940555c9ac8…` |
| 2026 | 40.67% | 8 | 54.84% | `93b6cc4aeaa5b032…` |

All three weights are distinct. Re-running seed 42 with the same seeds produced a
**byte-identical** checkpoint (`29f12678…`), so the trainer is deterministic under a fixed
manifest and separated seeds — which is what makes the three-way comparison meaningful.

Each run has its own consumption ledger (`runs/s42/optimizer_update_ledger.jsonl`,
`runs/s1337/…`, `runs/s2026/…`, 496 lines each). The trainer now **refuses** to overwrite
an existing ledger, because the ledger name is derived from the output directory and the
first pass of this task silently lost two of the three.

## The B0 baseline is BELOW the class prior

The validation split has 477 rows and the majority `targetActionIndex` is **0 with 414
rows = 86.79%**. Chance over the 33 distinct target indices present is ~3%.

**41–43% validation accuracy is therefore 44 points BELOW a constant "always predict
index 0" baseline.** This is the decisive fact about B0, and it must not be reported as
"the model learned the teacher" merely because the number rose from 27% to 43% across
epochs.

## Why: the training array is ordered differently from the inference array

This is the finding of the round, and it explains the number above.

| Measurement | Value |
|---|---|
| Rows where `targetActionIndex == 0` in the stored candidate array | **2,357 / 2,439 = 96.64%** |
| Rows where the teacher's action is `legalActionCodes[0]` in the engine's own ordering | **34 / 2,439 = 1.39%** |
| Same check on the full 48,714-row pool | **8,610 / 48,714 = 17.67%** at engine index 0 |

The converter mints its candidate array with a `Set` that contains the teacher's action
**first** (`tools/convert_archive_to_spatial.ts:409-423`), so the teacher's action lands at
array index 0 in almost every row. At inference,
`src/game/ai/shared_spatial_policy.ts:56` builds the candidate array by mapping over
`engine.getLegalActions()` in the engine's own order, where the teacher's action sits at
index 0 only 17.67% of the time.

So the network's positional prior and the task it faces at inference are **different
permutations of the same candidate set**. It learned "index 0 usually wins", which is true
96.64% of the time in training and false ~82% of the time at inference.

This is a strictly stronger statement than the candidate-count mismatch the V13 review
identified (teacher 6 / training 48 / inference all). Matching the *count* would not have
fixed it; the *ordering* differs too. The taskbook's requirement that "candidate
permutation must not change the logits, and tie-breaks must use a stable `actionCode`
rule" addresses exactly this and is now a **measured** requirement rather than a
precaution.

Consequence for every earlier offline number: the V12 accuracies (44.20% / 45.40% /
44.63% / 42.80%) were measured against position-0-shaped labels, so they are not
estimates of teacher agreement at inference. They should be read as "how well the model
fit the training array's ordering", which is not a policy metric.

## Evaluation of B0 under the v3 protocol

Map `SDPLAN:sd-3p-normal-extra:(3) Midway.aem` (3 players, matching the training
distribution), seeds `2026070501, 2026070502`, all three engine-discovered seats,
`maxSteps 20000`, no silent fallback.

| Model seed | candidate natural wins | candidate arms natural | mirror natural wins | delta | wall timeouts |
|---|---|---|---|---|---|
| 42 | 0 | 6/6 | 2/6 | **−0.333** | 0 |
| 1337 | 0 | 4/6 | 2/6 | **−0.500** | 2 |
| 2026 | 0 | 5/6 | 2/6 | **−0.400** | 1 |

Across all three seeds: **the candidate won 0 of the 17 seat arms that reached a natural
verdict**, while the all-heuristic mirror won 6 of its 18. Three arms hit the 15-minute
wall clock (one ran 15,747 steps) and were classified `WALL_TIMEOUT` — not folded into
losses, which is the first time in this project that a budget stop has been reported as
itself. Zero silent fallbacks anywhere; p50 decision latency 22–42 ms.

**Read this as a lower bound, not a calibrated effect size.** With 6 arms per model the
95% interval on a delta of −0.4 is wide, and the mirror wins exactly one seat (P1) in both
seeds, so the map carries a strong seat preference as well. What it does establish, with
no ambiguity, is that B0 did not beat the heuristic on the map it was trained for, which is
consistent with — and explained by — the ordering defect above.

## Verdict against the gates

- **G3 is NOT met.** The taskbook's condition is "at least one explicit-teacher real
  training completed AND a valid held-out action metric". The training is complete and
  the consumption ledger is real, but the held-out metric is **not valid as a policy
  metric** because its labels encode an array position that does not exist at inference,
  and the model scores below the class prior on it.
- This is a **negative result with a located cause**, not an inconclusive one. It is
  exactly the kind of result the taskbook asks for: "失败也给出可定位的负结果".

## What this round did NOT do

- No B1 (`global_policy_pool`) arm, no B2 (search ranker), no B3 (DAgger).
- No re-encoding of B0's data with a shared ordering. That is the fix the next round
  must make **before** repeating B0; repeating B0 unchanged would reproduce this result.
- No cross-map evaluation. Midway only.

## The fix the next round should make first

1. Canonicalise the candidate ordering on **both** sides with a label-independent sort
   keyed on the action's own `actionCode`, so training and inference see the same
   permutation. Record the pre-existing teacher recall under that ordering (T13-04 gives
   75.27% at a 48 cap, measured against the converter's current order — the number must be
   re-measured once the ordering is fixed).
2. Re-run B0 with the same split, the same budget and the same three model seeds.
3. Only then compare against this run's numbers, because the task has changed.

## Environment note

All three B0 runs completed well inside the round's wall-clock budget (minutes, not
hours) because the subset is 2,439 rows. The 3-player evaluations were the expensive
part — one Midway game ran 9,070 steps.
