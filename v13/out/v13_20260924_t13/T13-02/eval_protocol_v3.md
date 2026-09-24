# T13-02 · paired evaluation protocol v3

New entry point: `v13/tools/eval_paired_v3.ts` (+ `v13/tools/eval_v3_core.ts` for the
pure classifier, + `v13/tools/eval_v3_core.test.ts` for its regression tests).

The V12 tool is **not** modified. The taskbook requires one protocol instead of one
protocol per script, and the six defects below each needed a structural change rather
than a patch, so v3 is a new file and the old tool stays as the historical record.

## The six defects and their fixes

| # | Defect in `v12/tools/eval_paired_seats.ts` | Fix in v3 |
|---|---|---|
| 1 | Weight injection replaced the predictor cache but telemetry reported `checkpointSha256` from the **static registry** (`spatial_neural_adapter.ts:123`), so the hash described a file that was not executing | v3 hashes the bytes it loads and registers them through `setSpatialPredictorIdentity`; telemetry reads the registered identity and labels its provenance (`direct_file_load` / `injected_weights` / `static_registry`) |
| 2 | The identical all-heuristic mirror was replayed once per candidate seat, producing 8 rows from **2** distinct games, then read as 8 independent observations | One mirror per `(scenario, seed, maxSteps)`, cached and shared by `mirrorId`; the report separates `independentMirrorGames` from `mirrorRowsReferencingAMirror` |
| 3 | `capped = winner === null`, which reported a natural draw (`winner === -1`, `engine.ts:991`) as a truncation and had no bucket for an error | Nine-way taxonomy: `NATURAL_WIN / NATURAL_LOSS / NATURAL_DRAW / STEP_LIMIT / PLY_LIMIT / WALL_TIMEOUT / CANCELLED / POLICY_ERROR / ENGINE_ERROR`, with draws and errors separated first |
| 4 | Truncated games were simply excluded, so a run that never finished looked clean | Undecided games are reported as raw counts **and** as win-rate bounds under "all undecided lose" and "all undecided win"; the small-sample warning is generated, not hand-written |
| 5 | Self-test only checked `delta === 0`, which also holds if both arms diverge identically | Self-test compares `outcomeKind`, `winnerAllianceId`, `steps`, `plies`, `turns`, `trajectoryDigest` and `actionDigest` between the arms |
| 6 | `state.winner` is an **alliance** id but the old tool compared it to a **seat** index | Candidate win/loss is an alliance comparison via `getAllianceId`; the seat→alliance map is recorded in the report |
| 7 | (added) Seats were hard-coded `0,1,2,3` | Seats are discovered from the engine, so a 2-player map is not evaluated as if it had four seats |

Additional guarantees:

- `--selftest` runs `--candidate heuristic`, where both arms are the same policy on the
  same streams, so every observable must match exactly.
- `--fault-inject illegal-action` must classify as `ENGINE_ERROR`/`POLICY_ERROR`;
  `--fault-inject step-cap` must classify as `STEP_LIMIT`. A misclassification fails
  the run's own report (`classifiedCorrectly: false`).
- Per-game records are written in the taskbook's C3 schema as JSONL, one object per
  game, including `trajectoryDigest` and the p50/p95/p99/max latency distribution.
- Outputs are written to a temp file and renamed, so an evaluator can never read a
  half-written result.

## Test evidence

`node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/eval_v3_core.test.ts`
→ **17/17 passed**. Covers the draw/limit/error separation, alliance-vs-seat comparison,
taxonomy partitioning, stream determinism, and the "seat parity is not seed parity"
property that the V12 archive confound depended on.

`npx --no-install tsc --noEmit -p tsconfig.json` → clean.

## Environment blocker recorded

`npx --no-install vitest run` **cannot execute in this sandbox**: esbuild's service
startup calls `child_process.spawn`, which the sandbox denies with `EPERM`. This is
the documented sandbox boundary, not a repository defect. The v3 tests therefore run
through the repository's own in-process TypeScript runner (`v12/tools/run-tool.mjs`,
the same shim the v12 tools use), which executes the real modules rather than a
re-implementation.
