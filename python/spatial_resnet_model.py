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
            global_dim: int = 16,
            action_semantic_dim: int = 24
        ):
            super().__init__()
            self.spatial_channels = spatial_channels
            self.trunk_channels = trunk_channels
            self.global_dim = global_dim
            self.action_semantic_dim = action_semantic_dim

            # 1. Stem
            self.stem = nn.Conv2d(spatial_channels, trunk_channels, kernel_size=3, padding=1)

            # 2. ResBlocks
            self.res1 = ConvBlock(trunk_channels, trunk_channels)
            self.res2 = ConvBlock(trunk_channels, trunk_channels)

            # 3. Value Head
            self.val_dense1 = nn.Linear(trunk_channels + global_dim, 32)
            self.val_dense2 = nn.Linear(32, 1)

            # 4. Policy Scorer Head
            # Input: 3 x trunk_channels (actor, landing, target) + action_semantic_dim = 3 * 32 + 24 = 120
            self.pol_dense1 = nn.Linear(trunk_channels * 3 + action_semantic_dim, 48)
            self.pol_dense2 = nn.Linear(48, 1)

        def forward_trunk(self, spatial_tensor: torch.Tensor) -> torch.Tensor:
            """
            Input: [B, 24, 20, 20]
            Output: Z [B, 32, 20, 20]
            """
            x = F.relu(self.stem(spatial_tensor))
            x = self.res1(x)
            z = self.res2(x)
            return z

        def forward_value(self, z: torch.Tensor, global_features: torch.Tensor) -> torch.Tensor:
            """
            Input: Z [B, 32, 20, 20], Globals [B, 16]
            Output: V [B, 1] in [-1, 1]
            """
            # Global Average Pooling -> [B, 32]
            gap = torch.mean(z, dim=[2, 3])
            val_in = torch.cat([gap, global_features], dim=-1)
            h = F.relu(self.val_dense1(val_in))
            val = torch.tanh(self.val_dense2(h))
            return val

        def forward_action_logits(self, action_features: torch.Tensor) -> torch.Tensor:
            """
            Input: [B, K, 120] (K candidate actions per state)
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
        "version": "spatial-resnet-v1",
        "architectureId": "spatial_resnet_32ch_2res",
        "stem": export_conv("stem", 24, 32),
        "res1_1": export_conv("res1.conv1", 32, 32),
        "res1_2": export_conv("res1.conv2", 32, 32),
        "res2_1": export_conv("res2.conv1", 32, 32),
        "res2_2": export_conv("res2.conv2", 32, 32),
        "valDense1": export_dense("val_dense1", 48, 32),
        "valDense2": export_dense("val_dense2", 32, 1),
        "polDense1": export_dense("pol_dense1", 120, 48),
        "polDense2": export_dense("pol_dense2", 48, 1)
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Exported SpatialResNet model to {output_file}")
