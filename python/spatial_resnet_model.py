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
            spatial_channels: int = 24,
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


def export_model_to_ts_json(model: Any, output_file: str) -> None:
    """
    Exports PyTorch model weights to TypeScript-compatible JSON format.
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

    data = {
        "version": version,
        "numBlocks": num_blocks,
        "architectureId": f"spatial_resnet_32ch_{num_blocks}res" + ("_gappool" if global_policy_pool else ""),
        "globalPolicyPool": global_policy_pool,
        "stem": export_conv("stem", 24, 32),
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
    print(f"Exported SpatialResNet ({version}, pol_in={pol_in_dim}) to {output_file}")


def load_model_from_ts_json(model: Any, json_file: str) -> None:
    """
    Loads PyTorch model weights from a TypeScript-compatible JSON checkpoint for warm-start fine-tuning.
    """
    if not TORCH_AVAILABLE:
        raise RuntimeError("PyTorch is required for weight loading")

    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

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
                print(f"[Warm-Start] {name}: copied {checkpoint_in_dim} input dims, {target.shape[1] - checkpoint_in_dim} new dims initialized")
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

