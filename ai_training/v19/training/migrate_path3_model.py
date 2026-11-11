"""把 V19 θ1 JSON 权重迁移到独立的 Path3 输入 schema。

本脚本只改写 policy 第一层的输入列布局和相应 schema 标识；它不注册
共享加载器，也不表示迁移产物已经能够被生产推理代码加载。
"""

from __future__ import annotations

import argparse
import copy
import json
import math
from pathlib import Path
from typing import Any, Mapping, Sequence


OLD_SCHEMA_ID = "spatial34_global20_actionSemantics53_v19"
NEW_SCHEMA_ID = "spatial34_global20_actionSemantics56_v19_path3"

POLICY_OUT_DIM = 48
OLD_POLICY_IN_DIM = 169
NEW_POLICY_IN_DIM = 172
PREFIX_DIM = 149  # 96 个空间特征 + 53 个原动作语义特征
PATH3_DIM = 3
GLOBAL_DIM = 20


def _require_number_list(value: Any, *, name: str, length: int) -> list[int | float]:
    if not isinstance(value, list) or len(value) != length:
        actual = len(value) if isinstance(value, list) else type(value).__name__
        raise ValueError(f"{name} 长度错误：期望 {length}，实际 {actual}")
    for index, item in enumerate(value):
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            raise ValueError(f"{name}[{index}] 不是数值")
        if not math.isfinite(float(item)):
            raise ValueError(f"{name}[{index}] 不是有限数值")
    return value


def _validate_source(source: Mapping[str, Any]) -> tuple[Mapping[str, Any], Sequence[int | float]]:
    if source.get("encoderSchemaId") != OLD_SCHEMA_ID:
        raise ValueError(
            f"输入 encoderSchemaId 必须是 {OLD_SCHEMA_ID!r}，"
            f"实际为 {source.get('encoderSchemaId')!r}"
        )
    if source.get("version") != "spatial-resnet-v2":
        raise ValueError("输入 version 必须是 'spatial-resnet-v2'")
    if source.get("spatialChannels") != 34:
        raise ValueError("输入 spatialChannels 必须是 34")
    if source.get("globalPolicyPool") is not False:
        raise ValueError("输入 globalPolicyPool 必须是 false")

    layer = source.get("polDense1")
    if not isinstance(layer, Mapping):
        raise ValueError("输入缺少 polDense1 对象")
    if layer.get("inDim") != OLD_POLICY_IN_DIM or layer.get("outDim") != POLICY_OUT_DIM:
        raise ValueError(
            "polDense1 维度错误："
            f"期望 {OLD_POLICY_IN_DIM}->{POLICY_OUT_DIM}，"
            f"实际 {layer.get('inDim')}->{layer.get('outDim')}"
        )
    weights = _require_number_list(
        layer.get("weights"),
        name="polDense1.weights",
        length=OLD_POLICY_IN_DIM * POLICY_OUT_DIM,
    )
    _require_number_list(
        layer.get("biases"),
        name="polDense1.biases",
        length=POLICY_OUT_DIM,
    )
    return layer, weights


def migrate_model_dict(source: Mapping[str, Any]) -> dict[str, Any]:
    """返回迁移后的深拷贝，不修改传入对象。"""

    if not isinstance(source, Mapping):
        raise ValueError("模型 JSON 根节点必须是对象")
    _, old_weights = _validate_source(source)

    new_weights: list[int | float] = []
    for row_index in range(POLICY_OUT_DIM):
        row_start = row_index * OLD_POLICY_IN_DIM
        row = old_weights[row_start : row_start + OLD_POLICY_IN_DIM]
        # Path3 三列插在原动作语义与 globals 之间；置零保证初始函数不变。
        new_weights.extend(row[:PREFIX_DIM])
        new_weights.extend((0.0,) * PATH3_DIM)
        new_weights.extend(row[PREFIX_DIM : PREFIX_DIM + GLOBAL_DIM])

    migrated = copy.deepcopy(dict(source))
    migrated["encoderSchemaId"] = NEW_SCHEMA_ID
    migrated["polDense1"]["inDim"] = NEW_POLICY_IN_DIM
    migrated["polDense1"]["weights"] = new_weights
    return migrated


def migrate_file(input_path: Path, output_path: Path) -> None:
    """迁移一个 JSON 文件；目标已存在或与源相同时拒绝写入。"""

    source_path = input_path.resolve(strict=True)
    target_path = output_path.resolve(strict=False)
    if source_path == target_path:
        raise FileExistsError("输出路径不能与输入路径相同")
    if target_path.exists():
        raise FileExistsError(f"拒绝覆盖已有文件：{target_path}")

    with source_path.open("r", encoding="utf-8") as handle:
        source = json.load(handle)
    migrated = migrate_model_dict(source)

    target_path.parent.mkdir(parents=True, exist_ok=True)
    # x 模式同时防止检查之后出现同名文件时被覆盖。
    with target_path.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(migrated, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="迁移 V19 θ1 JSON 到独立 Path3 输入 schema")
    parser.add_argument("--input", type=Path, required=True, help="原 θ1 JSON 文件")
    parser.add_argument("--output", type=Path, required=True, help="新的迁移输出文件")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    migrate_file(args.input, args.output)
    print(f"迁移完成：{args.output}")
    print("注意：此文件仅完成权重布局迁移，生产加载器尚未注册该独立 schema。")


if __name__ == "__main__":
    main()
