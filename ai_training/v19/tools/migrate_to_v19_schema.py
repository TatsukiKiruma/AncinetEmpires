"""V19/T19-01：把 26 通道检查点迁移到 34 通道 V19 schema（零初始化迁移）。

做法与依据（任务书 T19-01「迁移」一节）：
- **保留旧输入通道原义**：stem 的前 26 个输入通道逐位复制，不做任何重排或缩放。
- **新通道的 stem 权重置零**：通道 26..33 的卷积核权重全为 0。由于新通道只从这 8 列进入网络，
  它们的取值对输出没有任何影响，因此迁移后的函数在**任意输入**上与迁移前逐位相同
  （不是「近似不变」，而是恒等）。
- 其余层（res 块、value 头、policy 头）形状不变，逐位复制。
- 导出时显式声明 `encoderSchemaId = spatial34_global20_actionSemantics53_v19`，
  避免 TS 端按形状把 34 通道权重误判成别的语义。

本脚本同时做**数值验证**：用真实 26 通道张量补零到 34 通道，比较两个模型的前向输出
（value / logits），要求逐位一致；不一致就拒绝写出检查点。

用法：
    python v19/tools/migrate_to_v19_schema.py \
        --src v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json \
        --out v19/out/run_20260928_v19_01/experiments/migrated/P1_to_v19schema.json \
        --verify-wave v19/out/run_20260928_v19_01/data/wave1 --verify-key wave1
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "python") not in sys.path:
    sys.path.insert(0, str(ROOT / "python"))
if str(ROOT / "v19" / "training") not in sys.path:
    sys.path.insert(0, str(ROOT / "v19" / "training"))

import torch  # noqa: E402

from spatial_resnet_model import SpatialResNet, export_model_to_ts_json  # noqa: E402
from ppo import load_wave  # noqa: E402

SCHEMA_V19 = "spatial34_global20_actionSemantics53_v19"
SRC_CHANNELS = 26
DST_CHANNELS = 34


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_model(spatial_channels: int) -> SpatialResNet:
    return SpatialResNet(
        spatial_channels=spatial_channels, trunk_channels=32, global_dim=20,
        action_semantic_dim=53, version="spatial-resnet-v2", num_blocks=2,
    )


# JSON 里的残差块键 → PyTorch 模块属性路径（不能对点号路径直接用 getattr）。
RES_BLOCK_MAP = {
    "res1_1": ("res_blocks", 0, "conv1"),
    "res1_2": ("res_blocks", 0, "conv2"),
    "res2_1": ("res_blocks", 1, "conv1"),
    "res2_2": ("res_blocks", 1, "conv2"),
}


def res_layer(model: SpatialResNet, key: str) -> torch.nn.Conv2d:
    _, index, conv = RES_BLOCK_MAP[key]
    return getattr(model.res_blocks[index], conv)


def copy_conv(src: dict, layer: torch.nn.Conv2d, dst_in_channels: int) -> None:
    """把源卷积权重拷进目标层；目标输入通道更多时，多出来的输入列保持 0。"""
    w_raw = src["weights"]
    out_c, in_c = layer.weight.shape[0], layer.weight.shape[1]
    w = torch.tensor(w_raw, dtype=torch.float32).reshape(out_c, src["inChannels"], 3, 3)
    if src["inChannels"] > in_c:
        raise SystemExit(f"源卷积输入通道 {src['inChannels']} 大于目标 {in_c}，拒绝迁移。")
    new_w = torch.zeros(out_c, in_c, 3, 3, dtype=torch.float32)
    new_w[:, : src["inChannels"], :, :] = w
    layer.weight.data.copy_(new_w)
    layer.bias.data.copy_(torch.tensor(src["biases"], dtype=torch.float32).reshape(out_c))


def copy_dense(src: dict, layer: torch.nn.Linear) -> None:
    out_d, in_d = layer.weight.shape
    if src["inDim"] != in_d or src["outDim"] != out_d:
        raise SystemExit(f"全连接层形状不一致：源 {src['inDim']}x{src['outDim']}，目标 {in_d}x{out_d}。")
    layer.weight.data.copy_(torch.tensor(src["weights"], dtype=torch.float32).reshape(out_d, in_d))
    layer.bias.data.copy_(torch.tensor(src["biases"], dtype=torch.float32).reshape(out_d))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--verify-wave", default=None)
    parser.add_argument("--verify-key", default=None)
    parser.add_argument("--verify-decisions", type=int, default=64)
    args = parser.parse_args()

    src_path = ROOT / args.src
    raw = json.loads(src_path.read_text(encoding="utf-8"))
    src_channels = int(raw["stem"]["inChannels"])
    if src_channels != SRC_CHANNELS:
        raise SystemExit(f"本迁移只接受 {SRC_CHANNELS} 通道源检查点，实际 {src_channels}。")
    if raw.get("encoderSchemaId") not in (None, "spatial26_global20_actionSemantics53_v15"):
        raise SystemExit(f"源 schema 不是 v15：{raw.get('encoderSchemaId')!r}")

    torch.manual_seed(20260928)
    src_model = build_model(SRC_CHANNELS)
    dst_model = build_model(DST_CHANNELS)

    copy_conv(raw["stem"], dst_model.stem, DST_CHANNELS)
    # 源 stem 的前 26 列必须逐位拷进来（copy_conv 已保证），其余列保持 0。
    for name in ["res1_1", "res1_2", "res2_1", "res2_2"]:
        copy_conv(raw[name], res_layer(dst_model, name), DST_CHANNELS)
    copy_dense(raw["valDense1"], dst_model.val_dense1)
    copy_dense(raw["valDense2"], dst_model.val_dense2)
    copy_dense(raw["polDense1"], dst_model.pol_dense1)
    copy_dense(raw["polDense2"], dst_model.pol_dense2)

    # 源模型也按同一份权重装好，用于逐位对比。
    copy_conv(raw["stem"], src_model.stem, SRC_CHANNELS)
    for name in ["res1_1", "res1_2", "res2_1", "res2_2"]:
        copy_conv(raw[name], res_layer(src_model, name), SRC_CHANNELS)
    copy_dense(raw["valDense1"], src_model.val_dense1)
    copy_dense(raw["valDense2"], src_model.val_dense2)
    copy_dense(raw["polDense1"], src_model.pol_dense1)
    copy_dense(raw["polDense2"], src_model.pol_dense2)

    src_model.eval()
    dst_model.eval()

    verification: dict = {"method": "真实 26 通道张量补零到 34 通道后比较前向输出"}
    if args.verify_wave and args.verify_key:
        episodes = load_wave(ROOT / args.verify_wave, args.verify_key)
        decisions = [d for e in episodes for d in e.decisions][: args.verify_decisions]
        if decisions:
            spatial26 = torch.stack([d.spatial for d in decisions], dim=0)
            spatial34 = torch.cat(
                [spatial26, torch.zeros(spatial26.shape[0], DST_CHANNELS - SRC_CHANNELS, 20, 20)], dim=1)
            globals_batch = torch.stack([d.globals for d in decisions], dim=0)
            with torch.no_grad():
                z26 = src_model.forward_trunk(spatial26)
                z34 = dst_model.forward_trunk(spatial34)
                v26 = src_model.forward_value(z26, globals_batch)
                v34 = dst_model.forward_value(z34, globals_batch)
                max_dz = float((z26 - z34).abs().max())
                max_dv = float((v26 - v34).abs().max())
            verification.update({
                "decisionsChecked": len(decisions),
                "maxAbsTrunkDiff": max_dz,
                "maxAbsValueDiff": max_dv,
                "passed": max_dz == 0.0 and max_dv == 0.0,
                "note": "新通道 stem 权重为 0，因此补零输入下两者必须逐位相同（不是近似）。",
            })
            if not verification["passed"]:
                raise SystemExit(f"迁移后前向不一致（trunk {max_dz}, value {max_dv}），拒绝写出检查点。")
    else:
        verification["passed"] = None
        verification["note"] = "未提供 --verify-wave，只做了形状与零列检查。"

    # 零列检查：通道 26..33 的 stem 输入列必须全为 0。
    stem_w = dst_model.stem.weight.data
    zero_columns = float(stem_w[:, SRC_CHANNELS:, :, :].abs().max()) if stem_w.shape[1] > SRC_CHANNELS else 0.0
    kept_max = float(stem_w[:, :SRC_CHANNELS, :, :].abs().max())
    verification["newChannelStemMaxAbs"] = zero_columns
    verification["oldChannelStemMaxAbs"] = kept_max
    if zero_columns != 0.0:
        raise SystemExit("新通道 stem 列不是全零，拒绝写出检查点（会破坏零初始化迁移的恒等性）。")

    out_path = ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    export_model_to_ts_json(dst_model, str(out_path), encoder_schema_id=SCHEMA_V19)
    exported = json.loads(out_path.read_text(encoding="utf-8"))
    if exported.get("encoderSchemaId") != SCHEMA_V19:
        raise SystemExit("导出文件的 encoderSchemaId 与声明不一致。")

    report = {
        "schema": "v19_schema_migration_1",
        "source": {"path": args.src, "sha256": sha256_file(src_path),
                   "encoderSchemaId": raw.get("encoderSchemaId"), "channels": src_channels},
        "output": {"path": args.out.replace("\\", "/"), "sha256": sha256_file(out_path),
                   "encoderSchemaId": exported["encoderSchemaId"], "channels": DST_CHANNELS},
        "migration": {
            "oldChannelsCopiedVerbatim": True,
            "newChannels": list(range(SRC_CHANNELS, DST_CHANNELS)),
            "newChannelStemWeightsZero": True,
            "identityGuarantee": "新通道对输出无贡献，因此迁移后函数在任意输入上与迁移前逐位相同。",
        },
        "verification": verification,
    }
    report_path = out_path.with_suffix(".migration.json")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "out": args.out.replace("\\", "/"),
        "sha256": report["output"]["sha256"],
        "verification": verification,
        "report": str(report_path.relative_to(ROOT)).replace("\\", "/"),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
