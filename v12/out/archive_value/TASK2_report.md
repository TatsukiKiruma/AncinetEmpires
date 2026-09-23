# TASK 2 — Re-evaluating the SD archive as a source of WIN/VALUE and ACTION-imitation labels

Branch `train/battle-ai-20260923`, HEAD `9c6c1ab`. All numbers below are measured by the
`v12/tools/arch_*.py` scripts listed in §7 and reproducible from the commands printed there.

**Tags used throughout:** `[M]` measured · `[D]` derived arithmetic from measured counts ·
`[A]` assumption / interpretation (not measured).

---

## 0. Bottom line

| Question | Answer |
|---|---|
| How predictable is the winner without looking at play? | **80.26 %** of terminal episodes from the policy assignment alone (LOO), vs **35.58 %** chance. `[M]` |
| How many episodes can teach anything about play? | **131 / 1,003 = 13.06 %** (LOO), or **109 = 10.87 %** (in-sample modal). `[M]` |
| Ceiling for a value model | `valueTarget` is **constant inside every (episode, seat)**: 0 of 112 seats have mixed labels, `H(Y | seat) = 0.000000` bits. The 48,714 rows reduce to **85 independent labels**. `[M]` |
| Best trivial value predictor | always `+1` → accuracy **80.21 %**, MSE **0.635005**, Brier **0.158751**. Conditioning on `policy` gives **79.03 %**, i.e. *worse*. `[M]` |
| Action-imitation | 48,714 decisions from **two teachers interleaved in 100 % of episodes**; corpus is 64.51 % heuristic / 35.49 % apk-like by row. `[M]` |
| Teacher divergence | Action-*type* marginals are nearly identical (TV = **0.094796**, teacher-from-type Bayes gain **+0.29 pp**), but under a genuine either/or the teachers are categorically different (§5.4). `[M]` |

**Verdict in one line:** this archive is a *seat-assignment outcome ledger*, not a corpus of
play. It can support behavioural *measurement* of two teachers; it cannot support win/value
learning, and it cannot support clean imitation of either teacher.

---

## 1. Sources, sizes, and what was skipped

| Source | Rows read | Rows skipped | Note |
|---|---|---|---|
| `training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced/*.jsonl` | 1,395 episodes (11 files) | **0** | all 1,395 lines parsed |
| `training_runs/spatial_dataset/spatial_v2_full_pool.jsonl` | 48,714 | **0** | key-occurrence assertion passed on every row |
| `training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl` | 48,714 | **0** | `"actionCode"`, `"policy"`, `"legalActionCodes"` each occurred exactly once per line, 48,714/48,714 `[M]` |

**Nothing was skipped for being unparseable.** No full `json.loads` was needed: every field
used sits either in the first ~1 kB or the last few kB of an episode record, and each
extracted key was asserted to occur exactly once per dataset row. That assertion is what
makes the regex extraction exact rather than merely convenient.

### 1.1 The two "48,714" files are the same samples — verified

`arch_pool_identity.py` `[M]`:

```
spatial pool  : rows=48714 episodes=37 sum(rows)=48714
baseline      : rows=48714 episodes=37 sum(rows)=48714
identical episode-key sets : True
episodes with DIFFERENT row counts: 0
```

Both cover the same **37 episodes** with identical per-episode row counts. `[A]` This is
strong evidence they are one corpus, so §4 and §5 describe the same decisions.

### 1.2 Label provenance — 28 % of the archive has no win label

`[M]` From `arch_winner_predictability.py`:

* **1,003 / 1,395 (71.90 %)** episodes are terminal with a numeric `winnerAlliance`.
* **392 / 1,395 (28.10 %)** have `winnerAlliance: null`. **All 392 are `timeout: true`**
  (0 exceptions), and **all 392 carry a non-null `adjudicatedWinnerAlliance`**.
* `adjudicatedWinnerAlliance` is exactly `argmax(finalArmyValueByAlliance)` in
  **1,395 / 1,395** episodes. `[M]`
* For the 1,003 terminal episodes, `adjudicatedWinnerAlliance == winnerAlliance` in
  **1,003 / 1,003**. `[M]`

Consequence: there are two defensible win labels and they disagree substantially.
"heuristic wins" is **75.27 %** under the terminal label but **55.13 %** under the
timeout-adjudicated label `[M]`. Neither this task nor the archive states which the
pipeline consumes — but the spatial pool contains only terminal episodes (§4.6), so the
75.27 % figure is the relevant one for the pool.

---

## 2. Section A — how predictable is the winner *without looking at play*?

Denominator for the headline block: the **1,003 episodes with a terminal winner**.
A second block over all **1,395** (timeouts labelled by `adjudicatedWinnerAlliance`) is
reported in §2.6.

### 2.1 The assignment structure (why the rule is not clean)

`[M]`

* 2-player 432, 3-player 496, 4-player 467 episodes; **player id == alliance id in every
  episode**, so "alliance" and "seat" coincide.
* Policies per episode: `2a+2h` 467, `1a+1h` 432, `2a+1h` 264, `1a+2h` 232.
* Seat counts: apk-like **2,126 (50.38 %)**, heuristic **2,094 (49.62 %)** — the preset is
  balanced *by seat*.
* Winner counts (terminal): heuristic **755 (75.27 %)**, apk-like **248 (24.73 %)**.

So the preset deals a 50/50 seat split but produces a 75/25 win split. `[D]` For a
heuristic seat the win rate is 755/2094 = **36.06 %**; for an apk-like seat 248/2126 =
**11.67 %** — a **3.09×** seat-level advantage.

### 2.2 A1 — the stated rule, and the ambiguity problem

Rule: *"the alliance holding the `heuristic` player wins."*

**489 / 1,003 (48.75 %) of episodes have ≥2 heuristic-holding alliances**, so the rule is
under-specified in half the corpus. Handling, as implemented:

| Case | Episodes | Handling |
|---|---|---|
| exactly one heuristic alliance | 514 | predict it |
| ≥2 heuristic alliances | 489 | tie-break to **lowest alliance id** |
| zero heuristic alliances | 0 | (fall back to global modal; never triggered) |

Results `[M]`:

| Baseline | Accuracy | vs chance |
|---|---|---|
| **A1a** fixed "heuristic alliance wins", lowest-id tie-break | **63.51 %** (637/1003) | 35.58 % |
| **A1a upper bound** — winner is *among* the heuristic-holding alliances | **75.27 %** | 35.58 % |
| **A1b** Bayes-optimal pre-play predictor over `(scenario, allianceIndex, hasHeuristic)`, **leave-one-out** | **80.26 %** | 35.58 % |

A1b is the number that matters: it uses **only information fixed before the first move**
(the scenario and which seat holds which policy) and is **80.26 %** accurate out of sample.
The gap between 63.51 % and 80.26 % is entirely the tie-break — knowing *which* seat index
holds the heuristic player in a given scenario carries the rest.

The 75.27 % upper bound is an independent reproduction of the figure measured in the prior
round. `[M]`

### 2.3 A2 — best constant baseline

`[M]`

| Baseline | Accuracy |
|---|---|
| global modal alliance (alliance 1) | **50.95 %** |
| per-scenario modal, **in-sample** | **76.57 %** |
| per-scenario modal, **leave-one-out** | **68.10 %** |

The in-sample figure is an optimistic ceiling that must memorise the scenario; **68.10 %
LOO is the honest constant baseline.** Note this is *below* A1b's 80.26 % — the policy
assignment is genuinely more informative than the scenario alone.

### 2.4 A3 — chance

Mean of `1 / n_alliances` = **0.3558** (2-player episodes 1/2, 3-player 1/3, 4-player 1/4).
`[M]`

### 2.5 A4 — how many episodes are actually INFORMATIVE?

Definition: the winner is **neither** the policy-optimal-LOO prediction **nor** the modal
winner.

| Variant | Count | % of 1,003 | % of all 1,395 |
|---|---|---|---|
| LOO against LOO-modal | **131** | **13.06 %** | 9.39 % `[D]` |
| LOO against in-sample modal | **109** | **10.87 %** | 7.81 % `[D]` |

**131 episodes — 13.06 % of the labelled corpus — are the only ones whose outcome is not
already implied by the preset's assignment or the scenario's modal winner.** Everything a
win/value model could learn about play has to come from those, and §4 shows only 1 of them
reaches the spatial pool.

### 2.6 The same numbers under the timeout-adjudicated label (all 1,395)

`[M]`

| Metric | Terminal (n=1,003) | Effective (n=1,395) |
|---|---|---|
| A1a fixed rule | 63.51 % | 46.59 % |
| A1b policy-optimal LOO | **80.26 %** | **81.86 %** |
| modal in-sample | 76.57 % | 78.71 % |
| modal LOO | 68.10 % | 73.26 % |
| chance | 35.58 % | 35.70 % |
| informative (LOO) | 131 (13.06 %) | 182 (13.05 %) |
| informative (in-sample modal) | 109 (10.87 %) | 167 (11.97 %) |

Including the timeouts does not change the conclusion — informative share stays ~13 %.
It does change the *sign* of the fixed rule (63.51 % → 46.59 %) because army-value
adjudication favours apk-like far more often than terminal victory does.

### 2.7 Per-scenario degeneracy

`[M]` 155 scenarios in total; episodes per scenario range 2–36.

| Threshold | Scenarios | ≤2 distinct winners | exactly 1 winner |
|---|---|---|---|
| n ≥ 1 | 155 | **141 (91.0 %)** | **80 (51.6 %)** |
| n ≥ 5 | 71 | 65 | 25 |
| n ≥ 10 | 31 | **26** | 9 |
| n ≥ 20 | 7 | 5 | 1 |

The prior round's "26 of 31 scenarios with ≥10 games have ≤2 distinct winner alliances" is
reproduced exactly. `[M]` The four previously-cited single-winner scenarios also reproduce:
`sd-3p-normal-extra:(3) Midway.aem` a1 22/22, `sd-normal:(4) Solitude.aem` a1 16/16,
`sd-normal:(2) Liberty Port.aem` a1 15/15, `sd-normal:(4) Crossroads.aem` a2 16 / a3 4.

Policy-optimal-LOO accuracy pooled by preset signature `[M]`:

| Signature | Scenarios | Episodes | policy-optimal LOO | chance |
|---|---|---|---|---|
| `1a+1h` (heads-up) | 24 | 202 | **90.59 %** | 50.00 % |
| `1a+2h` | 4 | 58 | 77.59 % | 33.33 % |
| `2a+1h` | 20 | 254 | 78.74 % | 33.33 % |
| `2a+2h` | 23 | 217 | 77.42 % | 25.00 % |

In heads-up games the assignment alone is **90.59 %** predictive — the winner is very
nearly decided by which side drew the heuristic policy.

**Caveat `[A]`:** the LOO-modal rule is unstable when a scenario's top two winner counts are
tied; `sd-normal:(4) Critical mass.aem` (7/7/3/3) scores **0.000** LOO because the LOO
argmax is always a *different* alliance. That is an honest out-of-sample score for that
specific rule, but it makes the micro-averaged LOO modal pessimistic. The A1b predictor is
not affected in the same way (it scores 0.450 there).

---

## 3. Section B — the value ceiling

Source: `spatial_v2_full_pool.jsonl`, 48,714 rows, 0 skipped. `[M]`

### 3.1 B1 — `valueTarget` distribution and best constant predictor

| `valueTarget` | Rows | Share |
|---|---|---|
| `+1` | 28,229 | 57.95 % |
| `-1` | 6,966 | 14.30 % |
| `null` | 13,519 | 27.75 % |
| `0` / other | 0 | 0 % |

Best **constant** predictor over the 35,195 signed rows `[M]`:

| Metric | Constant | Score |
|---|---|---|
| accuracy | `+1` | **0.802074** |
| MSE | 0.604148 | **0.635005** |
| Brier | 0.802074 | **0.158751** |

A model that always says "+1" and always predicts probability 0.802074 is already at the
optimum of all three losses for a constant.

### 3.2 B2 — predicting `valueTarget` from everything that is *not* play

`[M]`

| Predictor (in-sample majority per group) | Accuracy |
|---|---|
| constant `+1` | 0.802074 |
| **`policy` alone** | **0.790266** |
| `turn` alone (67 values) | 0.647514 |
| `step` alone (2,964 values) | 0.614834 |
| `rootFamilyId` alone (37 groups) | 0.857002 |
| **`(rootFamilyId, playerId)` alone (112 groups)** | **1.000000** |

Note: **`policy` is *worse* than the constant** (0.7903 vs 0.8021). Knowing which teacher a
seat holds does not beat always predicting "+1" on this pool.

**`(rootFamilyId, playerId)` reaches 1.000000 with only 112 groups, and 0 of those 112
groups have mixed labels.** This is the *memorise-the-seat* ceiling. It is stated plainly
here as **leakage, not learning**: the key contains the episode identity, and the label is a
function of it.

### 3.3 B3/B10 — the pool contains 85 independent labels

`[M]`

| Quantity | Value |
|---|---|
| rows | 48,714 |
| distinct episodes (`rootFamilyId`) | **37** |
| distinct seats (`rootFamilyId, playerId`) | **112** |
| **seats carrying a signed (±1) label** | **85** |
| seats with mixed `valueTarget` | **0** |
| mean rows per seat | 434.946 |
| **rows per independent label** | **573.11** |
| episodes with both `+1` and `-1` | 30 |
| episodes with only one sign | 0 |
| episodes entirely `null` | 7 |

37 episodes is **2.65 %** of the archive's 1,395 `[D]`.

### 3.4 B4 — variance decomposition (information, bits)

All values share the alphabet `{+1, -1, null}` and the same row set. `[M]`

| Quantity | Bits |
|---|---|
| `H(valueTarget)` | **1.370616** |
| `H(valueTarget \| policy)` | 0.803927 |
| `H(valueTarget \| rootFamilyId)` | 0.497825 |
| **`H(valueTarget \| (rootFamilyId, playerId))`** | **0.000000** |
| `I(valueTarget ; policy)` | 0.566689 (41.3 % of H) `[D]` |
| `I(valueTarget ; episode)` | 0.872791 (63.7 % of H) `[D]` |
| `I(valueTarget ; seat)` | 1.370616 (100 % of H) `[D]` |

`H(valueTarget)` over signed rows only is 0.717760 bits. `[M]`

### 3.5 B5 — what `valueTarget` actually is

Across **35,195 / 35,195 rows (100.000 %)**, `sign(valueTarget)` equals *"my alliance is the
episode's effective winner"* `[M]`. There is no shaping, no discounting, no per-step
component: the label is the raw final outcome repeated on every row of the seat.

### 3.6 B6/B8 — join coverage and the unlabelled 27.75 %

* Join `rootFamilyId → scenario#seed → episode_index.json`: **48,714 / 48,714 (100 %)** `[M]`.
* The 13,519 `null` rows live in **7 episodes, all 7 entirely null** `[M]`.
* All 37 pool episodes are **terminal and non-timeout** in the archive `[M]`.

`arch_null_episode_check.py` then shows the archive *does* record a winner for all 7 `[M]`:

| unlabelled episode | rows | archive winner | winner policy |
|---|---|---|---|
| `sd-3p-normal-extra:(3) Frozen fields.aem#2026571502#1` | 299 | alliance 2 | heuristic |
| `sd-4p-normal-extra:(4) Crossroads.aem#2026870501#1` | 2,800 | alliance 2 | apk-like |
| `sd-high-gold:(4) Crossroads.aem#2026270501#0` | 2,800 | alliance 2 | apk-like |
| `sd-high-unit-limit:(4) Crossroads.aem#2026470505#0` | 2,800 | alliance 2 | apk-like |
| `sd-low-gold:(4) Crossroads.aem#2026170502#1` | 207 | alliance 0 | heuristic |
| `sd-low-unit-limit:(4) Crossroads.aem#2026370503#2` | 1,813 | alliance 2 | apk-like |
| `sd-normal:(4) Crossroads.aem#2026070503#0` | 2,800 | alliance 2 | apk-like |

So the 27.75 % null mass is a **pipeline-level label omission, not a missing outcome**.
`[M]` 5 of the 7 are apk-like wins `[M]`. `[A]` That skew is consistent with (but does not
prove) the nulling being a filter that removes the *policy-unexpected* outcomes — the very
cases that carry signal. This is a concrete, checkable defect worth a follow-up.

### 3.7 B7 — how much of the pool comes from informative episodes

Using Section A's 131 informative episodes `[M]`:

* rows from informative episodes: **987 / 48,714 = 2.03 %**
* distinct episodes involved: **1**

**One episode out of 37 carries everything the pool has to say about play.**

### 3.8 What a value head could possibly learn here — stated plainly

1. **Nothing within an episode.** `valueTarget` is constant per seat (`H(Y | seat) = 0`,
   0/112 mixed). There is no within-episode variance, so no credit assignment, no
   "was this move better than that one", no advantage signal. `[M]`
2. **"Which game am I" gets you 100 %** — but only by memorising 112 seat keys. `[M]`
3. **"Which policy am I" is not even a better predictor than a constant** (0.7903 vs
   0.8021), though it does carry 0.567 bits of information about the label. `[M]`
4. The whole pool is 573 rows per independent label, over 30 usable episodes.

`[A]` The only thing a value head can fit here is a state → episode-constant-outcome
mapping. On held-out episodes that is unlearnable; on training episodes it is memorisation.
**A value head trained on this pool cannot acquire a generalisable value function, and its
training loss will be dominated by the constant predictor.** The correct reference numbers
for any such run are accuracy 0.802074 / MSE 0.635005 / Brier 0.158751 (§3.1) — a model that
does not beat those has learned nothing.

---

## 4. Section C — action imitation, and imitating WHOM?

Source: `baseline_dataset.jsonl`, 48,714 rows, 0 skipped. `[M]`

**Validation `[M]`:** the chosen `actionCode` is present in that row's `legalActionCodes` in
**100.000 %** of rows (48,714/48,714, and 100 % within each teacher separately). This
end-to-end checks the legality extraction that §4.4 depends on, and independently,
`chose_attack_given_legal == chose_attack` exactly (5,921/5,921; 3,214/3,214; 2,707/2,707)
and likewise for recruit.

### 4.1 C1 — action-type distribution by teacher

`[M]` shares of each teacher's own decisions (12 types observed):

| action type | heuristic | apk-like | diff (h − a) |
|---|---|---|---|
| `move` | 0.45007 | 0.43690 | +0.01317 |
| `wait` | 0.33188 | 0.279526 | +0.052354 |
| `attack` | 0.102279 | 0.156564 | −0.054286 |
| `recruit_to_castle` | 0.034114 | 0.055928 | −0.021814 |
| `post_attack_move` | 0.026699 | 0.004338 | +0.022362 |
| `heal` | 0.018044 | 0.020416 | −0.002373 |
| `capture` | 0.017248 | 0.018450 | −0.001202 |
| `end_turn` | 0.008560 | 0.023482 | −0.014921 |
| `summon` | 0.004201 | 0.002140 | +0.002061 |
| `repair` | 0.003660 | 0.001966 | +0.001693 |
| `destroy_town` | 0.003214 | 0.000058 | +0.003156 |
| `support` | 0.000032 | 0.000231 | −0.000200 |

### 4.2 C2 — how different are the two teachers?

`[M]`

| Metric | Value |
|---|---|
| **Total variation distance** | **0.094796** |
| L1 distance | 0.189592 |
| distribution overlap (1 − TV) | **0.905204** |
| `H(teacher)` | 0.938393 bits |
| `H(teacher \| action type)` | 0.921481 bits |
| `I(teacher ; action type)` | **0.016912 bits** |
| Bayes accuracy guessing teacher from action type | 0.647945 |
| majority-teacher base rate | 0.645071 |
| **gain over base rate** | **+0.2874 pp** `[D]` |

**At the action-*type* level the two teachers are almost indistinguishable** — TV under
0.10, and the action type buys you 0.29 percentage points over just guessing "heuristic".
The `post_attack_move` (6.2×) and `destroy_town` (55×) ratios are the only sharp type-level
contrasts, and both are rare.

### 4.3 C3 — the corpus mix, and whether one head can fit it

`[M]`

| Quantity | Value |
|---|---|
| rows from heuristic | **31,424 (64.51 %)** |
| rows from apk-like | **17,290 (35.49 %)** |
| distinct episodes | 37 |
| episodes containing **both** teachers | **37 (100 %)** |
| episodes with only one teacher | **0** |

The teachers are **interleaved inside every single episode**: in these games seats alternate
turns, so a trajectory is a 2-teacher mixture by construction. There is no episode-level or
trajectory-level separator to exploit.

Cost of fitting **one** head to the union `[M]` — majority action type chosen per legality
context `(recruit legal?, attack legal?)`:

| rule | on heuristic rows | on apk-like rows | on all rows |
|---|---|---|---|
| pooled rule | 0.545061 | 0.427877 | **0.503469** |
| heuristic's own rule | 0.545061 | 0.427877 | — |
| apk-like's own rule | 0.432281 | 0.442915 | — |

A single head fitted to the union loses at most **+1.50 pp** on apk-like rows (0.442915 vs
0.427877) and **0.00 pp** on heuristic rows relative to each teacher's own optimal type
rule. So *at the action-type level* pooling is nearly free — a single policy head **can**
fit the union's type distribution. `[A]` The imitation problem is therefore not the type
marginal; it is the argument (which unit, which target, which tile), which this task did not
measure and §4.4 shows is where the teachers actually diverge.

Outcome-conditioned filtering `[M]`: restricting to rows on the winning side gives
**heuristic 27,845 (72.92 %) vs apk-like 10,341 (27.08 %)**, against a base mix of
64.51 / 35.49 `[D]`. Because a heuristic seat wins 3.09× as often, filtering by outcome
**enriches the heuristic teacher from 64.5 % to 72.9 %** — it does not isolate either
teacher, and it silently converts the corpus into a mostly-heuristic one with an apk-like
contaminant still present in every trajectory.

### 4.4 C4 — recruit vs attack conditional on legality

Re-derived independently; the prior round's headline numbers reproduce **exactly** `[M]`:
recruit legal in **39.1345 %** of decisions, conditional recruit rate **10.6956 %**
(heuristic **14.5257 %**, apk-like **8.2763 %**).

New: the attack side and the genuine either/or contrast.

| | ALL | heuristic | apk-like |
|---|---|---|---|
| decisions | 48,714 | 31,424 | 17,290 |
| recruit legal | **39.1345 %** | 23.4852 % | **67.5766 %** |
| attack legal | 39.7935 % | 34.9192 % | 48.6524 % |
| **both legal** | 25.3952 % | 17.6808 % | **39.4158 %** |
| chose recruit (uncond.) | 4.1857 % | 3.4114 % | 5.5928 % |
| chose attack (uncond.) | 12.1546 % | 10.2279 % | 15.6564 % |
| **recruit \| recruit legal** | **10.6956 %** | **14.5257 %** | **8.2763 %** |
| **attack \| attack legal** | **30.5442 %** | 29.2901 % | 32.1802 % |
| n both legal | 12,371 | 5,556 | 6,815 |
| **recruit \| both legal** | 5.2057 % | **11.5911 %** | **0.0 %** |
| **attack \| both legal** | 23.6359 % | 13.8769 % | 31.5921 % |

**The sharpest measured behavioural difference in this entire task:**

> Given a decision where **both** a `recruit_to_castle` and an `attack` were legal,
> the **apk-like** teacher chose recruit **0 times out of 6,815** (`chose_recruit_given_both
> = 0`, exactly zero — not a rounding artefact; heuristic is 644/5,556 = 11.5911 %).
> apk-like instead attacked 31.5921 % of those decisions vs heuristic's 13.8769 %.

`[D]` Decomposing further from the measured integers:

| context | heuristic | apk-like |
|---|---|---|
| recruit legal but attack **not** legal → recruit rate | 428 / 1,824 = **23.46 %** | 967 / 4,869 = **19.86 %** |
| attack legal but recruit **not** legal → attack rate | 2,443 / 5,417 = **45.10 %** | 554 / 1,597 = **34.69 %** |

So the two teachers recruit at **comparable rates when attacking is unavailable**
(23.46 % vs 19.86 %), and diverge **categorically** when both are available. `[A]` The
similar *marginal* recruit shares (3.41 % vs 5.59 %) are an artefact of very different
legality-state distributions: apk-like reaches both-legal states 39.42 % of the time vs
heuristic's 17.68 %. A marginal-only comparison of the two teachers would therefore have
missed the single largest behavioural difference between them.

### 4.5 Interpretation for imitation

`[A]` A single policy head trained on this corpus is being asked to reproduce the *average*
of two teachers that (i) are present in every trajectory, (ii) cannot be separated by
episode, and (iii) disagree categorically on a decision class that occurs in 25.40 % of all
decisions. At the type level the average happens to be close to both (TV 0.095), so the
aggregate type accuracy will look healthy (~50 %) while the head reproduces neither
teacher's recruit/attack rule. **Imitating the union imitates neither teacher** — and the
corpus provides no field that identifies the teacher for a given decision other than
`policy`, which a deployed policy will not have.

---

## 5. What this archive IS good for / is NOT good for

### Good for

1. **Measuring teacher behaviour, at the decision level.** 48,714 decisions with legality
   sets, action types and teacher tags; 100 % legality-consistency validated. The
   conditional contrasts in §4.4 are solid measurements, and the `recruit | both legal`
   0-of-6,815 result is a real, sharp, reproducible behavioural fact.
2. **Diagnosing the preset.** §2 gives a complete map of which scenarios are degenerate
   (141/155 have ≤2 distinct winners, 80 have exactly 1) and which preset signatures are
   most assignment-determined (heads-up `1a+1h`: 90.59 % predictable). This is exactly the
   information needed to build a *better* preset.
3. **Building a shortlist of informative scenarios.** The 131/182 informative episode keys
   are emitted in `winner_predictability.json` (`informative_keys`,
   `informative_keys_effective`) and can seed a targeted resampling.
4. **A behavioural smoke test for the two teachers' legality-conditioned choice rules.**

### Not good for

1. **Win/value labels.** 80.26 % predictable pre-play; only 13.06 % of episodes informative;
   a constant predictor already reaches 80.21 % accuracy / 0.1588 Brier. Any value model
   must be reported against those constants or the result is uninterpretable.
2. **Any credit-assignment or advantage signal.** `valueTarget` is constant per seat
   (§3.3), so there is literally zero within-episode variance to fit. This is not a
   "weak signal" — it is an absent one.
3. **Action imitation of a named teacher.** 100 % of episodes interleave both teachers
   (§4.3); no field separates them at decision time; pooling is only benign at the coarse
   type level while the teachers' conditional rules differ categorically (§4.4).
4. **Outcome-conditioned imitation.** Winner-side filtering shifts the mix from
   64.51/35.49 to 72.92/27.08 — a heuristic-enriched mixture, still both teachers, in every
   trajectory.
5. **Using the pool as a large dataset.** 48,714 rows is **85 independent labels over 30
   usable episodes** (§3.3). Row count is not dataset size here.
6. **`valueTarget: null` is not "no winner".** 13,519 rows (27.75 %) are unlabelled although
   the archive records a terminal winner for all 7 affected episodes (§3.6). Any pipeline
   treating those nulls as "draw/no-outcome" is silently discarding 5 apk-like wins.

---

## 6. Measured vs derived vs assumed — explicit ledger

* **Measured `[M]`:** every table cell except those tagged otherwise. All come from the four
  scripts in §7 with zero skipped input records.
* **Derived arithmetic `[D]` (no new measurement):** the 3.09× seat win-rate ratio (§2.1);
  informative-%-of-1,395 columns (§2.5); percentage columns in §2.7 and §4.3; `I(Y;·)` as a
  percentage of `H(Y)`; `chose_recruit_given_both = 0` as an exact-zero reading (justified by
  a 4-dp rounding bound: 1/6,815 would print 0.0147); the context-decomposition table in
  §4.4; rows-per-independent-label 573.11 and 37/1,395 = 2.65 %.
* **Assumption / interpretation `[A]` (never load-bearing for a number):** that the two
  48,714-row files are the same samples (row-count evidence is strong but not a row-level
  hash join); that the nulling of 7 episodes reflects a filter rather than a missing
  outcome; the claim that the teachers' real divergence lives in action *arguments*; the
  LOO-modal instability caveat; all of §4.5.

## 7. Exact commands

```powershell
# Section A  (reads 11 episode files, 1,395 records, 0 skipped)
py -3.12 v12/tools/arch_winner_predictability.py
py -3.12 v12/tools/arch_scenario_digest.py

# Section B  (reads spatial_v2_full_pool.jsonl, 48,714 rows, 0 skipped)
py -3.12 v12/tools/arch_value_ceiling.py
py -3.12 v12/tools/arch_pool_digest.py

# Section C  (reads baseline_dataset.jsonl, 48,714 rows, 0 skipped)
py -3.12 v12/tools/arch_imitation_mix.py

# cross-checks
py -3.12 v12/tools/arch_pool_identity.py        # same 37 episodes, same per-episode rows
py -3.12 v12/tools/arch_null_episode_check.py   # 7 null episodes DO have archive winners

# schema probes used to design the extractors (not needed to reproduce results)
py -3.12 v12/tools/arch_probe.py
py -3.12 v12/tools/arch_probe2.py
py -3.12 v12/tools/arch_probe3.py
```

Raw stdout of the three main runs is kept at `v12/out/archive_value/_run_A.log`,
`_run_B.log`, `_run_C.log`.

## 8. Remaining unverified / open

1. **Action arguments were not measured.** Only action *types*. Where (`actorCoord`,
   `landingCoord`, `targetCoord`) the two teachers differ is untested, and §4.4 strongly
   suggests that is where the divergence is. The `post_attack_move` 2.67 % vs 0.43 % and
   `destroy_town` 0.32 % vs 0.006 % gaps are hints, not measurements.
2. **Why 7 episodes are unlabelled** is unknown; only the fact, the affected episodes, and
   the winners are measured. Root cause requires reading the spatial converter.
3. **Which win label the pipeline intends** is not determined. The pool contains 0 timeout
   episodes, so the 1,003-episode terminal label is what applies to the pool — but the 392
   adjudicated labels are unused, and using them changes the heuristic win rate from
   75.27 % to 55.13 %.
4. **No row-level identity proof** between `spatial_v2_full_pool.jsonl` and
   `baseline_dataset.jsonl` — only identical episode sets and per-episode row counts.
5. **Not run:** any model training or evaluation. §3.8's claims are arithmetic consequences
   of the measured label structure, not training results.
6. **`sd-normal` shares of the pool** and whether the 37 episodes are a deliberate subsample
   or a pipeline truncation were not investigated (2.65 % of the archive reached the pool).
