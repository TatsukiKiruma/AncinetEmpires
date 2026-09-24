# T13-06 · tactical soundness and the bounded kernel

Verdict for the branch: **the search-distillation line (B2) is now CLOSED.**

The deciding measurement is not a win rate. It is that the calibrated teacher **fails a
basic tactical test that the plain heuristic passes 100% of the time**, and that it gets
*worse* as its candidate budget grows.

## The failure

`IMMEDIATE_CAPTURE` = the engine offers a legal `capture` this turn. Across 120-150 real
decisions on 3-player Midway, one seed, budget swept:

| `maxCandidates` | decisions where a free capture exists | kernel takes it | **heuristic takes it** | max decision ms |
|---|---|---|---|---|
| 4 | 13 | **69.2%** | **100%** | 2,038 |
| 8 | 13 | **30.8%** | **100%** | 4,014 |
| 16 | 13–14 | **21.4–23.1%** | **100%** | 7,347 |
| 32 | 13 | **23.1%** | **100%** | 14,160 |

The heuristic never misses a free capture. The calibrated kernel misses it three times out
of four, and **raising the candidate budget makes it worse**, not better.

Zero illegal actions at every setting, so this is not a legality problem. It is a
decision-quality problem.

## Why the wider budget is worse, not better

The kernel is configured with `takeoverThreshold: 0`, i.e. "always take the highest leaf".
The leaf values carry per-call jitter — `HeuristicAI.scoreAction` adds `rng() * 20..30` on
most branches — so taking the maximum over a larger candidate set increasingly selects
whichever candidate drew a lucky roll rather than whichever is genuinely better. A forced
takeover is a **noise maximiser** when the leaf is stochastic.

This also explains why the previous round's paired leaf comparison looked good (10 better /
6 equal / 0 worse): it compared two *single* evaluations. The defect only appears when a
maximum is taken across many evaluations, which is exactly what the kernel does in
production and what the suite does here.

So the earlier "calibrated kernel improves its own objective" finding was **an artifact of
how it was measured**, and this round supersedes it. That correction is recorded rather
than buried.

## The other patterns, for completeness

At `maxCandidates=16`, 150 decisions:

| Pattern | n | kernel | heuristic |
|---|---|---|---|
| `RECRUIT_AVAILABLE` | 76 | 51.3% | 25.0% |
| `IMMEDIATE_CAPTURE` | 14 | 21.4% | **100%** |
| `MOVE_THEN_ATTACK` | 53 | 9.4% | 26.4% |
| `OWN_COMMANDER_THREAT` | 40 | 50.0% | 65.0% |

The kernel recruits more and defers more — behaviourally distinct, which is what the
earlier probes established. But it is worse on the two patterns that are unambiguously
about not losing material (`IMMEDIATE_CAPTURE`, `MOVE_THEN_ATTACK`) and worse on commander
defence. `DEFERRED` is not automatically wrong for the others, which is why the heuristic
is given identical treatment as the comparison.

## The bounded kernel does not achieve a 1-second bound

`BoundedSearchKernel` caps the inner `topK` to `maxCandidates`, which makes the work per
decision finite and provably terminates, with a legal-action fallback that was never needed
(0 fallbacks, 0 illegal actions in ~510 probed decisions).

**But the bound is not enforceable in time.** `BattleSearchAI.evaluateCandidate` runs a
friendly rollout that calls the heuristic over the full legal action list, and on some
states that list has hundreds of entries, so a single evaluation can cost seconds:

| `maxCandidates` | worst observed decision |
|---|---|
| 4 | **2.0 s** |
| 8 | 4.0 s |
| 16 | 7.3 s |
| 32 | 14.2 s |

Even the smallest tested configuration exceeds a 1-second online budget at its worst
decision. A true bound needs an interruptible evaluator or a candidate-count cap on the
rollout itself, neither of which exists.

## Verdict

| Question | Answer |
|---|---|
| Is the shipped teacher a distinct policy? | **No** — 120/120 identical to the heuristic |
| Can recalibration make it distinct? | **Yes** — 71% of decisions change |
| Is the calibrated teacher tactically sound? | **No** — 23–69% on free captures vs the heuristic's 100% |
| Does a bigger search budget help? | **No** — capture rate falls as the budget rises |
| Can it be a bounded online policy? | **No** — 2.0 s worst case at the smallest setting |
| Should B2 distil it? | **No** |

**B2 is closed.** The taskbook's own escape hatch applies: *"若教师不成立，就修教师而不是花更多
时间训练复制其偏差."* Two rounds of probing have now shown that repairing this teacher means
replacing its leaf evaluation, because the stochastic static leaf plus a forced takeover is
the defect. That is a new teacher, not a recalibration, and it is out of scope for the
budget of this taskbook.

## What this closes and what it leaves open

- **Closed:** B2 (search distillation), T13-08 (DAgger needs a callable teacher — this one
  is neither sound nor bounded), and the V12 "17/20" as any kind of credential.
- **Still open and unchanged:** T13-09 (value head) is gated on natural terminations, not on
  the teacher. T13-07's B0 result stands: the task is learnable (22× chance) and imitation
  does not beat the heuristic, and now we know the search route does not either.
- **The honest state of the project:** every route tried so far — imitation of the
  heuristic, and distillation of a search that turns out to be the heuristic — reduces to
  copying the policy it must beat.

## Boundaries

- One map, one seed, 120–150 decisions per setting. Rates are directional.
- `DEFERRED` classifications are not errors; only `IMMEDIATE_CAPTURE` is unambiguous, and it
  is reported as such.
- The noise-maximiser explanation is inferred from the observed monotonic trend plus the
  known `rng()*20..30` in the leaf. It was NOT isolated with a dedicated experiment, and is
  labelled as an inference.
