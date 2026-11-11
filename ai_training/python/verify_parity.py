"""
Cross-language parity verification script for Spatial ResNet (Python side).
Loads a model checkpoint, accepts an encoded state and candidates from stdin/file,
and outputs trunk Z features and candidate logits as JSON.

V15/T15-05 增补（owner F）：
- 把前向拆成可复用函数 `forward_case`，批次模式与单例模式共用同一条路径，
  避免"比较脚本自己又实现一遍前向"这种无法证明等价的做法；
- 支持 `--batch`：一次加载模型、逐案例输出 logits/Z/value/bestActionIndex；
- 支持 `--expect-schema`：声明的 encoderSchemaId 与权重形状不一致时 fail-fast，
  而不是静默按 v13/v14 语义解释（V14b 审核 G1 的教训）。
"""

import sys
import os
import json
import numpy as np
import torch
import torch.nn.functional as F

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from spatial_resnet_model import SpatialResNet

# 形状 → schema 的推断只用于**校验**（v14 与 v15 形状相同，不能靠形状区分语义）。
_SHAPE_TO_SCHEMA = {
    (24, 24): "spatial24_global16_actionSemantics24_v1",
    (24, 32): "spatial24_global20_actionSemantics32_v13",
    (26, 53): "spatial26_global20_actionSemantics53_v14",
    (34, 53): "spatial34_global20_actionSemantics53_v19",
    (34, 56): "spatial34_global20_actionSemantics56_v19_path3",
}

_SCHEMA_TO_SHAPES = {
    "spatial24_global16_actionSemantics24_v1": {(24, 24)},
    "spatial24_global20_actionSemantics32_v13": {(24, 32)},
    "spatial26_global20_actionSemantics53_v14": {(26, 53)},
    "spatial26_global20_actionSemantics53_v15": {(26, 53)},
    "spatial34_global20_actionSemantics53_v19": {(34, 53)},
    "spatial34_global20_actionSemantics56_v19_path3": {(34, 56)},
}


def shape_schema_hint(spatial_channels: int, action_dim: int) -> str | None:
    return _SHAPE_TO_SCHEMA.get((int(spatial_channels), int(action_dim)))

def load_spatial_model_from_json(json_path: str) -> SpatialResNet:
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    version = data.get("version", "spatial-resnet-v2")
    num_blocks = data.get("numBlocks", 2)
    global_dim = 20 if version == "spatial-resnet-v2" else 16
    # V14/T14-03b：通道数与动作语义维度必须来自检查点自身。
    #
    # 为什么：本文件下方的前向路径已经改成从 model 读维度，但加载器仍然写死
    # 24 通道 / 32 维语义，于是 V14 检查点（26 通道、53 维语义）在这里直接抛
    # `size mismatch for stem.weight ... [32, 26, 3, 3] vs [32, 24, 3, 3]`，
    # 导致跨语言一致性检查无法执行 —— 这正是任务书要定位的「训练—推理不一致」类缺陷。
    #
    # 判据顺序（与 src/game/ai/spatial_conv_net.ts 的加载校验保持一致）：
    #   1. 显式 spatialChannels / stem.inChannels；
    #   2. 由 polDense1.inDim 反推语义维度（3*32 坐标池化 + 语义 + 全局 + 可选 GAP）。
    spatial_channels = int(data.get("spatialChannels") or data.get("stem", {}).get("inChannels") or 24)
    pol_in_dim = int(data.get("polDense1", {}).get("inDim") or 0)
    global_policy_pool = bool(data.get("globalPolicyPool", False))
    trunk_channels = int(data.get("stem", {}).get("outChannels") or 32)
    if pol_in_dim:
        derived = pol_in_dim - trunk_channels * 3 - global_dim - (trunk_channels if global_policy_pool else 0)
        action_dim = derived if derived > 0 else (32 if version == "spatial-resnet-v2" else 24)
    else:
        action_dim = 32 if version == "spatial-resnet-v2" else 24
    declared_schema = data.get("encoderSchemaId")
    actual_shape = (spatial_channels, action_dim)
    allowed_shapes = _SCHEMA_TO_SHAPES.get(declared_schema)
    if allowed_shapes is None:
        raise ValueError(f"未知 encoderSchemaId={declared_schema!r}，拒绝执行 parity")
    if actual_shape not in allowed_shapes:
        raise ValueError(
            f"encoderSchemaId={declared_schema!r} 声明的输入形状为 {sorted(allowed_shapes)}，"
            f"但由 stem/polDense1 实际推导为 {actual_shape}"
        )
    print(f"[verify_parity] {json_path}: channels={spatial_channels} "
          f"semantics={action_dim} globals={global_dim} blocks={num_blocks} "
          f"schema={data.get('encoderSchemaId')}")

    model = SpatialResNet(
        spatial_channels=spatial_channels,
        trunk_channels=trunk_channels,
        global_dim=global_dim,
        action_semantic_dim=action_dim,
        version=version,
        num_blocks=num_blocks,
        global_policy_pool=global_policy_pool,
    )
    model.encoder_schema_id = declared_schema

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

def forward_case(model: SpatialResNet, inp: dict) -> dict:
    """单案例前向：返回 spatialZ（扁平）、actionLogits、bestActionIndex、value。

    V15/T15-05：批次模式与单例模式共用此函数，比较脚本不再另写一份前向实现。
    候选数为 0 时返回空 logits 与 bestActionIndex=-1（不伪造 end_turn，也不吞掉错误）。
    """
    _C = int(model.spatial_channels)
    spatial_t = torch.tensor(inp["spatialTensor"], dtype=torch.float32).reshape(1, _C, 20, 20)
    global_f = torch.tensor(inp["globalFeatures"], dtype=torch.float32).reshape(1, -1)

    with torch.no_grad():
        z = model.forward_trunk(spatial_t)  # [1, 32, 20, 20]
        z_b = z[0]
        value = float(model.forward_value(z, global_f).item())

        cand_list = inp["candidateActions"]
        K = len(cand_list)
        if K == 0:
            return {
                "spatialZ": z_b.flatten().tolist(),
                "actionLogits": [],
                "bestActionIndex": -1,
                "value": value,
            }

        act_coords = [c.get("actorCoord") for c in cand_list]
        land_coords = [c.get("landingCoord") for c in cand_list]
        tgt_coords = [c.get("targetCoord") for c in cand_list]

        v_act = pool_coords_batch(z_b, act_coords)
        v_land = pool_coords_batch(z_b, land_coords)
        v_tgt = pool_coords_batch(z_b, tgt_coords)

        # V14/T14-03：语义维度由模型自身决定（v13=32，v14=53），不再写死 32。
        _sem_dim = int(model.action_semantic_dim)
        sem_list = []
        for c in cand_list:
            s = c.get("semantics", [])
            if len(s) < _sem_dim:
                s = s + [0.0] * (_sem_dim - len(s))
            else:
                s = s[:_sem_dim]
            sem_list.append(s)
        sem_tensor = torch.tensor(sem_list, dtype=torch.float32)

        glob_expanded = global_f.expand(K, -1)
        cand_feats = torch.cat([v_act, v_land, v_tgt, sem_tensor, glob_expanded], dim=-1)
        if bool(getattr(model, "global_policy_pool", False)):
            gap = torch.mean(z, dim=[2, 3]).expand(K, -1)
            cand_feats = torch.cat([cand_feats, gap], dim=-1)
        cand_feats = cand_feats.unsqueeze(0)
        logits_tensor = model.forward_action_logits(cand_feats).squeeze(0)
        logits = logits_tensor.tolist()
        best_idx = int(torch.argmax(logits_tensor).item())

    return {
        "spatialZ": z_b.flatten().tolist(),
        "actionLogits": logits,
        "bestActionIndex": best_idx,
        "value": value,
    }


def verify_checkpoint_schema(model_path: str, expect_schema: str | None) -> dict:
    """V15/T15-05：前向前先核对 schema 身份，矛盾就 fail-fast。

    V14b 审核 G1 的教训是「模型能加载 ≠ 输入语义兼容」：v14 与 v15 形状完全相同
    （26/53），只能靠声明的 encoderSchemaId 区分。这里不做语义推断，只做一致性拒绝。
    """
    with open(model_path, "r", encoding="utf-8") as handle:
        declared = json.load(handle).get("encoderSchemaId")
    if expect_schema and declared != expect_schema:
        raise SystemExit(
            f"[verify_parity] 检查点声明 encoderSchemaId={declared!r}，"
            f"与期望的 {expect_schema!r} 不一致；拒绝按错误语义前向。"
        )
    return {"declaredSchema": declared}


def main():
    argv = sys.argv[1:]
    # V15/T15-05：批次模式（比较脚本使用）。单例模式保持历史 CLI 不变。
    if argv and argv[0] == "--batch":
        rest = argv[1:]
        expect_schema = None
        if "--expect-schema" in rest:
            index = rest.index("--expect-schema")
            expect_schema = rest[index + 1]
            rest = rest[:index] + rest[index + 2:]
        if len(rest) < 2:
            print("Usage: python verify_parity.py --batch <model_json> <cases.jsonl> [output_json] [--expect-schema S]")
            sys.exit(1)
        model_path = rest[0]
        cases_path = rest[1]
        out_path = rest[2] if len(rest) > 2 else None

        schema_info = verify_checkpoint_schema(model_path, expect_schema)
        model = load_spatial_model_from_json(model_path)
        hint = shape_schema_hint(model.spatial_channels, model.action_semantic_dim)

        results = []
        with open(cases_path, "r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                record = json.loads(line)
                result = forward_case(model, {
                    "spatialTensor": record["spatialTensor"],
                    "globalFeatures": record["globalFeatures"],
                    "candidateActions": record["candidateActions"],
                })
                results.append({"caseId": record.get("caseId"), **result})

        payload = {
            "schema": "v15_python_forward_raw_1",
            "task": "T15-05",
            "side": "python",
            "checkpointPath": model_path.replace("\\", "/"),
            "checkpointEncoderSchemaId": schema_info["declaredSchema"],
            "shapeSchemaHint": hint,
            "expectSchema": expect_schema,
            "spatialChannels": int(model.spatial_channels),
            "semanticDim": int(model.action_semantic_dim),
            "cases": len(results),
            "readouts": results,
        }
        if out_path:
            with open(out_path, "w", encoding="utf-8") as handle:
                json.dump(payload, handle)
        else:
            print(json.dumps(payload))
        return

    if len(argv) < 2:
        print("Usage: python verify_parity.py <model_json> <input_json> [output_json]")
        print("       python verify_parity.py --batch <model_json> <cases.jsonl> [output_json] [--expect-schema S]")
        sys.exit(1)

    model_path = argv[0]
    input_path = argv[1]
    out_path = argv[2] if len(argv) > 2 else None

    model = load_spatial_model_from_json(model_path)

    with open(input_path, "r", encoding="utf-8") as f:
        inp = json.load(f)

    res = forward_case(model, inp)

    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(res, f)
    else:
        print(json.dumps(res))


if __name__ == "__main__":
    main()
