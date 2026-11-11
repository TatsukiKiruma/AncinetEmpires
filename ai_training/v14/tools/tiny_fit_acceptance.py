"""V14/T14-04：128 状态可拟合性的**验收运行**（G2 判据）。

本脚本只做验收，不探索超参：
配置由 `v14/tools/tiny_fit_ladder_v2.py` 的预登记阶梯定位（模型侧混淆因素），
此处固定为 M3 档：
    lr=1e-3、constant、weight-decay=0、batch=16、总更新 8000、32ch/2res、CE、value_weight=0。

为什么是这套配置（反例修复链，全部有本轮原始记录）：
1. 上一轮 96.09% 的失败不是输入别名 —— `tiny_fit_alias_diagnosis.json` 实测
   128 个目标候选输入两两不同、同行无重复、状态编码无重复、招募 one-hot 99/99 齐全；
2. `--out-model`（best-val）在单行 val 上退化为随机早停（best@epoch 9 → 58.59%），
   必须评停止时的最终检查点；本脚本统一评 `*_last.json`；
3. 逐档隔离显示：constant 调度把 96.88% → 96.88%（单独无效），
   去掉 weight decay 后 → 98.44%，把总更新提到 8000 → 100%。
   即真正的瓶颈是「权重衰减 + 总更新预算」，不是网络容量，也不需要新特征。

用法：
    py v14/tools/tiny_fit_acceptance.py --out-dir <dir> [--seeds 42,1337,2026]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PY = sys.executable

# 验收配置：来自预登记阶梯 M3；不再按结果调整。
ACCEPTANCE = {
    "lr": 1e-3,
    "lrSchedule": "constant",
    "weightDecay": 0.0,
    "batch": 16,
    "updates": 8000,
    "valueWeight": 0,
    "blocks": 2,
    "trunkChannels": 32,
}


def run(command: List[str], log_path: Path) -> Dict[str, Any]:
    started = time.time()
    proc = subprocess.run(command, cwd=str(REPO_ROOT), capture_output=True, text=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(
        "$ " + " ".join(command) + "\n\n--- stdout ---\n" + proc.stdout + "\n--- stderr ---\n" + proc.stderr,
        encoding="utf-8",
    )
    return {
        "command": command, "returncode": proc.returncode, "elapsedSeconds": round(time.time() - started, 2),
        "stdoutTail": proc.stdout[-1500:], "stderrTail": proc.stderr[-1500:],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V14/T14-04 tiny-fit 验收")
    parser.add_argument("--dataset", default="v14/out/v14_20260925_t14b/T14-04/tiny_fit_input.jsonl")
    parser.add_argument("--split-manifest", default="v14/out/v14_20260925_t14b/T14-04/tiny_fit_split_manifest.json")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--seeds", default="42,1337,2026")
    parser.add_argument("--data-order-seed", type=int, default=314159)
    # 中文：阶段名只用于区分「预登记的 M3 预算」与「预算延长」两批，
    # 避免把不同预算的结果混在同一张表里当作同一配置。
    parser.add_argument("--stage", default="stageA")
    parser.add_argument("--updates", type=int, default=None, help="覆盖接受度预算（默认用 M3 的 8000）")
    parser.add_argument("--merge-existing", action="store_true",
                        help="把已有 tiny_fit_acceptance.json 中不同 stage 的记录一并保留")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    seeds = [int(token) for token in args.seeds.split(",") if token.strip()]
    updates = int(args.updates) if args.updates else ACCEPTANCE["updates"]

    prior_stages: List[Dict[str, Any]] = []
    existing_path = out_dir / "tiny_fit_acceptance.json"
    if args.merge_existing and existing_path.exists():
        existing = json.loads(existing_path.read_text(encoding="utf-8"))
        prior_stages = [r for r in (existing.get("stages") or []) if r.get("stage") != args.stage]
        for legacy in (existing.get("runs") or []):
            prior_stages.append({"stage": existing.get("stage", "stageA"), "runs": [legacy]})

    report: Dict[str, Any] = {
        "schema": "v14_tiny_fit_acceptance_1",
        "task": "T14-04",
        "diagnostic": True,
        "note": "这是训练集记忆能力诊断，不是泛化指标：被评估的状态就是被优化的状态。",
        "dataset": args.dataset,
        "splitManifest": args.split_manifest,
        "acceptanceTarget": 0.99,
        "acceptanceRule": "≥99%（128 状态至少 127 个）；用停止时的最终检查点重评全部 128 状态。",
        "config": ACCEPTANCE,
        "configProvenance": "v14/tools/tiny_fit_ladder_v2.py（预登记阶梯）M3 档；反例链见本文件 docstring。",
        "dataOrderSeed": args.data_order_seed,
        "runs": [],
    }

    for seed in seeds:
        run_dir = out_dir / f"accept_{args.stage}_s{seed}"
        run_dir.mkdir(parents=True, exist_ok=True)
        best_model = run_dir / f"tiny_s{seed}.json"
        last_model = run_dir / f"tiny_s{seed}_last.json"
        epochs = max(1, (updates * ACCEPTANCE["batch"] + 126) // 127 + 2)
        train_cmd = [
            PY, "python/train_spatial_resnet.py",
            "--dataset", args.dataset,
            "--split-manifest", args.split_manifest,
            "--epochs", str(epochs),
            "--batch-size", str(ACCEPTANCE["batch"]),
            "--lr", str(ACCEPTANCE["lr"]),
            "--lr-schedule", ACCEPTANCE["lrSchedule"],
            "--weight-decay", str(ACCEPTANCE["weightDecay"]),
            "--global-update-limit", str(updates),
            "--value-weight", str(ACCEPTANCE["valueWeight"]),
            "--num-blocks", str(ACCEPTANCE["blocks"]),
            "--model-seed", str(seed),
            "--data-order-seed", str(args.data_order_seed),
            "--split-seed", str(seed),
            "--out-model", str(best_model),
            "--out-last-model", str(last_model),
            "--out-state", str(run_dir / f"tiny_s{seed}.state.pt"),
            "--out-metrics", str(run_dir / f"tiny_s{seed}_metrics.json"),
            "--planned-manifest", str(run_dir / "planned.json"),
            "--optimized-manifest", str(run_dir / "optimized.json"),
        ]
        record: Dict[str, Any] = {"stage": args.stage, "modelSeed": seed,
                                  "epochsRequested": epochs, "updatesRequested": updates}
        # 中文：可恢复 —— 若该 seed 的最终检查点与重评结果都已存在，直接复用，不重复烧算力。
        # 复用条件写进记录，避免把「上次跑的结果」当成「这次跑出来的」。
        reuse = last_model.exists() and (run_dir / "tiny_fit_forward_eval.json").exists()
        if reuse:
            record["reusedExistingCheckpoint"] = True
            record["train"] = {"skipped": "复用已存在的最终检查点与重评结果（同一配置、同一 seed）"}
        else:
            record["train"] = run(train_cmd, run_dir / "train.log")

        # 中文：验收重评只认停止时的最终检查点（final checkpoint），与任务书一致。
        if reuse:
            record["evaluate"] = {"skipped": "复用已存在的 tiny_fit_forward_eval.json"}
        else:
            eval_cmd = [
                PY, "v14/tools/diag_tiny_fit_alias.py",
                "--dataset", args.dataset,
                "--checkpoint", str(last_model),
                "--out-dir", str(run_dir),
                "--forward-only",
            ]
            record["evaluate"] = run(eval_cmd, run_dir / "evaluate.log")
        eval_path = run_dir / "tiny_fit_forward_eval.json"
        if eval_path.exists():
            diag = json.loads(eval_path.read_text(encoding="utf-8"))
            record["top1"] = diag.get("top1")
            record["top1Correct"] = diag.get("top1Correct")
            record["states"] = diag.get("states")
            record["failures"] = diag.get("failures", [])
        metrics_path = run_dir / f"tiny_s{seed}_metrics.json"
        if metrics_path.exists():
            metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
            record["optimizerUpdates"] = metrics.get("optimizerUpdates")
            record["epochsCompleted"] = metrics.get("epochsCompleted")
            history = metrics.get("history") or []
            record["bestTrainAcc"] = max((h.get("train_acc") or 0.0) for h in history) if history else None
            record["finalTrainAcc"] = history[-1].get("train_acc") if history else None
            record["finalTrainLoss"] = history[-1].get("train_loss") if history else None
            record["firstTrainAcc"] = history[0].get("train_acc") if history else None
            record["epochsToFirstFullTrainFit"] = next(
                (h["epoch"] for h in history if (h.get("train_acc") or 0) >= 0.99), None,
            )
        else:
            record["metricsMissing"] = True
        optimized_path = run_dir / "optimized.json"
        if optimized_path.exists():
            optimized = json.loads(optimized_path.read_text(encoding="utf-8"))
            # 中文：consumption manifest 的字段是 optimizedUniqueSamples（V11 口径），
            # 且顶层 measured 是布尔标记而不是字典；按真实结构读取，避免把结构猜错。
            record["optimizerUpdatesMeasured"] = optimized.get("updates")
            record["totalExposures"] = optimized.get("totalExposures")
            record["uniqueOptimizedSamples"] = optimized.get("optimizedUniqueSamples")
            record["plannedButNeverOptimized"] = optimized.get("plannedButNeverOptimized")
        record["acceptancePassed"] = bool(record.get("top1") is not None and record["top1"] >= 0.99)
        report["runs"].append(record)
        print(f"[T14-04] seed={seed} top1={record.get('top1')} "
              f"({record.get('top1Correct')}/{record.get('states')}) "
              f"updates={record.get('optimizerUpdates')} passed={record['acceptancePassed']}")

    passed = [r for r in report["runs"] if r.get("acceptancePassed")]
    stage_record = {
        "stage": args.stage,
        "updates": updates,
        "seeds": seeds,
        "seedsPassed": len(passed),
        "allPassed": len(passed) == len(seeds),
        "minTop1": min((r.get("top1") or 0.0) for r in report["runs"]) if report["runs"] else None,
        "runs": report["runs"],
    }
    report["stages"] = prior_stages + [stage_record]
    report["summary"] = {
        "stages": [{k: v for k, v in item.items() if k != "runs"} for item in report["stages"]],
        "allStagesPassed": all(item.get("allPassed") for item in report["stages"]),
        "bestStageMinTop1": max((item.get("minTop1") or 0.0) for item in report["stages"])
        if report["stages"] else None,
    }
    (out_dir / "tiny_fit_acceptance.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    print("[T14-04] -> " + str(out_dir / "tiny_fit_acceptance.json"))
    return 0 if stage_record["allPassed"] else 4


if __name__ == "__main__":
    raise SystemExit(main())
