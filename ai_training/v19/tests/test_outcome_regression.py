from __future__ import annotations

import importlib.util
import sys
from collections import Counter
from pathlib import Path
from types import SimpleNamespace

import torch

ROOT = Path(__file__).resolve().parents[2]
TRAINING = ROOT / "v19" / "training"
if str(TRAINING) not in sys.path:
    sys.path.insert(0, str(TRAINING))
if str(ROOT / "python") not in sys.path:
    sys.path.insert(0, str(ROOT / "python"))

SPEC = importlib.util.spec_from_file_location("outcome_regression", TRAINING / "outcome_regression.py")
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


def test_uniform_and_advantage_weights_are_finite_and_batch_normalized() -> None:
    returns = torch.tensor([1.0, -1.0, 0.0])
    values = torch.tensor([-1.0, 1.0, 0.0])
    uniform = module.compute_raw_weights(returns, values, "uniform")
    assert torch.equal(uniform, torch.ones(3))
    advantage = module.compute_raw_weights(returns, values, "advantage")
    assert torch.isfinite(advantage).all()
    assert float(advantage.max()) == module.MAX_WEIGHT
    normalized = module.normalize_batch_weights(advantage)
    assert torch.isfinite(normalized).all()
    assert torch.allclose(normalized.mean(), torch.tensor(1.0))


def test_positive_advantage_weight_pushes_chosen_logit_up() -> None:
    logits = torch.tensor([0.0, 0.0], requires_grad=True)
    reference = torch.tensor([0.0, 0.0])
    weights = module.normalize_batch_weights(torch.tensor([5.0]))
    loss, parts = module.outcome_regression_objective([logits], [reference], [0], weights)
    loss.backward()
    assert torch.isfinite(loss)
    assert float(parts["mean_kl"].detach()) == 0.0
    assert logits.grad is not None
    assert float(logits.grad[0]) < 0
    assert float(logits.grad[1]) > 0


def test_only_policy_head_is_trainable_and_critic_output_stays_exact() -> None:
    torch.manual_seed(3)
    model = module.build_model(34)
    spatial = torch.randn(2, 34, 20, 20)
    globals_batch = torch.randn(2, 20)
    with torch.no_grad():
        before = model.forward_value(model.forward_trunk(spatial), globals_batch).clone()
    trainable = module.freeze_policy_head_only(model)
    trainable_names = {name for name, value in model.named_parameters() if value.requires_grad}
    assert trainable_names == {
        "pol_dense1.weight", "pol_dense1.bias", "pol_dense2.weight", "pol_dense2.bias"
    }
    optimizer = torch.optim.AdamW(trainable, lr=1e-3)
    features = torch.randn(4, model.pol_dense1.in_features)
    optimizer.zero_grad()
    model.forward_action_logits(features).sum().backward()
    optimizer.step()
    with torch.no_grad():
        after = model.forward_value(model.forward_trunk(spatial), globals_batch)
    assert torch.equal(before, after)


def test_balanced_sampler_equalizes_each_available_hierarchy_cell() -> None:
    samples = []
    for phase in ["opening", "midgame"]:
        for family in ["m0-f0", "m0-f1"]:
            samples.append(SimpleNamespace(
                decision=SimpleNamespace(map_name="m0"), phase=phase, family_id=family,
            ))
    for family in ["m1-f0", "m1-f1", "m1-f2"]:
        samples.append(SimpleNamespace(
            decision=SimpleNamespace(map_name="m1"), phase="late", family_id=family,
        ))
    sampler = module.BalancedBatchSampler(samples, seed=42)
    batch = sampler.sample(12)
    maps = Counter(sample.decision.map_name for sample in batch)
    assert max(maps.values()) - min(maps.values()) <= 1
    for map_name in maps:
        phase_counts = Counter(sample.phase for sample in batch if sample.decision.map_name == map_name)
        assert max(phase_counts.values()) - min(phase_counts.values()) <= 1
        for phase in phase_counts:
            family_counts = Counter(
                sample.family_id for sample in batch
                if sample.decision.map_name == map_name and sample.phase == phase
            )
            assert max(family_counts.values()) - min(family_counts.values()) <= 1
    assert sampler.last_counts["map"] == dict(sorted(maps.items()))
    assert sampler.last_counts["mapPhase"]["m0::opening"] == 3
    assert sampler.last_counts["mapPhase"]["m0::midgame"] == 3
    assert sampler.last_counts["mapPhase"]["m1::late"] == 6


def test_fixed_checkpoint_schedule_counts_only_completed_optimizer_steps() -> None:
    assert module.fixed_checkpoint_steps(2) == (2,)
    assert module.fixed_checkpoint_steps(400) == (400,)
    assert module.fixed_checkpoint_steps(800) == (400, 800)
    assert 399 not in module.fixed_checkpoint_steps(800)


def test_persisted_state_records_actual_completed_optimizer_steps(tmp_path: Path) -> None:
    model = module.build_model(34)
    trainable = module.freeze_policy_head_only(model)
    optimizer = torch.optim.AdamW(trainable, lr=module.LEARNING_RATE, weight_decay=0.0)
    sample = SimpleNamespace(
        decision=SimpleNamespace(map_name="m0"), phase="opening", family_id="family-0",
    )
    sampler = module.BalancedBatchSampler([sample], seed=42)
    target = tmp_path / "state.pt"
    module._checkpoint_state(
        target, model, optimizer, 7, {"id": "fixture"}, sampler,
        [{"update": 7.0}], False,
    )
    state = torch.load(target, map_location="cpu", weights_only=False)
    assert state["updatesPerformed"] == 7
    assert state["metricsRows"][-1]["update"] == 7.0
    assert state["stoppedByKl"] is False


def test_reference_cache_keeps_requested_old_rows_when_lru_evicts(monkeypatch) -> None:
    samples = [SimpleNamespace(decision=SimpleNamespace(marker=index)) for index in range(3)]

    def fake_evaluate(_model, decisions):
        logits = [torch.tensor([float(decision.marker), 0.0]) for decision in decisions]
        return logits, torch.zeros(len(decisions)), torch.empty(0)

    monkeypatch.setattr(module, "evaluate_batch", fake_evaluate)
    cache = module.ReferenceLogitCache(SimpleNamespace(eval=lambda: None), capacity=2)
    cache.get_many(samples[:2])
    mixed = cache.get_many(samples)
    assert [row.tolist() for row in mixed] == [[0.0, 0.0], [1.0, 0.0], [2.0, 0.0]]
    assert len(cache.values) == 2
