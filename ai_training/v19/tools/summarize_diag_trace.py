"""V19/R1：把重放+反事实的 trace.json 压成可读的失败机制摘要。

只读 `diagnose_dev_families.ts` 的产物，不重新跑对局。输出每个家族的：
首次分歧（回合/决策号/双方选择）、每个窗口的反事实结果（把 A 的选择放到 B 的轨迹上
是否改变了自然结果）、以及分歧时刻的规则上下文（收入/建筑/指挥官位置/候选分数）。

用法：
    python v19/tools/summarize_diag_trace.py --trace <path>/trace.json --out <path>/summary.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def top_candidates(codes, logits, k=4):
    if not codes or not logits:
        return []
    pairs = sorted(zip(codes, logits), key=lambda p: -p[1])[:k]
    return [{"code": c, "logit": round(float(v), 4)} for c, v in pairs]


def logit_of(codes, logits, code):
    if not codes or not logits or code not in codes:
        return None
    return round(float(logits[codes.index(code)]), 4)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trace", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    data = json.loads(Path(args.trace).read_text(encoding="utf-8"))
    summary = {"schema": "v19_r1_diag_summary_1", "families": []}

    for item in data["results"]:
        fam = item["family"]
        a, b = item["modelA"], item["modelB"]
        entry = {
            "id": fam["id"], "mapName": fam["mapName"], "seed": fam["seed"], "seat": fam["seat"],
            "note": fam.get("note"),
            "modelA": {"outcomeKind": a["outcomeKind"], "steps": a["steps"],
                       "digestMatchesDev": a["digestMatchesDev"]},
            "modelB": {"outcomeKind": b["outcomeKind"], "steps": b["steps"],
                       "digestMatchesDev": b["digestMatchesDev"]},
            "firstDivergenceIndex": item["firstDivergenceIndex"],
            "windows": [],
        }
        for w in item["windows"]:
            state = w.get("state") or {}
            units = state.get("units", [])
            players = state.get("players", [])
            cf = w.get("counterfactual") or {}
            # StepTraceV16 没有 `turn` 字段（只有 turnAfter），因此回退到决策前状态里的回合号。
            turn = w.get("turn")
            if turn is None:
                turn = state.get("turn")
            entry["windows"].append({
                "decisionIndex": w["decisionIndex"],
                "turn": turn,
                "playerId": w["playerId"],
                "legalActionCount": w["legalActionCount"],
                "actionA": w["actionA"],
                "actionB": w["actionB"],
                "logitOfAChosenByA": logit_of(w.get("orderedA"), w.get("logitsA"), w["actionA"]),
                "logitOfAChosenByB": logit_of(w.get("orderedB"), w.get("logitsB"), w["actionA"]),
                "topA": top_candidates(w.get("orderedA"), w.get("logitsA")),
                "topB": top_candidates(w.get("orderedB"), w.get("logitsB")),
                "context": {
                    "gold": {str(p["id"]): p["gold"] for p in players},
                    "alive": {str(p["id"]): p["alive"] for p in players},
                    "pendingUnitId": state.get("pendingUnitId"),
                    "unitCount": {str(p["id"]): sum(1 for u in units if u["owner"] == p["id"])
                                  for p in players},
                    "commanders": [u for u in units if u["cls"] == "commander"],
                    "ownUnits": [u for u in units if u["owner"] == w["playerId"]],
                },
                "counterfactual": cf,
            })
        # 判定：反事实是否改变了结果。
        #
        # 重要口径修正：只有当 A 的选择在 B 的**当时状态里合法**、且反事实跑出的是
        # 一次**有效对局**（不是 POLICY_ERROR）时，`changedOutcome` 才有意义。
        # 分歧之后的窗口里，两条轨迹的状态已经不同，A 的动作常常不在 B 的合法集内；
        # 这类窗口的强制动作会直接抛错，旧判定会把「报错」误算成「改变了结果」。
        applicable = [w for w in entry["windows"]
                      if w["logitOfAChosenByB"] is not None
                      and "error" not in (w["counterfactual"] or {})]
        changed = [w["counterfactual"] for w in applicable
                   if w["counterfactual"].get("changedOutcome")]
        entry["applicableWindows"] = len(applicable)
        entry["inapplicableWindows"] = len(entry["windows"]) - len(applicable)
        entry["counterfactualChangedOutcome"] = len(changed)
        if not applicable:
            entry["verdict"] = (
                "本轮窗口的强制动作在对方当时状态里不合法（轨迹已分叉），"
                "反事实不适用；需要按分叉后的状态重新选窗口。"
            )
        elif changed:
            entry["verdict"] = (
                "反事实改变了自然结果：该分歧点存在**可复核的动作级差异**"
                "（同一对手随机流、同一模型、只改这一个选择）。"
            )
        else:
            entry["verdict"] = (
                "本轮适用窗口内的反事实没有改变自然结果：该分歧点**不是**决定性失误"
                "（标为待验证假设，需在更晚的状态重新选窗口）。"
            )
        summary["families"].append(entry)

    Path(args.out).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for f in summary["families"]:
        print(f"\n=== {f['id']} ({f['mapName']} seed={f['seed']} seat={f['seat']}) ===")
        print(f"  A={f['modelA']['outcomeKind']} (digestMatch={f['modelA']['digestMatchesDev']}, steps={f['modelA']['steps']})  "
              f"B={f['modelB']['outcomeKind']} (digestMatch={f['modelB']['digestMatchesDev']}, steps={f['modelB']['steps']})")
        print(f"  首次分歧=决策#{f['firstDivergenceIndex']}  窗口={len(f['windows'])}  "
              f"反事实改变结果={f['counterfactualChangedOutcome']}")
        for w in f["windows"]:
            cf = w["counterfactual"]
            print(f"    [决策#{w['decisionIndex']} 回合{w['turn']} 合法{w['legalActionCount']}]")
            print(f"      A={w['actionA']} (A给分 {w['logitOfAChosenByA']}, B给分 {w['logitOfAChosenByB']})")
            print(f"      B={w['actionB']}")
            print(f"      金币={w['context']['gold']} 兵力={w['context']['unitCount']} pending={w['context']['pendingUnitId']}")
            if "error" in cf:
                print(f"      反事实失败：{cf['error']}")
            else:
                print(f"      反事实(把A的选择放到B上): {cf['outcomeKind']} steps={cf['steps']} "
                      f"changed={cf['changedOutcome']}")
        print(f"  判定：{f['verdict']}")
    print(f"\n[R1] -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
