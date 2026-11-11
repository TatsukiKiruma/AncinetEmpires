"""SECTION A -- how predictable is the SD archive's winner WITHOUT looking at play?

Reads the SD training archive and answers, per scenario and overall:
  A1a accuracy of the fixed rule "the alliance holding the `heuristic` player wins"
  A1b accuracy of the *optimal* pre-play predictor that may use the whole policy
      assignment (scenario, alliance index, has-heuristic flag), leave-one-out
  A2  accuracy of the best constant (modal) winner alliance, in-sample and LOO
  A3  chance level (1 / number of alliances)
  A4  how many episodes are INFORMATIVE, i.e. the winner is neither the
      policy-assignment prediction NOR the modal winner

Two label variants are reported, because 392 of 1,395 episodes end by timeout and
carry `winnerAlliance: null`:
  * terminal   -- only the 1,003 episodes with a numeric `winnerAlliance`
  * effective  -- all 1,395, using `adjudicatedWinnerAlliance` where the game timed out

No full JSON parse: for every episode line the fields needed sit at fixed ends of
the record -- the seat/policy block in the first ~1 kB, `summary` in the last few
kB (measured: `"summary":` starts at 99.95% of a 1,000,312-byte line). A full
parse of 3.4 GB of multi-MB records would cost minutes for no extra information.

Emits:
  v12/out/archive_value/winner_predictability.json   (deliverable, section A)
  v12/out/archive_value/episode_index.json           (join key for sections B/C)

Usage: py -3.12 v12/tools/arch_winner_predictability.py
"""
from __future__ import annotations

import collections
import glob
import json
import os
import re
import sys

EP_DIR = "training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced"
OUT_DIR = "v12/out/archive_value"

HEAD = 20_000
TAIL = 8_000

RE_SCEN = re.compile(r'"scenario":\{"id":"([^"]+)"')
RE_SEED = re.compile(r'"seed":(\d+)')
RE_PLAYERS = re.compile(r'"players":\[(.*?)\],"policyByPlayer"')
RE_PLAYER = re.compile(r'\{"id":(\d+),"allianceId":(\d+),"policy":"([a-z\-]+)"\}')
RE_WINNER = re.compile(r'"winnerAlliance":(\d+|null)')
RE_ADJ = re.compile(r'"adjudicatedWinnerAlliance":(\d+|null)')
RE_TERMINAL = re.compile(r'"terminal":(true|false)')
RE_MAXSTEPS = re.compile(r'"stoppedByMaxSteps":(true|false)')
RE_TIMEOUT = re.compile(r'"timeout":(true|false)')
RE_ARMY = re.compile(r'"finalArmyValueByAlliance":\{([^}]*)\}')


def scan() -> tuple[list[dict], dict]:
    files = sorted(glob.glob(os.path.join(EP_DIR, "*.jsonl")))
    episodes: list[dict] = []
    diag = collections.Counter()

    for path in files:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            for lineno, line in enumerate(fh):
                if not line.strip():
                    continue
                diag["lines"] += 1
                head = line[:HEAD]
                tail = line[-TAIL:] if len(line) > HEAD else line
                sm = RE_SCEN.search(head)
                pm = RE_PLAYERS.search(head)
                wm = RE_WINNER.search(tail)
                if not sm or not pm or not wm:
                    diag["skipped_missing_field"] += 1
                    if not sm:
                        diag["skip_no_scenario"] += 1
                    if not pm:
                        diag["skip_no_players"] += 1
                    if not wm:
                        diag["skip_no_winner"] += 1
                    continue
                seats = [{"id": int(a), "allianceId": int(b), "policy": c}
                         for a, b, c in RE_PLAYER.findall(pm.group(1))]
                if not seats:
                    diag["skipped_empty_players"] += 1
                    continue
                seedm = RE_SEED.search(head)
                term = RE_TERMINAL.search(tail)
                adj = RE_ADJ.search(tail)
                ms = RE_MAXSTEPS.search(tail)
                to = RE_TIMEOUT.search(tail)
                am = RE_ARMY.search(tail)
                army = {}
                if am and am.group(1).strip():
                    for k, v in re.findall(r'"(\d+)":(-?\d+)', am.group(1)):
                        army[int(k)] = int(v)
                episodes.append({
                    "file": os.path.basename(path),
                    "line": lineno,
                    "scenario": sm.group(1),
                    "seed": int(seedm.group(1)) if seedm else None,
                    "seats": seats,
                    "winnerAlliance": None if wm.group(1) == "null" else int(wm.group(1)),
                    "adjudicatedWinnerAlliance": (
                        None if (adj is None or adj.group(1) == "null") else int(adj.group(1))),
                    "terminal": (term.group(1) == "true") if term else None,
                    "stoppedByMaxSteps": (ms.group(1) == "true") if ms else None,
                    "timeout": (to.group(1) == "true") if to else None,
                    "finalArmyValueByAlliance": army,
                })
                diag["parsed"] += 1
    return episodes, dict(diag)


def policy_signature(seats: list[dict]) -> str:
    c = collections.Counter(s["policy"] for s in seats)
    return "+".join(f"{c[p]}{p[0]}" for p in sorted(c))


def alliances_of(e: dict) -> list[int]:
    return sorted({s["allianceId"] for s in e["seats"]})


def heuristic_alliances(e: dict) -> list[int]:
    by_all: dict[int, set[str]] = collections.defaultdict(set)
    for s in e["seats"]:
        by_all[s["allianceId"]].add(s["policy"])
    return sorted(a for a, pols in by_all.items() if "heuristic" in pols)


def flag(e: dict, a: int) -> bool:
    return a in set(heuristic_alliances(e))


def label_block(episodes: list[dict], labelfn, label_name: str, global_modal: int) -> dict:
    """All of A1-A4 for one label definition."""
    rows = [e for e in episodes if labelfn(e) is not None]
    n = len(rows)
    per_scn: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for e in rows:
        per_scn[e["scenario"]][labelfn(e)] += 1

    # --- A1b: optimal pre-play predictor over the policy assignment, LOO ---
    # feature = (scenario, allianceIndex, that alliance holds a heuristic player)
    grp_wins: dict[tuple, int] = collections.Counter()
    grp_n: dict[tuple, int] = collections.Counter()
    for e in rows:
        w = labelfn(e)
        for a in alliances_of(e):
            grp_n[(e["scenario"], a, flag(e, a))] += 1
            if w == a:
                grp_wins[(e["scenario"], a, flag(e, a))] += 1

    rule_hit = rule_set_hit = rule_case_amb = 0
    polopt_hit = 0
    modal_hit = modal_loo_hit = 0
    chance_sum = 0.0
    informative_is = informative_loo = 0
    case = collections.Counter()
    informative_keys: list[str] = []
    informative_keys_insample: list[str] = []

    for e in rows:
        w = labelfn(e)
        halls = heuristic_alliances(e)
        if len(halls) == 1:
            case["exactly_one_heuristic_alliance"] += 1
            pred = halls[0]
        elif not halls:
            case["no_heuristic_alliance"] += 1
            pred = global_modal
        else:
            case["multiple_heuristic_alliances_tiebreak_lowest_id"] += 1
            rule_case_amb += 1
            pred = halls[0]
        rule_hit += int(w == pred)
        rule_set_hit += int(w in halls)

        # LOO policy-optimal
        best, best_score = None, None
        for a in alliances_of(e):
            k = (e["scenario"], a, flag(e, a))
            wins, tot = grp_wins[k], grp_n[k]
            wins -= int(w == a)
            tot -= 1
            score = (wins / tot) if tot > 0 else -1.0
            if best_score is None or score > best_score:
                best, best_score = a, score
        polopt_hit += int(w == best)

        c = per_scn[e["scenario"]]
        modal = c.most_common(1)[0][0]
        modal_hit += int(w == modal)
        c2 = c.copy()
        c2[w] -= 1
        if c2[w] == 0:
            del c2[w]
        loo = c2.most_common(1)[0][0] if c2 else global_modal
        modal_loo_hit += int(w == loo)

        chance_sum += 1.0 / len(alliances_of(e))
        ep_key = f"{e['scenario']}#{e['seed']}"
        if w != best and w != loo:
            informative_loo += 1
            informative_keys.append(ep_key)
        if w != best and w != modal:
            informative_is += 1
            informative_keys_insample.append(ep_key)

    # per-scenario table
    scn_tbl = {}
    for scn, counter in per_scn.items():
        srows = [e for e in rows if e["scenario"] == scn]
        sn = len(srows)
        m = counter.most_common(1)[0]
        r_ok = po_ok = loo_ok = 0
        ch = 0.0
        for e in srows:
            w = labelfn(e)
            halls = heuristic_alliances(e)
            r_ok += int(w == (halls[0] if halls else global_modal))
            c2 = counter.copy()
            c2[w] -= 1
            if c2[w] == 0:
                del c2[w]
            loo_ok += int(w == (c2.most_common(1)[0][0] if c2 else global_modal))
            best, best_score = None, None
            for a in alliances_of(e):
                k = (e["scenario"], a, flag(e, a))
                wins, tot = grp_wins[k], grp_n[k]
                wins -= int(w == a)
                tot -= 1
                score = (wins / tot) if tot > 0 else -1.0
                if best_score is None or score > best_score:
                    best, best_score = a, score
            po_ok += int(w == best)
            ch += 1.0 / len(alliances_of(e))
        scn_tbl[scn] = {
            "n_episodes": sn,
            "n_distinct_winners": len(counter),
            "winner_distribution": {str(k): v for k, v in sorted(counter.items())},
            "modal_winner_alliance": m[0],
            "modal_accuracy_insample": round(m[1] / sn, 4),
            "modal_accuracy_leave_one_out": round(loo_ok / sn, 4),
            "fixed_heuristic_rule_accuracy": round(r_ok / sn, 4),
            "policy_optimal_loo_accuracy": round(po_ok / sn, 4),
            "chance_1_over_n_alliances": round(ch / sn, 4),
            "n_alliances": len(alliances_of(srows[0])),
            "policy_signature": policy_signature(srows[0]["seats"]),
        }

    return {
        "label": label_name,
        "n_episodes": n,
        "A1a_fixed_rule": {
            "rule": "predict the alliance holding the `heuristic` player",
            "accuracy": round(rule_hit / n, 4) if n else None,
            "correct": rule_hit,
            "case_breakdown": dict(case),
            "ambiguous_handling": {
                "multiple_heuristic_alliances": "tie-break to lowest alliance id",
                "zero_heuristic_alliances": "fall back to global modal alliance",
            },
            "upper_bound_winner_in_ANY_heuristic_alliance": round(rule_set_hit / n, 4) if n else None,
            "n_ambiguous_episodes": rule_case_amb,
        },
        "A1b_policy_optimal_loo": {
            "features": "(scenario, allianceIndex, alliance-holds-a-heuristic-player)",
            "note": "Bayes-optimal pre-play predictor restricted to the preset's assignment; "
                    "leave-one-out so it cannot memorise the episode",
            "accuracy": round(polopt_hit / n, 4) if n else None,
        },
        "A2_best_constant_baseline": {
            "global_modal_winner_alliance": global_modal,
            "global_modal_accuracy": (
                round(collections.Counter(labelfn(e) for e in rows).most_common(1)[0][1] / n, 4)
                if n else None),
            "per_scenario_modal_accuracy_insample": round(modal_hit / n, 4) if n else None,
            "per_scenario_modal_accuracy_leave_one_out": round(modal_loo_hit / n, 4) if n else None,
            "note": "in-sample modal memorises the scenario and is an optimistic ceiling; "
                    "LOO is the honest constant baseline",
        },
        "A3_chance": {"mean_1_over_n_alliances": round(chance_sum / n, 4) if n else None},
        "A4_informative_episodes": {
            "definition": "winner != policy-optimal-LOO prediction AND winner != LOO modal winner",
            "count_loo": informative_loo,
            "pct_loo": round(100.0 * informative_loo / n, 4) if n else None,
            "definition_insample": "winner != policy-optimal-LOO prediction AND winner != in-sample modal",
            "count_insample_modal": informative_is,
            "pct_insample_modal": round(100.0 * informative_is / n, 4) if n else None,
        },
        "informative_keys_loo": sorted(informative_keys),
        "informative_keys_insample": sorted(informative_keys_insample),
        "per_scenario": scn_tbl,
    }


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    episodes, diag = scan()
    print(f"scan diagnostics: {diag}")

    n_all = len(episodes)
    term = [e for e in episodes if e["winnerAlliance"] is not None]
    nulls = [e for e in episodes if e["winnerAlliance"] is None]

    # ---- label provenance ------------------------------------------------
    adj_agrees = sum(1 for e in term if e["adjudicatedWinnerAlliance"] == e["winnerAlliance"])
    timeouts = [e for e in episodes if e["timeout"]]
    adj_present = sum(1 for e in nulls if e["adjudicatedWinnerAlliance"] is not None)
    # is adjudicatedWinnerAlliance just argmax(finalArmyValueByAlliance)?
    adj_is_argmax = 0
    adj_checkable = 0
    for e in episodes:
        army = e["finalArmyValueByAlliance"]
        if not army or e["adjudicatedWinnerAlliance"] is None:
            continue
        adj_checkable += 1
        top = max(army.values())
        winners_by_army = [k for k, v in army.items() if v == top]
        if e["adjudicatedWinnerAlliance"] in winners_by_army:
            adj_is_argmax += 1

    label_provenance = {
        "n_episode_records": n_all,
        "n_terminal_numeric_winner": len(term),
        "n_null_winner": len(nulls),
        "pct_null_winner": round(100.0 * len(nulls) / n_all, 4),
        "null_winner_all_timeout": len(nulls) == len(timeouts),
        "n_timeout": len(timeouts),
        "null_winner_with_adjudicatedWinnerAlliance_present": adj_present,
        "terminal_episodes_adjudicated_equals_winner": adj_agrees,
        "adjudicatedWinnerAlliance_is_argmax_finalArmyValue": {
            "checkable": adj_checkable,
            "agree": adj_is_argmax,
            "rate": round(adj_is_argmax / adj_checkable, 4) if adj_checkable else None,
        },
    }

    nplayers = collections.Counter(len(e["seats"]) for e in episodes)
    nalliances = collections.Counter(len(alliances_of(e)) for e in episodes)
    seat_policy = collections.Counter(s["policy"] for e in episodes for s in e["seats"])
    win_policy = collections.Counter(
        next(s["policy"] for s in e["seats"] if s["allianceId"] == e["winnerAlliance"])
        for e in term)
    win_policy_eff = collections.Counter(
        next(s["policy"] for s in e["seats"]
             if s["allianceId"] == (e["winnerAlliance"] if e["winnerAlliance"] is not None
                                    else e["adjudicatedWinnerAlliance"]))
        for e in episodes if (e["winnerAlliance"] is not None
                              or e["adjudicatedWinnerAlliance"] is not None))

    assignment = {
        "players_per_episode": {str(k): v for k, v in sorted(nplayers.items())},
        "alliances_per_episode": {str(k): v for k, v in sorted(nalliances.items())},
        "policy_signature_counts": dict(
            collections.Counter(policy_signature(e["seats"]) for e in episodes).most_common()),
        "player_id_equals_alliance_id_everywhere": all(
            len(alliances_of(e)) == len(e["seats"]) for e in episodes),
        "seat_policy_counts": dict(seat_policy.most_common()),
        "seat_policy_share": {k: round(v / sum(seat_policy.values()), 4)
                              for k, v in seat_policy.most_common()},
        "winner_policy_counts_terminal": dict(win_policy.most_common()),
        "winner_policy_share_terminal": {k: round(v / len(term), 4)
                                         for k, v in win_policy.most_common()},
        "winner_policy_counts_effective": dict(win_policy_eff.most_common()),
    }

    global_modal = collections.Counter(e["winnerAlliance"] for e in term).most_common(1)[0][0]
    gm_eff = collections.Counter(
        e["winnerAlliance"] if e["winnerAlliance"] is not None else e["adjudicatedWinnerAlliance"]
        for e in episodes).most_common(1)[0][0]

    block_term = label_block(episodes, lambda e: e["winnerAlliance"], "terminal", global_modal)
    block_eff = label_block(
        episodes,
        lambda e: (e["winnerAlliance"] if e["winnerAlliance"] is not None
                   else e["adjudicatedWinnerAlliance"]),
        "effective_adjudicated_on_timeout", gm_eff)

    res = {
        "source": {"dir": EP_DIR,
                   "n_files": len(glob.glob(os.path.join(EP_DIR, "*.jsonl"))),
                   "n_episode_records": n_all,
                   "scan_diagnostics": diag},
        "label_provenance": label_provenance,
        "assignment_structure": assignment,
        "terminal_label": block_term,
        "effective_label_all_1395": block_eff,
        "per_scenario": block_term["per_scenario"],
        # convenience copies so downstream scripts can cross-reference without
        # re-deriving the informative set
        "informative_keys": block_term["informative_keys_loo"],
        "informative_keys_terminal_insample_modal": block_term["informative_keys_insample"],
        "informative_keys_effective": block_eff["informative_keys_loo"],
    }

    print(json.dumps({k: v for k, v in res.items()
                      if k not in ("per_scenario", "terminal_label", "effective_label_all_1395")},
                     indent=2))
    for b in (block_term, block_eff):
        print(json.dumps({k: v for k, v in b.items() if k != "per_scenario"}, indent=2))

    with open(os.path.join(OUT_DIR, "winner_predictability.json"), "w", encoding="utf-8") as fh:
        json.dump(res, fh, indent=2)

    idx, dup = {}, 0
    for e in episodes:
        key = f"{e['scenario']}#{e['seed']}"
        if key in idx:
            dup += 1
            continue
        idx[key] = {
            "scenario": e["scenario"], "seed": e["seed"],
            "winnerAlliance": e["winnerAlliance"],
            "adjudicatedWinnerAlliance": e["adjudicatedWinnerAlliance"],
            "effectiveWinner": (e["winnerAlliance"] if e["winnerAlliance"] is not None
                                else e["adjudicatedWinnerAlliance"]),
            "timeout": e["timeout"],
            "policyByPlayer": {str(s["id"]): s["policy"] for s in e["seats"]},
            "allianceByPlayer": {str(s["id"]): s["allianceId"] for s in e["seats"]},
        }
    with open(os.path.join(OUT_DIR, "episode_index.json"), "w", encoding="utf-8") as fh:
        json.dump({"n_keys": len(idx), "n_duplicate_scenario_seed": dup, "index": idx}, fh)
    print(f"\nepisode_index.json: {len(idx)} unique (scenario,seed) keys, {dup} duplicates")
    return 0


if __name__ == "__main__":
    sys.exit(main())
