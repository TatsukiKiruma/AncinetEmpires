"""Final verification of the TASK 2 deliverables.

1. every deliverable JSON parses
2. the derived-arithmetic cells quoted in TASK2_report.md really follow from the
   measured integers stored in those JSONs

Usage: py -3.12 v12/tools/arch_verify_report.py
"""
from __future__ import annotations

import json
import os

D = "v12/out/archive_value"
FILES = ["winner_predictability.json", "value_ceiling.json", "imitation_mix.json",
         "episode_index.json"]


def main() -> int:
    docs = {}
    for f in FILES:
        p = os.path.join(D, f)
        docs[f] = json.load(open(p, encoding="utf-8"))
        print(f"OK parse  {f:<28} {os.path.getsize(p):>12,} bytes")
    print()

    a = docs["winner_predictability.json"]
    b = docs["value_ceiling.json"]
    c = docs["imitation_mix.json"]

    checks: list[tuple[str, object, object]] = []
    at = a["terminal_label"]
    lp = a["label_provenance"]
    st = a["assignment_structure"]

    # --- section A derived arithmetic
    checks.append(("A: 131/1003 = 13.06%",
                   round(100 * 131 / 1003, 2), at["A4_informative_episodes"]["pct_loo"]))
    checks.append(("A: 392/1395 = 28.10%",
                   round(100 * 392 / 1395, 4), lp["pct_null_winner"]))
    checks.append(("A: 489/1003 = 48.75% ambiguous",
                   round(100 * at["A1a_fixed_rule"]["n_ambiguous_episodes"] / 1003, 2), 48.75))
    heur_seat = st["seat_policy_counts"]["heuristic"]
    apk_seat = st["seat_policy_counts"]["apk-like"]
    checks.append(("A: heuristic seat win rate 755/2094",
                   round(755 / heur_seat, 4), 0.3606))
    checks.append(("A: apk seat win rate 248/2126",
                   round(248 / apk_seat, 4), 0.1167))
    checks.append(("A: seat advantage ratio",
                   round((755 / heur_seat) / (248 / apk_seat), 2), 3.09))

    # --- section B derived arithmetic
    vt = b["B1_valueTarget_distribution"]
    checks.append(("B: 28229/48714 = 57.95%",
                   round(100 * vt["n_plus1"] / vt["n_rows"], 2), 57.95))
    checks.append(("B: 13519/48714 = 27.75%",
                   round(100 * vt["n_null"] / vt["n_rows"], 2), 27.75))
    checks.append(("B: I(Y;policy)/H(Y)",
                   round(100 * b["B4_information"]["I_valueTarget_policy_bits"] /
                         b["B4_information"]["H_valueTarget_bits_all_rows"], 1), 41.3))
    checks.append(("B: I(Y;root)/H(Y)",
                   round(100 * b["B4_information"]["I_valueTarget_rootFamilyId_bits"] /
                         b["B4_information"]["H_valueTarget_bits_all_rows"], 1), 63.7))
    checks.append(("B: 37/1395 episodes = 2.65%",
                   round(100 * b["B10_effective_sample_size"]["n_distinct_rootFamilyId_episodes"]
                         / 1395, 2), 2.65))
    checks.append(("B: rows per independent label",
                   round(b["B10_effective_sample_size"]["n_rows"] /
                         b["B10_effective_sample_size"]["independent_label_count"], 2), 573.11))

    # --- section C derived arithmetic
    r = c["C4_recruit_vs_attack_conditional_on_legality"]
    for pol, key in (("heuristic", "heuristic"), ("apk-like", "apk-like")):
        rc = r[key]["raw_counts"]
        n_rec_not_atk = rc["n_recruit_legal"] - rc["n_both_legal"]
        chosen = rc["chose_recruit"] - rc["chose_recruit_given_both"]
        checks.append((f"C: {pol} recruit|legal-and-not-attack-legal",
                       round(100 * chosen / n_rec_not_atk, 2),
                       23.47 if pol == "heuristic" else 19.86))
        n_atk_not_rec = rc["n_attack_legal"] - rc["n_both_legal"]
        chosen_a = rc["chose_attack"] - rc["chose_attack_given_both"]
        checks.append((f"C: {pol} attack|legal-and-not-recruit-legal",
                       round(100 * chosen_a / n_atk_not_rec, 2),
                       45.10 if pol == "heuristic" else 34.69))
    checks.append(("C: apk chose_recruit_given_both is EXACTLY 0",
                   r["apk-like"]["raw_counts"]["chose_recruit_given_both"], 0))
    checks.append(("C: apk n_both_legal",
                   r["apk-like"]["raw_counts"]["n_both_legal"], 6815))
    checks.append(("C: heuristic recruit|both = 644/5556",
                   round(100 * r["heuristic"]["raw_counts"]["chose_recruit_given_both"] /
                         r["heuristic"]["raw_counts"]["n_both_legal"], 4), 11.5911))
    c5 = c["C5_outcome_conditioned_filtering"]["winner_side_row_share_by_policy"]
    checks.append(("C: winner-side heuristic share",
                   round(100 * c5["heuristic"], 2), 72.92))
    checks.append(("C: winner-side apk share", round(100 * c5["apk-like"], 2), 27.08))

    bad = 0
    print(f"{'check':<52} {'computed':>12} {'in report':>12}  ok")
    for name, got, want in checks:
        ok = abs(float(got) - float(want)) < 0.02
        bad += 0 if ok else 1
        print(f"{name:<52} {got!s:>12} {want!s:>12}  {'OK' if ok else 'MISMATCH'}")
    print()
    print(f"checks={len(checks)} mismatches={bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
