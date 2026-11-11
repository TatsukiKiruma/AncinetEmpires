"""F09 evidence: prove the current spatial dataset leaks episodes across train/val.

Read-only audit. Replicates the fallback grouping in
python/train_spatial_resnet.py:476-499 (`ep_{idx // 60}`) and measures how much
real episode identity crosses the train/val boundary.

Usage: py -3.12 v12/tools/audit_split_leakage.py [dataset.jsonl] [--val-split 0.1] [--seed 42]
"""
from __future__ import annotations

import argparse
import json
import random
import re
from collections import Counter, defaultdict

SAMPLE_ID = re.compile(r"^s_(\d+)_(\d+)_(\d+)$")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset", nargs="?", default="training_runs/spatial_dataset/spatial_train_scaled_30k.jsonl")
    ap.add_argument("--val-split", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    samples: list[dict] = []
    with open(args.dataset, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                samples.append(json.loads(line))
    n = len(samples)
    print(f"dataset            : {args.dataset}")
    print(f"samples            : {n}")

    # --- field presence (the F09 claim) --------------------------------------
    has_root = sum(1 for s in samples if s.get("rootFamilyId"))
    has_ep = sum(1 for s in samples if s.get("episodeId"))
    has_val = sum(1 for s in samples if s.get("valueTarget") is not None)
    print(f"with rootFamilyId  : {has_root}/{n}")
    print(f"with episodeId     : {has_ep}/{n}")
    print(f"non-null valueTarget: {has_val}/{n}  ({100.0 * has_val / n:.3f}%)")

    # --- recover real episode identity from sampleId -------------------------
    # sampleId format written by tools/convert_archive_to_spatial.ts: s_<totalSaved>_<episodeIndex>_<step>
    real_ep: list[str] = []
    unparsed = 0
    for s in samples:
        m = SAMPLE_ID.match(str(s.get("sampleId", "")))
        if m:
            real_ep.append(f"ep{m.group(2)}")
        else:
            real_ep.append(f"__unparsed_{len(real_ep)}")
            unparsed += 1
    print(f"sampleId unparsed  : {unparsed}/{n}")
    print(f"distinct episodeIndex values (lower bound on real episodes): {len(set(real_ep))}")

    ep_counts = Counter(real_ep)
    print(f"episodeIndex counts: top5={ep_counts.most_common(5)} "
          f"singletons={sum(1 for v in ep_counts.values() if v == 1)}")
    step_max = 0
    for s in samples:
        m = SAMPLE_ID.match(str(s.get("sampleId", "")))
        if m:
            step_max = max(step_max, int(m.group(3)))
    print(f"max step observed  : {step_max}")

    # --- what the trainer actually does --------------------------------------
    groups: dict[str, list[int]] = defaultdict(list)
    for idx in range(n):
        key = f"ep_{idx // 60}"  # exact fallback from train_spatial_resnet.py:480
        groups[key].append(idx)
    print(f"trainer groups     : {len(groups)} (all synthetic, size "
          f"{sorted({len(v) for v in groups.values()})})")

    # how many REAL episodes does one synthetic group mix?
    mixed = [len({real_ep[i] for i in idxs}) for idxs in groups.values()]
    print(f"real episodes mixed per synthetic group: min={min(mixed)} max={max(mixed)} "
          f"mean={sum(mixed) / len(mixed):.2f}")

    # --- simulate the split and measure cross-boundary episodes --------------
    keys = sorted(groups.keys())
    rng = random.Random(args.seed)
    rng.shuffle(keys)
    target = max(1, int(n * args.val_split))
    val_idx: list[int] = []
    train_idx: list[int] = []
    for k in keys:
        if len(val_idx) < target:
            val_idx.extend(groups[k])
        else:
            train_idx.extend(groups[k])

    train_eps = {real_ep[i] for i in train_idx}
    val_eps = {real_ep[i] for i in val_idx}
    shared = train_eps & val_eps
    print()
    print(f"split (seed={args.seed}, val_split={args.val_split}): "
          f"train={len(train_idx)} rows / val={len(val_idx)} rows")
    print(f"distinct real episodes: train={len(train_eps)} val={len(val_eps)}")
    print(f"LEAKED episodes present in BOTH train and val: {len(shared)}")
    if val_eps:
        print(f"leak rate = {100.0 * len(shared) / len(val_eps):.1f}% of val episodes are also in train")

    val_rows_leaked = sum(1 for i in val_idx if real_ep[i] in train_eps)
    if val_idx:
        print(f"val ROWS whose episode also appears in train: {val_rows_leaked}/{len(val_idx)} "
              f"({100.0 * val_rows_leaked / len(val_idx):.1f}%)")

    print()
    print("interpretation: with no rootFamilyId/episodeId the trainer cannot group by real")
    print("episode, so the reported val metrics measure memorisation of the same games.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
