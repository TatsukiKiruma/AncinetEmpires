#!/usr/bin/env python3
"""V13/T13-04 (finish): teacher recall vs candidate budget, under the NEW ordering.

The earlier number (75.27%) was measured against the old converter order and the old
converter's preserve-rules. Both changed, so it must be re-measured, and the taskbook
requires reporting "the selector's raw teacher recall BEFORE any forced insertion".

Everything here reads only `legalActionCodes`, the label's action code and the action
TYPE of each code. The selection rules never look at the label, so recall is an honest
out-of-sample number.

Usage:
    py v13/tools/coverage_curve.py --pool v13/out/<runId>/T13-07/data_v3_b0_v31/pool_v31.jsonl
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Rules that must be reachable for a policy to be able to defend itself. Chosen from the
# action-type distribution, not tuned on the label.
PRIORITY_TYPES = ("capture", "attack", "recruit_to_castle", "recruit_and_deploy",
                  "heal", "support", "destroy_town", "summon")


def type_of(code: str) -> str:
    return code.split(":", 1)[0]


def select_legal_prefix(codes: list[str], cap: int) -> list[str]:
    """The baseline the old converter used: first N in legal order."""
    return codes[:cap]


def select_priority_first(codes: list[str], cap: int) -> list[str]:
    """Label-independent: every priority-type action first, then the legal prefix."""
    pri = [c for c in codes if type_of(c) in PRIORITY_TYPES]
    rest = [c for c in codes if type_of(c) not in PRIORITY_TYPES]
    return (pri + rest)[:cap]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", required=True)
    ap.add_argument("--out", default=None)
    ap.add_argument("--caps", default="6,16,32,48,64,96,128,256,512,1024")
    args = ap.parse_args()

    pool = REPO_ROOT / args.pool
    out_path = REPO_ROOT / args.out if args.out else pool.parent / "coverage_curve.json"
    caps = [int(c) for c in args.caps.split(",") if c.strip()]

    rows = 0
    legal_counts: list[int] = []
    teacher_pos: Counter = Counter()
    recall_prefix = {c: 0 for c in caps}
    recall_priority = {c: 0 for c in caps}

    with pool.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            codes = r.get("candidateActionCodes") or []
            tgt = r.get("targetActionCode")
            if not codes or tgt not in codes:
                continue
            rows += 1
            legal_counts.append(len(codes))
            teacher_pos[codes.index(tgt)] += 1
            for cap in caps:
                if tgt in select_legal_prefix(codes, cap):
                    recall_prefix[cap] += 1
                if tgt in select_priority_first(codes, cap):
                    recall_priority[cap] += 1

    total = max(1, rows)
    curve = []
    for cap in caps:
        curve.append({
            "cap": cap,
            "recallLegalPrefix": round(recall_prefix[cap] / total, 6),
            "recallPriorityFirst": round(recall_priority[cap] / total, 6),
            "priorityGain": round((recall_priority[cap] - recall_prefix[cap]) / total, 6),
        })

    legal_sorted = sorted(legal_counts)
    report = {
        "schema": "v13_coverage_curve_1",
        "pool": str(pool.relative_to(REPO_ROOT)),
        "ordering": "engine legal order (v3.1)",
        "rows": rows,
        "legalActionsPerState": {
            "min": legal_sorted[0],
            "median": legal_sorted[len(legal_sorted) // 2],
            "p90": legal_sorted[int(len(legal_sorted) * 0.9)],
            "max": legal_sorted[-1],
            "mean": round(sum(legal_sorted) / len(legal_sorted), 3),
        },
        "teacherPositionInEngineOrder": {
            "atIndex0": teacher_pos[0],
            "atIndex0Fraction": round(teacher_pos[0] / total, 6),
            "topPositions": teacher_pos.most_common(8),
        },
        "curve": curve,
        "priorityTypes": list(PRIORITY_TYPES),
        "note": "recall is measured BEFORE any forced insertion of the teacher action; a "
                "selector that inspects the label has recall 1.0 by construction and that "
                "number must never be reported as coverage",
    }
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"[coverage] rows={rows} legal median={report['legalActionsPerState']['median']} "
          f"max={report['legalActionsPerState']['max']}")
    print(f"[coverage] teacher at engine index 0: {report['teacherPositionInEngineOrder']['atIndex0Fraction']}")
    print(f"{'cap':>6} {'legalPrefix':>12} {'priorityFirst':>14} {'gain':>8}")
    for point in curve:
        print(f"{point['cap']:>6} {point['recallLegalPrefix']:>12.4f} "
              f"{point['recallPriorityFirst']:>14.4f} {point['priorityGain']:>8.4f}")
    print(f"[coverage] wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
