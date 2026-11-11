"""V14/T14-06：汇总一次训练运行的消费台账与学习曲线。

训练本身由 `python/train_spatial_resnet.py` 执行；本脚本只读取它的真实输出
（metrics.json / optimized.json / optimizer_update_ledger.jsonl），
不重新计算、不推断未测量的量。缺失的指标写 null 并记录原因。

用法：
    py python/v14_training_ledger.py --metrics <metrics.json> [--out <ledger.json>]
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List, Optional


def sha256_file(path: Path) -> Optional[str]:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def load_ledger(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metrics", required=True)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    metrics_path = Path(args.metrics)
    if not metrics_path.exists():
        print(f"[T14-06] 缺少 {metrics_path}")
        return 1
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))

    run_dir = metrics_path.parent
    stem = metrics_path.name.replace("_metrics.json", "").replace(".metrics.json", "")
    # 训练器把消费台账写在 --optimized-manifest 指定的路径（V14 运行里是 optimized.json），
    # 也可能是默认的 <out-model>.optimized_samples_manifest.json。全部候选都试一遍，
    # 都找不到就如实写 null，而不是猜。
    declared = metrics.get("optimizedManifest")
    candidates = [
        Path(declared) if declared else None,
        run_dir / f"{stem}.optimized_samples_manifest.json",
        run_dir / f"{stem}.optimized.json",
        run_dir / "optimized.json",
        run_dir / "optimized_samples_manifest.json",
    ]
    optimized_path = next((p for p in candidates if p is not None and p.exists()), None)
    optimized = json.loads(optimized_path.read_text(encoding="utf-8")) if optimized_path else None

    ledger_candidates = sorted(run_dir.glob("*optimizer_update_ledger.jsonl"))
    ledger_path = ledger_candidates[0] if ledger_candidates else None
    ledger_rows = load_ledger(ledger_path) if ledger_path else []

    history = metrics.get("history") or metrics.get("epochHistory") or []
    per_epoch_updates: List[Dict[str, Any]] = []
    if optimized:
        per_epoch = optimized.get("perEpoch") or {}
        for key in sorted(per_epoch, key=lambda k: int(k)):
            bucket = per_epoch[key]
            per_epoch_updates.append({
                "epoch": int(key),
                "updates": bucket.get("updates"),
                "exposures": bucket.get("exposures"),
                "policyMasked": bucket.get("policyMasked"),
                "valueMasked": bucket.get("valueMasked"),
                "valueSupervised": bucket.get("valueSupervised"),
            })

    ledger_batches = [row.get("batchSize") for row in ledger_rows]
    summary = {
        "schema": "v14_training_ledger_1",
        "task": "T14-06",
        "metricsPath": str(metrics_path).replace("\\", "/"),
        "metricsSha256": sha256_file(metrics_path),
        "optimizedManifestPath": str(optimized_path).replace("\\", "/") if optimized_path else None,
        "optimizedManifestSha256": sha256_file(optimized_path) if optimized_path else None,
        "updateLedgerPath": str(ledger_path).replace("\\", "/") if ledger_path else None,
        "updateLedgerSha256": sha256_file(ledger_path) if ledger_path else None,
        "config": {
            "modelSeed": metrics.get("modelSeed"),
            "splitSeed": metrics.get("splitSeed"),
            "dataOrderSeed": metrics.get("dataOrderSeed"),
            "batchSize": metrics.get("batchSize"),
            "lr": metrics.get("lr"),
            "epochs": metrics.get("epochs"),
            "maxStepsPerEpoch": metrics.get("maxStepsPerEpoch"),
            "globalUpdateLimit": metrics.get("globalUpdateLimit"),
            "valueWeight": metrics.get("valueWeight"),
            "lossMode": metrics.get("lossMode"),
            "modelVersion": metrics.get("model_version"),
            "encoderSchemaId": metrics.get("encoder_schema_id"),
            "spatialChannels": metrics.get("spatial_channels"),
            "numBlocks": metrics.get("num_blocks"),
            "globalPolicyPool": metrics.get("global_policy_pool"),
        },
        "data": {
            "dataset": metrics.get("dataset"),
            "datasetSha256": metrics.get("datasetSha256"),
            "trainRows": metrics.get("train_sample_count"),
            "valRows": metrics.get("val_sample_count"),
            "splitManifest": metrics.get("splitManifestPath") or metrics.get("split_manifest"),
            "splitManifestSha256": metrics.get("splitManifestSha256"),
        },
        "measuredConsumption": {
            "optimizerUpdates": (optimized or {}).get("updates"),
            "maxExampleExposures": (optimized or {}).get("maxExampleExposures"),
            "totalExposures": (optimized or {}).get("totalExposures"),
            "uniqueOptimizedSamples": (optimized or {}).get("optimizedUniqueSamples"),
            "plannedButNeverOptimized": (optimized or {}).get("plannedButNeverOptimized"),
            "policyMaskedExposures": (optimized or {}).get("policyMaskedExposures"),
            "valueSupervisedExposures": (optimized or {}).get("valueSupervisedExposures"),
            "valueMaskedExposures": (optimized or {}).get("valueMaskedExposures"),
            "ledgerEntries": len(ledger_rows) or None,
            "ledgerBatchSizeSum": sum(b for b in ledger_batches if isinstance(b, int)) if ledger_batches else None,
        },
        "perEpochUpdates": per_epoch_updates,
        "bestValidation": {
            "bestValAccuracy": metrics.get("best_val_acc") if "best_val_acc" in metrics else metrics.get("bestValAccuracy"),
            "bestEpoch": metrics.get("best_epoch") if "best_epoch" in metrics else metrics.get("bestEpoch"),
        },
        "learningCurve": history,
        "notes": [
            "总更新（globalUpdateLimit）与每 epoch 更新（maxStepsPerEpoch）是两个不同的上限，台账分别记录。",
            "唯一优化样本数来自训练后写出的 optimized manifest，不是训练前的计划清单。",
            "缺失指标写 null；不把未测量的量填 0。",
        ],
    }
    out_path = Path(args.out) if args.out else metrics_path.with_name(f"{stem}.ledger_summary.json")
    out_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[T14-06] ledger summary -> {out_path}")
    print(f"  updates={summary['measuredConsumption']['optimizerUpdates']} "
          f"exposures={summary['measuredConsumption']['totalExposures']} "
          f"uniqueOptimized={summary['measuredConsumption']['uniqueOptimizedSamples']} "
          f"bestVal={summary['bestValidation']['bestValAccuracy']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
