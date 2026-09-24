# Reproduction commands

All commands run from the repository root. `<runId>` is `v13_20260924_t13`.

Environment facts: Node `v22.18.0`, Python `3.12` with torch `2.14.0+cpu` and NumPy,
8 CPU threads, 25 GB free RAM, 55 GB free disk. Device: **cpu** (no CUDA).

## Verification that nothing was changed by surprise

```powershell
git rev-parse HEAD          # expect b8c0c24312a551a3cf20802f820e3f1edf798395
git status --porcelain      # expect: v13/ untracked; the modified files listed below
```

Modified tracked files (V13 work only — no user code was reset or overwritten):

```
python/train_spatial_resnet.py            T13-01 trainer fixes
src/game/ai/spatial_neural_adapter.ts     T13-02 predictor identity
python/tests/test_v13_trainer_contract.py new
v13/tools/*.ts                            new
```

## T13-00 — freeze identity

```powershell
py v13/tools/v13_identity.py --run-id v13_20260924_t13
```

Writes `v13/out/<runId>/T13-00/{source_snapshot,artifact_identity}.json`.
Hashes 50 artifacts; prints `registryShaMismatches` (expect `[]`).

## T13-01 — trainer regression suite

```powershell
# new counter-example suite (23 tests)
py -m unittest discover -s python/tests -p "test_v13_*.py" -v

# pre-existing trainer regressions must still pass (14 tests)
py -m unittest discover -s python/tests -p "test_v11_*.py"

# typecheck
npx --no-install tsc --noEmit -p tsconfig.json
```

To watch the pre-V13 behaviour fail on demand:

```powershell
py python/train_spatial_resnet.py --dataset <fixture.jsonl> --split-manifest <split.json> `
  --epochs 1 --batch-size 8 --max-steps 2 --legacy-bug-repro `
  --out-model _work/x.json --out-metrics _work/x.metrics.json `
  --optimized-manifest _work/x.opt.json
```

## T13-02 — protocol v3 tests and self-test

```powershell
# 17 core regression tests (classification, draws, errors, stream determinism)
node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/eval_v3_core.test.ts

# self-test: both arms are the same policy, so every observable must match
node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/eval_paired_v3.ts `
  --run-id v13_20260924_t13 --candidate heuristic `
  --scenario "SDPLAN:sd-normal:(2) Duel.aem" --seeds 2026070501,2026070502 `
  --max-steps 20000 --selftest --code-commit b8c0c24312a551a3cf20802f820e3f1edf798395 `
  --out v13/out/v13_20260924_t13/T13-02/selftest_duel_2seeds.json

# fault injection: a forced step cap must be STEP_LIMIT, never NATURAL_LOSS
node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/eval_paired_v3.ts `
  --candidate heuristic --scenario "SDPLAN:sd-normal:(2) Duel.aem" --seeds 2026070501 `
  --fault-inject step-cap `
  --out v13/out/v13_20260924_t13/T13-02/fault_stepcap_duel.json
```

`vitest` is **not** usable in this sandbox (esbuild's `child_process.spawn` is denied
with `EPERM`). The runner above executes the real modules in-process instead.

## T13-03 — provenance and value-label audit

```powershell
node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/dataset_v3_provenance.ts `
  --out-dir v13/out/v13_20260924_t13/T13-03
```

Hashes both inputs (the source archive is 7.27 GB, streamed). To skip re-hashing an
unchanged 7 GB file, pass the verified digests:

```powershell
  --pool-sha256   7cadc0d1ce9769eff50ff0b77285f4cdce4ff308681515980979218d81f6d0f9 `
  --source-sha256 9751a612f59427bd6f34bd7f6968ce5b3ac8afa368a4634825112bd30e37aa8d
```

Exits non-zero with `ALIGNMENT FAILED` if positional provenance recovery is invalid.

## T13-04 — candidate contract (WRITTEN, NOT RUN)

```powershell
node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/candidate_contract.ts `
  --pool-sha256 7cadc0d1ce9769eff50ff0b77285f4cdce4ff308681515980979218d81f6d0f9 `
  --out-dir v13/out/v13_20260924_t13/T13-04
```

Run it before T13-05; it is the G1 gate for candidate identity.

## Historical protocol reproduction (for comparison only, not the formal protocol)

```powershell
node --openssl-legacy-provider v12/tools/run-tool.mjs v12/tools/eval_paired_seats.ts `
  --candidate heuristic --scenario "SDPLAN:sd-normal:(4) Crossroads.aem" `
  --seeds 2026070501,2026070502 --seats 0,1,2,3 --max-steps 20000 `
  --out v13/out/v13_20260924_t13/legacy_protocol_reproduction.json
```

Note: this writes to a **new** path. It still re-plays the identical mirror once per
seat, which is the defect v3 fixes; use it only to reproduce the old reading.

## T13-05 — model matrix (NOT RUN — do this next)

```powershell
# 1. the weights the UI actually loads
node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/eval_paired_v3.ts `
  --candidate src/game/ai/models/spatial_resnet_v2_checkpoint.json `
  --scenario "SDPLAN:sd-normal:(2) Duel.aem" --seeds 2026070501,2026070502 `
  --seeds 2026070501,2026070502 --max-steps 20000 `
  --out v13/out/v13_20260924_t13/T13-05/duel_src_weights.json

# 2. and 3. the two V12 candidates, same protocol
#    --candidate v12/models/budget_s42.json
#    --candidate v12/models/v2_honest_s42.json
```

**Budget warning:** Crossroads (4-player) did not finish a single all-heuristic mirror
within ~2 hours. Budget Duel first; treat Crossroads as a separate, explicitly sized
round.

## T13-07 — B0 baseline (NOT RUN — mainline deliverable)

The trainer side is ready: pass an explicit `--split-manifest`, separate
`--model-seed` / `--split-seed` / `--data-order-seed`, a filtered single-teacher dataset,
and write best/last/state/metrics/consumption into
`v13/out/<runId>/T13-07/` and `v13/models/<runId>/`. Do not reuse `v12/out` defaults.
