#!/usr/bin/env python3
"""只读补算 Path3 双臂正式检查点的 teacher-rank 与策略漂移指标。"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

# 在导入 torch 前约束底层线程池；本工具只做 CPU 前向。
for _name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[_name] = "2"

ROOT = Path(__file__).resolve().parents[2]
for _directory in (ROOT / "python", ROOT / "v19" / "training"):
    if str(_directory) not in sys.path:
        sys.path.insert(0, str(_directory))

import torch  # noqa: E402

from migrate_path3_model import NEW_POLICY_IN_DIM, NEW_SCHEMA_ID, PATH3_DIM, PREFIX_DIM  # noqa: E402
from path3_distill import (  # noqa: E402
    Path3Sample,
    _read_config,
    canonical_sha256,
    load_migrated_theta1,
    load_path3_replay,
    policy_logits,
    sha256_file,
)
from spatial_resnet_model import SpatialResNet, load_model_from_ts_json  # noqa: E402


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON 根节点不是对象：{path}")
    return value


def _checkpoint_steps(run_dir: Path, arm: str) -> list[tuple[int, str, Path, Path]]:
    """从已完成 summary 中解析固定检查点与真实早停端点。"""

    summary_path = run_dir / "summary.json"
    if not summary_path.is_file():
        raise FileNotFoundError(f"正式目录尚未完成（缺少 summary.json）：{run_dir}")
    summary = _read_json(summary_path)
    if summary.get("schema") != "v19_path3_distill_summary_1" or summary.get("arm") != arm:
        raise ValueError(f"summary 身份与臂不符：{summary_path}")
    completed = summary.get("updatesPerformed")
    if not isinstance(completed, int) or completed < 0:
        raise ValueError(f"summary updatesPerformed 非法：{summary_path}")

    endpoints: list[tuple[int, str, Path, Path]] = []
    fixed = summary.get("fixedExports")
    if not isinstance(fixed, list) or any(not isinstance(step, int) for step in fixed):
        raise ValueError(f"summary fixedExports 非法：{summary_path}")
    for step in fixed:
        if step not in (400, 800):
            raise ValueError(f"正式固定检查点只能是400/800，实际为{step}")
        endpoints.append((step, "fixed", run_dir / f"{arm}_u{step:04d}.json",
                          run_dir / f"{arm}_u{step:04d}.metrics.json"))
    early = summary.get("earlyStopExport")
    if early is not None:
        if not isinstance(early, int) or early != completed or early in fixed:
            raise ValueError(f"summary earlyStopExport 与真实完成步不一致：{summary_path}")
        endpoints.append((early, "early_stop", run_dir / f"{arm}_earlystop_u{early:04d}.json",
                          run_dir / f"{arm}_earlystop_u{early:04d}.metrics.json"))
    if not endpoints:
        raise ValueError(f"正式目录没有可分析端点：{run_dir}")
    if not summary.get("stoppedByKl") and completed != 800:
        raise ValueError(f"未早停的正式训练必须完成800步：{summary_path}")
    if summary.get("stoppedByKl") and early is None and completed not in fixed:
        raise ValueError(f"早停端点未导出：{summary_path}")
    for _, _, model_path, metrics_path in endpoints:
        if not model_path.is_file() or not metrics_path.is_file():
            raise FileNotFoundError(f"端点模型或指标缺失：{model_path} / {metrics_path}")
    return sorted(endpoints)


def _validate_run_identity(run_dir: Path, arm: str, config: Mapping[str, Any]) -> dict[str, Any]:
    identity_path = run_dir / "identity.json"
    document = _read_json(identity_path)
    identity = document.get("identity")
    if document.get("schema") != "v19_path3_distill_identity_1" or not isinstance(identity, dict):
        raise ValueError(f"训练身份文件非法：{identity_path}")
    expected = {
        "arm": arm,
        "config": dict(config),
        "configSha256": canonical_sha256(config),
        "dataSha256": config["dataSha256"],
        "initSha256": config["initSha256"],
        "modelSchema": NEW_SCHEMA_ID,
        "smoke": False,
        "effectiveUpdates": 800,
    }
    if any(identity.get(key) != value for key, value in expected.items()):
        raise ValueError(f"正式训练身份与冻结合同不一致：{identity_path}")
    source_files = identity.get("sourceFiles")
    if not isinstance(source_files, dict) or identity.get("sourceSha256") != canonical_sha256(source_files):
        raise ValueError(f"sourceFiles/sourceSha256 自校验失败：{identity_path}")
    return identity


def _load_checkpoint(path: Path) -> tuple[SpatialResNet, dict[str, Any]]:
    raw = _read_json(path)
    if raw.get("encoderSchemaId") != NEW_SCHEMA_ID or raw.get("spatialChannels") != 34 \
            or raw.get("globalPolicyPool") is not False:
        raise ValueError(f"端点模型 schema/空间布局错误：{path}")
    policy = raw.get("polDense1")
    if not isinstance(policy, dict) or policy.get("inDim") != NEW_POLICY_IN_DIM or policy.get("outDim") != 48:
        raise ValueError(f"端点模型 policy 维度错误：{path}")
    model = SpatialResNet(
        spatial_channels=34,
        trunk_channels=32,
        global_dim=20,
        action_semantic_dim=56,
        version=str(raw.get("version")),
        num_blocks=int(raw.get("numBlocks")),
        global_policy_pool=False,
    )
    load_model_from_ts_json(model, str(path))
    model.eval()
    return model, raw


def _all_logits(model: SpatialResNet, samples: Sequence[Path3Sample]) -> list[torch.Tensor]:
    """完整使用56维语义；即使分析control也不在输入侧替它遮掉后三维。"""

    output: list[torch.Tensor] = []
    with torch.inference_mode():
        for start in range(0, len(samples), 128):
            output.extend(logit.detach().cpu() for logit in policy_logits(model, samples[start:start + 128], "path3"))
    return output


def _row_metrics(sample: Path3Sample, current: torch.Tensor, reference: torch.Tensor) -> dict[str, Any]:
    current_index = int(current.argmax())
    reference_index = int(reference.argmax())
    current_rank = int(sample.teacher_ranks[current_index])
    reference_rank = int(sample.teacher_ranks[reference_index])
    return {
        "map": sample.map_name,
        "phase": sample.phase,
        "currentTeacherRank": current_rank,
        "referenceTeacherRank": reference_rank,
        "currentTopSet": current_rank == 0,
        "referenceTopSet": reference_rank == 0,
        "argmaxChanged": current_index != reference_index,
    }


def _aggregate(rows: Iterable[Mapping[str, Any]]) -> dict[str, float | int]:
    materialized = list(rows)
    count = len(materialized)
    if count == 0:
        raise ValueError("空分组不能汇总")
    return {
        "samples": count,
        "currentArgmaxTeacherRankMean": sum(row["currentTeacherRank"] for row in materialized) / count,
        "referenceArgmaxTeacherRankMean": sum(row["referenceTeacherRank"] for row in materialized) / count,
        "currentTopInTeacherTopSetRate": sum(row["currentTopSet"] for row in materialized) / count,
        "referenceTopInTeacherTopSetRate": sum(row["referenceTopSet"] for row in materialized) / count,
        "argmaxChangeRateVsReference": sum(row["argmaxChanged"] for row in materialized) / count,
    }


def _group(rows: list[dict[str, Any]], keys: tuple[str, ...]) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups["|".join(str(row[key]) for key in keys)].append(row)
    return {key: _aggregate(groups[key]) for key in sorted(groups)}


def _path_columns(raw: Mapping[str, Any]) -> dict[str, float | int | bool]:
    policy = raw["polDense1"]
    weights = torch.tensor(policy["weights"], dtype=torch.float64).view(48, NEW_POLICY_IN_DIM)
    columns = weights[:, PREFIX_DIM:PREFIX_DIM + PATH3_DIM]
    return {
        "l1Norm": float(columns.abs().sum()),
        "l2Norm": float(torch.linalg.vector_norm(columns)),
        "maxAbs": float(columns.abs().max()),
        "nonzeroCount": int(torch.count_nonzero(columns)),
        "exactlyZero": bool(torch.count_nonzero(columns).item() == 0),
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="补算 Path3 正式检查点的 holdout 排序指标")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--init-checkpoint", type=Path, required=True)
    parser.add_argument("--control-dir", type=Path, required=True)
    parser.add_argument("--path3-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)

    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    config = _read_config(args.config)
    if sha256_file(args.data) != config["dataSha256"] or sha256_file(args.init_checkpoint) != config["initSha256"]:
        raise ValueError("data 或 θ1 SHA 与冻结 config 不一致")
    samples, _ = load_path3_replay(args.data, args.manifest, config)
    holdout = [sample for sample in samples if sample.split == "holdout"]
    if not holdout:
        raise ValueError("没有 holdout 样本")

    reference_model, _ = load_migrated_theta1(args.init_checkpoint, config["initSha256"])
    reference_model.eval()
    reference_logits = _all_logits(reference_model, holdout)
    run_identities = {
        "control": _validate_run_identity(args.control_dir, "control", config),
        "path3": _validate_run_identity(args.path3_dir, "path3", config),
    }
    comparable_fields = ("configSha256", "dataSha256", "manifestSha256", "initSha256", "sourceSha256")
    if any(run_identities["control"][key] != run_identities["path3"][key] for key in comparable_fields):
        raise ValueError("control/path3 的配置、数据、初始模型或源码身份不一致")

    checkpoints: list[dict[str, Any]] = []
    for arm, run_dir in (("control", args.control_dir), ("path3", args.path3_dir)):
        for step, endpoint_kind, model_path, metrics_path in _checkpoint_steps(run_dir, arm):
            metrics = _read_json(metrics_path)
            actual_sha = sha256_file(model_path)
            output_identity = metrics.get("output")
            if not isinstance(output_identity, dict) or output_identity.get("sha256") != actual_sha:
                raise ValueError(f"模型与训练指标 SHA 不一致：{model_path}")
            if metrics.get("arm") != arm or metrics.get("updatesPerformed") != step:
                raise ValueError(f"模型与训练指标 step/arm 不一致：{metrics_path}")
            model, raw = _load_checkpoint(model_path)
            current_logits = _all_logits(model, holdout)
            rows = [
                _row_metrics(sample, current, reference)
                for sample, current, reference in zip(holdout, current_logits, reference_logits)
            ]
            checkpoints.append({
                "arm": arm,
                "step": step,
                "endpointKind": endpoint_kind,
                "model": {"path": model_path.as_posix(), "sha256": actual_sha},
                "usesFull56SemanticInputs": True,
                "path3PolicyColumns": _path_columns(raw),
                "holdout": {
                    "overall": _aggregate(rows),
                    "byPhase": _group(rows, ("phase",)),
                    "byMap": _group(rows, ("map",)),
                    "byPhaseMap": _group(rows, ("phase", "map")),
                },
            })

    result = {
        "schema": "v19_path3_checkpoint_analysis_1",
        "purpose": "只读补算正式双臂端点的当前/参考 teacher rank、top-set率、argmax变化与新增列范数。",
        "runtime": {"python": sys.version.split()[0], "torch": torch.__version__, "device": "cpu",
                    "intraopThreads": 2, "interopThreads": 1},
        "input": {
            "config": {"path": args.config.as_posix(), "sha256": sha256_file(args.config)},
            "data": {"path": args.data.as_posix(), "sha256": sha256_file(args.data)},
            "manifest": {"path": args.manifest.as_posix(), "sha256": sha256_file(args.manifest)},
            "initCheckpoint": {"path": args.init_checkpoint.as_posix(), "sha256": sha256_file(args.init_checkpoint)},
            "split": "holdout",
            "samples": len(holdout),
            "caveat": "训练源内部家族隔离监测，不构成独立棋力证据。",
        },
        "forwardContract": {
            "semanticDim": 56,
            "controlInputMaskAppliedByAnalyzer": False,
            "note": "reference/current 均使用落盘的完整56维；control 是否忽略后三维由其实际权重决定。",
        },
        "runIdentity": run_identities,
        "checkpoints": checkpoints,
    }
    if args.output.exists():
        raise FileExistsError(f"拒绝覆盖分析报告：{args.output}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "checkpoints": len(checkpoints)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
