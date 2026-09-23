"""Per-episode label digest of Section B's pool (re-formats measured numbers only).

Usage: py -3.12 v12/tools/arch_pool_digest.py
"""
from __future__ import annotations

import json

B = "v12/out/archive_value/value_ceiling.json"


def main() -> int:
    b = json.load(open(B, encoding="utf-8"))
    d = b["B14_per_root_detail"]
    print(f"{'episode':<62} {'rows':>5} {'seats':>5} {'sign':>4}  labels")
    allnull = []
    for r, v in sorted(d.items(), key=lambda kv: -kv[1]["rows"]):
        print(f"{r[:62]:<62} {v['rows']:>5} {v['n_seats']:>5} "
              f"{v['seats_with_sign']:>4}  {v['label_counts']}")
        if v["seats_with_sign"] == 0:
            allnull.append(r)
    tot = sum(d[r]["rows"] for r in allnull)
    sig = [r for r in d if d[r]["seats_with_sign"] > 0]
    print()
    print(f"episodes with NO signed label : {len(allnull)}  rows={tot}")
    print(f"episodes with a signed label  : {len(sig)}  "
          f"rows={b['B1_valueTarget_distribution']['n_rows'] - tot}  "
          f"seats_with_sign={sum(d[r]['seats_with_sign'] for r in sig)}")
    print()
    print("B14 field 'policy_by_player' sample (first episode):")
    print(" ", json.dumps(d[sorted(d)[0]]["policy_by_player"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
