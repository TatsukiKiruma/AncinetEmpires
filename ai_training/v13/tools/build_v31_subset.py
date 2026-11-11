#!/usr/bin/env python3
"""V13/T13-07 rerun: take the SAME pilot subset as B0, but from the v3.1 re-encoded pool.

The only intended difference from the first B0 run is the candidate ordering. Everything
else is held identical so the two runs are comparable:

    same 16 train roots, same 4 validation roots
    same per-root cap (160), same minLegal (8), same phase window
    same selection rule (rank by legal-action breadth within the phase slice)

Usage:
    py v13/tools/build_v31_subset.py --config v13/configs/b0_subset.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    args = ap.parse_args()
    cfg = json.loads((REPO_ROOT / args.config).read_text(encoding="utf-8"))

    src_dir = REPO_ROOT / f"{cfg['outDir']}_v31"
    pool_in = src_dir / "pool_v31.jsonl"
    out_dir = src_dir
    per_root_cap = int(cfg.get("perRootRowCap", 0))
    min_legal = int(cfg.get("minLegalActions", 0))
    phase_lo, phase_hi = float(cfg.get("phaseLo", 0.0)), float(cfg.get("phaseHi", 1.0))
    train_roots = list(cfg["trainRootFamilies"])
    val_roots = list(cfg["valRootFamilies"])

    # Pass 1: inventory by root, in file order.
    inventory: dict[str, list[tuple[int, int]]] = defaultdict(list)
    with pool_in.open("r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if not line.strip():
                continue
            row = json.loads(line)
            inventory[row["rootFamilyId"]].append((i, len(row["candidateActions"])))

    chosen: dict[str, list[int]] = {}
    for root, entries in inventory.items():
        n = len(entries)
        lo, hi = int(n * phase_lo), max(int(n * phase_lo) + 1, int(n * phase_hi))
        window = entries[lo:hi] or entries
        eligible = [(i, k) for i, k in window if k >= min_legal] or window
        ranked = sorted(eligible, key=lambda t: (-t[1], t[0]))
        keep = sorted(i for i, _ in ranked[:per_root_cap]) if per_root_cap else sorted(i for i, _ in ranked)
        chosen[root] = keep

    keep_all = {i for idxs in chosen.values() for i in idxs}
    root_of = {i: r for r, idxs in chosen.items() for i in idxs}
    print(f"[v31-subset] pool rows={sum(len(v) for v in inventory.values())} "
          f"selected={len(keep_all)} over {len(chosen)} roots")

    # Pass 2: emit.
    selected: list[dict] = []
    with pool_in.open("r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i in keep_all:
                selected.append(json.loads(line))

    per_root_total = Counter(r["rootFamilyId"] for r in selected)
    per_root_seen: Counter = Counter()
    for rec in selected:
        per_root_seen[rec["rootFamilyId"]] += 1
        rec["stepFraction"] = round(per_root_seen[rec["rootFamilyId"]] / per_root_total[rec["rootFamilyId"]], 6)

    tset, vset = set(train_roots), set(val_roots)
    if tset & vset:
        raise SystemExit("train and val roots overlap")

    pool_out = out_dir / "pool_v31_subset.jsonl"
    n_train = n_val = 0
    target_at_old_index0 = 0
    with pool_out.open("w", encoding="utf-8") as pf:
        for rec in selected:
            pf.write(json.dumps(rec, separators=(",", ":")) + "\n")
            if rec["targetIndexInOldOrdering"] == 0:
                target_at_old_index0 += 1
            if rec["rootFamilyId"] in tset:
                n_train += 1
            elif rec["rootFamilyId"] in vset:
                n_val += 1

    if n_train == 0 or n_val == 0:
        raise SystemExit(f"empty partition: train={n_train} val={n_val}")

    (out_dir / "split_manifest.json").write_text(json.dumps({
        "schema": "v13_split_manifest_1",
        "createdBy": "v13/tools/build_v31_subset.py",
        "trainRootFamilies": sorted(tset),
        "valRootFamilies": sorted(vset),
        "testRootFamilies": [],
    }, indent=2) + "\n", encoding="utf-8")

    manifest = {
        "schema": "v13_dataset_subset_manifest_1",
        "variant": "v3.1 - candidates in engine legal order",
        "config": cfg,
        "rows": {"train": n_train, "val": n_val, "total": n_train + n_val},
        "roots": {"train": sorted(tset), "val": sorted(vset)},
        "files": {
            "pool": {"path": str(pool_out.relative_to(REPO_ROOT)), "sha256": sha256_file(pool_out)},
            "split": {"path": str((out_dir / "split_manifest.json").relative_to(REPO_ROOT)),
                      "sha256": sha256_file(out_dir / "split_manifest.json")},
        },
        "orderingDelta": {
            "rowsWhereTeacherWasAtOldIndex0": target_at_old_index0,
            "fraction": round(target_at_old_index0 / max(1, len(selected)), 6),
            "note": "in v3.1 the target index is the position in the ENGINE LEGAL order, which "
                    "is also the order inference uses",
        },
        "comparability": {
            "vs": "v13/out/v13_20260924_t13/T13-07/data_v3_b0 (first B0 run)",
            "heldIdentical": ["train/val roots", "per-root cap", "minLegalActions", "phase window",
                              "selection rule", "row count target"],
            "changedDeliberately": ["candidate ordering", "state/tensor provenance (re-encoded by "
                                    "the TypeScript encoder instead of copied from the pool)"],
        },
    }
    (out_dir / "dataset_v31_subset_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"[v31-subset] train={n_train} val={n_val}  teacherAtOldIndex0={target_at_old_index0}"
          f"/{len(selected)} = {target_at_old_index0 / max(1, len(selected)):.4f}")
    print(f"[v31-subset] pool sha256={manifest['files']['pool']['sha256'][:16]}")
    print(f"[v31-subset] wrote {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
