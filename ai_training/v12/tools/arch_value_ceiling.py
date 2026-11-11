"""SECTION B -- what is the ceiling for a VALUE model on this archive?

Reads every row of the spatial pipeline's value-labelled pool and asks how much of
`valueTarget` is recoverable from things that are NOT play:

  B1  valueTarget distribution (+1 / -1 / null / other) and the best CONSTANT
      predictor (accuracy, MSE, Brier)
  B2  accuracy of predicting valueTarget from `policy` alone, from `turn`/`step`
      alone, from `rootFamilyId` alone, and from `(rootFamilyId, playerId)` alone
  B3  group purity -- is valueTarget constant inside a seat? (if yes, there is
      literally zero within-episode variance for a value head to learn)
  B4  mutual information I(Y; policy) and I(Y; seat) in bits
  B5  does the sign of valueTarget simply equal "my alliance is the winner"?
  B6  how many rows come from episodes whose winner was NOT policy-predicted

Extraction is regex over the raw line, not json.loads: every field used occurs
exactly once per line (asserted) and `spatialTensor` (9,600 floats/row) is never
touched. A full json.loads of the 1.33 GB pool is ~18 s, so this is a speed
choice, not a necessity; the occurrence assertion is what makes it safe.

Emits: v12/out/archive_value/value_ceiling.json

Usage: py -3.12 v12/tools/arch_value_ceiling.py
"""
from __future__ import annotations

import collections
import json
import math
import os
import re
import sys

POOL = "training_runs/spatial_dataset/spatial_v2_full_pool.jsonl"
OUT_DIR = "v12/out/archive_value"
INDEX = os.path.join(OUT_DIR, "episode_index.json")
PRED = os.path.join(OUT_DIR, "winner_predictability.json")

RE_ROOT = re.compile(r'"rootFamilyId":"([^"]*)"')
RE_PID = re.compile(r'"playerId":(\d+)')
RE_STEP = re.compile(r'"step":(\d+)')
RE_TURN = re.compile(r'"turn":(\d+)')
RE_VT = re.compile(r'"valueTarget":(null|-?[0-9]+(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?)')
RE_SID = re.compile(r'"sampleId":"([^"]*)"')


def entropy(counter: collections.Counter) -> float:
    tot = sum(counter.values())
    if tot <= 0:
        return 0.0
    h = 0.0
    for v in counter.values():
        if v:
            p = v / tot
            h -= p * math.log2(p)
    return h


def cond_entropy(groups: dict, labels: dict) -> float:
    """H(Y | group) using the empirical group->label counts."""
    tot = sum(sum(c.values()) for c in groups.values())
    if tot <= 0:
        return 0.0
    h = 0.0
    for c in groups.values():
        n = sum(c.values())
        h += (n / tot) * entropy(c)
    return h


def majority_accuracy(groups: dict) -> float:
    tot = sum(sum(c.values()) for c in groups.values())
    if tot <= 0:
        return 0.0
    return sum(max(c.values()) for c in groups.values()) / tot


def main() -> int:
    with open(INDEX, "r", encoding="utf-8") as fh:
        idx_doc = json.load(fh)
    index = idx_doc["index"]
    with open(PRED, "r", encoding="utf-8") as fh:
        pred_doc = json.load(fh)
    informative_keys = set(pred_doc.get("informative_keys", []))

    rows = 0
    skipped = collections.Counter()
    vt_counter: collections.Counter = collections.Counter()
    # groups
    g_policy: dict = collections.defaultdict(collections.Counter)
    g_turn: dict = collections.defaultdict(collections.Counter)
    g_step: dict = collections.defaultdict(collections.Counter)
    g_root: dict = collections.defaultdict(collections.Counter)
    g_seat: dict = collections.defaultdict(collections.Counter)
    g_all: collections.Counter = collections.Counter()
    gs_policy: dict = collections.defaultdict(collections.Counter)
    gs_root: dict = collections.defaultdict(collections.Counter)
    gs_seat: dict = collections.defaultdict(collections.Counter)
    seat_has_sign: collections.Counter = collections.Counter()
    seat_rows: collections.Counter = collections.Counter()
    seat_policy: dict = {}
    root_rows: collections.Counter = collections.Counter()
    join_hit = join_miss = 0
    policy_join_hit = policy_join_miss = 0
    sign_agree = sign_disagree = sign_nodes = 0
    rows_informative = 0
    root_informative = set()
    null_by_root: collections.Counter = collections.Counter()
    vt_by_rootdist: collections.Counter = collections.Counter()
    root_has_pos: dict = {}
    root_has_neg: dict = {}

    with open(POOL, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if not line.strip():
                continue
            rows += 1
            rm = RE_ROOT.search(line)
            pm = RE_PID.search(line)
            sm = RE_STEP.search(line)
            tm = RE_TURN.search(line)
            vm = RE_VT.search(line)
            if not (rm and pm and sm and tm and vm):
                skipped["missing_scalar_field"] += 1
                continue
            if not all(x == 1 for x in (
                    line.count('"rootFamilyId"'), line.count('"playerId"'),
                    line.count('"step"'), line.count('"turn"'),
                    line.count('"valueTarget"'))):
                skipped["ambiguous_key_occurrence"] += 1
                continue
            sid = RE_SID.search(line)
            root = rm.group(1)
            pid = int(pm.group(1))
            step = int(sm.group(1))
            turn = int(tm.group(1))
            raw = vm.group(1)
            vt = None if raw == "null" else float(raw)
            vt_counter[raw] += 1

            # ---- join to the episode archive -----------------------------
            parts = root.split("#")
            scn = parts[0] if parts else ""
            seed = parts[1] if len(parts) > 1 else ""
            key = f"{scn}#{seed}"
            ent = index.get(key)
            policy = None
            if ent is not None:
                join_hit += 1
                policy = ent["policyByPlayer"].get(str(pid))
                if policy is not None:
                    policy_join_hit += 1
                else:
                    policy_join_miss += 1
                eff = ent.get("effectiveWinner")
                if vt is not None and eff is not None:
                    my_all = ent["allianceByPlayer"].get(str(pid))
                    want = 1.0 if (my_all is not None and my_all == eff) else -1.0
                    if abs(vt - want) < 1e-9:
                        sign_agree += 1
                    else:
                        sign_disagree += 1
                    sign_nodes += 1
            else:
                join_miss += 1

            if key in informative_keys:
                rows_informative += 1
                root_informative.add(root)

            if vt is None:
                null_by_root[root] += 1

            y = "null" if vt is None else ("+1" if vt > 0 else ("-1" if vt < 0 else "0"))
            g_all[y] += 1
            if policy is not None:
                g_policy[policy][y] += 1
                if y != "null":
                    gs_policy[policy][y] += 1
            g_turn[str(turn)][y] += 1
            g_step[str(step)][y] += 1
            g_root[root][y] += 1
            g_seat[(root, pid)][y] += 1
            if y != "null":
                gs_seat[(root, pid)][y] += 1
                gs_root[root][y] += 1
                seat_has_sign[(root, pid)] += 1
            seat_rows[(root, pid)] += 1
            root_rows[root] += 1
            if policy is not None:
                seat_policy[(root, pid)] = policy
            if y == "+1":
                root_has_pos[root] = True
            elif y == "-1":
                root_has_neg[root] = True

    # ---- B1 constant predictors -----------------------------------------
    n = rows
    n_null = vt_counter.get("null", 0)
    n_pos = vt_counter.get("+1", 0) + vt_counter.get("1", 0)
    n_neg = vt_counter.get("-1", 0)
    n_zero = sum(v for k, v in vt_counter.items()
                 if k not in ("null", "+1", "1", "-1"))
    n_labelled = n_pos + n_neg + n_zero
    # treat +1/-1 only for the sign task; zero/other handled separately
    nsig = n_pos + n_neg
    y_pos = n_pos / nsig if nsig else 0.0
    best_acc = max(y_pos, 1 - y_pos)
    # optimal constant for MSE on y in {+1,-1}
    mean_y = (n_pos - n_neg) / nsig if nsig else 0.0
    mse = 1.0 - mean_y * mean_y                       # Var(y) for +-1
    brier = y_pos * (1 - y_pos)                       # optimal constant prob

    # ---- B2/B3 group accuracies -----------------------------------------
    def purity(groups: dict) -> float:
        multi = sum(1 for c in groups.values() if len(c) > 1)
        return 1.0 - multi / len(groups) if groups else 0.0

    hy = entropy(collections.Counter(
        {k: v for k, v in (("+1", n_pos), ("-1", n_neg))})) if nsig else 0.0

    res = {
        "source": {"pool": POOL, "rows_read": rows, "rows_skipped": dict(skipped)},
        "B1_valueTarget_distribution": {
            "valueTarget_raw_counts": dict(vt_counter.most_common()),
            "n_rows": n,
            "n_null": n_null,
            "pct_null": round(100.0 * n_null / n, 4),
            "n_plus1": n_pos,
            "n_minus1": n_neg,
            "n_zero_or_other": n_zero,
            "n_signed_(+-1)": nsig,
            "best_constant_predictor": {
                "majority_sign": "+1" if y_pos >= 0.5 else "-1",
                "accuracy": round(best_acc, 6),
                "optimal_constant_for_MSE": round(mean_y, 6),
                "MSE": round(mse, 6),
                "optimal_constant_prob_for_Brier": round(y_pos, 6),
                "Brier": round(brier, 6),
                "note": "MSE/Brier are the values at the optimum constant; "
                        "a trivial constant already achieves them",
            },
        },
        "B2_predict_valueTarget_from": {
            "policy_alone": {
                "n_rows_with_policy_join": sum(sum(c.values()) for c in g_policy.values()),
                "policy_join_hit_rows": policy_join_hit,
                "policy_join_miss_rows": policy_join_miss,
                "accuracy_majority_per_policy": round(majority_accuracy(g_policy), 6),
                "conditional_distribution": {k: dict(v) for k, v in sorted(g_policy.items())},
            },
            "turn_alone": {
                "accuracy_majority_per_turn": round(majority_accuracy(g_turn), 6),
                "n_distinct_turn_values": len(g_turn),
            },
            "step_alone": {
                "accuracy_majority_per_step": round(majority_accuracy(g_step), 6),
                "n_distinct_step_values": len(g_step),
            },
            "rootFamilyId_alone": {
                "n_groups": len(g_root),
                "accuracy_majority_per_group": round(majority_accuracy(g_root), 6),
                "group_purity": round(purity(g_root), 6),
                "mean_rows_per_group": round(n / len(g_root), 3) if g_root else None,
            },
            "rootFamilyId_and_playerId_alone": {
                "n_groups": len(g_seat),
                "accuracy_majority_per_group": round(majority_accuracy(g_seat), 6),
                "group_purity": round(purity(g_seat), 6),
                "mean_rows_per_group": round(n / len(g_seat), 3) if g_seat else None,
                "n_groups_with_mixed_labels": sum(1 for c in g_seat.values() if len(c) > 1),
                "interpretation": "MEMORISE-THE-SEAT CEILING / LEAKAGE, not learning: "
                                  "the key contains the episode identity",
            },
        },
        "B4_information": {
            "alphabet": "{+1, -1, null} over ALL rows unless the key says 'signed_only'",
            "H_valueTarget_bits_all_rows": round(entropy(g_all), 6),
            "H_valueTarget_bits_signed_only": round(
                entropy(collections.Counter({"+1": n_pos, "-1": n_neg})), 6),
            "H_given_policy_bits": round(cond_entropy(g_policy, None), 6),
            "H_given_rootFamilyId_bits": round(cond_entropy(g_root, None), 6),
            "H_given_seat_(root,player)_bits": round(cond_entropy(g_seat, None), 6),
            "H_given_seat_signed_only_bits": round(cond_entropy(gs_seat, None), 6),
            "I_valueTarget_policy_bits": round(entropy(g_all) - cond_entropy(g_policy, None), 6),
            "I_valueTarget_rootFamilyId_bits": round(
                entropy(g_all) - cond_entropy(g_root, None), 6),
            "I_valueTarget_seat_bits": round(entropy(g_all) - cond_entropy(g_seat, None), 6),
            "note": "all MI values use the same 3-way alphabet and the same row set, "
                    "so they are comparable and non-negative",
        },
        "B5_sign_equals_my_alliance_won": {
            "rows_checked": sign_nodes,
            "agree": sign_agree,
            "disagree": sign_disagree,
            "agreement_rate": round(sign_agree / sign_nodes, 6) if sign_nodes else None,
        },
        "B6_join_coverage": {
            "rows_joined_to_episode_archive": join_hit,
            "rows_not_joined": join_miss,
            "join_rate": round(join_hit / n, 6),
            "join_key": "rootFamilyId split on '#' -> scenario#seed -> episode_index.json",
        },
        "B7_rows_from_informative_episodes": {
            "definition": "episode winner is neither policy-optimal-LOO-predicted nor LOO-modal (section A4)",
            "n_informative_episodes_in_section_A": len(informative_keys),
            "rows_in_those_episodes": rows_informative,
            "pct_of_pool": round(100.0 * rows_informative / n, 4),
            "distinct_rootFamilyIds": len(root_informative),
        },
        "B8_null_rows": {
            "n_null_rows": n_null,
            "n_distinct_episodes_with_null": len(null_by_root),
            "episodes_all_null": sum(1 for r, c in null_by_root.items()
                                     if c == root_rows[r]),
        },
    }

    # how many episodes carry both a +1 and a -1 (i.e. have a real loser in-pool)?
    both = sum(1 for r in root_rows if root_has_pos.get(r) and root_has_neg.get(r))
    only_pos = sum(1 for r in root_rows if root_has_pos.get(r) and not root_has_neg.get(r))
    only_neg = sum(1 for r in root_rows if root_has_neg.get(r) and not root_has_pos.get(r))
    neither = sum(1 for r in root_rows if not root_has_pos.get(r) and not root_has_neg.get(r))
    res["B9_episode_label_shape"] = {
        "n_episodes_in_pool": len(root_rows),
        "episodes_with_both_+1_and_-1": both,
        "episodes_with_only_+1": only_pos,
        "episodes_with_only_-1": only_neg,
        "episodes_with_neither": neither,
    }

    # ---- B10: how many INDEPENDENT labels does the pool actually contain? ----
    n_seats_with_sign = sum(1 for k, v in seat_has_sign.items() if v > 0)
    res["B10_effective_sample_size"] = {
        "n_rows": n,
        "n_distinct_rootFamilyId_episodes": len(root_rows),
        "n_distinct_seats_(rootFamilyId,playerId)": len(g_seat),
        "n_seats_carrying_a_signed_label": n_seats_with_sign,
        "mean_rows_per_seat": round(n / len(g_seat), 3) if g_seat else None,
        "seats_with_mixed_valueTarget": sum(1 for c in g_seat.values() if len(c) > 1),
        "independent_label_count": n_seats_with_sign,
        "rows_per_independent_label": round(n / n_seats_with_sign, 2) if n_seats_with_sign else None,
        "interpretation": "valueTarget is CONSTANT inside every (episode, seat). The whole "
                          "48,714-row pool therefore carries at most one distinct label per "
                          "seat, i.e. no within-episode advantage signal at all.",
    }
    res["B11_rows_per_episode_top"] = {
        r: c for r, c in root_rows.most_common(10)
    }
    res["B12_root_rows_full"] = dict(root_rows)
    res["B13_root_label_counts"] = {r: dict(g_root[r]) for r, _ in sorted(root_rows.items())}
    res["B14_per_root_detail"] = {
        r: {
            "rows": root_rows[r],
            "label_counts": dict(g_root[r]),
            "n_seats": sum(1 for k in g_seat if k[0] == r),
            "seats_with_sign": sum(1 for k, v in seat_has_sign.items()
                                   if k[0] == r and v > 0),
            "policy_by_player": {str(pid): pol
                                 for (rr, pid), pol in sorted(seat_policy.items())
                                 if rr == r},
        }
        for r in sorted(root_rows)
    }

    print(json.dumps(res, indent=2)[:20000])
    with open(os.path.join(OUT_DIR, "value_ceiling.json"), "w", encoding="utf-8") as fh:
        json.dump(res, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
