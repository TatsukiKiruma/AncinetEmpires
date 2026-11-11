"""V18/T18-03：偏好可重复性失败的原因定位（只读已有产物，不再跑续弈）。

上一支脚本的结论是：偏好方向的可重复率（79.5% 一致 / 87.2% 留一）
**没有超过随机重排基线**（P95 = 82.8% / 90.2%）。

本脚本回答「是不是截断造成的」，并给出下一步该修哪一项。三个切分：

1. **只看两侧都到达边界的分支对**（`HORIZON_REACHED` 或 `NATURAL_TERMINAL`）；
2. **只看至少一侧出现自然终局的分支对**；
3. **只看窗口本身还没分出胜负的**（窗口时刻学生联盟指挥官仍存活）。

每个切分都重新算一致率与随机基线（同一切分内重排）。

用法：
    python v18/tools/diagnose_preference_failure.py --run-id run_20260927_v18_01
"""
from __future__ import annotations

import argparse
import collections
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAIR_MARGIN = 0.5
PERMUTATIONS = 400
PERMUTATION_SEED = 20260999
HORIZON_OK = {"HORIZON_REACHED", "NATURAL_TERMINAL"}


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if text:
                yield json.loads(text)


def score(rep: dict) -> tuple[int, float]:
    return (1 if rep["viewedOutcome"] == "NATURAL_WIN" else 0,
            float(rep["unitsKilledBySubject"] - rep["unitsLostBySubject"]))


def better(a, b, margin=PAIR_MARGIN) -> bool:
    if a[0] != b[0]:
        return a[0] > b[0]
    return (a[1] - b[1]) >= margin


def wilson(s: int, n: int, z: float = 1.96):
    if n == 0:
        return (0.0, 0.0)
    p = s / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id
    path = run / "counterfactual" / "paired_continuation.branches.jsonl"

    windows: dict[str, list[dict]] = collections.OrderedDict()
    for row in iter_jsonl(path):
        windows.setdefault(row["windowId"], []).append(row)

    def eval_slice(pred) -> dict:
        """pred(branch_row, student_row) -> 是否把这对纳入本切分。"""
        pairs = []
        for wid, rows in windows.items():
            student = next((r for r in rows if "student_actual" in r["roles"]), None)
            if student is None:
                continue
            for row in rows:
                if row is student:
                    continue
                if not pred(row, student):
                    continue
                sb = {r["seed"]: r for r in student["replicates"]}
                bb = {r["seed"]: r for r in row["replicates"]}
                common = sorted(set(sb) & set(bb))
                if len(common) < 3:
                    continue
                votes = [better(score(bb[s]), score(sb[s])) for s in common]
                pairs.append({"windowId": wid, "votes": votes,
                              "unanimous": all(votes) or not any(votes),
                              "unanimousImprovement": all(votes)})
        total = len(pairs)
        un = sum(1 for p in pairs if p["unanimous"])
        uni = sum(1 for p in pairs if p["unanimousImprovement"])

        # 留一
        loo_tot = loo_ok = 0
        for p in pairs:
            for i in range(len(p["votes"])):
                rest = [v for j, v in enumerate(p["votes"]) if j != i]
                majority = sum(rest) * 2 > len(rest)
                loo_tot += 1
                loo_ok += int(majority == p["votes"][i])

        # 随机基线：同切分内重排分支结果
        rng = random.Random(PERMUTATION_SEED)
        perm_un, perm_loo = [], []
        for _ in range(PERMUTATIONS):
            shuffled = {}
            for wid, rows in windows.items():
                lists = [r["replicates"] for r in rows]
                perm = lists[:]
                rng.shuffle(perm)
                shuffled[wid] = [{**r, "replicates": perm[i]} for i, r in enumerate(rows)]
            p_un = p_tot = p_ok = p_ltot = 0
            for wid, rows in shuffled.items():
                student = next((r for r in rows if "student_actual" in r["roles"]), None)
                if student is None:
                    continue
                for row in rows:
                    if row is student or not pred(row, student):
                        continue
                    sb = {r["seed"]: r for r in student["replicates"]}
                    bb = {r["seed"]: r for r in row["replicates"]}
                    common = sorted(set(sb) & set(bb))
                    if len(common) < 3:
                        continue
                    votes = [better(score(bb[s]), score(sb[s])) for s in common]
                    p_tot += 1
                    p_un += int(all(votes) or not any(votes))
                    for i in range(len(votes)):
                        rest = [v for j, v in enumerate(votes) if j != i]
                        majority = sum(rest) * 2 > len(rest)
                        p_ltot += 1
                        p_ok += int(majority == votes[i])
            perm_un.append(p_un / max(1, p_tot))
            perm_loo.append(p_ok / max(1, p_ltot))
        perm_un.sort()
        perm_loo.sort()

        def pct(v, q):
            return v[min(len(v) - 1, int(q * len(v)))] if v else 0.0

        return {
            "pairs": total,
            "unanimous": un,
            "unanimousRate": (un / total) if total else None,
            "unanimousWilson95": [round(x, 4) for x in wilson(un, total)],
            "unanimousImprovement": uni,
            "looComparisons": loo_tot,
            "looAgreementRate": (loo_ok / loo_tot) if loo_tot else None,
            "looWilson95": [round(x, 4) for x in wilson(loo_ok, loo_tot)],
            "randomUnanimousP95": round(pct(perm_un, 0.95), 4),
            "randomLooP95": round(pct(perm_loo, 0.95), 4),
            "beatsRandom": bool(total and (un / total) > pct(perm_un, 0.95)),
        }

    def all_reached(branch, student) -> bool:
        return (all(r["stopReason"] in HORIZON_OK for r in branch["replicates"])
                and all(r["stopReason"] in HORIZON_OK for r in student["replicates"]))

    def any_terminal(branch, student) -> bool:
        return (any(r["naturalTerminal"] for r in branch["replicates"])
                or any(r["naturalTerminal"] for r in student["replicates"]))

    def not_annihilated(branch, student) -> bool:
        """窗口时刻还没被打光的局面：学生分支的所有 replicate 结束时己方仍有存活单位。"""
        return all(r["subjectAllianceAliveUnits"] > 0 for r in student["replicates"])

    def not_outnumbered(branch, student) -> bool:
        """窗口时刻兵力还没被压倒：己方存活单位数 >= 敌方存活单位数的 60%。"""
        return all(
            r["subjectAllianceAliveUnits"] >= 0.6 * max(1, r["enemyAllianceAliveUnits"])
            for r in student["replicates"]
        )

    def decisive_and_alive(branch, student) -> bool:
        return all_reached(branch, student) and not_annihilated(branch, student)

    slices = {
        "allPairs": lambda b, s: True,
        "bothReachedHorizon": all_reached,
        "anyNaturalTerminal": any_terminal,
        "bothReachedHorizonAndAnyTerminal": lambda b, s: all_reached(b, s) and any_terminal(b, s),
        "notAnnihilated": not_annihilated,
        "notOutnumbered": not_outnumbered,
        "bothReachedHorizonAndNotAnnihilated": decisive_and_alive,
    }
    report = {
        "schema": "v18_preference_failure_diagnosis_1",
        "runId": args.run_id,
        "pairMargin": PAIR_MARGIN,
        "slices": {name: eval_slice(pred) for name, pred in slices.items()},
        "reading": [
            "若 bothReachedHorizon 的一致率明显高于 allPairs 且超过随机 P95，说明主因是截断 ⇒ 该扩续弈预算。",
            "若各切分都没超过随机，说明该续弈合同下「首手差异」被固定续弈策略迅速抹平 ⇒ 该换证据来源，而不是扩数据。",
            "unanimousImprovement 计数很小说明：在这些已经失败的窗口里，几乎没有哪个候选动作能稳定改善结果。",
        ],
    }
    out = run / "counterfactual" / "preference_failure_diagnosis.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["slices"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
