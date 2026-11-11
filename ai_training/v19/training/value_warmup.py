"""V19/T19-03 + T19-05：用自然胜负预热 critic。

为什么先做这一件（有本轮证据，不是泛泛而谈）：
- 首轮 PPO 的 value loss 一直在 0.84 附近，说明 critic 从未学过任何结果信息；
- 首版用 γ=1、λ=1 的蒙特卡洛优势，`advantage = R − V(s)`。V 不可用时，这个「优势」几乎等于
  原始回报本身，同一局里所有决策共享同一个 ±1，梯度基本是噪声；
- 任务书 T19-03 明确写着「价值预热用自然胜负」，并说明 critic 作为 PPO 的方差降低器
  **不需要**先通过搜索后继排序门。

因此本步骤只训练 value 头（`val_dense1` / `val_dense2`），**冻结 trunk 与 policy 头**：
这样策略函数逐位不变，PPO 的起点仍然是冠军策略，DEV20 基线不会被这一步悄悄改掉。

报告口径（任务书要求）：相对常数基线的改善、分桶校准、样本数，并按 map 与阶段分桶。

用法：
    python v19/training/value_warmup.py \
        --wave-dir v19/out/run_20260928_v19_01/data/wave1 --key wave1 \
        --init-checkpoint v16/out/.../P1_final.json \
        --out-dir v19/out/run_20260928_v19_01/experiments/value_warmup/wave1 --tag vw_wave1
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "v19" / "training") not in sys.path:
    sys.path.insert(0, str(ROOT / "v19" / "training"))

import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402

from ppo import load_wave, build_model  # noqa: E402
from spatial_resnet_model import export_model_to_ts_json  # noqa: E402


def phase_bucket(turn: int) -> str:
    if turn <= 5:
        return "early(<=5)"
    if turn <= 15:
        return "mid(6..15)"
    return "late(>15)"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wave-dir", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--init-checkpoint", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--tag", default="value_warmup")
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--encoder-schema-id", default=None)
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    episodes = load_wave(Path(args.wave_dir), args.key)
    usable = [e for e in episodes if e.natural_terminal and not e.record_capped and e.decisions]
    if not usable:
        raise SystemExit("[value-warmup] 没有可用的自然终局局，拒绝生成空的校准报告。")

    # 按 (地图, seed) 家族做**固定 holdout**：同一 seed 的两个座位、以及同局所有状态
    # 必须整体落在同一侧，不能拆进训练/验证。这是复核 A.4 的要求。
    families = sorted({(e.map_name, e.seed) for e in usable})
    holdout_families = {f for i, f in enumerate(families) if i % 5 == 4}
    if not holdout_families and len(families) > 1:
        holdout_families = {families[-1]}
    train_episodes = [e for e in usable if (e.map_name, e.seed) not in holdout_families]
    holdout_episodes = [e for e in usable if (e.map_name, e.seed) in holdout_families]
    if not train_episodes:
        train_episodes, holdout_episodes = usable, []

    channels = usable[0].decisions[0].spatial.shape[0]
    samples: List[Tuple[torch.Tensor, torch.Tensor, float, str, str]] = []
    for episode in train_episodes:
        # γ=1 且只有终局奖励 ⇒ 同一局内每条决策的蒙特卡洛回报都等于该局终局回报。
        target = float(episode.terminal_return or 0.0)
        for decision in episode.decisions:
            samples.append((decision.spatial, decision.globals, target,
                            episode.map_name, phase_bucket(decision.turn)))
    holdout_samples: List[Tuple[torch.Tensor, torch.Tensor, float, str, str]] = []
    for episode in holdout_episodes:
        target = float(episode.terminal_return or 0.0)
        for decision in episode.decisions:
            holdout_samples.append((decision.spatial, decision.globals, target,
                                    episode.map_name, phase_bucket(decision.turn)))
    if not samples:
        raise SystemExit("[value-warmup] 训练侧没有样本，拒绝继续。")

    counts: Dict[str, int] = defaultdict(int)
    for *_, target, map_name, phase in samples:
        counts[f"outcome={target}"] += 1
        counts[f"map={map_name}"] += 1
        counts[f"phase={phase}"] += 1

    # 按终局回报分层加权：胜局只占少数，不加权会让 critic 退化成「永远预测负」。
    outcome_counts: Dict[float, int] = defaultdict(int)
    for *_, target, _m, _p in samples:
        outcome_counts[target] += 1
    weights = {t: len(samples) / (len(outcome_counts) * c) for t, c in outcome_counts.items()}
    sample_weight = torch.tensor([weights[t] for *_, t, _m, _p in samples], dtype=torch.float32)

    spatial = torch.stack([s[0] for s in samples], dim=0)
    globals_batch = torch.stack([s[1] for s in samples], dim=0)
    targets = torch.tensor([s[2] for s in samples], dtype=torch.float32)

    model = build_model(channels)
    from spatial_resnet_model import load_model_from_ts_json
    load_model_from_ts_json(model, str(ROOT / args.init_checkpoint))

    # 只训练 value 头：策略与 trunk 必须逐位不变，否则「起点仍是冠军策略」这句话就不成立。
    for name, param in model.named_parameters():
        param.requires_grad = name.startswith("val_")
    trainable = [p for p in model.parameters() if p.requires_grad]
    if len(trainable) != 4:
        raise SystemExit(f"可训练参数应为 value 头的 4 个张量，实际 {len(trainable)} 个；拒绝继续。")
    policy_before = {k: v.detach().clone() for k, v in model.state_dict().items()
                     if k.startswith(("stem", "res_", "pol_"))}

    optimizer = torch.optim.AdamW(trainable, lr=args.lr)
    model.train()

    n = len(samples)
    baseline_const = float(targets.mean())
    mse_const = float(((targets - baseline_const) ** 2).mean())

    history = []
    for epoch in range(1, args.epochs + 1):
        perm = torch.randperm(n).tolist()
        total, seen = 0.0, 0
        for start in range(0, n, args.batch):
            idx = perm[start:start + args.batch]
            z = model.forward_trunk(spatial[idx])
            pred = model.forward_value(z, globals_batch[idx][:, : model.global_dim]).squeeze(-1)
            w = sample_weight[idx]
            loss = (w * (pred - targets[idx]) ** 2).sum() / w.sum()
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(trainable, 1.0)
            optimizer.step()
            total += float(loss) * len(idx)
            seen += len(idx)
        history.append({"epoch": epoch, "weightedMse": total / max(1, seen)})
        if epoch % 3 == 0 or epoch == args.epochs:
            print(f"[value-warmup] epoch {epoch} weightedMse={history[-1]['weightedMse']:.5f}")

    # 冻结保证：策略与 trunk 必须逐位未变。
    policy_after = {k: v.detach().clone() for k, v in model.state_dict().items()
                    if k.startswith(("stem", "res_", "pol_"))}
    max_policy_drift = max(float((policy_before[k] - policy_after[k]).abs().max()) for k in policy_before)

    model.eval()
    with torch.no_grad():
        preds = []
        for start in range(0, n, 256):
            z = model.forward_trunk(spatial[start:start + 256])
            preds.append(model.forward_value(z, globals_batch[start:start + 256][:, : model.global_dim]).squeeze(-1))
        predictions = torch.cat(preds)
    mse_model = float(((predictions - targets) ** 2).mean())

    # 独立 holdout（按地图×seed 家族整块留出）：这才是可以对外说的泛化读数。
    # 复核 A.3 指出旧报告的 85%–87% 只是**训练内** MSE 改善，不能描述成未见局面的校准改善。
    holdout_report: Dict[str, object] = {"families": len(holdout_families), "samples": len(holdout_samples)}
    if holdout_samples:
        h_spatial = torch.stack([s[0] for s in holdout_samples], dim=0)
        h_globals = torch.stack([s[1] for s in holdout_samples], dim=0)
        h_targets = torch.tensor([s[2] for s in holdout_samples], dtype=torch.float32)
        with torch.no_grad():
            h_preds = []
            for start in range(0, len(holdout_samples), 256):
                z = model.forward_trunk(h_spatial[start:start + 256])
                h_preds.append(model.forward_value(z, h_globals[start:start + 256][:, : model.global_dim]).squeeze(-1))
            h_predictions = torch.cat(h_preds)
        # 常数基线必须从**训练分布**拟合，不能反过来用验证集均值拟合（复核 A.3）。
        h_const = float(targets.mean())
        holdout_report.update({
            "mseModel": float(((h_predictions - h_targets) ** 2).mean()),
            "mseConstantFromTrain": float(((h_targets - h_const) ** 2).mean()),
            "constantFromTrain": h_const,
            "meanActual": float(h_targets.mean()),
            "meanPredicted": float(h_predictions.mean()),
        })
        hc = holdout_report["mseConstantFromTrain"]
        hm = holdout_report["mseModel"]
        holdout_report["improvementVsConstant"] = ((hc - hm) / hc) if hc > 0 else None

    # 分桶校准：按预测值分 5 桶，报告每桶的样本数、平均预测与平均实际。
    order = torch.argsort(predictions)
    buckets = []
    for b in range(5):
        lo = b * n // 5
        hi = (b + 1) * n // 5
        idx = order[lo:hi]
        if idx.numel() == 0:
            continue
        buckets.append({
            "bucket": b,
            "samples": int(idx.numel()),
            "meanPredicted": float(predictions[idx].mean()),
            "meanActual": float(targets[idx].mean()),
            "absGap": abs(float(predictions[idx].mean()) - float(targets[idx].mean())),
        })

    # 按 map / 阶段的分桶校准。
    def group_calibration(key_index: int) -> Dict[str, dict]:
        groups: Dict[str, List[int]] = defaultdict(list)
        for i, sample in enumerate(samples):
            groups[sample[key_index]].append(i)
        out = {}
        for name, idx_list in sorted(groups.items()):
            idx = torch.tensor(idx_list)
            out[name] = {
                "samples": len(idx_list),
                "meanPredicted": float(predictions[idx].mean()),
                "meanActual": float(targets[idx].mean()),
            }
        return out

    out_model = out_dir / f"{args.tag}.json"
    schema_id = args.encoder_schema_id
    if schema_id is None:
        schema_id = {26: "spatial26_global20_actionSemantics53_v15",
                     34: "spatial34_global20_actionSemantics53_v19"}.get(channels)
    export_model_to_ts_json(model, str(out_model), encoder_schema_id=schema_id)
    sha = hashlib.sha256(out_model.read_bytes()).hexdigest()

    report = {
        "schema": "v19_value_warmup_1",
        "waveDir": args.wave_dir, "key": args.key,
        "initCheckpoint": args.init_checkpoint,
        "channels": channels,
        "episodesUsed": len(usable),
        "samples": n,
        "hyperparameters": {"epochs": args.epochs, "lr": args.lr, "batch": args.batch,
                            "trainableParts": "value head only（trunk 与 policy 头冻结）"},
        "counts": dict(counts),
        "outcomeWeights": {str(k): v for k, v in weights.items()},
        "familySplit": {
            "trainFamilies": len(families) - len(holdout_families),
            "holdoutFamilies": len(holdout_families),
            "holdoutFamilyList": [f"{m}#{s}" for m, s in sorted(holdout_families)],
            "rule": "按 (地图, seed) 家族整块留出：同一 seed 的两个座位与同局所有状态同侧。",
        },
        "loss": {
            # 复核 A.3：训练内读数一律叫 trainMse，不得再用它宣称泛化改善。
            "trainMse": mse_model,
            "trainConstantBaselineMse": mse_const,
            "trainConstantBaselineValue": baseline_const,
            "trainImprovementVsConstant": (mse_const - mse_model) / mse_const if mse_const > 0 else None,
            # 兼容旧字段名，但语义已明确为训练内读数。
            "constantBaselineMse": mse_const,
            "constantBaselineValue": baseline_const,
            "warmedModelMse": mse_model,
            "improvementVsConstant": (mse_const - mse_model) / mse_const if mse_const > 0 else None,
        },
        "holdout": holdout_report,
        "calibrationByPredictionBucket": buckets,
        "calibrationByMap": group_calibration(3),
        "calibrationByPhase": group_calibration(4),
        "history": history,
        "frozenPolicyCheck": {
            "maxAbsDriftOnStemResPolicy": max_policy_drift,
            "policyUnchanged": max_policy_drift == 0.0,
            "note": "只训练 value 头，因此策略函数必须逐位不变；不为 0 就说明这一步改变了策略，"
                    "不能再说「PPO 的起点仍是冠军策略」。",
        },
        "output": {"path": str(out_model).replace("\\", "/"), "sha256": sha, "encoderSchemaId": schema_id},
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    (out_dir / f"{args.tag}.metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "samples": n,
        "trainMse": round(mse_model, 5),
        "trainConstantMse": round(mse_const, 5),
        "trainImprovementVsConstant": round(report["loss"]["trainImprovementVsConstant"] or 0.0, 4),
        "holdoutSamples": holdout_report.get("samples"),
        "holdoutMse": holdout_report.get("mseModel"),
        "holdoutConstantMse": holdout_report.get("mseConstantFromTrain"),
        "holdoutImprovementVsConstant": (
            round(holdout_report["improvementVsConstant"], 4)
            if holdout_report.get("improvementVsConstant") is not None else None),
        "policyUnchanged": report["frozenPolicyCheck"]["policyUnchanged"],
        "sha256": sha,
        "out": str(out_model).replace("\\", "/"),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
