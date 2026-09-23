"""Distinguish two explanations for the model's under-recruit / over-attack skew:

  (A) it learned a bad teacher  -> the training labels themselves are under-recruiting
  (B) training is broken        -> the labels recruit a lot but the model does not

The spatial dataset was converted from baseline_dataset.jsonl, whose records carry
`label.actionCode` (the teacher's action). `label` sits second-to-last in each
~150 KB record, so we regex only a tail slice of each line instead of JSON-parsing
7 GB.

Usage: py -3.12 v12/tools/diag_teacher_action_mix.py
"""
from __future__ import annotations

import collections
import re

SRC = "training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl"
TAIL = 4000
HEAD = 1500
PAT = re.compile(r'"actionCode":"([a-z_]+):')
POL = re.compile(r'"policy":"([a-z\-]+)"')
TURN = re.compile(r'"turn":(\d+)')

# Action types the heuristic-vs-apk-like SD archive can produce.
INTENT = {
    "move": "move",
    "wait": "wait",
    "end_turn": "end_turn",
    "attack": "attack",
    "capture": "capture",
    "recruit_to_castle": "RECRUIT",
    "recruit_and_deploy": "RECRUIT",
    "repair": "repair",
    "heal": "heal",
    "summon": "summon",
    "post_attack_move": "post_attack_move",
    "destroy_town": "destroy_town",
    "surrender": "surrender",
}


def main() -> int:
    raw = collections.Counter()
    by_policy = collections.defaultdict(collections.Counter)
    by_turn: dict[tuple[str, str], collections.Counter] = collections.defaultdict(collections.Counter)
    n = 0
    unmatched = 0

    with open(SRC, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            n += 1
            tail = line[-TAIL:]
            m = PAT.search(tail)
            if not m:
                unmatched += 1
                continue
            t = m.group(1)
            raw[t] += 1
            pm = POL.search(line[:HEAD])
            pol = pm.group(1) if pm else "unknown"
            by_policy[pol][t] += 1
            tm = TURN.search(line[:HEAD])
            turn = int(tm.group(1)) if tm else -1
            bucket = "0-5" if 0 <= turn <= 5 else (
                "6-10" if turn <= 10 else (
                    "11-20" if turn <= 20 else (
                        "21-40" if turn <= 40 else ("41+" if turn > 40 else "unknown"))))
            by_turn[(pol, bucket)][t] += 1

    print(f"records scanned      : {n}")
    print(f"label not matched    : {unmatched}")
    print()
    print("teacher action mix (all records):")
    total = sum(raw.values())
    for k, v in raw.most_common():
        print(f"  {k:<20} {v:>8}  {100.0 * v / total:5.2f}%")

    print()
    print("rollup:")
    agg = collections.Counter()
    for k, v in raw.items():
        agg[INTENT.get(k, k)] += v
    for k, v in agg.most_common():
        print(f"  {k:<20} {v:>8}  {100.0 * v / total:5.2f}%")

    print()
    print("recruit share by policy tag:")
    for pol, c in by_policy.items():
        tot = sum(c.values())
        rec = sum(v for k, v in c.items() if INTENT.get(k) == "RECRUIT")
        atk = c.get("attack", 0)
        print(f"  {pol:<16} n={tot:>7}  RECRUIT {100.0 * rec / tot:5.2f}%  attack {100.0 * atk / tot:5.2f}%")

    print()
    print("recruit / attack share by TURN BUCKET (this is the phase confound check):")
    print(f"  {'policy':<10} {'turn':<7} {'n':>7} {'RECRUIT':>9} {'attack':>8} {'wait':>8} {'move':>8}")
    for (pol, b) in sorted(by_turn.keys(), key=lambda k: (k[0], k[1])):
        c = by_turn[(pol, b)]
        tot = sum(c.values())
        if tot == 0:
            continue
        rec = sum(v for k, v in c.items() if INTENT.get(k) == "RECRUIT")
        print(f"  {pol:<10} {b:<7} {tot:>7} {100.0 * rec / tot:>8.2f}% {100.0 * c.get('attack', 0) / tot:>7.2f}% "
              f"{100.0 * c.get('wait', 0) / tot:>7.2f}% {100.0 * c.get('move', 0) / tot:>7.2f}%")

    print()
    print("compare with the EVAL observation (model vs heuristic on Crossroads):")
    print("  model   RECRUIT ~ 8-9% of decisions, attack ~ 24-31%")
    print("  heuristic RECRUIT ~ 24-45% of decisions, attack ~ 10-16%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
