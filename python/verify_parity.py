"""
Cross-language parity verification script for Spatial ResNet (Python side).
Loads a model checkpoint, accepts an encoded state and candidates from stdin/file,
and outputs trunk Z features and candidate logits as JSON.
"""

import sys
import os
import json
import numpy as np
import torch
import torch.nn.functional as F

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from spatial_resnet_model import SpatialResNet

def load_spatial_model_from_json(json_path: str) -> SpatialResNet:
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    version = data.get("version", "spatial-resnet-v2")
    num_blocks = data.get("numBlocks", 2)
    global_dim = 20 if version == "spatial-resnet-v2" else 16
    action_dim = 32 if version == "spatial-resnet-v2" else 24

    model = SpatialResNet(
        spatial_channels=24,
        trunk_channels=32,
        global_dim=global_dim,
        action_semantic_dim=action_dim,
        version=version,
        num_blocks=num_blocks
    )

    state_dict = {}

    def load_conv(prefix: str, block_data: dict):
        w = np.array(block_data["weights"], dtype=np.float32).reshape(
            block_data["outChannels"], block_data["inChannels"], 3, 3
        )
        b = np.array(block_data["biases"], dtype=np.float32)
        state_dict[f"{prefix}.weight"] = torch.from_numpy(w)
        state_dict[f"{prefix}.bias"] = torch.from_numpy(b)

    def load_dense(prefix: str, block_data: dict):
        w = np.array(block_data["weights"], dtype=np.float32).reshape(
            block_data["outDim"], block_data["inDim"]
        )
        b = np.array(block_data["biases"], dtype=np.float32)
        state_dict[f"{prefix}.weight"] = torch.from_numpy(w)
        state_dict[f"{prefix}.bias"] = torch.from_numpy(b)

    load_conv("stem", data["stem"])
    load_conv("res_blocks.0.conv1", data["res1_1"])
    load_conv("res_blocks.0.conv2", data["res1_2"])
    load_conv("res_blocks.1.conv1", data["res2_1"])
    load_conv("res_blocks.1.conv2", data["res2_2"])

    if num_blocks >= 4 and "res3_1" in data:
        load_conv("res_blocks.2.conv1", data["res3_1"])
        load_conv("res_blocks.2.conv2", data["res3_2"])
        load_conv("res_blocks.3.conv1", data["res4_1"])
        load_conv("res_blocks.3.conv2", data["res4_2"])

    load_dense("val_dense1", data["valDense1"])
    load_dense("val_dense2", data["valDense2"])
    load_dense("pol_dense1", data["polDense1"])
    load_dense("pol_dense2", data["polDense2"])

    model.load_state_dict(state_dict, strict=False)
    model.eval()
    return model

def pool_coords_batch(z_single: torch.Tensor, coords: list) -> torch.Tensor:
    C, H, W = z_single.shape
    out = []
    for c in coords:
        if c is None or not isinstance(c, dict) or "x" not in c or "y" not in c:
            out.append(torch.zeros(C, dtype=torch.float32))
        else:
            x, y = int(c["x"]), int(c["y"])
            if 0 <= x < W and 0 <= y < H:
                out.append(z_single[:, y, x])
            else:
                out.append(torch.zeros(C, dtype=torch.float32))
    return torch.stack(out, dim=0)

def main():
    if len(sys.argv) < 3:
        print("Usage: python verify_parity.py <model_json> <input_json> [output_json]")
        sys.exit(1)

    model_path = sys.argv[1]
    input_path = sys.argv[2]
    out_path = sys.argv[3] if len(sys.argv) > 3 else None

    model = load_spatial_model_from_json(model_path)

    with open(input_path, "r", encoding="utf-8") as f:
        inp = json.load(f)

    spatial_t = torch.tensor(inp["spatialTensor"], dtype=torch.float32).reshape(1, 24, 20, 20)
    global_f = torch.tensor(inp["globalFeatures"], dtype=torch.float32).reshape(1, -1)

    with torch.no_grad():
        z = model.forward_trunk(spatial_t)  # [1, 32, 20, 20]
        z_b = z[0]

        cand_list = inp["candidateActions"]
        K = len(cand_list)
        if K == 0:
            logits = []
            best_idx = 0
        else:
            act_coords = [c.get("actorCoord") for c in cand_list]
            land_coords = [c.get("landingCoord") for c in cand_list]
            tgt_coords = [c.get("targetCoord") for c in cand_list]

            v_act = pool_coords_batch(z_b, act_coords)
            v_land = pool_coords_batch(z_b, land_coords)
            v_tgt = pool_coords_batch(z_b, tgt_coords)

            sem_list = []
            for c in cand_list:
                s = c.get("semantics", [])
                if len(s) < 32:
                    s = s + [0.0] * (32 - len(s))
                else:
                    s = s[:32]
                sem_list.append(s)
            sem_tensor = torch.tensor(sem_list, dtype=torch.float32)

            glob_expanded = global_f.expand(K, -1)
            cand_feats = torch.cat([v_act, v_land, v_tgt, sem_tensor, glob_expanded], dim=-1).unsqueeze(0)
            logits_tensor = model.forward_action_logits(cand_feats).squeeze(0)
            logits = logits_tensor.tolist()
            best_idx = int(torch.argmax(logits_tensor).item())

    res = {
        "spatialZ": z_b.flatten().tolist(),
        "actionLogits": logits,
        "bestActionIndex": best_idx
    }

    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(res, f)
    else:
        print(json.dumps(res))

if __name__ == "__main__":
    main()
