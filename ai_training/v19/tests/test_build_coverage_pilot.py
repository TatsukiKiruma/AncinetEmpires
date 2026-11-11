"""覆盖扩量数据构建器的小型契约测试。"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


TOOL = Path(__file__).resolve().parents[1] / "tools" / "build_coverage_pilot.py"
SPEC = importlib.util.spec_from_file_location("build_coverage_pilot", TOOL)
assert SPEC and SPEC.loader
builder = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = builder
SPEC.loader.exec_module(builder)


def _identity(value: int) -> str:
    return f"{value:064x}"


def _row(index: int, family: str, map_name: str, *, target: int = 0,
         identity: str | None = None, teacher_score: float = 1.0) -> dict:
    action_codes = ["end_turn", "surrender"]
    return {
        "encoderSchemaId": builder.ENCODER_SCHEMA,
        "inputIdentity": identity or _identity(index),
        "orderedActionCodes": action_codes,
        "candidateActions": [{"actionCode": code} for code in action_codes],
        "policyLossMask": True,
        "valueLossMask": False,
        "valueTarget": None,
        "targetActionIndex": target,
        "teacher": {"targetActionCode": action_codes[target], "rawScores": [teacher_score, 0]},
        "stateHash": _identity(10_000 + index),
        "sampleId": f"sample-{index}",
        "rootFamilyId": family,
        "stateJson": {"metadata": {"apkMapName": map_name}},
        "provenance": {
            "familyId": family,
            "phaseBucket": str(index % 3),
            "behaviorActionType": ("move" if index % 2 else "attack"),
            "sourcePolicy": ("h0" if index % 2 else "student"),
        },
    }


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(builder.canonical_json(row) + "\n" for row in rows), encoding="utf-8")


def _make_validation(tmp_path: Path, overlap_identity: str) -> tuple[Path, Path]:
    directory = tmp_path / "old" / "full"
    dataset = directory / "dataset.jsonl"
    split = directory / "split.json"
    current = _row(90_001, "unused", builder.MAPS[0], identity=overlap_identity)
    current.update({"rootFamilyId": "val-current-root", "split": "validation",
                    "validationSource": "current_regression"})
    current["provenance"]["familyId"] = "current:validation-real-family"
    historical = _row(90_002, "unused", builder.MAPS[1])
    historical.update({"rootFamilyId": "val-history-root", "split": "validation",
                       "validationSource": "historical_curriculum_holdout"})
    historical["provenance"]["familyId"] = "historical-real-family"
    _write_jsonl(dataset, [current, historical])
    builder.write_object(split, {
        "valRootFamilies": ["val-current-root", "val-history-root"],
        "validationSources": {"current_regression": "固定回归", "historical_curriculum_holdout": "历史课程"},
    })
    builder.write_object(directory / "report.json", {"artifacts": {
        "dataset.jsonl": builder.file_sha256(dataset), "split.json": builder.file_sha256(split),
    }})
    return dataset, split


def test_build_keeps_nested_same_families_and_isolates_conflicts(tmp_path: Path) -> None:
    root = tmp_path / "coverage"
    rows_by_map: list[list[dict]] = [[] for _ in range(5)]
    index = 1
    families: list[str] = []
    for family_index in range(75):
        map_index = family_index % 5
        family = f"current:family-{family_index:02d}"
        families.append(family)
        for _ in range(3):
            rows_by_map[map_index].append(_row(index, family, builder.MAPS[map_index]))
            index += 1

    # 同标签重复只保留一行，教师分数变化只做审计。
    duplicate_identity = rows_by_map[0][0]["inputIdentity"]
    rows_by_map[0].append(_row(index, families[0], builder.MAPS[0],
                               identity=duplicate_identity, teacher_score=9.0))
    index += 1
    # 同一输入的硬标签冲突时，两行全部隔离。
    conflict_identity = _identity(80_001)
    rows_by_map[0].append(_row(index, families[0], builder.MAPS[0], identity=conflict_identity, target=0))
    index += 1
    rows_by_map[0].append(_row(index, families[0], builder.MAPS[0], identity=conflict_identity, target=1))
    index += 1
    # 与固定验证相同的输入无条件从训练删除。
    validation_overlap = _identity(80_002)
    rows_by_map[1].append(_row(index, families[1], builder.MAPS[1], identity=validation_overlap))

    for map_index, rows in enumerate(rows_by_map):
        _write_jsonl(root / f"map{map_index}" / "rows.jsonl", rows)
    validation_dataset, validation_split = _make_validation(tmp_path, validation_overlap)
    out = tmp_path / "result"
    manifest = builder.build(root, validation_dataset, validation_split, out,
                             validate_manifests=False, expected_validation_counts=None)

    audit = manifest["audit"]
    assert audit["hardLabelConflictInputs"] == 1
    assert audit["hardLabelConflictRowsIsolated"] == 2
    assert audit["sameTargetDuplicateRowsRemoved"] == 1
    assert audit["sameTargetTeacherVariationInputs"] == 1
    assert audit["validationOverlapInputsRemoved"] == 1

    level_inputs: list[set[str]] = []
    expected_train_families = set(families)
    for level in ("one_third", "two_thirds", "full"):
        split = builder.read_object(out / level / "split.json")
        rows = [json.loads(line) for line in (out / level / "dataset.jsonl").read_text(encoding="utf-8").splitlines()]
        train = [row for row in rows if row.get("split") == "train"]
        identities = {row["inputIdentity"] for row in train}
        level_inputs.append(identities)
        assert set(split["trainRootFamilies"]) == expected_train_families
        assert {row["rootFamilyId"] for row in train} == expected_train_families
        assert conflict_identity not in identities
        assert validation_overlap not in identities
        assert all(row["sourceStateKey"] == row["stateHash"] for row in train)
    assert level_inputs[0] <= level_inputs[1] <= level_inputs[2]


def test_rejects_real_family_crossing_validation(tmp_path: Path) -> None:
    root = tmp_path / "coverage"
    for map_index in range(5):
        rows = []
        for local in range(15):
            family_index = map_index + local * 5
            rows.append(_row(1 + family_index, f"current:family-{family_index:02d}", builder.MAPS[map_index]))
        _write_jsonl(root / f"map{map_index}" / "rows.jsonl", rows)
    dataset, split = _make_validation(tmp_path, _identity(99_999))
    validation_rows = [json.loads(line) for line in dataset.read_text(encoding="utf-8").splitlines()]
    validation_rows[0]["provenance"]["familyId"] = "current:family-00"
    _write_jsonl(dataset, validation_rows)
    builder.write_object(split.parent / "report.json", {"artifacts": {
        "dataset.jsonl": builder.file_sha256(dataset), "split.json": builder.file_sha256(split),
    }})
    try:
        builder.build(root, dataset, split, tmp_path / "out", validate_manifests=False,
                      expected_validation_counts=None)
    except ValueError as error:
        assert "真实家族" in str(error)
    else:
        raise AssertionError("应拒绝训练/验证真实家族交叉")
