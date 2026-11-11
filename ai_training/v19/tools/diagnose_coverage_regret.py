"""诊断覆盖训练检查点相对 H0 教师分数的启发式动作遗憾。

该分差只来自单次 H0 启发式打分，不是 Q 值、自然收益或棋力证据。
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import DataLoader, Subset

import evaluate_scale_checkpoints as evaluator
import spatial_resnet_model


ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "v19_coverage_teacher_regret_1"
CURRENT_SOURCE = "previously_consumed_current_rules_regression_only"


def _quantile(values: list[float], probability: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction


def _summarize(values: list[float]) -> dict[str, Any]:
    return {
        "count": len(values),
        "mean": sum(values) / len(values) if values else None,
        "quantiles": {
            "p0": _quantile(values, 0),
            "p25": _quantile(values, 0.25),
            "p50": _quantile(values, 0.5),
            "p75": _quantile(values, 0.75),
            "p90": _quantile(values, 0.9),
            "p95": _quantile(values, 0.95),
            "p100": _quantile(values, 1),
        },
        "thresholdCounts": {
            "le30": sum(value <= 30 for value in values),
            "gt500": sum(value > 500 for value in values),
            "gt5000": sum(value > 5000 for value in values),
        },
    }


def _group_summary(records: list[dict[str, Any]], field: str) -> dict[str, Any]:
    grouped: dict[str, list[float]] = defaultdict(list)
    for record in records:
        grouped[str(record[field])].append(float(record["regret"]))
    return {name: _summarize(values) for name, values in sorted(grouped.items())}


def _load_validation(dataset_path: Path, split_path: Path) -> tuple[Any, Any, dict[int, dict[str, Any]], Any]:
    split = evaluator._read_json(split_path)
    val_roots = set(split.get("valRootFamilies") or [])
    if not val_roots:
        raise ValueError("split manifest 未声明 valRootFamilies")
    trainer = evaluator._load_trainer()
    dataset = trainer.SpatialDataset(str(dataset_path))
    raw_rows = evaluator._load_raw_rows(dataset_path)
    if len(raw_rows) != len(dataset):
        raise ValueError("原始数据行数与 SpatialDataset 行数不一致")
    val_indices = [index for index, row in enumerate(raw_rows) if row.get("rootFamilyId") in val_roots]
    if len(val_indices) != 885:
        raise ValueError(f"固定验证集应为 885 行，实际 {len(val_indices)}")
    trainer._MODEL_SEMANTIC_DIM["value"] = int(dataset.semantic_dim)
    loader = DataLoader(
        Subset(dataset, val_indices), batch_size=64, shuffle=False, num_workers=0,
        collate_fn=trainer.collate_samples,
    )
    return dataset, loader, {index: row for index, row in enumerate(raw_rows)}, trainer


def _evaluate_details(checkpoint: Path, dataset: Any, loader: Any,
                      raw_by_index: dict[int, dict[str, Any]], trainer: Any) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    model, identity = evaluator._model_from_checkpoint(checkpoint, dataset)
    _, details = evaluator._evaluate(model, loader, raw_by_index, trainer, include_details=True)
    if details is None:
        raise RuntimeError("评估器未返回逐行详情")
    return identity, details[CURRENT_SOURCE]


def _teacher_rows(raw_by_index: dict[int, dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    tied_max = 0
    for row in raw_by_index.values():
        if row.get("validationSource") != "current_regression":
            continue
        identity = row.get("inputIdentity")
        ordered = row.get("orderedActionCodes")
        target = row.get("targetActionIndex")
        teacher = row.get("teacher") or {}
        scores = teacher.get("rawScores")
        teacher_codes = teacher.get("actionCodes")
        if not isinstance(identity, str) or identity in result:
            raise ValueError("现行回归 inputIdentity 缺失或重复")
        if not isinstance(ordered, list) or not isinstance(scores, list) or len(ordered) != len(scores):
            raise ValueError(f"{identity} 的教师分数未与有序候选对齐")
        if teacher_codes != ordered:
            raise ValueError(f"{identity} 的 teacher.actionCodes 与 orderedActionCodes 不一致")
        if isinstance(target, bool) or not isinstance(target, int) or not 0 <= target < len(scores):
            raise ValueError(f"{identity} 的 targetActionIndex 非法")
        numeric_scores = [float(value) for value in scores]
        if any(not math.isfinite(value) for value in numeric_scores):
            raise ValueError(f"{identity} 含非有限教师分数")
        maximum = max(numeric_scores)
        max_indices = [index for index, value in enumerate(numeric_scores) if value == maximum]
        if target not in max_indices:
            raise ValueError(f"{identity} 的教师目标不是同次 rawScores 最大值")
        if teacher.get("targetActionCode") != ordered[target]:
            raise ValueError(f"{identity} 的教师目标动作码与索引不一致")
        tied_max += int(len(max_indices) > 1)
        result[identity] = {
            "scores": numeric_scores,
            "target": target,
            "maximum": maximum,
        }
    if len(result) != 568:
        raise ValueError(f"现行回归教师行应为 568，实际 {len(result)}")
    return result, {
        "rows": len(result),
        "targetIsSamePassArgmaxRows": len(result),
        "tiedMaximumRows": tied_max,
    }


def _transition_records(reference: list[dict[str, Any]], current: list[dict[str, Any]],
                        teacher_by_input: dict[str, dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    ref = {row["input"]: row for row in reference}
    candidate = {row["input"]: row for row in current}
    if set(ref) != set(candidate) or set(ref) != set(teacher_by_input):
        raise ValueError("参考、候选与教师分数的 inputIdentity 集合不一致")
    transitions: dict[str, list[dict[str, Any]]] = {"corrected": [], "regressed": []}
    for identity in sorted(ref):
        old = ref[identity]
        new = candidate[identity]
        if not old["correct"] and new["correct"]:
            kind = "corrected"
            wrong_prediction = int(old["prediction"])
        elif old["correct"] and not new["correct"]:
            kind = "regressed"
            wrong_prediction = int(new["prediction"])
        else:
            continue
        teacher = teacher_by_input[identity]
        scores = teacher["scores"]
        if not 0 <= wrong_prediction < len(scores):
            raise ValueError(f"{identity} 的模型预测索引越界")
        regret = float(teacher["maximum"] - scores[wrong_prediction])
        if regret < 0 or not math.isfinite(regret):
            raise ValueError(f"{identity} 的启发式分差非法：{regret}")
        transitions[kind].append({
            "inputIdentity": identity,
            "regret": regret,
            "map": new["map"],
            "teacherActionType": new["teacherActionType"],
        })
    return transitions


def _transition_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "overall": _summarize([float(row["regret"]) for row in records]),
        "move": _summarize([
            float(row["regret"]) for row in records if row["teacherActionType"] == "move"
        ]),
        "byMap": _group_summary(records, "map"),
        "byTeacherActionType": _group_summary(records, "teacherActionType"),
    }


def run(dataset_path: Path, split_path: Path, reference_path: Path,
        candidate_paths: list[Path], out_path: Path) -> dict[str, Any]:
    if out_path.exists():
        raise FileExistsError(f"拒绝覆盖已有输出：{out_path}")
    dataset_sha, split_sha = evaluator._verify_artifact_hashes(dataset_path, split_path)
    dataset, loader, raw_by_index, trainer = _load_validation(dataset_path, split_path)
    teacher_by_input, teacher_check = _teacher_rows(raw_by_index)
    reference_identity, reference = _evaluate_details(
        reference_path, dataset, loader, raw_by_index, trainer,
    )
    candidates: list[dict[str, Any]] = []
    for path in candidate_paths:
        identity, details = _evaluate_details(path, dataset, loader, raw_by_index, trainer)
        transitions = _transition_records(reference, details, teacher_by_input)
        candidates.append({
            **identity,
            "comparisonToReference": {
                "corrected": _transition_summary(transitions["corrected"]),
                "regressed": _transition_summary(transitions["regressed"]),
            },
        })
    result = {
        "schema": SCHEMA,
        "metricSemantics": {
            "regret": "同次 H0 rawScores 的 max(score)-score(错误预测动作)；corrected 使用 θ1 的旧错误预测，regressed 使用候选的新错误预测",
            "restriction": "仅为启发式分差；不是 Q 值、自然收益或棋力证据",
            "nearTieThreshold": "H0 单次每动作抖动幅度至多30，因此 regret<=30 单列；这不证明基础分完全同分",
        },
        "dataset": {"path": str(dataset_path.resolve()), "sha256": dataset_sha},
        "splitManifest": {"path": str(split_path.resolve()), "sha256": split_sha, "validationRows": 885},
        "runtime": {"device": "cpu", "torchThreads": 2, "torchInteropThreads": 1, "batchSize": 64},
        "teacherContract": teacher_check,
        "reference": reference_identity,
        "candidates": candidates,
        "sourceSha256": {
            str(Path(__file__).resolve()): evaluator.sha256_file(Path(__file__).resolve()),
            str(Path(evaluator.__file__).resolve()): evaluator.sha256_file(Path(evaluator.__file__).resolve()),
            str(evaluator.TRAINER_PATH.resolve()): evaluator.sha256_file(evaluator.TRAINER_PATH.resolve()),
            str(Path(spatial_resnet_model.__file__).resolve()): evaluator.sha256_file(
                Path(spatial_resnet_model.__file__).resolve()
            ),
        },
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="诊断覆盖训练检查点的 H0 启发式分差")
    parser.add_argument("--dataset", type=Path, default=ROOT / "v19/out/coverage_20261004/pilot/one_third/dataset.jsonl")
    parser.add_argument("--split-manifest", type=Path, default=ROOT / "v19/out/coverage_20261004/pilot/one_third/split.json")
    parser.add_argument("--reference", type=Path, default=ROOT / "v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json")
    parser.add_argument("--candidates", type=Path, nargs="+", default=[
        ROOT / "v19/out/coverage_20261004/training/trunk_full/final.json",
        ROOT / "v19/out/coverage_20261004/training/head_kl/final.json",
    ])
    parser.add_argument("--out", type=Path, default=ROOT / "v19/out/coverage_20261004/teacher_regret.json")
    args = parser.parse_args(argv)
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    result = run(
        args.dataset.resolve(), args.split_manifest.resolve(), args.reference.resolve(),
        [path.resolve() for path in args.candidates], args.out.resolve(),
    )
    print(json.dumps({
        "out": str(args.out.resolve()),
        "teacherContract": result["teacherContract"],
        "candidates": [
            {
                "path": item["path"],
                "corrected": item["comparisonToReference"]["corrected"]["overall"],
                "regressed": item["comparisonToReference"]["regressed"]["overall"],
            }
            for item in result["candidates"]
        ],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
