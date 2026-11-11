"""Refinement of the seat-asymmetry finding: include ADJUDICATED winners.

A prior round reported "26 of 31 scenarios with >=10 games have <=2 distinct
winner alliances" using `summary.winnerAlliance` only. But 392/1395 records have
`winnerAlliance: null` -- all of them timeouts -- and every one of them carries an
`adjudicatedWinnerAlliance`. Excluding those 392 games may have overstated the
degeneracy.

This recomputes the per-scenario winner distribution under three label choices:
  TERMINAL   : winnerAlliance only (what the prior round used)
  ADJUDICATED: adjudicatedWinnerAlliance only
  EFFECTIVE  : winnerAlliance if present, else adjudicatedWinnerAlliance
and reports how many scenarios are degenerate (<=2 distinct winners) under each.

Usage: py -3.12 v12/tools/diag_degeneracy_with_adjudicated.py
"""
from __future__ import annotations

import collections
import glob
import os
import re

DIR = "training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced"
SCEN = re.compile(r'"id":"(SDPLAN:[^"]+)"')
W_TERM = re.compile(r'"winnerAlliance":(\d+|null)')
W_ADJ = re.compile(r'"adjudicatedWinnerAlliance":(\d+|null)')


def main() -> int:
    files = sorted(glob.glob(os.path.join(DIR, "*.jsonl")))
    term: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    adj: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    eff: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    n_by: collections.Counter[str] = collections.Counter()
    n_term_null = 0
    n_adj_null = 0
    n_eff_null = 0
    total = 0

    for f in files:
        with open(f, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if not line.strip():
                    continue
                sm = SCEN.search(line[:1200])
                if not sm:
                    continue
                tail = line[-3000:]
                tm = W_TERM.search(tail)
                am = W_ADJ.search(tail)
                if not tm or not am:
                    continue
                total += 1
                scn = sm.group(1)
                n_by[scn] += 1
                t = None if tm.group(1) == "null" else int(tm.group(1))
                a = None if am.group(1) == "null" else int(am.group(1))
                if t is None:
                    n_term_null += 1
                else:
                    term[scn][t] += 1
                if a is None:
                    n_adj_null += 1
                else:
                    adj[scn][a] += 1
                e = t if t is not None else a
                if e is None:
                    n_eff_null += 1
                else:
                    eff[scn][e] += 1

    print(f"records scanned                     : {total}")
    print(f"winnerAlliance null (terminal)      : {n_term_null} ({100.0 * n_term_null / total:.2f}%)")
    print(f"adjudicatedWinnerAlliance null      : {n_adj_null} ({100.0 * n_adj_null / total:.2f}%)")
    print(f"EFFECTIVE null (both missing)       : {n_eff_null} ({100.0 * n_eff_null / total:.2f}%)")
    print()

    for label, data in (("TERMINAL", term), ("ADJUDICATED", adj), ("EFFECTIVE", eff)):
        big = [s for s in data if n_by[s] >= 10]
        deg = [s for s in big if len(data[s]) <= 2]
        one = [s for s in big if len(data[s]) == 1]
        print(f"{label:<12} scenarios(>=10 games)={len(big):<3} degenerate(<=2)={len(deg):<3} single-winner={len(one)}")
    print()

    print("per-scenario comparison (>=10 games), TERMINAL vs EFFECTIVE:")
    print(f"  {'scenario':<52} {'n':>4}  {'TERMINAL':<22} {'EFFECTIVE':<22}")
    for scn in sorted(n_by, key=lambda s: -n_by[s]):
        if n_by[scn] < 10:
            continue
        t = " ".join(f"a{k}:{v}" for k, v in sorted(term[scn].items())) or "(none)"
        e = " ".join(f"a{k}:{v}" for k, v in sorted(eff[scn].items())) or "(none)"
        flag = ""
        if len(eff[scn]) > 2 and len(term[scn]) <= 2:
            flag = "   <-- degeneracy EXPLAINED by the 392 timeouts"
        print(f"  {scn:<52} {n_by[scn]:>4}  {t:<22} {e:<22}{flag}")
    print()
    print("interpretation: if EFFECTIVE shows markedly more distinct winners than")
    print("TERMINAL, then the earlier '26/31 degenerate' figure was inflated by")
    print("counting only naturally-terminated games.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
