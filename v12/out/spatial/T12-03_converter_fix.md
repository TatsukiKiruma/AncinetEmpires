# T12-03 — `tools/convert_archive_to_spatial.ts` converter fix

Branch `train/battle-ai-20260923`, base commit `9c6c1ab`. Only
`tools/convert_archive_to_spatial.ts` was modified; no game rules, no `v10/**`, no
existing `v11/out/**` artifact and no pre-existing `spatial_*.jsonl` was touched
(see "Untouched-artifact proof" below).

---

## 1. Why the fix was needed (re-verified, not assumed)

`v12/tools/spatial_verify_30k.mjs` re-measured the dataset the current spatial
ResNet trains on. Raw output is in `v12/out/spatial/T12-03_input_verification.json`.

| file | lines | key signature | `rootFamilyId` absent | `valueTarget` non-null |
|---|---|---|---|---|
| `spatial_train_scaled_30k.jsonl` | 30,000 | `sampleId,spatialTensor,globalFeatures,targetActionIndex,candidateActions,valueTarget` (1 signature, 30,000/30,000) | 30,000 / 30,000 | **20 (0.067%)** |
| `spatial_train_25ep.jsonl` | 1,500 | includes `episodeId,rootFamilyId,step,turn,playerId` (1 signature) | 0 | 0 (0%) |
| `spatial_pilot_01.jsonl` | 300 | includes `episodeId,rootFamilyId,step,turn,playerId` (1 signature) | 0 | 0 (0%) |

Consequences, both confirmed against the trainer source:

* `python/train_spatial_resnet.py:480` —
  `ep_id = sample.get("rootFamilyId") or sample.get("episodeId") or f"ep_{idx // 60}"`.
  With both fields absent on all 30,000 records, the grouped split silently
  degrades to synthetic 60-consecutive-sample blocks. Measured in
  `T12-04_split_check.json`: with that legacy key, **33 of 37 real episodes land in
  both train and val and 46,512 samples (95.48%) sit inside a leaked episode**, so
  every reported `val_acc` / `OOD top-1` on that file is meaningless.
* `tools/convert_archive_to_spatial.ts` (old lines 166-170) only assigned
  `valueTarget` when that single line carried a non-null `outcome.winnerAfter`,
  i.e. only on an episode's **terminal** decision step. That is the 20/30,000.

## 2. What changed

### 2.1 `episodeId` / `rootFamilyId` (+ free fields) — requirement 1

New helpers:

* `episodeKeyFor()` — **line 81**. Emits the readable, deterministic
  `"${scenario.id}#${seed}#${source.episodeIndex}"`, e.g.
  `SDPLAN:sd-medium-advantage-endgame:(4) Crossroads.aem#2027170504#0`.
  Readable is preferred over a sha1/sha256 prefix on purpose: the trainer only
  needs *equality grouping*, and a readable key is directly debuggable in the
  `.jsonl`. A single root per episode is correct here, so `episodeId` and
  `rootFamilyId` carry the **same** value (the trainer reads either as a fallback).
* `sampleDedupKeyFor()` — **line 89**. `(scenario.id, seed, step)`, the T12-04 key.
* `extractEpisodeRefCheap()` — **line 122**: pulls `scenario.id`, `seed`,
  `source.episodeIndex`, `step` out of the first 1,200 bytes and `winnerAfter` from
  the tail of the line, avoiding a full `JSON.parse` of a ~150 KB record during the
  multi-GB pass-1 scan. Any shape it cannot vouch for returns `null`.
* `extractEpisodeRefFromParsed()` — **line 155**: the authoritative
  `JSON.parse`-based extraction used in pass 2 and as the pass-1 fallback.
* `extractEpisodeRef()` — **line 170**: cheap path first, `JSON.parse` fallback.

Emission — **lines 457-469**:

```ts
const exportObj = {
    sampleId: `s_${totalSaved}_${sampleData.source?.episodeIndex ?? 0}_${sampleData.step ?? 0}`,
    episodeId: episodeKey,
    rootFamilyId: episodeKey,
    step: sampleData.step ?? null,
    turn: sampleData.turn ?? obs.turn ?? null,
    playerId: playerId ?? null,
    ... // spatialTensor, globalFeatures, targetActionIndex, candidateActions, valueTarget unchanged
};
```

If `scenario.id`/`seed`/`episodeIndex` are ever missing, the fallback key is built
from the **input file basename** plus seed and episode index, so it can never merge
two real episodes into one root (which would re-introduce leakage) and can never
split one episode across two roots. `episodeKeyFallbacks` counts how often this
happened; the real run reported **0**.

### 2.2 `valueTarget` = episode final outcome broadcast to every step — requirement 2

Two-pass stream, bounded memory:

* **PASS 1 — lines 251-291** (`scanEpisodeFinalOutcomes()`, **line 195**): every
  input file is streamed once and only an `episodeKey -> LAST non-null
  outcome.winnerAfter` map is retained — **never the samples**. Overwriting while
  iterating in file order is exactly "the LAST non-null winnerAfter wins".
  Pass 1 completes for *all* inputs before pass 2 begins, so an episode split
  across two input files is still labelled correctly.
* **PASS 2 — lines 292-487**: re-streams the inputs and emits.
  **Lines 448-455**:

```ts
let valueTarget: number | null = null;
if (episodeFinalWinner.has(episodeKey)) {
    valueTarget = episodeFinalWinner.get(episodeKey) === playerId ? 1.0 : -1.0;
}
```

An episode that never terminated is simply **absent** from the map, so every one of
its steps keeps `valueTarget === null`. Censored episodes therefore stay null, as
the taskbook requires. Measured on the produced dataset: 30 of 37 episodes carry a
final winner, 7 are entirely censored, and **0 episodes mix null and non-null
values**, and **0 samples of a censored episode received a non-null value**.

### 2.3 Capping still works and does not corrupt per-episode values — requirement 2 (cont.)

**Lines 481-485**:

```ts
if (maxSamples > 0 && totalSaved >= maxSamples) {
    hitSampleCap = true;
    stoppedInFile = file;
    break outer;
}
```

The cap is checked *after* a sample has been written and *after* its value was
derived from the pass-1 map, so a truncated final episode still has correct values
on every step it did emit — the cap can only shorten an episode, never mislabel it.
`maxSamples <= 0` now means **unlimited** (the old code always capped at 30000 and
had no way to express "convert everything"). `hitSampleCap` and `capStoppedInFile`
are reported in the run stats. `T12-04_conversion_run.json` shows
`requestedMaxSamples: 0, unlimited: true, hitSampleCap: false`.

### 2.4 Cross-file duplicate suppression — T12-04 requirement 2

`dedupeSamples` (default **on**, `--no-dedupe` to disable) drops any sample whose
`(scenario.id, seed, step)` key was already emitted, so a pool containing both
`baseline_dataset.jsonl` and its constituent parts yields zero duplicate keys. The
real run reported `duplicateSamplesSkipped: 0` because the input list was already
deduplicated upstream (see `T12-04_dedup_report.json`).

### 2.5 No overwrite — requirement 3

**Lines 237-242**: the converter throws rather than replacing an existing output
unless `allowOverwrite` / `--allow-overwrite` is passed. The CLI default output was
moved from the pre-existing `training_runs/spatial_dataset/spatial_train_scaled_30k.jsonl`
to the new `training_runs/spatial_dataset/spatial_v2_full_pool.jsonl`
(**lines 575-576**).

### 2.6 Two additional safety fixes

* **Backpressure (line 471 + `writeLine` at ~line 300)**: `outStream.write()`'s
  return value is now honoured (`await once(outStream, 'drain')`). Previously the
  writable buffer grew without bound, which is unsafe for a >1 GB output.
* **CLI input list (lines 552-573)**: the hardcoded `[pvpFile, ...parts00..04]`
  list is replaced by a configurable one (`--inputs` / `SPATIAL_INPUTS`), defaulting
  to the complete pool `pvp + parts00..08 + baseline_dataset.jsonl`, and
  `TARGET_SAMPLES` now defaults to `0` (unlimited) instead of `'30000'`
  (**lines 578-583**). The old defaults made parts 05-08 and
  `baseline_dataset.jsonl` unreachable.

## 3. Sandbox note (tooling)

The task brief's command `node v11/tools/run-tool.mjs <tool.ts>` fails in this
sandbox:

```
Error: spawn EPERM
  at optimizeSafeRealPathSync (vite/dist/node/chunks/dep-Dm0c1Wj2.js:6938)
```

Vite's `optimizeSafeRealPathSync()` calls `child_process.exec('net use')`, and the
sandbox denies process creation; the throw is synchronous, so Vite never gets to
its "errored callback" handling. Two working paths exist and **both were verified**:

1. **Repo-native (preferred).** The repo already ships
   `v11/tools/core-spawn-shim.cjs` for exactly this probe. Preloading it makes the
   stock loader work:

   ```
   node --require ./v11/tools/core-spawn-shim.cjs v11/tools/run-tool.mjs \
     tools/convert_archive_to_spatial.ts --inputs ... --output ... --max-samples 20
   ```

   Verified: ran the fixed converter for 20 samples, exit 0. The v11 loader was
   therefore **not** modified and is usable as-is with the shim.

2. **`v12/tools/spatial_run_tool.mjs`** — a clone of the v11 loader plus
   `resolve: { preserveSymlinks: true }`, which makes `getRealPath()` skip
   `safeRealpathSync()` entirely, so no shim is needed.
   `node_modules` here is a real directory (npm + `package-lock.json`; `Get-Item`
   reports an empty `LinkType`), so preserving symlinks changes nothing about which
   files load. This is the loader the T12-04 conversion below was actually run
   with. **`v11/tools/run-tool.mjs` was left byte-identical.**

## 3b. Regression self-check

`v12/tools/spatial_converter_selfcheck.ts` covers the episode-identity helpers, the
cheap-extraction path and its `JSON.parse` fallback, the "LAST non-null
`winnerAfter` wins" pass-1 rule, and the overwrite guard.
Run: `node v12/tools/spatial_run_tool.mjs v12/tools/spatial_converter_selfcheck.ts`
→ **24 passed, 0 failed**. It is deliberately not a vitest test:
`vitest.v11.config.mjs` has `include: ['tools/**/*.test.ts', 'src/**/*.test.ts']`,
which does not collect `v12/**`, and modifying the shared v11 vitest config was out
of scope. The two-pass value *broadcast* is not unit-tested there; it is verified
end-to-end on the real 48,714-sample dataset (section 4).

## 4. Verification of the fix

Run:

```
node v12/tools/spatial_run_tool.mjs tools/convert_archive_to_spatial.ts \
  --inputs training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl \
  --output training_runs/spatial_dataset/spatial_v2_full_pool.jsonl \
  --max-samples 0 --stats v12/out/spatial/T12-04_conversion_run.json
```

Raw tail:

```
[Pass 1 done] 48714 lines in 29.8s | 37 distinct episodes | 30 episodes with a terminal winner |
              cheap-path fallbacks 0 | parse failures 0 | missing episode key 0
[Conversion Complete] Successfully generated 48714 spatial samples!
valueTarget non-null: 35195 (72.248%) | null: 13519
distinct rootFamilyId: 37 | episodes with non-null value: 30
duplicate (scenario,seed,step) samples skipped: 0
Total Time: 137.05s (355.5 samples/s)
Output: training_runs/spatial_dataset/spatial_v2_full_pool.jsonl (1325414145 bytes)
```

| acceptance criterion | measured | pass |
|---|---|---|
| `rootFamilyId` present and non-empty in 100% of samples | 0 absent, 0 empty of 48,714; `rootFamilyIdNonEmptyPct: 100` | yes |
| `valueTarget` materially above 0.07% | **72.248%** (35,195 / 48,714) vs 0.067% before | yes |
| every non-null value explained by a terminated episode | independent re-derivation from the source pool: 0 disagreements, 0 non-null values on censored episodes | yes |
| censored episodes keep null | 7 censored episodes, 13,519 null samples, 0 null-on-terminated, 0 episodes mixing null/non-null | yes |
| train/val grouped split shares zero `rootFamilyId` | 37 roots → 33 train / 4 val, intersection 0, index-for-index identical to the real trainer (`v12/out/spatial/T12-04_split_check.json`) | yes |
| no pre-existing artifact modified | 0 removed, 0 size-changed across 171 tracked files in `v11/out`, `v10`, `training_runs/spatial_dataset`; 1 file added (the new dataset); all 3 pre-existing `spatial_*.jsonl` byte-size **and** mtime identical (`v12/out/spatial/T12-04_untouched_proof.json`) | yes |

## 5. Honest caveat: throughput

The file's header still advertises "4,000+ samples/s". The **measured** end-to-end
rate on this pool is **355.5 samples/s** (48,714 samples in 137.05 s), and pass 1
alone runs at ~1,635 lines/s. The 4,000+/s figure was not reproduced here and
should be treated as stale; it is not a regression introduced by this change, but
the claim is unverified. The docstring figure was intentionally left as-is rather
than silently edited, and this caveat is the record.
