# T13-03 · data v3: identity, provenance and outcome-label separation

Tool: `v13/tools/dataset_v3_provenance.ts`
Inputs (hashed, unchanged): pool `7cadc0d1ce9769ef…`, source `9751a612f59427bd…`

## What was measured

| Check | Result |
|---|---|
| Row alignment between source archive and converted pool | **0 mismatches in 48,714 rows** across `step`, `turn`, `playerId` |
| Behaviour policy recovered per row | `heuristic` 31,424 / `apk-like` 17,290 |
| Roots containing more than one policy | **37 / 37** |
| Is `policy` single-valued per row? | Yes — every row carries exactly one policy |
| `valueTarget` vs the source's own terminal winner | **35,195 agree, 0 disagree** |
| Rows with `valueTarget = null` | 13,519 |
| Independent natural terminations | **30 roots** |

## The decisive finding: the mixing is BETWEEN rows, not WITHIN rows

Every converted row has exactly one behaviour policy, and it is recoverable by
position with zero mismatches. `heuristic` and `apk-like` rows are interleaved inside
the same 37 episodes, but no individual decision is ambiguous about who made it.

This settles C13-03 against the V12 report's phrasing. "The two teachers are completely
interwoven in all 37/37 games, with no separation by game or trajectory" is true at the
*episode* level and irrelevant at the *row* level. Therefore:

- **per-row filtering is sufficient** to build a single-teacher dataset, and
- **discarding whole episodes is not required**, and
- relabelling the same legal states with a named teacher is a second, independent option.

The recovered tally matches `v12/out/archive_value/imitation_mix.json` exactly, so the
recovery method is validated against the report it corrects.

`teacher_provenance_by_row.txt` is the actual provenance column a v3 materialisation
would carry — one policy label per row, in pool order. This is what turns "we should
filter by teacher" from an aspiration into an executable step.

## The value labels are correct, and my first audit of them was wrong

My initial version of this tool compared each row's `valueTarget` against that row's own
`outcome.winnerAfter` and reported 35,165 disagreements. That was a **tool bug, not a
data defect**, and it is recorded here because the wrong number would have been a
serious false finding:

- `outcome.winnerAfter` is populated **only on an episode's terminal step**. Verified on
  this archive: rows 1–6 of the first episode all carry `null`.
- The converter therefore broadcasts each episode's *last non-null* `winnerAfter` to
  every row of that episode — which is exactly what a Monte-Carlo return broadcast
  should do, and what `v12/out/spatial/T12-04_dataset_report.json` claims.
- `observation.rules.alliances` is `{}` on this archive, so by
  `src/game/rule_config.ts:168` a player is its own alliance and the expected label is
  `+1` iff the terminal winner equals the subject player's id.

After fixing the comparison to be episode-level, the result is **35,195 / 35,195 in
agreement**. The V12 converter's value-target derivation is independently confirmed.

The tool now records the source outcome shape explicitly
(`rowsWithOutcomeDone`, `rowsWithPerRowNonNullWinnerAfter`) so the "terminal step only"
property is demonstrated rather than assumed.

## Lineage and partition facts

- 37 distinct root families; `rootFamilyId` equals `episodeId` on every row.
- No root family is policy-pure, so a policy filter and a root-level partition are
  different operations; partitioning must stay by root, filtering may be by row.
- 30 of 37 roots have a natural termination, so any value-based work has **30 independent
  natural terminations**, not 48,714 rows. This is the number that must be quoted.

## Not done in this round (explicit)

- The 1.3 GB pool was **not rewritten**. The v3 columns exist as a manifest plus a
  row-ordered provenance sidecar; materialising a filtered single-teacher dataset is a
  T13-07 step, and skipping a full rewrite keeps this round inside budget.
- The 7 roots with no terminal winner were **not** repaired. T13-03 permits repair only
  through trusted episode summaries or replay evidence; guessing a label is forbidden
  and `adjudicatedWinner` was not substituted for `naturalWinner` anywhere.
- Maps larger than 20×20: the encoder does not refuse them. Recorded as an open
  silent-clip risk in `candidate_coverage.json`, not fixed here.

## Environment note

The source archive is **7.27 GB**, which exceeds Node's 2 GiB `readFileSync` limit
(`ERR_FS_FILE_TOO_LARGE`). Hashing is therefore streamed. A first attempt failed on
exactly this and is why `--pool-sha256` / `--source-sha256` exist: they let a re-run
reuse a verified digest instead of re-reading 7 GB for a cosmetic difference.
