"""构建 V19 34/53 行为克隆数据规模小档。

本工具只整理已经重编码的监督行，不重新计算教师分数，也不启动训练。
历史样本按整局组成家族，并用共享 inputIdentity 的传递闭包合并家族，避免同一
棋盘越过训练/验证边界。current 输入只作为已消费池上的回归验证证据。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


SCHEMA = "v19-scale-pilot-bc34x53-v1"
LOSS_CONTRACT_ID = "hard-ce-only-no-teacher-scores-v1"
SEED_IDENTITY = "v19-scale-pilot-root-family-sha256-order-seed-26100334-v1"
SEED = 26100334
MAPS = (
    "(2) Duel.aem",
    "(2) Icy Paths.aem",
    "(2) Liberty Port.aem",
    "(2) Mourningstar.aem",
    "(2) Crossed swords.aem",
)
LEVELS = (("one_third", 1, 3), ("two_thirds", 2, 3), ("full", 1, 1))


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


class DSU:
    """用于按共享输入合并整局，根选择不承载最终身份。"""

    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def add(self, item: str) -> None:
        self.parent.setdefault(item, item)

    def find(self, item: str) -> str:
        parent = self.parent[item]
        if parent != item:
            self.parent[item] = self.find(parent)
        return self.parent[item]

    def union(self, left: str, right: str) -> None:
        a, b = self.find(left), self.find(right)
        if a != b:
            self.parent[max(a, b)] = min(a, b)


@dataclass
class Item:
    row: dict[str, Any]
    source_path: str
    source_line: int
    source_kind: str
    episode_id: str
    source_state_key: str
    root_family_id: str = ""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _label_signature(row: dict[str, Any]) -> str:
    """只比较硬 CE 实际消费的监督目标；教师分数差异另行审计。"""
    teacher = row.get("teacher") or {}
    fields = {
        "targetActionIndex": row.get("targetActionIndex"),
        "targetActionCode": teacher.get("targetActionCode"),
        "orderedActionCodes": row.get("orderedActionCodes"),
        "policyLossMask": row.get("policyLossMask"),
        "valueLossMask": row.get("valueLossMask"),
        "valueTarget": row.get("valueTarget"),
    }
    return sha256_text(canonical_json(fields))


def _teacher_summary(row: dict[str, Any]) -> dict[str, Any]:
    """用紧凑摘要保留未被硬 CE 消费的教师差异证据。"""
    teacher = row.get("teacher") or {}
    return {
        "teacherSha256": sha256_text(canonical_json(teacher)),
        "targetActionCode": teacher.get("targetActionCode"),
        "targetVersion": teacher.get("targetVersion"),
        "selectionContractId": teacher.get("selectionContractId"),
        "jitterContractId": teacher.get("jitterContractId"),
        "labelSeedBase": teacher.get("labelSeedBase"),
        "seed": teacher.get("seed"),
        "rawScoresSha256": sha256_text(canonical_json(teacher.get("rawScores"))),
    }


def _validate_row(row: dict[str, Any], source: str, line: int) -> tuple[str, str]:
    where = f"{source}:{line}"
    _require(row.get("encoderSchemaId") == "spatial34_global20_actionSemantics53_v19",
             f"{where} 不是 V19 34/53 schema")
    identity = row.get("inputIdentity")
    _require(isinstance(identity, str) and len(identity) == 64, f"{where} 缺少有效 inputIdentity")
    state = row.get("stateJson")
    _require(isinstance(state, dict), f"{where} 缺少 stateJson")
    metadata = state.get("metadata") or {}
    map_name = metadata.get("apkMapName")
    players = state.get("players")
    _require(map_name in MAPS, f"{where} 不属于 V16 五图：{map_name!r}")
    _require(isinstance(players, list) and len(players) == 2, f"{where} 不是双人状态")
    return identity, map_name


def _historical_episode_id(row: dict[str, Any], source: str, line: int) -> str:
    provenance = row.get("provenance") or {}
    digest = provenance.get("sourceFileSha256")
    index = provenance.get("sourceLineIndex")
    _require(isinstance(digest, str) and len(digest) == 64, f"{source}:{line} 缺少 sourceFileSha256")
    _require(isinstance(index, int), f"{source}:{line} 缺少 sourceLineIndex")
    return f"historical:{digest}:{index}"


def _current_episode_id(row: dict[str, Any], source: str, line: int) -> str:
    provenance = row.get("provenance") or {}
    # current 行的 episodeId 可能是逐行 gameId；分组身份必须优先采用生产端冻结的根家族。
    explicit = (row.get("rootFamilyId") or provenance.get("familyId")
                or row.get("episodeId") or provenance.get("episodeId"))
    if explicit is not None:
        return f"current:{explicit}"
    digest = provenance.get("sourceFileSha256") or file_sha256(Path(source))
    index = provenance.get("sourceLineIndex", line)
    return f"current:{digest}:{index}"


def load_rows(path: Path, source_kind: str, audit: list[dict[str, Any]]) -> list[Item]:
    rows: list[Item] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, text in enumerate(handle, 1):
            if not text.strip():
                continue
            row = json.loads(text)
            try:
                identity, _ = _validate_row(row, str(path), line_number)
            except ValueError as error:
                audit.append({"action": "excluded_out_of_scope", "sourceKind": source_kind,
                              "sourcePath": str(path), "sourceLine": line_number, "reason": str(error)})
                continue
            episode_id = (_historical_episode_id(row, str(path), line_number)
                          if source_kind == "historical" else _current_episode_id(row, str(path), line_number))
            provenance = row.get("provenance") or {}
            step = provenance.get("stepIndex", row.get("sampleId", line_number))
            source_state_key = f"{episode_id}:step:{step}"
            rows.append(Item(row, str(path), line_number, source_kind, episode_id, source_state_key))
            audit.append({"action": "accepted_source", "sourceKind": source_kind,
                          "sourcePath": str(path), "sourceLine": line_number,
                          "episodeId": episode_id, "sourceStateKey": source_state_key,
                          "inputIdentity": identity})
    return rows


def assign_root_families(items: list[Item]) -> dict[str, list[Item]]:
    dsu = DSU()
    owner_by_input: dict[str, str] = {}
    for item in items:
        dsu.add(item.episode_id)
        identity = item.row["inputIdentity"]
        owner = owner_by_input.setdefault(identity, item.episode_id)
        dsu.union(owner, item.episode_id)
    members: dict[str, set[str]] = defaultdict(set)
    for episode_id in dsu.parent:
        members[dsu.find(episode_id)].add(episode_id)
    root_ids = {
        parent: "historical-root:" + sha256_text(canonical_json(sorted(episodes)))
        for parent, episodes in members.items()
    }
    grouped: dict[str, list[Item]] = defaultdict(list)
    for item in items:
        item.root_family_id = root_ids[dsu.find(item.episode_id)]
        grouped[item.root_family_id].append(item)
    return dict(grouped)


def assign_current_families(items: list[Item]) -> dict[str, list[Item]]:
    grouped: dict[str, list[Item]] = defaultdict(list)
    for item in items:
        item.root_family_id = "current-root:" + sha256_text(item.episode_id)
        grouped[item.root_family_id].append(item)
    return dict(grouped)


def _dedupe(items: Iterable[Item], scope: str, audit: list[dict[str, Any]]) -> list[Item]:
    kept: dict[str, Item] = {}
    signatures: dict[str, str] = {}
    for item in sorted(items, key=lambda value: (value.source_kind, value.source_path,
                                                  value.source_line, value.source_state_key)):
        identity = item.row["inputIdentity"]
        signature = _label_signature(item.row)
        if identity in signatures and signatures[identity] != signature:
            raise ValueError(f"{scope} 中 inputIdentity={identity} 存在冲突监督标签")
        signatures[identity] = signature
        if identity in kept:
            original = kept[identity]
            if canonical_json(original.row.get("teacher")) != canonical_json(item.row.get("teacher")):
                audit.append({
                    "action": "teacher_metadata_or_score_variation_same_ce_target",
                    "scope": scope,
                    "inputIdentity": identity,
                    "retainedSampleId": original.row.get("sampleId", original.source_state_key),
                    "duplicateSampleId": item.row.get("sampleId", item.source_state_key),
                    "retainedTeacher": _teacher_summary(original.row),
                    "duplicateTeacher": _teacher_summary(item.row),
                })
            audit.append({"action": "deduplicated", "scope": scope, "inputIdentity": identity,
                          "keptSourceStateKey": original.source_state_key,
                          "removedSourceStateKey": item.source_state_key})
            continue
        kept[identity] = item
    return list(kept.values())


def _materialize(item: Item, split: str, validation_source: str | None = None) -> dict[str, Any]:
    # 浅拷贝即可：本工具只追加身份字段，不改教师与数值数组。
    row = dict(item.row)
    if split == "train" and item.source_kind == "current_train":
        provenance = dict(row.get("provenance") or {})
        provenance["sourceDataRole"] = provenance.get("dataRole")
        provenance["dataRole"] = "existing_current_rules_training_relabelled_h0"
        row["provenance"] = provenance
        row["trainingSource"] = "current_train_root_families"
    row.update({"rootFamilyId": item.root_family_id, "episodeId": item.episode_id,
                "sourceStateKey": item.source_state_key, "split": split})
    if validation_source:
        row["validationSource"] = validation_source
        row["validationClaim"] = ("regression-only-existing-consumed-pool"
                                  if validation_source == "current_regression" else "historical-holdout")
    return row


def _summary(items: list[Item]) -> dict[str, Any]:
    return {
        "rows": len(items),
        "uniqueInputs": len({item.row["inputIdentity"] for item in items}),
        "familyGroups": len({item.root_family_id for item in items}),
        "maps": dict(sorted(Counter(item.row["stateJson"]["metadata"]["apkMapName"] for item in items).items())),
    }


def _map_round_robin_roots(groups: dict[str, list[Item]]) -> list[str]:
    """各图内部固定 SHA 排序，再按五图顺序轮转，前缀天然保持分图覆盖。"""
    by_map: dict[str, list[str]] = {name: [] for name in MAPS}
    for root_id, items in groups.items():
        maps = {item.row["stateJson"]["metadata"]["apkMapName"] for item in items}
        _require(len(maps) == 1, f"current train 根家族跨图：{root_id} -> {sorted(maps)}")
        by_map[next(iter(maps))].append(root_id)
    for map_name in MAPS:
        by_map[map_name].sort(key=lambda value: sha256_text(f"{SEED_IDENTITY}:{value}"))
    ordered: list[str] = []
    offset = 0
    while any(offset < len(by_map[map_name]) for map_name in MAPS):
        for map_name in MAPS:
            if offset < len(by_map[map_name]):
                ordered.append(by_map[map_name][offset])
        offset += 1
    return ordered


def _write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build(root: Path, current_rows_path: Path, out_dir: Path,
          current_train_rows_path: Path | None = None) -> dict[str, Any]:
    if out_dir.exists():
        raise FileExistsError(f"拒绝覆盖已有输出目录：{out_dir}")
    root = root.resolve()
    current_rows_path = current_rows_path.resolve()
    current_train_rows_path = current_train_rows_path.resolve() if current_train_rows_path else None
    historical_paths = [root / f"recovered_s{index}" / "rows.jsonl" for index in range(5)]
    missing_historical = [str(path) for path in historical_paths if not path.is_file()]
    _require(not missing_historical, f"缺少历史分片：{missing_historical}")
    _require(current_rows_path.is_file(), f"current rows 不存在：{current_rows_path}")
    if current_train_rows_path is not None:
        _require(current_train_rows_path.is_file(), f"current train rows 不存在：{current_train_rows_path}")

    audit: list[dict[str, Any]] = []
    historical = [item for path in historical_paths for item in load_rows(path, "historical", audit)]
    current = load_rows(current_rows_path, "current_regression", audit)
    _require(bool(historical), "五图双人历史样本为空")
    _require(bool(current), "五图双人 current 回归样本为空")

    historical_groups = assign_root_families(historical)
    current_groups = assign_current_families(current)
    mode = "current-family-scale" if current_train_rows_path is not None else "historical-family-scale"
    if current_train_rows_path is not None:
        current_train = load_rows(current_train_rows_path, "current_train", audit)
        _require(bool(current_train), "五图双人 current train 样本为空")
        train_groups = assign_current_families(current_train)
        train_roots = _map_round_robin_roots(train_groups)
        holdout_roots = list(historical_groups)
        overlapping_roots = sorted(set(train_groups) & set(current_groups))
        _require(not overlapping_roots,
                 f"current train/val 根家族重叠 {len(overlapping_roots)} 个：{overlapping_roots[:5]}")
        historical_val_scope = "historical_curriculum_holdout"
    else:
        ordered_roots = sorted(historical_groups, key=lambda value: sha256_text(f"{SEED_IDENTITY}:{value}"))
        holdout_count = max(1, round(len(ordered_roots) * 0.20))
        holdout_roots = ordered_roots[:holdout_count]
        train_roots = ordered_roots[holdout_count:]
        _require(bool(train_roots), "历史家族不足以同时构建训练与 holdout")
        train_groups = historical_groups
        historical_val_scope = "historical_holdout"

    current_training_roots = train_roots if mode == "current-family-scale" else []

    historical_val = _dedupe((item for root_id in holdout_roots for item in historical_groups[root_id]),
                             historical_val_scope, audit)
    current_val = _dedupe(current, "current_regression", audit)
    # 两类验证来源之间也必须唯一；保留历史行，并在审计中记录 current 的等价输入。
    combined_val = _dedupe([*historical_val, *current_val], "combined_validation", audit)
    validation_inputs = {item.row["inputIdentity"] for item in combined_val}
    validation_by_input = {item.row["inputIdentity"]: item for item in combined_val}
    historical_val_keys = {item.source_state_key for item in historical_val}

    clean_train_by_root: dict[str, list[Item]] = {}
    for root_id in train_roots:
        candidates: list[Item] = []
        for item in train_groups[root_id]:
            if item.row["inputIdentity"] in validation_inputs:
                validation_item = validation_by_input[item.row["inputIdentity"]]
                _require(_label_signature(item.row) == _label_signature(validation_item.row),
                         f"train/val 中 inputIdentity={item.row['inputIdentity']} 存在冲突监督标签")
                if canonical_json(item.row.get("teacher")) != canonical_json(validation_item.row.get("teacher")):
                    audit.append({
                        "action": "teacher_metadata_or_score_variation_same_ce_target",
                        "scope": "train_validation_overlap",
                        "inputIdentity": item.row["inputIdentity"],
                        "retainedSampleId": validation_item.row.get("sampleId", validation_item.source_state_key),
                        "duplicateSampleId": item.row.get("sampleId", item.source_state_key),
                        "retainedTeacher": _teacher_summary(validation_item.row),
                        "duplicateTeacher": _teacher_summary(item.row),
                    })
                audit.append({"action": "removed_train_validation_overlap", "rootFamilyId": root_id,
                              "sourceStateKey": item.source_state_key,
                              "inputIdentity": item.row["inputIdentity"]})
            else:
                candidates.append(item)
        clean_train_by_root[root_id] = _dedupe(candidates, f"train_root:{root_id}", audit)

    out_dir.mkdir(parents=True)
    audit_path = out_dir / "audit_ledger.jsonl"
    audit_path.write_text("".join(canonical_json(entry) + "\n" for entry in audit), encoding="utf-8")
    level_manifests: dict[str, Any] = {}
    for name, numerator, denominator in LEVELS:
        count = len(train_roots) if denominator == 1 else max(1, (len(train_roots) * numerator + denominator - 1) // denominator)
        selected_roots = train_roots[:count]
        train_items = _dedupe((item for root_id in selected_roots for item in clean_train_by_root[root_id]),
                              f"level:{name}:train", audit)
        train_inputs = {item.row["inputIdentity"] for item in train_items}
        val_inputs = {item.row["inputIdentity"] for item in combined_val}
        overlap = sorted(train_inputs & val_inputs)
        _require(not overlap, f"{name} train/val 出现 {len(overlap)} 个重复输入")

        level_dir = out_dir / name
        level_dir.mkdir()
        dataset_path = level_dir / "dataset.jsonl"
        with dataset_path.open("w", encoding="utf-8", newline="\n") as handle:
            for item in train_items:
                handle.write(canonical_json(_materialize(item, "train")) + "\n")
            for item in combined_val:
                source = historical_val_scope if item.source_state_key in historical_val_keys else "current_regression"
                handle.write(canonical_json(_materialize(item, "validation", source)) + "\n")

        split = {
            "schema": SCHEMA,
            "level": name,
            "seed": SEED,
            "seedIdentity": SEED_IDENTITY,
            "trainRootFamilies": selected_roots,
            "valRootFamilies": sorted({item.root_family_id for item in combined_val}),
            "testRootFamilies": [],
            "validationSources": {
                historical_val_scope: ("全部历史五图双人样本，仅作额外 curriculum holdout，不参与训练"
                                       if mode == "current-family-scale" else "约20%的历史合并家族"),
                "current_regression": "已消费池回归专用，不构成新的 sealed 泛化证据",
            },
        }
        split_path = level_dir / "split.json"
        _write_json(split_path, split)
        report = {
            "schema": SCHEMA,
            "level": name,
            "train": _summary(train_items),
            "validation": _summary(combined_val),
            "validationBySource": {
                historical_val_scope: _summary(historical_val),
                "current_regressionBeforeCrossSourceDedupe": _summary(current_val),
            },
            "historicalTrainingRows": 0 if mode == "current-family-scale" else _summary(train_items)["rows"],
            "historicalCurriculumRole": ("validation-only; all eligible historical rows excluded from training"
                                         if mode == "current-family-scale" else "20-percent-family-holdout"),
            "crossSplitDuplicateInputs": len(overlap),
            "artifacts": {
                "dataset.jsonl": file_sha256(dataset_path),
                "split.json": file_sha256(split_path),
            },
        }
        report_path = level_dir / "report.json"
        _write_json(report_path, report)
        level_manifests[name] = {"directory": name, "report": report,
                                 "reportSha256": file_sha256(report_path)}

    # 最后一轮 level 去重会追加审计记录，因此在所有档完成后重写账本。
    audit_path.write_text("".join(canonical_json(entry) + "\n" for entry in audit), encoding="utf-8")
    source_paths = [*historical_paths, current_rows_path]
    if current_train_rows_path is not None:
        source_paths.append(current_train_rows_path)
    manifest = {
        "schema": SCHEMA,
        "mode": mode,
        "comparisonAxis": ("current-rule unique family count"
                           if mode == "current-family-scale" else "historical merged root family count"),
        "lossContractId": LOSS_CONTRACT_ID,
        "teacherScoreUsage": "forbidden; datasets are valid only for hard CE targets and must not be used as soft-label datasets",
        "seed": SEED,
        "seedIdentity": SEED_IDENTITY,
        "maps": list(MAPS),
        "sourceFiles": {str(path): file_sha256(path) for path in source_paths},
        "historicalRootFamilies": len(historical_groups),
        "historicalHoldoutRootFamilies": sorted(holdout_roots),
        "currentTrainingRootFamilyCount": len(current_training_roots),
        "currentTrainingRootFamilies": current_training_roots,
        "historicalCurriculumRole": ("validation-only; not used for training"
                                     if mode == "current-family-scale" else "20-percent-family-holdout"),
        "currentValidationRootFamilies": sorted(current_groups),
        "validationClaim": "current regression-only existing consumed pool; not new sealed generalization",
        "levels": level_manifests,
        "auditLedger": {"path": "audit_ledger.jsonl", "sha256": file_sha256(audit_path), "entries": len(audit)},
    }
    _write_json(out_dir / "manifest.json", manifest)
    return manifest


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="构建 V19 34/53 BC 数据规模小档")
    parser.add_argument("--root", required=True, type=Path, help="包含 recovered_s*/rows.jsonl 的目录")
    parser.add_argument("--current-rows", required=True, type=Path, help="current relabel rows.jsonl")
    parser.add_argument("--current-train-rows", type=Path,
                        help="可选；启用 current 根家族扩量模式，历史样本只作 curriculum holdout")
    parser.add_argument("--out-dir", required=True, type=Path, help="必须尚不存在的输出目录")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        manifest = build(args.root, args.current_rows, args.out_dir, args.current_train_rows)
    except Exception as error:  # CLI 统一输出简明中文错误，保留非零退出码。
        print(f"构建失败：{error}", file=sys.stderr)
        return 1
    print(canonical_json({"completed": True, "outDir": str(args.out_dir),
                          "levels": list(manifest["levels"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
