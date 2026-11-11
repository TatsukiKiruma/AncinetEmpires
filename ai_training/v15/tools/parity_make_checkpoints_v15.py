"""V15/T15-05：生成/更正 V15 schema 检查点。

**为什么需要这个脚本（公共实现缺口，未自行修改，见 task_status.blockedOn）**

`python/spatial_resnet_model.py:export_model_to_ts_json` 的 schema 推断是
「26 通道 + 53 维语义 ⇒ v14，其余 ⇒ v13」的二分；V15 与 V14 形状完全相同，
因此训练器带 `--encoder-schema-id spatial26_global20_actionSemantics53_v15` 跑完后
在收尾导出时必然抛错：

    ValueError: 导出的 encoderSchemaId='spatial26_global20_actionSemantics53_v15'
    与权重形状推断出的 'spatial26_global20_actionSemantics53_v14' 不一致

不传 `--encoder-schema-id` 时导出会成功，但写出的 `encoderSchemaId` 是 **v14**，
而权重实际是在 V15 语义数据上训练的；按 v14 加载会让 TS 侧用 `v14_no_exp_projection`
语义解释这些权重（正是 V14b 审核 G1 那类"模型能加载但输入语义不兼容"的问题）。

本脚本因此只做两件在 T15-05 文件范围内、可审计的事：
1. 生成一个确定性的**合成 V15 检查点**（`torch.manual_seed` 固定），用于数值一致性；
2. 把训练器导出的检查点**只改写 `encoderSchemaId` 一个字段**，写成 `*_v15.json`，
   并输出逐字段差异报告（必须只有这一个键变化），供 TS 侧按真实语义加载。

不改动 `python/spatial_resnet_model.py`，也不覆盖训练器原始输出。

用法：
    python v15/tools/parity_make_checkpoints_v15.py --out-dir <T15-05>/checkpoints \
        [--relabel <trainer_export.json> ...]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

V15_SCHEMA = "spatial26_global20_actionSemantics53_v15"
V14_SCHEMA = "spatial26_global20_actionSemantics53_v14"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def relabel(source: Path, target: Path, schema: str = V15_SCHEMA) -> Dict[str, Any]:
    """只改写 encoderSchemaId；逐字段核对确实只有这一个键变化。"""
    import copy

    original = json.loads(source.read_text(encoding="utf-8"))
    updated = copy.deepcopy(original)
    before = original.get("encoderSchemaId")
    updated["encoderSchemaId"] = schema
    changed_keys = [k for k in set(original) | set(updated) if original.get(k) != updated.get(k)]
    if changed_keys != ["encoderSchemaId"]:
        raise RuntimeError(f"{source} 的改写影响了非预期字段：{changed_keys}")
    channels = int(updated.get("spatialChannels") or updated["stem"]["inChannels"])
    semantic_dim = int(updated["polDense1"]["inDim"]) - 32 * 3 - 20
    if channels != 26 or semantic_dim != 53:
        raise RuntimeError(
            f"{source} 的形状与 V15 schema 不符：channels={channels}, semantic={semantic_dim}"
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(updated, indent=2) + "\n", encoding="utf-8")
    return {
        "sourcePath": str(source).replace("\\", "/"),
        "sourceSha256": sha256_file(source),
        "targetPath": str(target).replace("\\", "/"),
        "targetSha256": sha256_file(target),
        "changedKeys": changed_keys,
        "encoderSchemaIdBefore": before,
        "encoderSchemaIdAfter": schema,
        "channels": channels,
        "semanticDim": semantic_dim,
    }


def build_synthetic(out_path: Path, seed: int = 42) -> Dict[str, Any]:
    """确定性随机初始化 + 标准导出（导出的 schema 由形状推断为 v14），随后更正为 v15。"""
    import torch
    from spatial_resnet_model import SpatialResNet, export_model_to_ts_json

    torch.manual_seed(seed)
    model = SpatialResNet(
        spatial_channels=26,
        trunk_channels=32,
        global_dim=20,
        action_semantic_dim=53,
        version="spatial-resnet-v2",
        num_blocks=2,
        global_policy_pool=False,
    )
    interim = out_path.with_suffix(".shape_inferred.json")
    export_model_to_ts_json(model, str(interim))
    return relabel(interim, out_path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--relabel", nargs="*", default=[])
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--skip-synthetic", action="store_true", default=False,
                        help="只做 relabel（避免重复生成合成检查点与覆盖报告）")
    parser.add_argument("--report-name", default="checkpoint_relabel_report.json")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    report: Dict[str, Any] = {
        "schema": "v15_checkpoint_relabel_report_1",
        "task": "T15-05",
        "targetSchema": V15_SCHEMA,
        "reason": "python/spatial_resnet_model.py:export_model_to_ts_json 只能推断 v13/v14，"
                  "无法表达 v15；不改公共实现，只在 T15-05 产物内更正 schema 标签。",
        "synthetic": [],
        "relabelled": [],
    }

    if not args.skip_synthetic:
        synthetic_path = out_dir / f"synthetic_v15_s{args.seed}.json"
        report["synthetic"].append(build_synthetic(synthetic_path, args.seed))

    for item in args.relabel:
        source = Path(item)
        target = out_dir / f"{source.stem}_v15.json"
        report["relabelled"].append(relabel(source, target))

    report_path = out_dir / args.report_name
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "reportPath": str(report_path),
        "synthetic": [entry["targetPath"] for entry in report["synthetic"]],
        "relabelled": [entry["targetPath"] for entry in report["relabelled"]],
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
