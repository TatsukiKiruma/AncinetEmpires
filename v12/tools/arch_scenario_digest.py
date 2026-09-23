"""Compact per-scenario digest of Section A's winner_predictability.json.

No new measurement: it only re-formats already-measured per-scenario numbers so
they can be quoted in the report.

Usage: py -3.12 v12/tools/arch_scenario_digest.py
"""
from __future__ import annotations

import collections
import json

P = "v12/out/archive_value/winner_predictability.json"


def main() -> int:
    ps = json.load(open(P, encoding="utf-8"))["per_scenario"]
    ns = [v["n_episodes"] for v in ps.values()]
    print(f"n_scenarios={len(ps)}  total_episodes_with_winner={sum(ns)}")
    print(f"episodes-per-scenario distribution: {dict(sorted(collections.Counter(ns).items()))}")
    for thr in (1, 5, 10, 20):
        sel = {k: v for k, v in ps.items() if v["n_episodes"] >= thr}
        deg = [k for k, v in sel.items() if v["n_distinct_winners"] <= 2]
        one = [k for k, v in sel.items() if v["n_distinct_winners"] == 1]
        print(f"  n>={thr:<3}: scenarios={len(sel):<4} <=2 distinct winners={len(deg):<4} "
              f"exactly-1={len(one)}")

    print("\nmost degenerate (n>=10), sorted by distinct winners then n:")
    sel = sorted([kv for kv in ps.items() if kv[1]["n_episodes"] >= 10],
                 key=lambda kv: (kv[1]["n_distinct_winners"], -kv[1]["n_episodes"]))
    for k, v in sel[:14]:
        print(f"  {k[:56]:<56} sig={v['policy_signature']:<6} n={v['n_episodes']:>3} "
              f"dist={v['winner_distribution']} modalIS={v['modal_accuracy_insample']:.3f} "
              f"modalLOO={v['modal_accuracy_leave_one_out']:.3f} "
              f"polopt={v['policy_optimal_loo_accuracy']:.3f} rule={v['fixed_heuristic_rule_accuracy']:.3f} "
              f"chance={v['chance_1_over_n_alliances']:.3f}")

    print("\nleast predictable from the assignment (n>=10), by policy_optimal_loo:")
    sel2 = sorted([kv for kv in ps.items() if kv[1]["n_episodes"] >= 10],
                  key=lambda kv: kv[1]["policy_optimal_loo_accuracy"])
    for k, v in sel2[:10]:
        print(f"  {k[:56]:<56} sig={v['policy_signature']:<6} n={v['n_episodes']:>3} "
              f"dist={v['winner_distribution']} polopt={v['policy_optimal_loo_accuracy']:.3f} "
              f"modalLOO={v['modal_accuracy_leave_one_out']:.3f} "
              f"chance={v['chance_1_over_n_alliances']:.3f}")

    print("\npolicy signature vs policy_optimal_loo accuracy (n>=5 scenarios pooled):")
    bysig: dict[str, list] = collections.defaultdict(list)
    for k, v in ps.items():
        if v["n_episodes"] >= 5:
            bysig[v["policy_signature"]].append(v)
    for sig, vs in sorted(bysig.items()):
        n = sum(x["n_episodes"] for x in vs)
        wpo = sum(x["policy_optimal_loo_accuracy"] * x["n_episodes"] for x in vs) / n
        wch = sum(x["chance_1_over_n_alliances"] * x["n_episodes"] for x in vs) / n
        print(f"  {sig:<8} scenarios={len(vs):<4} episodes={n:<5} "
              f"policy_optimal_loo={wpo:.4f}  chance={wch:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
