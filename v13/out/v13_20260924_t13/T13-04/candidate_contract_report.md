# T13-04 · candidate and encoding contract, measured

Tool: `v13/tools/candidate_contract.ts`, run over **all 48,714 converted states**.

## The three contracts that were in play

| Route | Where | Candidate budget | Ordering |
|---|---|---|---|
| Search teacher | `v12/out/labels/label_quality_v2.json` | 6 (`maxCandidates`), `topK` 10 | engine legal order, first N |
| Training | `tools/convert_archive_to_spatial.ts:232,406-424` | 48 | **teacher's action first**, then original legal prefix |
| Inference | `src/game/ai/shared_spatial_policy.ts:56` | all legal actions | **engine legal order** |

The review named the count mismatch between training and inference. The **ordering**
mismatch was not named, and it turns out to be the more damaging one — see
`T13-07/pilot_training_report.md`.

## Action-space distribution

| | min | p10 | median | p90 | max | mean |
|---|---|---|---|---|---|---|
| Legal actions per state | 1 | 6 | **39** | **253** | **756** | 91.75 |
| Stored candidates per state | 1 | 6 | 39 | 48 | 48 | 31.58 |

Truncation fires on **22,276 / 48,714 states = 45.73%**.

## Teacher recall, measured before any forced insertion

| Against | Recall |
|---|---|
| The converter's stored candidate array | **100%** — inflated, because the converter seeds its `Set` with the teacher's action |
| A label-independent shared selector at a 48 cap | **75.27%** |
| All legal actions (what inference actually scores) | 100% |

The 100% figure is the trap: it is a property of the converter, not evidence that the
candidate set is adequate. **75.27% is the honest number**, and it means roughly one in
four teacher decisions is not even a candidate during training under a selector that
cannot see the label.

## What a label-independent selector throws away, by action type

| Action type | legal occurrences | kept | dropped | keep rate |
|---|---|---|---|---|
| support | 329 | 0 | 327 | **0.006** |
| heal | 16,912 | 1,536 | 14,945 | **0.116** |
| destroy_town | 4,481 | 402 | 3,446 | 0.231 |
| move | 3,369,930 | 668,522 | 2,587,376 | 0.232 |
| summon | 409 | 98 | 240 | 0.413 |
| repair | 1,014 | 265 | 534 | 0.473 |
| wait | 569,590 | 116,516 | 265,079 | 0.535 |
| end_turn | 48,522 | 0 | 22,275 | 0.541 |
| surrender | 48,522 | 186 | 22,089 | 0.545 |
| post_attack_move | 13,134 | 4,657 | 2,309 | 0.824 |
| recruit_to_castle | 293,583 | 206,908 | 12,144 | 0.959 |
| attack | 101,236 | 68,661 | 574 | 0.994 |
| capture | 1,847 | 1,497 | 0 | 1.000 |

The types that survive are the ones a naive priority list favours (`attack`, `capture`,
`recruit`). The types that are lost — `support` almost entirely, `heal` heavily, and
`move` (which is the teacher's chosen action in **1,913 of 2,439** B0 rows) — are exactly
the ones a network would need to learn the teacher's actual behaviour.

## Conclusion

**A label-independent selector capped at 48 cannot preserve teacher behaviour on this
distribution.** Therefore either:

1. train on the full legal candidate set (the first choice in the taskbook), computing the
   trunk once and scoring candidates in blocks to bound memory; or
2. truncate, and report the recall loss explicitly rather than silently — never claiming
   coverage was preserved.

The current pipeline does neither: it truncates *and* forces the teacher in, which hides
the loss and simultaneously reorders the array (the ordering defect).

## Not done in T13-04

- the 128-state clean diagnostic set
- feature-collision fixtures for the 11×11 receptive field and the aggregate-enemy encoding
- the Python/TS parity run (same weights and state -> tensor, globals, semantics, logits,
  value, argmax within a pre-declared tolerance)
- the ~99% tiny-fit diagnostic
- an explicit check that maps larger than 20×20 are refused rather than silently clipped
  (recorded as an open risk in `candidate_coverage.json`)

These are the remaining G1 items and they should be finished before B0 is re-run.
