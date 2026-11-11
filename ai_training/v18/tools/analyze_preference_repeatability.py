"""V18/T18-03：成对续弈偏好的**可重复性**检验。

任务书 T18-03 要求：
  > 先用 40 个窗口验证局部改进是否可重复；通过后再扩到 >=1,000 个不同输入的可靠偏好/改进样本。
  > 验收：偏好方向在独立成对续弈上优于随机，按 family 给区间。

本脚本只用已有的 `paired_continuation.branches.jsonl`（48 窗口 × 3 续弈 seed），回答三件事：

1. **同 seed 内部**：同一窗口同一分支对，3 个 seed 是否给出一致方向？
2. **跨 seed 泛化（留一法）**：用 1 个 seed 决定方向、用另外 2 个 seed 检验，
   一致率是否显著高于随机基线？
3. **按 family 的区间**：每个 root family 的一致率与 Wilson 区间。

随机基线怎么来：把同一窗口内各分支的 replicate 结果**在分支之间随机重排**
（保留该分支真实的 3 个 replicate，只打乱「哪个分支拿到哪一组结果」），
重复 N 次，得到「零假设下的一致率」。这控制了窗口难度与 replicate 数量。

方向定义（与预登记一致）：
  分支 b 优于学生 s  ⇔  naturalWins(b) > naturalWins(s)
                      或 (naturalWins 相同 且 net(b) - net(s) >= 0.5)
其中 net = meanUnitsKilled - meanUnitsLost。
注意 0.5 是**这里更严格的成对判据**；预登记的窗口级 highCost 判据用的是 1.0。

用法：
    python v18/tools/analyze_preference_repeatability.py --run-id run_20260927_v18_01
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


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if text:
                yield json.loads(text)


def branch_score(replicate: dict) -> tuple[int, float]:
    wins = 1 if replicate["viewedOutcome"] == "NATURAL_WIN" else 0
    net = replicate["unitsKilledBySubject"] - replicate["unitsLostBySubject"]
    return wins, float(net)


def better(a: tuple[int, float], b: tuple[int, float], margin: float = PAIR_MARGIN) -> bool:
    """a 是否优于 b。"""
    if a[0] != b[0]:
        return a[0] > b[0]
    return (a[1] - b[1]) >= margin


def wilson(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    if total == 0:
        return (0.0, 0.0)
    p = successes / total
    denom = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denom
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denom
    return (max(0.0, center - half), min(1.0, center + half))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    parser.add_argument(
        "--branches",
        default=None,
        help="成对续弈产物路径；缺省用 S0 的 paired_continuation.branches.jsonl。"
             "S1/S2 必须用同一个判据，只换输入文件。",
    )
    parser.add_argument("--out-name", default="preference_repeatability.json")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id
    branches_path = Path(args.branches) if args.branches else run / "counterfactual" / "paired_continuation.branches.jsonl"

    # windowId -> list of {actionCode, roles, replicates}
    windows: dict[str, list[dict]] = collections.OrderedDict()
    meta: dict[str, dict] = {}
    for row in iter_jsonl(branches_path):
        wid = row["windowId"]
        windows.setdefault(wid, []).append(row)
        meta[wid] = {"mapName": row["mapName"], "phaseBucket": row["phaseBucket"], "kinds": row["windowKind"]}

    seeds = sorted({rep["seed"] for rows in windows.values() for r in rows for rep in r["replicates"]})
    if len(seeds) < 2:
        raise SystemExit("[repeatability] 需要至少 2 个续弈 seed 才能做留一检验。")

    # ---------------- 1) 同 seed 内部方向一致性 ----------------
    pair_rows: list[dict] = []
    for wid, rows in windows.items():
        student = next((r for r in rows if "student_actual" in r["roles"]), None)
        if student is None:
            continue
        by_seed_student = {rep["seed"]: rep for rep in student["replicates"]}
        for row in rows:
            if row is student:
                continue
            by_seed_branch = {rep["seed"]: rep for rep in row["replicates"]}
            common = sorted(set(by_seed_student) & set(by_seed_branch))
            if not common:
                continue
            votes = []
            for seed in common:
                votes.append(better(branch_score(by_seed_branch[seed]), branch_score(by_seed_student[seed])))
            pair_rows.append({
                "windowId": wid,
                "actionCode": row["actionCode"],
                "roles": row["roles"],
                "seeds": common,
                "votes": votes,
                "prefersBranch": sum(votes),
                "n": len(votes),
                "unanimous": all(votes) or not any(votes),
                "unanimousImprovement": all(votes),
                "unanimousDegradation": not any(votes),
                "mapName": meta[wid]["mapName"],
                "phaseBucket": meta[wid]["phaseBucket"],
                "kinds": meta[wid]["kinds"],
            })

    total_pairs = len(pair_rows)
    unanimous = sum(1 for r in pair_rows if r["unanimous"])
    unanimous_improve = sum(1 for r in pair_rows if r["unanimousImprovement"])
    unanimous_degrade = sum(1 for r in pair_rows if r["unanimousDegradation"])

    # ---------------- 2) 留一跨 seed 检验 ----------------
    loo_total = 0
    loo_agree = 0
    loo_rows: list[dict] = []
    for wid, rows in windows.items():
        student = next((r for r in rows if "student_actual" in r["roles"]), None)
        if student is None:
            continue
        by_seed_student = {rep["seed"]: rep for rep in student["replicates"]}
        for row in rows:
            if row is student:
                continue
            by_seed_branch = {rep["seed"]: rep for rep in row["replicates"]}
            common = sorted(set(by_seed_student) & set(by_seed_branch))
            if len(common) < 3:
                continue
            for held in common:
                train_seeds = [s for s in common if s != held]
                vote_train = [better(branch_score(by_seed_branch[s]), branch_score(by_seed_student[s])) for s in train_seeds]
                majority = sum(vote_train) * 2 > len(vote_train)
                test = better(branch_score(by_seed_branch[held]), branch_score(by_seed_student[held]))
                loo_total += 1
                loo_agree += int(majority == test)
                loo_rows.append({"windowId": wid, "heldSeed": held, "majority": majority, "test": test,
                                 "agree": majority == test})

    # ---------------- 3) 随机基线（分支内重排）----------------
    rng = random.Random(PERMUTATION_SEED)
    perm_unanimous = []
    perm_loo_agree = []
    for _ in range(PERMUTATIONS):
        # 对每个窗口，把「分支 -> replicate 列表」整体重排
        shuffled: dict[str, list[dict]] = {}
        for wid, rows in windows.items():
            lists = [r["replicates"] for r in rows]
            perm = lists[:]
            rng.shuffle(perm)
            shuffled[wid] = [{**r, "replicates": perm[i]} for i, r in enumerate(rows)]

        p_un = 0
        p_tot = 0
        p_loo_ok = 0
        p_loo_tot = 0
        for wid, rows in shuffled.items():
            student = next((r for r in rows if "student_actual" in r["roles"]), None)
            if student is None:
                continue
            by_seed_student = {rep["seed"]: rep for rep in student["replicates"]}
            for row in rows:
                if row is student:
                    continue
                by_seed_branch = {rep["seed"]: rep for rep in row["replicates"]}
                common = sorted(set(by_seed_student) & set(by_seed_branch))
                if not common:
                    continue
                votes = [better(branch_score(by_seed_branch[s]), branch_score(by_seed_student[s])) for s in common]
                p_tot += 1
                p_un += int(all(votes) or not any(votes))
                if len(common) >= 3:
                    for held in common:
                        train_seeds = [s for s in common if s != held]
                        vote_train = [better(branch_score(by_seed_branch[s]), branch_score(by_seed_student[s])) for s in train_seeds]
                        majority = sum(vote_train) * 2 > len(vote_train)
                        test = better(branch_score(by_seed_branch[held]), branch_score(by_seed_student[held]))
                        p_loo_tot += 1
                        p_loo_ok += int(majority == test)
        perm_unanimous.append(p_un / max(1, p_tot))
        perm_loo_agree.append(p_loo_ok / max(1, p_loo_tot))

    perm_unanimous.sort()
    perm_loo_agree.sort()

    def pct(values: list[float], q: float) -> float:
        if not values:
            return 0.0
        return values[min(len(values) - 1, int(q * len(values)))]

    # ---------------- 4) 按 family 的区间 ----------------
    by_family = collections.defaultdict(lambda: {"pairs": 0, "unanimous": 0})
    for row in pair_rows:
        fam = row["windowId"].split(":", 1)[1].rsplit("|", 1)[0]
        by_family[fam]["pairs"] += 1
        by_family[fam]["unanimous"] += int(row["unanimous"])
    family_rows = []
    for fam, stats in sorted(by_family.items()):
        lo, hi = wilson(stats["unanimous"], stats["pairs"])
        family_rows.append({
            "family": fam,
            "pairs": stats["pairs"],
            "unanimous": stats["unanimous"],
            "rate": stats["unanimous"] / stats["pairs"] if stats["pairs"] else None,
            "wilson95": [round(lo, 4), round(hi, 4)],
        })

    observed_unanimous_rate = unanimous / max(1, total_pairs)
    observed_loo_rate = loo_agree / max(1, loo_total)
    lo, hi = wilson(unanimous, total_pairs)
    loo_lo, loo_hi = wilson(loo_agree, loo_total)

    report = {
        "schema": "v18_preference_repeatability_1",
        "runId": args.run_id,
        "source": str(branches_path.relative_to(ROOT)).replace("\\", "/") if branches_path.is_absolute() else str(branches_path),
        "contract": {
            "pairMargin": PAIR_MARGIN,
            "directionRule": "naturalWins 更多，或 naturalWins 相同且净歼灭差 >= margin",
            "seeds": seeds,
            "permutations": PERMUTATIONS,
            "permutationSeed": PERMUTATION_SEED,
            "nullHypothesis": "同一窗口内各分支的 replicate 结果在分支之间随机重排（保留窗口难度与 replicate 数）",
        },
        "pairLevel": {
            "windows": len(windows),
            "pairs": total_pairs,
            "unanimous": unanimous,
            "unanimousRate": observed_unanimous_rate,
            "unanimousWilson95": [round(lo, 4), round(hi, 4)],
            "unanimousImprovement": unanimous_improve,
            "unanimousDegradation": unanimous_degrade,
            "mixed": total_pairs - unanimous,
        },
        "leaveOneSeedOut": {
            "comparisons": loo_total,
            "agreements": loo_agree,
            "agreementRate": observed_loo_rate,
            "agreementWilson95": [round(loo_lo, 4), round(loo_hi, 4)],
        },
        "randomBaseline": {
            "unanimousRateMean": sum(perm_unanimous) / len(perm_unanimous),
            "unanimousRateP95": pct(perm_unanimous, 0.95),
            "unanimousRateMax": max(perm_unanimous),
            "looAgreementMean": sum(perm_loo_agree) / len(perm_loo_agree),
            "looAgreementP95": pct(perm_loo_agree, 0.95),
            "looAgreementMax": max(perm_loo_agree),
        },
        "byFamily": family_rows,
        "verdict": {
            "unanimityBeatsRandom": observed_unanimous_rate > pct(perm_unanimous, 0.95),
            "looBeatsRandom": observed_loo_rate > pct(perm_loo_agree, 0.95),
            "reliablePairsAvailable": unanimous,
        },
        "limits": [
            "偏好方向只在「续弈策略 = H0、边界 = 一个己方阶段 + 一个敌方阶段、<=256 转换」下成立。",
            "截断分支的净歼灭是有界观测，不是真实 Q；本检验只用它做**成对比较**。",
            "一致性高于随机只说明该续弈合同下方向可重复，不等于动作在完整对局里更优。",
            "48 个窗口来自分层随机抽样，不是失败决策全集。",
        ],
    }
    out = run / "counterfactual" / args.out_name
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    pairs_name = args.out_name.replace(".json", ".pairs.jsonl")
    with (run / "counterfactual" / pairs_name).open("w", encoding="utf-8") as sink:
        for row in pair_rows:
            sink.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(json.dumps({
        "windows": len(windows),
        "pairs": total_pairs,
        "unanimous": unanimous,
        "unanimousRate": round(observed_unanimous_rate, 4),
        "unanimousWilson95": report["pairLevel"]["unanimousWilson95"],
        "unanimousImprovement": unanimous_improve,
        "unanimousDegradation": unanimous_degrade,
        "looAgreementRate": round(observed_loo_rate, 4),
        "looWilson95": report["leaveOneSeedOut"]["agreementWilson95"],
        "randomUnanimousP95": round(pct(perm_unanimous, 0.95), 4),
        "randomLooP95": round(pct(perm_loo_agree, 0.95), 4),
        "verdict": report["verdict"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
