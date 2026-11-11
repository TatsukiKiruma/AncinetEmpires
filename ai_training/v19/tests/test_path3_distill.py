from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

import pytest
import torch


ROOT = Path(__file__).resolve().parents[2]
TRAINING = ROOT / "v19" / "training"
for directory in (TRAINING, ROOT / "python"):
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))

SPEC = importlib.util.spec_from_file_location("path3_distill", TRAINING / "path3_distill.py")
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


def _sample(sample_id: str, split: str, family: str, *, path_value: float = 1.0):
    semantics = torch.zeros(2, 56)
    semantics[:, -3:] = path_value
    return module.Path3Sample(
        sample_id=sample_id,
        input_identity=hashlib.sha256(sample_id.encode()).hexdigest(),
        split=split,
        map_name="m0",
        phase="0-2",
        source="h0",
        family=family,
        spatial=torch.zeros(34, 20, 20),
        globals=torch.zeros(20),
        coords=((None, None, None), (None, None, None)),
        semantics=semantics,
        action_codes=("a", "b"),
        teacher_q=torch.tensor([0.8, 0.2]),
        teacher_ranks=(0, 1),
    )


def _frozen_config(data_sha: str) -> dict[str, object]:
    return {
        "schema": module.CONFIG_SCHEMA,
        "dataSha256": data_sha,
        "initSha256": "0" * 64,
        "targetRule": "frozen_reference_top_tie_keep_else_rank_mix",
        "teacherMix": 0.25,
        "rankTemperature": 2.0,
        "learningRate": 0.00005,
        "klCoefficient": 0.1,
        "klStop": 0.1,
        "batchSize": 64,
        "updates": 800,
        "checkpointSteps": [400, 800],
        "gradClip": 0.5,
        "seed": 42,
        "torchThreads": 2,
        "weightDecay": 0.0,
        "trainable": ["pol_dense1", "pol_dense2"],
    }


def test_teacher_rank_uses_strict_float64_comparison_and_preserves_ties() -> None:
    scores = [10.0, 10.0, 9.999999999]
    assert module.teacher_ranks(scores) == (0, 0, 2)
    q = module.teacher_distribution(scores)
    assert q[0].item() == q[1].item()
    assert q[2].item() < q[0].item()


def test_reference_top_in_teacher_top_set_keeps_p0_and_has_zero_initial_gradient() -> None:
    logits = torch.tensor([2.0, -0.5, 0.25], requires_grad=True)
    reference = logits.detach().clone()
    q = torch.tensor([0.6, 0.3, 0.1])
    targets, selected_ranks = module.frozen_reference_targets([reference], [q], [(0, 1, 2)], 0.25)
    p0 = torch.softmax(reference, dim=0)
    assert selected_ranks == [0]
    assert torch.equal(targets[0], p0)
    loss, parts = module.distillation_objective([logits], [reference], targets, 0.1)
    loss.backward()
    torch.testing.assert_close(logits.grad, torch.zeros_like(logits), rtol=0.0, atol=1e-7)
    assert float(parts["referenceKl"].detach()) == 0.0


def test_reference_teacher_disagreement_uses_frozen_quarter_mix() -> None:
    reference = torch.tensor([3.0, 1.0])
    q = torch.tensor([0.1, 0.9])
    targets, selected_ranks = module.frozen_reference_targets([reference], [q], [(1, 0)], 0.25)
    expected = 0.75 * torch.softmax(reference, dim=0) + 0.25 * q
    assert selected_ranks == [1]
    torch.testing.assert_close(targets[0], expected)
    assert not targets[0].requires_grad


def test_hierarchical_sampler_balances_map_phase_source_family_and_is_deterministic() -> None:
    samples = []
    for map_name in ("m0", "m1"):
        for phase in ("0-2", "8+"):
            for source in ("h0", "p1"):
                for family in ("f0", "f1"):
                    item = _sample(f"{map_name}-{phase}-{source}-{family}", "train", family)
                    object.__setattr__(item, "map_name", map_name)
                    object.__setattr__(item, "phase", phase)
                    object.__setattr__(item, "source", source)
                    object.__setattr__(item, "family", f"{map_name}-{family}")
                    samples.append(item)
    first = module.HierarchicalSampler(samples, seed=42)
    second = module.HierarchicalSampler(samples, seed=42)
    batch_a = first.sample(64)
    batch_b = second.sample(64)
    assert [item.sample_id for item in batch_a] == [item.sample_id for item in batch_b]
    assert max(Counter(item.map_name for item in batch_a).values()) == 32
    assert set(first.last_counts) == {"map", "mapPhase", "mapPhaseSource", "mapPhaseSourceFamily"}
    assert set(first.last_counts["mapPhaseSourceFamily"].values()) == {4}


def test_control_zeroes_only_path3_inputs_and_keeps_new_weight_columns_zero() -> None:
    torch.manual_seed(7)
    model = module.SpatialResNet(spatial_channels=34, global_dim=20, action_semantic_dim=56)
    with torch.no_grad():
        model.pol_dense1.weight[:, module.PREFIX_DIM:module.PREFIX_DIM + 3].zero_()
    trainable = module.freeze_policy_head_only(model)
    optimizer = torch.optim.AdamW(trainable, lr=1e-3, weight_decay=0.0)
    sample = _sample("control", "train", "f0", path_value=9.0)
    logits = module.policy_logits(model, [sample], "control")[0]
    loss = -torch.log_softmax(logits, dim=0)[0]
    optimizer.zero_grad(set_to_none=True)
    loss.backward()
    optimizer.step()
    assert torch.count_nonzero(
        model.pol_dense1.weight[:, module.PREFIX_DIM:module.PREFIX_DIM + 3]
    ).item() == 0


def test_teacher_targets_never_enter_policy_inputs() -> None:
    torch.manual_seed(11)
    model = module.SpatialResNet(spatial_channels=34, global_dim=20, action_semantic_dim=56)
    left = _sample("left", "train", "f0")
    right = _sample("right", "train", "f1")
    object.__setattr__(right, "teacher_q", torch.tensor([0.01, 0.99]))
    object.__setattr__(right, "teacher_ranks", (1, 0))
    with torch.no_grad():
        logits = module.policy_logits(model, [left, right], "path3")
    torch.testing.assert_close(logits[0], logits[1], rtol=0.0, atol=0.0)


def test_reference_cache_survives_mixed_hit_and_eviction(monkeypatch) -> None:
    samples = [_sample(f"s{index}", "train", f"f{index}") for index in range(3)]

    def fake_logits(_model, batch, _arm):
        return [torch.tensor([float(sample.sample_id[-1]), 0.0]) for sample in batch]

    monkeypatch.setattr(module, "policy_logits", fake_logits)
    cache = module.ReferenceLogitCache(object(), "path3", capacity=2)
    cache.get_many(samples[:2])
    result = cache.get_many(samples)
    assert [row.tolist() for row in result] == [[0.0, 0.0], [1.0, 0.0], [2.0, 0.0]]
    assert len(cache.values) == 2


def _row(sample_id: str, split: str, family: str) -> dict[str, object]:
    scores = [1.0000000001, 1.0]
    codes = ["wait:u0", "end_turn"]
    candidates = []
    for index, code in enumerate(codes):
        candidates.append({
            "actionCode": code,
            "actorCoord": None,
            "landingCoord": None,
            "targetCoord": None,
            "semantics": [0.0] * 53 + [float(index + 1), 0.5, -0.25],
            "teacherScore": scores[index],
        })
    return {
        "schema": module.ROW_SCHEMA,
        "sampleId": sample_id,
        "inputIdentity": hashlib.sha256((sample_id + "-input").encode()).hexdigest(),
        "split": split,
        "trueFamilyId": family,
        "mapName": "m0",
        "phaseBucket": "0-2",
        "sourcePolicy": "h0",
        "encoderSchemaId": module.NEW_SCHEMA_ID,
        "baseEncoderSchemaId": module.OLD_SCHEMA_ID,
        "spatialChannels": 34,
        "globalFeatureDim": 20,
        "actionSemanticDim": 56,
        "candidateOrderingId": "actionCode-codepoint-asc-v1",
        "spatialTensor": [0.0] * (34 * 20 * 20),
        "globalFeatures": [0.0] * 20,
        "candidateActions": candidates,
        "orderedActionCodes": codes,
        "teacher": {
            "targetActionCode": codes[0],
            "targetActionIndex": 0,
            "actionCodes": codes,
            "rawScores": scores,
        },
    }


def _write_dataset(tmp_path: Path, rows: list[dict[str, object]]) -> tuple[Path, Path, dict[str, object]]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    data_path = tmp_path / "path3.jsonl"
    data_path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
    data_sha = hashlib.sha256(data_path.read_bytes()).hexdigest()
    manifest = {
        "schema": module.MANIFEST_SCHEMA,
        "contracts": {
            "encoderSchemaId": module.NEW_SCHEMA_ID,
            "baseEncoderSchemaId": module.OLD_SCHEMA_ID,
            "spatialChannels": 34,
            "globalFeatureDim": 20,
            "actionSemanticDim": 56,
            "candidateOrderingId": "actionCode-codepoint-asc-v1",
        },
        "output": {"sha256": data_sha, "rows": len(rows)},
    }
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return data_path, manifest_path, _frozen_config(data_sha)


def test_loader_strictly_checks_sha_shapes_codes_and_family_split(tmp_path: Path, monkeypatch) -> None:
    data, manifest, config = _write_dataset(tmp_path, [
        _row("train-1", "train", "family-train"),
        _row("holdout-1", "holdout", "family-holdout"),
    ])
    monkeypatch.setattr(module, "FROZEN_MANIFEST_SHA256", hashlib.sha256(manifest.read_bytes()).hexdigest())
    samples, loaded_manifest = module.load_path3_replay(data, manifest, config)
    assert len(samples) == 2
    assert loaded_manifest["output"]["sha256"] == config["dataSha256"]
    assert samples[0].teacher_ranks == (0, 1)

    bad_rows = [_row("train-1", "train", "same"), _row("holdout-1", "holdout", "same")]
    bad_data, bad_manifest, bad_config = _write_dataset(tmp_path / "bad", bad_rows)
    monkeypatch.setattr(module, "FROZEN_MANIFEST_SHA256", hashlib.sha256(bad_manifest.read_bytes()).hexdigest())
    with pytest.raises(ValueError, match="有交集"):
        module.load_path3_replay(bad_data, bad_manifest, bad_config)


def test_frozen_repository_config_is_accepted() -> None:
    config = module._read_config(ROOT / "v19" / "out" / "continuous16_20261003" / "path3_config.json")
    assert config["teacherMix"] == 0.25
    assert config["klStop"] == 0.1
