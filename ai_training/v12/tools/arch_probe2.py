"""Targeted probe: where do the fields Section A needs live inside an episode
line, and what is the real per-line parse cost of the two big datasets?

Prints raw text windows (not parsed trees) so regex extractors can be written
against the actual on-disk serialization.

Usage: py -3.12 v12/tools/arch_probe2.py
"""
from __future__ import annotations

import json
import os
import re
import time

EP_DIR = "training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced"
SPATIAL = "training_runs/spatial_dataset/spatial_v2_full_pool.jsonl"
BASELINE = "training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl"


def locate(line: str, key: str, window: int = 260) -> str:
    i = line.find(f'"{key}":')
    if i < 0:
        return f"    {key}: NOT FOUND"
    return f"    {key} @ {i:,}  ->  {line[i:i + window]}"


def main() -> int:
    # ---- episode line -------------------------------------------------
    f0 = sorted(f for f in os.listdir(EP_DIR) if f.endswith(".jsonl"))[0]
    with open(os.path.join(EP_DIR, f0), "r", encoding="utf-8", errors="replace") as fh:
        line = fh.readline()
    print(f"EPISODE {f0}  bytes={len(line):,}")
    for k in ("players", "policyByPlayer", "scenario", "seed", "summary", "winnerAlliance",
              "adjudicatedWinnerAlliance", "steps", "terminal"):
        print(locate(line, k))
    print(f"    'summary' position as fraction: {line.find('\"summary\":') / len(line):.4f}")
    print()

    # ---- spatial line -------------------------------------------------
    with open(SPATIAL, "r", encoding="utf-8", errors="replace") as fh:
        sline = fh.readline()
    print(f"SPATIAL first line bytes={len(sline):,}")
    for k in ("valueTarget", "rootFamilyId", "playerId", "step", "turn", "episodeId", "sampleId"):
        print(locate(sline, k, 120))
    for k in ("valueTarget", "playerId", "rootFamilyId"):
        print(f"    occurrences of \"{k}\" in line: {sline.count(chr(34) + k + chr(34))}")
    print()

    # ---- baseline line ------------------------------------------------
    with open(BASELINE, "r", encoding="utf-8", errors="replace") as fh:
        bline = fh.readline()
    print(f"BASELINE first line bytes={len(bline):,}")
    for k in ("label", "policy", "outcome", "legalActionCodes", "playerId", "step",
              "turn", "scenario", "seed", "source", "observation"):
        print(locate(bline, k, 200))
    for k in ("actionCode", "policy", "playerId", "winnerAfter", "legalActionCodes"):
        print(f"    occurrences of \"{k}\" in line: {bline.count(chr(34) + k + chr(34))}")

    # ---- parse cost ---------------------------------------------------
    print()
    for name, path, n in (("SPATIAL", SPATIAL, 2000), ("BASELINE", BASELINE, 300)):
        t0 = time.time()
        ok = bad = 0
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            for i, ln in enumerate(fh):
                if i >= n:
                    break
                try:
                    json.loads(ln)
                    ok += 1
                except Exception:  # noqa: BLE001
                    bad += 1
        dt = time.time() - t0
        print(f"full json.loads {name}: {n} lines in {dt:.2f}s -> {n / dt:,.0f} lines/s "
              f"(ok={ok} bad={bad})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
