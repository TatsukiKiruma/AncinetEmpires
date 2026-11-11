"""
AncientEmpires - Spatial Conv ResNet (PyTorch Implementation for Path B)
Exact 1:1 match with TypeScript SpatialConvResNet architecture.
"""

import json
from typing import Dict, Any, List, Optional
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False


PATH3_ENCODER_SCHEMA_ID = "spatial34_global20_actionSemantics56_v19_path3"

# 中文：schema 同时描述输入语义与张量形状。相同形状仍可能有不同语义，
# 因此导出和加载都必须按白名单校验，不能只凭权重长度猜测。
_SCHEMA_SHAPE_FAMILIES = {
    (24, 24): {"spatial24_global16_actionSemantics24_v1"},
    (24, 32): {"spatial24_global20_actionSemantics32_v13", "spatial24_global16_actionSemantics24_v1"},
    (26, 53): {"spatial26_global20_actionSemantics53_v14", "spatial26_global20_actionSemantics53_v15"},
    (34, 53): {"spatial34_global20_actionSemantics53_v19"},
    (34, 56): {PATH3_ENCODER_SCHEMA_ID},
}
_DEFAULT_SCHEMA_BY_SHAPE = {
    (24, 24): "spatial24_global16_actionSemantics24_v1",
    (24, 32): "spatial24_global20_actionSemantics32_v13",
    (26, 53): "spatial26_global20_actionSemantics53_v14",
    (34, 53): "spatial34_global20_actionSemantics53_v19",
    (34, 56): PATH3_ENCODER_SCHEMA_ID,
}
_KNOWN_SCHEMAS = {schema for schemas in _SCHEMA_SHAPE_FAMILIES.values() for schema in schemas}


if TORCH_AVAILABLE:
    class ConvBlock(nn.Module):
        def __init__(self, in_channels: int, out_channels: int):
            super().__init__()
            self.conv1 = nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1)
            self.conv2 = nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            residual = x
            out = F.relu(self.conv1(x))
            out = self.conv2(out)
            out = F.relu(out + residual)
            return out


    class SpatialResNet(nn.Module):
        def __init__(
            self,
            # V14/T14-03：通道数由编码器 schema 决定（v13=24，v14=26），必须与数据集/检查点一致。
    spatial_channels: int = 26,
            trunk_channels: int = 32,
            global_dim: int = 20,
            action_semantic_dim: int = 32,
            version: str = "spatial-resnet-v2",
            num_blocks: int = 2,
            global_policy_pool: bool = False
        ):
            super().__init__()
            self.spatial_channels = spatial_channels
            self.trunk_channels = trunk_channels
            self.global_dim = global_dim
            self.action_semantic_dim = action_semantic_dim
            self.version = version
            self.num_blocks = num_blocks
            self.global_policy_pool = bool(global_policy_pool)

            # 1. Stem
            self.stem = nn.Conv2d(spatial_channels, trunk_channels, kernel_size=3, padding=1)

            # 2. ResBlocks
            self.res_blocks = nn.ModuleList([
                ConvBlock(trunk_channels, trunk_channels) for _ in range(num_blocks)
            ])
            self.res1 = self.res_blocks[0]
            self.res2 = self.res_blocks[1]
            if num_blocks >= 4:
                self.res3 = self.res_blocks[2]
                self.res4 = self.res_blocks[3]

            # 3. Value Head
            self.val_dense1 = nn.Linear(trunk_channels + global_dim, 32)
            self.val_dense2 = nn.Linear(32, 1)

            # 4. Policy Scorer Head
            # V2: 3 x trunk (96) + action_semantics (32) + globals (20) = 148
            # V1: 3 x trunk (96) + action_semantics (24) = 120
            pol_in_dim = trunk_channels * 3 + action_semantic_dim + (global_dim if version == "spatial-resnet-v2" else 0)
            if self.global_policy_pool:
                pol_in_dim += trunk_channels
            self.pol_dense1 = nn.Linear(pol_in_dim, 48)
            self.pol_dense2 = nn.Linear(48, 1)

        def forward_trunk(self, spatial_tensor: torch.Tensor) -> torch.Tensor:
            """
            Input: [B, 24, 20, 20]
            Output: Z [B, 32, 20, 20]
            """
            x = F.relu(self.stem(spatial_tensor))
            for block in self.res_blocks:
                x = block(x)
            return x

        def forward_value(self, z: torch.Tensor, global_features: torch.Tensor) -> torch.Tensor:
            """
            Input: Z [B, 32, 20, 20], Globals [B, G]
            Output: V [B, 1] in [-1, 1]
            """
            gap = torch.mean(z, dim=[2, 3])
            val_in = torch.cat([gap, global_features], dim=-1)
            h = F.relu(self.val_dense1(val_in))
            val = torch.tanh(self.val_dense2(h))
            return val

        def forward_action_logits(self, action_features: torch.Tensor) -> torch.Tensor:
            """
            Input: [B, K, pol_in_dim]
            Output: [B, K]
            """
            h = F.relu(self.pol_dense1(action_features))
            logits = self.pol_dense2(h).squeeze(-1)
            return logits


def export_model_to_ts_json(model: Any, output_file: str, encoder_schema_id: str | None = None) -> None:
    """
    Exports PyTorch model weights to TypeScript-compatible JSON format.

    V14/T14-03: ``encoder_schema_id`` 记录该权重所解释的输入语义版本。
    张量形状不变但语义可能变化（例如反击特征），因此必须随权重一起写出，
    否则推理端只能按历史语义解释，无法发现静默错配。
    """
    if not TORCH_AVAILABLE:
        raise RuntimeError("PyTorch is required for weight export")

    state_dict = model.state_dict()
    version = getattr(model, "version", "spatial-resnet-v2")
    num_blocks = getattr(model, "num_blocks", 2)
    global_policy_pool = bool(getattr(model, "global_policy_pool", False))
    val_in_dim = model.val_dense1.in_features
    pol_in_dim = model.pol_dense1.in_features

    def export_conv(layer_prefix: str, in_c: int, out_c: int) -> Dict[str, Any]:
        w = state_dict[f"{layer_prefix}.weight"].detach().cpu().numpy()
        b = state_dict[f"{layer_prefix}.bias"].detach().cpu().numpy()
        return {
            "inChannels": in_c,
            "outChannels": out_c,
            "kernelSize": 3,
            "padding": 1,
            "weights": w.flatten().tolist(),
            "biases": b.flatten().tolist()
        }

    def export_dense(layer_prefix: str, in_d: int, out_d: int) -> Dict[str, Any]:
        w = state_dict[f"{layer_prefix}.weight"].detach().cpu().numpy()
        b = state_dict[f"{layer_prefix}.bias"].detach().cpu().numpy()
        return {
            "inDim": in_d,
            "outDim": out_d,
            "weights": w.flatten().tolist(),
            "biases": b.flatten().tolist()
        }

    # V14/T14-03：导出的 schema 身份必须与权重实际形状一致，否则 TS 端会拒绝加载。
    #
    # V15/T15-02：形状相同的 v14 与 v15 **不能靠维度区分**（都是 26 通道 + 53 维语义）。
    # 因此这里必须由调用方显式声明 schema；只在完全没有声明时才退回到「形状 ⇒ v14」
    # 的历史推断，并明确打印该推断，避免把 V15 数据训练出来的权重静默标成 V14 语义。
    _channels = int(getattr(model, "spatial_channels", 24))
    _sem_dim = int(getattr(model, "action_semantic_dim", 32))
    # V19/T19-01：形状 → 形状族的映射必须显式登记，未登记的 (channels, semantic) 组合一律拒绝导出，
    # 而不是落进某个「默认族」。34/53 是 V19 新增的空间通道扩展族。
    _shape_key = (_channels, _sem_dim)
    if _shape_key not in _DEFAULT_SCHEMA_BY_SHAPE:
        raise ValueError(
            f"未登记的空间形状（channels={_channels}, semantic={_sem_dim}）：无法判断它属于哪个"
            f" encoder schema 形状族。已登记的组合为 {sorted(_DEFAULT_SCHEMA_BY_SHAPE)}。拒绝写出可能被误读的检查点。"
        )
    _shape_family_schema = _DEFAULT_SCHEMA_BY_SHAPE[_shape_key]
    _declared = encoder_schema_id or getattr(model, "encoder_schema_id", None)
    _same_shape_family = _SCHEMA_SHAPE_FAMILIES[_shape_key]
    if _declared:
        if _declared not in _same_shape_family:
            raise ValueError(
                f"导出的 encoderSchemaId={_declared!r} 与权重形状（channels={_channels}, "
                f"semantic={_sem_dim}）不属于同一形状族 {sorted(_same_shape_family)}。"
                "拒绝写出自相矛盾的检查点。"
            )
        _effective_schema = _declared
    else:
        _effective_schema = _shape_family_schema
        print(f"[V15] 未显式声明 encoderSchemaId：按形状推断为 {_effective_schema}。"
              "26/53 形状的 v14 与 v15 语义不同，训练新 schema 时必须显式传入 "
              "--encoder-schema-id，否则权重会被标成 V14 语义。")
    data = {
        "version": version,
        "numBlocks": num_blocks,
        "architectureId": f"spatial_resnet_32ch_{num_blocks}res" + ("_gappool" if global_policy_pool else ""),
        "globalPolicyPool": global_policy_pool,
        # V14/T14-03：显式记录空间通道数，与 encoderSchemaId 一起构成输入语义身份。
        "spatialChannels": _channels,
        # V14/T14-03: 训练特征 schema 身份。**必须与权重形状一致**：
        # 显式传入但形状不符时拒绝导出，避免写出自相矛盾、TS 端必然拒载的检查点。
        # V15/T15-02：26/53 形状族内 v14 与 v15 语义不同，这里写的是**实际生效**的 schema
        # （显式声明优先，未声明才按形状推断成 v14）。
        "encoderSchemaId": _effective_schema,
        "stem": export_conv("stem", _channels, 32),
        "res1_1": export_conv("res_blocks.0.conv1", 32, 32),
        "res1_2": export_conv("res_blocks.0.conv2", 32, 32),
        "res2_1": export_conv("res_blocks.1.conv1", 32, 32),
        "res2_2": export_conv("res_blocks.1.conv2", 32, 32),
        "valDense1": export_dense("val_dense1", val_in_dim, 32),
        "valDense2": export_dense("val_dense2", 32, 1),
        "polDense1": export_dense("pol_dense1", pol_in_dim, 48),
        "polDense2": export_dense("pol_dense2", 48, 1)
    }

    if num_blocks >= 4:
        data["res3_1"] = export_conv("res_blocks.2.conv1", 32, 32)
        data["res3_2"] = export_conv("res_blocks.2.conv2", 32, 32)
        data["res4_1"] = export_conv("res_blocks.3.conv1", 32, 32)
        data["res4_2"] = export_conv("res_blocks.3.conv2", 32, 32)

    import os
    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Exported SpatialResNet ({version}, pol_in={pol_in_dim}, encoderSchemaId={data['encoderSchemaId']}) to {output_file}")


def load_model_from_ts_json(model: Any, json_file: str, zero_new_policy_dims: bool = False) -> None:
    """
    Loads PyTorch model weights from a TypeScript-compatible JSON checkpoint for warm-start fine-tuning.

    V18/T18-02：新增 `zero_new_policy_dims`。
    中文：把网络结构扩展（例如 Arm B 打开 GAP 全图汇总）当成一次**受控**实验时，
    新加进 policy 头的输入列必须是 0，这样初始 logits 与扩展前**逐位相同**，
    结构效果才不会被随机初始化漂移污染。
    默认 False ⇒ 完全保持历史行为（新列保留 PyTorch 的随机初始化）。
    """
    if not TORCH_AVAILABLE:
        raise RuntimeError("PyTorch is required for weight loading")

    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 中文：先验证完整身份，再写入任何参数，保证错误检查点不会留下半加载模型。
    checkpoint_schema = data.get("encoderSchemaId")
    if checkpoint_schema not in _KNOWN_SCHEMAS:
        raise ValueError(f"未知 encoderSchemaId={checkpoint_schema!r}，拒绝加载检查点")
    target_shape = (
        int(getattr(model, "spatial_channels", model.stem.in_channels)),
        int(getattr(model, "action_semantic_dim", -1)),
    )
    if target_shape not in _SCHEMA_SHAPE_FAMILIES:
        raise ValueError(f"目标模型形状族 {target_shape} 未登记，拒绝加载检查点")
    target_schema = getattr(model, "encoder_schema_id", None)
    allowed_target_schemas = _SCHEMA_SHAPE_FAMILIES[target_shape]
    if target_schema is not None and target_schema not in allowed_target_schemas:
        raise ValueError(f"目标模型 encoder_schema_id={target_schema!r} 与自身形状 {target_shape} 错配")
    if checkpoint_schema not in allowed_target_schemas or (target_schema is not None and checkpoint_schema != target_schema):
        if checkpoint_schema == "spatial34_global20_actionSemantics53_v19" and target_shape == (34, 56):
            raise ValueError(
                "禁止通用加载器把 34/53 前缀复制成 Path3 34/56；"
                "请先使用 v19/training/migrate_path3_model.py 按 149|3|20 布局专用迁移"
            )
        raise ValueError(
            f"检查点 schema={checkpoint_schema!r} 与目标模型形状/语义 {target_shape}"
            f"（允许 {sorted(allowed_target_schemas)}）不匹配"
        )
    expected_channels = next(shape[0] for shape, schemas in _SCHEMA_SHAPE_FAMILIES.items() if checkpoint_schema in schemas)
    if data.get("spatialChannels") != expected_channels:
        raise ValueError(
            f"检查点 spatialChannels={data.get('spatialChannels')!r} 与 schema={checkpoint_schema!r} 错配"
        )
    policy_layer = data.get("polDense1")
    if not isinstance(policy_layer, dict):
        raise ValueError("检查点缺少 polDense1")
    if checkpoint_schema == PATH3_ENCODER_SCHEMA_ID:
        if data.get("globalPolicyPool") is not False:
            raise ValueError("Path3 schema 当前只允许 globalPolicyPool=false")
        if policy_layer.get("inDim") != 172 or policy_layer.get("outDim") != 48:
            raise ValueError("Path3 polDense1 必须是 172->48，拒绝可能错列的检查点")
        weights = policy_layer.get("weights")
        if not isinstance(weights, list) or len(weights) != 172 * 48:
            raise ValueError("Path3 polDense1.weights 长度必须是 172*48")

    def load_conv(layer: nn.Conv2d, layer_dict: Dict[str, Any], name: str) -> None:
        w_raw = layer_dict.get("weights")
        b_raw = layer_dict.get("biases")
        if w_raw is None or b_raw is None:
            raise ValueError(f"Missing weights or biases for {name}")
        w = torch.tensor(w_raw, dtype=torch.float32).reshape(layer.weight.shape)
        b = torch.tensor(b_raw, dtype=torch.float32).reshape(layer.bias.shape)
        layer.weight.data.copy_(w)
        layer.bias.data.copy_(b)

    def load_dense(layer: nn.Linear, layer_dict: Dict[str, Any], name: str) -> None:
        w_raw = layer_dict.get("weights")
        b_raw = layer_dict.get("biases")
        if w_raw is None or b_raw is None:
            raise ValueError(f"Missing weights or biases for {name}")
        w = torch.tensor(w_raw, dtype=torch.float32)
        b = torch.tensor(b_raw, dtype=torch.float32)
        target = layer.weight
        if w.numel() == target.numel():
            layer.weight.data.copy_(w.reshape(target.shape))
        elif target.dim() == 2 and w.numel() % target.shape[0] == 0:
            checkpoint_in_dim = w.numel() // target.shape[0]
            if checkpoint_in_dim < target.shape[1]:
                # Warm-start an architecture extension (e.g. Arm 2 global-policy GAP).
                # Existing input columns are copied; the newly added columns keep
                # their fresh PyTorch initialization and are learned from scratch.
                old_w = w.reshape(target.shape[0], checkpoint_in_dim)
                layer.weight.data[:, :checkpoint_in_dim].copy_(old_w)
                new_dim_count = target.shape[1] - checkpoint_in_dim
                if zero_new_policy_dims:
                    # V18/T18-02 Arm B：新列置零 ⇒ 初始 logits 与扩展前逐位一致。
                    layer.weight.data[:, checkpoint_in_dim:].zero_()
                    print(
                        f"[Warm-Start] {name}: copied {checkpoint_in_dim} input dims, "
                        f"{new_dim_count} new dims ZEROED (logits parity with the pre-extension model)"
                    )
                else:
                    print(f"[Warm-Start] {name}: copied {checkpoint_in_dim} input dims, {new_dim_count} new dims initialized")
            else:
                raise ValueError(
                    f"Shape mismatch for {name}: checkpoint {tuple(w.shape)} vs model {tuple(target.shape)}"
                )
        else:
            raise ValueError(
                f"Shape mismatch for {name}: checkpoint {tuple(w.shape)} vs model {tuple(target.shape)}"
            )
        if b.numel() == layer.bias.numel():
            layer.bias.data.copy_(b.reshape(layer.bias.shape))
        else:
            raise ValueError(
                f"Bias shape mismatch for {name}: checkpoint {tuple(b.shape)} vs model {tuple(layer.bias.shape)}"
            )

    load_conv(model.stem, data["stem"], "stem")
    load_conv(model.res_blocks[0].conv1, data["res1_1"], "res1_1")
    load_conv(model.res_blocks[0].conv2, data["res1_2"], "res1_2")
    load_conv(model.res_blocks[1].conv1, data["res2_1"], "res2_1")
    load_conv(model.res_blocks[1].conv2, data["res2_2"], "res2_2")

    if model.num_blocks >= 4 and "res3_1" in data:
        load_conv(model.res_blocks[2].conv1, data["res3_1"], "res3_1")
        load_conv(model.res_blocks[2].conv2, data["res3_2"], "res3_2")
        load_conv(model.res_blocks[3].conv1, data["res4_1"], "res4_1")
        load_conv(model.res_blocks[3].conv2, data["res4_2"], "res4_2")

    load_dense(model.val_dense1, data["valDense1"], "valDense1")
    load_dense(model.val_dense2, data["valDense2"], "valDense2")
    load_dense(model.pol_dense1, data["polDense1"], "polDense1")
    load_dense(model.pol_dense2, data["polDense2"], "polDense2")
    print(f"[Warm-Start] Successfully loaded weights from {json_file}")

