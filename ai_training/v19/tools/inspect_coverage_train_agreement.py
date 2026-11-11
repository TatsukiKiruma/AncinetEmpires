"""检查 coverage full 训练池中 θ1/候选模型与 H0 硬目标的一致性。

严格按 split.trainRootFamilies 选择训练行；不复用 validationSource，也不产生棋力结论。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch.utils.data import DataLoader, Subset

import evaluate_scale_checkpoints as evaluator
import spatial_resnet_model


ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "v19_coverage_train_agreement_1"
MANIFEST_SCHEMA = "v19_coverage_train_agreement_row_1"


def _quantile(values: list[float], probability: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower, upper = math.floor(position), math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction


def _numeric_summary(values: list[float]) -> dict[str, Any]:
    return {
        "count": len(values),
        "min": min(values) if values else None,
        "mean": sum(values) / len(values) if values else None,
        "quantiles": {
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


def _agreement_summary(rows: list[dict[str, Any]], model_key: str) -> dict[str, Any]:
    agreed = sum(bool(row["models"][model_key]["agreesWithH0"]) for row in rows)
    return {"rows": len(rows), "agreed": agreed, "agreementRate": agreed / len(rows) if rows else None}


def _group(rows: list[dict[str, Any]], field: str, model_keys: list[str]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row[field])].append(row)
    return {
        name: {
            "candidateCount": _numeric_summary([float(row["candidateCount"]) for row in items]),
            "h0Top1Top2Margin": _numeric_summary([
                float(row["h0Top1Top2Margin"])
                for row in items if row["h0Top1Top2Margin"] is not None
            ]),
            "singleCandidateRows": sum(row["h0Top1Top2Margin"] is None for row in items),
            "models": {key: _agreement_summary(items, key) for key in model_keys},
        }
        for name, items in sorted(grouped.items())
    }


def _stream_metadata(dataset_path: Path, train_roots: set[str], val_roots: set[str]) -> tuple[list[int], dict[int, dict[str, Any]], int]:
    train_indices: list[int] = []
    metadata: dict[int, dict[str, Any]] = {}
    validation_rows = 0
    with dataset_path.open("r", encoding="utf-8") as handle:
        for index, text in enumerate(handle):
            if not text.strip():
                continue
            row = json.loads(text)
            root = row.get("rootFamilyId")
            if root in val_roots:
                validation_rows += 1
                continue
            if root not in train_roots:
                raise ValueError(f"数据行 {index + 1} 的 rootFamilyId 未被 train/val manifest 声明")
            ordered = row.get("orderedActionCodes")
            candidates = row.get("candidateActions")
            target = row.get("targetActionIndex")
            teacher = row.get("teacher") or {}
            scores = teacher.get("rawScores")
            if not isinstance(ordered, list) or not isinstance(candidates, list) or len(ordered) != len(candidates):
                raise ValueError(f"数据行 {index + 1} 的候选动作未对齐")
            if not isinstance(scores, list) or len(scores) != len(ordered):
                raise ValueError(f"数据行 {index + 1} 的 H0 rawScores 未对齐")
            if isinstance(target, bool) or not isinstance(target, int) or not 0 <= target < len(scores):
                raise ValueError(f"数据行 {index + 1} 的 targetActionIndex 非法")
            numeric_scores = [float(value) for value in scores]
            if any(not math.isfinite(value) for value in numeric_scores):
                raise ValueError(f"数据行 {index + 1} 含非有限 H0 分数")
            ranking = sorted(range(len(scores)), key=lambda item: (-numeric_scores[item], ordered[item]))
            if ranking[0] != target:
                raise ValueError(f"数据行 {index + 1} 的 H0 target 不是同次分数按 actionCode 决胜的 argmax")
            action = candidates[target].get("action") if isinstance(candidates[target], dict) else None
            action_type = action.get("type") if isinstance(action, dict) else None
            state = row.get("stateJson") or {}
            map_name = ((state.get("metadata") or {}).get("apkMapName"))
            if not isinstance(action_type, str) or not action_type or not isinstance(map_name, str) or not map_name:
                raise ValueError(f"数据行 {index + 1} 缺少动作类型或地图")
            sample_id, identity = row.get("sampleId"), row.get("inputIdentity")
            if not isinstance(sample_id, str) or not isinstance(identity, str):
                raise ValueError(f"数据行 {index + 1} 缺少 sampleId/inputIdentity")
            margin = numeric_scores[ranking[0]] - numeric_scores[ranking[1]] if len(ranking) > 1 else None
            train_indices.append(index)
            metadata[index] = {
                "schema": MANIFEST_SCHEMA,
                "datasetRow": index,
                "sampleId": sample_id,
                "inputIdentity": identity,
                "rootFamilyId": root,
                "map": map_name,
                "teacherActionType": action_type,
                "candidateCount": len(ordered),
                "h0TargetIndex": target,
                "h0TargetActionCode": ordered[target],
                "h0Top1Top2Margin": margin,
                "models": {},
            }
    return train_indices, metadata, validation_rows


def _predict(model: Any, loader: Any, train_indices: list[int], trainer: Any) -> dict[int, int]:
    predictions: dict[int, int] = {}
    cursor = 0
    with torch.inference_mode():
        for batch in loader:
            spatial = batch["spatial_tensor"].float()
            globals_ = batch["global_features"].float()
            z = model.forward_trunk(spatial)
            gap = torch.mean(z, dim=[2, 3]) if model.global_policy_pool else None
            for batch_index, candidates in enumerate(batch["candidates"]):
                raw_index = train_indices[cursor]
                cursor += 1
                z_b = z[batch_index]
                parts = [
                    trainer.pool_coords_batch(z_b, [candidate.get(name) for candidate in candidates])
                    for name in ("actorCoord", "landingCoord", "targetCoord")
                ]
                semantics = torch.from_numpy(np.stack([
                    candidate["semantics_padded"] for candidate in candidates
                ])).float()
                glob = globals_[batch_index, :model.global_dim]
                parts.extend([semantics, glob.unsqueeze(0).expand(len(candidates), -1)])
                if model.global_policy_pool:
                    parts.append(gap[batch_index].unsqueeze(0).expand(len(candidates), -1))
                logits = model.forward_action_logits(torch.cat(parts, dim=-1).unsqueeze(0))[0]
                predictions[raw_index] = int(torch.argmax(logits).item())
    if len(predictions) != len(train_indices):
        raise RuntimeError("模型预测未覆盖完整训练池")
    return predictions


def run(dataset_path: Path, split_path: Path, models: dict[str, Path], out_path: Path,
        manifest_path: Path) -> dict[str, Any]:
    if out_path.exists() or manifest_path.exists():
        raise FileExistsError("拒绝覆盖已有训练池诊断产物")
    dataset_sha, split_sha = evaluator._verify_artifact_hashes(dataset_path, split_path)
    split = evaluator._read_json(split_path)
    train_roots = set(split.get("trainRootFamilies") or [])
    val_roots = set(split.get("valRootFamilies") or [])
    if not train_roots or not val_roots or train_roots & val_roots:
        raise ValueError("split 的 train/val root 家族为空或重叠")
    train_indices, metadata, validation_rows = _stream_metadata(dataset_path, train_roots, val_roots)
    if len(train_indices) != 5295 or validation_rows != 885:
        raise ValueError(f"要求 5295 train/885 validation，实际 {len(train_indices)}/{validation_rows}")
    trainer = evaluator._load_trainer()
    dataset = trainer.SpatialDataset(str(dataset_path))
    trainer._MODEL_SEMANTIC_DIM["value"] = int(dataset.semantic_dim)
    loader = DataLoader(
        Subset(dataset, train_indices), batch_size=64, shuffle=False, num_workers=0,
        collate_fn=trainer.collate_samples,
    )
    model_identities: dict[str, Any] = {}
    for name, path in models.items():
        model, identity = evaluator._model_from_checkpoint(path, dataset)
        model_identities[name] = identity
        predictions = _predict(model, loader, train_indices, trainer)
        for index, prediction in predictions.items():
            row = metadata[index]
            row["models"][name] = {
                "predictionIndex": prediction,
                "agreesWithH0": prediction == row["h0TargetIndex"],
            }
    ordered_rows = [metadata[index] for index in train_indices]
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in ordered_rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
    model_keys = list(models)
    result = {
        "schema": SCHEMA,
        "claimRestriction": "这是训练池内 H0 一致性诊断，不是验证、泛化、自然收益或棋力证据。",
        "selectionContract": {
            "trainRows": len(train_indices),
            "validationRowsExcluded": validation_rows,
            "trainRootFamilies": len(train_roots),
            "rule": "仅选择 split.trainRootFamilies；未读取或伪造 validationSource",
        },
        "dataset": {"path": str(dataset_path.resolve()), "sha256": dataset_sha},
        "splitManifest": {"path": str(split_path.resolve()), "sha256": split_sha},
        "models": model_identities,
        "runtime": {"device": "cpu", "torchThreads": 2, "torchInteropThreads": 1, "batchSize": 64},
        "overall": {
            "candidateCount": _numeric_summary([float(row["candidateCount"]) for row in ordered_rows]),
            "h0Top1Top2Margin": _numeric_summary([
                float(row["h0Top1Top2Margin"])
                for row in ordered_rows if row["h0Top1Top2Margin"] is not None
            ]),
            "singleCandidateRows": sum(row["h0Top1Top2Margin"] is None for row in ordered_rows),
            "models": {key: _agreement_summary(ordered_rows, key) for key in model_keys},
        },
        "byMap": _group(ordered_rows, "map", model_keys),
        "byTeacherActionType": _group(ordered_rows, "teacherActionType", model_keys),
        "sampleManifest": {
            "path": str(manifest_path.resolve()),
            "sha256": evaluator.sha256_file(manifest_path),
            "rows": len(ordered_rows),
            "schema": MANIFEST_SCHEMA,
        },
        "sourceSha256": {
            str(Path(__file__).resolve()): evaluator.sha256_file(Path(__file__).resolve()),
            str(Path(evaluator.__file__).resolve()): evaluator.sha256_file(Path(evaluator.__file__).resolve()),
            str(evaluator.TRAINER_PATH.resolve()): evaluator.sha256_file(evaluator.TRAINER_PATH.resolve()),
            str(Path(spatial_resnet_model.__file__).resolve()): evaluator.sha256_file(
                Path(spatial_resnet_model.__file__).resolve()
            ),
        },
    }
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="检查 coverage full 训练池模型/H0一致性")
    parser.add_argument("--dataset", type=Path, default=ROOT / "v19/out/coverage_20261004/pilot/full/dataset.jsonl")
    parser.add_argument("--split-manifest", type=Path, default=ROOT / "v19/out/coverage_20261004/pilot/full/split.json")
    parser.add_argument("--out", type=Path, default=ROOT / "v19/out/coverage_20261004/train_agreement.json")
    parser.add_argument("--manifest", type=Path, default=ROOT / "v19/out/coverage_20261004/train_agreement_samples.jsonl")
    args = parser.parse_args(argv)
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    models = {
        "theta1": ROOT / "v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json",
        "trunk_full_final": ROOT / "v19/out/coverage_20261004/training/trunk_full/final.json",
        "head_kl_final": ROOT / "v19/out/coverage_20261004/training/head_kl/final.json",
    }
    result = run(
        args.dataset.resolve(), args.split_manifest.resolve(),
        {name: path.resolve() for name, path in models.items()},
        args.out.resolve(), args.manifest.resolve(),
    )
    print(json.dumps({
        "out": str(args.out.resolve()),
        "manifest": result["sampleManifest"],
        "selection": result["selectionContract"],
        "agreement": result["overall"]["models"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
