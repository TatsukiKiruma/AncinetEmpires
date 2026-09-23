"""Is the SD training archive seat-asymmetric? If a seat essentially never wins,
the model cannot learn to win from it, and any evaluation that places the model
only in that seat measures the seat, not the model.

Reads `summary.winnerAlliance` + `summary.finalArmyValueByAlliance` from the tail
of every record in the archive (no full JSON parse of multi-MB records).

Usage: py -3.12 v12/tools/diag_seat_asymmetry.py
"""
from __future__ import annotations

import collections
import glob
import json
import os
import re

DIR = "training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced"
SCEN = re.compile(r'"id":"(SDPLAN:[^"]+)"')
WINNER = re.compile(r'"winnerAlliance":(\d+)')
TERMINAL = re.compile(r'"terminal":(true|false)')


def main() -> int:
    files = sorted(glob.glob(os.path.join(DIR, "*.jsonl")))
    by_scenario: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    by_scenario_n: collections.Counter[str] = collections.Counter()
    totals: collections.Counter[int] = collections.Counter()
    unparsed = 0

    for f in files:
        with open(f, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if not line.strip():
                    continue
                tail = line[-3000:]
                sm = SCEN.search(line[:1200])
                wm = WINNER.search(tail)
                if not sm or not wm:
                    unparsed += 1
                    continue
                scn = sm.group(1)
                w = int(wm.group(1))
                by_scenario[scn][w] += 1
                by_scenario_n[scn] += 1
                totals[w] += 1

    print(f"files scanned        : {len(files)}")
    print(f"records with winner  : {sum(totals.values())}")
    print(f"records unparsed     : {unparsed}")
    print()
    print("overall winnerAlliance distribution (all scenarios pooled):")
    tot = sum(totals.values())
    for k in sorted(totals):
        print(f"  alliance {k}: {totals[k]:>5}  {100.0 * totals[k] / tot:6.2f}%")
    print()

    # Which scenarios are degenerate (a seat/ally never wins)?
    print("per-scenario seat/ally win distribution (only scenarios with >=10 games):")
    print(f"  {'scenario':<52} {'n':>4}  distribution")
    degenerate = []
    for scn in sorted(by_scenario, key=lambda s: -by_scenario_n[s]):
        n = by_scenario_n[scn]
        if n < 10:
            continue
        c = by_scenario[scn]
        dist = " ".join(f"a{k}:{v}" for k, v in sorted(c.items()))
        zero = [k for k in range(4) if c.get(k, 0) == 0]
        mark = ""
        if len(c) <= 2:
            mark = "  <-- DEGENERATE (<=2 distinct winners)"
            degenerate.append((scn, n, dict(c)))
        print(f"  {scn:<52} {n:>4}  {dist}{mark}")

    print()
    print(f"degenerate scenarios (<=2 distinct winners): {len(degenerate)}")
    for scn, n, c in degenerate:
        print(f"  {scn}  n={n}  {c}")
    print()
    print("interpretation: if a scenario's winner is (almost) always the same ally,")
    print("then any policy evaluated in the other seats is being measured on the SEAT,")
    print("not on its own skill, and the value labels for those seats are near-constant.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
