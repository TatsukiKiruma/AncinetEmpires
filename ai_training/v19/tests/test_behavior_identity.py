"""PPO 生产入口的行为模型身份门禁。"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "v19" / "training") not in sys.path:
    sys.path.insert(0, str(ROOT / "v19" / "training"))

from behavior_identity import BehaviorIdentityError, validate_behavior_identity  # noqa: E402


SHA_A = "a" * 64
SHA_B = "b" * 64


def _write_wave(
    root: Path,
    transition_shas=(SHA_A,),
    game_shas=(SHA_A,),
    summary_sha=SHA_A,
    transition_game_ids=None,
    game_ids=None,
) -> None:
    transition_game_ids = transition_game_ids or [f"g{i}" for i in range(len(transition_shas))]
    game_ids = game_ids or sorted(set(transition_game_ids))
    with (root / "w.transitions.jsonl").open("w", encoding="utf-8") as stream:
        for game_id, sha in zip(transition_game_ids, transition_shas):
            row = {"gameId": game_id}
            if sha is not None:
                row["checkpointSha256"] = sha
            stream.write(json.dumps(row) + "\n")
    with (root / "w.games.jsonl").open("w", encoding="utf-8") as stream:
        for index, game_id in enumerate(game_ids):
            sha = game_shas[min(index, len(game_shas) - 1)]
            row = {"gameId": game_id}
            if sha is not None:
                row["behaviorCheckpointSha256"] = sha
            stream.write(json.dumps(row) + "\n")
    summary = {}
    if summary_sha is not None:
        summary["behaviorCheckpointSha256"] = summary_sha
    (root / "w.summary.json").write_text(json.dumps(summary), encoding="utf-8")


def _validate(root: Path, **kwargs):
    return validate_behavior_identity(root, "w", SHA_A, "continuous", **kwargs)


def test_single_sha_continuous_passes(tmp_path: Path) -> None:
    _write_wave(tmp_path)
    result = _validate(tmp_path)
    assert result.behavior_sha256 == SHA_A
    assert result.identity_verified is True
    assert result.chain_verified is True


def test_multiple_transition_shas_are_rejected_even_if_init_is_member(tmp_path: Path) -> None:
    _write_wave(
        tmp_path,
        transition_shas=(SHA_A, SHA_B),
        transition_game_ids=("g0", "g1"),
        game_ids=("g0", "g1"),
    )
    with pytest.raises(BehaviorIdentityError, match="transitions 必须只有一个行为 SHA"):
        _validate(tmp_path)


def test_missing_sha_is_not_silently_discarded(tmp_path: Path) -> None:
    _write_wave(tmp_path, transition_shas=(SHA_A, None), transition_game_ids=("g0", "g1"), game_ids=("g0", "g1"))
    with pytest.raises(BehaviorIdentityError, match="checkpointSha256"):
        _validate(tmp_path)


@pytest.mark.parametrize("field", ["games", "summary"])
def test_three_sources_must_agree(tmp_path: Path, field: str) -> None:
    _write_wave(
        tmp_path,
        game_shas=(SHA_B,) if field == "games" else (SHA_A,),
        summary_sha=SHA_B if field == "summary" else SHA_A,
    )
    with pytest.raises(BehaviorIdentityError, match="三方不一致"):
        _validate(tmp_path)


def test_transition_game_must_exist_in_games(tmp_path: Path) -> None:
    _write_wave(tmp_path, transition_game_ids=("missing",), game_ids=("other",))
    with pytest.raises(BehaviorIdentityError, match="不在 games 中"):
        _validate(tmp_path)


def test_continuous_requires_behavior_to_equal_init(tmp_path: Path) -> None:
    _write_wave(tmp_path, transition_shas=(SHA_B,), game_shas=(SHA_B,), summary_sha=SHA_B)
    with pytest.raises(BehaviorIdentityError, match="continuous 谱系"):
        _validate(tmp_path)


def test_explicit_branch_allows_different_init_but_is_not_chain_verified(tmp_path: Path) -> None:
    _write_wave(tmp_path, transition_shas=(SHA_B,), game_shas=(SHA_B,), summary_sha=SHA_B)
    result = validate_behavior_identity(tmp_path, "w", SHA_A, "value_warmup_branch")
    assert result.identity_verified is True
    assert result.chain_verified is False


def test_diagnostic_branch_preserves_factual_chain_identity_when_sha_matches(tmp_path: Path) -> None:
    _write_wave(tmp_path)
    result = validate_behavior_identity(tmp_path, "w", SHA_A, "diagnostic_branch")
    assert result.identity_verified is True
    assert result.chain_verified is True


def test_expected_behavior_sha_is_enforced(tmp_path: Path) -> None:
    _write_wave(tmp_path)
    with pytest.raises(BehaviorIdentityError, match="expected-behavior-sha 不一致"):
        _validate(tmp_path, expected_behavior_sha256=SHA_B)


@pytest.mark.parametrize("bad_sha", ["", "abc", "g" * 64, None])
def test_malformed_or_missing_sha_is_rejected(tmp_path: Path, bad_sha) -> None:
    _write_wave(tmp_path, summary_sha=bad_sha)
    with pytest.raises(BehaviorIdentityError, match="64 位 SHA-256"):
        _validate(tmp_path)
