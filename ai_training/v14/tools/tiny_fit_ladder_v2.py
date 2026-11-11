"""V14/T14-04：128 状态可拟合性的混淆因素阶梯（预登记、可复核）。

背景（本轮实测，见 T14-04/tiny_fit_alias_diagnosis.json）：
- 128 个 tiny 状态的目标候选输入向量两两不同（distinctTargetInputs=128），
  同一状态内也没有与目标输入完全相同的候选，编码后的状态也没有重复；
- 因此上一轮的 96.09% **不是输入别名**，不需要补特征，属于优化/预算问题。

第二轮定位（本轮实测，见 T14-04/train_collapse_diagnosis.json 与 ladder 日志）：
- 用 `--out-model`（历史语义 = best-val）评测得到 58.59%，用停止时的最终检查点
  评测得到 96.09% —— 说明当 val 只有 1 行时 best-val 退化为随机早停（best@epoch 9）。
  记忆诊断必须评**停止时的最终检查点**，本阶梯统一评 `*_last.json`。
- 训练日志在最后一个 epoch 出现 train_loss=0 且 train_acc=0，但同一 state.pt 重评是
  96.09% 且 logits 有限（无退化状态）—— 这是训练曲线的上报异常，不是权重崩塌；
  它与最终记忆上限无关，单列记录。

因此本轮按**预先声明**的阶梯逐档隔离混淆因素，不改数据、不改特征、不换网络结构：
  M0 基准  ：lr=1e-3, cosine, wd=1e-4, batch=16, 2000 更新（复现）
  M1 调度  ：lr=1e-3, constant, wd=1e-4, batch=16, 2000 更新（隔离学习率归零）
  M2 正则  ：lr=1e-3, constant, wd=0,   batch=16, 2000 更新（隔离权重衰减）
  M3 预算  ：lr=1e-3, constant, wd=0,   batch=16, 8000 更新（隔离预算）
  M4 步长  ：lr=3e-3, constant, wd=0,   batch=16, 8000 更新（隔离步长）
  M5 批大小：lr=3e-3, constant, wd=0,   batch=4,  8000 更新（隔离每次更新的样本数）

用法：
    py v14/tools/tiny_fit_ladder_v2.py --out-dir <dir> [--rungs M0,M1]
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

LADDER: List[Dict[str, Any]] = [
    {"id": "M0", "lr": 1e-3, "schedule": "cosine", "weightDecay": 1e-4, "batch": 16, "updates": 2000,
     "note": "复现上一轮配置"},
    {"id": "M1", "lr": 1e-3, "schedule": "constant", "weightDecay": 1e-4, "batch": 16, "updates": 2000,
     "note": "隔离学习率调度（是否提前归零）"},
    {"id": "M2", "lr": 1e-3, "schedule": "constant", "weightDecay": 0.0, "batch": 16, "updates": 2000,
     "note": "隔离权重衰减"},
    {"id": "M3", "lr": 1e-3, "schedule": "constant", "weightDecay": 0.0, "batch": 16, "updates": 8000,
     "note": "隔离总更新预算"},
    {"id": "M4", "lr": 3e-3, "schedule": "constant", "weightDecay": 0.0, "batch": 16, "updates": 8000,
     "note": "隔离步长"},
    {"id": "M5", "lr": 3e-3, "schedule": "constant", "weightDecay": 0.0, "batch": 4, "updates": 8000,
     "note": "隔离每次更新的样本数"},
]


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
    parser = argparse.ArgumentParser(description="V14/T14-04 tiny-fit 混淆因素阶梯 v2")
    parser.add_argument("--dataset", default="v14/out/v14_20260925_t14b/T14-04/tiny_fit_input.jsonl")
    parser.add_argument("--split-manifest", default="v14/out/v14_20260925_t14b/T14-04/tiny_fit_split_manifest.json")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--rungs", default=",".join(rung["id"] for rung in LADDER))
    parser.add_argument("--model-seed", type=int, default=42)
    parser.add_argument("--data-order-seed", type=int, default=314159)
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    wanted = {token.strip() for token in args.rungs.split(",") if token.strip()}

    summary: Dict[str, Any] = {
        "schema": "v14_tiny_fit_ladder_v2_1",
        "task": "T14-04",
        "purpose": "中文：在已证明「无输入别名」的同一份 128 状态数据上逐档隔离优化/预算混淆因素。",
        "dataset": args.dataset,
        "splitManifest": args.split_manifest,
        "modelSeed": args.model_seed,
        "dataOrderSeed": args.data_order_seed,
        "evaluationCheckpoint": "停止时的最终检查点（*_last.json）；best-val 在单行 val 上会退化为随机早停。",
        "preRegisteredLadder": LADDER,
        "rungs": [],
    }

    for rung in LADDER:
        if rung["id"] not in wanted:
            continue
        run_dir = out_dir / f"ladder2_{rung['id']}"
        run_dir.mkdir(parents=True, exist_ok=True)
        best_model = run_dir / f"tiny_{rung['id']}.json"
        last_model = run_dir / f"tiny_{rung['id']}_last.json"
        epochs = max(1, (rung["updates"] * rung["batch"] + 126) // 127 + 2)
        train_cmd = [
            PY, "python/train_spatial_resnet.py",
            "--dataset", args.dataset,
            "--split-manifest", args.split_manifest,
            "--epochs", str(epochs),
            "--batch-size", str(rung["batch"]),
            "--lr", str(rung["lr"]),
            "--lr-schedule", str(rung["schedule"]),
            "--weight-decay", str(rung["weightDecay"]),
            "--global-update-limit", str(rung["updates"]),
            "--value-weight", "0",
            "--model-seed", str(args.model_seed),
            "--data-order-seed", str(args.data_order_seed),
            "--split-seed", str(args.model_seed),
            "--out-model", str(best_model),
            "--out-last-model", str(last_model),
            "--out-state", str(run_dir / f"tiny_{rung['id']}.state.pt"),
            "--out-metrics", str(run_dir / f"tiny_{rung['id']}_metrics.json"),
            "--planned-manifest", str(run_dir / "planned.json"),
            "--optimized-manifest", str(run_dir / "optimized.json"),
        ]
        record: Dict[str, Any] = {"id": rung["id"], "config": rung, "epochsRequested": epochs}
        record["train"] = run(train_cmd, run_dir / "train.log")

        eval_cmd = [
            PY, "v14/tools/diag_tiny_fit_alias.py",
            "--dataset", args.dataset,
            "--checkpoint", str(last_model),
            "--out-dir", str(run_dir),
            "--forward-only",
        ]
        record["evaluate"] = run(eval_cmd, run_dir / "evaluate.log")
        diag_path = run_dir / "tiny_fit_forward_eval.json"
        if diag_path.exists():
            diag = json.loads(diag_path.read_text(encoding="utf-8"))
            record["top1Final"] = diag.get("top1")
            record["top1CorrectFinal"] = diag.get("top1Correct")
            record["failures"] = [
                {"sampleId": f["sampleId"], "targetActionCode": f["targetActionCode"],
                 "targetRank": f["targetRank"], "candidateCount": f["candidateCount"]}
                for f in diag.get("failures", [])
            ]
        metrics_path = run_dir / f"tiny_{rung['id']}_metrics.json"
        if metrics_path.exists():
            metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
            record["optimizerUpdates"] = metrics.get("optimizerUpdates")
            record["epochsCompleted"] = metrics.get("epochsCompleted")
            record["bestValAcc"] = metrics.get("best_val_acc")
            history = metrics.get("history") or []
            record["bestTrainAcc"] = max((h.get("train_acc") or 0.0) for h in history) if history else None
            record["lastTrainAcc"] = history[-1].get("train_acc") if history else None
            record["lastTrainLoss"] = history[-1].get("train_loss") if history else None
        summary["rungs"].append(record)
        print(f"[T14-04] {rung['id']} lr={rung['lr']} {rung['schedule']} wd={rung['weightDecay']} "
              f"batch={rung['batch']} updates={rung['updates']} top1Final={record.get('top1Final')} "
              f"bestTrainAcc={record.get('bestTrainAcc')}")

    (out_dir / "tiny_fit_ladder_v2.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    print("[T14-04] -> " + str(out_dir / "tiny_fit_ladder_v2.json"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
