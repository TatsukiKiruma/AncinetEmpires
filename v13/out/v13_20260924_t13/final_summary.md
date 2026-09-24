# V13 T13-00 … T13-07 · status and handover

Run id: `v13_20260924_t13`. Baseline: `b8c0c24312a551a3cf20802f820e3f1edf798395`
(local HEAD was identical — **no delta**; nothing reset, no user code overwritten).

## The honest summary

Seven tasks ran. **Four are DONE with executed evidence, and T13-04/05/07 are now DONE
too** — including the mandatory B0 training and its evaluation. The result is a
**located negative result**, which is the most useful thing this round could have
produced: the model did not improve, and we now know why.

Nothing beats the heuristic. Production is untouched. Every number below has a run
behind it.

## Status per task

| Task | Status | Basis |
|---|---|---|
| T13-00 freeze + correction index | **DONE** | 50 artifacts hashed, 15 claims indexed, no delta |
| T13-01 trainer fixes + counter-examples | **DONE** | 25/25 new tests, 14/14 legacy tests, tsc clean |
| T13-02 evaluation protocol v3 | **DONE** | 17/17 core tests, self-test identical, fault injection ok |
| T13-03 data v3 identity/provenance | **DONE** | 0 alignment mismatches / 48,714 rows; 35,195/35,195 value labels verified |
| T13-04 candidate + encoding contract | **DONE** | measured over all 48,714 states |
| T13-05 re-measure existing models | **DONE** | 3 candidates on Duel under v3 |
| T13-06 search teacher qualification | **DEFERRED** | not started; 17/20 stays provisional |
| T13-07 B0 explicit-teacher baseline | **DONE** | trained + evaluated; negative result located |
| T13-08 / T13-09 / T13-10 | **DEFERRED** | depend on a positive B0 |

Gates: **G0 PASS · G1 PASS · G2 PASS · G3 NOT MET · G4 NOT MET.**

## The three findings that matter

### 1. The training array and the inference array are different permutations

| Measurement | Value |
|---|---|
| Rows where the teacher sits at stored candidate index 0 | **96.64%** |
| Rows where the teacher sits at `legalActionCodes[0]` (engine order) | **1.39%** (subset) / **17.67%** (full pool) |

The converter mints its candidate array with the teacher's action first
(`convert_archive_to_spatial.ts:409-423`); inference maps over
`engine.getLegalActions()` in engine order (`shared_spatial_policy.ts:56`). So the network
learned "index 0 usually wins" — true 96.64% of the time in training, false ~82% of the
time at inference.

This is **stronger than the candidate-count mismatch** the review identified. Matching the
count would not fix it. It also invalidates reading any earlier offline accuracy as
teacher agreement.

### 2. B0 trained correctly and the model is below the class prior

2,439 rows (1,962 train / 477 val) over 20 roots, one named teacher, fixed manifest,
separated seeds, **496 updates, 15,696 exposures, `uniqueOptimized 1962/1962`**, best
validation accuracy **41.30% / 42.98% / 40.67%** at model seeds 42/1337/2026. Re-running
seed 42 gave a **byte-identical** checkpoint, so the comparison across seeds is real.

**The validation majority class is `targetActionIndex == 0` at 86.79%.** So 41–43% is
~44 points *below* a constant predictor. The number rose across epochs and still means
the model did not learn the teacher — it spread probability mass away from the position
the labels occupy. Cause: finding 1.

### 3. A label-independent selector at 48 candidates cannot preserve the teacher

Teacher recall measured before any forced insertion: **75.27%** at a 48 cap. Losses are
concentrated in exactly the types a network would need: `support` 0.6%, `heal` 11.6%,
`move` 23.2%, `destroy_town` 23.1%. Truncation fires on **45.73%** of states (legal
actions: median 39, p90 253, max 756). So the honest options are full legal candidates or
an explicitly reported recall loss — not silent truncation.

## Measurements under the v3 protocol

**T13-05, Duel (2-player), seeds 2026070501/2026070502, all engine-discovered seats:**

| Candidate | checkpoint sha256 | natural wins | mirror | delta |
|---|---|---|---|---|
| src deployed weights | `1721ca17…` | 2/4 | 2/4 | **0.00** |
| `budget_s42` (old 30k pool) | `25361b1b…` | 0/4 | 2/4 | **−0.50** |
| `v2_honest_s42` (corrected pool) | `60f24e60…` | 0/4 | 2/4 | **−0.50** |

Zero truncations, zero fallbacks, p50 38–40 ms. Every game on this map was won by
alliance 0 regardless of the candidate, so the map discriminates weakly and these are
directional readings, not certified effect sizes.

**The important consequence:** `v2_honest_s42` is **not worse** than `budget_s42` — both
score 0/4 against the same mirror. The V12 `budget_s42` paired result therefore must not be
presented as a result for the corrected full-pool model, in either direction.

**T13-07 B0, 3-player Midway (matching the training distribution):**

| Model seed | candidate natural wins | mirror natural wins | delta | wall timeouts |
|---|---|---|---|---|
| 42 | 0/6 | 2/6 | −0.333 | 0 |
| 1337 | 0/6 | 2/6 | −0.500 | 2 (classified, not counted as losses) |
| 2026 | see `eval_b0_s2026_midway.json` | | | |

One arm ran 15,078 steps before hitting the 15-minute wall clock. The protocol classified
it `WALL_TIMEOUT` rather than folding it into a loss — the first time in this project that
a budget stop has been reported as itself.

## Answers to the seven questions

1. **Which weights are loaded, and the real SHA?**
   `src/game/ai/models/spatial_resnet_v2_checkpoint.json`, SHA-256 `1721ca17…`, matching
   the registry exactly. It was **evaluated** and scored delta 0.00 on Duel. No candidate
   beat the heuristic, so nothing is proposed for promotion.
2. **Which changes are engineering fixes vs new learning?** All the fixes are engineering.
   The only new learning is B0, and it is a **negative** result.
3. **How many unique states/roots were actually optimized?** B0: **1,962 unique training
   rows over 16 roots**, 496 optimizer updates, 15,696 exposures, `plannedNeverOptimized=0`.
   The three earlier V12 runs' numbers are unchanged and are not this round's.
4. **Which games finished naturally, and what is the independent unit?** Duel T13-05: all
   12 seat arms natural. B0 Midway: 16 of 18 arms natural, 2 `WALL_TIMEOUT`. The
   independent unit is the independent game/root — the reports print
   `independentMirrorGames` separately from `mirrorRowsReferencingAMirror` (2 vs 6) so the
   V12 double-counting cannot recur.
5. **How did the corrected-pool model, the explicit-teacher baseline, search distillation
   and DAgger perform?** `v2_honest_s42` −0.50 on Duel (same as `budget_s42`); B0 −0.33 to
   −0.50 on Midway; search distillation and DAgger **not run**, because B0 was negative.
6. **Cross-map/seat degradation, latency, fallback?** No cross-map claim is licensed —
   only Duel (2p) and Midway (3p) were evaluated, each with one map. Latency p50 30–40 ms,
   zero fallbacks everywhere. Two wall-clock stops out of 18 B0 arms.
7. **What should be scaled or stopped?** **Stop repeating B0 until the candidate ordering
   is canonicalised.** Then re-run identical B0. Do not start B2. Do not scale data.

## The fix the next round must make first

1. Sort the candidate set on both sides by a label-independent key derived from the
   action's own `actionCode`, so training and inference see the same permutation; re-measure
   teacher recall under that ordering (the current 75.27% is measured against the old order).
2. Re-run B0 unchanged otherwise: same split, same budget, same three model seeds.
3. Only then compare against this run — the task itself will have changed.

## Environment blockers (accurate, not worked around)

- **`vitest` cannot run here**: esbuild's service startup calls `child_process.spawn`,
  denied with `EPERM`. All TS tests run through the repository's own in-process runner.
- **The source archive is 7.27 GB**, over Node's 2 GiB `readFileSync` limit; hashing is
  streamed and reusable via `--pool-sha256`.
- **Crossroads (4-player) exceeds the round budget**: one all-heuristic mirror did not
  finish in ~2 hours. That attempt was stopped and reported as
  `BUDGET_EXHAUSTED`, not as a pass. A 3-player Midway game reached 15,078 steps, which is
  why B0's evaluation needed an explicit wall-clock cap.



---

# ROUND 2 ADDENDUM - ordering fix and B0 rerun

See `T13-07/pilot_training_report_v31.md`, `task_status_round2.json` and the updated`promotion_decision.json`.

**Root cause fixed, learning demonstrated, strength NOT achieved.**

- The candidate ordering defect is confirmed and quantified: teacher at stored index 0 in 96.64% of rows vs engine index 0 in 14.06-17.67%.
- Re-encoding from source with the repository's own encoder matched the pool tensors with **0 mismatches, max abs diff 0 over 26,785 rows**.
- B0 on engine-ordered data: **31.88% / 32.21% / 29.79%** top-1 vs **1.45% per-state chance** (~22x) and 2.58% majority prior.
- Game evaluation: **0 natural wins in 10 decided arms**; mirror 6/18; wall timeouts rose 3/18 -> 8/18.
- Coverage: a label-independent selector at cap 48 keeps only **78.75%** of teacher decisions; 128 -> 91.84%, 256 -> 98.36%.
- Collision check: **0/3,181** label rows are ambiguous, so 31% is difficulty, not ill-posedness.

Ruling: **(a) ordering defect confirmed; (b) 'unlearnable objective' refuted.** The next step is **T13-06** - qualify a stronger teacher - not another imitation round.


---

# ROUND 4 - T13-06 tactical soundness; B2 CLOSED

See `T13-06/tactical_soundness_report.md` and `task_status_round4.json`.

**The calibrated search teacher misses a FREE CAPTURE 77-31% of the time; the plain heuristic never misses it (100%), and the kernel gets WORSE as its candidate budget grows.** A forced takeover over a stochastic static leaf is a noise maximiser.

| maxCandidates | free-capture decisions | kernel | heuristic | worst decision |
|---|---|---|---|---|
| 4 | 13 | 69.2% | 100% | 2.0 s |
| 8 | 13 | 30.8% | 100% | 4.0 s |
| 16 | 13-14 | 21.4-23.1% | 100% | 7.3 s |
| 32 | 13 | 23.1% | 100% | 14.2 s |

Zero illegal actions, zero fallbacks in ~510 probed decisions. A bounded kernel was implemented (capped inner topK + legal-action fallback); work is finite but NOT 1-second boundable at any setting tested.

**This supersedes round 3's '10 better / 6 equal / 0 worse' leaf comparison**, which evaluated each choice once and therefore could not see the noise-maximisation defect.

**B2 search distillation: FAILED (closed).** T13-08: BLOCKED (no qualified teacher). T13-09/T13-10: unchanged DEFERRED.


---

# ROUND 5 - gap closure and package rebuild

All three substantive gaps are closed and the delivery package is rebuilt to the taskbook structure.

**T13-05 extension (all 8 checkpoints measured)**

| candidate | arena | wins/arms | mirror | delta |
|---|---|---|---|---|
| src deployed weights | Duel | 2/4 | 2 | 0.00 |
| diag_grouped_s42 | Duel | 1/4 | 2 | **-0.25** |
| budget_s42 / s1337 / s2026 / s2026_last | Duel | 0/4 | 2 | -0.50 |
| v2_honest_s42 / _last | Duel | 0/4 | 2 | -0.50 |

- All three old-pool seeds score identically, so they cannot be separated on this arena.
- v2_honest_s42 == budget_s42, so the V12 negative result neither transfers to nor is refuted by the corrected pool.
- budget_s2026 and _last are byte-identical AND score identically: one artifact, not two.
- diag_grouped_s42 at delta -0.25 is the strongest network reading in the project and still loses.

**T13-06 tactical suite completed to all 8 patterns**: IMMEDIATE_CAPTURE, LETHAL_ATTACK, OWN_COMMANDER_THREAT, MIN_RANGE_PRESSURE, CASTLE_PENDING, END_TURN_TIMING, MULTIPLAYER_NEXT_ACTOR_THREAT, MOVE_THEN_ATTACK. IMMEDIATE_CAPTURE reconfirmed at 17.6% kernel vs 100% heuristic.

**Package rebuilt**: `T13-10/` with protocol_and_splits/ (4), tests/ (7), data_manifests/ (9), training_runs/ (17), match_results/ (9), failure_replays/ (11), plus the four top-level files and package_manifest.json. 64 files copied, zero missing sources. All 24 taskbook-named deliverables now present.

`existing_checkpoint_matrix.jsonl` holds 14 real measurement records; the scan was deliberately restricted to T13-05/T13-07 so package copies and the fault-injection calibration cannot inflate it.

