# TASK 3 — Audit of the HISTORICAL evaluation protocols for seat / policy-assignment / RNG / truncation confounds

- Repo `C:\code\AncinetEmpires`, branch `train/battle-ai-20260923`, HEAD `9c6c1ab`
- Method: **static reading first** — every behavioural claim about a harness carries a `file:line`.
  No historical harness was modified, "fixed", or executed.
- New artifacts produced by this audit (nothing else was touched):
  - `v12/tools/audit_mirror_seat_bias.ts` (new mirror-control tool)
  - `v12/out/protocol_audit/mirror_seat_bias.json` (raw mirror-control results)
  - `v12/out/protocol_audit/harness_audit.json` (machine-readable per-harness findings)
- Defect code referenced throughout: **`V11-D01`** = `new HeuristicAI()` with **no argument** falls back
  to `Math.random` — `src/game/ai/heuristic_ai.ts:16-17` `constructor(rng?: Rng) { this.rng = rng ?? Math.random; }`,
  and the stream perturbs real decisions (`:87`, `:168`, `:274` … `this.rng() * 20`).
  The project's own record of it is `v11/out/self_audit.json:8-27` (severity P0), whose symptom is decisive:
  two control arms with **identical configuration** produced different games
  (`planner 0W/2L` vs `planner_zeroed 2W/2L`, `engineTransitions` 29867 vs 21004), because the random
  tie-breaker "足以翻转基准动作，进而让整局棋分岔" (`v11/out/self_audit.json:12-13`).
  So V11-D01 is not a cosmetic defect: it demonstrably flips game outcomes.

**Not run / not verified:** no historical harness was executed (process creation is sandbox-denied and
re-running them was out of scope). The literal BattleSearchAI `17/20` was **not** re-run — no artifact of
that run exists anywhere in the repo, so only its *protocol* is auditable, not its number.
`training_runs/evaluation_20260918/results.json` was not read.

---

## 1. Comparison table

Legend — **Seats alt.?** = do the two sides swap seats across games. **Mirror?** = does the harness itself
run a same-policy/same-both-sides control on its own map. **Seeded?** = are RNG streams seeded and
deterministic (V11-D01 present?). **End** = how games terminate + measured truncation fraction.

| # | Harness (`file:line`) | 1. Map / state, players | 2. Seats alternated? | 3. Mirror / seat-bias control | 4. RNG seeded? (V11-D01) | 5. Termination + measured truncation | 6. Verdict |
|---|---|---|---|---|---|---|---|
| H1 | `tools/train_battle_eval_uncapped.ts:34,47,77` — BattleSearchAI **17/20** | `createDefaultAppGameState()` = `(2) Duel.aem` + SD (`default_state.ts:4-6`, `apk_skirmish_map_assets.ts:7,79-82`); 2p | **Yes**, 10/10 (`:77` `newGoesFirst = i % 2 === 0`) | **None** in-harness (this audit supplies one) | **Yes, fully** — `:37` `new BattleSearchAI(hSeedBase + 777, …)`, `:38` `new HeuristicAI(mulberry(hSeedBase + 999))`; `battle_search_ai.ts:56-60` seeds its own stream and passes it to its inner heuristic. **No V11-D01.** | Safety cap 600 turns / 48000 steps (`:46-47`); capped ≠ win (`:55,79-81`) | **SURVIVES** (protocol); the number itself is **UNVERIFIABLE as a record** |
| H2 | `tools/v6_all_models_vs_heuristic_5maps_benchmark.ts:156,381,386` — "every model **0/10**" | `createAppApkSkirmishGameState(map,'SD')` × 5 APK maps (`:34-40`); 2p | **Yes**, 1 game per seat per map (`:381` model=P0, `:386` model=P1) | **None** | **No** — `:276` `const heuristicAi = new HeuristicAI();` ← **V11-D01**; no seed in the file. Models are deterministic argmax (`:297-305,322,339,357`) | Turn cap 100 (`:166,150`). Artifact: **0 truncations, 0 draws — 40/40 natural wins for HeuristicAI** | **SURVIVES** the seat confound; **UNVERIFIABLE** for reproducibility |
| H3 | `tools/v6_spatial_vs_heuristic_5maps_benchmark.ts:139,278,282` — Spatial **0/10** | same 5 APK maps (`:27-33`); 2p | **Yes**, 1 game per seat per map | **None** | **No** — `:271` `const heuristicAi = new HeuristicAI();` ← **V11-D01** | Turn cap 100 (`:155`). Artifact: `drawsOrTruncations: 0` → 10/10 natural | **SURVIVES**; **UNVERIFIABLE** for reproducibility |
| H4 | `tools/skirmish_spatial_match_benchmark.ts:44,53,122` — `spatial-match-benchmark.json` | `createDemoState(getApkSkirmishRuleConfig('SD'))` (`:44`); 2p | Nominally yes (`:130` `i % 2`), **but aliased to the seed** (`:128` `seed = seedStart + i`) — and the seed argument is *only* used for the `matchId` (`:86`) | **None** | **No** — `:46` `new HeuristicAI();` ← **V11-D01**; `createDemoState`/`GameEngine` take no seed | **Step cap 80** (`:122`, caller `:200` passes no `maxSteps`). Artifact: **8/8 UNRESOLVED_MAX_STEPS_TRUNCATION**, `naturalWinRate 0` | **CONFOUNDED (vacuous)** |
| H5 | `tools/skirmish_ai_duel_benchmark.ts:207-208` — **65 % / 35 %** | real APK 2p SD scenarios (`:163-165`); 2p | Named policy on P0 flips (`:207`), but P0 is a fixed slot (`:96-98`) and the flip is **the same bit as the seed increment** | **None** | Seeded (`:208`, `:99-102`, `:210-213`), **but seat parity ≡ seed parity**; no V11-D01 | Ply cap + **army-value adjudication folded into the winner** (`:108`). Artifact `sd_ai_duel_20260706_2p_t20/summary.json`: **17/20 adjudicated**, only 3/20 natural | **CONFOUNDED** |
| H6 | `tools/v6_commander_specialist_pipeline.ts:783,787` — `all-policy-before-after.json` | `createDemoState(sdRules)` (`:783`); 2p | **Yes**, `MATCHES=4` → 2 per seat (`:777,779`) | **Partial but decisive**: the `heuristic` arm is heuristic-vs-heuristic and scored **0W-1L-3T** | **No** — `:680` (and `:157`) `new HeuristicAI();` ← **V11-D01**; `:781` `const seed = 7000 + m * 17;` is **dead code** | **Turn 35 AND 300 steps** (`:787`). Truncations per 4 games: heuristic 3, BC 2, Spatial v1 2, Spatial v2 2, NET_A 2, NET_B-new 3, NET_B-old 1, random 0 | **CONFOUNDED** |
| H7 | `tools/run_match_evaluation_200turns.ts:122,150` | `createDemoState(getApkSkirmishRuleConfig('SD'))` (`:122`); 2p | Only 2 games total, one per seat (`:276,279`) | **None** | **No** — `:124` `new HeuristicAI();` ← **V11-D01**; no seed | Turn cap 200 (`:120,150`); console-only, **no artifact** | **UNVERIFIABLE** |
| H8 | `tools/sd_training_plan_runner.ts` + `tools/skirmish_training_runner.ts:1026-1031` + `tools/sd_training_state_generator.ts:157` — archive **75.27 % / 24.73 %** | SD plan scenarios, `SDPLAN:` prefix (`sd_training_state_generator.ts:98`); 2–4p | Only *as a group*, and **only through the seed**: `heuristicOffset = Math.abs(episodeSeed) % 2` (`:1028`) | **None** — no heuristic-vs-heuristic or apk-like-vs-apk-like game anywhere in the archive | Seeded (`:1004`, `:649`, `:656`) but **confounded**: `seedBase 2026070501` is odd and `planIndex*100000`/`mapIndex*1000` are even (`training_configs/sd_training_plan_20260705.json:29`), so `seed % 2 ≡ (1+episodeIndex) % 2` → **seat parity IS seed parity**. No V11-D01. | Ply cap 200 + timeout adjudication folded in (`sd_training_plan_runner.ts:279-280`, `skirmish_training_runner.ts:1287-1288`); **392/1395 (28.1 %) episodes had no natural winner** (`v12/out/training/seat_asymmetry.txt:1-3`) | **CONFOUNDED** |
| H9 | `tools/sd_strategy_timing_benchmark.ts:613,616` — **53.33 % / 46.67 %** | SD 2p scenarios (`:579-580`); 2p | **Yes, both directions** (artifact: `p0Policy` = apk-like 10 / heuristic 10 / random 10) — best of the `sd_*` family | **None** | Seeded (`:616`, `:273`) but `swapSides ≡ repeatIndex % 2` is the same bit added to the seed; no V11-D01 | Turn cap 500 + adjudication folded in (`:284`); **5/30 (16.7 %) non-natural** | **CONFOUNDED (mildly)** |
| H10 | `tools/skirmish_final_eval_runner.ts:115,128` → `teacher-qualification.json` **GLOBAL_GO** | domain-specific holdout episodes; 2p | Alternated (`:128`), **but one seat wins every decided game** | **None** | not assessed here | Cap 150 (final) / 200 (teacher). **final-eval: 8/8 truncated**; teacher-eval endgame 4/8, normal 5/8 | **CONFOUNDED** |
| H11 | `tools/v7_unified_evaluation.ts:446,510,988` — the v10/T10 numbers | `createAppApkSkirmishGameState(mapName,'SD')` ± setup variants (`:446-448`); 2p | **Yes** — `:988` `for (const seat of [0, 1] as const)` | **Only** by running HEURISTIC as candidate: `new_checkpoint_benchmark.json` HEURISTIC `winRateNaturalOnly 50` (6W/6L/8T) | Seeded for policy arms (`:464,472,296-298`), **but `:984` `new TurnAwareSearchEngine(new HeuristicAI(), …)` is never re-seeded** ← **V11-D01**; also `:244 deterministicReplay: false` → wall-clock-dependent search | Hard cap 45 turns / 800 steps, no adjudication (`:510`) | **MIXED** |
| H12 | `tools/skirmish_multiscenario_eval.ts:20,42,48` | 4 SD 2p maps × fixed seeds × opponents × seats; 2p | **Yes** — `:20` `for (const seat of [0, 1])` | **None** | Seeded (`:48`), no V11-D01 | Ply cap 400 / 25600 steps; natural vs adjudicated reported separately (correct) | **SURVIVES with caveat** (numbers not read) |

Additional `sd_*` artifacts found (same family as H5) and counted separately in §3.

### Cross-cutting facts this table rests on

- **The game engine itself has no RNG.** `src/game/engine.ts` contains no `Math.random`, and
  `createAppApkSkirmishGameState(name, mode)` (`src/game/apk_skirmish_map_assets.ts:79-82`) takes **no seed** —
  so initial positions depend only on map (+ setup), and a "seed" only varies policy noise.
  The project states this itself: `tools/v10fix/pipeline.ts:120`
  `'seeds only change policy/heuristic RNG; they do not create different initial positions.'`
  Consequence: re-running a seed set is **pseudo-replication**, and a harness that changes only the seed
  is not sampling different positions.
- **V11-D01 appears in every unseeded benchmark harness audited**: `v6_all_models…ts:276`,
  `v6_spatial…ts:271`, `skirmish_spatial_match_benchmark.ts:46`, `v6_commander_specialist_pipeline.ts:157,680`,
  `run_match_evaluation_200turns.ts:124`, `v7_unified_evaluation.ts:984`, `v10_dagger_controlled.ts:162`,
  `v10_expert_iteration.ts:76,291`, `v8_search_profile.ts:55`, `v9_benchmark_search.ts:15,84`,
  `v9_run_reeval_01.ts:215`, `skirmish_live_match.ts:99`, `skirmish_spatial_dataset_export.ts:66`.
  It is **absent** from the archive path (`skirmish_training_runner.ts:649,656`) and from
  `train_battle_eval_uncapped.ts:37-38`. **The project's reproducibility defect and its seat confound live in
  different halves of the pipeline:** the training archive is reproducible but confounded;
  the benchmark harnesses are seat-cleaner but non-reproducible.
- **Dead seed variables create false reproducibility**: `v6_commander_specialist_pipeline.ts:781`
  `const seed = 7000 + m * 17;` is never read; `skirmish_spatial_match_benchmark.ts:128` computes a seed that
  reaches only the `matchId` (`:86`).

---

## 2. Mirror-control measurements (raw)

Tool: `v12/tools/audit_mirror_seat_bias.ts` (new). Design: replay each harness's **own** map, seat layout and
termination rule with **HeuristicAI in every seat**; one deterministic stream per seat,
`mulberry(hash(seed, seat))` — **never `Math.random`**. Raw results: `v12/out/protocol_audit/mirror_seat_bias.json`.

| Config replayed | Map | Games | Cap | Natural wins by seat | Draws | Truncated | Mean steps / turn |
|---|---|---:|---|---|---|---|---|
| H1 (`train_battle_eval_uncapped` loop) | `createDefaultAppGameState()` = `(2) Duel.aem` SD | 10 | 600 turns (`safetyTurns*80` steps) | **P0 2 / P1 8** | 0 | 0 | 319.4 / 14.4 |
| H4 (`skirmish_spatial_match_benchmark`, historical cap) | `createDemoState(SD)` | 10 | **80 steps** | P0 0 / P1 0 | 0 | **10 (100 %)** | — |
| H4, cap raised | `createDemoState(SD)` | 10 | 4000 steps | **P0 1 / P1 9** | 0 | 0 | 346.9 / 15.7 |
| H2/H3 (`v6_*_5maps` loop) | `(2) Duel.aem` SD | 8 | 100 turns | **P0 1 / P1 7** | 0 | 0 | 330.4 / 14.5 |
| H2/H3 (`v6_*_5maps` loop) | `(2) Duel.aem` SD | 4 | 100 turns | **P0 1 / P1 3** | 0 | 0 | 343.5 / 15.3 |
| H2/H3 (`v6_*_5maps` loop) | `(2) Liberty Port.aem` SD | 4 | 100 turns | **P0 1 / P1 3** | 0 | 0 | 974.8 / 28.3 |
| H2/H3 (`v6_*_5maps` loop) | `(2) Mourningstar.aem` SD | 4 | 100 turns | **P0 0 / P1 4** | 0 | 0 | 423.8 / 16.3 |
| H2/H3 (`v6_*_5maps` loop) | `(2) Crossed swords.aem` SD | 4 | 100 turns | **P0 0 / P1 4** | 0 | 0 | 511.0 / 15.0 |
| **v6 map set, pooled** | Duel (12) + Liberty Port (4) + Mourningstar (4) + Crossed swords (4) | **24** | 100 turns | **P0 3 / P1 21 (P1 = 87.5 %)** | 0 | 0 | — |
| **Duel alone, both seed blocks** | `(2) Duel.aem` SD | **12** | 100 turns | **P0 2 / P1 10** | 0 | 0 | — |

Computed binomials against a fair seat null (arithmetic on the counts above, not a measurement):
pooled v6 set P1 21/24 → one-sided p = 1.39e-4, **two-sided p ≈ 2.8e-4**;
Duel alone P1 10/12 → one-sided p = 0.019, two-sided p ≈ 0.039.

**`(2) Icy Paths.aem` was NOT run** (5th v6 map). Reason measured, not assumed: one all-heuristic game on that
map costs **150–357 s** (an aborted attempt logged 1265 steps/174 868 ms, 3434 steps/356 884 ms,
1594 steps/150 158 ms, winners P0/P1/P0 — those three games are *not* part of the artifact above).

Exact invocation:

```
node --openssl-legacy-provider v12/tools/run-tool.mjs v12/tools/audit_mirror_seat_bias.ts \
  --harness all --games 10 --per-map-games 8 --apk-hard-step-limit 40000 \
  --out v12/out/protocol_audit/mirror_seat_bias.json        # part A: seeds 2026070601+ , Duel n=10 then n=8
node --openssl-legacy-provider v12/tools/run-tool.mjs v12/tools/audit_mirror_seat_bias.ts \
  --harness apk5-sd --per-map-games 4 --apk-hard-step-limit 40000 \
  --apk-maps "Duel|Liberty Port|Mourningstar|Crossed swords" \
  --out v12/out/protocol_audit/mirror_seat_bias.json        # part B: seeds 2026070601..604 on 4 of the 5 v6 maps
```

Both parts write per-game rows into `apk5PerGameLog` (17 rows) so a slow map cannot destroy earlier results.

### What these mirror measurements establish

1. **Seat bias is real, large, and map-specific.**
   - `(2) Duel.aem` SD: **P1 8 / P0 2** (n=10) and **P1 7 / P0 1** (n=8, independent seed block) → 10/12 P1 overall.
   - `(2) Liberty Port.aem` **P1 3 / P0 1**, `(2) Mourningstar.aem` **P1 4 / P0 0**, `(2) Crossed swords.aem` **P1 4 / P0 0**.
     Pooled over the four measured v6 maps: **P1 21 / P0 3 (87.5 %), two-sided p ≈ 2.8e-4.**
   - demo map SD: **P1 9 / P0 1** (n=10).
   - teacher-eval endgame domain, read straight off the raw rows: **P0 4/4, P1 0/4** — the *opposite* direction.
   - `(4) Crossroads` SDPLAN (prior round): **P2 7/7**.
   → There is **no portable "seat correction"**. A harness must carry a mirror control on its own map.
2. **The 80-step cap in H4 is the whole story.** At 80 steps: 10/10 truncated, zero wins for anybody.
   At 4000 steps: 10/10 natural, mean 347 steps. The cap is ~4.3× below the map's natural game length.
   So `spatial-match-benchmark.json`'s "0 wins" is a measurement of the cap.
3. **Alternation does not remove seat variance, it only centres the null.** With 10 games per seat, a
   policy-independent seat effect cannot push a one-sided result past 10/20 — which is exactly why H1's 17/20
   is not a seat artifact. But with 2 games per seat (H5, H7) or 1 game per seat per map (H2, H3),
   the per-seat split is still dominated by seat noise.
4. **The measured bias strengthens, rather than weakens, the v6 "0/10" verdict.** The v6 harness gives each
   model 5 games in P0 and 5 in P1 on each map set, and P1 is the seat that wins ~87 % of all-heuristic games.
   A model merely equal to HeuristicAI would therefore be expected to win most of its **P1** games; all four
   models won **none** of them. So the zero is not the seat failing to help — it is the model losing the seat
   that wins by default. (Caveat: the mirror measures the seat effect only in the all-heuristic configuration;
   a policy×seat interaction would weaken this argument, though not the direct artifact evidence in §3 that
   both seats were occupied and lost.)

---

## 3. Verdict per historical headline number

### No longer citable — CONFOUNDED

| Historical number / conclusion | Where it lives | Why it must not be cited |
|---|---|---|
| `spatial-match-benchmark.json`: **Spatial ResNet 0 wins / 8, natural win rate 0.0 %** | `docs/training/reports/spatial_benchmark_01/spatial-match-benchmark.{json,md}` | **0 of 8 games reached a terminal state** — 8/8 `UNRESOLVED_MAX_STEPS_TRUNCATION` at an 80-step cap, while the same map resolves in ~347 steps on average. The model was never given a game. Additionally the seed is aliased to the seat and reaches nothing but the `matchId`. |
| **Archived SD dataset: winner is `heuristic` 75.27 % vs `apk-like` 24.73 %** | `v12/out/training/winner_vs_policy.txt:1-8`, quoted in `v12/out/training/FINDING_seat_policy_confound.md:36-39`, `v12/V12_EXECUTION_REPORT.md:218-219` | Seat is `(playerIndex + |seed| % 2) % 2` (`skirmish_training_runner.ts:1028-1031`) and `seed = 2026070501 + planIndex*100000 + mapIndex*1000 + episodeIndex` (`sd_training_state_generator.ts:157`) → **seat parity IS seed parity**, with no mirror arm in 1,395 episodes. (Direction is still real *as mechanism*: `src/game/ai/apk_like_ai.ts:31` is a `HeuristicAI` with injected noise at `:166` and a 20 % random tie-break at `:170`.) |
| **SD handover baseline 65 % / 35 %** | `training_runs/benchmarks/sd_ai_duel_20260706_2p_t20/summary.json` → `winsByPolicy {heuristic 13, apk-like 7}` | **17 of 20 games were army-value adjudications** (verified: 20/20 rows carry a non-null `adjudicatedWinnerAlliance`, only 3/20 a natural winner) and the seat flips on exactly the index that seeds the game (`skirmish_ai_duel_benchmark.ts:207-208`). |
| **`sd_ai_duel_20260706_2p`: heuristic 2/2 = 100 %** | `training_runs/benchmarks/sd_ai_duel_20260706_2p/summary.json` | The entire sample is **2 games on one map** (`SD:(2) Icy Paths.aem`, seeds 20260706/707). Heuristic won from both seats, so it is not a seat artifact — it is simply n=2. |
| **`all-policy-before-after.json`: every policy 0 wins** | `docs/training/reports/agent_upgrade_20260921_v6_01/all-policy-before-after.json` | **The reference policy scores 0 wins too** — `HeuristicAI (Baseline)` records 0W-1L-**3T** in the same harness. With a 300-step cap on a map whose natural games average ~347 steps, "0 wins" is a floor effect, on top of V11-D01. |
| **`teacher-qualification.json` GLOBAL_GO**: endgame `winRate 0.5` "4W-4D-0L"; normal `lossRate 0.0` "0 losses across all 8 games" | `docs/training/reports/agent_upgrade_20260920_01/teacher-qualification.json` | Verified from raw rows, not from the summary: **all 8 `final-eval.jsonl` rows are `stepCount=150, winnerAlliance=null, draw=true`** (100 % truncation = "0 losses"); and in `teacher-eval.jsonl` the teacher won **4/4 as P0** (steps 108/132/132/108) and **0/4 as P1**, where all four P1 games sit at exactly `stepCount=200` with no winner. The positive endgame signal is a pure P0 seat artifact. (The project re-derived this later at `historical-outcome-reanalysis.json` — verdict `DISPUTED_ALL_TRUNCATED` plus `seatBreakdown {p0TeacherWins 4, p1TeacherWins 0, p1TeacherTruncated 4}`; this audit reproduced both from the raw JSONL.) |
| **identity_01 3-arm DAgger comparison**: `deltaArmC_vs_ArmB_winRate: 0` | `docs/training/reports/agent_upgrade_20260923_v10_identity_01/dagger_controlled_report.json` | Arms B and C carry the **identical checkpoint sha256** `baa9fcb5…a9eaf` — the "delta" compares one model with itself. |
| **T10 search comparisons**: `T10_TURN_SEARCH naturalWinRate 0` vs `S00_SEARCH 46.2` | `…v10_fix_01/search_comparison.json`, `T10-04_formal_comparison.json` | The turn-search arm's heuristic is **never re-seeded** (`v7_unified_evaluation.ts:984` ← V11-D01), and `tools/v10fix/pipeline.ts:62` `const truncations = outcomes.length - wins - losses - draws;` lumps **ENGINE_ERROR aborts into "truncations"** (14 engine errors reported as `truncationRate 70`). The file itself carries `requiresRerun: true`. |
| **`expert_iteration_round1.json` "losses 10 → 3, −70 %"** | `v10/expert_iteration_round1.json` | The "loss reduction" is purely truncation growth (10 → 17) at a 300-step cap, with a per-arm unseeded opponent (`v10_expert_iteration.ts:291`) and a dead seed (`:296`). |
| **`S10_SEARCH_BEST 55.6 %` vs `S00_SEARCH 53.8 %`** | `T10-01_confirmation.json` | Unequal, early-stopped arms (20 vs 22 matches) at 41–55 % truncation; the file's own conclusion is `INCONCLUSIVE … do not claim a search improvement`. |
| **`sd_strategy_timing_30x500`: 53.33 % / 46.67 %** | `training_runs/benchmarks/sd_strategy_timing_30x500/summary.json` | Mildest of the family: seats genuinely swap both ways (verified: `p0Policy` = 10/10/10), but the swap variable *is* the seed increment (`:613,616`), there is no mirror arm, and 5/30 games are adjudications. 53/47 is not distinguishable from a coin flip at n=30 either. |
| **`v10_dataset_and_split.ts:249` "5W/8L/0D/7T … 75 % W/N on Liberty Port"** | `dataset_v10_manifest.json` `selectedReason` (hard-coded string) | A per-map claim carved out of a 20-match dev sample at ~35 % truncation; the basis is not reproducible from the artifact. |
| `sd_strategy_timing_smoke/summary.json`: random 2/3 = 66.7 % | `training_runs/benchmarks/sd_strategy_timing_smoke/summary.json` | **3 episodes at `maxTurns = 1`.** It is named "smoke" and must never be read as a result. |
| Any W/L from `tools/run_match_evaluation_200turns.ts` | stdout only | n=2, unseeded opponent, no stored artifact. |

### Still citable — SURVIVES

| Historical number / conclusion | Where it lives | Why it survives |
|---|---|---|
| **BattleSearchAI 17/20 vs HeuristicAI** | Prose only: `v12/V12_EXECUTION_REPORT.md:231-233`, `v12/out/training/FINDING_seat_policy_confound.md:71` | It is the **only audited W/L harness with a fully seeded opponent** (no V11-D01: `train_battle_eval_uncapped.ts:37-38`, `battle_search_ai.ts:56-60`), it alternates seats **10 games each** (`:77`), and it does **not** count capped games as wins (`:55,79-81`). Alternation keeps the seat-stratified null at 10/20 regardless of bias magnitude, and this audit measured the bias on that exact map (P1 8/10): a seat-only effect **caps at 10/20**, so 17/20 cannot be produced by seat assignment. Truncations were not folded into wins. |
| **v6 five-map: every model 0 wins in 10 games (and 0/40 overall)** | `docs/training/reports/agent_upgrade_20260921_v6_01/all_models_vs_heuristic_5maps_benchmark.json` | A seat confound **cannot** manufacture it: every model has `p0Wins 0` **and** `p1Wins 0`, i.e. it lost in both seats on all 5 maps; a seat-determined winner would have handed it 5 wins per model. All 40 games were **natural** (`losses 10, draws 0` per model, 0 truncations), and the models' commanders died 10–13 times each. The mirror makes this sharper: **P1 is the seat that wins 21/24 (87.5 %) of all-heuristic games on these maps**, and all four models lost **every one of their 5 P1 games**. Interpretation: **valid as a statement about those four checkpoints**, not about "learned policy" in general. |
| **v6 five-map: Spatial ResNet v2 0 wins / 10** | `…/spatial_vs_heuristic_5maps_10matches.json` | The artifact is self-refuting for a seat explanation: `heuristicWins 10`, `spatialWins 0`, **`p0WinsTotal 5` / `p1WinsTotal 5`** — the heuristic won 5 games from each seat, so the winner tracks the *policy*, not the seat. With the measured 87.5 % P1 baseline, the model lost all 5 games in the seat that wins by default. |
| **`new_checkpoint_benchmark.json`: HEURISTIC self-mirror = 50 %** | `…v10_identity_01/new_checkpoint_benchmark.json` `winRateNaturalOnly` HEURISTIC 50 (6W/6L/8T) | This is the one place in the v10 family where a same-policy control exists, and it shows **no measured seat bias** on the v7 suite's maps at n=12 decided games. It therefore licenses the *relative* ranking of the other arms in that file (S00 41.2, S10 38.5, SPATIAL_V2_BEST 0, SPATIAL_V2_OLD 13.3, SPATIAL_V2_LAST 0) — while still being a small-n, 10–40 %-truncation assay. |
| **v10_fix_01 3-arm DAgger null** (`naturalWinRate 0` for arms A/B/C, distinct SHAs) | `…v10_fix_01/dagger_controlled_report.json` | Distinct checkpoints and 20 paired matches/arm → a real (if floor-effect) null: DAgger produced no natural win. |
| **`historical-outcome-reanalysis.json` verdict `DISPUTED_ALL_TRUNCATED`** | `docs/training/reports/agent_upgrade_20260920_v4_01/historical-outcome-reanalysis.json` | This audit re-verified it line-by-line against `final-eval.jsonl`: 8/8 rows `stepCount=150, winnerAlliance=null, draw=true`. The retraction is correct and should be kept. |
| **Mechanism claim: `apk-like` is a strictly noisier `HeuristicAI`** | `src/game/ai/apk_like_ai.ts:31,166,170` | `this.heuristic = new HeuristicAI(() => this.rng());` plus injected score noise (`score = baseScore + (… ? this.rng() * 16 : 0)`) and a random tie-break — same scorer, noisier selector. This explains the *direction* of the 75/25 split without needing the confounded number. |

### UNVERIFIABLE (cannot be cited either way)

| Item | Why |
|---|---|
| The **literal** `17/20` | No artifact of the 20-game run exists anywhere in the repo (the tool writes no file; `train_battle_eval_uncapped.ts` has no `writeFileSync`). The protocol is sound (§ above) but the recorded number cannot be checked. |
| The **per-seat split** of that 17/20 | Never logged to a file, so the seat-stratified effect size is unknown. |
| The supporting claim "**Duel heuristic-mirror baseline 2–2 (no seat bias)**" | Cited at `FINDING_seat_policy_confound.md:71,92` and `V12_EXECUTION_REPORT.md:232`, but **no raw artifact for it exists** in `v12/out/**` (searched). It is **contradicted** by this audit's mirror on the same map: **P1 8 / P0 2** (n=10) and **P1 7 / P0 1** (n=8) = **P1 10/12 pooled**. The conclusion drawn from it ("the 17/20 is unaffected") happens to survive, but for the alternation reason, **not** because Duel is unbiased. |
| **Exact v6 / H4 / H6 / H7 game records** | V11-D01 makes them non-reproducible; the head-to-head results can be re-derived, but the specific games cannot be replayed. |
| `training_runs/evaluation_20260918/results.json` (H12 numbers) | not read |
| **`(2) Icy Paths.aem` seat bias** (5th v6 map) | **NOT RUN** — one all-heuristic game costs 150–357 s (measured). Icy Paths therefore has no mirror in this audit; do not assume it resembles the other four. |

---

## 4. What this changes for the project, in one paragraph

The seat/policy confound is **not one defect, it is a family**, and it bites in different places than the
reproducibility defect. The archive (H8) is *reproducible but confounded* — seat parity is literally the same
bit as the seed. The old benchmark harnesses (H2, H3, H4, H6, H7) are *seat-adjusted or seat-alternating but
non-reproducible* (V11-D01) and, in H4 and H6, additionally **capped below the map's natural game length**,
which is what actually produced their zeroes. The one historical number that survives on the merits,
BattleSearchAI's 17/20, survives because it is the only harness that is both **seeded** and
**seat-balanced** — and its earlier defence ("Duel has no seat bias") was wrong; Duel has a large P1 bias
(8/10). Going forward the minimum bar is the one `v12/tools/eval_paired_seats.ts:17-22` already implements:
the same (seed, seat) played twice — candidate-at-seat vs **all-heuristic mirror** with identical per-seat
streams — so that `delta(seat) = winRate_candidate(seat) − winRate_mirror(seat)` is the only quantity
reported, plus an explicit truncation rate and a cap set above the measured natural game length.
