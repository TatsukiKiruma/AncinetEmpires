"""Mechanism check: is the archive's winner determined by POLICY assignment
rather than by play?

The preset is `heuristic-apk-like-balanced`. If one alliance systematically gets
the `heuristic` policy and the other gets `apk-like`, and heuristic > apk-like,
then the winner is decided before the first move. That would make value/win
labels in this archive a function of policy identity, not of good play.

Correlates `policyByPlayer` (head of the record) with `winnerAlliance` (tail).

Usage: py -3.12 v12/tools/diag_winner_vs_policy.py
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
POLMAP = re.compile(r'"policyByPlayer":\{(.*?)\}')
POLPAIR = re.compile(r'"(\d+)":"([a-z\-]+)"')


def main() -> int:
    files = sorted(glob.glob(os.path.join(DIR, "*.jsonl")))
    # winner alliance -> the policy set held by that alliance
    combo = collections.Counter()
    winner_is_heuristic_exclusive = 0
    winner_has_heuristic = 0
    winner_has_apk = 0
    total = 0
    per_scn = collections.defaultdict(collections.Counter)

    for f in files:
        with open(f, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if not line.strip():
                    continue
                wm = WINNER.search(line[-3000:])
                pm = POLMAP.search(line[:2500])
                sm = SCEN.search(line[:1200])
                if not wm or not pm:
                    continue
                total += 1
                winner = int(wm.group(1))
                pol_by_player = {int(k): v for k, v in POLPAIR.findall(pm.group(1))}
                # In this project a "player" and its "alliance" share the id unless
                # alliances group players; treat alliance id as player id when the
                # mapping is 1:1, which it is for the SD plan presets here.
                win_pol = pol_by_player.get(winner)
                combo[win_pol] += 1
                if sm:
                    per_scn[sm.group(1)][win_pol] += 1
                if win_pol == "heuristic":
                    winner_is_heuristic_exclusive += 1
                pols = set(pol_by_player.values())
                if win_pol == "heuristic":
                    winner_has_heuristic += 1
                if win_pol == "apk-like":
                    winner_has_apk += 1

    print(f"records analysed                     : {total}")
    print()
    print("winner's policy -> count:")
    for k, v in combo.most_common():
        print(f"  {str(k):<12} {v:>5}  {100.0 * v / total:6.2f}%")
    print()
    print(f"winner was a `heuristic` player       : {winner_has_heuristic} "
          f"({100.0 * winner_has_heuristic / total:.2f}%)")
    print(f"winner was an `apk-like` player       : {winner_has_apk} "
          f"({100.0 * winner_has_apk / total:.2f}%)")
    print()
    print("per-scenario winner policy (>=10 games):")
    for scn in sorted(per_scn, key=lambda s: -sum(per_scn[s].values())):
        c = per_scn[scn]
        if sum(c.values()) < 10:
            continue
        dist = " ".join(f"{k}:{v}" for k, v in c.most_common())
        print(f"  {scn:<52} {dist}")
    print()
    print("interpretation: if the winner's policy is almost always the same, the archive's")
    print("outcome is decided by the preset's policy assignment, not by play -- so win/value")
    print("labels there encode policy identity rather than skill.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
