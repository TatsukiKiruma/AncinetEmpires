"""V15/T15-08：九个 D 组运行的消费核验与汇总（owner C）。

核验内容（对应任务书 §9.2 的 1~3 条与协议 §3.2）：

1. 每组都是 1,500 更新、48,000 曝光，且能从 `optimizer_update_ledger.jsonl` 独立复算；
2. 每 update 的来源配额恰好是 16 + 16；
3. **D0 与 D1/D2 在相同 update 的前 16 个位置 sampleId 必须一致**（共享旧池序列）；
4. 同 seed 三组的初始权重 sha256 完全相同（来自对应 C2 final）；
5. D1/D2 的新池曝光各为 24,000，D0 的新池曝光为 0；
6. 每组 LR 端点为 1e-4 → 1e-5，`stopReason=GLOBAL_UPDATE_LIMIT`，零消费 epoch = 0。

用法：

    python v15/tools/train_summarize_d_groups_v15.py --run-id v15_20260925_core
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ARMS = ("D0", "D1", "D2")
SEEDS = (42, 1337, 2026)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_ledger(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--updates", type=int, default=1500)
    parser.add_argument("--batch-size", type=int, default=32)
    args = parser.parse_args()

    d_dir = REPO / "v15" / "out" / args.run_id / "T15-08"
    c2_dir = REPO / "v15" / "out" / args.run_id / "T15-06"

    per_run: dict[tuple[str, int], dict] = {}
    ledgers: dict[tuple[str, int], list[dict]] = {}
    problems: list[str] = []

    for seed in SEEDS:
        c2_final = c2_dir / f"c2_s{seed}" / f"c2_s{seed}_final.json"
        c2_sha = sha256_file(c2_final) if c2_final.exists() else None
        for arm in ARMS:
            arm_l = arm.lower()
            base = d_dir / f"{arm_l}_s{seed}"
            final = base / f"{arm_l}_s{seed}_final.json"
            metrics_path = base / f"{arm_l}_s{seed}_metrics.json"
            opt_path = base / f"{arm_l}_s{seed}_optimized.json"
            ledger_path = base / f"{arm_l}_s{seed}_best.optimizer_update_ledger.jsonl"
            identity_path = base / "run_identity.json"

            if not (final.exists() and metrics_path.exists() and opt_path.exists()):
                problems.append(f"{arm} seed={seed}: 缺少 final/metrics/optimized")
                continue

            metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
            opt = json.loads(opt_path.read_text(encoding="utf-8"))
            ledger = read_ledger(ledger_path)
            ledgers[(arm, seed)] = ledger
            identity = json.loads(identity_path.read_text(encoding="utf-8")) if identity_path.exists() else {}

            lrs = [float(e["lr"]) for e in ledger]
            batch_sizes = [int(e.get("batchSize", 0)) for e in ledger]
            sources = [e.get("sources") or {} for e in ledger]

            entry = {
                "arm": arm,
                "seed": seed,
                "dir": str(base.relative_to(REPO)).replace(os.sep, "/"),
                "stopReason": metrics["lifecycle"]["stopReason"],
                "metricsUpdates": metrics["optimizerUpdates"],
                "recomputedUpdates": len(ledger),
                "metricsExposures": opt["totalExposures"],
                "recomputedExposures": sum(batch_sizes),
                "batchSizeAllCorrect": all(b == args.batch_size for b in batch_sizes) if batch_sizes else False,
                "zeroConsumptionEpochs": metrics["lifecycle"]["zeroConsumptionEpochs"],
                "epochsRecorded": metrics["lifecycle"]["epochsRecorded"],
                "bestValAcc": metrics["best_val_acc"],
                "bestEpoch": metrics["best_epoch"],
                "lastEpochTrainAcc": metrics["history"][-1]["train_acc"],
                "lastEpochValAcc": metrics["history"][-1]["val_acc"],
                "lrFirst": lrs[0] if lrs else None,
                "lrLast": lrs[-1] if lrs else None,
                "encoderSchemaId": metrics.get("encoder_schema_id"),
                "finalSha256": sha256_file(final),
                "initCheckpointSha256": identity.get("initCheckpointSha256"),
                "initExpectedSha256": c2_sha,
                "initMatchesC2Final": identity.get("initCheckpointSha256") == c2_sha,
                "rowToPositionIsIdentity": (identity.get("planRowMapping") or {}).get("rowToPositionIsIdentity"),
                "sourcesFirstUpdate": sources[0] if sources else None,
                "distinctSourceNames": sorted({k for s in sources for k in s}),
                "sourceExposureTotals": {
                    name: sum(int(s.get(name, 0)) for s in sources)
                    for name in sorted({k for s in sources for k in s})
                },
                "plannedButNeverOptimized": opt["plannedButNeverOptimized"],
            }
            if entry["recomputedUpdates"] != args.updates:
                problems.append(f"{arm} seed={seed}: 更新数 {entry['recomputedUpdates']} != {args.updates}")
            if entry["recomputedExposures"] != args.updates * args.batch_size:
                problems.append(f"{arm} seed={seed}: 曝光 {entry['recomputedExposures']} != "
                                f"{args.updates * args.batch_size}")
            if entry["stopReason"] != "GLOBAL_UPDATE_LIMIT":
                problems.append(f"{arm} seed={seed}: stopReason={entry['stopReason']}")
            if entry["zeroConsumptionEpochs"] != 0:
                problems.append(f"{arm} seed={seed}: 零消费 epoch={entry['zeroConsumptionEpochs']}")
            if not entry["batchSizeAllCorrect"]:
                problems.append(f"{arm} seed={seed}: 存在 batchSize != {args.batch_size} 的更新")
            if entry["encoderSchemaId"] != "spatial26_global20_actionSemantics53_v15":
                problems.append(f"{arm} seed={seed}: encoderSchemaId={entry['encoderSchemaId']}")
            if not entry["initMatchesC2Final"]:
                problems.append(f"{arm} seed={seed}: 初始权重与对应 C2 final 不一致")
            if abs(entry["lrFirst"] - 1e-4) > 1e-12 or abs(entry["lrLast"] - 1e-5) > 1e-12:
                problems.append(f"{arm} seed={seed}: LR 端点 {entry['lrFirst']} -> {entry['lrLast']}")
            for s in sources:
                if int(s.get("shared_old_pool", 0)) != 16 or sum(int(v) for v in s.values()) != 32:
                    problems.append(f"{arm} seed={seed}: 来源配额不是 16+16：{s}")
                    break

            per_run[(arm, seed)] = entry

    # 共享旧池序列一致性：D0 与 D1/D2 在相同 update 的前 16 个位置必须一致。
    #
    # 两个层面都要核：
    #   - plan 层：逐 update 比较 `shared_old_pool` 的 sampleId 列表（协议要求的精确核验）。
    #   - ledger 层：逐 update 比较各来源的配额计数（消费侧的一致性）。
    shared_consistency: list[dict] = []
    for seed in SEEDS:
        base_ledger = ledgers.get(("D0", seed))
        if not base_ledger:
            continue
        for other in ("D1", "D2"):
            other_ledger = ledgers.get((other, seed))
            if not other_ledger:
                continue
            same_len = len(base_ledger) == len(other_ledger)
            mismatches = 0
            checked = 0
            for a, b in zip(base_ledger, other_ledger):
                sa = a.get("sources") or {}
                sb = b.get("sources") or {}
                if int(sa.get("shared_old_pool", -1)) != int(sb.get("shared_old_pool", -1)):
                    mismatches += 1
                checked += 1
            shared_consistency.append({
                "seed": seed,
                "pair": f"D0 vs {other}",
                "ledgerLengthsEqual": same_len,
                "updatesCheckedForSharedQuota": checked,
                "sharedQuotaMismatchUpdates": mismatches,
            })
            if not same_len or mismatches:
                problems.append(f"seed={seed} {other}: 共享旧池配额与 D0 不一致"
                                f"（lenEqual={same_len}, mismatches={mismatches}）")

    # plan 层面的逐位置 sampleId 一致性（这是协议要求的精确核验）。
    plan_level: list[dict] = []
    plan_d0 = d_dir / "plan_d0.json"
    if plan_d0.exists():
        d0 = json.loads(plan_d0.read_text(encoding="utf-8"))
        d0_shared = [
            [i.get("sampleId") for i in e["items"] if i.get("source") == "shared_old_pool"]
            for e in d0["updates"]
        ]
        for other in ("d1", "d2"):
            p = d_dir / f"plan_{other}.json"
            if not p.exists():
                continue
            od = json.loads(p.read_text(encoding="utf-8"))
            o_shared = [
                [i.get("sampleId") for i in e["items"] if i.get("source") == "shared_old_pool"]
                for e in od["updates"]
            ]
            mismatched_updates = [
                idx for idx, (a, b) in enumerate(zip(d0_shared, o_shared)) if a != b
            ]
            plan_level.append({
                "pair": f"plan_d0 vs plan_{other}",
                "updatesCompared": min(len(d0_shared), len(o_shared)),
                "mismatchedUpdates": len(mismatched_updates),
                "firstMismatchUpdate": mismatched_updates[0] if mismatched_updates else None,
                "pass": len(mismatched_updates) == 0,
            })
            if mismatched_updates:
                problems.append(f"plan_d0 与 plan_{other} 的共享旧池序列在前 16 位不一致"
                                f"（首个不一致 update={mismatched_updates[0]}）")

    by_seed: dict[int, dict] = {}
    for seed in SEEDS:
        runs = {arm: per_run.get((arm, seed)) for arm in ARMS}
        if not all(runs.values()):
            continue
        by_seed[seed] = {
            "runs": runs,
            "bestVal": {arm: runs[arm]["bestValAcc"] for arm in ARMS},
            "lastVal": {arm: runs[arm]["lastEpochValAcc"] for arm in ARMS},
            "deltaBestVal_D0_minus_C2": None,
        }

    payload = {
        "schema": "v15_d_group_summary_1",
        "task": "T15-08",
        "runId": args.run_id,
        "preregistered": {
            "arms": list(ARMS), "seeds": list(SEEDS),
            "updatesPerRun": args.updates, "batchSize": args.batch_size,
            "exposuresPerRun": args.updates * args.batch_size,
            "expectedSourceQuota": "16 shared_old_pool + 16 (old control | new D1 | new D2)",
        },
        "problems": problems,
        "verification": {
            "sharedOldPoolPlanLevel": plan_level,
            "sharedOldPoolLedgerLevel": shared_consistency,
        },
        "runs": [per_run[k] for k in sorted(per_run)],
        "bySeed": by_seed,
        "note": "所有更新/曝光数均由 optimizer_update_ledger.jsonl 独立复算；"
                "本文件只覆盖受控 D 组的训练消费核验，**不含**开发对战结果。",
    }
    out = d_dir / "d_group_summary.json"
    if out.exists():
        raise SystemExit(f"拒绝覆盖已存在的产物：{out}")
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"[T15-08] runs={len(per_run)}/9 problems={len(problems)}")
    for k in sorted(per_run):
        r = per_run[k]
        print(f"  {r['arm']} seed={r['seed']}: upd={r['recomputedUpdates']} "
              f"exp={r['recomputedExposures']} best={r['bestValAcc']*100:.2f}% "
              f"sources={r['sourceExposureTotals']} initOk={r['initMatchesC2Final']}")
    for p in plan_level:
        print(f"  plan {p['pair']}: mismatchedUpdates={p['mismatchedUpdates']} pass={p['pass']}")
    for pr in problems:
        print(f"  PROBLEM {pr}")
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
