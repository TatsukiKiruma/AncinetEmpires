# T13-06 · search teacher qualification

Verdict: **UNQUALIFIED as shipped. QUALIFIED as an OFFLINE label generator once its
thresholds are calibrated. UNQUALIFIED as an online policy at any setting tested.**

That is three different answers to three different questions, and the taskbook asks all
three. Conflating them is what produced the "17/20" claim in V12.

## 1. As shipped, the teacher is not a distinct policy at all

`teacher_agreement.ts`, one kernel instance reused per game, real states from
`createEvaluationState`:

| Map | decisions | agreed with plain HeuristicAI | branch taken | max leaf margin (takeover threshold is 1200) |
|---|---|---|---|---|
| `(2) Duel.aem` | 30 | **30/30** | `FALLBACK_TO_HEURISTIC` ×30 | 613 |
| `(3) Midway.aem` | 30 | **30/30** | `FALLBACK_TO_HEURISTIC` ×30 | 413 |
| `(3) Frozen fields.aem` | 30 | **30/30** | `FALLBACK_TO_HEURISTIC` ×30 | 335 |
| `(4) Crossroads.aem` | 30 | **30/30** | `FALLBACK_TO_HEURISTIC` ×30 | 356 |

**120 of 120 decisions, across four maps, the search teacher returned exactly the action a
plain HeuristicAI returns.** The takeover branch never fired once. The median leaf margin
between the search's best candidate and the heuristic's top pick is 0–75 points against a
1200-point threshold.

So in its shipped configuration **BattleSearchAI is a HeuristicAI that spends compute and
returns the same answer.** Distilling it would label every state with the heuristic's
action, at ~1.3 s per decision. The V12 "17/20" has no mechanism to operate, which is
consistent with there being no raw artifacts for it.

## 2. The thresholds are mis-calibrated, not the mechanism

`teacher_signal_probe.ts` separates "threshold problem" from "signal problem":

| Comparison | Result |
|---|---|
| forced-takeover action == default-threshold action | 7/24 |
| forced-takeover action == heuristic action | 7/24 |
| topK=64 forced == heuristic | 7/24 |
| topK=64 forced ≠ topK=10 forced | 4/24 |

Lowering `takeoverThreshold` from 1200 to 0 changes the chosen action in **17 of 24
decisions (71%)**. The mechanism works; the thresholds are set far above the operating
range of the leaves, so the mechanism never engages.

This is a **configuration defect, not a dead end** — the opposite of what the agreement
rate alone suggested, and the reason the probe was worth running.

## 3. Calibrated, it improves its own objective and never regresses

`teacher_leaf_gain.ts`, paired per decision on the same state, both choices scored by the
same evaluator from fresh kernels:

| | value |
|---|---|
| decisions | 16 |
| search better / equal / **worse** | **10 / 6 / 0** |
| leaf gain min / p25 / median / p75 / max | 0 / 0 / 75 / 300 / 582 |
| wall clock | 10.6 s for 16 decisions (~0.66 s/decision on Duel) |

Never worse, better in 62% of decisions. **PROXY ONLY** — both leaves come from
`evaluatePositionHeuristic`, so this shows the kernel improves its own objective, not that
it wins more games.

## 4. As an online policy it is unusable at any tested setting

`eval_search_teacher.ts`, calibrated kernel (topK 64, oppProbeK 8, friendlyRollout 4),
3-player Midway, 300 s wall clock per arm:

| Arm | Outcome | steps reached | takeovers | mirror | delta |
|---|---|---|---|---|---|
| P0 | **WALL_TIMEOUT** | 185 | 32/70 | NATURAL_LOSS | 0 |
| P1 | **WALL_TIMEOUT** | 161 | 30/57 | NATURAL_LOSS | 0 |
| P2 | **WALL_TIMEOUT** | 174 | 26/48 | NATURAL_LOSS | 0 |

**All three arms hit the wall clock after ~5 minutes and fewer than 200 steps.** The mirror
finished the same map in 2,079 steps. Takeover rate 88/175 = **50.3%** — the calibrated
kernel really does depart from the heuristic half the time, and that is exactly why it
cannot run as a 1-second online policy.

The taskbook's warning is confirmed by measurement: *"慢教师不直接作为1秒在线策略，除非实现
有界/可中断版本并重新测速."* At ~0.66–6 s per decision this kernel cannot be one.

## Verdict and what it licenses

| Question | Answer |
|---|---|
| Is the shipped search teacher a valid distinct teacher? | **NO** — 120/120 identical to the heuristic |
| Can it become one? | **YES** — a threshold recalibration makes it differ in 71% of decisions |
| Does the calibrated version improve its own objective? | **YES** — 10 better / 6 equal / 0 worse |
| Can it be a 1-second online policy? | **NO** — wall-timeout at every seat, no bounded variant implemented |
| Can it label offline data for B2? | **YES, provisionally** — that is the role it can actually fill |

**Decision: keep the search-distillation branch OPEN, but only as an offline label source,
and only after the threshold recalibration is committed as a recorded kernel version.**
It is closed as an online policy and closed as "already proven stronger than the heuristic"
— neither the V12 17/20 nor any measurement here supports a strength claim.

## What is still missing before B2 may run

1. **Tactical soundness.** Leaf improvement is a proxy; B2 needs evidence the calibrated
   kernel does not blunder. That is the taskbook's tactical regression set, which WAS NOT
   BUILT. It should be built from real endgame states, not hand-authored positions.
2. **A bounded, cancellable kernel version** with a hard budget and a legal fallback, if
   the kernel is ever to be evaluated in natural games rather than timing out.
3. **Teacher recall under the new ordering** (T13-04's 78.75%-at-48 was measured on the old
   converter order and against the old selector).
4. **A cost ceiling for labels.** At ~1.3 s/decision the taskbook's 2,048-decision cap is
   ~44 minutes per arm; the 128-decision pilot must be run first and its quality checked.

## Boundary statements

- No win-rate claim is made for the calibrated teacher: every natural arm timed out.
- No claim is made that the calibrated teacher is stronger than the heuristic. The leaf
  comparison is against its own objective.
- The V12 17/20 remains PROVISIONAL and was not used as a certificate anywhere in this
  round.
- One map, one seed block, seat arms sharing a single mirror. No cross-map claim.
