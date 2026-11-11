"""有界离策略自然终局回放读取器的合成数据验收。"""

from __future__ import annotations

import json
import struct
import sys
import types
from pathlib import Path

import pytest

try:
    import torch
except ModuleNotFoundError:
    # 中文：轻量 CI 若未安装训练依赖，仍验证选择、offset 与清单逻辑；正式环境使用真实 torch/ppo。
    class _FakeTensor:
        def __init__(self, values, dtype=None):
            self.values = list(values)
            self.dtype = dtype
            self.shape = (len(self.values),)

        def view(self, *shape):
            self.shape = tuple(shape)
            return self

        def __getitem__(self, index):
            if not isinstance(index, tuple):
                return self.values[index]
            flat = 0
            stride = 1
            for size, coordinate in zip(reversed(self.shape), reversed(index)):
                flat += coordinate * stride
                stride *= size
            return self.values[flat]

    torch = types.ModuleType("torch")
    torch.float32 = "float32"
    torch.Tensor = _FakeTensor
    torch.tensor = lambda values, dtype=None: _FakeTensor(values, dtype)
    sys.modules["torch"] = torch

    class _Decision:
        def __init__(self, **values):
            self.__dict__.update(values)

    ppo_stub = types.ModuleType("ppo")
    ppo_stub.Decision = _Decision
    ppo_stub.POLICY_GLOBAL_DIM = 20
    ppo_stub.SPATIAL_H = 20
    ppo_stub.SPATIAL_W = 20
    sys.modules["ppo"] = ppo_stub


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "v19" / "training") not in sys.path:
    sys.path.insert(0, str(ROOT / "v19" / "training"))

from replay_subset import ReplaySource, load_replay_subset  # noqa: E402


SHA_A = "a" * 64
SHA_B = "b" * 64
SPATIAL_COUNT = 34 * 20 * 20
GLOBAL_COUNT = 20
SEMANTIC_COUNT = 53


def _write_wave(
    root: Path,
    key: str,
    sha: str,
    games: list[dict],
    decisions: list[dict],
) -> None:
    root.mkdir(parents=True, exist_ok=True)
    game_by_id = {game["gameId"]: game for game in games}
    with (root / f"{key}.games.jsonl").open("w", encoding="utf-8") as stream:
        for game in games:
            stream.write(json.dumps({**game, "behaviorCheckpointSha256": sha}) + "\n")

    tensor_offset = 0
    with (root / f"{key}.tensors.f32").open("wb") as tensor_stream, \
            (root / f"{key}.transitions.jsonl").open("w", encoding="utf-8") as transition_stream:
        for ordinal, spec in enumerate(decisions):
            game = game_by_id[spec["gameId"]]
            codes = ["move:u:1,1", "wait:u"]
            spatial = [float(ordinal)] + [0.0] * (SPATIAL_COUNT - 1)
            globals_vec = [float(ordinal + 100)] + [0.0] * (GLOBAL_COUNT - 1)
            semantics = [float(ordinal + 200)] + [0.0] * (len(codes) * SEMANTIC_COUNT - 1)
            payload = struct.pack(
                f"<{len(spatial) + len(globals_vec) + len(semantics)}f",
                *(spatial + globals_vec + semantics),
            )
            tensor_stream.write(payload)
            value_field = {"behaviorValue": spec["value"]} if spec.get("behavior_field") else {"value": spec["value"]}
            row = {
                "gameId": spec["gameId"],
                "mapName": game["mapName"],
                "seed": game["seed"],
                "subjectSeat": 0,
                "subjectDecisionIndex": spec["decision_index"],
                "turn": spec["turn"],
                "channels": 34,
                "semanticDim": 53,
                "globalDim": 20,
                "tensorOffset": tensor_offset,
                "globalOffset": tensor_offset + SPATIAL_COUNT * 4,
                "tensorBytes": len(payload),
                "orderedActionCodes": codes,
                "candidateCoords": [
                    [[0, 0], [1, 1], [-1, -1]],
                    [[2, 2], [-1, -1], [-1, -1]],
                ],
                "chosenIndex": 1,
                "chosenActionCode": codes[1],
                "behaviorLogProb": -0.25,
                "policyEntropy": 0.5,
                "reward": 0.0,
                "terminal": False,
                "truncated": False,
                "checkpointSha256": sha,
                **value_field,
            }
            transition_stream.write(json.dumps(row) + "\n")
            tensor_offset += len(payload)
    (root / f"{key}.summary.json").write_text(json.dumps({
        "behaviorCheckpointSha256": sha,
    }), encoding="utf-8")


def _natural(game_id: str, map_name: str, seed: int, terminal_return=1) -> dict:
    return {
        "gameId": game_id,
        "mapName": map_name,
        "seed": seed,
        "naturalTerminal": True,
        "truncated": False,
        "terminalReturn": terminal_return,
    }


def _decision(game_id: str, index: int, turn: int, *, behavior_field=False) -> dict:
    return {
        "gameId": game_id,
        "decision_index": index,
        "turn": turn,
        "value": index / 100.0,
        "behavior_field": behavior_field,
    }


def test_multiple_waves_are_identity_checked_but_may_use_different_behavior_sha(tmp_path: Path) -> None:
    wave_a = tmp_path / "wave-a"
    games_a = [
        _natural("open", "Alpha", 7, 1),
        {**_natural("cut", "Cut", 8, -1), "naturalTerminal": False, "truncated": True},
        _natural("missing", "Missing", 9, None),
        _natural("phases", "Beta", 10, 0),
    ]
    decisions_a = (
        [_decision("open", index, 3, behavior_field=True) for index in range(35)]
        + [_decision("cut", 0, 4), _decision("missing", 0, 4)]
        + [_decision("phases", 0, 6), _decision("phases", 1, 16)]
    )
    _write_wave(wave_a, "a", SHA_A, games_a, decisions_a)

    wave_b = tmp_path / "wave-b"
    _write_wave(
        wave_b, "b", SHA_B,
        [_natural("cross-wave", "Alpha", 7, -1)],
        [_decision("cross-wave", 0, 8)],
    )

    subset = load_replay_subset([
        ReplaySource(wave_a, "a"), ReplaySource(wave_b, "b"),
    ])
    assert {sample.behavior_sha256 for sample in subset.samples} == {SHA_A, SHA_B}
    assert subset.manifest["dataRole"] == "off_policy_natural_outcome_replay"
    assert subset.manifest["reservoirSeed"] == 42
    assert len(subset.manifest["dataIndexSha256"]) == 64
    assert subset.manifest["familySplit"] == {
        "trainFamilies": subset.manifest["familySplit"]["trainFamilies"],
        "holdoutFamilies": subset.manifest["familySplit"]["holdoutFamilies"],
        "overlapCount": 0,
        "verifiedDisjoint": True,
    }
    assert {source["lineageKind"] for source in subset.manifest["sources"]} == {"diagnostic_branch"}
    assert {source["behaviorCheckpointSha256"] for source in subset.manifest["sources"]} == {SHA_A, SHA_B}
    assert all(len(source["sourceMetadataSha256"]) == 64 for source in subset.manifest["sources"])
    assert all(len(source["selectedTensorSha256"]) == 64 for source in subset.manifest["sources"])
    assert subset.manifest["stats"]["games_excluded_truncated"] == 1
    assert subset.manifest["stats"]["games_excluded_missing_return"] == 1
    assert all(sample.decision.game_id not in {"cut", "missing"} for sample in subset.samples)

    opening = [sample for sample in subset.samples if sample.decision.game_id == "open"]
    assert len(opening) == 32
    assert all(sample.phase == "opening" for sample in opening)
    assert {sample.phase for sample in subset.samples if sample.decision.game_id == "phases"} == {"midgame", "late"}
    assert subset.manifest["mapPhaseOutcomeCounts"]["Beta"]["midgame"]["draw"] == 1
    assert subset.manifest["mapPhaseOutcomeCounts"]["Beta"]["late"]["draw"] == 1
    alpha = [sample for sample in subset.samples if sample.family_id == "map=Alpha|seed=7"]
    assert {sample.decision.game_id for sample in alpha} == {"open", "cross-wave"}
    assert len({sample.split for sample in alpha}) == 1
    assert all(sample.natural_return in (-1.0, 0.0, 1.0) for sample in subset.samples)

    first = opening[0]
    assert first.behavior_value == pytest.approx(first.decision.decision_index / 100.0)
    assert first.decision.value == pytest.approx(first.behavior_value)
    assert first.chosen_action_code == first.ordered_action_codes[first.decision.chosen_index]
    assert first.decision.spatial.dtype == torch.float32
    assert tuple(first.decision.spatial.shape) == (34, 20, 20)
    assert tuple(first.decision.globals.shape) == (20,)
    assert tuple(first.decision.candidate_semantics.shape) == (2, 53)
    assert len(first.decision.candidate_coords) == len(first.ordered_action_codes)


def test_reservoir_and_family_split_are_deterministic(tmp_path: Path) -> None:
    wave = tmp_path / "wave"
    games = [_natural("g", "Stable", 123, 1)]
    decisions = [_decision("g", index, 2) for index in range(50)]
    _write_wave(wave, "w", SHA_A, games, decisions)
    source = [ReplaySource(wave, "w")]
    first = load_replay_subset(source)
    second = load_replay_subset(source)
    signature = lambda subset: [
        (sample.decision.decision_index, sample.split, float(sample.decision.spatial[0, 0, 0]))
        for sample in subset.samples
    ]
    assert signature(first) == signature(second)
    assert len(first.samples) == 32
    assert first.manifest == second.manifest


def test_random_tensor_offset_is_checked_before_materialization(tmp_path: Path) -> None:
    wave = tmp_path / "wave"
    _write_wave(wave, "w", SHA_A, [_natural("g", "Map", 1)], [_decision("g", 0, 1)])
    transition_path = wave / "w.transitions.jsonl"
    row = json.loads(transition_path.read_text(encoding="utf-8"))
    row["tensorOffset"] = 10**9
    row["globalOffset"] = row["tensorOffset"] + SPATIAL_COUNT * 4
    transition_path.write_text(json.dumps(row) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="张量越界"):
        load_replay_subset([ReplaySource(wave, "w")])
