"""运行 coverage full 的单臂长预算拟合诊断。

该工具从 θ1 重新开始同一条确定性轨迹，不使用 resume。前 662 个更新必须与
既有 trunk_full 的 batch plan 逐项相同；662 之后学习率固定在 1e-5。
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import random
import subprocess
import sys
import time
from typing import Any


TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))
import run_coverage_training as base  # noqa: E402


SCHEMA = "v19-coverage-fit-budget-identity-v1"
EXPOSURES = 16
TOTAL_UPDATES = 2648
LR_TOTAL_UPDATES = 662
SAVE_POINTS = [662, 1324, 2648]
OLD_PLAN = Path("v19/out/coverage_20261004/training/trunk_full/batch_plan.json")


def make_fit_plan(train_rows: list[tuple[int, str]]) -> dict[str, Any]:
    """生成约16次曝光的确定性计划，随机流与旧四曝光计划同源。"""
    updates = math.ceil(len(train_rows) * EXPOSURES / base.BATCH_SIZE)
    if len(train_rows) == 5295 and updates != TOTAL_UPDATES:
        raise ValueError(f"5295 行的16曝光预算应为 {TOTAL_UPDATES} updates，实际 {updates}")
    rng = random.Random(base.DATA_ORDER_SEED)
    stream: list[tuple[int, str]] = []
    while len(stream) < updates * base.BATCH_SIZE:
        cycle = train_rows.copy()
        rng.shuffle(cycle)
        stream.extend(cycle)
    stream = stream[:updates * base.BATCH_SIZE]
    return {
        "schema": "v15_batch_plan_1",
        "batchSize": base.BATCH_SIZE,
        "updatesPerEpoch": base.UPDATES_PER_EPOCH,
        "totalUpdates": updates,
        "sources": [{"name": "current_rules_coverage", "quota": base.BATCH_SIZE}],
        "updates": [
            {
                "updateIndex": update,
                "items": [
                    {"datasetRow": row, "sampleId": sample_id, "source": "current_rules_coverage"}
                    for row, sample_id in stream[
                        update * base.BATCH_SIZE:(update + 1) * base.BATCH_SIZE
                    ]
                ],
            }
            for update in range(updates)
        ],
    }


def assert_prefix_identical(long_plan: dict[str, Any], old_plan: dict[str, Any]) -> None:
    """拒绝任何会改变既有 trunk_full 前662步轨迹的计划。"""
    for field in ("schema", "batchSize", "updatesPerEpoch", "sources"):
        if long_plan.get(field) != old_plan.get(field):
            raise ValueError(f"长预算计划与旧计划的 {field} 不一致")
    old_updates = old_plan.get("updates")
    if not isinstance(old_updates, list) or len(old_updates) != LR_TOTAL_UPDATES:
        raise ValueError(f"旧 trunk_full 计划必须恰有 {LR_TOTAL_UPDATES} updates")
    if long_plan.get("updates", [])[:LR_TOTAL_UPDATES] != old_updates:
        raise ValueError("长预算计划前662个 batch 与旧 trunk_full 不一致")


def build_command(dataset: Path, split: Path, plan_path: Path, out_dir: Path) -> list[str]:
    return [
        sys.executable, str(base.TRAINER), "--dataset", str(dataset),
        "--split-manifest", str(split), "--batch-plan", str(plan_path),
        "--epochs", str(math.ceil(TOTAL_UPDATES / base.UPDATES_PER_EPOCH)),
        "--global-update-limit", str(TOTAL_UPDATES), "--batch-size", str(base.BATCH_SIZE),
        "--lr", "0.0001", "--lr-min", "0.00001", "--lr-schedule", "cosine-to-min",
        "--lr-schedule-unit", "update", "--lr-total-updates", str(LR_TOTAL_UPDATES),
        "--save-at-updates", ",".join(map(str, SAVE_POINTS)), "--num-blocks", "2",
        "--spatial-channels", "34", "--encoder-schema-id", base.ENCODER_SCHEMA,
        "--model-version", "spatial-resnet-v2", "--init-checkpoint", str(base.INIT),
        "--trainable-parts", "trunk,policy", "--value-weight", "0",
        "--value-loss-normalize", "valid-mask", "--loss-mode", "ce",
        "--model-seed", "42", "--data-order-seed", str(base.DATA_ORDER_SEED),
        "--out-model", str(out_dir / "best.json"),
        "--out-final-model", str(out_dir / "final.json"),
        "--out-metrics", str(out_dir / "metrics.json"),
        "--planned-manifest", str(out_dir / "planned.json"),
        "--optimized-manifest", str(out_dir / "optimized.json"),
    ]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="运行 coverage full 16曝光拟合预算诊断")
    parser.add_argument("--pilot", type=Path, default=Path("v19/out/coverage_20261004/pilot"))
    parser.add_argument("--old-plan", type=Path, default=OLD_PLAN)
    parser.add_argument(
        "--out-dir", type=Path,
        default=Path("v19/out/coverage_fit_20261004/trunk_ce16"),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.out_dir.exists():
        raise FileExistsError(f"拒绝覆盖现有训练输出：{args.out_dir}")
    dataset, split, report, split_data, coverage_manifest_sha = base.validate_inputs(
        args.pilot, "full"
    )
    train_families = split_data.get("trainRootFamilies")
    base._require(
        isinstance(train_families, list) and all(isinstance(item, str) for item in train_families),
        "split 缺少 trainRootFamilies",
    )
    train_rows, validation_rows = base.inspect_dataset(dataset, set(train_families))
    base._require(len(train_rows) == 5295, f"full训练行应为5295，实际 {len(train_rows)}")
    base._require(validation_rows == 885, f"固定验证行应为885，实际 {validation_rows}")
    plan = make_fit_plan(train_rows)
    base._require(int(plan["totalUpdates"]) == TOTAL_UPDATES, "长预算更新数不符")
    base._require(args.old_plan.is_file(), f"缺少旧 trunk_full batch plan：{args.old_plan}")
    old_plan = base.read_json(args.old_plan)
    # 同时核对由当前纯函数重建的四曝光计划，避免只信任任意旧文件。
    regenerated_old = base.make_plan(train_rows)
    base._require(regenerated_old == old_plan, "旧 batch plan 与当前固定种子重建结果不一致")
    assert_prefix_identical(plan, old_plan)

    args.out_dir.mkdir(parents=True)
    plan_path = args.out_dir / "batch_plan.json"
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    command = build_command(dataset, split, plan_path, args.out_dir)
    identity = {
        "schema": SCHEMA,
        "kind": "v19-current-rule-coverage-offline-fit-budget",
        "outputIdentity": "offline fit diagnostic; not deployed; no game-strength claim",
        "promotionAllowed": False,
        "independentGameStrengthEvidence": False,
        "level": "full",
        "arm": "trunk_ce16",
        "availableTrainRows": len(train_rows),
        "validationRowsExcludedFromPlan": validation_rows,
        "plannedExposures": TOTAL_UPDATES * base.BATCH_SIZE,
        "nominalExposuresPerTrainRow": TOTAL_UPDATES * base.BATCH_SIZE / len(train_rows),
        "updates": TOTAL_UPDATES,
        "updatesPerEpoch": base.UPDATES_PER_EPOCH,
        "epochs": math.ceil(TOTAL_UPDATES / base.UPDATES_PER_EPOCH),
        "batchSize": base.BATCH_SIZE,
        "checkpoints": SAVE_POINTS,
        "initialModelSha256": base.INIT_SHA256,
        "architecture": {
            "spatialChannels": 34, "globalDim": 20, "actionSemanticDim": 53,
            "numBlocks": 2, "globalPolicyPool": False,
        },
        "optimization": {
            "trainableParts": ["trunk", "policy"], "valueWeight": 0,
            "lossMode": "ce", "lr": 1e-4, "lrMin": 1e-5,
            "lrSchedule": "cosine-to-min-by-update-clamped-after-u662",
            "lrTotalUpdates": LR_TOTAL_UPDATES,
            "lowLrContinuationUpdates": TOTAL_UPDATES - LR_TOTAL_UPDATES,
            "modelSeed": 42, "dataOrderSeed": base.DATA_ORDER_SEED, "cpuThreads": 2,
            "resumeUsed": False,
        },
        "prefixContract": {
            "updates": LR_TOTAL_UPDATES,
            "oldPlanPath": str(args.old_plan.resolve()),
            "oldPlanSha256": base.file_sha256(args.old_plan),
            "regeneratedOldPlanIdentical": True,
            "longPlanPrefixIdentical": True,
        },
        "coverageSourceManifestSha256": coverage_manifest_sha,
        "command": command,
        "sourceSha256": {
            str(path): base.file_sha256(path)
            for path in (
                dataset, split, report, args.pilot / "manifest.json", base.INIT,
                base.TRAINER, base.MODEL, Path(base.__file__), Path(__file__), args.old_plan,
            )
        },
    }
    (args.out_dir / "experiment_identity.json").write_text(
        json.dumps(identity, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    env = dict(
        os.environ, OMP_NUM_THREADS="2", MKL_NUM_THREADS="2", OPENBLAS_NUM_THREADS="2",
        NUMEXPR_NUM_THREADS="2", PYTHONIOENCODING="utf-8",
    )
    started = time.monotonic()
    with (args.out_dir / "train.log").open("w", encoding="utf-8") as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, env=env, check=False)
    outcome = {
        "returnCode": result.returncode,
        "elapsedSeconds": time.monotonic() - started,
        "level": "full", "arm": "trunk_ce16", "identity": "offline_fit_diagnostic",
    }
    (args.out_dir / "process_result.json").write_text(
        json.dumps(outcome, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(outcome, ensure_ascii=False))
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
