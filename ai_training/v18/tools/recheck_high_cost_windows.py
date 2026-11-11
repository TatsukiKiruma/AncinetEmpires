"""V18/T18-03：复核 T18-02 的 12 个「高代价失误窗口」是不是**选择偏差产物**。

T18-02 的窗口级判据是：在 ~6 个分支里取「平均净歼灭最大」的那个，再和学生比。
对 3 个噪声 replicate 取平均、再在 6 个分支里取最大，会产生**最大值选择偏差**：
即使所有分支同分布，也总会有一个看起来明显更好。

本脚本对同一批数据做**成对、逐 seed** 的复核：
对每个被判为 highCostError 的窗口，取它的 best 分支，检查该分支在 3 个 seed 上
是否**每一个都**优于学生（逐 seed 成对判据，margin=0.5）。

- 若多数窗口并不满足逐 seed 一致 ⇒ 原来的 highCostError 是噪声，不是可靠失误；
- 并给出「随机重排后仍能复现同样多 highCostError」的比例，量化选择偏差。

用法：
    python v18/tools/recheck_high_cost_windows.py --run-id run_20260927_v18_01
"""
from __future__ import annotations

import argparse
import collections
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAIR_MARGIN = 0.5
PERMUTATIONS = 400
PERMUTATION_SEED = 20260999


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if text:
                yield json.loads(text)


def rep_score(rep: dict) -> tuple[int, float]:
    return (1 if rep["viewedOutcome"] == "NATURAL_WIN" else 0,
            float(rep["unitsKilledBySubject"] - rep["unitsLostBySubject"]))


def better(a, b, margin=PAIR_MARGIN) -> bool:
    if a[0] != b[0]:
        return a[0] > b[0]
    return (a[1] - b[1]) >= margin


def window_high_cost(rows: list[dict]) -> tuple[bool, str | None]:
    """复现 T18-02 的窗口级判据（预登记口径）。"""
    student = next((r for r in rows if "student_actual" in r["roles"]), None)
    if student is None:
        return False, None
    s_wins = sum(1 for r in student["replicates"] if r["viewedOutcome"] == "NATURAL_WIN")
    s_net = sum(r["unitsKilledBySubject"] - r["unitsLostBySubject"] for r in student["replicates"]) / len(student["replicates"])
    best_code = None
    best_key = None
    for row in rows:
        if row is student:
            continue
        wins = sum(1 for r in row["replicates"] if r["viewedOutcome"] == "NATURAL_WIN")
        net = sum(r["unitsKilledBySubject"] - r["unitsLostBySubject"] for r in row["replicates"]) / len(row["replicates"])
        key = (wins, net)
        if best_key is None or key > best_key:
            best_key = key
            best_code = row["actionCode"]
    if best_key is None:
        return False, None
    high = (best_key[0] > s_wins) or (best_key[0] == s_wins and (best_key[1] - s_net) >= 1.0)
    return high, best_code


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id
    path = run / "counterfactual" / "paired_continuation.branches.jsonl"

    windows: dict[str, list[dict]] = collections.OrderedDict()
    for row in iter_jsonl(path):
        windows.setdefault(row["windowId"], []).append(row)

    high_windows = []
    for wid, rows in windows.items():
        high, best_code = window_high_cost(rows)
        if not high:
            continue
        student = next(r for r in rows if "student_actual" in r["roles"])
        best = next(r for r in rows if r["actionCode"] == best_code)
        sb = {r["seed"]: r for r in student["replicates"]}
        bb = {r["seed"]: r for r in best["replicates"]}
        common = sorted(set(sb) & set(bb))
        per_seed = [better(rep_score(bb[s]), rep_score(sb[s])) for s in common]
        high_windows.append({
            "windowId": wid,
            "bestActionCode": best_code,
            "bestRoles": best["roles"],
            "seeds": common,
            "perSeedPrefersBest": per_seed,
            "allSeedsPreferBest": all(per_seed),
            "anySeedPrefersBest": any(per_seed),
            "agreesAtPairLevel": all(per_seed),
        })

    # 随机基线：把分支结果在分支之间重排，看还能复现多少个窗口级 highCostError
    rng = random.Random(PERMUTATION_SEED)
    perm_counts = []
    for _ in range(PERMUTATIONS):
        count = 0
        for wid, rows in windows.items():
            lists = [r["replicates"] for r in rows]
            perm = lists[:]
            rng.shuffle(perm)
            shuffled = [{**r, "replicates": perm[i]} for i, r in enumerate(rows)]
            high, _ = window_high_cost(shuffled)
            count += int(high)
        perm_counts.append(count)
    perm_counts.sort()

    n = len(high_windows)
    confirmed = sum(1 for w in high_windows if w["agreesAtPairLevel"])
    report = {
        "schema": "v18_high_cost_recheck_1",
        "runId": args.run_id,
        "windowLevelHighCost": n,
        "pairLevelConfirmed": confirmed,
        "pairLevelConfirmedRate": (confirmed / n) if n else None,
        "randomBaselineHighCostCount": {
            "mean": sum(perm_counts) / len(perm_counts),
            "p50": perm_counts[len(perm_counts) // 2],
            "p95": perm_counts[min(len(perm_counts) - 1, int(0.95 * len(perm_counts)))],
            "max": max(perm_counts),
        },
        "windows": high_windows,
        "verdict": {
            "windowLevelCountIsWithinRandomRange": n <= perm_counts[min(len(perm_counts) - 1, int(0.95 * len(perm_counts)))],
            "meaning": (
                "若窗口级 highCostError 数量落在随机重排的分布内，说明该判据主要由"
                "「对 3 个噪声 replicate 取均值、再在多个分支里取最大」的选择偏差产生，"
                "不能当作可靠的高代价失误证据。"
            ),
        },
        "limits": [
            "逐 seed 成对判据仍然只在该续弈合同下有定义。",
            "确认率低不等于学生动作正确，只说明证据不足以支持「这些动作更差」。",
        ],
    }
    out = run / "counterfactual" / "high_cost_recheck.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "windowLevelHighCost": n,
        "pairLevelConfirmed": confirmed,
        "confirmedRate": report["pairLevelConfirmedRate"],
        "randomBaseline": report["randomBaselineHighCostCount"],
        "verdict": report["verdict"]["windowLevelCountIsWithinRandomRange"],
        "perWindow": [
            {"w": w["windowId"].split(":")[0], "best": w["bestActionCode"],
             "roles": w["bestRoles"], "perSeed": w["perSeedPrefersBest"]}
            for w in high_windows
        ],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
