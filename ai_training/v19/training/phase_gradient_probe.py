"""V19/R1：阶段梯度诊断。

复核指出「最长 5 场自然局占入训决策 55%–66%、后期占 72%–81%」，并明确要求：
**不能只看行数就断言熵主导或优化预算被尾段吃掉**，必须把 loss 各分量对
policy 头与共享骨干的梯度按阶段测出来。

本脚本只做这件事，不上升为新平台：
- 固定一小组开局 / 中盘 / 后期样本（默认每阶段 256 条决策，按 gameId 排序确定性抽取）；
- 分别报告 policy loss、value loss、entropy 三项**对 policy 头**与**对共享骨干（stem+res）**
  的梯度范数；
- 报告原始优势与标准化优势的分布、以及「有效更新比例」（|标准化优势| > 0.1 的占比）。

用法：
    python v19/training/phase_gradient_probe.py --wave-dir <dir> --key w1 \
        --checkpoint <json> --out <path>/phase_gradient.json
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "v19" / "training") not in sys.path:
    sys.path.insert(0, str(ROOT / "v19" / "training"))

import torch  # noqa: E402

from ppo import (  # noqa: E402
    build_model, compute_gae, evaluate_batch, load_wave, masked_log_softmax,
)
from spatial_resnet_model import load_model_from_ts_json  # noqa: E402

PHASES = ["early(<=5)", "mid(6..15)", "late(>15)"]


def phase_of(turn: int) -> str:
    if turn <= 5:
        return PHASES[0]
    if turn <= 15:
        return PHASES[1]
    return PHASES[2]


def grad_norm_for(model, prefixes) -> float:
    total = 0.0
    for name, param in model.named_parameters():
        if param.grad is None:
            continue
        if any(name.startswith(p) for p in prefixes):
            total += float(param.grad.detach().norm()) ** 2
    return total ** 0.5


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wave-dir", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--per-phase", type=int, default=256)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    episodes = load_wave(Path(args.wave_dir), args.key)
    usable = [e for e in episodes if e.natural_terminal and e.decisions]
    if not usable:
        raise SystemExit("[phase-probe] 没有自然终局局可用。")

    # 先按阶段分组，再按 (gameId, decisionIndex) 排序后等距抽取，保证可复现。
    by_phase: dict[str, list] = defaultdict(list)
    for episode in usable:
        for decision in episode.decisions:
            by_phase[phase_of(decision.turn)].append(decision)

    channels = usable[0].decisions[0].spatial.shape[0]
    model = build_model(channels)
    load_model_from_ts_json(model, str(ROOT / args.checkpoint))
    model.eval()

    torch.manual_seed(args.seed)
    report: dict = {
        "schema": "v19_phase_gradient_probe_1",
        "waveDir": args.wave_dir, "key": args.key, "checkpoint": args.checkpoint,
        "channels": channels,
        "perPhaseRequested": args.per_phase,
        "note": "梯度只用于诊断，不更新参数。policy 头 = pol_*；共享骨干 = stem + res_blocks。",
        "phases": {},
    }

    for phase in PHASES:
        pool = sorted(by_phase.get(phase, []), key=lambda d: (d.game_id, d.decision_index))
        if not pool:
            report["phases"][phase] = {"decisions": 0, "note": "该阶段没有可用决策。"}
            continue
        step = max(1, len(pool) // args.per_phase)
        picked = pool[::step][: args.per_phase]

        # 优势：与该阶段同局内的 MC 回报 − 采样时 critic 值（与生产 PPO 同一口径）。
        episode_returns: dict[str, float] = {}
        for episode in usable:
            episode_returns[episode.game_id] = float(episode.terminal_return or 0.0)
        raw_adv = torch.tensor(
            [episode_returns[d.game_id] - d.value for d in picked], dtype=torch.float32)
        norm_adv = (raw_adv - raw_adv.mean()) / (raw_adv.std() + 1e-8)

        model.zero_grad(set_to_none=True)
        logits_list, values, _ = evaluate_batch(model, picked)
        log_probs = [masked_log_softmax(l) for l in logits_list]
        new_log_prob = torch.stack([lp[d.chosen_index] for lp, d in zip(log_probs, picked)])
        old_log_prob = torch.tensor([d.behavior_log_prob for d in picked], dtype=torch.float32)
        ratio = torch.exp(new_log_prob - old_log_prob)
        unclipped = ratio * norm_adv
        clipped = torch.clamp(ratio, 0.9, 1.1) * norm_adv
        policy_loss = -torch.min(unclipped, clipped).mean()
        entropy = torch.stack([-(lp.exp() * lp).sum() for lp in log_probs]).mean()
        returns = torch.tensor(
            [episode_returns[d.game_id] for d in picked], dtype=torch.float32)
        loss_values = {
            "policyLoss": float(policy_loss),
            "valueLoss": float(torch.nn.functional.mse_loss(values, returns)),
            "entropy": float(entropy),
        }

        # 三项**各自重新做一次前向再反传**：它们共享同一张计算图，
        # 连续 backward 会触发 "backward through the graph a second time"。
        # 样本只有几百条，重算前向的代价可以忽略，换来的是各分量梯度互不污染。
        def component_grads(kind: str) -> dict:
            model.zero_grad(set_to_none=True)
            lg, val, _ = evaluate_batch(model, picked)
            lp = [masked_log_softmax(l) for l in lg]
            nlp = torch.stack([l[d.chosen_index] for l, d in zip(lp, picked)])
            olp = torch.tensor([d.behavior_log_prob for d in picked], dtype=torch.float32)
            r = torch.exp(nlp - olp)
            loss = None
            if kind == "policyLoss":
                loss = -torch.min(r * norm_adv, torch.clamp(r, 0.9, 1.1) * norm_adv).mean()
            elif kind == "entropy":
                loss = torch.stack([-(l.exp() * l).sum() for l in lp]).mean()
            else:
                ret = torch.tensor([episode_returns[d.game_id] for d in picked], dtype=torch.float32)
                loss = torch.nn.functional.mse_loss(val, ret)
            loss.backward()
            out = {
                "gradPolicyHead": grad_norm_for(model, ["pol_"]),
                "gradSharedTrunk": grad_norm_for(model, ["stem", "res_blocks"]),
                "gradAll": grad_norm_for(model, [""]),
            }
            model.zero_grad(set_to_none=True)
            return out

        components = {
            "policyLoss": component_grads("policyLoss"),
            "valueLoss": component_grads("valueLoss"),
            "entropy": component_grads("entropy"),
        }

        report["phases"][phase] = {
            "decisionsInWave": len(pool),
            "decisionsSampled": len(picked),
            "shareOfWave": len(pool) / sum(len(v) for v in by_phase.values()),
            "rawAdvantage": {
                "mean": float(raw_adv.mean()), "meanAbs": float(raw_adv.abs().mean()),
                "std": float(raw_adv.std()),
            },
            "normalizedAdvantage": {
                "mean": float(norm_adv.mean()), "std": float(norm_adv.std()),
            },
            "effectiveUpdateFraction": float((norm_adv.abs() > 0.1).float().mean()),
            "lossValues": loss_values,
            "gradients": components,
        }
        print(f"[phase-probe] {phase}: n={len(picked)}/{len(pool)} "
              f"meanAbsRawAdv={float(raw_adv.abs().mean()):.4f} "
              f"effectiveFrac={float((norm_adv.abs() > 0.1).float().mean()):.3f} "
              f"polGrad(policy/trunk)={components['policyLoss']['gradPolicyHead']:.4f}/"
              f"{components['policyLoss']['gradSharedTrunk']:.4f} "
              f"valGrad(policy/trunk)={components['valueLoss']['gradPolicyHead']:.4f}/"
              f"{components['valueLoss']['gradSharedTrunk']:.4f}")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[phase-probe] -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
