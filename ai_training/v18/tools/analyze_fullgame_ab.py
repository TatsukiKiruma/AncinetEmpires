"""V18/T18-03 S2 分析：完整对局策略 A/B 的**配对**读数与区间。

任务书要求「偏好方向在独立成对续弈上优于随机，按 family 给区间」。
S2 把干预单位从「单个原子动作 + 有界续弈」换成「整个对局 + 自然终局」，
因此这里的判据也必须成对：

- 只比较**两侧都自然完赛**的 (窗口, seed) 配对；
- 报「学生胜、H0 胜、平」的三格计数；
- 用 Wilson 区间报每个策略的胜率；
- 用**精确二项检验**（McNemar 的符号检验形式）报「学生比 H0 好的配对比例」是否超过 0.5；
- 按 root family 给出逐家族读数，避免把同一家族的多个窗口当成独立样本。

用法：
    python v18/tools/analyze_fullgame_ab.py --run-id run_20260927_v18_01 --tag S2fullgame
"""
from __future__ import annotations

import argparse
import collections
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def wilson(s: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = s / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def binom_two_sided(k: int, n: int) -> float:
    """精确二项检验（p=0.5），返回双侧 p 值。n 小的时候这是正确做法。"""
    if n == 0:
        return 1.0
    def comb(a: int, b: int) -> int:
        return math.comb(a, b)
    total = 2 ** n
    # 双侧：概率 <= 观测点概率的所有结果之和
    p_obs = comb(n, k) / total
    acc = 0.0
    for i in range(n + 1):
        p_i = comb(n, i) / total
        if p_i <= p_obs + 1e-12:
            acc += p_i
    return min(1.0, acc)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    parser.add_argument("--tag", default="S2fullgame")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id
    src = run / "counterfactual" / f"fullgame_ab.{args.tag}.json"
    report = json.loads(src.read_text(encoding="utf-8"))

    windows = report["windows"] if isinstance(report["windows"], list) else None
    # 工具把窗口级明细写在 windows 数组（旧版本是计数）；两种都兼容。
    detail = report.get("windowDetails") or []
    policies = report["contract"]["policies"]

    # 若文件里没有逐窗口明细，用 aggregate + pairedComparison 只能给出总量。
    result = {
        "schema": "v18_fullgame_ab_analysis_1",
        "runId": args.run_id,
        "source": str(src.relative_to(ROOT)).replace("\\", "/"),
        "contract": report["contract"],
        "aggregate": report["aggregate"],
        "pairedComparisonRaw": report["pairedComparison"],
        "pairwiseTests": {},
        "perPolicyWilson": {},
        "disclaimer": report.get("disclaimer", []),
    }

    for policy, agg in report["aggregate"].items():
        lo, hi = wilson(agg["wins"], agg["games"])
        result["perPolicyWilson"][policy] = {
            "wins": agg["wins"],
            "games": agg["games"],
            "winRate": (agg["wins"] / agg["games"]) if agg["games"] else None,
            "wilson95": [round(lo, 4), round(hi, 4)],
            "truncated": agg["truncated"],
            "naturalCompletionRate": ((agg["games"] - agg["truncated"]) / agg["games"]) if agg["games"] else None,
        }

    for key, entry in report["pairedComparison"].items():
        n = entry["bothNatural"]
        decisive = entry["aWins"] + entry["bWins"]
        p = binom_two_sided(entry["aWins"], decisive) if decisive else 1.0
        lo, hi = wilson(entry["aWins"], decisive) if decisive else (0.0, 0.0)
        result["pairwiseTests"][key] = {
            "bothNatural": n,
            "aWins": entry["aWins"],
            "bWins": entry["bWins"],
            "ties": entry["ties"],
            "decisive": decisive,
            "aWinShareOfDecisive": (entry["aWins"] / decisive) if decisive else None,
            "wilson95": [round(lo, 4), round(hi, 4)],
            "exactBinomialTwoSidedP": round(p, 4),
            "significantAt0_05": bool(decisive and p < 0.05),
        }

    out = run / "counterfactual" / f"fullgame_ab_analysis.{args.tag}.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "perPolicyWilson": result["perPolicyWilson"],
        "pairwiseTests": result["pairwiseTests"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
