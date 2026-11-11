"""V14/T14-04：128 状态可拟合性预算阶梯（预登记、可复核）。

背景（本轮实测，见 T14-04/tiny_fit_alias_diagnosis.json）：
128 个 tiny 状态的目标候选输入向量**两两不同**（distinctTargetInputs=128），
同一状态内也没有与目标输入完全相同的候选，编码后的状态也没有重复。
因此上一轮 96.09% 的失败**不是输入别名**，不需要再加特征；它是优化/预算问题。

本脚本按预先声明的阶梯逐档执行，不改数据、不改特征、不换网络结构：
- L0 复现：lr 1e-3、batch 16、总更新 2000（= 上一轮配置，用于确认可复现）；
- L1 步长：lr 3e-3、batch 16、总更新 2000；
- L2 预算：lr 1e-3、batch 16、总更新 8000；
- L3 每步样本：lr 3e-3、batch 4、总更新 4000。

阶梯顺序在运行前固定，不允许看到结果后追加；每档都保存 checkpoint、metrics 与
"固定 final checkpoint 重评全部 128 状态"的 top-1。

用法：
    py v14/tools/tiny_fit_budget_ladder.py --out-dir <dir> [--rungs L0,L1,L2]
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PY = sys.executable

# 预登记阶梯：先固定顺序，再看结果。
LADDER: List[Dict[str, Any]] = [
    {"id": "L0", "lr": 1e-3, "batch": 16, "updates": 2000, "note": "复现上一轮配置"},
    {"id": "L1", "lr": 3e-3, "batch": 16, "updates": 2000, "note": "只提高步长"},
    {"id": "L2", "lr": 1e-3, "batch": 16, "updates": 8000, "note": "只提高总更新预算"},
    {"id": "L3", "lr": 3e-3, "batch": 4, "updates": 4000, "note": "步长 + 每次更新样本更少"},
]


def run(command: List[str], log_path: Path) -> Dict[str, Any]:
    started = time.time()
    proc = subprocess.run(command, cwd=str(REPO_ROOT), capture_output=True, text=True)
    elapsed = time.time() - started
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(
        "$ " + " ".join(command) + "\n\n--- stdout ---\n" + proc.stdout + "\n--- stderr ---\n" + proc.stderr,
        encoding="utf-8",
    )
    return {"command": command, "returncode": proc.returncode, "elapsedSeconds": round(elapsed, 2),
            "stdoutTail": proc.stdout[-2000:], "stderrTail": proc.stderr[-2000:]}


def main() -> int:
    parser = argparse.ArgumentParser(description="V14/T14-04 tiny-fit 预算阶梯")
    parser.add_argument("--dataset", default="v14/out/v14_20260925_t14b/T14-04/tiny_fit_input.jsonl")
    parser.add_argument("--split-manifest", default="v14/out/v14_20260925_t14b/T14-04/tiny_fit_split_manifest.json")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--rungs", default="L0,L1,L2,L3")
    parser.add_argument("--model-seed", type=int, default=42)
    parser.add_argument("--data-order-seed", type=int, default=314159)
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    wanted = {token.strip() for token in args.rungs.split(",") if token.strip()}

    summary: Dict[str, Any] = {
        "schema": "v14_tiny_fit_budget_ladder_1",
        "task": "T14-04",
        "purpose": "中文：在已证明「无输入别名」的同一份 128 状态数据上，定位记忆失败属于优化/预算问题。",
        "dataset": args.dataset,
        "splitManifest": args.split_manifest,
        "modelSeed": args.model_seed,
        "dataOrderSeed": args.data_order_seed,
        "preRegisteredLadder": LADDER,
        "rungs": [],
    }

    for rung in LADDER:
        if rung["id"] not in wanted:
            continue
        run_dir = out_dir / f"ladder_{rung['id']}"
        run_dir.mkdir(parents=True, exist_ok=True)
        model = run_dir / f"tiny_{rung['id']}.json"
        epochs = max(1, (rung["updates"] * rung["batch"] + 127) // 128 + 2)
        train_cmd = [
            PY, "python/train_spatial_resnet.py",
            "--dataset", args.dataset,
            "--split-manifest", args.split_manifest,
            "--epochs", str(epochs),
            "--batch-size", str(rung["batch"]),
            "--lr", str(rung["lr"]),
            "--global-update-limit", str(rung["updates"]),
            "--value-weight", "0",
            "--model-seed", str(args.model_seed),
            "--data-order-seed", str(args.data_order_seed),
            "--split-seed", str(args.model_seed),
            "--out-model", str(model),
            "--out-last-model", str(run_dir / f"tiny_{rung['id']}_last.json"),
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
            "--checkpoint", str(model),
            "--out-dir", str(run_dir),
            "--forward-only",
        ]
        record["evaluate"] = run(eval_cmd, run_dir / "evaluate.log")
        diag_path = run_dir / "tiny_fit_forward_eval.json"
        if diag_path.exists():
            diag = json.loads(diag_path.read_text(encoding="utf-8"))
            record["top1"] = diag.get("top1")
            record["top1Correct"] = diag.get("top1Correct")
            record["failures"] = [
                {"sampleId": f["sampleId"], "targetActionCode": f["targetActionCode"], "targetRank": f["targetRank"]}
                for f in diag.get("failures", [])
            ]
        summary["rungs"].append(record)
        print(f"[T14-04] {rung['id']} lr={rung['lr']} batch={rung['batch']} updates={rung['updates']} "
              f"top1={record.get('top1')}")

    (out_dir / "tiny_fit_budget_ladder.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    print("[T14-04] -> " + str(out_dir / "tiny_fit_budget_ladder.json"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
