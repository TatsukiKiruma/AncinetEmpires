"""Diagnostic: how much of the 30k spatial dataset is actually distinct state?

If consecutive decision states inside one episode repeat (e.g. the same board
encoded repeatedly, or padding), the effective dataset is smaller than the row
count. Also reports the candidate-list width distribution, because a state with
a single candidate carries no policy information.

Usage: py -3.12 v12/tools/diag_distinct_states.py [dataset.jsonl]
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset", nargs="?", default="training_runs/spatial_dataset/spatial_train_scaled_30k.jsonl")
    args = ap.parse_args()

    n = 0
    state_hashes: Counter[str] = Counter()
    full_hashes: Counter[str] = Counter()
    cand_counts: Counter[int] = Counter()
    tensor_lens: Counter[int] = Counter()
    global_lens: Counter[int] = Counter()
    label_index_zero = 0

    with open(args.dataset, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            n += 1
            o = json.loads(line)
            t = o.get("spatialTensor") or []
            g = o.get("globalFeatures") or []
            cands = o.get("candidateActions") or []

            tensor_lens[len(t)] += 1
            global_lens[len(g)] += 1
            cand_counts[len(cands)] += 1
            if o.get("targetActionIndex") == 0:
                label_index_zero += 1

            state_hashes[hashlib.sha1(json.dumps(t, separators=(",", ":")).encode()).hexdigest()] += 1
            full_hashes[hashlib.sha1(line.encode()).hexdigest()] += 1

    print(f"dataset                : {args.dataset}")
    print(f"rows                   : {n}")
    print()
    print(f"distinct spatialTensor : {len(state_hashes)}  "
          f"(row/state ratio = {n / max(1, len(state_hashes)):.2f})")
    dup_states = sum(c - 1 for c in state_hashes.values() if c > 1)
    print(f"rows sharing a tensor with another row: {dup_states} ({100.0 * dup_states / n:.1f}%)")
    print(f"max multiplicity of one tensor        : {max(state_hashes.values())}")
    print()
    print(f"distinct full rows     : {len(full_hashes)}")
    print()
    print(f"spatialTensor length   : {dict(tensor_lens)}")
    print(f"globalFeatures length  : {dict(global_lens)}")
    print(f"targetActionIndex == 0 : {label_index_zero} ({100.0 * label_index_zero / n:.1f}%)")
    print()
    print("candidateActions width distribution (width -> rows):")
    for k in sorted(cand_counts):
        print(f"  {k:>3} -> {cand_counts[k]}")
    single = cand_counts.get(1, 0)
    print()
    print(f"rows with a single candidate (no policy signal): {single} ({100.0 * single / n:.1f}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
