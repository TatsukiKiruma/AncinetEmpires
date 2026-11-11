#!/usr/bin/env python
"""
T12-04 grouped-split leak check + episode-level diversity headline.

Runs the grouped-split block of `python/train_spatial_resnet.py` (lines 477-499,
defaults --seed 42 / --val-split 0.1), transcribed VERBATIM, against the produced
v2 dataset, and reports at the level of EPISODES (not rows).

Three independent things are established:

  1. Train and validation share ZERO `rootFamilyId` values.
  2. The same code path with the legacy key `f"ep_{idx // 60}"` (what the trainer
     falls back to when `rootFamilyId`/`episodeId` are absent, i.e. the old 30k
     file) tears real episodes across the two partitions - measured, not asserted.
  3. If the real trainer's `--planned-manifest` output is present, the split
     computed here is compared INDEX FOR INDEX against what
     `python/train_spatial_resnet.py` actually produced.

Usage: py -3.12 v12/tools/spatial_split_check.py [datasetPath] [plannedManifestPath]
"""
import json
import os
import random
import sys
from collections import OrderedDict
from datetime import datetime, timezone

ROOT = os.getcwd()
DATASET = sys.argv[1] if len(sys.argv) > 1 else "training_runs/spatial_dataset/spatial_v2_full_pool.jsonl"
MANIFEST = sys.argv[2] if len(sys.argv) > 2 else "v12/out/spatial/T12-04_planned_manifest.json"
SEED = 42           # python/train_spatial_resnet.py:418 default
VAL_SPLIT = 0.1     # python/train_spatial_resnet.py:407 default


def load_roots_and_ids(path):
    """Mirror SpatialDataset: read every non-empty line, take rootFamilyId/episodeId."""
    roots, ids = [], []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            s = json.loads(line)
            roots.append(s.get("rootFamilyId") or s.get("episodeId") or None)
            ids.append(s.get("sampleId"))
    return roots, ids


def grouped_split(ep_ids, total_len, seed, val_split):
    """VERBATIM transcription of python/train_spatial_resnet.py lines 477-499."""
    episode_groups = {}
    for idx, ep_id in enumerate(ep_ids):
        if ep_id not in episode_groups:
            episode_groups[ep_id] = []
        episode_groups[ep_id].append(idx)

    group_keys = sorted(list(episode_groups.keys()))
    rng = random.Random(seed)
    rng.shuffle(group_keys)

    val_target_count = max(1, int(total_len * val_split))
    cur_val_count = 0
    train_indices = []
    val_indices = []

    for k in group_keys:
        idxs = episode_groups[k]
        if cur_val_count < val_target_count:
            val_indices.extend(idxs)
            cur_val_count += len(idxs)
        else:
            train_indices.extend(idxs)

    return train_indices, val_indices, group_keys, episode_groups


def main():
    abspath = os.path.join(ROOT, DATASET)
    roots, sample_ids = load_roots_and_ids(abspath)
    total_len = len(roots)
    real_ids = [r if (r is not None and r != "") else None for r in roots]
    n_missing = sum(1 for r in real_ids if r is None)

    # ---------- run 1: the REAL grouping key (what the fixed dataset provides) ----------
    train_idx, val_idx, group_keys, groups = grouped_split(real_ids, total_len, SEED, VAL_SPLIT)
    train_roots = {real_ids[i] for i in train_idx}
    val_roots = {real_ids[i] for i in val_idx}
    overlap = train_roots & val_roots

    runs = 0
    prev = object()
    for r in real_ids:
        if r != prev:
            runs += 1
            prev = r

    per_episode_sizes = sorted(len(v) for v in groups.values())

    # ---------- run 2: legacy synthetic key f"ep_{idx // 60}" over the SAME order ----------
    legacy_ids = [f"ep_{idx // 60}" for idx in range(total_len)]
    l_train, l_val, _, _ = grouped_split(legacy_ids, total_len, SEED, VAL_SPLIT)
    l_train_real = {real_ids[i] for i in l_train}
    l_val_real = {real_ids[i] for i in l_val}
    legacy_overlap_roots = l_train_real & l_val_real
    leaked_samples = sum(1 for i in range(total_len) if real_ids[i] in legacy_overlap_roots)

    # ---------- run 3: compare index-for-index with the REAL trainer, if available ----------
    trainer_check = {"available": False}
    mpath = os.path.join(ROOT, MANIFEST)
    if os.path.exists(mpath):
        with open(mpath, "r", encoding="utf-8") as f:
            man = json.load(f)
        t_ids = man.get("train_sample_ids") or []
        v_ids = man.get("val_sample_ids") or []
        # sampleId format is `s_<emissionIndex>_<episodeIndex>_<step>`, so the index is recoverable
        def idx_of(sid):
            return int(str(sid).split("_")[1])
        t_idx = {idx_of(s) for s in t_ids}
        v_idx = {idx_of(s) for s in v_ids}
        my_t, my_v = set(train_idx), set(val_idx)
        trainer_check = OrderedDict([
            ("available", True),
            ("manifest", MANIFEST),
            ("trainerTrainRows", len(t_idx)),
            ("trainerValRows", len(v_idx)),
            ("replicatedTrainRows", len(my_t)),
            ("replicatedValRows", len(my_v)),
            ("trainSymmetricDifference", len(my_t ^ t_idx)),
            ("valSymmetricDifference", len(my_v ^ v_idx)),
            ("exactIndexForIndexMatch", (my_t == t_idx) and (my_v == v_idx)),
            ("sampleIdOrderMatchesFileOrder", all(
                sample_ids[idx_of(s)] == s
                for s in (t_ids[:200] + v_ids[:200])
                if idx_of(s) < total_len
            )),
        ])

    headline = OrderedDict([
        ("rowsAreNotTrajectories", "one episode contributes 200-3000 decision rows; episode counts are the meaningful diversity measure"),
        ("distinctEpisodes", len(groups)),
        ("distinctTrainEpisodes", len(train_roots)),
        ("distinctValEpisodes", len(val_roots)),
        ("episodeIntersectionSize", len(overlap)),
        ("trainRows", len(train_idx)),
        ("valRows", len(val_idx)),
        ("valRowsFraction", round(len(val_idx) / total_len, 4)),
        ("episodesCensoredVsTerminatedReportedIn", "v12/out/spatial/T12-04_dataset_report.json"),
    ])

    result = OrderedDict()
    result["headline"] = headline
    result["generatedAtUtc"] = datetime.now(timezone.utc).isoformat()
    result["dataset"] = DATASET
    result["replicatedCode"] = "python/train_spatial_resnet.py lines 477-499 (grouped split), defaults --seed 42 --val-split 0.1"
    result["totalSamples"] = total_len
    result["samplesMissingRootFamilyIdAndEpisodeId"] = n_missing
    result["realSplit"] = OrderedDict([
        ("groupingKey", "rootFamilyId (fallback episodeId, then f'ep_{idx//60}')"),
        ("distinctGroupKeys", len(group_keys)),
        ("trainSamples", len(train_idx)),
        ("valSamples", len(val_idx)),
        ("trainRoots", len(train_roots)),
        ("valRoots", len(val_roots)),
        ("trainValRootOverlapCount", len(overlap)),
        ("trainValRootOverlap", sorted(overlap)[:20]),
        ("trainValIndexOverlap", len(set(train_idx) & set(val_idx))),
        ("trainValSampleSumEqualsTotal", (len(train_idx) + len(val_idx)) == total_len),
        ("valFractionOfSamples", round(len(val_idx) / total_len, 4)),
        ("valFractionOfEpisodes", round(len(val_roots) / len(groups), 4)),
        ("distinctRealEpisodes", len(groups)),
        ("episodeIndexRuns", runs),
        ("episodeIsIndexContiguous", runs == len(groups)),
        ("episodeSizeSamplesMin", per_episode_sizes[0]),
        ("episodeSizeSamplesMedian", per_episode_sizes[len(per_episode_sizes) // 2]),
        ("episodeSizeSamplesMax", per_episode_sizes[-1]),
    ])
    result["legacyGroupingSimulation"] = OrderedDict([
        ("groupingKey", "f'ep_{idx // 60}' (what the trainer falls back to when episodeId/rootFamilyId are absent)"),
        ("legacyGroupCount", total_len // 60),
        ("trainRoots", len(l_train_real)),
        ("valRoots", len(l_val_real)),
        ("trainValRealRootOverlapCount", len(legacy_overlap_roots)),
        ("samplesInsideLeakedEpisodes", leaked_samples),
        ("leakedSamplePct", round(100.0 * leaked_samples / total_len, 3)),
    ])
    result["realTrainerCrossCheck"] = trainer_check
    result["passed"] = (
        len(overlap) == 0
        and result["realSplit"]["trainValSampleSumEqualsTotal"]
        and (trainer_check.get("exactIndexForIndexMatch", True) is True)
    )

    out = os.path.join(ROOT, "v12/out/spatial/T12-04_split_check.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(json.dumps(result, indent=2))
    print("\nwrote " + out)


if __name__ == "__main__":
    main()
