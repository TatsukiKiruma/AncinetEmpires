# T13-00 · delta since the V13 review

- Review baseline: `path-b-spatial-ai` @ `b8c0c24312a551a3cf20802f820e3f1edf798395`
- Local HEAD at task start: `b8c0c24312a551a3cf20802f820e3f1edf798395` (`train/battle-ai-20260923`)
- `git status --porcelain` at task start: `?? v13/` only (the untracked review pack)
- Dirty diff against the review commit at task start: **empty**

## Verdict

**No delta.** The repository is exactly the commit the review audited, so every
defect the review names was re-confirmed against the live source rather than
inherited from the report. Nothing was reset and no user code was overwritten.

## What was re-confirmed against live source (not inherited)

| Claim | Live evidence |
|---|---|
| Training truncates to 48 candidates, inference scores all legal actions | `tools/convert_archive_to_spatial.ts:232,406-424` vs `src/game/ai/shared_spatial_policy.ts:56` |
| Search teacher evaluates only 6 candidates | `v12/out/labels/label_quality_v2.json` → `config.maxCandidates=6`, `topK=10` |
| Train loss double-counted | `python/train_spatial_resnet.py` optimizer block + common footer (pre-fix) |
| Value prediction/target filters differ | same file, `val_pred[valid]` vs `[vt for vt in raw if vt is not None]` (pre-fix) |
| Split/init fall back silently | `if args.split_manifest and os.path.exists(...)` / `if args.init_checkpoint and os.path.exists(...)` (pre-fix) |
| Seed drives both init and partition | `torch.manual_seed(args.seed)` + the internal grouped-split `random.Random(args.seed)` |
| Adapter telemetry SHA comes from the static registry | `src/game/ai/spatial_neural_adapter.ts:123` (pre-fix) |
| Default production policy is the heuristic | `src/game/ai/models/model_registry.json` → `defaultProductionPolicy: "heuristic"` |

## Identity facts frozen by T13-00

Real file SHA-256 (never Git blob IDs); see `artifact_identity.json` for the full table.

| Artifact | SHA-256 (head) |
|---|---|
| `src/game/ai/models/spatial_resnet_v2_checkpoint.json` | `1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92` |
| `v12/models/budget_s42.json` | `25361b1bfc4581d8…` |
| `v12/models/v2_honest_s42.json` | `60f24e60918502e5…` |
| `training_runs/spatial_dataset/spatial_v2_full_pool.jsonl` | `7cadc0d1ce9769ef…` |
| `training_runs/spatial_dataset/spatial_train_scaled_30k.jsonl` | `88a1f4c2ea1e32a7…` |

Every SHA the registry declares resolves to a real file whose digest matches.
There are **no** `MISMATCH` entries in `registryShaCrossCheck`.

## Two identity findings the review pack did not contain

1. **The registry is internally consistent.** `spatial_v2_experimental` declares
   `1721ca17…` and the deployed `spatial_resnet_v2_checkpoint.json` hashes to
   exactly that. So the deployment claim "the UI loads an older 7,832-state
   version" is a statement about *which model was trained*, not about a broken
   hash chain.
2. **`budget_s2026.json` and `budget_s2026_last.json` are byte-identical**
   (`c71dd12710ead5e1…`), while that run's metrics report `best_epoch: 7` with a
   different epoch-8 accuracy. Every other run in the matrix has distinct
   best/last hashes. `budget_s2026` therefore cannot supply two independent
   artifacts. Recorded as C13-13; it does not affect this round's first-batch
   evaluation candidates.

## Reference chain recorded

`training run → dataset → split → best/last weights → evaluation → UI` is now
resolvable to a unique real digest at every step. The remaining unknown is the
UI question (which policy a given session requests), which is not derivable from
the registry.
