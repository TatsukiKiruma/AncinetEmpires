"""离线评估 V19 34/53 数据规模实验的检查点。

只读取 split manifest 指定的验证家族，不训练、不运行对局。指标中的 top1 是
监督动作分类准确率，不是胜率。
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
PYTHON_DIR = ROOT / "python"
TRAINER_PATH = ROOT / "v17" / "tools" / "train_v17.py"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

import numpy as np  # noqa: E402
import torch  # noqa: E402
from torch.utils.data import DataLoader, Subset  # noqa: E402
from spatial_resnet_model import SpatialResNet, load_model_from_ts_json  # noqa: E402


SCHEMA = "v19_scale_checkpoint_evaluation_1"
EXPECTED_ENCODER_SCHEMA = "spatial34_global20_actionSemantics53_v19"
SOURCE_NAMES = {
    "historical_holdout": "historical",
    # 数据规模主方案以 current 训练、历史全集验证；该名字仍属于历史验证证据。
    "historical_curriculum_holdout": "historical",
    "current_regression": "previously_consumed_current_rules_regression_only",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _load_trainer() -> Any:
    spec = importlib.util.spec_from_file_location("v17_scale_eval_trainer", TRAINER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载训练器：{TRAINER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"JSON 顶层必须是对象：{path}")
    return value


def _verify_artifact_hashes(dataset: Path, split: Path) -> tuple[str, str]:
    dataset_sha = sha256_file(dataset)
    split_sha = sha256_file(split)
    # build_scale_pilot 在同目录 report.json 冻结两项 SHA；存在时必须吻合。
    report_path = split.parent / "report.json"
    if report_path.is_file():
        artifacts = (_read_json(report_path).get("artifacts") or {})
        expected_dataset = artifacts.get("dataset.jsonl")
        expected_split = artifacts.get("split.json")
        if not expected_dataset or not expected_split:
            raise ValueError(f"{report_path} 缺少 dataset.jsonl/split.json SHA")
        if dataset_sha != expected_dataset:
            raise ValueError("dataset SHA256 与同目录 report.json 不一致")
        if split_sha != expected_split:
            raise ValueError("split SHA256 与同目录 report.json 不一致")
    return dataset_sha, split_sha


def _load_raw_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, text in enumerate(handle, 1):
            if not text.strip():
                continue
            try:
                row = json.loads(text)
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number} 不是合法 JSON") from error
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_number} 顶层不是对象")
            rows.append(row)
    return rows


def _source_name(row: dict[str, Any], line_number: int) -> str:
    raw = row.get("validationSource")
    if raw not in SOURCE_NAMES:
        raise ValueError(f"验证行 {line_number} 的 validationSource 非法：{raw!r}")
    return SOURCE_NAMES[raw]


def _model_from_checkpoint(path: Path, dataset: Any) -> tuple[Any, dict[str, Any]]:
    checkpoint = _read_json(path)
    schema = checkpoint.get("encoderSchemaId")
    if schema != EXPECTED_ENCODER_SCHEMA:
        raise ValueError(f"{path} 的 encoderSchemaId={schema!r}，要求 {EXPECTED_ENCODER_SCHEMA!r}")
    spatial_channels = int(checkpoint.get("spatialChannels", 0))
    num_blocks = int(checkpoint.get("numBlocks", 0))
    version = checkpoint.get("version")
    global_pool = bool(checkpoint.get("globalPolicyPool", False))
    policy = checkpoint.get("polDense1") or {}
    policy_in = int(policy.get("inDim", 0))
    semantic_dim = policy_in - 3 * 32 - int(dataset.global_dim) - (32 if global_pool else 0)
    if (spatial_channels, int(dataset.channels), semantic_dim, int(dataset.semantic_dim)) != (34, 34, 53, 53):
        raise ValueError(
            f"{path} 与数据形状不一致：checkpoint={spatial_channels}/{semantic_dim}，"
            f"dataset={dataset.channels}/{dataset.semantic_dim}"
        )
    if num_blocks not in (2, 4) or version != "spatial-resnet-v2":
        raise ValueError(f"{path} 的模型结构不受支持：version={version!r}, numBlocks={num_blocks}")
    model = SpatialResNet(
        spatial_channels=34, global_dim=int(dataset.global_dim), action_semantic_dim=53,
        version=version, num_blocks=num_blocks, global_policy_pool=global_pool,
    )
    model.encoder_schema_id = schema
    load_model_from_ts_json(model, str(path))
    model.eval()
    identity = {
        "path": str(path.resolve()),
        "sha256": sha256_file(path),
        "modelSchema": {
            "encoderSchemaId": schema,
            "version": version,
            "architectureId": checkpoint.get("architectureId"),
            "spatialChannels": spatial_channels,
            "globalFeatureDim": int(dataset.global_dim),
            "actionSemanticDim": semantic_dim,
            "numBlocks": num_blocks,
            "globalPolicyPool": global_pool,
        },
    }
    return model, identity


def _summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    if not records:
        raise ValueError("内部错误：不能汇总空验证来源")
    families: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        families[record["family"]].append(record)
    family_ce = [sum(x["ce"] for x in items) / len(items) for items in families.values()]
    family_top1 = [sum(x["correct"] for x in items) / len(items) for items in families.values()]
    return {
        "rows": len(records),
        "families": len(families),
        "uniqueInputs": len({x["input"] for x in records}),
        "rowWeighted": {
            "crossEntropy": sum(x["ce"] for x in records) / len(records),
            "top1Accuracy": sum(x["correct"] for x in records) / len(records),
        },
        "macroFamily": {
            "crossEntropy": sum(family_ce) / len(family_ce),
            "top1Accuracy": sum(family_top1) / len(family_top1),
        },
    }


def _group_metrics(records: list[dict[str, Any]], field: str) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[str(record[field])].append(record)
    return {
        name: {
            "rows": len(items),
            "crossEntropy": sum(item["ce"] for item in items) / len(items),
            "top1Accuracy": sum(item["correct"] for item in items) / len(items),
        }
        for name, items in sorted(grouped.items())
    }


def _comparison(reference: list[dict[str, Any]], current: list[dict[str, Any]]) -> dict[str, int]:
    reference_by_input = {item["input"]: item for item in reference}
    current_by_input = {item["input"]: item for item in current}
    if len(reference_by_input) != len(reference) or len(current_by_input) != len(current):
        raise ValueError("诊断要求每个 source 内 inputIdentity 唯一")
    if set(reference_by_input) != set(current_by_input):
        raise ValueError("检查点诊断的输入集合与参考检查点不一致")
    counts = {
        "sameArgmax": 0,
        "changedArgmax": 0,
        "teacherCorrected": 0,
        "teacherRegressed": 0,
        "bothWrongChanged": 0,
    }
    for identity, ref in reference_by_input.items():
        new = current_by_input[identity]
        changed = ref["prediction"] != new["prediction"]
        counts["changedArgmax" if changed else "sameArgmax"] += 1
        if not ref["correct"] and new["correct"]:
            counts["teacherCorrected"] += 1
        elif ref["correct"] and not new["correct"]:
            counts["teacherRegressed"] += 1
        elif changed and not ref["correct"] and not new["correct"]:
            counts["bothWrongChanged"] += 1
    return counts


def _evaluate(model: Any, loader: Any, raw_by_index: dict[int, dict[str, Any]], trainer: Any,
              include_details: bool = False) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]] | None]:
    records_by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    row_cursor = 0
    with torch.inference_mode():
        for batch in loader:
            spatial = batch["spatial_tensor"].float()
            globals_ = batch["global_features"].float()
            z = model.forward_trunk(spatial)
            gap = torch.mean(z, dim=[2, 3]) if model.global_policy_pool else None
            for batch_index, candidates in enumerate(batch["candidates"]):
                raw_index = loader.dataset.indices[row_cursor]
                raw = raw_by_index[raw_index]
                row_cursor += 1
                target = batch["target_idx"][batch_index]
                if isinstance(target, bool) or not isinstance(target, int) or not 0 <= target < len(candidates):
                    raise ValueError(f"数据行 {raw_index + 1} 的 targetActionIndex={target!r} 非法")
                if not bool(batch["policy_loss_mask"][batch_index]):
                    raise ValueError(f"验证行 {raw_index + 1} 的 policyLossMask=false，无法评估策略目标")
                if not candidates:
                    raise ValueError(f"验证行 {raw_index + 1} 没有候选动作")
                z_b = z[batch_index]
                parts = [
                    trainer.pool_coords_batch(z_b, [c.get(name) for c in candidates])
                    for name in ("actorCoord", "landingCoord", "targetCoord")
                ]
                semantics = torch.from_numpy(np.stack([c["semantics_padded"] for c in candidates])).float()
                glob = globals_[batch_index, :model.global_dim]
                parts.extend([semantics, glob.unsqueeze(0).expand(len(candidates), -1)])
                if model.global_policy_pool:
                    parts.append(gap[batch_index].unsqueeze(0).expand(len(candidates), -1))
                logits = model.forward_action_logits(torch.cat(parts, dim=-1).unsqueeze(0))[0]
                log_probs = torch.log_softmax(logits, dim=0)
                ce = -float(log_probs[target].item())
                if not math.isfinite(ce):
                    raise ValueError(f"检查点对数据行 {raw_index + 1} 产生非有限 CE")
                family = raw.get("rootFamilyId")
                identity = raw.get("inputIdentity")
                if not isinstance(family, str) or not family or not isinstance(identity, str) or not identity:
                    raise ValueError(f"验证行 {raw_index + 1} 缺少 rootFamilyId/inputIdentity")
                source = _source_name(raw, raw_index + 1)
                teacher_action = candidates[target].get("action")
                teacher_action_type = teacher_action.get("type") if isinstance(teacher_action, dict) else None
                metadata = (raw.get("stateJson") or {}).get("metadata") or {}
                map_name = metadata.get("apkMapName")
                if include_details and (not isinstance(teacher_action_type, str) or not teacher_action_type):
                    raise ValueError(f"验证行 {raw_index + 1} 的教师目标动作缺少 action.type")
                if include_details and (not isinstance(map_name, str) or not map_name):
                    raise ValueError(f"验证行 {raw_index + 1} 缺少 stateJson.metadata.apkMapName")
                records_by_source[source].append({
                    "family": family, "input": identity, "ce": ce,
                    "prediction": int(torch.argmax(logits).item()), "target": target,
                    "correct": int(int(torch.argmax(logits).item()) == target),
                    "teacherActionType": teacher_action_type, "map": map_name,
                })
    expected_sources = set(SOURCE_NAMES.values())
    if set(records_by_source) != expected_sources:
        raise ValueError(f"验证来源不完整：实际 {sorted(records_by_source)}，要求 {sorted(expected_sources)}")
    summaries = {source: _summary(records_by_source[source]) for source in sorted(expected_sources)}
    return summaries, (dict(records_by_source) if include_details else None)


def run(dataset_path: Path, split_path: Path, checkpoints: list[Path], out_path: Path,
        batch_size: int = 64, diagnostics: bool = False) -> dict[str, Any]:
    if out_path.exists():
        raise FileExistsError(f"拒绝覆盖已有输出：{out_path}")
    dataset_sha, split_sha = _verify_artifact_hashes(dataset_path, split_path)
    split = _read_json(split_path)
    val_roots_raw = split.get("valRootFamilies")
    if not isinstance(val_roots_raw, list) or not val_roots_raw or any(not isinstance(x, str) or not x for x in val_roots_raw):
        raise ValueError("split manifest 的 valRootFamilies 必须是非空字符串数组")
    val_roots = set(val_roots_raw)
    trainer = _load_trainer()
    dataset = trainer.SpatialDataset(str(dataset_path))
    raw_rows = _load_raw_rows(dataset_path)
    if len(raw_rows) != len(dataset):
        raise ValueError("原始数据行数与 SpatialDataset 行数不一致")
    val_indices = [index for index, row in enumerate(raw_rows) if row.get("rootFamilyId") in val_roots]
    if not val_indices:
        raise ValueError("split manifest 没有选中任何验证行")
    selected_roots = {raw_rows[index].get("rootFamilyId") for index in val_indices}
    missing_roots = val_roots - selected_roots
    if missing_roots:
        raise ValueError(f"valRootFamilies 有 {len(missing_roots)} 个家族不在 dataset 中")
    # 所有数据行都必须由 manifest 明确归属，防止拿错 dataset/split 组合。
    known_roots = set(split.get("trainRootFamilies") or []) | val_roots | set(split.get("testRootFamilies") or [])
    unknown = {row.get("rootFamilyId") for row in raw_rows} - known_roots
    if unknown:
        raise ValueError(f"dataset 中有 {len(unknown)} 个 rootFamilyId 未被 split manifest 声明")
    trainer._MODEL_SEMANTIC_DIM["value"] = int(dataset.semantic_dim)
    loader = DataLoader(Subset(dataset, val_indices), batch_size=batch_size, shuffle=False,
                        num_workers=0, collate_fn=trainer.collate_samples)
    raw_by_index = {index: row for index, row in enumerate(raw_rows)}
    evaluations = []
    reference_details: dict[str, list[dict[str, Any]]] | None = None
    for checkpoint in checkpoints:
        model, identity = _model_from_checkpoint(checkpoint, dataset)
        validation, details = _evaluate(model, loader, raw_by_index, trainer, include_details=diagnostics)
        entry = {**identity, "validationBySource": validation}
        if diagnostics:
            assert details is not None
            diagnostic_entry: dict[str, Any] = {
                "bySource": {
                    source: {
                        "byTeacherActionType": _group_metrics(details[source], "teacherActionType"),
                        "byMap": _group_metrics(details[source], "map"),
                    }
                    for source in sorted(details)
                },
            }
            if reference_details is None:
                reference_details = details
                diagnostic_entry["comparisonToReference"] = None
            else:
                diagnostic_entry["comparisonToReference"] = {
                    source: _comparison(reference_details[source], details[source])
                    for source in sorted(reference_details)
                }
            entry["diagnostics"] = diagnostic_entry
        evaluations.append(entry)
    result = {
        "schema": SCHEMA,
        "metricSemantics": {"top1Accuracy": "监督动作分类准确率；不是胜率", "value": "未评估"},
        "dataset": {"path": str(dataset_path.resolve()), "sha256": dataset_sha},
        "splitManifest": {"path": str(split_path.resolve()), "sha256": split_sha,
                          "valRootFamilies": len(val_roots)},
        "runtime": {"device": "cpu", "torchThreads": 2, "torchInteropThreads": 1,
                    "batchSize": batch_size},
        "checkpoints": evaluations,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="离线评估 V19 数据规模实验检查点（top1 不是胜率）")
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--split-manifest", type=Path, required=True)
    parser.add_argument("--checkpoints", type=Path, nargs="+", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--diagnostics", action="store_true",
                        help="输出相对首检查点的动作变化，以及按教师动作类型/地图分组指标")
    args = parser.parse_args(argv)
    if args.batch_size <= 0:
        raise ValueError("--batch-size 必须为正整数")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    run(args.dataset.resolve(), args.split_manifest.resolve(),
        [path.resolve() for path in args.checkpoints], args.out.resolve(), args.batch_size,
        diagnostics=args.diagnostics)
    print(f"评估完成：{args.out.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
