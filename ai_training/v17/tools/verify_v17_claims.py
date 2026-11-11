"""V17 自审：把报告里的头条数字**从原始证据重新算一遍**，输出 PASS/FAIL。

目的：报告是人写的，数字必须能从 games.jsonl / 数据集 / 台账复算出来。
任何一条 FAIL 都意味着报告与证据不一致，必须先改报告再交接。

用法：
  & 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe' `
    v17/tools/verify_v17_claims.py --run-id v17_20260926_r2
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

MAPS = ['(2) Duel.aem', '(2) Icy Paths.aem', '(2) Liberty Port.aem', '(2) Mourningstar.aem', '(2) Crossed swords.aem']


def read_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def arena_rollup(run: Path) -> dict:
    """按 (目录, 文件前缀) 口径重算每个臂的胜负。"""
    arms: dict[str, list[dict]] = defaultdict(list)
    for pattern in ("arena/dev/*.games.jsonl", "teacher/arena/*.games.jsonl", "pilot/*.games.jsonl"):
        for f in sorted(glob.glob(str(run / pattern))):
            p = Path(f)
            name = p.name.split(".")[0]
            if name.startswith("smoke"):
                continue
            for row in read_jsonl(p):
                row["_file"] = p.name
                arms[name].append(row)
    out = {}
    for name, rows in arms.items():
        cand = [r for r in rows if r.get("arm") == "CANDIDATE"]
        if not cand:
            continue
        wins = [r for r in cand if r.get("outcomeKind") == "NATURAL_WIN"]
        by_map = {m: {"wins": sum(1 for r in cand if r.get("mapName") == m and r.get("outcomeKind") == "NATURAL_WIN"),
                      "games": sum(1 for r in cand if r.get("mapName") == m)} for m in MAPS}
        by_seat = {s: {"wins": sum(1 for r in cand if str(r.get("viewedSeat")) == s and r.get("outcomeKind") == "NATURAL_WIN"),
                       "games": sum(1 for r in cand if str(r.get("viewedSeat")) == s)} for s in ("0", "1")}
        hashes = sorted({(r.get("checkpointSha256") or "na")[:12] for r in cand})
        out[name] = {
            "games": len(cand), "wins": len(wins),
            "byMap": {m: f"{v['wins']}/{v['games']}" for m, v in by_map.items()},
            "bySeat": {s: f"{v['wins']}/{v['games']}" for s, v in by_seat.items()},
            "outcomes": dict(Counter(r.get("outcomeKind") for r in cand)),
            "sha12": hashes,
        }
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="v17_20260926_r2")
    args = parser.parse_args()
    run = REPO / "v17" / "out" / args.run_id

    checks: list[dict] = []

    def check(name: str, ok: bool, detail) -> None:
        checks.append({"check": name, "pass": bool(ok), "detail": detail})

    # ---------------- 1. 对战成绩复算 ----------------
    rollup = arena_rollup(run)
    expected = {
        "P1_s2026": 5, "h0": 10, "B0": 5, "B1": 0, "B1b": 2, "B1c": 0, "B1d": 0,
        "B1e": 2, "B1e_best": 0, "B1e_m": 0, "P0": 2, "PV0": 2,
        "B0_big": 4, "B0_16k_best": 1, "B0_4b_best": 4, "B2": 4,
        "B0h_l1": 1, "B0h_l1m": 2, "B0h_beh": 0,
        "b100q": 12, "b100r": 10,
    }
    for arm, wins in expected.items():
        got = rollup.get(arm, {}).get("wins")
        check(f"DEV20 wins {arm}", got == wins, {"expected": wins, "recomputed": got, "games": rollup.get(arm, {}).get("games")})

    # ---------------- 2. 每个面板必须正好 20 局 ----------------
    for arm in expected:
        g = rollup.get(arm, {}).get("games")
        check(f"DEV20 size {arm} == 20", g == 20, {"games": g})

    # ---------------- 3. B0/B1 输入完全相同且顺序一致 ----------------
    def keys_in_order(path: Path, limit: int = 2000) -> list[str]:
        out = []
        for row in read_jsonl(path):
            out.append(row.get("actualInputKey"))
            if len(out) >= limit:
                break
        return out

    b0 = REPO / f"v17/out/{args.run_id}/data/B0_train.jsonl"
    b1 = REPO / f"v17/out/{args.run_id}/data/B1_train.jsonl"
    if b0.exists() and b1.exists():
        k0, k1 = keys_in_order(b0), keys_in_order(b1)
        check("B0/B1 same input order (first 2000)", k0 == k1, {"n": len(k0), "identical": k0 == k1})
        # 标签必须不同，否则对照无效
        l0 = [r["targetActionCode"] for i, r in zip(range(500), read_jsonl(b0))]
        l1 = [r["targetActionCode"] for i, r in zip(range(500), read_jsonl(b1))]
        diff = sum(1 for a, b in zip(l0, l1) if a != b)
        check("B0/B1 labels actually differ", diff > 0, {"rowsCompared": 500, "differing": diff})
    else:
        check("B0/B1 datasets exist", False, {"b0": b0.exists(), "b1": b1.exists()})

    # ---------------- 4. 输入身份唯一性（重建产物） ----------------
    for name in ("legacy_train_dedup.jsonl", "legacy_val_clean.jsonl"):
        p = REPO / f"v17/out/{args.run_id}/data/{name}"
        if not p.exists():
            check(f"unique inputs {name}", False, {"reason": "missing"})
            continue
        seen = set()
        n = 0
        for row in read_jsonl(p):
            n += 1
            seen.add(row.get("actualInputKey"))
        check(f"unique inputs {name}", len(seen) == n, {"rows": n, "unique": len(seen)})

    # ---------------- 5. val 与 train 输入交集为 0 ----------------
    # 中文：先算**原始文件**之间的交集（这是必须如实报告的事实），再算
    # **实际送进 trainer 的文件**（B0/B1/B1b_trainval.jsonl 的 partition 字段）的交集——
    # 后者才是"训练时 val 有没有泄漏"的判据，必须为 0。
    raw_train_keys = set()
    for name in ("legacy_train_dedup.jsonl", "new_train/dataset_v17_newtrain.jsonl"):
        p2 = REPO / f"v17/out/{args.run_id}/data/{name}"
        if p2.exists():
            for row in read_jsonl(p2):
                raw_train_keys.add(row.get("actualInputKey"))
    raw_val_keys = set()
    for name in ("legacy_val_clean.jsonl", "new_val/dataset_v17_newval.jsonl"):
        p3 = REPO / f"v17/out/{args.run_id}/data/{name}"
        if p3.exists():
            for row in read_jsonl(p3):
                raw_val_keys.add(row.get("actualInputKey"))
    raw_overlap = raw_train_keys & raw_val_keys
    check("raw val/train input overlap reported (shared deterministic openings)", True,
          {"trainKeys": len(raw_train_keys), "valKeys": len(raw_val_keys), "rawOverlap": len(raw_overlap),
           "note": "这些是各图确定性开局造成的同输入；它们在池构建时被剔除出 val，见下一条。"})

    for arm in ("B0", "B1", "B1b"):
        tv = REPO / f"v17/out/{args.run_id}/experiments/_data/{arm}_trainval.jsonl"
        if not tv.exists():
            check(f"{arm}_trainval val ∩ train == 0", False, {"reason": "missing", "path": str(tv)})
            continue
        tr, va = set(), set()
        for row in read_jsonl(tv):
            part = row.get("partition")
            key = row.get("actualInputKey")
            if part == "train":
                tr.add(key)
            elif part == "val":
                va.add(key)
        check(f"{arm}_trainval val ∩ train == 0", len(tr & va) == 0,
              {"trainKeys": len(tr), "valKeys": len(va), "overlap": len(tr & va)})

    # ---------------- 6. B100 标签连接率 ----------------
    pool = REPO / f"v17/out/{args.run_id}/data/pool_B01_train.jsonl"
    if pool.exists():
        n = 0
        with_teacher = 0
        with_l1 = 0
        for row in read_jsonl(pool):
            n += 1
            if row.get("teacherActionCode"):
                with_teacher += 1
            if row.get("l1ActionCode"):
                with_l1 += 1
        check("pool teacher-label coverage == 100%", with_teacher == n and n > 0, {"rows": n, "teacher": with_teacher, "l1": with_l1})

    # ---------------- 7. 训练台账更新数 ----------------
    for arm in ("V0", "P0", "PV0", "B0", "B1", "B1b", "B1c", "B1d", "B1e", "B1e_m", "B0_big", "B0_16k", "B0_4b", "B2",
                "B0h_l1", "B0h_l1m", "B0h_beh"):
        ledger = list(glob.glob(str(run / f"experiments/{arm}/*.optimizer_update_ledger.jsonl")))
        if not ledger:
            check(f"ledger {arm} updates recorded", False, {"reason": "missing"})
            continue
        n = sum(1 for _ in read_jsonl(Path(ledger[0])))
        want = {"B1d": 1000, "B1e_m": 1118, "B1e": 2650, "B0_16k": 16000, "B0h_l1m": 2412}.get(arm, 4000)
        check(f"ledger {arm} updates == {want}", n == want, {"updates": n})

    # ---------------- 6a1b. val accuracy is ANTI-correlated with DEV20 here ---------------
    # 中文：T17-05e 的核心声明是"三个纯 H0 池的 val 更高但 DEV20 更差"。
    # 这条必须从 metrics.json 与 arena summary 复算，不能手抄。
    pure_h0 = ["B0h_l1", "B0h_l1m", "B0h_beh"]
    vals = {}
    for arm in ["B0"] + pure_h0:
        mp = run / f"experiments/{arm}/metrics.json"
        if mp.exists():
            vals[arm] = json.loads(mp.read_text(encoding="utf-8")).get("best_val_acc")
    if len(vals) == 4:
        b0_val, b0_wins = vals["B0"], expected["B0"]
        higher_val_lower_wins = all(
            vals[a] > b0_val and expected[a] < b0_wins for a in pure_h0
        )
        check("pure-H0 pools: higher val but fewer DEV20 wins than B0", higher_val_lower_wins,
              {"B0": {"val": round(b0_val, 4), "wins": b0_wins},
               **{a: {"val": round(vals[a], 4), "wins": expected[a]} for a in pure_h0}})
    else:
        check("pure-H0 pools: higher val but fewer DEV20 wins than B0", False, {"found": sorted(vals)})

    # ---------------- 6a1c. label source makes no difference -----------------------------
    l1, beh = "B0h_l1", "B0h_beh"
    check("label source (L1 labeler vs H0's own action) changes nothing material",
          abs(expected[l1] - expected[beh]) <= 1 and abs(vals.get(l1, 0) - vals.get(beh, 0)) <= 0.01,
          {"B0h_l1": {"wins": expected[l1], "val": round(vals.get(l1, 0), 4)},
           "B0h_beh": {"wins": expected[beh], "val": round(vals.get(beh, 0), 4)}})

    # ---------------- 6a2b. B2 = same total unique inputs as B0, student-heavy ------------
    # 中文：D2 要求 B2 与 B0 保持相同的唯一输入数量、只换成分。这条必须能从文件复算。
    b2p = run / "data/pool_B2_train.report.json"
    b0p = run / "data/pool_B01_train.report.json"
    if b2p.exists() and b0p.exists():
        b2 = json.loads(b2p.read_text(encoding="utf-8"))
        picked = b2.get("selected", {})
        share = b2.get("composition", {}).get("studentShare")
        total = b2.get("totalRows")
        check("B2 total unique inputs == B0's 12,021",
              total == 12021, {"b2Total": total, "target": b2.get("targetTotal")})
        check("B2 student share > B0 student share (33.3%)",
              share is not None and share > 0.3333,
              {"b2StudentShare": share, "b0StudentShare": 4000 / 12021})
    else:
        check("B2 pool report present", False, {"b2": b2p.exists(), "b0": b0p.exists()})

    # ---------------- 6a2c. Granularity diagnostics: type acc >> exact acc ---------------
    # 中文：T17-05d 的核心诊断是"精确 top-1 掩盖了很高的动作类型准确率"。
    ta = run / "data/action_type_accuracy.json"
    if ta.exists():
        d = json.loads(ta.read_text(encoding="utf-8"))
        b0 = d["models"].get("B0_final.json")
        check("B0 type accuracy >= 0.85 while exact < 0.55",
              b0 is not None and b0["typeTop1"] >= 0.85 and b0["exactTop1"] < 0.55,
              {"exactTop1": b0 and b0["exactTop1"], "typeTop1": b0 and b0["typeTop1"]})
    else:
        check("action_type_accuracy.json present", False, {"path": str(ta)})

    em = run / "data/error_margin.json"
    if em.exists():
        d = json.loads(em.read_text(encoding="utf-8"))
        b0 = d["models"].get("B0_final.json")
        check("label in top-3 >= 0.65 (errors are near-ties)",
              b0 is not None and b0["labelTop3Rate"] >= 0.65,
              {"labelTop3Rate": b0 and b0["labelTop3Rate"],
               "correctMarginP50": b0 and b0["correct"]["p50"],
               "wrongSameTypeMarginP50": b0 and b0["wrongSameType"]["p50"]})
    else:
        check("error_margin.json present", False, {"path": str(em)})

    # ---------------- 6a2. Fidelity plateau: every single-factor lever lands at ~45% ------
    # 中文：T17-05c 的核心声明是"四条杠杆（数据量/训练长度/深度）都停在 ~45% 的未见状态准确率"。
    # 这里直接从各 run 的 metrics.json 复算，避免报告里的数字被手抄错。
    plateau = {}
    for arm in ("B0", "B0_big", "B0_16k", "B0_4b"):
        mp = run / f"experiments/{arm}/metrics.json"
        if mp.exists():
            plateau[arm] = json.loads(mp.read_text(encoding="utf-8")).get("best_val_acc")
    if len(plateau) == 4:
        lo, hi = min(plateau.values()), max(plateau.values())
        check("fidelity plateau: best val within 1pp across 4 levers",
              (hi - lo) <= 0.01, {k: round(v, 4) for k, v in plateau.items()} | {"spread": round(hi - lo, 4)})
        # 训练长度杠杆必须显著提高 train 拟合（否则"容量足够"这句不成立）
        b016 = json.loads((run / "experiments/B0_16k/metrics.json").read_text(encoding="utf-8"))
        hist = b016.get("history") or []
        final_train = hist[-1].get("train_acc") if hist else None
        check("B0_16k fits train set (>0.90) while val stays <=0.46",
              final_train is not None and final_train > 0.90 and (b016.get("best_val_acc") or 0) <= 0.46,
              {"finalTrainAcc": final_train, "bestValAcc": b016.get("best_val_acc")})
    else:
        check("fidelity plateau: best val within 1pp across 4 levers", False, {"found": sorted(plateau)})

    # ---------------- 6a3. H0 determinism on repeated inputs ----------------
    # 中文："标签没有噪声" 是 T17-05c 的第一条前提，必须能从数据复算，而不是引用一句话。
    h0_counter: dict = defaultdict(Counter)
    for rel in ("data/new_train/dataset_v17_newtrain.jsonl", "data/new_val/dataset_v17_newval.jsonl",
                "data/legacy_train_dedup.jsonl"):
        p3 = run / rel
        if not p3.exists():
            continue
        for row in read_jsonl(p3):
            if str(row.get("sourcePolicy")) == "h0" and row.get("actualInputKey") and row.get("behaviorActionCode"):
                h0_counter[row["actualInputKey"]][row["behaviorActionCode"]] += 1
    repeated = {k: c for k, c in h0_counter.items() if sum(c.values()) >= 2}
    tot = sum(sum(c.values()) for c in repeated.values())
    cor = sum(c.most_common(1)[0][1] for c in repeated.values())
    consistency = (cor / tot) if tot else None
    check("H0 determinism on repeated inputs >= 0.98",
          consistency is not None and consistency >= 0.98,
          {"repeatedKeys": len(repeated), "repeatedRows": tot, "consistency": round(consistency, 4) if consistency else None})

    # ---------------- 6a4. Deterministic scenario structure + intervention result --------
    # 中文：T17-04b 的核心声明有两条，都必须能从产物复算：
    #   (1) H0 在每个 (地图,seed) 场景里恰好赢一个座位角色（10 局 → 10 个角色）;
    #   (2) 5 个败局做单点干预后 0 个翻盘。
    fa_files = sorted(glob.glob(str(run / "diag/force_action_*.json")))
    if fa_files:
        cases = []
        for f in fa_files:
            cases.extend(json.loads(Path(f).read_text(encoding="utf-8")).get("cases", []))
        interventions = [c["intervention"] for c in cases if c.get("intervention")]
        losing = [c for c in cases if c.get("baselineOutcome") == "LOSS" and c.get("intervention")]
        flipped = [c for c in losing if c["intervention"].get("flipped")]
        applied = [c for c in interventions if c.get("forceApplied")]
        check("force-action interventions were actually applied",
              len(applied) == len(interventions) and len(interventions) >= 5,
              {"interventions": len(interventions), "applied": len(applied)})
        check("0 of the losing cases flip when H0's action is forced",
              len(losing) >= 5 and len(flipped) == 0,
              {"losingCases": len(losing), "flipped": len(flipped),
               "cases": [c["caseId"] for c in losing]})
        check("every losing case's mirror really wins with H0",
              all(c.get("mirrorOutcome") == "WIN" for c in losing),
              {"mirrorOutcomes": {c["caseId"]: c.get("mirrorOutcome") for c in losing}})
    else:
        check("force-action diag outputs present", False, {"found": fa_files})

    # ---------------- 6a5. Own-distribution fidelity gap ----------------
    od = run / "data/own_distribution_fidelity.json"
    if od.exists():
        d = json.loads(od.read_text(encoding="utf-8"))
        cmp_ = d.get("comparison") or {}
        check("model is worse on its own states than H0 (type gap < 0)",
              cmp_.get("typeGapPp") is not None and cmp_["typeGapPp"] < 0,
              {"h0Type": cmp_.get("h0Type"), "modelTypeOnOwnStates": cmp_.get("modelTypeOnOwnStates"),
               "typeGapPp": cmp_.get("typeGapPp")})
    else:
        check("own_distribution_fidelity.json present", False, {"path": str(od)})

    # ---------------- 6b. H0 clone ceiling: exactly one winning seat per mirror game ------
    # 中文：§3.5 的核心声明是"H0 完美模仿者 = 10/20"。它成立的**结构性前提**是：
    # 每一局 H0-vs-H0 恰好只有一个座位赢。这条必须单独检查，否则 10/20 只是个巧合数字。
    h0_files = sorted(glob.glob(str(run / "arena/dev/h0.m*.games.jsonl")))
    if not h0_files:
        check("H0 ceiling: one winning seat per game", False, {"reason": "no h0 files"})
    else:
        per_game: dict[tuple, dict] = defaultdict(dict)
        for f in h0_files:
            for row in read_jsonl(Path(f)):
                per_game[(row.get("mapName"), row.get("rootSeed"))][row.get("viewedSeat")] = row.get("outcomeKind")
        one_winner = sum(1 for v in per_game.values() if sorted(str(x) for x in v.values()) == ["NATURAL_LOSS", "NATURAL_WIN"])
        total_wins = sum(1 for v in per_game.values() for o in v.values() if o == "NATURAL_WIN")
        check("H0 ceiling: one winning seat per game", one_winner == len(per_game) and total_wins == 10,
              {"games": len(per_game), "gamesWithExactlyOneWinner": one_winner, "totalSeatViewWins": total_wins})

    # ---------------- 6c. On-policy demonstration consistency ----------------
    # 中文：B1e 的示范标签取自教师**自己轨迹**。独立地重新查询同一批状态，动作必须与
    # 实际执行的动作 100% 一致，否则"on-policy 示范"这个说法就不成立。
    demo_labels = sorted(glob.glob(str(run / "teacher/labels/b100q-demo-onpolicy/labels*.jsonl")))
    if not demo_labels:
        check("on-policy demo re-query agreement == 100%", False, {"reason": "no label files"})
    else:
        same = differ = illegal = 0
        for f in demo_labels:
            for rec in read_jsonl(Path(f)):
                if rec.get("teacherActionInAllowed") is not True:
                    illegal += 1
                    continue
                if rec.get("teacherActionCode") == rec.get("behaviorActionCode"):
                    same += 1
                else:
                    differ += 1
        check("on-policy demo re-query agreement == 100%", differ == 0 and same > 0 and illegal == 0,
              {"same": same, "differ": differ, "illegal": illegal})

    demo_rollouts = sorted(glob.glob(str(run / "data/demo_train/rollouts/*.demo.shard*.jsonl")))
    onpolicy_rows = 0
    for f in demo_rollouts:
        for rec in read_jsonl(Path(f)):
            if rec.get("onPolicyDemonstration") is True:
                onpolicy_rows += 1
    check("demo rollouts flagged onPolicyDemonstration", onpolicy_rows > 0, {"rows": onpolicy_rows, "files": len(demo_rollouts)})

    # ---------------- 8. CONFIRM20 未被运行 ----------------
    confirm = list(glob.glob(str(run / "arena/confirm/*.games.jsonl")))
    check("CONFIRM20 not run", len(confirm) == 0, {"files": [Path(f).name for f in confirm]})

    # ---------------- 9. v16 未被改动（抽查关键产物 SHA） ----------------
    champ = REPO / "v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json"
    if champ.exists():
        sha = hashlib.sha256(champ.read_bytes()).hexdigest()
        check("champion SHA unchanged", sha == "b705b52a25a8954c3c71417997f552db1a0faa792269f667db76e83236e06899",
              {"sha256": sha})

    summary = {
        "schema": "v17_claims_verification_1",
        "runId": args.run_id,
        "passed": sum(1 for c in checks if c["pass"]),
        "failed": sum(1 for c in checks if not c["pass"]),
        "arenaRollup": rollup,
        "checks": checks,
    }
    out = run / "claims_verification.json"
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    for c in checks:
        print(f"[{'PASS' if c['pass'] else 'FAIL'}] {c['check']} {json.dumps(c['detail'], ensure_ascii=False)}")
    print(f"\nTOTAL {summary['passed']} passed / {summary['failed']} failed -> {out}")
    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())