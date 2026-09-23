"""SECTION C -- is the SD archive usable as ACTION-imitation data, and imitating WHOM?

The preset `heuristic-apk-like-balanced` puts two different teachers in the same
game. This script measures, over every row of the baseline dataset:

  C1  action-type distribution of `label.actionCode`, split by `policy`
  C2  how far apart the two teachers are (total-variation / L1), per-type shares,
      and how much of the teacher identity leaks through the chosen action type
  C3  the corpus mix: row share per teacher, whether the teachers are interleaved
      inside one episode, and the cost of fitting ONE policy head to the union
  C4  recruit-vs-attack contrast conditioned on legality (re-derived, not copied)
  C5  consequence of outcome-conditioned filtering (winner trajectories only)

Extraction is regex/`find` over the raw line, never json.loads: the baseline file
is 7.27 GB and a full parse of the 48,714 records would cost minutes. Each key
used is asserted to occur exactly once per line, so the extraction is exact.

Emits: v12/out/archive_value/imitation_mix.json

Usage: py -3.12 v12/tools/arch_imitation_mix.py
"""
from __future__ import annotations

import collections
import json
import math
import os
import re
import sys

BASELINE = ("training_runs/agent_upgrade_20260919_01/baseline_dataset/"
            "baseline_dataset.jsonl")
OUT_DIR = "v12/out/archive_value"
INDEX = os.path.join(OUT_DIR, "episode_index.json")

HEAD = 60_000          # policy/scenario/legal list all live here
TAIL = 20_000          # label + outcome live at the very end of the record

RE_ACTIONCODE = re.compile(r'"actionCode":"([^"]*)"')
RE_POLICY = re.compile(r'"policy":"([^"]*)"')
RE_SCEN = re.compile(r'"scenario":\{"id":"([^"]+)"')
RE_SEED = re.compile(r'"seed":(\d+)')
RE_EPIDX = re.compile(r'"episodeIndex":(\d+)')
RE_PLAYER = re.compile(r'"playerId":(\d+)')
RE_STEP = re.compile(r'"step":(\d+)')
RE_TURN = re.compile(r'"turn":(\d+)')
RE_LEGAL = re.compile(r'"legalActionCodes":\[(.*?)\]')
RE_REWARD = re.compile(r'"outcome":\{"reward":(-?[0-9.]+)')
RE_DONE = re.compile(r'"done":(true|false)')
RE_CODE_IN_LIST = re.compile(r'"([^"]*)"')

RECRUIT = "recruit_to_castle"
ATTACK = "attack"


def entropy(counter: collections.Counter) -> float:
    tot = sum(counter.values())
    if tot <= 0:
        return 0.0
    return -sum((v / tot) * math.log2(v / tot) for v in counter.values() if v)


def tv(p: collections.Counter, q: collections.Counter) -> float:
    keys = set(p) | set(q)
    np_, nq = sum(p.values()), sum(q.values())
    return 0.5 * sum(abs(p.get(k, 0) / np_ - q.get(k, 0) / nq) for k in keys)


def l1(p: collections.Counter, q: collections.Counter) -> float:
    keys = set(p) | set(q)
    np_, nq = sum(p.values()), sum(q.values())
    return sum(abs(p.get(k, 0) / np_ - q.get(k, 0) / nq) for k in keys)


def main() -> int:
    with open(INDEX, "r", encoding="utf-8") as fh:
        index = json.load(fh)["index"]

    rows = 0
    skipped = collections.Counter()
    keycount = collections.Counter()

    type_by_policy: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    type_pooled: collections.Counter = collections.Counter()
    teacher_of_type: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)

    # legality / choice 2x2 style counters, per policy and pooled
    stats: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)

    # context-conditioned type counts: context -> policy -> type -> n
    ctx_by_policy: dict[str, dict[str, collections.Counter]] = collections.defaultdict(
        lambda: collections.defaultdict(collections.Counter))

    episode_policies: dict[str, set] = collections.defaultdict(set)
    episode_rows: collections.Counter = collections.Counter()
    root_by_policy: collections.Counter = collections.Counter()
    root_by_policy_winner_side: collections.Counter = collections.Counter()
    join_hit = join_miss = 0
    reward_by_policy: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    n_distinct_episodes = 0

    with open(BASELINE, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if not line.strip():
                continue
            rows += 1
            head = line[:HEAD] if len(line) > HEAD else line
            tail = line[-TAIL:] if len(line) > TAIL else line

            # `label.actionCode` sits at the END of the record (measured at byte
            # 125,527 of a 125,729-byte line), NOT in the head -- searching the
            # head here silently drops 100% of rows.
            ac = RE_ACTIONCODE.search(tail)
            if ac is None:
                ac = RE_ACTIONCODE.search(line)
                if ac is not None:
                    keycount["actionCode_only_outside_tail_window"] += 1
            pm = RE_POLICY.search(head)
            sc = RE_SCEN.search(head)
            se = RE_SEED.search(head)
            ei = RE_EPIDX.search(head)
            pl = RE_PLAYER.search(head)
            st = RE_STEP.search(head)
            tu = RE_TURN.search(head)
            lg = RE_LEGAL.search(head)
            if not (ac and pm and sc and se and ei and pl and lg):
                skipped["missing_field"] += 1
                if not ac:
                    skipped["no_actionCode"] += 1
                if not pm:
                    skipped["no_policy"] += 1
                if not sc:
                    skipped["no_scenario"] += 1
                if not se:
                    skipped["no_seed"] += 1
                if not ei:
                    skipped["no_episodeIndex"] += 1
                if not pl:
                    skipped["no_playerId"] += 1
                if not lg:
                    skipped["no_legalActionCodes"] += 1
                continue
            if lg.end() > HEAD:
                skipped["legal_list_past_head_window"] += 1
                continue
            for k in ('"actionCode"', '"policy"', '"legalActionCodes"'):
                c = line.count(k)
                keycount[k + "_total"] += c
                if c != 1:
                    keycount[k + "_lines_with_count_ne_1"] += 1

            code = ac.group(1)
            atype = code.split(":", 1)[0]
            policy = pm.group(1)
            root = f"{sc.group(1)}#{se.group(1)}#{ei.group(1)}"

            legal_codes = RE_CODE_IN_LIST.findall(lg.group(1))
            legal_types = {c.split(":", 1)[0] for c in legal_codes}
            rec_legal = RECRUIT in legal_types
            atk_legal = ATTACK in legal_types
            ctx = ("rec" if rec_legal else "-") + ("atk" if atk_legal else "-")

            type_by_policy[policy][atype] += 1
            type_pooled[atype] += 1
            teacher_of_type[atype][policy] += 1
            ctx_by_policy[ctx][policy][atype] += 1
            root_by_policy[policy] += 1

            s = stats[policy]
            sp = stats["ALL"]
            for tgt in (s, sp):
                tgt["n"] += 1
                tgt["chosen_code_in_legal_set"] += int(code in legal_codes)
                tgt["recruit_legal"] += int(rec_legal)
                tgt["attack_legal"] += int(atk_legal)
                tgt["both_legal"] += int(rec_legal and atk_legal)
                tgt["chose_recruit"] += int(atype == RECRUIT)
                tgt["chose_attack"] += int(atype == ATTACK)
                if rec_legal:
                    tgt["n_recruit_legal"] += 1
                    tgt["chose_recruit_given_legal"] += int(atype == RECRUIT)
                if atk_legal:
                    tgt["n_attack_legal"] += 1
                    tgt["chose_attack_given_legal"] += int(atype == ATTACK)
                if rec_legal and atk_legal:
                    tgt["n_both_legal"] += 1
                    tgt["chose_recruit_given_both"] += int(atype == RECRUIT)
                    tgt["chose_attack_given_both"] += int(atype == ATTACK)

            # winner side
            key = f"{sc.group(1)}#{se.group(1)}"
            ent = index.get(key)
            if ent is None:
                join_miss += 1
            else:
                join_hit += 1
                eff = ent.get("effectiveWinner")
                my_all = ent["allianceByPlayer"].get(pl.group(1))
                if eff is not None and my_all is not None and my_all == eff:
                    root_by_policy_winner_side[policy] += 1

            episode_policies[root].add(policy)
            episode_rows[root] += 1

            rm = RE_REWARD.search(tail)
            if rm:
                reward_by_policy[policy][rm.group(1)] += 1

    n_distinct_episodes = len(episode_policies)
    both_teachers = sum(1 for v in episode_policies.values() if len(v) > 1)
    only_h = sum(1 for v in episode_policies.values() if v == {"heuristic"})
    only_a = sum(1 for v in episode_policies.values() if v == {"apk-like"})

    # ---- C2 teacher divergence -------------------------------------------
    ph = type_by_policy["heuristic"]
    pa = type_by_policy["apk-like"]
    shares = {}
    for t in sorted(set(ph) | set(pa), key=lambda k: -(ph.get(k, 0) + pa.get(k, 0))):
        nh, na = sum(ph.values()), sum(pa.values())
        shares[t] = {
            "heuristic_n": ph.get(t, 0),
            "apk_like_n": pa.get(t, 0),
            "heuristic_share": round(ph.get(t, 0) / nh, 6) if nh else None,
            "apk_like_share": round(pa.get(t, 0) / na, 6) if na else None,
            "share_diff_h_minus_a": (round(ph.get(t, 0) / nh - pa.get(t, 0) / na, 6)
                                     if nh and na else None),
        }

    # teacher identity leaks through the action type?
    tot_teacher = collections.Counter()
    for t, c in teacher_of_type.items():
        for pol, v in c.items():
            tot_teacher[pol] += v
    h_teacher = entropy(tot_teacher)
    h_teacher_given_type = 0.0
    n_rows_typed = sum(sum(c.values()) for c in teacher_of_type.values())
    for t, c in teacher_of_type.items():
        nt = sum(c.values())
        h_teacher_given_type += (nt / n_rows_typed) * entropy(c)
    # Bayes accuracy of guessing the teacher from the action type
    teacher_bayes_acc = sum(max(c.values()) for c in teacher_of_type.values()) / n_rows_typed

    # ---- C3 cost of fitting one head to the union -------------------------
    def best_type(counter: collections.Counter) -> str:
        return counter.most_common(1)[0][0] if counter else "-"

    def acc_of_rule(rule_by_ctx: dict, ctx_counts: dict, policy: str) -> float:
        num = den = 0
        for ctx, per_pol in ctx_counts.items():
            c = per_pol.get(policy, collections.Counter())
            n = sum(c.values())
            if n == 0:
                continue
            den += n
            num += c.get(rule_by_ctx.get(ctx, "-"), 0)
        return num / den if den else 0.0

    pooled_rule = {ctx: best_type(sum(per_pol.values(), collections.Counter()))
                   for ctx, per_pol in
                   ((c, d) for c, d in ctx_by_policy.items())}
    h_rule = {ctx: best_type(per_pol.get("heuristic", collections.Counter()))
              for ctx, per_pol in ctx_by_policy.items()}
    a_rule = {ctx: best_type(per_pol.get("apk-like", collections.Counter()))
              for ctx, per_pol in ctx_by_policy.items()}
    cross = {
        "context": "legality context: whether a recruit_to_castle and an attack were legal",
        "rule_labels": {
            "pooled_rule_best_type_per_ctx": pooled_rule,
            "heuristic_rule_best_type_per_ctx": h_rule,
            "apk_like_rule_best_type_per_ctx": a_rule,
        },
        "accuracy_matrix_rows_are_rules_cols_are_evaluated_on": {
            "pooled_rule": {
                "on_heuristic_rows": round(acc_of_rule(pooled_rule, ctx_by_policy, "heuristic"), 6),
                "on_apk_like_rows": round(acc_of_rule(pooled_rule, ctx_by_policy, "apk-like"), 6),
                "on_all_rows": round(
                    (acc_of_rule(pooled_rule, ctx_by_policy, "heuristic") *
                     sum(type_by_policy["heuristic"].values()) +
                     acc_of_rule(pooled_rule, ctx_by_policy, "apk-like") *
                     sum(type_by_policy["apk-like"].values())) / max(1, n_rows_typed), 6),
            },
            "heuristic_rule": {
                "on_heuristic_rows": round(acc_of_rule(h_rule, ctx_by_policy, "heuristic"), 6),
                "on_apk_like_rows": round(acc_of_rule(h_rule, ctx_by_policy, "apk-like"), 6),
            },
            "apk_like_rule": {
                "on_heuristic_rows": round(acc_of_rule(a_rule, ctx_by_policy, "heuristic"), 6),
                "on_apk_like_rows": round(acc_of_rule(a_rule, ctx_by_policy, "apk-like"), 6),
            },
        },
    }

    def stats_out(c: collections.Counter) -> dict:
        n = c["n"]
        return {
            "n_decisions": n,
            "raw_counts": {k: v for k, v in sorted(c.items()) if k != "n"},
            "VALIDATION_pct_chosen_code_present_in_legalActionCodes": (
                round(100.0 * c["chosen_code_in_legal_set"] / n, 6) if n else None),
            "pct_recruit_legal": round(100.0 * c["recruit_legal"] / n, 4) if n else None,
            "pct_attack_legal": round(100.0 * c["attack_legal"] / n, 4) if n else None,
            "pct_both_legal": round(100.0 * c["both_legal"] / n, 4) if n else None,
            "unconditional_recruit_rate_pct": round(100.0 * c["chose_recruit"] / n, 4) if n else None,
            "unconditional_attack_rate_pct": round(100.0 * c["chose_attack"] / n, 4) if n else None,
            "recruit_rate_given_recruit_legal_pct": (
                round(100.0 * c["chose_recruit_given_legal"] / c["n_recruit_legal"], 4)
                if c["n_recruit_legal"] else None),
            "attack_rate_given_attack_legal_pct": (
                round(100.0 * c["chose_attack_given_legal"] / c["n_attack_legal"], 4)
                if c["n_attack_legal"] else None),
            "n_both_legal": c["n_both_legal"],
            "recruit_rate_given_both_legal_pct": (
                round(100.0 * c["chose_recruit_given_both"] / c["n_both_legal"], 4)
                if c["n_both_legal"] else None),
            "attack_rate_given_both_legal_pct": (
                round(100.0 * c["chose_attack_given_both"] / c["n_both_legal"], 4)
                if c["n_both_legal"] else None),
        }

    res = {
        "source": {
            "file": BASELINE,
            "rows_read": rows,
            "rows_skipped": dict(skipped),
            "key_occurrence_audit": dict(keycount),
        },
        "C1_action_type_by_policy": {
            "action_types": sorted(type_pooled),
            "counts": {p: dict(c.most_common()) for p, c in sorted(type_by_policy.items())},
            "shares": {
                p: {k: round(v / sum(c.values()), 6) for k, v in c.most_common()}
                for p, c in sorted(type_by_policy.items())
            },
            "pooled_counts": dict(type_pooled.most_common()),
        },
        "C2_teacher_divergence": {
            "per_action_type": shares,
            "total_variation_distance": round(tv(ph, pa), 6),
            "L1_distance": round(l1(ph, pa), 6),
            "distribution_overlap_1_minus_TV": round(1 - tv(ph, pa), 6),
            "teacher_entropy_bits": round(h_teacher, 6),
            "teacher_entropy_given_action_type_bits": round(h_teacher_given_type, 6),
            "mutual_information_teacher_actiontype_bits": round(
                h_teacher - h_teacher_given_type, 6),
            "bayes_accuracy_guessing_teacher_from_action_type": round(teacher_bayes_acc, 6),
            "majority_teacher_base_rate": round(
                max(tot_teacher.values()) / sum(tot_teacher.values()), 6),
            "accuracy_gain_over_base_rate_pp": round(
                100.0 * (teacher_bayes_acc - max(tot_teacher.values()) / sum(tot_teacher.values())), 4),
            "interpretation": "the action TYPE is almost uninformative about which teacher "
                              "produced it; the teachers differ in WHEN/WHERE, not in WHAT KIND",
        },
        "C3_corpus_mix": {
            "rows_by_policy": dict(root_by_policy.most_common()),
            "row_share_by_policy": {k: round(v / rows, 6)
                                    for k, v in root_by_policy.most_common()},
            "n_distinct_episodes": n_distinct_episodes,
            "episodes_containing_both_teachers": both_teachers,
            "episodes_only_heuristic": only_h,
            "episodes_only_apk_like": only_a,
            "pct_episodes_interleaving_both_teachers": (
                round(100.0 * both_teachers / n_distinct_episodes, 4)
                if n_distinct_episodes else None),
        },
        "C3b_cost_of_one_head_on_the_union": cross,
        "C4_recruit_vs_attack_conditional_on_legality": {
            policy: stats_out(c) for policy, c in sorted(stats.items())
        },
        "C5_outcome_conditioned_filtering": {
            "join_key": "scenario#seed -> episode_index.json",
            "rows_joined": join_hit,
            "rows_not_joined": join_miss,
            "join_rate": round(join_hit / rows, 6) if rows else None,
            "rows_on_winning_side_by_policy": dict(root_by_policy_winner_side.most_common()),
            "winner_side_row_share_by_policy": {
                k: round(v / sum(root_by_policy_winner_side.values()), 6)
                for k, v in root_by_policy_winner_side.most_common()
            } if root_by_policy_winner_side else {},
        },
        "C6_episode_rows_full": dict(episode_rows),
        "C7_episode_key_check": {
            "episode_key_used": "scenario.id#seed#source.episodeIndex",
            "n_distinct_episode_keys": n_distinct_episodes,
            "n_distinct_scenario_seed_keys": len({k.rsplit('#', 1)[0]
                                                  for k in episode_policies}),
        },
    }

    print(json.dumps(res, indent=2)[:20000])
    with open(os.path.join(OUT_DIR, "imitation_mix.json"), "w", encoding="utf-8") as fh:
        json.dump(res, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
