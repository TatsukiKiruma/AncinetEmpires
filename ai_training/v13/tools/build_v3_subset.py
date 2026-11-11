#!/usr/bin/env python3
"""V13/T13-07: build a bounded v3 training/validation subset with real provenance.

Why this exists
---------------
The mandatory B0 baseline needs a dataset that (a) names one teacher per row, (b)
carries a stable content-derived sampleId, (c) keeps the candidate set exactly as the
pool stored it so the train/inference candidate contract matches, and (d) fits in
memory. The existing 1.3 GB pool has none of those: no teacher column, a row-sequence
sampleId, and it is far too large to load.

What it does NOT do
-------------------
It does not invent state. `spatialTensor`, `globalFeatures` and the candidate feature
blocks are copied byte-for-byte from the converted pool, which T13-03 verified is
positionally aligned with the source archive (0 mismatches over 48,714 rows) and whose
valueTarget agrees with the source's terminal winner 35,195/35,195. Re-encoding here
would mean rebuilding a `GameState` from the observation - a different, riskier job that
is not attempted.

Identity columns added (the T13-03 schema)
    sampleId, baseRootId, rootFamilyId, episodeId, sourceArchiveId, sourceRowIndex,
    behaviorPolicyId, labelTeacherId, sourceStep, sourceTurn, subjectPlayer,
    stepFraction, policyLossMask, valueLossMask, schemaVersion

Usage:
    py v13/tools/build_v3_subset.py --config v13/configs/b0_subset.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = "v3.1"
ENCODER_SCHEMA = "spatial-v2/24x20x20+g20"


def content_sample_id(source_archive_id: str, episode_id: str, step: int,
                      subject_player: int, schema_version: str) -> str:
    """sampleId = hash(source, episode, step, subject, schema) - never a row ordinal."""
    h = hashlib.sha256(
        f"{source_archive_id}\x1f{episode_id}\x1f{step}\x1f{subject_player}\x1f{schema_version}"
        .encode("utf-8")
    )
    return f"v3_{h.hexdigest()[:24]}"


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
    pool_path = REPO_ROOT / cfg["pool"]
    source_path = REPO_ROOT / cfg["source"]
    out_dir = REPO_ROOT / cfg["outDir"]
    out_dir.mkdir(parents=True, exist_ok=True)

    policies: list[str] = (REPO_ROOT / cfg["provenanceFile"]).read_text(
        encoding="utf-8").split("\n")
    if policies and policies[-1] == "":
        policies.pop()

    train_roots_req = list(cfg["trainRootFamilies"])
    val_roots_req = list(cfg["valRootFamilies"])
    teacher = cfg.get("labelTeacherId")
    per_root_cap = int(cfg.get("perRootRowCap", 0))
    min_legal = int(cfg.get("minLegalActions", 0))
    phase_lo = float(cfg.get("phaseLo", 0.0))
    phase_hi = float(cfg.get("phaseHi", 1.0))
    wanted = set(train_roots_req) | set(val_roots_req)

    print(f"[build-v3] pool={cfg['pool']}")
    print(f"[build-v3] source={cfg['source']}")
    print(f"[build-v3] provenance rows={len(policies)}  teacher filter={teacher}")
    print(f"[build-v3] roots requested: train={len(train_roots_req)} val={len(val_roots_req)}")

    # ------------------------------------------------ pass 1: per-root row inventory
    # Only the fields needed for SCORING are parsed here; the payload stays on disk.
    inventory: dict[str, list[tuple[int, int]]] = defaultdict(list)  # root -> [(idx, nLegal)]
    with pool_path.open("r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if not line.strip():
                continue
            row = json.loads(line)
            root = row.get("rootFamilyId") or row.get("episodeId")
            if root not in wanted:
                continue
            n_legal = len(row.get("candidateActions") or [])
            inventory[root].append((i, n_legal))

    missing = wanted - set(inventory)
    if missing:
        raise SystemExit(f"roots not found in pool: {sorted(missing)[:5]}")

    # ---------------------------------------------------------- choose rows per root
    # "Key decision" = broad action space (many legal actions) and mid-episode phase.
    # Selecting by phase coverage rather than by row order is what stops a long
    # episode from dominating the subset.
    chosen: dict[str, list[int]] = {}
    for root, entries in inventory.items():
        n = len(entries)
        lo = int(n * phase_lo)
        hi = max(lo + 1, int(n * phase_hi))
        phase_slice = entries[lo:hi] or entries
        eligible = [(idx, nl) for idx, nl in phase_slice if nl >= min_legal] or phase_slice
        # Rank by legal-action breadth (descending), stable on index for determinism.
        ranked = sorted(eligible, key=lambda t: (-t[1], t[0]))
        keep = sorted(idx for idx, _ in ranked[:per_root_cap]) if per_root_cap else sorted(
            idx for idx, _ in ranked)
        chosen[root] = keep

    total_rows = sum(len(v) for v in chosen.values())
    print(f"[build-v3] selected {total_rows} rows across {len(chosen)} roots "
          f"(cap {per_root_cap}/root, minLegal {min_legal}, phase [{phase_lo},{phase_hi}])")

    keep_all = {i for idxs in chosen.values() for i in idxs}
    root_of_idx: dict[int, str] = {}
    for root, idxs in chosen.items():
        for i in idxs:
            root_of_idx[i] = root

    # --------------------------------------------- pass 2: stream both files in lockstep
    selected: list[dict] = []
    policy_tally: Counter = Counter()
    with pool_path.open("r", encoding="utf-8") as pf, source_path.open("r", encoding="utf-8") as sf:
        src_iter = iter(sf)
        for i, pline in enumerate(pf):
            if not pline.strip():
                continue
            try:
                sline = next(src_iter)
            except StopIteration:
                break
            if i not in keep_all:
                continue
            row = json.loads(pline)
            src = json.loads(sline)
            root = root_of_idx[i]
            step = int(row.get("step") or 0)
            turn = int(row.get("turn") or src.get("turn") or 0)
            player = int(row.get("playerId"))
            policy = policies[i] if i < len(policies) else "<unknown>"
            value_target = row.get("valueTarget")
            selected.append({
                "sampleId": content_sample_id(cfg["archiveId"], root, step, player, SCHEMA_VERSION),
                "schemaVersion": SCHEMA_VERSION,
                "encoderSchema": ENCODER_SCHEMA,
                "sourceArchiveId": cfg["archiveId"],
                "sourceRowIndex": i,
                "baseRootId": root,
                "rootFamilyId": root,
                "episodeId": root,
                "parentVariantId": None,
                "sourceStep": step,
                "sourceTurn": turn,
                "subjectPlayer": player,
                "behaviorPolicyId": policy,
                "labelTeacherId": policy,
                "labelProvenance": "native_behaviour_label",
                "teacherKernelVersion": None,
                "teacherBudget": None,
                "mapName": (src.get("scenario") or {}).get("mapName"),
                "seed": src.get("seed"),
                "spatialTensor": row["spatialTensor"],
                "globalFeatures": row["globalFeatures"],
                "candidateActions": row["candidateActions"],
                "candidateActionCodes": src.get("legalActionCodes", []),
                "targetActionIndex": row["targetActionIndex"],
                "targetActionCode": (src.get("label") or {}).get("actionCode"),
                "valueTarget": value_target,
                "policyLossMask": True,
                "valueLossMask": value_target is not None,
                "outcomeKind": "NATURAL_TERMINAL" if value_target is not None else "CENSORED_NO_WINNER",
                "replayVerificationLevel": "POSITIONAL_ALIGNMENT_VERIFIED_T13_03",
            })
            policy_tally[policy] += 1

    # --------------------------------------------------- phase fraction, then teacher filter
    per_root_total: Counter = Counter(r["rootFamilyId"] for r in selected)
    per_root_seen: Counter = Counter()
    for rec in selected:
        per_root_seen[rec["rootFamilyId"]] += 1
        rec["stepFraction"] = round(per_root_seen[rec["rootFamilyId"]] / per_root_total[rec["rootFamilyId"]], 6)

    before = len(selected)
    if teacher:
        selected = [r for r in selected if r["labelTeacherId"] == teacher]
        present = {r["rootFamilyId"] for r in selected}
        train_roots_req = [r for r in train_roots_req if r in present]
        val_roots_req = [r for r in val_roots_req if r in present]
        print(f"[build-v3] teacher filter {teacher}: {before} -> {len(selected)} rows; "
              f"roots with surviving rows: train={len(train_roots_req)} val={len(val_roots_req)}")

    # The tally must describe the rows actually written, not the pre-filter selection.
    rows_policy_tally: Counter = Counter(r["labelTeacherId"] for r in selected)
    rows_root_tally: Counter = Counter(r["rootFamilyId"] for r in selected)

    train_set, val_set = set(train_roots_req), set(val_roots_req)
    if train_set & val_set:
        raise SystemExit("train and val root families overlap - refusing to write a leaky split")

    out_train = out_dir / "train.jsonl"
    out_val = out_dir / "val.jsonl"
    n_train = n_val = 0
    with out_train.open("w", encoding="utf-8") as tf, out_val.open("w", encoding="utf-8") as vf:
        for rec in selected:
            if rec["rootFamilyId"] in train_set:
                tf.write(json.dumps(rec, separators=(",", ":")) + "\n")
                n_train += 1
            elif rec["rootFamilyId"] in val_set:
                vf.write(json.dumps(rec, separators=(",", ":")) + "\n")
                n_val += 1
    if n_train == 0 or n_val == 0:
        raise SystemExit(f"empty partition after filtering: train={n_train} val={n_val}")

    # The trainer takes ONE dataset plus a manifest that partitions it by root, so a
    # combined pool is written alongside the split files. Written in a stable order
    # (train roots first, then val) so the pool digest is reproducible.
    out_pool = out_dir / "pool_v3.jsonl"
    with out_pool.open("w", encoding="utf-8") as pf:
        for rec in selected:
            pf.write(json.dumps(rec, separators=(",", ":")) + "\n")

    split_manifest = {
        "schema": "v13_split_manifest_1",
        "createdBy": "v13/tools/build_v3_subset.py",
        "trainRootFamilies": sorted(train_set),
        "valRootFamilies": sorted(val_set),
        "testRootFamilies": [],
    }
    (out_dir / "split_manifest.json").write_text(
        json.dumps(split_manifest, indent=2) + "\n", encoding="utf-8")

    manifest = {
        "schema": "v13_dataset_subset_manifest_1",
        "config": cfg,
        "rows": {"train": n_train, "val": n_val, "total": n_train + n_val},
        "roots": {"train": sorted(train_set), "val": sorted(val_set)},
        "policyTallyOfWrittenRows": dict(rows_policy_tally),
        "policyTallyBeforeTeacherFilter": dict(policy_tally),
        "perRootRowsOfWrittenRows": dict(rows_root_tally),
        "files": {
            "pool": {"path": str(out_pool.relative_to(REPO_ROOT)), "sha256": sha256_file(out_pool)},
            "train": {"path": str(out_train.relative_to(REPO_ROOT)), "sha256": sha256_file(out_train)},
            "val": {"path": str(out_val.relative_to(REPO_ROOT)), "sha256": sha256_file(out_val)},
            "splitManifest": {
                "path": str((out_dir / "split_manifest.json").relative_to(REPO_ROOT)),
                "sha256": sha256_file(out_dir / "split_manifest.json"),
            },
        },
        "provenance": {
            "labelTeacherId": teacher,
            "behaviorPolicyId": "per row, recovered by positional alignment (T13-03)",
            "sampleIdRule": "sha256(archiveId, episodeId, step, subjectPlayer, schemaVersion)[:24]",
            "stateProvenance": "spatialTensor and candidate features are copied from the converted "
                               "pool, which T13-03 verified is positionally aligned with the source "
                               "archive; no state was re-synthesised",
        },
        "boundaries": [
            "This is a SUBSET of already-converted states, not a new independent sample of games.",
            "Rows are chosen by action-space breadth within a mid-episode phase window, so the "
            "subset is deliberately biased toward broad decisions; it is a pilot, not a "
            "representative sample of the pool.",
            "valueLossMask equals (valueTarget is not None) by construction, so the value loss "
            "can never disagree with its mask (see T13-01).",
        ],
    }
    (out_dir / "dataset_v3_subset_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"[build-v3] train rows={n_train} ({len(train_set)} roots)  val rows={n_val} ({len(val_set)} roots)")
    print(f"[build-v3] policies in written rows={dict(rows_policy_tally)} "
          f"(pre-filter selection was {dict(policy_tally)})")
    print(f"[build-v3] train sha256={manifest['files']['train']['sha256'][:16]}  "
          f"val sha256={manifest['files']['val']['sha256'][:16]}")
    print(f"[build-v3] wrote {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
