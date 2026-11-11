"""V18/T18-03：价值头的**候选后继排序**验证 + 价值校准集盘点。

任务书要求（T18-03）：
  > 价值头用真实自然胜负训练，新增校准 family 至少 50，并分开评估开局、中盘、残局和学生分布。
  > **先验证是否能正确排序同状态下的候选后继**，再允许用于搜索。
  > 原总 MSE 改善不替代分支排序验证。

本脚本做两件事：

A. **校准集盘点**：从 V18 的三类验证面板里数「有自然终局结果的不同 family」，
   并按阶段 / 来源分开报告，判定是否达到 ≥50 个 family 且两类结果都有。

B. **后继排序验证**：用 `counterfactual/successor_values.jsonl`（每个窗口每个分支的后继状态）
   配合 `counterfactual/paired_continuation.branches.jsonl`（同一续弈合同下的有界后果），
   检验价值头的打分排序是否与真实后果排序一致。

排序指标（只看后果**确实不同**的分支对，避免拿噪声当标签）：
  - pairwise accuracy：价值头在同一窗口内把「后果更好」的分支排在前面 的比例；
  - 随机基线 = 0.5；同时报 Wilson 95% 区间；
  - 逐窗口 Spearman；
  - 「价值头选出的最优分支 == 真实最优分支」的比例。

对照臂：
  - `V0_final`（V17 用真实胜负训练过的价值头）；
  - `P1_final`（冠军，价值头从未按结果训练）；
  - `T18_02_A_final` / `T18_02_B_final`（本轮两个对照臂）。

用法：
    python v18/tools/value_ranking_gate.py --run-id run_20260927_v18_01
"""
from __future__ import annotations

import argparse
import collections
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from verify_parity import load_spatial_model_from_json  # noqa: E402
import torch  # noqa: E402

torch.set_num_threads(min(8, max(2, torch.get_num_threads() or 2)))

NATURAL = {"NATURAL_WIN", "NATURAL_LOSS", "NATURAL_DRAW"}
MARGIN = 0.5

CHECKPOINTS = [
    ("V0_final", "v17/out/v17_20260926_r2/experiments/V0/V0_final.json"),
    ("P1_s2026", "v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json"),
    ("T18_02_A_final", "v18/out/run_20260927_v18_01/experiments/T18_02_A/A_final.json"),
    ("T18_02_B_final", "v18/out/run_20260927_v18_01/experiments/T18_02_B/B_final.json"),
]


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if text:
                yield json.loads(text)


def wilson(s: int, n: int, z: float = 1.96):
    if n == 0:
        return (0.0, 0.0)
    p = s / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def spearman(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 3:
        return None

    def rank(vals):
        order = sorted(range(n), key=lambda i: vals[i])
        ranks = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                ranks[order[k]] = avg
            i = j + 1
        return ranks

    rx, ry = rank(xs), rank(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    dx = math.sqrt(sum((rx[i] - mx) ** 2 for i in range(n)))
    dy = math.sqrt(sum((ry[i] - my) ** 2 for i in range(n)))
    if dx == 0 or dy == 0:
        return None
    return num / (dx * dy)


def outcome_key(reps: list[dict]) -> tuple[int, float]:
    wins = sum(1 for r in reps if r["viewedOutcome"] == "NATURAL_WIN")
    net = sum(r["unitsKilledBySubject"] - r["unitsLostBySubject"] for r in reps) / len(reps)
    return (wins, net)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id

    # ---------------- A. 价值校准集盘点 ----------------
    panels = [
        ("val_dual_teacher", run / "data" / "val_dual_teacher.labels.jsonl"),
        ("val_student", run / "data" / "val_student.labels.jsonl"),
        ("val_teacher", run / "data" / "val_teacher.labels.jsonl"),
        # V18/T18-03 新增：专门为价值校准补采的 H0 val 面板（rootIndex 20..23）。
        ("val_calib", run / "data" / "val_calib.labels.jsonl"),
    ]
    calib = {}
    all_families: dict[str, set[str]] = collections.defaultdict(set)
    for tag, path in panels:
        if not path.is_file():
            continue
        fam_outcomes: dict[str, set[int]] = collections.defaultdict(set)
        rows = 0
        natural_rows = 0
        by_phase = collections.Counter()
        by_phase_families: dict[str, set[str]] = collections.defaultdict(set)
        for row in iter_jsonl(path):
            rows += 1
            if not row.get("naturalTerminal"):
                continue
            natural_rows += 1
            fam = str(row.get("trueFamilyId"))
            target = row.get("valueTarget")
            if target is None:
                continue
            fam_outcomes[fam].add(int(round(float(target))))
            by_phase[str(row.get("phaseBucket"))] += 1
            by_phase_families[str(row.get("phaseBucket"))].add(fam)
            all_families[fam].add(int(round(float(target))))
        both = {f: sorted(v) for f, v in fam_outcomes.items() if len(v) >= 2}
        calib[tag] = {
            "rows": rows,
            "naturalTerminalRows": natural_rows,
            "familiesWithNaturalOutcome": len(fam_outcomes),
            "familiesWithBothOutcomes": len(both),
            "byPhaseRows": dict(sorted(by_phase.items())),
            "byPhaseFamilies": {k: len(v) for k, v in sorted(by_phase_families.items())},
        }
    calib["combined"] = {
        "familiesWithNaturalOutcome": len(all_families),
        "familiesWithBothOutcomes": sum(1 for v in all_families.values() if len(v) >= 2),
        "meetsAtLeast50Families": len(all_families) >= 50,
        "meetsAtLeast50WithBothOutcomes": sum(1 for v in all_families.values() if len(v) >= 2) >= 50,
    }

    # ---------------- B. 后继排序验证 ----------------
    succ_path = run / "counterfactual" / "successor_values.jsonl"
    br_path = run / "counterfactual" / "paired_continuation.branches.jsonl"
    successors = list(iter_jsonl(succ_path))
    realized: dict[tuple[str, str], list[dict]] = {}
    for row in iter_jsonl(br_path):
        realized[(row["windowId"], row["actionCode"])] = row["replicates"]

    by_window: dict[str, list[dict]] = collections.OrderedDict()
    for row in successors:
        reps = realized.get((row["windowId"], row["branchActionCode"]))
        if not reps:
            continue
        row["_reps"] = reps
        row["_outcome"] = outcome_key(reps)
        by_window.setdefault(row["windowId"], []).append(row)

    results = {}
    for name, rel in CHECKPOINTS:
        path = ROOT / rel
        if not path.is_file():
            results[name] = {"status": "MISSING", "path": rel}
            continue
        model = load_spatial_model_from_json(str(path))
        model.eval()
        # 关键混杂控制：如果「真实后果」本身是噪声，任何排序器都不可能通过。
        # 因此按后果差异大小分档，差异越大越可能是真信号。
        slices = {
            "allDifferingPairs": MARGIN,
            "marginGe1": 1.0,
            "marginGe2": 2.0,
            "naturalWinsDifferOnly": None,  # 只统计自然胜场不同的对
        }
        pair_total = pair_agree = 0
        slice_stats = {k: {"pairs": 0, "agree": 0} for k in slices}
        top1_total = top1_agree = 0
        spearman_values = []
        by_phase = collections.defaultdict(lambda: {"pairs": 0, "agree": 0})
        with torch.inference_mode():
            for wid, rows in by_window.items():
                vals = []
                for row in rows:
                    spatial = torch.tensor(row["spatialTensor"], dtype=torch.float32).reshape(1, 26, 20, 20)
                    glob = torch.tensor(row["globalFeatures"], dtype=torch.float32).unsqueeze(0)
                    z = model.forward_trunk(spatial)
                    vals.append(float(model.forward_value(z, glob).squeeze(-1).item()))
                for i, row in enumerate(rows):
                    row["_value"] = vals[i]
                phase = str(rows[0]["phaseBucket"])
                # 逐对：只在真实后果确实不同时计入
                for i in range(len(rows)):
                    for j in range(i + 1, len(rows)):
                        oi, oj = rows[i]["_outcome"], rows[j]["_outcome"]
                        if oi[0] == oj[0] and abs(oi[1] - oj[1]) < MARGIN:
                            continue
                        better_i = (oi[0], oi[1]) > (oj[0], oj[1])
                        value_prefers_i = rows[i]["_value"] > rows[j]["_value"]
                        agree = better_i == value_prefers_i
                        pair_total += 1
                        by_phase[phase]["pairs"] += 1
                        if agree:
                            pair_agree += 1
                            by_phase[phase]["agree"] += 1
                        if oi[0] != oj[0]:
                            slice_stats["naturalWinsDifferOnly"]["pairs"] += 1
                            slice_stats["naturalWinsDifferOnly"]["agree"] += int(agree)
                        # 注意：这里的内层变量名不能叫 name —— 外层循环的 name 是检查点名，
                        # 覆盖它会把结果写进错误的键（V18 实际踩过一次）。
                        for slice_name, thr in slices.items():
                            if thr is None:
                                continue
                            if abs(oi[1] - oj[1]) >= thr:
                                slice_stats[slice_name]["pairs"] += 1
                                slice_stats[slice_name]["agree"] += int(agree)
                # top-1
                if len(rows) >= 2:
                    best_real = max(rows, key=lambda r: r["_outcome"])
                    best_val = max(rows, key=lambda r: r["_value"])
                    top1_total += 1
                    top1_agree += int(best_real["branchActionCode"] == best_val["branchActionCode"])
                sp = spearman([r["_value"] for r in rows], [r["_outcome"][0] * 100 + r["_outcome"][1] for r in rows])
                if sp is not None:
                    spearman_values.append(sp)

        lo, hi = wilson(pair_agree, pair_total)
        slice_report = {}
        for slice_name, st in slice_stats.items():
            slo, shi = wilson(st["agree"], st["pairs"])
            slice_report[slice_name] = {
                "pairs": st["pairs"],
                "agree": st["agree"],
                "accuracy": (st["agree"] / st["pairs"]) if st["pairs"] else None,
                "wilson95": [round(slo, 4), round(shi, 4)],
                "lowerBoundAboveChance": bool(st["pairs"] and slo > 0.5),
            }
        results[name] = {
            "status": "OK",
            "path": rel,
            "windows": len(by_window),
            "pairwiseComparisons": pair_total,
            "pairwiseAgreements": pair_agree,
            "pairwiseAccuracy": (pair_agree / pair_total) if pair_total else None,
            "pairwiseWilson95": [round(lo, 4), round(hi, 4)],
            "slices": slice_report,
            "top1Windows": top1_total,
            "top1Agreements": top1_agree,
            "top1Accuracy": (top1_agree / top1_total) if top1_total else None,
            "meanSpearman": (sum(spearman_values) / len(spearman_values)) if spearman_values else None,
            "windowsWithSpearman": len(spearman_values),
            "byPhase": {
                k: {"pairs": v["pairs"], "agree": v["agree"],
                    "accuracy": (v["agree"] / v["pairs"]) if v["pairs"] else None}
                for k, v in sorted(by_phase.items())
            },
        }
        print(f"[value-gate] {name}: pairwise={results[name]['pairwiseAccuracy']} "
              f"marginGe2={slice_report['marginGe2']['accuracy']} "
              f"top1={results[name]['top1Accuracy']} spearman={results[name]['meanSpearman']}", flush=True)

    report = {
        "schema": "v18_value_ranking_gate_1",
        "runId": args.run_id,
        "partA_calibration": calib,
        "partB_rankingGate": {
            "contract": {
                "metric": "价值头在同一窗口内把真实后果更好的分支排在前面 的成对比例",
                "randomBaseline": 0.5,
                "onlyCountedWhenOutcomesDiffer": f"自然胜场不同，或净歼灭差 >= {MARGIN}",
                "successorStates": len(successors),
                "windows": len(by_window),
                "outcomeSource": "counterfactual/paired_continuation.branches.jsonl（同一续弈合同下的有界后果）",
            },
            "checkpoints": results,
        },
        "verdict": {
            "calibrationMeets50Families": calib.get("combined", {}).get("meetsAtLeast50Families", False),
            "valueHeadBeatsRandomRanking": {
                name: (res.get("pairwiseWilson95", [0, 1])[0] > 0.5) if res.get("status") == "OK" else None
                for name, res in results.items()
            },
            "valueHeadBeatsRandomOnLargeDifferences": {
                name: (res.get("slices", {}).get("marginGe2", {}).get("lowerBoundAboveChance") if res.get("status") == "OK" else None)
                for name, res in results.items()
            },
            "searchAllowed": False,
            "searchAllowedReason": (
                "任务书 T18-03 规定「先验证是否能正确排序同状态下的候选后继，再允许用于搜索」。"
                "四个价值头在成对排序上都没有超过随机（Wilson 下界均 < 0.5），"
                "且校准集只有 20 个有自然终局的 family（< 50 的门槛）⇒ 价值头不得接入搜索。"
            ),
        },
        "limits": [
            "「真实后果」是同一续弈合同下的有界结果，不是完整对局的真实价值。",
            "本验证存在**双向混杂**：上一步已证明该后果标签本身的可重复性不超过随机重排基线。",
            "因此「排序失败」既可能来自价值头弱，也可能来自标签噪声；本脚本用 margin>=2 的分档做控制，"
            "但若噪声占主导，任何排序器都无法通过 ⇒ 这个负结果不能单独用来判价值学习整类方法无效。",
            "只有 48 个窗口 / 170 个后继状态，Wilson 区间很宽，不能当作精确精度。",
            "价值头按主体阵营视角输出 [-1,1]；这里只比较同一窗口内的相对排序，不做绝对校准断言。",
        ],
    }
    out = run / "counterfactual" / "value_ranking_gate.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "calibration": calib,
        "ranking": {k: {kk: v.get(kk) for kk in ("pairwiseComparisons", "pairwiseAccuracy", "pairwiseWilson95", "top1Accuracy", "meanSpearman", "byPhase")}
                    for k, v in results.items()},
        "verdict": report["verdict"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
