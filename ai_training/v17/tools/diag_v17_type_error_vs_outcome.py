"""V17 诊断：对局胜负是否与"模型在校验点上的动作类型错误数"相关？

用已采集的学生对局（模型 vs H0）逐局统计：
  * 该局模型决策数、与专家类型不一致的次数、类型不一致率；
  * 该局自然胜负（`outcomeSource` / `valueTarget`）；
  * 按胜负分组比较不一致率，并按回合阶段拆分。

若败局的不一致率显著高于胜局，说明"降低类型错误"确实是提高胜率的杠杆；
若两者接近，则胜负由别的因素决定，继续压类型错误不会加分。
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

FILES = [
    "v17/out/v17_20260926_r2/data/new_train/dataset_v17_newtrain.jsonl",
    "v17/out/v17_20260926_r2/data/b2_student/encoded/student.b2.jsonl",
]


def type_of(code) -> str:
    return str(code).split(":")[0] if code else "null"


def main() -> int:
    per_game = defaultdict(lambda: {"rows": 0, "typeWrong": 0, "exactWrong": 0,
                                    "byPhase": defaultdict(lambda: [0, 0]),
                                    "outcome": None, "map": None, "bySource": None})
    for rel in FILES:
        p = REPO / rel
        if not p.exists():
            continue
        for line in p.open(encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            if str(r.get("sourcePolicy")) == "h0":
                continue
            beh, l1 = r.get("behaviorActionCode"), r.get("l1ActionCode")
            if not beh or not l1:
                continue
            gid = r.get("gameId") or r.get("rootId")
            # gameId 形如 "<rootId>|stepN"；按 root 聚合成"一局"
            root = str(r.get("rootId"))
            g = per_game[root]
            g["rows"] += 1
            g["map"] = r.get("mapName")
            g["bySource"] = r.get("sourcePolicy")
            if r.get("outcomeSource"):
                g["outcome"] = str(r["outcomeSource"])
            ok_type = type_of(beh) == type_of(l1)
            ok_exact = beh == l1
            if not ok_type:
                g["typeWrong"] += 1
            if not ok_exact:
                g["exactWrong"] += 1
            ph = str(r.get("phaseBucket"))
            g["byPhase"][ph][0] += 1
            g["byPhase"][ph][1] += 0 if ok_type else 1

    groups = {"win": [], "loss": [], "unknown": []}
    for root, g in per_game.items():
        o = g["outcome"] or ""
        key = "win" if "WIN" in o.upper() else ("loss" if "LOSS" in o.upper() else "unknown")
        groups[key].append((root, g))

    print(f"games with student decisions: {len(per_game)}")
    report = {"schema": "v17_type_error_vs_outcome_1", "files": FILES, "games": len(per_game), "groups": {}}
    for key in ("win", "loss", "unknown"):
        rows = groups[key]
        if not rows:
            continue
        tot = sum(g["rows"] for _, g in rows)
        tw = sum(g["typeWrong"] for _, g in rows)
        ew = sum(g["exactWrong"] for _, g in rows)
        entry = {
            "games": len(rows), "decisions": tot,
            "typeWrongRate": round(tw / tot, 4) if tot else None,
            "exactWrongRate": round(ew / tot, 4) if tot else None,
            "meanTypeWrongPerGame": round(tw / len(rows), 2),
            "meanDecisionsPerGame": round(tot / len(rows), 1),
        }
        report["groups"][key] = entry
        print(f"  {key:8s} games={entry['games']:4d} decisions={tot:6d} "
              f"typeWrong={entry['typeWrongRate']} exactWrong={entry['exactWrongRate']} "
              f"meanTypeWrong/game={entry['meanTypeWrongPerGame']}")

    # 按地图拆（同一地图内比较胜/负，避免地图混杂）
    by_map = defaultdict(lambda: {"win": [0, 0], "loss": [0, 0]})  # key -> {outcome: [decisions, typeWrong]}
    for key in ("win", "loss"):
        for _root, g in groups[key]:
            cell = by_map[g["map"]][key]
            cell[0] += g["rows"]
            cell[1] += g["typeWrong"]
    per_map = {m: {k: {"decisions": v[0], "typeWrongRate": round(v[1] / v[0], 4) if v[0] else None}
                   for k, v in d.items()} for m, d in sorted(by_map.items())}
    report["byMap"] = per_map
    print("\n  by map (decisions, type-wrong rate):")
    for m, d in per_map.items():
        print(f"    {m:26s} win={d['win']}  loss={d['loss']}")

    out = REPO / "v17/out/v17_20260926_r2/data/type_error_vs_outcome.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nwrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())