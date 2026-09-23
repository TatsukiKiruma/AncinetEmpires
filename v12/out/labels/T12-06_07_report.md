# T12-06 + T12-07 — continuous proxy-Q labels and a high-information decision prescreen

- Generated: 2026-09-23T16:35:21.880Z
- Repo: `C:\code\AncinetEmpires`, branch `train/battle-ai-20260923`, HEAD `9c6c1ab`
- Provenance of every label: `proxy_reference:battle_search_ai_v3:maximin_leaf(6,3)`
- Decisions compared in this run: **256**

## 1. Exact commands

```powershell
# NOTE: run-tool.mjs loads vite, whose Windows "safe realpath" probe shells out to
# `net use`. This sandbox denies process creation, so the in-repo preload shim
# (the same one v11/tools/run-tests.ps1 uses) must be attached to the loader.
node --require ./v11/tools/core-spawn-shim.cjs v11/tools/run-tool.mjs v12/tools/search_labels.ts --episodes 32 --per-episode 8 --determinism 3 --policy-check 12 --footing-ids-file v12/out/labels/b2_recovered_decision_ids.json
pwsh -File v11/tools/run-tests.ps1
```

## 2. What changed in the game AI (one line, behaviour-preserving)

`src/game/ai/battle_search_ai.ts`: `private evaluateCandidate(...)` -> `public evaluateCandidate(...)`.
The body, the seeding contract and every call site are untouched; only the visibility modifier and a
doc comment changed. Nothing in the class reads or writes new state.

```diff
-  private evaluateCandidate(engine: GameEngine, playerId: number, action: Action): number {
+  public evaluateCandidate(engine: GameEngine, playerId: number, action: Action): number {
```

No game rule was modified. The tooling in this task writes only under `v12/out/labels/`; it reads `v11/out/*.json` and `v11/out/*.jsonl` but never writes there. (Other files may appear modified in the working tree from parallel tasks on this branch — e.g. `tools/convert_archive_to_spatial.ts`, which carries a T12-03 banner and is not part of this task.)

## 3. Decisions actually compared

| quantity | measured |
|---|---:|
| episodes loaded | 32 |
| episodes skipped | 0 |
| decision points planned | 256 |
| **decisions compared** | **256** |
| decisions skipped at evaluation | 0 |
| leaf evaluations (candidates x decisions) | 1443 |
| episodes file | `training_runs/agent_upgrade_v11_b2_main/episodes.jsonl` |

Sampling: plan=`uniform`, per-episode=`8`, step band=[0.08, 0.92]. Both the sampling function (`tools/v11/labels.ts` -> `sampleDecisionPoints`) and the step band are the ones the batch-2 labels used; the per-episode count is larger, and because `sampleDecisionSteps` takes a prefix of one deterministic shuffle, a larger count is a **strict superset** of any smaller count on the same episode. That is what makes the batch-2 subset recoverable below.

## 4. The ΔQ distribution

```
dQ(a) = leaf(a) - leaf(a0)
leaf   = BattleSearchAI v3 maximin leaf = worst case over the opponent's most dangerous replies
a0     = the Heuristic top choice (what BattleSearchAI returns unless it takes over / vetoes)
```

**distinctDeltaValues = 108** (previous batch: **1**, `allDeltasEqual` was `true`). `allDeltasEqual` now = `false`. Restricted to `dQ != 0` (the batch-2 keep rule): **107** distinct values.

- All decisions: n=256, distinct=108, min=0, max=4097.5, mean=239.587891, sd(population)=523.911611, median=16, p10=0, p90=640
- `dQ != 0` only (like-for-like with batch-2): n=156, distinct=107, min=4, max=4097.5, mean=393.169872, sd(population)=624.540191, median=184, p10=8, p90=1053.5
- Non-degenerate decisions only: n=234, distinct=108, min=0, max=4097.5, mean=262.113248, sd(population)=542.572862, median=28, p10=0, p90=679
- All non-baseline candidate dQ pooled: n=1187, distinct=393, min=-2297, max=4097.5, mean=48.438922, sd(population)=489.649162, median=0, p10=-216, p90=320

Fraction of decisions where every candidate ties (no ranking information): **22/256 = 8.6%**

Breakdown of `margin = 0` (100 decisions): 22 because every candidate ties, and 78 because the heuristic baseline is already the maximin-best candidate (candidates differ, but nothing beats the baseline).

Two different criteria are reported because they answer different questions. (a) "non-degenerate" = the candidate leaves are not all equal; this is what the T12-07 prescreen asks for. (b) "dQ != 0" = some candidate beats the heuristic baseline; this is exactly the v11 batch-2 keep rule, so it is the like-for-like comparison against 20%. A decision whose candidates differ but whose baseline is already the maximin-best one has dQ = 0 and would have been dropped by batch-2 as uninformative, even though it now carries a graded candidate ordering.

### 4.1 Raw histogram — all decisions

| bin | count | |
|---|---:|---|
| [0, 204.875) | 182 | ############################## |
| [204.875, 409.75) | 34 | ###### |
| [409.75, 614.625) | 13 | ## |
| [614.625, 819.5) | 7 | # |
| [819.5, 1024.375) | 4 | # |
| [1024.375, 1229.25) | 2 | # |
| [1229.25, 1434.125) | 2 | # |
| [1434.125, 1639) | 4 | # |
| [1639, 1843.875) | 0 |  |
| [1843.875, 2048.75) | 2 | # |
| [2048.75, 2253.625) | 1 | # |
| [2253.625, 2458.5) | 1 | # |
| [2458.5, 2663.375) | 1 | # |
| [2663.375, 2868.25) | 1 | # |
| [2868.25, 3073.125) | 1 | # |
| [3073.125, 3278) | 0 |  |
| [3278, 3482.875) | 0 |  |
| [3482.875, 3687.75) | 0 |  |
| [3687.75, 3892.625) | 0 |  |
| [3892.625, 4097.5) | 1 | # |

### 4.2 Raw histogram — `dQ != 0` only (batch-2-comparable subset)

| bin | count | |
|---|---:|---|
| [4, 208.675) | 82 | ############################## |
| [208.675, 413.35) | 35 | ############# |
| [413.35, 618.025) | 12 | #### |
| [618.025, 822.7) | 7 | ### |
| [822.7, 1027.375) | 4 | # |
| [1027.375, 1232.05) | 2 | # |
| [1232.05, 1436.725) | 4 | # |
| [1436.725, 1641.4) | 2 | # |
| [1641.4, 1846.075) | 0 |  |
| [1846.075, 2050.75) | 2 | # |
| [2050.75, 2255.425) | 1 | # |
| [2255.425, 2460.1) | 1 | # |
| [2460.1, 2664.775) | 1 | # |
| [2664.775, 2869.45) | 1 | # |
| [2869.45, 3074.125) | 1 | # |
| [3074.125, 3278.8) | 0 |  |
| [3278.8, 3483.475) | 0 |  |
| [3483.475, 3688.15) | 0 |  |
| [3688.15, 3892.825) | 0 |  |
| [3892.825, 4097.5) | 1 | # |

### 4.3 Raw histogram — non-degenerate decisions only

| bin | count | |
|---|---:|---|
| [0, 204.875) | 160 | ############################## |
| [204.875, 409.75) | 34 | ###### |
| [409.75, 614.625) | 13 | ## |
| [614.625, 819.5) | 7 | # |
| [819.5, 1024.375) | 4 | # |
| [1024.375, 1229.25) | 2 | # |
| [1229.25, 1434.125) | 2 | # |
| [1434.125, 1639) | 4 | # |
| [1639, 1843.875) | 0 |  |
| [1843.875, 2048.75) | 2 | # |
| [2048.75, 2253.625) | 1 | # |
| [2253.625, 2458.5) | 1 | # |
| [2458.5, 2663.375) | 1 | # |
| [2663.375, 2868.25) | 1 | # |
| [2868.25, 3073.125) | 1 | # |
| [3073.125, 3278) | 0 |  |
| [3278, 3482.875) | 0 |  |
| [3482.875, 3687.75) | 0 |  |
| [3687.75, 3892.625) | 0 |  |
| [3892.625, 4097.5) | 1 | # |

### 4.4 Most frequent exact dQ values

| dQ | count |
|---:|---:|
| 0 | 100 |
| 4 | 16 |
| 12 | 7 |
| 16 | 6 |
| 24 | 5 |
| 8 | 3 |
| 32 | 3 |
| 80 | 3 |
| 184 | 3 |
| 20 | 2 |
| 46 | 2 |
| 88 | 2 |
| 180 | 2 |
| 280 | 2 |
| 281 | 2 |
| 316 | 2 |
| 332 | 2 |
| 416 | 2 |
| 1436 | 2 |
| 2030.5 | 2 |

### 4.5 What kind of values these are, and what the sample is made of

| property | measured |
|---|---|
| leaf evaluations | 1443 |
| raw leaf range | -25231.5 .. 34584 (p1=-16784, p50=717, p99=30069.5) |
| leaves inside the terminal band (|leaf| >= 90000) | **0** |
| decisions flagged terminal-dominated | **0** |
| decisions with a forced win available | 0 |
| decisions where the baseline is past the danger line | 75 |
| leaves where the action threw (`stepFailed`) | 0 decisions |
| label quality mix | {"PROXY_CONTINUOUS":234,"DEGENERATE":22} |
| distinct root families | 16 |
| maps | (2) Duel.aem: 64, (2) Crossed swords.aem: 64, (2) Icy Paths.aem: 64, (2) Mourningstar.aem: 64 |
| seats | seat0: 128, seat1: 128 |

Two things follow, and both matter for reading the yield numbers. First, **no leaf in this sample ever reached a real terminal** (0 leaves in the terminal band, 0 forced wins), so every label here is a pure heuristic-score proxy and `PROXY_TERMINAL` is empty — the terminal half of the leaf scale is a convention that this run never exercised. Second, this run spans 4 maps and both seats evenly, while batch-2's 40 decisions came from only 2 maps (8 Duel episodes covering both seats, plus 2 Crossed-swords seat-0 episodes). The overall 60.9% / 91.4% numbers therefore cover a **wider map and seat mix** than batch-2; the like-for-like comparison is the recovered 40-decision row in section 5, not the overall row.

## 5. Yield rate, compared with the previous batch on the same footing

The batch-2 keep rule was "some candidate separated from the baseline", i.e. `dQ != 0`. That is the strictly comparable criterion (`yield (dQ != 0)` column). The weaker "candidates do not all tie" criterion is also given, because that is what the T12-07 prescreen is stated against.

| run | decisions compared | yield (dQ != 0) | yield (non-degenerate) | distinct decision-level ΔQ | value scale |
|---|---:|---:|---:|---:|---|
| v11 batch-2 (`v11/out/label_quality.json`, `power_analysis.json`) | 40 | 20.0% (8 kept) | not measured | 1 | tanh of a {-1,0,+1} terminal payoff, range [-1,1] |
| v12 this run (all 256 sampled decisions) | 256 | 60.9% (156) | 91.4% (234) | 108 (107 over dQ != 0) | evaluatePositionHeuristic units |
| **v12 on the recovered batch-2 decision set only** | 40 | 77.5% (31) | 97.5% (39) | 28 (27 over dQ != 0) | evaluatePositionHeuristic units |

The batch-2 decision set was recovered, not assumed (v12/out/labels/b2_recovered_decision_ids.json): the published batch-2 ids (8 kept + 10 dropped examples) are reproduced exactly and uniquely by `maxEpisodes=10`, `decisionsPerEpisode=4` — 40 ids, matching the published `decisionsCompared=40`. Unique solution: `true`.

Caveat on the recovery: it is a consistency argument against the **published** ids. Only 18 of the 40 batch-2 ids were ever published, so "unique" means "the only (E,K) pair consistent with everything that was published", not a byte-level replay of the batch-2 process.

The 8 batch-2 *kept* decisions that this run reproduces, with their new continuous labels:

| decision | v11 dQ | v12 dQ | distinct leaves | v12 label quality |
|---|---:|---:|---:|---|
| `match_HEURISTIC_seat0__2__Duel_aem_s1337#20` | 2 (constant, all 8 kept labels were 2) | 710 | 5 | PROXY_CONTINUOUS |
| `match_HEURISTIC_seat0__2__Duel_aem_s1337#32` | 2 (constant, all 8 kept labels were 2) | 280 | 4 | PROXY_CONTINUOUS |
| `match_HEURISTIC_seat0__2__Duel_aem_s1337#34` | 2 (constant, all 8 kept labels were 2) | 4 | 2 | PROXY_CONTINUOUS |
| `match_HEURISTIC_seat0__2__Duel_aem_s4242#23` | 2 (constant, all 8 kept labels were 2) | 139 | 4 | PROXY_CONTINUOUS |
| `match_HEURISTIC_seat0__2__Duel_aem_s4242#32` | 2 (constant, all 8 kept labels were 2) | 280 | 4 | PROXY_CONTINUOUS |
| `match_HEURISTIC_seat1__2__Duel_aem_s2026#38` | 2 (constant, all 8 kept labels were 2) | 0 | 3 | PROXY_CONTINUOUS |
| `match_HEURISTIC_seat0__2__Crossed_swords_aem_s42#56` | 2 (constant, all 8 kept labels were 2) | 0 | 3 | PROXY_CONTINUOUS |
| `match_HEURISTIC_seat0__2__Crossed_swords_aem_s1337#86` | 2 (constant, all 8 kept labels were 2) | 0 | 6 | PROXY_CONTINUOUS |

Agreement between the two label functions on the identical 40 positions: batch-2 called 8 decisions informative (`dQ != 0`); this run calls 31. Only 5 of batch-2's 8 are also `dQ != 0` here, and the other 3 flip to `dQ = 0` (the maximin leaf ranks the Heuristic top first, the 900-transition continuation payoff did not). The two measures are therefore **not nested**: the new label separates far more decisions, but it is a different ordering function, not a refinement of the old one. Each of batch-2's kept decisions still carries a graded candidate spread (3-6 distinct leaves), so those states are not lost even where the headline margin is 0.

## 6. Measured cost per decision

| quantity | v11 batch-2 | v12 this run |
|---|---:|---:|
| seconds per compared decision | 54.46 | **1.305** |
| seconds per leaf evaluation | n/a (payoff only) | 0.232 |
| engine transitions per decision | 1558.9 | 79.4 |
| total search wall clock | n/a | 334.11s for 256 decisions |

Note on the batch-2 figure: it is taken from `v11/V11_BATCH2_REPORT.md` ("单决策耗时 54.46 秒"). `v11/out/power_analysis.json` records `budgetAccounting.secondsPerComparedDecision = 0`, which contradicts its own report; the report value is used here and the discrepancy is flagged rather than silently resolved.

The two costs are not the same operation and must not be read as a speed-up of the same thing: the batch-2 number is a 900-transition heuristic continuation per candidate, the v12 number is one maximin leaf per candidate (1 step + up to 3 friendly rollout steps + up to 6 opponent probes). The v12 label is cheaper *and* continuous.

### 6.1 What that does to the projected sample size

Reusing the previous round's own order-of-magnitude arithmetic (`v11/out/power_analysis.json`: a paired test at 95% confidence for a +5 percentage-point effect needs ~1537 discordant pairs, and every compared decision was assumed discordant), the decision count and wall clock scale as 1537 / yield:

| scenario | yield | decisions needed (1537 / yield) | seconds each | projected hours |
|---|---:|---:|---:|---:|
| v11 batch-2 as published | 20.0% | 7685 | 54.46 | 116.3 |
| v12, batch-2 keep rule (dQ != 0) | 60.9% | 2522 | 1.305 | 0.9 |
| v12, recovered batch-2 subset, batch-2 keep rule | 77.5% | 1983 | 1.305 | 0.7 |
| v12, non-degenerate | 91.4% | 1682 | 1.305 | 0.6 |

This is the same crude arithmetic the previous round used, applied to the newly measured yield and cost. It is an order-of-magnitude planning number, not a power calculation, and it still assumes every compared decision is discordant, which nothing here establishes.

## 7. T12-07 — high-information decision prescreen

Baseline yield in this run: **91.4%** (234/256); previous batch was 20.0%, absolute change 71.4 percentage points.

| predicate | cheap before search? | kept | kept & non-degenerate | yield inside | yield outside | precision | recall |
|---|---|---:|---:|---:|---:|---:|---:|
| `0 < |margin| < takeoverThreshold(1200)` | no | 142/256 | 142 | 100.0% | 80.7% | 100.0% | 60.7% |
| `0 < |margin| < takeoverThreshold(1200) OR baselineLeaf <= dangerLine(-1500)` | no | 174/256 | 173 | 99.4% | 74.4% | 99.4% | 73.9% |
| `heuristic top-1 score != heuristic top-2 score (cheap, pre-search)` | yes | 256/256 | 234 | 91.4% | n/a (keeps everything) | 91.4% | 100.0% |
| `at least 3 legal non-surrender actions (cheap, pre-search)` | yes | 248/256 | 231 | 93.1% | 37.5% | 93.1% | 98.7% |

Definitions: precision = kept decisions that are non-degenerate / kept decisions; recall = kept non-degenerate / all non-degenerate. A predicate with `evaluableBeforeSearch = yes` needs only `HeuristicAI.scoreCandidateActions`, so an operator can apply it *before* spending any search.

### 7.1 Wall clock

| predicate | wall ms kept | wall ms excluded | ms per kept decision |
|---|---:|---:|---:|
| `margin_band` | 206804 | 127304 | 1456.4 |
| `margin_band_or_danger` | 239078 | 95030 | 1374 |
| `heuristic_score_gap_nonzero` | 334108 | 0 | 1305.1 |
| `candidate_count_at_least_3` | 333908 | 200 | 1346.4 |

The margin/danger predicates need the leaf values, so they cannot skip the search itself. What they save is the downstream cost (continuation, ranking, fitting) on decisions that are dropped. `wallMsOutside` on a margin-band predicate is therefore the search cost that a PREVIOUS-ROUND band would have avoided, and `wallMsPerKeptDecision` is the search cost of the decisions a kept-only workflow would still pay.

### 7.2 Stratification by the branch BattleSearchAI v3 would take

BattleSearchAI v3 at HEAD (9c6c1ab) exposes NO `stats` field: `decisions / urgentHits / forcedWins / takeovers / vetos / follows` do not exist in src/game/ai/battle_search_ai.ts. The counts below are reconstructed externally, from the same thresholds and the same branch order, over the leaves this run measured; they are not read from an internal counter.

| branch | decisions | non-degenerate | yield | mean margin | wall ms |
|---|---:|---:|---:|---:|---:|
| FOLLOW | 217 | 195 | 89.9% | 105.537 | 262859 |
| URGENT | 32 | 32 | 100.0% | 717.578 | 67681 |
| TAKEOVER | 6 | 6 | 100.0% | 2434.583 | 3263 |
| VETO | 1 | 1 | 100.0% | 863 | 305 |

Raw reconstructed counts: `{"FOLLOW":217,"URGENT":32,"TAKEOVER":6,"VETO":1}`.

### 7.3 Policy agreement check

On 12 decisions a *real* `BattleSearchAI.getAction` was run on the same state: its returned action equals the Heuristic top choice in 100.0% of cases and equals this tool's external branch reconstruction in 100.0% of cases (0 mismatches).

This is the evidence that defining `a0` as the Heuristic top choice is faithful to the policy: v3 is heuristic-anchored, so it returns the heuristic top unless it takes over or vetoes.

### 7.4 Stratification by turn / stage (computed at report time from the label file)

| stage | decisions | non-degenerate | yield | mean turn | mean margin | mean wall ms |
|---|---:|---:|---:|---:|---:|---:|
| OPENING | 91 | 84 | 92.3% | 5.2 | 164.7 | 1327 |
| MIDGAME | 109 | 100 | 91.7% | 10.3 | 315.3 | 1197 |
| ENDGAME | 56 | 50 | 89.3% | 16.3 | 213.9 | 1480 |

`stage` comes from the v11 sampling machinery (episode progress <= 0.3 OPENING, > 0.7 ENDGAME). Turn number is recorded on every label as `turn`; the table above is a report-time aggregation of the emitted label file, not an additional measurement.

## 8. Determinism evidence

`v12/out/labels/determinism_check.json`: 3 decisions re-evaluated a second time from the same state with freshly constructed, separately seeded `BattleSearchAI` instances. Compared by sha256 with only the wall-clock fields zeroed (`wallMs`, `leaves[].wallMs`).

**All bit-identical: `true`**

| decision | dQ (1st) | dQ (2nd) | identical |
|---|---|---|---|
| `match_HEURISTIC_seat0__2__Duel_aem_s42#54` | `[0,192,-16,332,176,192]` | `[0,192,-16,332,176,192]` | true |
| `match_HEURISTIC_seat0__2__Duel_aem_s42#55` | `[0,-8,-8,184,184]` | `[0,-8,-8,184,184]` | true |
| `match_HEURISTIC_seat0__2__Duel_aem_s42#56` | `[0,184,184]` | `[0,184,184]` | true |

Determinism is structural, not incidental: each candidate leaf comes from a **fresh** `new BattleSearchAI(seedFromHash(stateHash) ^ imul(index+1, 0x9e3779b9))`, so a leaf depends only on (state, playerId, action, seed) and never on evaluation order or on how many decisions ran before it. `Math.random` is reachable nowhere in this path: `HeuristicAI` is only constructed with an explicit `fixedRng(...)` stream.

### 8.1 Cross-process check

The check above is inside one process. `v12/out/labels/determinism_cross_process.json` closes that gap: two **separate node processes** loaded the same episodes file and evaluated the same 4 decision points, and every label record was compared by sha256 after zeroing the same wall-clock fields.

**All bit-identical across processes: `true`**

| decision | dQ (process A) | dQ (process B) | identical |
|---|---|---|---|
| `match_HEURISTIC_seat0__2__Duel_aem_s42#55` | `[0,-8,-8,184,184]` | `[0,-8,-8,184,184]` | true |
| `match_HEURISTIC_seat0__2__Duel_aem_s42#56` | `[0,184,184]` | `[0,184,184]` | true |
| `match_HEURISTIC_seat0__2__Duel_aem_s42#73` | `[0,288,288]` | `[0,288,288]` | true |
| `match_HEURISTIC_seat0__2__Duel_aem_s42#85` | `[0,2030.5,0,2030.5,2030.5,2030.5]` | `[0,2030.5,0,2030.5,2030.5,2030.5]` | true |

Two of those four positions (`#73`, `#85` in `Duel.aem s42`) are in the v11 batch-2 `uninformativeExamples` list — states the old label called "no candidate separated from the baseline" and discarded. Under the continuous maximin leaf they carry dQ of 288 and 2030.5 respectively, reproducibly, in both processes.

## 9. Test suite

```
RUN  v4.1.9 C:/code/AncinetEmpires

 ✓ tools/v11_regression_contract.test.ts (21 tests) 32216ms
     ✓ reports the real turn and candidate list of each sampled state  7911ms
     ✓ the subject player of a sample is the player who actually acted  6197ms
     ✓ a mid-episode illegal action publishes zero samples  14312ms
     ✓ the intact episode commits its samples  635ms
     ✓ survives the repository tactical fixtures  2324ms
 ✓ tools/v11_replay_e2e.test.ts (3 tests) 9280ms
     ✓ a recorded match replays from its trajectory file without a guessed setup  4571ms
     ✓ the recorded snapshot is refused when its state is tampered with  1997ms
     ✓ a non-default setup survives the round trip  2710ms

 Test Files  2 passed (2)
      Tests  24 passed (24)
   Start at  00:34:35
   Duration  43.11s (transform 1.13s, setup 0ms, import 1.31s, tests 41.50s, environment 0ms)
```

## 10. Verification boundary — what `Q_ref` is and is not

- Q_ref is a PROXY REFERENCE from a bounded heuristic maximin search, NOT a win probability.
- It is NOT calibrated against natural terminals and NOT optimal Q.
- It is keyed to the evaluatePositionHeuristic score scale and must NOT be added raw to heuristic scores; any combination requires normalisation and calibration first.
- A DEGENERATE decision (every candidate leaf equal) carries no ranking information and is dropped.

Concretely:

1. **Not a win probability.** The leaf is `evaluatePositionHeuristic`, a hand-weighted material /
   territory / commander score. Its units are arbitrary score points, not probabilities.
2. **Not calibrated.** Nothing in this run fitted a mapping from leaf values to observed outcomes.
   The terminal band (+/-100000) is a convention, and this run never reached it: 0 of the raw leaves measured in section 4.5 fall inside the band, so the proxy is entirely a mid-game score here, while decision-level dQ spans [0, 4097.5].
3. **Not optimal Q.** It is the worst case over at most 6 opponent replies, with the friendly side rolled out for at most 3 heuristic steps. A deeper or wider search would change it.
4. **Must not be added raw to heuristic scores.** It lives on the `evaluatePositionHeuristic` scale, which HeuristicAI already uses internally; adding a residual ranker output to a heuristic score without normalisation mixes two quantities that only look commensurate. Normalise (and calibrate) first.
5. The label is a **relative preference in one state**, `dQ(a) = leaf(a) - leaf(a0)`; by construction `dQ(a0) = 0`. It is not an absolute value estimate.

## 11. What passed, what failed, what remains unverified

### Passed

- `distinctDeltaValues = 108` at the decision level (acceptance: > 1, preferably >= 10) — versus 1 in the previous batch; 107 distinct values restricted to `dQ != 0`.
- Raw histograms shown above over 256 decisions, over the 156 `dQ != 0` decisions, and over the 234 non-degenerate decisions.
- Yield reported on both criteria: 60.9% on the batch-2 keep rule (`dQ != 0`) and 91.4% on "candidates do not all tie"; on the recovered batch-2 decision set, 77.5% and 97.5% respectively, against the previous batch's 20.0% on the identical 40 positions.
- Determinism: bit-identical dQ on repeat evaluation inside one process, and bit-identical label records across two separate node processes (sections 8 and 8.1).
- Prescreen predicates measured with precision/recall, plus the pre-search predicates that can be applied before any search cost.
- v11 regression suite: see section 9.
- The only game-AI source change is a visibility modifier; no rule, threshold, or behaviour changed.

### Failed or not attempted

- `BattleSearchAI` has **no internal `stats` counter** at HEAD: `decisions / urgentHits / forcedWins / takeovers / vetos / follows` do not exist in `src/game/ai/battle_search_ai.ts`. The requested stratification is therefore provided as an **external reconstruction** from the same thresholds (section 7.2), not read from internal state. No counter was added, to keep the AI change minimal.
- No ranker was trained or evaluated on these labels in this task (that is T12-08 territory); the labels are produced and characterised, not shown to improve play.

### Remains unverified

- Whether a ranker actually learns from these labels, and whether it transfers to game strength.
- Whether the leaf ordering correlates with eventual game outcome (no calibration run was done). Related: **no leaf in this sample reached a terminal** (section 4.5), so the +/-100000 terminal convention is untested here — the proxy is entirely a mid-game heuristic score in this sample.
- Whether the proxy has any signal at *deeper* search settings. `oppProbeK=6` and `friendlyRolloutSteps=3` are BattleSearchAI v3 defaults; a different setting produces a different Q_ref, and this run measured only the default.
- The batch-2 label file's 32 dropped decisions were only partly published; the recovery pins the sampling configuration, but the *old* labels for those positions were not re-derivable without re-running the v11 continuation, which was not done.
- The prescreen predicates that need leaves (`margin`, `danger`) cannot be applied before the search; their measured "saving" is a downstream-continuation saving, not a search saving. Only the `heuristic_score_gap_nonzero` / `candidate_count_at_least_3` predicates are genuinely pre-search, and their precision/recall above is the honest measure of how much they are worth.
- The batch-2 same-footing comparison rests on a recovered (E,K) sample that is unique **given the 18 published ids**, not on a bit-level replay of the batch-2 run.

