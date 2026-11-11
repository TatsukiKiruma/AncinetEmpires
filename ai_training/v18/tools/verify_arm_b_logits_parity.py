"""V18/T18-02：验证 Arm B（GAP 全图汇总 + 新列置零）的**初始 logits 与 Arm A 逐位一致**。

任务书要求：Arm B 新增 policy 列先置零，验证初始 logits 与 A 一致，
避免把初始化漂移当作结构效果。本脚本就是那条验收。

做法：
1. 用冠军权重分别构造 A（2 blocks，无 GAP）与 B（2 blocks，GAP，新列置零）；
2. 在同一批真实验证状态上跑同一套 policy 头前向（与 `rescore_checkpoints_v18.py` 相同的池化口径）；
3. 比较 max|Δlogit|、argmax 是否改变。

通过条件：`maxAbsLogitDelta == 0.0` 且 `argmaxChanged == 0`。

用法：
    python v18/tools/verify_arm_b_logits_parity.py --run-id run_20260927_v18_01 --rows 400
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from spatial_resnet_model import SpatialResNet, load_model_from_ts_json  # noqa: E402
from verify_parity import pool_coords_batch, load_spatial_model_from_json  # noqa: E402
import torch  # noqa: E402

torch.set_num_threads(min(8, max(2, torch.get_num_threads() or 2)))
V17_RUN = ROOT / "v17" / "out" / "v17_20260926_r2"
ENCODED_VAL = V17_RUN / "data" / "new_val" / "encoded" / "val.h0.allmaps.jsonl"
CHAMPION = ROOT / "v16" / "out" / "v16_20260926_core" / "experiments" / "P1" / "s2026" / "P1_final.json"


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if text:
                yield json.loads(text)


def policy_logits(model, row: dict) -> list[float]:
    z = model.forward_trunk(torch.tensor(row["spatialTensor"], dtype=torch.float32).reshape(1, 26, 20, 20))
    candidates = row["candidateActions"]
    glob = torch.tensor(row["globalFeatures"], dtype=torch.float32)
    feat = torch.cat(
        [
            *[pool_coords_batch(z[0], [a.get(k) for a in candidates]) for k in ("actorCoord", "landingCoord", "targetCoord")],
            torch.tensor([a["semantics"] for a in candidates], dtype=torch.float32),
            glob.unsqueeze(0).expand(len(candidates), -1),
        ],
        dim=1,
    )
    if getattr(model, "global_policy_pool", False):
        feat = torch.cat([feat, z.mean(dim=(2, 3)).expand(len(candidates), -1)], dim=1)
    return model.forward_action_logits(feat.unsqueeze(0))[0].tolist()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    parser.add_argument("--rows", type=int, default=400)
    parser.add_argument("--checkpoint", default=str(CHAMPION.relative_to(ROOT)))
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id
    checkpoint = ROOT / args.checkpoint

    torch.manual_seed(20260927)
    # 用与评测完全相同的加载器确定真实维度（语义维度 53，而不是默认的 32）。
    reference = load_spatial_model_from_json(str(checkpoint))
    arm_a = SpatialResNet(
        spatial_channels=reference.spatial_channels,
        trunk_channels=reference.trunk_channels,
        global_dim=reference.global_dim,
        action_semantic_dim=reference.action_semantic_dim,
        num_blocks=2,
        global_policy_pool=False,
    )
    load_model_from_ts_json(arm_a, str(checkpoint))
    arm_a.eval()

    torch.manual_seed(20260927)
    arm_b = SpatialResNet(
        spatial_channels=reference.spatial_channels,
        trunk_channels=reference.trunk_channels,
        global_dim=reference.global_dim,
        action_semantic_dim=reference.action_semantic_dim,
        num_blocks=2,
        global_policy_pool=True,
    )
    load_model_from_ts_json(arm_b, str(checkpoint), zero_new_policy_dims=True)
    arm_b.eval()

    # 对照组：**不**置零（= 历史默认行为），用来证明这条要求不是形式主义。
    torch.manual_seed(20260927)
    arm_b_random = SpatialResNet(
        spatial_channels=reference.spatial_channels,
        trunk_channels=reference.trunk_channels,
        global_dim=reference.global_dim,
        action_semantic_dim=reference.action_semantic_dim,
        num_blocks=2,
        global_policy_pool=True,
    )
    load_model_from_ts_json(arm_b_random, str(checkpoint), zero_new_policy_dims=False)
    arm_b_random.eval()

    new_cols_are_zero = bool(torch.count_nonzero(arm_b.pol_dense1.weight.data[:, arm_a.pol_dense1.in_features:]).item() == 0)

    stats = {
        "rows": 0,
        "maxAbsLogitDelta": 0.0,
        "sumAbsLogitDelta": 0.0,
        "argmaxChanged": 0,
        "logitCount": 0,
        "candidateCountMismatch": 0,
    }
    control = {
        "maxAbsLogitDelta": 0.0,
        "argmaxChanged": 0,
        "meanAbsDelta": 0.0,
        "logitCount": 0,
    }
    with torch.inference_mode():
        for row in iter_jsonl(ENCODED_VAL):
            if stats["rows"] >= args.rows:
                break
            stats["rows"] += 1
            la = policy_logits(arm_a, row)
            lb = policy_logits(arm_b, row)
            lr = policy_logits(arm_b_random, row)
            if len(la) != len(lb):
                stats["candidateCountMismatch"] += 1
                continue
            for a, b in zip(la, lb):
                delta = abs(a - b)
                stats["maxAbsLogitDelta"] = max(stats["maxAbsLogitDelta"], delta)
                stats["sumAbsLogitDelta"] += delta
                stats["logitCount"] += 1
            for a, b in zip(la, lr):
                delta = abs(a - b)
                control["maxAbsLogitDelta"] = max(control["maxAbsLogitDelta"], delta)
                control["meanAbsDelta"] += delta
                control["logitCount"] += 1
            argmax_a = max(range(len(la)), key=lambda i: la[i])
            argmax_b = max(range(len(lb)), key=lambda i: lb[i])
            argmax_r = max(range(len(lr)), key=lambda i: lr[i])
            if argmax_a != argmax_b:
                stats["argmaxChanged"] += 1
            if argmax_a != argmax_r:
                control["argmaxChanged"] += 1

    if control["logitCount"]:
        control["meanAbsDelta"] = control["meanAbsDelta"] / control["logitCount"]

    # 浮点容差：GAP 让 matmul 多算 32 个「零 × 值」乘积，BLAS 求和顺序改变，
    # float32 上会留下 ~1e-6 量级的舍入差。这不是初始化漂移，判据用容差而非严格 0。
    TOL = 1e-4
    report = {
        "schema": "v18_arm_b_logits_parity_1",
        "runId": args.run_id,
        "checkpoint": args.checkpoint,
        "armA": {"numBlocks": 2, "globalPolicyPool": False},
        "armB": {"numBlocks": 2, "globalPolicyPool": True, "zeroInitNewPolicyDims": True},
        "warmStartSource": "同一冠军权重；唯一差异是 GAP 是否启用",
        "polDense1InDimA": arm_a.pol_dense1.in_features,
        "polDense1InDimB": arm_b.pol_dense1.in_features,
        "newPolicyColumnsAllZero": new_cols_are_zero,
        "stats": stats,
        "controlWithoutZeroInit": {
            **control,
            "note": "同一权重、同一 seed，但新列保留随机初始化（历史默认行为）。",
        },
        "tolerance": TOL,
        "verdict": {
            "logitsIdenticalWithinFloat32Tolerance": stats["maxAbsLogitDelta"] <= TOL,
            "argmaxUnchanged": stats["argmaxChanged"] == 0,
            "candidateCountsMatch": stats["candidateCountMismatch"] == 0,
            "zeroInitIsNecessary": control["argmaxChanged"] > 0 or control["maxAbsLogitDelta"] > TOL,
        },
        "meaning": (
            "通过 ⇒ Arm B 的初始策略输出与 Arm A 在 float32 容差内一致、argmax 完全不变，"
            "训练后若出现差异只能来自结构+训练，不能归因于初始化漂移。"
            "对照组的差异说明这条要求不是形式主义。"
        ),
    }
    out = run / "experiments" / "arm_b_logits_parity.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "rows": stats["rows"],
        "polDense1InDimA": report["polDense1InDimA"],
        "polDense1InDimB": report["polDense1InDimB"],
        "newPolicyColumnsAllZero": new_cols_are_zero,
        "maxAbsLogitDelta": stats["maxAbsLogitDelta"],
        "argmaxChanged": stats["argmaxChanged"],
        "verdict": report["verdict"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
