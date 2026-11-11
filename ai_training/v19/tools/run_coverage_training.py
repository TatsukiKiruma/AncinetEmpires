"""执行 V19 当前规则覆盖训练对照；只产出离线候选，不部署模型。"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import random
import subprocess
import sys
import time
from typing import Any


SCHEMA = "v19-coverage-pilot-bc34x53-v1"
COMPARISON_AXIS = "same75families-state-coverage"
LOSS_CONTRACT_ID = "hard-ce-only-no-teacher-scores-v1"
ENCODER_SCHEMA = "spatial34_global20_actionSemantics53_v19"
INIT = Path("v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json")
INIT_SHA256 = "0089afe67e14462819bcc80601180e690327c40400b1aa9bd0bad03f19a30b47"
TRAINER = Path("v17/tools/train_v17.py")
MODEL = Path("python/spatial_resnet_model.py")
BATCH_SIZE = 32
UPDATES_PER_EPOCH = 64
DATA_ORDER_SEED = 261004001


def file_sha256(path: Path) -> str:
    """分块计算大文件 SHA，避免将 GB 级文件整体读入内存。"""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON 顶层必须是对象：{path}")
    return value


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def inspect_dataset(path: Path, train_families: set[str]) -> tuple[list[tuple[int, str]], int]:
    """流式验证数据合同，只保留训练行号和 sampleId。"""
    train_rows: list[tuple[int, str]] = []
    validation_rows = 0
    seen_samples: set[str] = set()
    dataset_row = -1
    with path.open("r", encoding="utf-8") as handle:
        for line_number, text in enumerate(handle, 1):
            if not text.strip():
                continue
            dataset_row += 1
            row = json.loads(text)
            where = f"{path}:{line_number}"
            _require(row.get("encoderSchemaId") == ENCODER_SCHEMA, f"{where} schema 不符")
            _require(row.get("policyLossMask") is True, f"{where} policyLossMask 必须为 true")
            _require(row.get("valueLossMask") is False, f"{where} valueLossMask 必须为 false")
            family = row.get("rootFamilyId")
            sample_id = row.get("sampleId")
            _require(isinstance(family, str) and family, f"{where} 缺少 rootFamilyId")
            _require(isinstance(sample_id, str) and sample_id, f"{where} 缺少 sampleId")
            _require(sample_id not in seen_samples, f"{where} sampleId 重复：{sample_id}")
            seen_samples.add(sample_id)
            split = row.get("split")
            if family in train_families:
                _require(split == "train", f"{where} 训练家族行未标记为 train")
                train_rows.append((dataset_row, sample_id))
            else:
                _require(split == "validation", f"{where} 非训练家族行不是 validation")
                validation_rows += 1
    _require(bool(train_rows), "训练分区为空")
    _require(validation_rows > 0, "验证分区为空")
    return train_rows, validation_rows


def make_plan(train_rows: list[tuple[int, str]]) -> dict[str, Any]:
    """生成四次曝光向上取整后的完整 batch；validation 永不进入计划。"""
    updates = math.ceil(len(train_rows) * 4 / BATCH_SIZE)
    rng = random.Random(DATA_ORDER_SEED)
    stream: list[tuple[int, str]] = []
    while len(stream) < updates * BATCH_SIZE:
        cycle = train_rows.copy()
        rng.shuffle(cycle)
        stream.extend(cycle)
    stream = stream[:updates * BATCH_SIZE]
    return {
        "schema": "v15_batch_plan_1",
        "batchSize": BATCH_SIZE,
        "updatesPerEpoch": UPDATES_PER_EPOCH,
        "totalUpdates": updates,
        "sources": [{"name": "current_rules_coverage", "quota": BATCH_SIZE}],
        "updates": [
            {
                "updateIndex": update,
                "items": [
                    {"datasetRow": row, "sampleId": sample_id, "source": "current_rules_coverage"}
                    for row, sample_id in stream[update * BATCH_SIZE:(update + 1) * BATCH_SIZE]
                ],
            }
            for update in range(updates)
        ],
    }


def save_points(total_updates: int) -> list[int]:
    points = {max(1, round(total_updates * fraction)) for fraction in (0.25, 0.5, 1.0)}
    if total_updates >= 250:
        points.add(250)
    return sorted(points)


def validate_inputs(pilot: Path, level: str) -> tuple[Path, Path, Path, dict[str, Any], str]:
    manifest_path = pilot / "manifest.json"
    dataset = pilot / level / "dataset.jsonl"
    split = pilot / level / "split.json"
    report_path = pilot / level / "report.json"
    for path in (manifest_path, dataset, split, report_path, INIT, TRAINER, MODEL):
        _require(path.is_file(), f"缺少输入：{path}")
    manifest, split_data, report = map(read_json, (manifest_path, split, report_path))
    _require(manifest.get("schema") == SCHEMA, "coverage manifest schema 不符")
    _require(manifest.get("comparisonAxis") == COMPARISON_AXIS, "coverage comparisonAxis 不符")
    _require(manifest.get("lossContractId") == LOSS_CONTRACT_ID, "coverage lossContractId 不符")
    _require(manifest.get("teacherScoreUsage", "").startswith("forbidden"), "数据未禁止 soft teacher 分数")
    _require(split_data.get("schema") == SCHEMA and split_data.get("level") == level
             and split_data.get("comparisonAxis") == COMPARISON_AXIS, "split 身份不符")
    _require(report.get("schema") == SCHEMA and report.get("level") == level
             and report.get("comparisonAxis") == COMPARISON_AXIS, "report 身份不符")
    artifacts = report.get("artifacts") or {}
    dataset_sha, split_sha, report_sha = file_sha256(dataset), file_sha256(split), file_sha256(report_path)
    _require(artifacts.get("dataset.jsonl") == dataset_sha, "dataset SHA 与 report 不符")
    _require(artifacts.get("split.json") == split_sha, "split SHA 与 report 不符")
    level_manifest = (manifest.get("levels") or {}).get(level) or {}
    _require(level_manifest.get("reportSha256") == report_sha, "report SHA 与 coverage manifest 不符")
    _require(file_sha256(INIT) == INIT_SHA256, "固定 θ1 初始模型身份变化")
    return dataset, split, report_path, split_data, file_sha256(manifest_path)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="运行 V19 当前规则覆盖训练对照")
    parser.add_argument("--pilot", required=True, type=Path)
    parser.add_argument("--level", required=True, choices=["one_third", "two_thirds", "full"])
    parser.add_argument("--arm", required=True, choices=["trunk_ce", "head_ce", "head_kl"])
    parser.add_argument("--out-dir", required=True, type=Path)
    args = parser.parse_args(argv)
    if args.arm != "trunk_ce" and args.level != "full":
        parser.error("head_ce/head_kl 只允许 --level full")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.out_dir.exists():
        raise FileExistsError(f"拒绝覆盖现有训练输出：{args.out_dir}")
    dataset, split, report, split_data, coverage_manifest_sha = validate_inputs(args.pilot, args.level)
    train_families = split_data.get("trainRootFamilies")
    _require(isinstance(train_families, list) and all(isinstance(x, str) for x in train_families),
             "split 缺少 trainRootFamilies")
    train_rows, validation_rows = inspect_dataset(dataset, set(train_families))
    plan = make_plan(train_rows)
    updates = int(plan["totalUpdates"])
    args.out_dir.mkdir(parents=True)
    plan_path = args.out_dir / "batch_plan.json"
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    trainable = "trunk,policy" if args.arm == "trunk_ce" else "policy"
    checkpoints = save_points(updates)
    command = [
        sys.executable, str(TRAINER), "--dataset", str(dataset), "--split-manifest", str(split),
        "--batch-plan", str(plan_path), "--epochs", str(math.ceil(updates / UPDATES_PER_EPOCH)),
        "--global-update-limit", str(updates), "--batch-size", str(BATCH_SIZE),
        "--lr", "0.0001", "--lr-min", "0.00001", "--lr-schedule", "cosine-to-min",
        "--lr-schedule-unit", "update", "--lr-total-updates", str(updates),
        "--save-at-updates", ",".join(map(str, checkpoints)), "--num-blocks", "2",
        "--spatial-channels", "34", "--encoder-schema-id", ENCODER_SCHEMA,
        "--model-version", "spatial-resnet-v2", "--init-checkpoint", str(INIT),
        "--trainable-parts", trainable, "--value-weight", "0",
        "--value-loss-normalize", "valid-mask", "--loss-mode", "ce",
        "--model-seed", "42", "--data-order-seed", str(DATA_ORDER_SEED),
        "--out-model", str(args.out_dir / "best.json"),
        "--out-final-model", str(args.out_dir / "final.json"),
        "--out-metrics", str(args.out_dir / "metrics.json"),
        "--planned-manifest", str(args.out_dir / "planned.json"),
        "--optimized-manifest", str(args.out_dir / "optimized.json"),
    ]
    if args.arm == "head_kl":
        command += ["--kl-to-frozen", str(INIT), "--kl-weight", "0.5"]

    identity_path = args.out_dir / "experiment_identity.json"
    identity = {
        "schema": "v19-coverage-training-identity-v1",
        "kind": "v19-current-rule-coverage-offline-pretrain",
        "level": args.level,
        "arm": args.arm,
        "updates": updates,
        "updatesPerEpoch": UPDATES_PER_EPOCH,
        "batchSize": BATCH_SIZE,
        "availableTrainRows": len(train_rows),
        "validationRowsExcludedFromPlan": validation_rows,
        "plannedExposures": updates * BATCH_SIZE,
        "nominalExposuresPerTrainRow": updates * BATCH_SIZE / len(train_rows),
        "checkpoints": checkpoints,
        "checkpointPurpose": {
            "fractional": "quarter/half/final 用于同档训练轨迹诊断",
            "update250": ("固定 250 updates，用于达到该预算的各档与各臂等更新比较"
                          if updates >= 250 else "本档总预算不足 250，不声称具备跨档等更新检查点"),
        },
        "initialModelSha256": INIT_SHA256,
        "architecture": {"spatialChannels": 34, "globalDim": 20, "actionSemanticDim": 53,
                         "numBlocks": 2, "globalPolicyPool": False},
        "optimization": {"trainableParts": trainable.split(","), "valueWeight": 0,
                         "lossMode": "ce", "lr": 1e-4, "lrMin": 1e-5,
                         "lrSchedule": "cosine-to-min-by-update", "modelSeed": 42,
                         "dataOrderSeed": DATA_ORDER_SEED, "cpuThreads": 2},
        "klContract": ({"enabled": True, "weight": 0.5,
                        "mathematicalDirection": "reverse KL = KL(current||reference)",
                        "referenceComputation": "frozen theta1 policy head consumes candidate features from current model trunk",
                        "trunkFrozenReason": "head_kl 只训练 policy；固定 θ1 trunk 才使参考 head 的输入表征保持冻结"}
                       if args.arm == "head_kl" else {"enabled": False}),
        "outputIdentity": "pretrain/offline candidate; not deployed; no game-strength claim",
        "promotionAllowed": False,
        "independentGameStrengthEvidence": False,
        "coverageSourceManifestSha256": coverage_manifest_sha,
        "command": command,
        "sourceSha256": {str(path): file_sha256(path) for path in
                         (dataset, split, report, args.pilot / "manifest.json", INIT, TRAINER, MODEL, Path(__file__))},
    }
    identity_path.write_text(json.dumps(identity, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    env = dict(os.environ, OMP_NUM_THREADS="2", MKL_NUM_THREADS="2",
               OPENBLAS_NUM_THREADS="2", NUMEXPR_NUM_THREADS="2", PYTHONIOENCODING="utf-8")
    started = time.monotonic()
    with (args.out_dir / "train.log").open("w", encoding="utf-8") as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, env=env, check=False)
    outcome = {"returnCode": result.returncode, "elapsedSeconds": time.monotonic() - started,
               "level": args.level, "arm": args.arm, "identity": "pretrain"}
    (args.out_dir / "process_result.json").write_text(
        json.dumps(outcome, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(outcome, ensure_ascii=False))
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
