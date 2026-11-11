from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "v19" / "tools"))
from verify_continuous16_panel import MAPS, verify_panel  # noqa: E402


SHA = "a" * 64


def _rows(role: str = "dev", wins: int = 16) -> list[dict]:
    base = 2609260100 if role == "dev" else 2609260300
    rows = []
    ordinal = 0
    for map_index, map_name in enumerate(MAPS):
        for episode in range(2):
            seed = base + 10 * map_index + episode
            for seat in (0, 1):
                candidate_alliance = seat
                is_win = ordinal < wins
                winner = candidate_alliance if is_win else 1 - candidate_alliance
                kind = "NATURAL_WIN" if is_win else "NATURAL_LOSS"
                rows.append({
                    "gameId": f"run|{role}|m{map_index}|s{episode}|seat{seat}",
                    "mapName": map_name,
                    "seed": seed,
                    "rootSeed": seed,
                    "episodeIndex": episode,
                    "panelId": role,
                    "runMode": role,
                    "blockId": f"{role}:m{map_index}:s{episode}",
                    "arm": "CANDIDATE",
                    "candidateSeat": seat,
                    "subjectSeat": seat,
                    "viewedSeat": seat,
                    "seatAlliances": {"0": 0, "1": 1},
                    "candidateAllianceId": candidate_alliance,
                    "winnerAllianceId": winner,
                    "outcomeKind": kind,
                    "steps": 100,
                    "wallMs": 1000,
                    "maxSteps": 12000,
                    "maxPlies": None,
                    "wallTimeoutMs": 900000,
                    "mirrorPolicyVersion": "heuristic-seatstream-v1",
                    "rngContract": "heuristic-seatstream-v1",
                    "engineSourceDigest": "1" * 64,
                    "policySourceDigest": "2" * 64,
                    "heuristicSourceSha256": "3" * 64,
                    "runnerSourceSha256": "4" * 64,
                    "checkpointSha256": SHA,
                    "encoderSchema": "spatial34_global20_actionSemantics53_v19",
                    "requestedPolicyId": "candidate",
                    "actualPolicyId": "candidate",
                    "modelTag": "candidate-model",
                    "fallbackUsed": False,
                    "fallbackReason": None,
                    "error": None,
                    "cacheIdentity": {"fields": {
                        "checkpointSha256": SHA,
                        "encoderSchemaId": "spatial34_global20_actionSemantics53_v19",
                        "modelId": "candidate-model:aaaaaaaaaaaa",
                        "rngContract": "heuristic-seatstream-v1",
                        "engineSourceDigest": "1" * 64,
                        "policySourceDigest": "2" * 64,
                        "maxStepsAtomicActions": 12000,
                        "maxPliesAtomicActions": None,
                        "wallTimeoutMs": 900000,
                    }},
                })
                ordinal += 1
    return rows


def _write_split(tmp_path: Path, rows: list[dict]) -> list[Path]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    paths = []
    for index, group in enumerate((rows[:7], rows[7:14], rows[14:])):
        path = tmp_path / f"part{index}.games.jsonl"
        path.write_text("".join(json.dumps(row) + "\n" for row in group), encoding="utf-8")
        paths.append(path)
    return paths


def test_dev_panel_recomputes_16_natural_wins_and_marks_selection_only(tmp_path: Path) -> None:
    evidence = verify_panel(_write_split(tmp_path, _rows()), "dev", SHA)
    assert evidence["result"] == {
        "validPanel": True,
        "naturalWins": 16,
        "targetNaturalWins": 16,
        "continuous16Met": True,
    }
    assert evidence["counts"]["bySeat"] == {"0": 10, "1": 10}
    assert set(evidence["counts"]["byMap"].values()) == {4}
    assert "仅用于 checkpoint 筛选" in evidence["roleInterpretation"]
    assert "不构成独立交付" in evidence["roleInterpretation"]


def test_claimed_win_with_enemy_winner_is_rejected(tmp_path: Path) -> None:
    rows = _rows()
    rows[0]["winnerAllianceId"] = 1 - rows[0]["candidateAllianceId"]
    evidence = verify_panel(_write_split(tmp_path, rows), "dev", SHA)
    assert not evidence["result"]["validPanel"]
    assert evidence["result"]["naturalWins"] == 15
    assert any("NATURAL_WIN" in error and "winnerAllianceId" in error for error in evidence["validationErrors"])


@pytest.mark.parametrize(
    ("mutation", "expected_error"),
    [
        (lambda rows: rows[0].update(gameId=rows[1]["gameId"]), "gameId 必须"),
        (lambda rows: rows[0].update(checkpointSha256="b" * 64), "冻结模型不一致"),
        (lambda rows: rows[0].update(fallbackUsed=True), "fallback"),
        (lambda rows: rows[0].update(mirrorPolicyVersion="wrong-h0"), "H0 identity"),
        (lambda rows: rows[0].update(maxSteps=11999), "顶层 caps"),
    ],
)
def test_identity_and_protocol_corruption_is_rejected(tmp_path: Path, mutation, expected_error: str) -> None:
    rows = _rows()
    mutation(rows)
    evidence = verify_panel(_write_split(tmp_path, rows), "dev", SHA)
    assert not evidence["result"]["validPanel"]
    assert any(expected_error in error for error in evidence["validationErrors"])


def test_confirm_requires_explicit_confirm_seed_namespace_and_role(tmp_path: Path) -> None:
    confirm = verify_panel(_write_split(tmp_path, _rows("confirm")), "confirm", SHA)
    assert confirm["result"]["continuous16Met"]
    assert confirm["panelRole"] == "confirm"
    assert "CONFIRM20 独立面板" in confirm["roleInterpretation"]

    wrong_role_dir = tmp_path / "wrong"
    wrong_role_dir.mkdir()
    wrong_role = verify_panel(_write_split(wrong_role_dir, copy.deepcopy(_rows("dev"))), "confirm", SHA)
    assert not wrong_role["result"]["validPanel"]
    assert any("panelId/runMode" in error for error in wrong_role["validationErrors"])


@pytest.mark.parametrize("bad_id", ["heuristic", "B100_teacher", ""])
def test_non_model_policy_identity_is_rejected(tmp_path: Path, bad_id: str) -> None:
    rows = _rows()
    rows[0]["requestedPolicyId"] = bad_id
    rows[0]["actualPolicyId"] = bad_id
    evidence = verify_panel(_write_split(tmp_path, rows), "dev", SHA)
    assert not evidence["result"]["validPanel"]
    assert any("不是允许的纯模型身份" in error for error in evidence["validationErrors"])


@pytest.mark.parametrize("field", ["engineSourceDigest", "policySourceDigest", "heuristicSourceSha256", "runnerSourceSha256"])
def test_source_digest_must_exist_and_be_unique(tmp_path: Path, field: str) -> None:
    rows = _rows()
    rows[0].pop(field)
    evidence = verify_panel(_write_split(tmp_path, rows), "dev", SHA)
    assert not evidence["result"]["validPanel"]
    assert any("来源摘要" in error for error in evidence["validationErrors"])


def test_source_digest_must_be_unique_across_all_twenty_rows(tmp_path: Path) -> None:
    rows = _rows()
    rows[0]["runnerSourceSha256"] = "8" * 64
    evidence = verify_panel(_write_split(tmp_path, rows), "dev", SHA)
    assert not evidence["result"]["validPanel"]
    assert any("20 行的 runner 来源摘要" in error for error in evidence["validationErrors"])


def test_experiment_identity_can_freeze_corresponding_row_digests(tmp_path: Path) -> None:
    rows = _rows()
    for row in rows:
        row["sourceDigests"] = {"engine": "1" * 64, "policy": "2" * 64, "h0": "3" * 64, "runner": "4" * 64}
    identity = {
        "arenaRowSourceDigests": {"engine": "1" * 64, "policy": "2" * 64, "h0": "3" * 64, "runner": "4" * 64},
        "sourceGroups": {
            "engine": {"currentDigest": "1" * 64},
            "policy": {"currentDigest": "2" * 64},
            "h0": {"currentDigest": "3" * 64},
        },
        "supplementalFreeze": {"runner": {"digest": "4" * 64}},
    }
    identity_path = tmp_path / "experiment_identity.json"
    identity_path.write_text(json.dumps(identity), encoding="utf-8")
    evidence = verify_panel(_write_split(tmp_path, rows), "dev", SHA, identity_path)
    assert evidence["result"]["validPanel"]
    assert evidence["identity"]["experimentIdentity"]["path"] == str(identity_path.resolve())

    identity["arenaRowSourceDigests"]["policy"] = "9" * 64
    identity_path.write_text(json.dumps(identity), encoding="utf-8")
    rejected = verify_panel(_write_split(tmp_path / "bad", rows), "dev", SHA, identity_path)
    assert not rejected["result"]["validPanel"]
    assert any("policy 来源摘要与 experiment_identity 不一致" in error for error in rejected["validationErrors"])


def test_legacy_digest_is_not_forced_to_new_identity_algorithm(tmp_path: Path) -> None:
    rows = _rows()
    for row in rows:
        row["h0SourceDigest"] = row.pop("heuristicSourceSha256")
        row["runnerSourceDigest"] = row.pop("runnerSourceSha256")
    identity_path = tmp_path / "experiment_identity.json"
    identity_path.write_text(json.dumps({
        "sourceGroups": {
            "engine": {"currentDigest": "5" * 64},
            "policy": {"currentDigest": "6" * 64},
            "h0": {"currentDigest": "7" * 64},
        },
        "supplementalFreeze": {"runner": {"digest": "8" * 64}},
    }), encoding="utf-8")
    evidence = verify_panel(_write_split(tmp_path, rows), "dev", SHA, identity_path)
    assert evidence["result"]["validPanel"]


def _write_map_shards_with_progress(tmp_path: Path, rows: list[dict]) -> tuple[list[Path], list[Path]]:
    games_paths: list[Path] = []
    progress_paths: list[Path] = []
    for map_index in range(5):
        shard = rows[map_index * 4:(map_index + 1) * 4]
        games_path = tmp_path / f"candidate.m{map_index}.games.jsonl"
        games_path.write_text("".join(json.dumps(row) + "\n" for row in shard), encoding="utf-8")
        progress = {
            "outPath": str(games_path.resolve()),
            "appendedRows": 4,
            "checkpointSha256": SHA,
            "encoderSchemaId": "spatial34_global20_actionSemantics53_v19",
            "panelId": "dev",
            "runMode": "dev",
            "failed": 0,
            "policy": "model",
            "modelId": "candidate-model:aaaaaaaaaaaa",
            "caps": {"maxSteps": 12000, "maxPlies": None, "wallTimeoutMs": 900000},
            "blocks": sorted({row["blockId"] for row in shard}),
            "sourceDigests": {"engine": "1" * 64, "policy": "2" * 64, "h0": "3" * 64, "runner": "4" * 64},
        }
        progress_path = tmp_path / f"candidate.m{map_index}.progress.json"
        progress_path.write_text(json.dumps(progress), encoding="utf-8")
        games_paths.append(games_path)
        progress_paths.append(progress_path)
    return games_paths, progress_paths


def _old_runner_rows() -> list[dict]:
    rows = _rows()
    for row in rows:
        row.pop("heuristicSourceSha256")
        row.pop("runnerSourceSha256")
        row["encoderSchema"] = "spatial34_global20_actionSemantics53_v19"
    return rows


def test_verified_progress_supplies_h0_and_runner_source_identity(tmp_path: Path) -> None:
    games, progress = _write_map_shards_with_progress(tmp_path, _old_runner_rows())
    evidence = verify_panel(games, "dev", SHA, progress_paths=progress)
    assert evidence["result"]["validPanel"]
    assert evidence["identity"]["sourceProvenance"]["h0"] == "runner完成的progress sidecar"
    assert evidence["identity"]["sourceProvenance"]["runner"] == "runner完成的progress sidecar"


@pytest.mark.parametrize("corruption", ["outPath", "appendedRows", "engineDigest", "failed"])
def test_unbound_or_inconsistent_progress_cannot_fill_missing_row_sources(tmp_path: Path, corruption: str) -> None:
    games, progress_paths = _write_map_shards_with_progress(tmp_path, _old_runner_rows())
    target = progress_paths[0]
    progress = json.loads(target.read_text(encoding="utf-8"))
    if corruption == "outPath":
        progress["outPath"] = str((tmp_path / "other.games.jsonl").resolve())
    elif corruption == "appendedRows":
        progress["appendedRows"] = 3
    elif corruption == "engineDigest":
        progress["sourceDigests"]["engine"] = "9" * 64
    else:
        progress["failed"] = 1
    target.write_text(json.dumps(progress), encoding="utf-8")
    evidence = verify_panel(games, "dev", SHA, progress_paths=progress_paths)
    assert not evidence["result"]["validPanel"]
    assert any("progress" in error or "sidecar" in error or "games 行" in error for error in evidence["validationErrors"])


def test_progress_four_source_groups_must_be_unique_across_five_shards(tmp_path: Path) -> None:
    games, progress_paths = _write_map_shards_with_progress(tmp_path, _old_runner_rows())
    target = progress_paths[4]
    progress = json.loads(target.read_text(encoding="utf-8"))
    progress["sourceDigests"]["runner"] = "9" * 64
    target.write_text(json.dumps(progress), encoding="utf-8")
    evidence = verify_panel(games, "dev", SHA, progress_paths=progress_paths)
    assert not evidence["result"]["validPanel"]
    assert any("20 行的 runner 来源摘要" in error for error in evidence["validationErrors"])


def test_verified_progress_is_checked_against_explicit_arena_row_identity(tmp_path: Path) -> None:
    games, progress_paths = _write_map_shards_with_progress(tmp_path, _old_runner_rows())
    identity_path = tmp_path / "experiment_identity.json"
    identity_path.write_text(json.dumps({"arenaRowSourceDigests": {
        "engine": "1" * 64,
        "policy": "2" * 64,
        "h0": "3" * 64,
        "runner": "9" * 64,
    }}), encoding="utf-8")
    evidence = verify_panel(games, "dev", SHA, identity_path, progress_paths)
    assert not evidence["result"]["validPanel"]
    assert any("runner 来源摘要与 experiment_identity 不一致" in error for error in evidence["validationErrors"])

