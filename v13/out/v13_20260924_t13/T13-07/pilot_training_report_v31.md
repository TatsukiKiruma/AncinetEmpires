# T13-07 rerun · B0 on v3.1: the ordering fix changes the answer

This is the re-run the previous round's report demanded: **same split, same selection
rule, same budget, same three model seeds — only the candidate ordering changed.**

## The two datasets, side by side

| | v3.0 (first B0) | v3.1 (this rerun) |
|---|---|---|
| Candidate array built by | `convert_archive_to_spatial.ts` — teacher's action minted first | `shared_spatial_policy.ts` semantics — **engine legal order** |
| Teacher position | index 0 in **96.64%** of rows | target index spread over 409 distinct values |
| Train rows / val rows | 1,962 / 477 | 2,560 / 621 |
| Majority-class prior (train) | **0.9903** | 0.0086 |
| Majority-class prior (val) | **0.8679** | **0.0258** |
| Per-state chance (val, mean 1/K) | ~0.03 | **0.014456** (median 136 candidates/state) |
| Distinct target indices (val) | 33 | **210** |

Both subsets come from the same 16 train roots and 4 validation roots, with the same
per-root cap (160), the same `minLegalActions` (8) and the same phase window.

## Re-encoding parity: exact

The v3.1 pool was rebuilt from the 7.27 GB source archive using the repository's own
TypeScript encoder (`v13/tools/reencode_v31.ts`), not copied from the old pool.

| Check | Result |
|---|---|
| Rows compared against the old pool's tensors | **26,785** |
| `spatialTensor` mismatching rows | **0** |
| max absolute tensor difference | **0** |
| `globalFeatures` mismatching rows | **0** |
| max absolute global difference | **0** |

This is the taskbook's cross-language parity item: the Python-produced pool tensors and
the TypeScript encoder agree exactly, so the rebuilt candidate features sit on the same
numeric footing. It also proves the rebuilt `GameState` is a faithful reconstruction —
if it were not, the tensors would differ.

## Result

| Model seed | Best val acc | Best epoch | Train acc @ last | v3.0 val acc (same seed) | v3.0 val prior |
|---|---|---|---|---|---|
| 42 | **31.88%** | 7 | 38.12% | 41.30% | 86.79% |
| 1337 | **32.21%** | 7 | 39.38% | 42.98% | 86.79% |
| 2026 | **29.79%** | 7 | 38.16% | 40.67% | 86.79% |

Consumption: **640 updates, 20,480 exposures, `uniqueOptimized 2560/2560`,
`plannedNeverOptimized 0`** for every seed. Note the update count differs from v3.0's 496
because the subset has 2,560 train rows rather than 1,962 — the *budget cap* (3,000) is
unchanged and still not reached; the runs are epoch-bound, not cap-bound.

## What this settles

**Against per-state chance, the model is 22× better than random.** 31.88% top-1 over a
median of 136 candidates, where a per-state uniform guess gives 1.45%. It is also 12× the
majority-class prior.

**The previous round's verdict (a) — "the ordering defect was hiding a learnable task" —
is confirmed.** The v3.0 model's 41% was meaningless: it was scored against a target that
sat at index 0 in 99% of training rows, i.e. nearly a constant, and it still landed *below*
the prior. The v3.1 model solves a genuinely hard 210-way problem from board features at
22× chance.

Note what this does **not** say. 31% top-1 is not strong play: it means that roughly two
times in three the network picks a different action than the teacher would. Whether that
is enough to beat the heuristic is a separate question, answered by the game evaluation,
not by this number.

## Why the low accuracy is not an "unidentifiable action" artefact

Checked before drawing any conclusion (`v13/tools/candidate_collision.py`), because two
candidates with identical feature vectors would make a single-label target partly
unlearnable:

| Measurement | Value |
|---|---|
| States | 3,181 |
| Total candidates | 764,105 (mean 240/state) |
| Duplicated candidate feature vectors | 508 / 764,105 = **0.0665%** |
| States with any collision | 129 / 3,181 = 4.06% |
| **Label rows whose feature vector matches another candidate** | **0 / 3,181 = 0%** |
| Largest identical group | 4 |

So the 31% ceiling is **not** caused by ambiguous inputs. The task is hard, not
ill-posed. That closes the "check action aliasing before blaming the optimiser" item.

## Verdict

- **(a) vs (b): (a).** The ordering defect was the cause; the imitation objective is
  learnable once the training and inference permutations match. Ruling (b) — "the target is
  unlearnable" — is **refuted** for this dataset.
- The reproducer for the fix is `v13/tools/reencode_v31.ts`; the dataset is
  `v13/out/v13_20260924_t13/T13-07/data_v3_b0_v31/`.
- Game strength is reported separately in `eval_b0v31_s*_midway.json`. **No strength
  claim is made here.**

## Game evaluation, and the gap it exposes

3-player `SDPLAN:sd-3p-normal-extra:(3) Midway.aem`, seeds `2026070501/2026070502`, all
engine-discovered seats, `maxSteps 20000`, wall clock capped at 300 s per arm.

| Model seed | candidate natural wins | candidate arms natural | mirror natural wins | delta | wall timeouts |
|---|---|---|---|---|---|
| 42 | **0** | 4/6 | 2/6 | **−0.500** | 2 |
| 1337 | **0** | 4/6 | 2/6 | **−0.500** | 2 |
| 2026 | **0** | 2/6 | 2/6 | **−1.000** | 4 |

Zero fallbacks; p50 34–39 ms. Across all three seeds: **0 natural wins in 10 arms that
reached a verdict**, versus 6/18 for the all-heuristic mirror.

**The wall-clock behaviour changed and this is a real observation, not noise.** The v3.0
models hit the cap in 3 of 18 arms; the v3.1 models hit it in **8 of 18**, and several ran
3,000–4,000 steps against a v3.0 median around 1,500–2,700. A model can be "learning the
teacher" offline and still produce longer, less decisive games — that is exactly what the
timeout counts say here.

**So the offline gain did not transfer.** The model is 22× chance at predicting the
teacher's action and still wins **zero** natural games in 12 attempts, against a mirror
that wins 2/6 on the same seats, both seeds.

This is the honest headline, and it is a stronger statement than the first round could
make. The first round could only say "the task was mis-specified". This round says:
**the task was mis-specified, it is now correctly specified and demonstrably learnable,
and correcting it did not produce playing strength.**

Three readings are consistent with the data, and none is excluded yet:

1. **31% top-1 against a teacher is not enough.** Two of three decisions still differ from
   the teacher; those differences may be exactly the ones that decide games.
2. **Imitating this teacher may not be the route.** The teacher here is HeuristicAI, which
   is also the opponent. A policy trained to copy it at 31% is a noisy version of it, and a
   noisy version of a policy loses to that policy — which is what every measurement in this
   project has shown, across five different training attempts.
3. **One map, two seeds, 6 arms per model.** The mirror wins exactly one seat (P1) in both
   seeds, so the map carries a strong seat preference and the intervals are wide.

Reading 2 is the one that should change the plan: **B2 (search distillation) is now the
better-motivated next step than another imitation round**, because the taskbook's B2 target
is a *stronger* teacher, not a copy of the opponent. That requires T13-06, which is still
not started and whose V12 17/20 remains provisional.

## Candidate coverage under the new ordering (T13-04 completion)

Recall re-measured on 22,226 rows in engine legal order, with selectors that never look at
the label (`v13/tools/coverage_curve.py`). The teacher sits at engine index 0 in
**14.06%** of rows — the earlier 17.67% and this figure agree.

| cap | first-N in legal order | priority-type-first | gain |
|---|---|---|---|
| 6 (the label tool's budget) | 0.3681 | 0.4283 | +0.0602 |
| 16 | 0.5635 | 0.6167 | +0.0532 |
| 32 | 0.6867 | 0.7299 | +0.0431 |
| **48 (the old training cap)** | **0.7488** | **0.7875** | +0.0387 |
| 64 | 0.7949 | 0.8275 | +0.0325 |
| 128 | 0.9023 | 0.9184 | +0.0161 |
| 256 | 0.9789 | 0.9836 | +0.0047 |
| 512 | 0.9999 | 0.9999 | 0.0000 |

Two conclusions the earlier round could not state:

- The old 48-cap preserved only **78.75%** of teacher decisions under the best
  label-independent rule, so **21% of what the teacher did was never even a candidate.**
- **A 48-cap cannot be fixed by a better heuristic.** Recall only reaches ~92% at 128
  candidates and ~98% at 256. Meaningful coverage requires full legal candidates.

This dataset used full legal candidates, so the 31% figure is not coverage-limited.

- Teacher recall under the new ordering was not re-measured (T13-04's number, 75.27%, was
  measured against the old converter order and must not be reused).
- One arm per model on one map is a directional reading, not a certified effect size.
- B1 / B2 / B3 were not run.
