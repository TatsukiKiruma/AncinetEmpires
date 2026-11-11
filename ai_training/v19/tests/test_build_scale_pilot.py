"""build_scale_pilot 的隔离与去重小单测。"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).parents[1] / "tools" / "build_scale_pilot.py"
SPEC = importlib.util.spec_from_file_location("build_scale_pilot", MODULE_PATH)
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


def item(episode: str, identity: str, line: int, target: int = 0, score: float = 1.0):
    row = {
        "inputIdentity": identity,
        "targetActionIndex": target,
        "policyLossMask": True,
        "valueLossMask": False,
        "valueTarget": None,
        "orderedActionCodes": [f"a{target}"],
        "teacher": {"targetActionCode": f"a{target}", "rawScores": [score]},
    }
    return module.Item(row, "rows.jsonl", line, "historical", episode, f"{episode}:step:{line}")


def test_dsu_通过共享输入传递合并跨局家族():
    rows = [item("e1", "a" * 64, 1), item("e2", "a" * 64, 2),
            item("e2", "b" * 64, 3), item("e3", "b" * 64, 4)]
    groups = module.assign_root_families(rows)
    assert len(groups) == 1
    assert len({row.root_family_id for row in rows}) == 1


def test_current优先真实根家族而非逐行episodeId():
    first = {"rootFamilyId": "root-7", "episodeId": "game-row-1", "provenance": {}}
    second = {"rootFamilyId": "root-7", "episodeId": "game-row-2", "provenance": {}}
    assert module._current_episode_id(first, "current.jsonl", 1) == module._current_episode_id(
        second, "current.jsonl", 2)


def test_去重并拒绝冲突标签():
    audit = []
    rows = [item("e1", "a" * 64, 1, score=1.0), item("e1", "a" * 64, 2, score=1.01)]
    assert len(module._dedupe(rows, "train", audit)) == 1
    variation = next(entry for entry in audit
                     if entry["action"] == "teacher_metadata_or_score_variation_same_ce_target")
    assert variation["retainedTeacher"]["rawScoresSha256"] != variation["duplicateTeacher"]["rawScoresSha256"]
    assert any(entry["action"] == "deduplicated" for entry in audit)
    with pytest.raises(ValueError, match="冲突监督标签"):
        module._dedupe([item("e1", "b" * 64, 1, 0), item("e2", "b" * 64, 2, 1)], "val", [])


def test_训练验证交叉输入被移除且产物为零重叠(tmp_path: Path):
    root = tmp_path / "root"
    shard = root / "recovered_s0"
    shard.mkdir(parents=True)
    current_path = tmp_path / "current.jsonl"
    out = tmp_path / "out"

    def full_row(identity: str, episode_index: int, step: int, map_name: str = "(2) Duel.aem"):
        return {
            "encoderSchemaId": "spatial34_global20_actionSemantics53_v19",
            "inputIdentity": identity,
            "targetActionIndex": 0,
            "policyLossMask": True,
            "valueLossMask": False,
            "valueTarget": None,
            "teacher": {"targetActionCode": "a", "rawScores": [1.0]},
            "spatialTensor": [0.0],
            "globalFeatures": [0.0],
            "candidateActions": [],
            "stateJson": {"metadata": {"apkMapName": map_name}, "players": [{"id": 0}, {"id": 1}]},
            "provenance": {"sourceFileSha256": f"{episode_index:064x}",
                           "sourceLineIndex": episode_index, "stepIndex": step,
                           "familyId": f"family-{episode_index}"},
        }

    historical = []
    for episode_index in range(1, 7):
        historical.append(full_row(f"{episode_index:064x}", episode_index, 0))
    shard.joinpath("rows.jsonl").write_text(
        "".join(json.dumps(row) + "\n" for row in historical), encoding="utf-8")
    for shard_index in range(1, 5):
        other = root / f"recovered_s{shard_index}"
        other.mkdir()
        other.joinpath("rows.jsonl").write_text("", encoding="utf-8")
    # current 与某个可能进入训练的历史输入重复；构建器必须把该输入从训练侧排除。
    current_path.write_text(json.dumps(full_row(f"{6:064x}", 99, 0)) + "\n", encoding="utf-8")

    module.build(root, current_path, out)
    for level in ("one_third", "two_thirds", "full"):
        rows = [json.loads(line) for line in (out / level / "dataset.jsonl").read_text(encoding="utf-8").splitlines()]
        train = {row["inputIdentity"] for row in rows if row["split"] == "train"}
        val = {row["inputIdentity"] for row in rows if row["split"] == "validation"}
        assert train.isdisjoint(val)
        report = json.loads((out / level / "report.json").read_text(encoding="utf-8"))
        assert report["crossSplitDuplicateInputs"] == 0

    current_train_path = tmp_path / "current_train.jsonl"
    current_train = []
    for index in range(10):
        train_row = full_row(f"{100 + index:064x}", 100 + index, 0, module.MAPS[index % 5])
        train_row["rootFamilyId"] = f"train-root-{index}"
        train_row["episodeId"] = f"row-game-{index}"
        train_row["provenance"]["dataRole"] = "regression-only-placeholder"
        current_train.append(train_row)
    current_train_path.write_text(
        "".join(json.dumps(row) + "\n" for row in current_train), encoding="utf-8")
    current_out = tmp_path / "current_out"
    manifest = module.build(root, current_path, current_out, current_train_path)
    assert manifest["mode"] == "current-family-scale"
    assert manifest["comparisonAxis"] == "current-rule unique family count"
    full_rows = [json.loads(line) for line in
                 (current_out / "full" / "dataset.jsonl").read_text(encoding="utf-8").splitlines()]
    derived_train = [row for row in full_rows if row["split"] == "train"]
    assert len({row["rootFamilyId"] for row in derived_train}) == 10
    assert all(row["provenance"]["dataRole"] == "existing_current_rules_training_relabelled_h0"
               for row in derived_train)
    assert all(row["provenance"]["sourceDataRole"] == "regression-only-placeholder"
               for row in derived_train)
    current_report = json.loads((current_out / "full" / "report.json").read_text(encoding="utf-8"))
    assert current_report["historicalTrainingRows"] == 0
