"""V17 诊断：**对局早期**的动作类型错误是否预测败局？（去掉"败局更短"这个混杂）

上一版把整局的不一致率按胜负分组，被"败局决策数更少"混杂。这一版：
  * 只统计每局**前 N 个模型决策**（N=1,3,5,10,20,全部）内的一致性；
  * 按地图 + 座位分层，同层内比较胜/负，避免地图结构混杂；
  * 同时给出"前 N 个决策里是否至少出现过一次类型错误"的胜率差（风险差）。

若早期错误与败局强相关，那么"开局阶段课程"就是有证据支持的方向；
若无关，则说明胜负由更靠后的局面决定，不该把预算放在开局。
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
CUTS = [1, 3, 5, 10, 20]


def type_of(code) -> str:
    return str(code).split(":")[0] if code else "null"


def main() -> int:
    games: dict[str, list[dict]] = defaultdict(list)
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
            games[str(r.get("rootId"))].append({
                "step": r.get("stepIndex"),
                "typeOk": type_of(beh) == type_of(l1),
                "exactOk": beh == l1,
                "map": r.get("mapName"),
                "seat": str(r.get("subjectPlayerId")),
                "outcome": str(r.get("outcomeSource") or ""),
            })

    rows = []
    for root, decs in games.items():
        decs = sorted(decs, key=lambda d: (d["step"] if d["step"] is not None else 0))
        o = decs[0]["outcome"].upper()
        if "WIN" not in o and "LOSS" not in o:
            continue
        rows.append({
            "root": root, "map": decs[0]["map"], "seat": decs[0]["seat"],
            "win": "WIN" in o, "decs": decs,
        })

    print(f"games with a natural outcome: {len(rows)}  (wins={sum(1 for r in rows if r['win'])}, "
          f"losses={sum(1 for r in rows if not r['win'])})")

    report = {"schema": "v17_early_type_error_vs_outcome_1", "files": FILES,
              "games": len(rows), "cuts": {}, "stratified": {}}

    for cut in CUTS + [None]:
        label = "all" if cut is None else f"first{cut}"
        win_bad = win_n = loss_bad = loss_n = 0
        for r in rows:
            decs = r["decs"] if cut is None else r["decs"][:cut]
            if not decs:
                continue
            bad = any(not d["typeOk"] for d in decs)
            if r["win"]:
                win_n += 1
                win_bad += int(bad)
            else:
                loss_n += 1
                loss_bad += int(bad)
        if win_n and loss_n:
            p_win_bad = win_bad / win_n
            p_loss_bad = loss_bad / loss_n
            report["cuts"][label] = {
                "winGames": win_n, "winGamesWithTypeError": win_bad, "winRate": round(p_win_bad, 4),
                "lossGames": loss_n, "lossGamesWithTypeError": loss_bad, "lossRate": round(p_loss_bad, 4),
                "riskDifference": round(p_loss_bad - p_win_bad, 4),
            }
            print(f"  P(type error within {label:7s}) : win={p_win_bad:.3f} ({win_bad}/{win_n})  "
                  f"loss={p_loss_bad:.3f} ({loss_bad}/{loss_n})  riskDiff={p_loss_bad - p_win_bad:+.3f}")

    # 分层：同一 (map, seat) 内比较
    strata = defaultdict(lambda: {"win": [0, 0], "loss": [0, 0]})
    for r in rows:
        cell = strata[(r["map"], r["seat"])][("win" if r["win"] else "loss")]
        decs = r["decs"][:5]
        cell[0] += 1
        cell[1] += int(any(not d["typeOk"] for d in decs))
    for (m, s), d in sorted(strata.items()):
        w, l = d["win"], d["loss"]
        if w[0] == 0 or l[0] == 0:
            report["stratified"][f"{m}|seat{s}"] = {"note": "只有一类结果，无法比较", "win": w, "loss": l}
            continue
        report["stratified"][f"{m}|seat{s}"] = {
            "winGames": w[0], "winTypeErrRate5": round(w[1] / w[0], 4),
            "lossGames": l[0], "lossTypeErrRate5": round(l[1] / l[0], 4),
        }
    print("\n  stratified by (map, seat), first-5 type-error rate:")
    for k, v in report["stratified"].items():
        print(f"    {k:32s} {v}")

    out = REPO / "v17/out/v17_20260926_r2/data/early_type_error_vs_outcome.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nwrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())