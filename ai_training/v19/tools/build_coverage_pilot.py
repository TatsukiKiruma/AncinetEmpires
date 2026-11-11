"""从五个现行规则覆盖分片构建固定验证、状态覆盖递增的三档数据集。

扫描阶段只保存原始 JSONL 的字节偏移与少量抽样元数据。写出阶段再按偏移读取
完整行，从而不会把数千个张量和状态对象长期保存在内存中。
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


SCHEMA = "v19-coverage-pilot-bc34x53-v1"
ENCODER_SCHEMA = "spatial34_global20_actionSemantics53_v19"
LOSS_CONTRACT_ID = "hard-ce-only-no-teacher-scores-v1"
COMPARISON_AXIS = "same75families-state-coverage"
SEED = 26100434
SELECTION_SALT = "v19-coverage-pilot-phase-action-policy-sha-rotation-v1"
LEVELS = (("one_third", 2_000), ("two_thirds", 6_000), ("full", None))
MAPS = (
    "(2) Duel.aem", "(2) Icy Paths.aem", "(2) Liberty Port.aem",
    "(2) Mourningstar.aem", "(2) Crossed swords.aem",
)
DEFAULT_ROOT = Path("v19/out/coverage_20261004")
DEFAULT_VALIDATION = Path("v19/out/data_scale_20261003/current_scale_pilot_v2/full/dataset.jsonl")
DEFAULT_SPLIT = Path("v19/out/data_scale_20261003/current_scale_pilot_v2/full/split.json")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_object(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    require(isinstance(value, dict), f"JSON 顶层必须是对象：{path}")
    return value


def write_object(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _label_signature(row: dict[str, Any]) -> str:
    teacher = row.get("teacher") or {}
    return sha256_text(canonical_json({
        "targetActionIndex": row.get("targetActionIndex"),
        "targetActionCode": teacher.get("targetActionCode"),
        "orderedActionCodes": row.get("orderedActionCodes"),
        "policyLossMask": row.get("policyLossMask"),
        "valueLossMask": row.get("valueLossMask"),
        "valueTarget": row.get("valueTarget"),
    }))


def _teacher_signature(row: dict[str, Any]) -> str:
    return sha256_text(canonical_json(row.get("teacher")))


@dataclass(frozen=True)
class RowRef:
    path: Path
    offset: int
    length: int
    line: int
    input_identity: str
    label_signature: str
    teacher_signature: str
    family: str
    map_name: str
    phase: str
    action_type: str
    source_policy: str
    state_hash: str
    sample_id: str

    @property
    def stratum(self) -> tuple[str, str, str]:
        return self.phase, self.action_type, self.source_policy


def _validate_training_row(row: dict[str, Any], path: Path, line: int) -> RowRef:
    where = f"{path}:{line}"
    require(row.get("encoderSchemaId") == ENCODER_SCHEMA, f"{where} schema 不匹配")
    require(row.get("policyLossMask") is True, f"{where} 不是硬 CE 策略行")
    require(row.get("valueLossMask") is False and row.get("valueTarget") is None,
            f"{where} 必须关闭 value 监督")
    identity = row.get("inputIdentity")
    family = row.get("rootFamilyId")
    provenance = row.get("provenance") or {}
    state = row.get("stateJson") or {}
    map_name = (state.get("metadata") or {}).get("apkMapName")
    require(isinstance(identity, str) and len(identity) == 64, f"{where} inputIdentity 无效")
    require(isinstance(family, str) and family.startswith("current:"), f"{where} rootFamilyId 无效")
    require(map_name in MAPS, f"{where} 不属于冻结五图")
    phase = provenance.get("phaseBucket")
    action_type = provenance.get("behaviorActionType")
    policy = provenance.get("sourcePolicy")
    require(all(isinstance(value, str) and value for value in (phase, action_type, policy)),
            f"{where} 缺少 phase/action/sourcePolicy")
    teacher = row.get("teacher") or {}
    target_index = row.get("targetActionIndex")
    ordered = row.get("orderedActionCodes")
    target_code = teacher.get("targetActionCode")
    require(isinstance(target_index, int) and isinstance(ordered, list)
            and 0 <= target_index < len(ordered), f"{where} targetActionIndex 无效")
    require(ordered[target_index] == target_code, f"{where} target index/code 不一致")
    return RowRef(Path(), 0, 0, line, identity, _label_signature(row), _teacher_signature(row),
                  family, map_name, phase, action_type, policy,
                  str(row.get("stateHash") or provenance.get("sourceStateHash") or ""),
                  str(row.get("sampleId") or f"{path.name}:{line}"))


def _source_path(manifest: dict[str, Any], shard_dir: Path, name: str) -> Path:
    candidate = Path(name)
    if candidate.is_absolute():
        return candidate
    manifest_root = manifest.get("root")
    if isinstance(manifest_root, str):
        rooted = Path(manifest_root) / candidate
        if rooted.is_file():
            return rooted
    rooted = shard_dir / candidate
    return rooted


def _verify_frozen_code_identity(manifest: dict[str, Any]) -> None:
    """复算会直接影响规则、H0、编码和教师标签的当前文件身份。"""
    digest = manifest.get("sourceDigestV16") or {}
    for group_name in ("engine", "h0"):
        group = digest.get(group_name) or {}
        files = group.get("files")
        require(isinstance(files, list) and files, f"sourceDigestV16 缺少 {group_name} 文件清单")
        for entry in files:
            source = Path(entry.get("path", ""))
            require(source.is_file(), f"冻结 {group_name} 文件不存在：{source}")
            require(file_sha256(source) == entry.get("sha256"), f"冻结 {group_name} 文件 SHA 已变化：{source}")
            require(source.stat().st_size == entry.get("bytes"), f"冻结 {group_name} 文件长度已变化：{source}")
    repo_root = Path(digest.get("repoRoot") or Path.cwd())
    require(file_sha256(repo_root / "v19/data/encode_recovered_state.ts") == manifest.get("encoderSha256"),
            "当前 encoder SHA 与分片 manifest 不一致")
    require(file_sha256(repo_root / "v18/tools/labeler_l1_v18.ts") == manifest.get("teacherSha256"),
            "当前 teacher SHA 与分片 manifest 不一致")


def validate_shards(root: Path) -> tuple[list[Path], list[dict[str, Any]]]:
    manifests: list[dict[str, Any]] = []
    rows_paths: list[Path] = []
    for index in range(5):
        shard = root / f"map{index}"
        manifest_path = shard / "manifest.json"
        rows_path = shard / "rows.jsonl"
        errors_path = shard / "errors.jsonl"
        require(manifest_path.is_file(), f"分片尚未完成，缺少 {manifest_path}")
        require(rows_path.is_file() and errors_path.is_file(), f"分片文件不完整：{shard}")
        manifest = read_object(manifest_path)
        require(manifest.get("mapIndex") == index, f"{manifest_path} mapIndex 不匹配")
        require(manifest.get("errorCount") == 0 and not manifest.get("errorsPresent"),
                f"{manifest_path} 存在编码错误")
        require(errors_path.stat().st_size == 0, f"{errors_path} 非空")
        require(file_sha256(rows_path) == manifest.get("rowsSha256"), f"{rows_path} SHA 不匹配")
        require(file_sha256(errors_path) == manifest.get("errorsSha256"), f"{errors_path} SHA 不匹配")
        source_files = manifest.get("sourceFiles")
        require(isinstance(source_files, dict) and source_files, f"{manifest_path} 缺少 sourceFiles")
        for name, expected in source_files.items():
            source = _source_path(manifest, shard, name)
            require(source.is_file(), f"manifest 来源文件不存在：{source}")
            require(file_sha256(source) == expected, f"manifest 来源 SHA 已变化：{source}")
        manifests.append(manifest)
        rows_paths.append(rows_path)
    for field in ("sourceDigestV16", "encoderSha256", "teacherSha256"):
        values = {canonical_json(manifest.get(field)) for manifest in manifests}
        require(len(values) == 1 and canonical_json(None) not in values, f"五分片 {field} 不一致")
    _verify_frozen_code_identity(manifests[0])
    return rows_paths, manifests


def scan_rows(paths: Iterable[Path]) -> list[RowRef]:
    refs: list[RowRef] = []
    for path in paths:
        with path.open("rb") as handle:
            line = 0
            while True:
                offset = handle.tell()
                raw = handle.readline()
                if not raw:
                    break
                line += 1
                if not raw.strip():
                    continue
                try:
                    row = json.loads(raw)
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise ValueError(f"{path}:{line} 不是合法 UTF-8 JSON") from error
                base = _validate_training_row(row, path, line)
                refs.append(RowRef(path, offset, len(raw), line, base.input_identity,
                                   base.label_signature, base.teacher_signature, base.family,
                                   base.map_name, base.phase, base.action_type, base.source_policy,
                                   base.state_hash, base.sample_id))
    return refs


def read_ref(ref: RowRef) -> dict[str, Any]:
    with ref.path.open("rb") as handle:
        handle.seek(ref.offset)
        raw = handle.read(ref.length)
    return json.loads(raw)


def load_fixed_validation(dataset: Path, split_path: Path,
                          expected_counts: tuple[int, int] | None = (568, 317)) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, str]]:
    split = read_object(split_path)
    report_path = split_path.parent / "report.json"
    require(report_path.is_file(), f"固定验证缺少 report.json：{report_path}")
    report = read_object(report_path)
    artifacts = report.get("artifacts") or {}
    require(file_sha256(dataset) == artifacts.get("dataset.jsonl"), "旧验证 dataset SHA 与 report 不一致")
    require(file_sha256(split_path) == artifacts.get("split.json"), "旧验证 split SHA 与 report 不一致")
    val_roots = split.get("valRootFamilies")
    require(isinstance(val_roots, list) and val_roots, "旧 split 缺少 valRootFamilies")
    val_root_set = set(val_roots)
    rows: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()
    identities: set[str] = set()
    schemas: set[str] = set()
    with dataset.open("r", encoding="utf-8") as handle:
        for line_number, text in enumerate(handle, 1):
            if not text.strip():
                continue
            row = json.loads(text)
            if row.get("rootFamilyId") not in val_root_set:
                continue
            require(row.get("split") == "validation", f"旧验证第 {line_number} 行 split 不一致")
            identity = row.get("inputIdentity")
            require(identity not in identities, f"旧验证 inputIdentity 重复：{identity}")
            identities.add(identity)
            schemas.add(row.get("encoderSchemaId"))
            source = row.get("validationSource")
            if source == "current_regression":
                counts["current"] += 1
            elif source in ("historical_curriculum_holdout", "historical_holdout"):
                counts["historical"] += 1
            else:
                raise ValueError(f"旧验证来源未知：{source!r}")
            rows.append(row)
    require(schemas == {ENCODER_SCHEMA}, f"旧验证 schema 不一致：{schemas}")
    require({row.get("rootFamilyId") for row in rows} == val_root_set, "旧验证家族不完整")
    if expected_counts is not None:
        require((counts["current"], counts["historical"]) == expected_counts,
                f"固定验证必须为 current={expected_counts[0]}、historical={expected_counts[1]}，实际 {dict(counts)}")
    return rows, split, {
        "dataset.jsonl": file_sha256(dataset), "split.json": file_sha256(split_path),
        "report.json": file_sha256(report_path),
    }


def clean_training(refs: list[RowRef], validation: list[dict[str, Any]]) -> tuple[list[RowRef], dict[str, Any]]:
    validation_inputs = {row["inputIdentity"] for row in validation}
    validation_families = {(row.get("provenance") or {}).get("familyId") for row in validation}
    train_families = {ref.family for ref in refs}
    family_overlap = sorted(train_families & validation_families)
    require(not family_overlap, f"训练真实家族与验证 provenance.familyId 交叉：{family_overlap[:5]}")

    by_input: dict[str, list[RowRef]] = defaultdict(list)
    for ref in refs:
        by_input[ref.input_identity].append(ref)
    conflicting = {identity for identity, group in by_input.items()
                   if len({ref.label_signature for ref in group}) > 1}
    conflict_rate = len(conflicting) / max(1, len(by_input))
    require(conflict_rate <= 0.01,
            f"冲突硬标签输入占比 {conflict_rate:.2%} 超过 1%：{len(conflicting)}/{len(by_input)}")

    kept: list[RowRef] = []
    duplicate_rows = 0
    teacher_variations = 0
    validation_overlap_rows = 0
    for identity, group in sorted(by_input.items()):
        if identity in conflicting:
            continue
        if identity in validation_inputs:
            validation_overlap_rows += len(group)
            continue
        ordered = sorted(group, key=lambda ref: (str(ref.path), ref.line))
        kept.append(ordered[0])
        duplicate_rows += len(ordered) - 1
        if len({ref.teacher_signature for ref in ordered}) > 1:
            teacher_variations += 1
    audit = {
        "sourceRows": len(refs), "sourceUniqueInputs": len(by_input),
        "hardLabelConflictInputs": len(conflicting),
        "hardLabelConflictRowsIsolated": sum(len(by_input[key]) for key in conflicting),
        "hardLabelConflictInputRate": conflict_rate,
        "hardLabelConflicts": [
            {"inputIdentity": identity,
             "rows": [{"path": str(ref.path), "line": ref.line,
                       "labelSignature": ref.label_signature, "sampleId": ref.sample_id}
                      for ref in by_input[identity]]}
            for identity in sorted(conflicting)
        ],
        "sameTargetDuplicateRowsRemoved": duplicate_rows,
        "sameTargetTeacherVariationInputs": teacher_variations,
        "validationOverlapInputsRemoved": len(set(by_input) & validation_inputs),
        "validationOverlapRowsRemoved": validation_overlap_rows,
        "validationOverlapInputIdentities": sorted(set(by_input) & validation_inputs),
        "cleanUniqueInputs": len(kept),
    }
    return kept, audit


def _sha_key(*parts: str) -> str:
    return sha256_text(":".join((SELECTION_SALT, *parts)))


def order_within_family(refs: list[RowRef]) -> list[RowRef]:
    bins: dict[tuple[str, str, str], deque[RowRef]] = {}
    for stratum, items in _group(refs, lambda ref: ref.stratum).items():
        ordered = sorted(items, key=lambda ref: _sha_key(ref.family, *stratum, ref.input_identity,
                                                         ref.state_hash, ref.sample_id))
        bins[stratum] = deque(ordered)
    strata = sorted(bins, key=lambda item: _sha_key(refs[0].family, *item))
    result: list[RowRef] = []
    while bins:
        for stratum in list(strata):
            queue = bins.get(stratum)
            if queue:
                result.append(queue.popleft())
                if not queue:
                    del bins[stratum]
        strata = [item for item in strata if item in bins]
    return result


def _group(items: Iterable[RowRef], key: Any) -> dict[Any, list[RowRef]]:
    result: dict[Any, list[RowRef]] = defaultdict(list)
    for item in items:
        result[key(item)].append(item)
    return dict(result)


def global_coverage_order(refs: list[RowRef]) -> list[RowRef]:
    by_family = _group(refs, lambda ref: ref.family)
    require(len(by_family) == 75, f"训练必须恰有 75 个真实家族，实际 {len(by_family)}")
    family_queues = {family: deque(order_within_family(items)) for family, items in by_family.items()}
    families_by_map: dict[str, list[str]] = {name: [] for name in MAPS}
    for family, items in by_family.items():
        maps = {item.map_name for item in items}
        require(len(maps) == 1, f"家族跨地图：{family}")
        families_by_map[next(iter(maps))].append(family)
    for map_name in MAPS:
        families_by_map[map_name].sort(key=lambda family: _sha_key(map_name, family))
    family_order: list[str] = []
    cursor = 0
    while any(cursor < len(families_by_map[name]) for name in MAPS):
        for map_name in MAPS:
            if cursor < len(families_by_map[map_name]):
                family_order.append(families_by_map[map_name][cursor])
        cursor += 1
    result: list[RowRef] = []
    while family_queues:
        for family in family_order:
            queue = family_queues.get(family)
            if queue:
                result.append(queue.popleft())
                if not queue:
                    del family_queues[family]
    return result


def _distribution(refs: list[RowRef]) -> dict[str, Any]:
    by_map: dict[str, dict[str, Counter[str]]] = {
        name: {"phase": Counter(), "behaviorActionType": Counter(), "sourcePolicy": Counter()}
        for name in MAPS
    }
    for ref in refs:
        by_map[ref.map_name]["phase"][ref.phase] += 1
        by_map[ref.map_name]["behaviorActionType"][ref.action_type] += 1
        by_map[ref.map_name]["sourcePolicy"][ref.source_policy] += 1
    return {name: {axis: dict(sorted(values.items())) for axis, values in axes.items()}
            for name, axes in by_map.items()}


def _write_dataset(path: Path, train: list[RowRef], validation: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for ref in train:
            row = read_ref(ref)
            row["rootFamilyId"] = ref.family
            row["sourceStateKey"] = ref.state_hash or ref.input_identity
            row["split"] = "train"
            handle.write(canonical_json(row) + "\n")
        for row in validation:
            handle.write(canonical_json(row) + "\n")


def build(root: Path, validation_dataset: Path, validation_split: Path, out_dir: Path,
          *, validate_manifests: bool = True,
          expected_validation_counts: tuple[int, int] | None = (568, 317)) -> dict[str, Any]:
    if out_dir.exists():
        raise FileExistsError(f"拒绝覆盖已有输出目录：{out_dir}")
    root, validation_dataset, validation_split = (path.resolve() for path in
                                                   (root, validation_dataset, validation_split))
    if validate_manifests:
        rows_paths, manifests = validate_shards(root)
    else:
        rows_paths = [root / f"map{index}" / "rows.jsonl" for index in range(5)]
        require(all(path.is_file() for path in rows_paths), "测试分片 rows.jsonl 不完整")
        manifests = []
    validation, old_split, validation_artifacts = load_fixed_validation(
        validation_dataset, validation_split, expected_validation_counts)
    refs = scan_rows(rows_paths)
    if manifests:
        require(len(refs) == sum(int(manifest.get("successfulRows", -1)) for manifest in manifests),
                "分片 successfulRows 与实际 JSONL 行数不一致")
    clean, audit = clean_training(refs, validation)
    ordered = global_coverage_order(clean)
    require(len(ordered) >= 75, "去重后不足以覆盖全部 75 家族")

    out_dir.mkdir(parents=True)
    level_reports: dict[str, Any] = {}
    val_roots = old_split["valRootFamilies"]
    train_roots = sorted({ref.family for ref in ordered})
    previous_inputs: set[str] = set()
    for name, target in LEVELS:
        count = len(ordered) if target is None else min(target, len(ordered))
        selected = ordered[:count]
        selected_inputs = {ref.input_identity for ref in selected}
        require(previous_inputs <= selected_inputs, f"{name} 未保持嵌套")
        previous_inputs = selected_inputs
        require({ref.family for ref in selected} == set(train_roots), f"{name} 未覆盖全部训练家族")
        level_dir = out_dir / name
        level_dir.mkdir()
        dataset_path = level_dir / "dataset.jsonl"
        _write_dataset(dataset_path, selected, validation)
        split = {
            "schema": SCHEMA, "level": name, "seed": SEED,
            "seedIdentity": SELECTION_SALT, "comparisonAxis": COMPARISON_AXIS,
            "trainRootFamilies": train_roots, "valRootFamilies": val_roots,
            "testRootFamilies": [], "validationSources": old_split.get("validationSources", {}),
        }
        split_path = level_dir / "split.json"
        write_object(split_path, split)
        report = {
            "schema": SCHEMA, "level": name, "comparisonAxis": COMPARISON_AXIS,
            "requestedTrainRows": target if target is not None else "all",
            "train": {"rows": len(selected), "uniqueInputs": len(selected_inputs),
                      "familyGroups": len(train_roots),
                      "maps": dict(sorted(Counter(ref.map_name for ref in selected).items()))},
            "validation": {"rows": len(validation), "uniqueInputs": len({row['inputIdentity'] for row in validation}),
                           "familyGroups": len(val_roots)},
            "crossSplitDuplicateInputs": 0,
            "coverageByMap": _distribution(selected),
            "audit": audit,
        }
        report["artifacts"] = {"dataset.jsonl": file_sha256(dataset_path),
                               "split.json": file_sha256(split_path)}
        report_path = level_dir / "report.json"
        write_object(report_path, report)
        level_reports[name] = {"directory": name, "report": report,
                               "reportSha256": file_sha256(report_path)}

    manifest = {
        "schema": SCHEMA, "comparisonAxis": COMPARISON_AXIS, "seed": SEED,
        "selectionContract": SELECTION_SALT,
        "lossContractId": LOSS_CONTRACT_ID,
        "teacherScoreUsage": "forbidden; hard CE targets only",
        "sourceFiles": {str(path): file_sha256(path) for path in rows_paths},
        "sourceManifests": [file_sha256(root / f"map{index}" / "manifest.json")
                            for index in range(5)] if manifests else [],
        "sourceIdentity": ({field: manifests[0][field] for field in
                            ("sourceDigestV16", "encoderSha256", "teacherSha256")}
                           if manifests else {}),
        "validationArtifacts": validation_artifacts,
        "trainRootFamilies": train_roots, "valRootFamilies": val_roots,
        "audit": audit, "availableTrainRows": len(ordered), "levels": level_reports,
    }
    write_object(out_dir / "manifest.json", manifest)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--validation-dataset", type=Path, default=DEFAULT_VALIDATION)
    parser.add_argument("--validation-split", type=Path, default=DEFAULT_SPLIT)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    manifest = build(args.root, args.validation_dataset, args.validation_split, args.out_dir)
    print(json.dumps({"outDir": str(args.out_dir), "availableTrainRows": manifest["availableTrainRows"],
                      "levels": {name: value["report"]["train"]["rows"]
                                 for name, value in manifest["levels"].items()}}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
