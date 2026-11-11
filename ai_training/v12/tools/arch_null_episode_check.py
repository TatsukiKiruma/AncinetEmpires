"""Why are 7 pool episodes entirely `valueTarget: null`? Check the archive.

The spatial pool has 7 episodes whose every row has `valueTarget: null`. Section A
measured that all 37 pool episodes are TERMINAL in the episode archive, so the
archive does carry a winner for them. This prints the archive's own winner for each
of the 7, to distinguish "the game had no winner" from "the pipeline dropped the
label".

Usage: py -3.12 v12/tools/arch_null_episode_check.py
"""
from __future__ import annotations

import json

B = "v12/out/archive_value/value_ceiling.json"
IDX = "v12/out/archive_value/episode_index.json"


def main() -> int:
    b = json.load(open(B, encoding="utf-8"))
    idx = json.load(open(IDX, encoding="utf-8"))["index"]
    det = b["B14_per_root_detail"]
    nulls = [r for r, v in det.items() if v["seats_with_sign"] == 0]
    print(f"episodes with no signed label: {len(nulls)}\n")
    winpol = {"heuristic": 0, "apk-like": 0, "unknown": 0}
    for r in sorted(nulls):
        parts = r.split("#")
        e = idx.get(parts[0] + "#" + parts[1])
        print(f"{r}")
        print(f"   rows={det[r]['rows']}  seats={det[r]['n_seats']}")
        if e is None:
            print("   NOT FOUND in episode_index")
        else:
            wp = e["policyByPlayer"].get(str(e["effectiveWinner"]), "unknown")
            winpol[wp] = winpol.get(wp, 0) + 1
            print(f"   archive policyByPlayer={e['policyByPlayer']}")
            print(f"   archive winnerAlliance={e['winnerAlliance']} "
                  f"adjudicated={e['adjudicatedWinnerAlliance']} "
                  f"effective={e['effectiveWinner']} timeout={e['timeout']} "
                  f"-> winner policy = {wp}")
        print()
    print(f"winning policy among the {len(nulls)} unlabelled episodes: {winpol}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
