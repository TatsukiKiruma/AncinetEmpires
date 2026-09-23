"""Schema probe for the three archives this task re-evaluates.

Prints, for the first parseable record of each source, the top-level key set and
the shape of the fields the analysis depends on. Records are huge (some embed
full multi-MB observations), so this only ever parses ONE record per file and
never builds a full document tree.

Usage: py -3.12 v12/tools/arch_probe.py
"""
from __future__ import annotations

import json
import os

EP_DIR = "training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced"
SPATIAL = "training_runs/spatial_dataset/spatial_v2_full_pool.jsonl"
BASELINE = "training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl"


def first_record(path: str, max_bytes: int = 64 * 1024 * 1024):
    """Read the first non-empty line as JSON, capped at max_bytes."""
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        line = fh.readline(max_bytes)
    if not line.strip():
        return None, 0
    try:
        return json.loads(line), len(line)
    except Exception as exc:  # noqa: BLE001
        return {"__parse_error__": repr(exc)[:200]}, len(line)


def describe(name: str, rec) -> None:
    print(f"=== {name} ===")
    if rec is None:
        print("  <empty>")
        return
    if "__parse_error__" in rec:
        print(f"  PARSE ERROR: {rec['__parse_error__']}")
        return
    print(f"  top-level keys ({len(rec)}): {sorted(rec.keys())}")
    for k in sorted(rec.keys()):
        v = rec[k]
        t = type(v).__name__
        if isinstance(v, dict):
            print(f"    {k:<24} dict[{len(v)}] keys={sorted(v.keys())[:12]}")
        elif isinstance(v, list):
            head = v[0] if v else None
            if isinstance(head, dict):
                print(f"    {k:<24} list[{len(v)}] item0keys={sorted(head.keys())[:16]}")
            else:
                print(f"    {k:<24} list[{len(v)}] head={repr(head)[:120]}")
        else:
            print(f"    {k:<24} {t:<8} = {repr(v)[:160]}")
    print()


def main() -> int:
    files = sorted(f for f in os.listdir(EP_DIR) if f.endswith(".jsonl"))
    rec, n = first_record(os.path.join(EP_DIR, files[0]))
    print(f"episode file probed: {files[0]}  first-line bytes={n:,}")
    describe("EPISODE RECORD (head keys only; tail holds summary)", rec)

    rec, n = first_record(SPATIAL)
    print(f"spatial first-line bytes={n:,}")
    describe("SPATIAL_V2_FULL_POOL", rec)

    rec, n = first_record(BASELINE)
    print(f"baseline first-line bytes={n:,}")
    describe("BASELINE_DATASET", rec)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
