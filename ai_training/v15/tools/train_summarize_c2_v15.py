"""V15/T15-06：汇总 C2 三 seed 的真实读数（消费台账复算 + 学习曲线 + 权重身份）。

只读产物、只做复算，不重新训练。输出：
  - v15/out/<runId>/T15-06/c2_summary.json
  - v15/out/<runId>/T15-06/frozen_c2.json
  - v15/out/<runId>/T15-06/baseline_comparison.md

用法：
  python v15/tools/train_summarize_c2_v15.py --run-id v15_20260925_core
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SEEDS = (42, 1337, 2026)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--lr-max", type=float, default=1e-3)
    parser.add_argument("--lr-min", type=float, default=1e-5)
    parser.add_argument("--total-updates", type=int, default=3000)
    parser.add_argument("--batch-size", type=int, default=32)
    args = parser.parse_args()

    out_dir = REPO / "v15" / "out" / args.run_id / "T15-06"
    out_dir.mkdir(parents=True, exist_ok=True)

    per_seed = []
    failures: list[str] = []
    for seed in SEEDS:
        base = out_dir / f"c2_s{seed}"
        metrics_path = base / f"c2_s{seed}_metrics.json"
        final_path = base / f"c2_s{seed}_final.json"
        opt_path = base / f"c2_s{seed}_optimized.json"
        ledger_path = base / f"c2_s{seed}_best.optimizer_update_ledger.jsonl"
        if not (metrics_path.exists() and final_path.exists() and opt_path.exists()):
            failures.append(f"seed {seed}: 缺少 metrics/final/optimized 之一")
            continue

        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
        opt = json.loads(opt_path.read_text(encoding="utf-8"))
        ledger = read_jsonl(ledger_path)

        # 台账复算：更新数、曝光数、LR、batchSize —— 这些必须能独立重算出来。
        recomputed_updates = len(ledger)
        recomputed_exposures = sum(int(e.get("batchSize", 0)) for e in ledger)
        lrs = [float(e["lr"]) for e in ledger]
        expected_lr_first = args.lr_max
        expected_lr_last = args.lr_min

        # 来源配额（C2 只有一个来源，全量应等于 batchSize）。
        quota_ok = all(int(e.get("batchSize", 0)) == args.batch_size for e in ledger)

        per_seed.append({
            "seed": seed,
            "dir": str(base.relative_to(REPO)).replace(os.sep, "/"),
            "stopReason": metrics["lifecycle"]["stopReason"],
            "globalUpdateLimit": metrics["identity"]["globalUpdateLimit"],
            "metricsOptimizerUpdates": metrics["optimizerUpdates"],
            "recomputedUpdatesFromLedger": recomputed_updates,
            "exposuresFromConsumptionManifest": opt["totalExposures"],
            "recomputedExposuresFromLedger": recomputed_exposures,
            "batchSizeEveryUpdate": quota_ok,
            "epochsRecorded": metrics["lifecycle"]["epochsRecorded"],
            "zeroConsumptionEpochs": metrics["lifecycle"]["zeroConsumptionEpochs"],
            "degradationGuardTriggered": metrics["lifecycle"]["degradationGuardTriggered"],
            "bestValAcc": metrics["best_val_acc"],
            "bestEpoch": metrics["best_epoch"],
            "bestSelectionRule": metrics.get("bestSelectionRule"),
            "lastEpochTrainAcc": metrics["history"][-1]["train_acc"],
            "lastEpochValAcc": metrics["history"][-1]["val_acc"],
            "lrAtFirstUpdate": lrs[0] if lrs else None,
            "lrAtLastUpdate": lrs[-1] if lrs else None,
            "lrMatchesProtocolEndpoints": (
                bool(lrs) and abs(lrs[0] - expected_lr_first) < 1e-12
                and abs(lrs[-1] - expected_lr_last) < 1e-12
            ),
            "lrMonotoneNonIncreasing": all(
                lrs[i] >= lrs[i + 1] - 1e-12 for i in range(len(lrs) - 1)),
            "encoderSchemaId": metrics.get("encoder_schema_id"),
            "spatialChannels": metrics.get("spatial_channels"),
            "actionSemanticDim": metrics.get("actionSemanticDim"),
            "trainSamples": metrics["train_samples"],
            "valSamples": metrics["val_samples"],
            "uniqueOptimized": len(opt["optimizedSampleIds"]),
            "plannedButNeverOptimized": opt["plannedButNeverOptimized"],
            "datasetSha256": metrics.get("datasetSha256"),
            "batchPlan": metrics.get("batchPlan"),
            "finalPath": str(final_path.relative_to(REPO)).replace(os.sep, "/"),
            "finalSha256": sha256_file(final_path),
            "intermediate": metrics["artifacts"].get("intermediate", []),
            "missingIntermediate": metrics["artifacts"].get("missingIntermediateUpdates", []),
            "history": metrics["history"],
        })

    all_ok = (
        not failures
        and all(
            r["recomputedUpdatesFromLedger"] == args.total_updates
            and r["recomputedExposuresFromLedger"] == args.total_updates * args.batch_size
            and r["stopReason"] == "GLOBAL_UPDATE_LIMIT"
            and r["zeroConsumptionEpochs"] == 0
            and r["batchSizeEveryUpdate"]
            and r["lrMatchesProtocolEndpoints"]
            and r["plannedButNeverOptimized"] == 0
            and not r["missingIntermediate"]
            for r in per_seed
        )
    )

    summary = {
        "schema": "v15_c2_summary_1",
        "task": "T15-06",
        "runId": args.run_id,
        "preregistered": {
            "seeds": list(SEEDS),
            "totalUpdatesPerSeed": args.total_updates,
            "batchSize": args.batch_size,
            "plannedExposuresPerSeed": args.total_updates * args.batch_size,
            "lrMax": args.lr_max,
            "lrMin": args.lr_min,
            "lrSchedule": "cosine, unit=update",
        },
        "failures": failures,
        "allBudgetsRecomputed": all_ok,
        "seeds": per_seed,
        "note": "所有曝光/更新数均由 optimizer_update_ledger.jsonl 独立复算，不引用 metrics 的自我声明。",
    }
    (out_dir / "c2_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")

    frozen = {
        "schema": "v15_frozen_c2_1",
        "task": "T15-06",
        "runId": args.run_id,
        "encoderSchemaId": "spatial26_global20_actionSemantics53_v15",
        "datasetSha256": "3f7aa3766ee9fdae76cbbeb3490f3023a2aac15204432159980c0fb6473e2a62",
        "batchPlanSha256": "ab587dbb05ebb27009f6fa8ed45f5f818b1d930586170527f477b3641325984c",
        "models": [
            {
                "seed": r["seed"],
                "tag": f"C2-{r['seed']}",
                "mainEndpoint": "final@3000",
                "finalPath": r["finalPath"],
                "finalSha256": r["finalSha256"],
                "bestPath": r["finalPath"].replace("_final.json", "_best.json"),
                "bestValAcc": r["bestValAcc"],
                "bestEpoch": r["bestEpoch"],
                "intermediate": r["intermediate"],
            }
            for r in per_seed
        ],
        "note": "本轮 C2 的正式主端点（协议 §3.2）：final@3000；best 另报，不得作为等训练量比较的唯一依据。",
    }
    (out_dir / "frozen_c2.json").write_text(
        json.dumps(frozen, ensure_ascii=False, indent=1), encoding="utf-8")

    lines = [
        "# V15 C2 三 seed 基线比较",
        "",
        f"runId: `{args.run_id}`；schema: `spatial26_global20_actionSemantics53_v15`。",
        "",
        "所有更新/曝光数均由 `optimizer_update_ledger.jsonl` 独立复算。",
        "",
        "| seed | stopReason | updates | exposures | epochs | 零消费 epoch | best val | best ep | 末 epoch train | 末 epoch val | final sha256 |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for r in per_seed:
        lines.append(
            f"| {r['seed']} | {r['stopReason']} | {r['recomputedUpdatesFromLedger']} | "
            f"{r['recomputedExposuresFromLedger']} | {r['epochsRecorded']} | {r['zeroConsumptionEpochs']} | "
            f"{r['bestValAcc']*100:.2f}% | {r['bestEpoch']} | {r['lastEpochTrainAcc']*100:.2f}% | "
            f"{r['lastEpochValAcc']*100:.2f}% | `{r['finalSha256'][:16]}…` |")
    lines += [
        "",
        "## 解释边界",
        "",
        "- C1→C2 同时包含必要规则修复、标签合同（L1）、去污染与按 update 调度修正，"
        "因此**不能**把差值归因于其中任何单独一项（任务书 §7 解释边界）。",
        "- 本轮 val 是与 train 无 `policyInputKey` 交集、且 root 家族交集为 0 的干净子集；"
        "但它仍只是 8 个 val 家族的读数，不能当成总体泛化上界。",
        "- `best` 由 `clean_val_top1 → 更低 CE → 更早 update` 选出，与 final@3000 是两个不同端点。",
        "",
        "## 训练-验证差距",
        "",
    ]
    for r in per_seed:
        gap = r["lastEpochTrainAcc"] - r["lastEpochValAcc"]
        lines.append(
            f"- seed {r['seed']}：末 epoch train {r['lastEpochTrainAcc']*100:.2f}% vs val "
            f"{r['lastEpochValAcc']*100:.2f}%（差 {gap*100:.2f} 个百分点）。")
    lines += [
        "",
        "差距方向与 V14b 审核一致：训练集继续上升、验证停滞。这支持「优先调查独立数据与分布」，"
        "而不支持直接加长训练或改大网络。",
        "",
    ]
    (out_dir / "baseline_comparison.md").write_text("\n".join(lines), encoding="utf-8")

    print(f"[T15-06] seeds={len(per_seed)} failures={len(failures)} allBudgetsRecomputed={all_ok}")
    for r in per_seed:
        print(f"  seed {r['seed']}: updates={r['recomputedUpdatesFromLedger']} "
              f"exposures={r['recomputedExposuresFromLedger']} bestVal={r['bestValAcc']*100:.2f}% "
              f"lr[{r['lrAtFirstUpdate']},{r['lrAtLastUpdate']}] final={r['finalSha256'][:12]}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
