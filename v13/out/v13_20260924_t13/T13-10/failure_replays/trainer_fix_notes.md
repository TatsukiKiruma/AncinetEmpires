# T13-01 · trainer fixes and counter-example regressions

Scope: `python/train_spatial_resnet.py` and `python/tests/test_v13_trainer_contract.py`.
No architecture, optimiser or label-scheme change was made in this task, so the fixes
cannot be confused with a training result.

## Fixed defects

### 1. Training loss was accumulated twice (D13-01)

Pre-fix, `run_epoch` added the batch loss inside the `if is_train and optimizer:` block
**and** again in the common footer. `loss.backward()` / `optimizer.step()` still ran
once per batch, so this was a reporting bug, not a training bug.

**Two further accounting defects were found while fixing it**, both in the same
normalisation:

- the denominator was `steps_run` when a cap was set and `len(dataloader)` otherwise,
  and neither equals the number of *accumulated* batches. When a cap break fired, the
  last already-optimised batch was silently dropped from the mean.
- `DataLoader` drops a partial trailing batch while `len(dataloader)` still counts it.
  With 16 train rows and `--batch-size 8` the loop processed **one** real batch while
  the denominator was **two**, halving the reported mean a second time.

All three are fixed: there is now exactly one accumulation site, it runs before the
early exit, and the mean is divided by `batches_accumulated`.

Measured on this machine (32 rows, 16/16 split, batch 8, cap 2):
`v13_fixed` train_loss `0.6938375533` vs pre-V13 accounting `1.0411738455`.

### 2. Value prediction and value target used different filters (D13-02)

Pre-fix, predictions were selected by `not None AND mask` while targets were selected
by `not None` only. On a batch that mixed a masked row with an unmasked one, torch
broadcast the prediction across the target axis.

Reproduced here on torch `2.14.0+cpu`: targets `[1.0, -1.0]`, mask `[true, false]`,
predictions `[0.25, 0.75]` gives loss `1.0625` and gradient `+0.5` instead of the
correct `0.5625` and `-1.5`. The gradient direction on the surviving prediction is
reversed.

Fix: one index set for both sides, plus an explicit
`val_p.shape != val_t.shape` check that refuses to broadcast.

**Boundary (verified, and stronger than the review's version):** this defect was
*inert* on every historical run. The converter never emits a `valueLossMask` field
(`tools/convert_archive_to_spatial.ts:457-469`) and the loader defaulted the mask to
`valueTarget is not None`, so the two predicates were identical by construction; both
V12 metrics files also report `value_weight = 0.0`. The defect becomes live the moment
an explicit mask field is added — which is what T13-03's schema asks for — so fixing it
now is what makes that schema change safe. The suite therefore also **refuses** a
dataset whose explicit mask contradicts its target rather than silently normalising it.

### 3. Silent fallback on a missing split or init path (D13-03)

`--split-manifest` and `--init-checkpoint` now raise `FileNotFoundError` when the named
path does not exist. The message states that substitution is refused, so an operator
cannot mistake the failure for a warning.

### 4. The legacy partition key was a silent trap (D13-04)

The internal grouped split fell back to `f'ep_{idx // 60}'` for any row without
`rootFamilyId`/`episodeId`. `v12/out/spatial/T12-04_split_check.json` measures what that
costs when it fires: 811 pseudo-groups, a train/val root overlap of 33, and 46,512
samples (95.48%) inside leaked episodes. The v2 run never hit it because every row
carries `rootFamilyId`, so this was latent rather than realised.

The fallback is now opt-in via `--allow-legacy-grouping` and the run is watermarked in
its metrics (`split.legacyGroupingUsed`, `split.legacyGroupRows`, `split.watermark`).

### 5. Seed conflation (D13-04)

`--seed` drove both `torch.manual_seed` and the partition RNG, so three "seeds" were
never three initialisations on a fixed validation set. Split into `--model-seed`,
`--split-seed` and `--data-order-seed`; `--seed` remains as the legacy fallback for all
three, and the resolved values are written to `metrics.seeds`.

### 6. Planned output was nameable as consumption evidence

`--consumed-manifest` writes **before** the first optimiser step, so it can never be
evidence of consumption; the V10 pipeline validated DAgger coverage against it, which is
a closed loop that cannot fail. It now carries
`schema: v13_planned_split_1`, `measured: false`, `isConsumptionEvidence: false` and an
explicit warning. Consumption evidence remains the post-training
`optimized_samples_manifest.json` and `optimizer_update_ledger.jsonl`.

### 7. Policy accuracy was scored on masked rows

Accuracy incremented for every row regardless of `policyLossMask`, so an all-masked run
still reported non-zero accuracy that read as learning. Accuracy now only counts rows
whose policy label is supervised.

### 8. Additional hardening

- non-finite / non-numeric `valueTarget` is refused at load time
- an explicit split manifest with overlapping `train`/`val`/`test` root families is
  refused, and a row that is itself missing `rootFamilyId` is refused rather than
  guessed
- `--resume-state` / `--out-state` were added, with model + optimiser + scheduler + RNG
  + progress saved atomically per epoch, kept separate from the JSON deployment weights
- metrics are written through a temp file and renamed

## Counter-examples required by the taskbook, and where they live

| Required counter-example | Test |
|---|---|
| `[+1,-1]` with `[true,false]` mask | `test_value_mask_uses_one_index_set` |
| 2-prediction / 3-target old shape | `test_two_predictions_three_targets_raises` |
| mask contradicting the target | `test_trainer_refuses_explicit_mask_that_contradicts_target` |
| mixed-mask batch still trains | `test_mixed_mask_batch_trains_without_shape_error` |
| loss `[1,2,3]` averaging | `test_train_loss_is_single_counted_and_matches_legacy_halving`, `test_legacy_inflation_is_not_a_clean_factor_when_the_cap_cuts_an_epoch` |
| val loss unaffected by the fix | `test_val_loss_is_unchanged_by_the_accounting_fix` |
| missing split path | `test_missing_split_manifest_fails_closed` |
| missing init checkpoint | `test_missing_init_checkpoint_fails_closed` |
| duplicate sampleId, conflicting stateHash | `test_duplicate_sample_id_with_conflicting_state_hash_is_refused` |
| same fixed split, different model seed | `test_model_seed_changes_weights_but_not_the_split`, `test_split_seed_does_not_leak_into_model_init` |
| all masks false | `test_all_masks_false_is_not_counted_as_learning` |
| global cap across an epoch boundary | `test_global_cap_holds_across_epoch_boundary` |
| capped run keeps its last optimised batch | `test_capped_run_does_not_drop_the_last_optimized_batch` |
| rows with no root identity | `test_rows_without_root_identity_are_refused_by_default`, `test_legacy_grouping_is_watermarked_when_explicitly_enabled` |
| plan is not consumption evidence | `test_planned_manifest_is_not_consumption_evidence` |
| resumable state | `test_state_file_is_written_and_resumes` |

### The old behaviour genuinely fails these tests

`--legacy-bug-repro` re-enables the pre-V13 accumulation (both sites and the old
denominator) so the regression compares the shipped fix against the shipped bug rather
than against a retyped copy. The mask counter-example is run through real torch on the
exact expression the old code used.

The bundled `review_reproductions.py` is used only as a statement of the counter-example;
the assertions that gate this task run through the real trainer.

## This task claims no playing-strength improvement.

