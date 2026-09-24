# T13-05 · existing models re-measured under one protocol

Protocol: `v13/tools/eval_paired_v3.ts` (`v13_paired_seat_eval_3`), self-tested before use.
Arena: `SDPLAN:sd-normal:(2) Duel.aem`. Seeds `2026070501`, `2026070502`. Seats discovered
from the engine (2 on this map). `--max-steps 20000`. Silent fallback disabled.

Machine-readable: `existing_checkpoint_matrix.jsonl` (14 records, every field per candidate).

## First batch + extension: 8 candidates, all measured

| Candidate | checkpoint SHA-256 (head) | natural wins | seat arms | mirror | delta |
|---|---|---|---|---|---|
| `src/.../spatial_resnet_v2_checkpoint.json` | `1721ca177ec72945…` | **2** | 4 | 2 | **0.00** |
| `v12/models/diag_grouped_s42.json` | `73c7223912b2e59e…` | **1** | 4 | 2 | **−0.25** |
| `v12/models/budget_s42.json` | `25361b1bfc4581d8…` | 0 | 4 | 2 | −0.50 |
| `v12/models/budget_s1337.json` | `abe95e30367708f0…` | 0 | 4 | 2 | −0.50 |
| `v12/models/budget_s2026.json` | `c71dd12710ead5e1…` | 0 | 4 | 2 | −0.50 |
| `v12/models/budget_s2026_last.json` | `c71dd12710ead5e1…` | 0 | 4 | 2 | −0.50 |
| `v12/models/v2_honest_s42.json` | `60f24e60918502e5…` | 0 | 4 | 2 | −0.50 |
| `v12/models/v2_honest_s42_last.json` | `88e875acd733a254…` | 0 | 4 | 2 | −0.50 |

Zero truncations, zero fallbacks, p50 38–40 ms throughout. Every checkpoint SHA is the
digest of the bytes actually loaded, passed through `setSpatialPredictorIdentity` — never
read back from the static registry.

## What the extension added

- **`v2_honest_s42_last` scores exactly the same as `v2_honest_s42` best (0/4, −0.50).** On
  this map, training past the best epoch neither helped nor hurt measurably.
- **`budget_s2026` and `budget_s2026_last` are byte-identical** (`c71dd127…`) and were
  confirmed to score identically. That run cannot supply two independent artifacts, which is
  now demonstrated rather than inferred (claim C13-13).
- **`diag_grouped_s42` is the strongest network candidate measured in this project: 1 natural
  win in 4 seat arms, delta −0.25.** Still below the heuristic, but the best of the eight.
- **`budget_s1337` matches `budget_s42` exactly**, so the three old-pool seeds are
  indistinguishable on this map.

## The answer this matrix was built to produce

**`v2_honest_s42` is not worse than `budget_s42`** — both 0/4 against the same mirror. The V12
`budget_s42` paired result therefore cannot be presented as a result *or* a refutation for
the corrected full-pool model. That question now has its own reading, and the answer is "no
measurable difference on this map".

## Why this map cannot separate the candidates

All 16 mirror games across the eight measurements were won by **alliance 0**, and only seat
P0 ever won. The seat, not the policy, does most of the work here. `delta` is therefore
bounded by the seat asymmetry, and 4 seat arms cannot resolve a policy difference on top of
it.

**These are directional development readings, not certified effect sizes, and not cross-map
evidence.** No candidate beat the heuristic.

## Not measured

Nothing remains on the taskbook's candidate list for this arena. The B0 arms were measured on
3-player Midway instead (see `pilot_training_report*.md`), and 4-player Crossroads remains
unmeasured because its one attempt exceeded the round's wall clock and is recorded as
`BUDGET_EXHAUSTED`.
