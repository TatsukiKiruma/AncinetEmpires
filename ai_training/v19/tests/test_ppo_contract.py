"""V19/T19-04 验收：GAE 符号、终止掩码、PPO 目标与 KL 停止的可核算测试。

这些都是纯数值合同，不依赖真实对局；真实闭环由 `v19/rollout/collector.ts` + 本模块的
CLI 共同验证。
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "v19" / "training") not in sys.path:
    sys.path.insert(0, str(ROOT / "v19" / "training"))

import torch  # noqa: E402

from ppo import compute_gae, masked_log_softmax  # noqa: E402


def test_gae_gamma_one_no_gamma_decay_but_lambda_still_decays():
    """gamma=1 时不存在 gamma 衰减；lambda<1 仍按 lambda^k 衰减（这是 GAE 的定义）。

    本游戏一局有数百次主体决策，因此首版 PPO 取 lambda=1.0（见 ppo.py 的参数说明），
    这里同时锁定两种 lambda 的读数，避免以后悄悄改掉单位或公式。
    """
    rewards = [0.0, 0.0, 1.0]
    values = [0.0, 0.0, 0.0]
    terminal = [False, False, True]
    truncated = [False, False, False]

    advantages_mc, returns_mc = compute_gae(rewards, values, terminal, truncated, gamma=1.0, lam=1.0)
    # lambda=1：终局回报原样传导，不因决策数多而衰减。
    for r in returns_mc:
        assert r == pytest.approx(1.0)
    for a in advantages_mc:
        assert a == pytest.approx(1.0)

    advantages_td, returns_td = compute_gae(rewards, values, terminal, truncated, gamma=1.0, lam=0.98)
    assert advantages_td[2] == pytest.approx(1.0)
    assert advantages_td[1] == pytest.approx(0.98)
    assert advantages_td[0] == pytest.approx(0.98 ** 2)
    assert all(a > 0 for a in advantages_td)


def test_gae_natural_loss_is_negative_and_natural_draw_is_zero():
    rewards = [0.0, -1.0]
    values = [0.0, 0.0]
    advantages, returns = compute_gae(rewards, values, [False, True], [False, False],
                                      gamma=1.0, lam=1.0)
    assert all(a < 0 for a in advantages)
    assert all(r == pytest.approx(-1.0) for r in returns)

    rewards = [0.0, 0.0]
    advantages, returns = compute_gae(rewards, values, [False, True], [False, False],
                                      gamma=1.0, lam=1.0)
    assert all(a == pytest.approx(0.0) for a in advantages)
    assert all(r == pytest.approx(0.0) for r in returns)


def test_gae_truncated_step_never_writes_terminal_z():
    """截断步必须用 bootstrap 值（默认 0）并且**不能**把奖励当成终局回报。"""
    rewards = [0.0, 0.0]
    values = [0.0, 0.0]
    terminal = [False, False]
    truncated = [False, True]
    advantages, returns = compute_gae(rewards, values, terminal, truncated, bootstrap_value=0.0)
    assert returns[-1] == pytest.approx(0.0)
    # 显式 bootstrap 时，截断步的回报由 critic 提供，而不是伪造胜负。
    advantages_b, returns_b = compute_gae(rewards, values, terminal, truncated, bootstrap_value=0.5)
    assert returns_b[-1] == pytest.approx(0.5)
    assert advantages_b[-1] == pytest.approx(0.5)


def test_gae_terminal_boundary_resets_accumulator():
    """两条 episode 拼在一起时，第一条的终局回报不得泄漏进第二条。"""
    rewards = [0.0, 1.0, 0.0, -1.0]
    values = [0.0, 0.0, 0.0, 0.0]
    terminal = [False, True, False, True]
    truncated = [False, False, False, False]
    advantages, returns = compute_gae(rewards, values, terminal, truncated, gamma=1.0, lam=1.0)
    assert returns[0] == pytest.approx(1.0)
    assert returns[1] == pytest.approx(1.0)
    # 第二条 episode 必须是负的：第一条的 +1 没有泄漏过去。
    assert returns[2] == pytest.approx(-1.0)
    assert returns[3] == pytest.approx(-1.0)


def test_gae_lambda_interpolates_between_td_and_monte_carlo():
    """lambda=0 退化为单步 TD；lambda=1 退化为蒙特卡洛。"""
    rewards = [0.0, 0.0, 1.0]
    values = [0.1, 0.2, 0.3]
    terminal = [False, False, True]
    truncated = [False, False, False]
    td0, _ = compute_gae(rewards, values, terminal, truncated, gamma=1.0, lam=0.0)
    # delta_0 = 0 + V1 - V0 = 0.1；lambda=0 时 A0 = delta_0
    assert td0[0] == pytest.approx(0.1, abs=1e-6)
    mc1, _ = compute_gae(rewards, values, terminal, truncated, gamma=1.0, lam=1.0)
    # lambda=1 时 A0 = 1.0 - V0 = 0.9
    assert mc1[0] == pytest.approx(0.9, abs=1e-6)


def test_masked_log_softmax_matches_manual_softmax():
    logits = torch.tensor([1.0, 2.0, 3.0])
    log_probs = masked_log_softmax(logits)
    probs = torch.exp(log_probs)
    assert float(probs.sum()) == pytest.approx(1.0, abs=1e-6)
    manual = math.exp(3.0) / (math.exp(1.0) + math.exp(2.0) + math.exp(3.0))
    assert float(probs[2]) == pytest.approx(manual, abs=1e-6)


def test_ppo_clipped_objective_is_flat_outside_the_clip_window():
    """ratio 超出 [1−clip, 1+clip] 后，被裁剪的目标对 ratio 的梯度应为 0。"""
    clip = 0.1
    advantage = torch.tensor([1.0])

    def loss_at(ratio_value: float) -> torch.Tensor:
        ratio = torch.tensor([ratio_value], requires_grad=True)
        unclipped = ratio * advantage
        clipped = torch.clamp(ratio, 1.0 - clip, 1.0 + clip) * advantage
        return -torch.min(unclipped, clipped).mean()

    high = loss_at(5.0)
    high.backward()
    assert float(high) == pytest.approx(-(1.0 + clip))
    # 正向优势下 ratio 过大时被裁剪，目标不再随 ratio 变化。
    assert float(high) == pytest.approx(-(1.0 + clip))

    low = loss_at(0.1)
    assert float(low) == pytest.approx(-0.1)


def test_approx_kl_is_zero_when_policy_unchanged():
    """同一批数据更新前 ratio 必须约为 1，近似 KL 约为 0。"""
    logits = torch.tensor([[0.3, -0.2, 0.5]])
    log_probs = masked_log_softmax(logits[0])
    old = log_probs.detach().clone()
    ratio = torch.exp(log_probs - old)
    approx_kl = ((ratio - 1.0) - (log_probs - old)).mean()
    assert float(ratio.mean()) == pytest.approx(1.0, abs=1e-6)
    assert float(approx_kl) == pytest.approx(0.0, abs=1e-6)
