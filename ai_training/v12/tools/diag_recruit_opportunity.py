"""Is the archive's low recruit share explained by recruit actions being ILLEGAL?

`recruit share` (4.24%) is not `recruit inclination`: if recruiting is unavailable
(no gold, unit cap reached), a competent policy still shows a low share. The
evaluation harness measured the heuristic recruiting 24-45% of its decisions,
which would only be contradictory if recruiting were available equally often.

This probe measures, on the SAME records the spatial dataset was built from:
  - how often a recruit action is legal at all
  - the chosen-action recruit rate CONDITIONAL on a recruit being legal
  - the same conditional rate by turn bucket and by policy tag

Usage: py -3.12 v12/tools/diag_recruit_opportunity.py
"""
from __future__ import annotations

import collections
import json
import re

SRC = "training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl"
TAIL = 4000
HEAD = 1500
LEGAL = re.compile(r'"legalActionCodes":\[(.*?)\]')
LABEL = re.compile(r'"actionCode":"([a-z_]+):')
POL = re.compile(r'"policy":"([a-z\-]+)"')
TURN = re.compile(r'"turn":(\d+)')
RECRUIT_LEGAL = re.compile(r'"(recruit_to_castle|recruit_and_deploy):')


def bucket_of(t: int) -> str:
    return "0-5" if t <= 5 else "6-10" if t <= 10 else "11-20" if t <= 20 else "21-40" if t <= 40 else "41+"


def main() -> int:
    n = 0
    legal_seen = 0
    legal_has_recruit = 0
    chosen_recruit_when_legal = 0
    chosen_recruit = 0
    by_turn: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    by_pol: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)

    with open(SRC, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            n += 1
            lm = LEGAL.search(line)
            if not lm:
                continue
            legal_seen += 1
            legal_txt = lm.group(1)
            can_recruit = bool(RECRUIT_LEGAL.search(legal_txt))
            lab = LABEL.search(line[-TAIL:])
            chosen = lab.group(1) if lab else None
            is_recruit = chosen in ("recruit_to_castle", "recruit_and_deploy")
            if is_recruit:
                chosen_recruit += 1
            pm = POL.search(line[:HEAD])
            pol = pm.group(1) if pm else "unknown"
            tm = TURN.search(line[:HEAD])
            turn = int(tm.group(1)) if tm else -1
            b = bucket_of(turn)

            by_turn[b]["n"] += 1
            by_pol[pol]["n"] += 1
            if can_recruit:
                legal_has_recruit += 1
                by_turn[b]["legal"] += 1
                by_pol[pol]["legal"] += 1
                if is_recruit:
                    chosen_recruit_when_legal += 1
                    by_turn[b]["chosen"] += 1
                    by_pol[pol]["chosen"] += 1

    print(f"records scanned                     : {n}")
    print(f"records with a parsed legal set      : {legal_seen}")
    print(f"records where a RECRUIT was legal    : {legal_has_recruit} "
          f"({100.0 * legal_has_recruit / max(1, legal_seen):.2f}% of decisions)")
    print(f"chosen action was RECRUIT (all)      : {chosen_recruit} "
          f"({100.0 * chosen_recruit / max(1, legal_seen):.2f}%)")
    print()
    print(">>> CONDITIONAL recruit rate (chosen RECRUIT | RECRUIT was legal): "
          f"{100.0 * chosen_recruit_when_legal / max(1, legal_has_recruit):.2f}%  "
          f"({chosen_recruit_when_legal}/{legal_has_recruit})")
    print()

    print("by turn bucket:")
    print(f"  {'turn':<7} {'n':>7} {'legal%':>8} {'recruitShare':>13} {'condRecruit':>12}")
    for b in ["0-5", "6-10", "11-20", "21-40", "41+"]:
        c = by_turn.get(b)
        if not c or c["n"] == 0:
            continue
        print(f"  {b:<7} {c['n']:>7} {100.0 * c['legal'] / c['n']:>7.2f}% "
              f"{100.0 * c['chosen'] / c['n']:>12.2f}% "
              f"{100.0 * c['chosen'] / max(1, c['legal']):>11.2f}%")

    print()
    print("by policy tag:")
    print(f"  {'policy':<12} {'n':>7} {'legal%':>8} {'recruitShare':>13} {'condRecruit':>12}")
    for pol, c in sorted(by_pol.items()):
        if c["n"] == 0:
            continue
        print(f"  {pol:<12} {c['n']:>7} {100.0 * c['legal'] / c['n']:>7.2f}% "
              f"{100.0 * c['chosen'] / c['n']:>12.2f}% "
              f"{100.0 * c['chosen'] / max(1, c['legal']):>11.2f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
