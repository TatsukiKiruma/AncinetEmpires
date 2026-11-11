"""V18：五图面板（DEV20 / RECHECK40 / CONFIRM20）的逐局重算与汇总。

中文：不信任任何已写好的汇总，直接从逐局记录重算胜场、终止分类、逐图/先后手分布，
并核对「自然终局」与「候选阵营获胜」是否一致。这是 V18 任务书对评测读数的最低要求。

用法：
    python v18/tools/arena_summary_v18.py --run-id run_20260927_v18_01 --name T18_02_A_final
    python v18/tools/arena_summary_v18.py --run-id run_20260927_v18_01 --name T18_02_B_final
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NATURAL = {"NATURAL_WIN", "NATURAL_LOSS", "NATURAL_DRAW"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    parser.add_argument("--name", required=True)
    parser.add_argument("--panel", default="dev")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id
    out_dir = run / "arena" / args.panel

    rows: list[dict] = []
    for path in sorted(out_dir.glob(f"{args.name}.m*.games.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            text = line.strip()
            if text:
                rows.append(json.loads(text))

    by_map = collections.Counter()
    by_map_wins = collections.Counter()
    by_seat = collections.Counter()
    by_seat_wins = collections.Counter()
    outcomes = collections.Counter()
    hashes = set()
    fallbacks = 0
    errors = 0
    mismatches = 0
    wins = 0
    for row in rows:
        natural = row["outcomeKind"] in NATURAL
        won = natural and row["winnerAllianceId"] == row["candidateAllianceId"]
        by_map[row["mapName"]] += 1
        by_seat[str(row["candidateSeat"])] += 1
        outcomes[row["outcomeKind"]] += 1
        hashes.add(row.get("checkpointSha256"))
        fallbacks += int(bool(row.get("fallbackUsed")))
        errors += int(bool(row.get("error")))
        if won:
            wins += 1
            by_map_wins[row["mapName"]] += 1
            by_seat_wins[str(row["candidateSeat"])] += 1
        # 一致性：自然胜/负的判定必须与 winnerAllianceId 相符
        if natural and row["outcomeKind"] != "NATURAL_DRAW":
            expect = "NATURAL_WIN" if row["winnerAllianceId"] == row["candidateAllianceId"] else "NATURAL_LOSS"
            if expect != row["outcomeKind"]:
                mismatches += 1

    report = {
        "schema": "v18_arena_summary_1",
        "runId": args.run_id,
        "name": args.name,
        "panel": args.panel,
        "games": len(rows),
        "naturalWins": wins,
        "naturalWinRate": (wins / len(rows)) if rows else None,
        "outcomes": dict(sorted(outcomes.items())),
        "byMap": {
            name: {"games": by_map[name], "wins": by_map_wins.get(name, 0)}
            for name in sorted(by_map)
        },
        "bySeat": {
            seat: {"games": by_seat[seat], "wins": by_seat_wins.get(seat, 0)}
            for seat in sorted(by_seat)
        },
        "checkpointSha256": sorted(h for h in hashes if h),
        "distinctCheckpoints": len({h for h in hashes if h}),
        "fallbacks": fallbacks,
        "errors": errors,
        "outcomeMismatches": mismatches,
        "naturalCompletionRate": (sum(v for k, v in outcomes.items() if k in NATURAL) / len(rows)) if rows else None,
        "note": "胜 = 真实自然终局且 winnerAllianceId == candidateAllianceId；截断与平局不计胜。",
    }
    out = run / "arena" / args.panel / f"{args.name}.summary.v18.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "name": args.name,
        "games": report["games"],
        "naturalWins": report["naturalWins"],
        "outcomes": report["outcomes"],
        "byMap": {k.split('.')[0]: f"{v['wins']}/{v['games']}" for k, v in report["byMap"].items()},
        "bySeat": {k: f"{v['wins']}/{v['games']}" for k, v in report["bySeat"].items()},
        "fallbacks": fallbacks,
        "errors": errors,
        "outcomeMismatches": mismatches,
        "checkpointSha256": report["checkpointSha256"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
