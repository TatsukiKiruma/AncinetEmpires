#!/usr/bin/env python3
"""审计五分片历史回放恢复数据，不修改原始证据。"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


SHARD_NAMES = tuple(f"recovered_s{i}" for i in range(5))
SCHEMA_ID = "spatial34_global20_actionSemantics53_v19"
ORDERING_ID = "actionCode-codepoint-asc-v1"
IDENTITY_ID = "v19-recovered-json-f32-values-canonical-candidates-v1"
MAIN_TWO_PLAYER_MAPS = {
    "(2) Duel.aem",
    "(2) Icy Paths.aem",
    "(2) Liberty Port.aem",
    "(2) Mourningstar.aem",
    "(2) Crossed swords.aem",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def json_key(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def increment(counter: Counter[str], value: Any) -> None:
    counter[str(value) if value is not None else "<缺失>"] += 1


def all_finite(values: Any) -> bool:
    return isinstance(values, list) and all(
        isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
        for value in values
    )


def read_jsonl(path: Path) -> Iterable[tuple[int, dict[str, Any]]]:
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"{path}:{line_number} 不是 JSON 对象")
            yield line_number, value


def add_error(errors: list[str], message: str, limit: int = 200) -> None:
    if len(errors) < limit:
        errors.append(message)


def resolve_dataset_root(root: Path) -> Path:
    direct = root / SHARD_NAMES[0]
    if direct.is_dir():
        return root
    nested = root / "v19" / "out" / "data_scale_20261003"
    if (nested / SHARD_NAMES[0]).is_dir():
        return nested
    raise FileNotFoundError(f"--root 下找不到 {SHARD_NAMES[0]}：{root}")


def audit(dataset_root: Path, retry_dir: Path | None = None) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    manifests: list[dict[str, Any]] = []
    manifest_by_shard: dict[str, dict[str, Any]] = {}
    selection_paths: set[str] = set()
    selection_hashes: set[str] = set()
    digest_signatures: set[str] = set()
    artifact_checks: list[dict[str, Any]] = []
    negative_controls: list[dict[str, Any]] = []

    for shard_index, shard_name in enumerate(SHARD_NAMES):
        shard_dir = dataset_root / shard_name
        manifest_path = shard_dir / "manifest.json"
        if not shard_dir.is_dir():
            add_error(errors, f"缺少分片目录：{shard_name}")
            continue
        try:
            manifest = load_json(manifest_path)
        except Exception as exc:  # noqa: BLE001
            add_error(errors, f"{shard_name}/manifest.json 无法读取：{exc}")
            continue
        manifests.append(manifest)
        manifest_by_shard[shard_name] = manifest
        if manifest.get("shard") != shard_index or manifest.get("shards") != 5:
            add_error(errors, f"{shard_name} 的 shard/shards 不等于 {shard_index}/5")
        if manifest.get("selectedEpisodes") != 10:
            add_error(errors, f"{shard_name} selectedEpisodes 不是 10")
        selection_paths.add(str(manifest.get("selectionPath")))
        selection_hashes.add(str(manifest.get("selectionSha256")))
        digest_signatures.add(json_key(manifest.get("sourceDigests")))
        controls = manifest.get("negativeControls")
        if not isinstance(controls, list) or not controls:
            add_error(errors, f"{shard_name} 未记录负对照")
        else:
            for control in controls:
                passed = isinstance(control, dict) and control.get("passed") is True
                negative_controls.append({"shard": shard_name, "passed": passed, "mutation": control.get("mutation") if isinstance(control, dict) else None})
                if not passed:
                    add_error(errors, f"{shard_name} 负对照未通过：{control}")
        hashes = manifest.get("artifactHashes")
        if not isinstance(hashes, dict):
            add_error(errors, f"{shard_name} 缺少 artifactHashes")
            continue
        for filename in ("episodes.jsonl", "rows.jsonl"):
            path = shard_dir / filename
            expected = hashes.get(filename)
            actual = sha256_file(path) if path.is_file() else None
            matches = isinstance(expected, str) and actual == expected
            artifact_checks.append({"shard": shard_name, "file": filename, "expected": expected, "actual": actual, "matches": matches})
            if not matches:
                add_error(errors, f"{shard_name}/{filename} 与 manifest SHA-256 不一致")

    if len(manifests) != 5:
        add_error(errors, f"可读 manifest 数为 {len(manifests)}，预期 5")
    if len(selection_paths) != 1 or len(selection_hashes) != 1:
        add_error(errors, "五分片 selectionPath/selectionSha256 不一致")
    if len(digest_signatures) != 1:
        add_error(errors, "五分片 sourceDigests 不一致")

    selection: dict[str, Any] = {}
    selected: list[dict[str, Any]] = []
    selection_path: Path | None = None
    if len(selection_paths) == 1:
        selection_path = Path(next(iter(selection_paths)))
        try:
            selection = load_json(selection_path)
            selected = selection.get("results", [])[:50]
            if sha256_file(selection_path) not in selection_hashes:
                add_error(errors, "selection 文件 SHA-256 与 manifest 不一致")
        except Exception as exc:  # noqa: BLE001
            add_error(errors, f"selection 无法读取：{exc}")
    if len(selected) != 50:
        add_error(errors, f"selection 前 50 条实际为 {len(selected)} 条")
    expected_keys = [(item.get("file"), item.get("lineIndex")) for item in selected]
    if len(set(expected_keys)) != 50:
        add_error(errors, "selection 前 50 条的 (file,lineIndex) 不唯一")
    expected_by_shard = {
        index: {expected_keys[pos] for pos in range(index, len(expected_keys), 5)}
        for index in range(5)
    }

    episode_keys: list[tuple[Any, Any]] = []
    episode_by_key: dict[tuple[Any, Any], dict[str, Any]] = {}
    replay_verified = 0
    encoded_pass = 0
    outcomes: Counter[str] = Counter()
    episode_family: Counter[str] = Counter()
    episode_players: Counter[str] = Counter()
    row_count_from_manifests = 0
    for shard_index, shard_name in enumerate(SHARD_NAMES):
        shard_dir = dataset_root / shard_name
        path = shard_dir / "episodes.jsonl"
        shard_keys: set[tuple[Any, Any]] = set()
        if not path.is_file():
            continue
        try:
            for line_number, episode in read_jsonl(path):
                key = (episode.get("file"), episode.get("lineIndex"))
                episode_keys.append(key)
                shard_keys.add(key)
                if key in episode_by_key:
                    add_error(errors, f"episode 重复：{key}")
                episode_by_key[key] = episode
                if episode.get("replayVerified") is True:
                    replay_verified += 1
                outcome = str(episode.get("outcome", "<缺失>"))
                outcomes[outcome] += 1
                if outcome == "PASS":
                    encoded_pass += 1
                increment(episode_family, episode.get("scenarioId"))
                increment(episode_players, episode.get("playerCount"))
                if outcome == "PASS" and episode.get("replayVerified") is not True:
                    add_error(errors, f"{shard_name}/episodes.jsonl:{line_number} PASS 但未 replayVerified")
        except Exception as exc:  # noqa: BLE001
            add_error(errors, f"读取 {shard_name}/episodes.jsonl 失败：{exc}")
        if shard_keys != expected_by_shard.get(shard_index, set()):
            missing = sorted(expected_by_shard.get(shard_index, set()) - shard_keys)
            extra = sorted(shard_keys - expected_by_shard.get(shard_index, set()))
            add_error(errors, f"{shard_name} selection 覆盖不精确：missing={missing[:5]} extra={extra[:5]}")
        manifest = manifest_by_shard.get(shard_name)
        if manifest is not None:
            row_count_from_manifests += int(manifest.get("rowCount", 0))
            actual_pass = sum(1 for key in shard_keys if episode_by_key.get(key, {}).get("outcome") == "PASS")
            actual_fail = sum(1 for key in shard_keys if episode_by_key.get(key, {}).get("outcome") == "FAIL")
            actual_timeout = sum(1 for key in shard_keys if episode_by_key.get(key, {}).get("outcome") == "TIMEOUT")
            expected_counts = {
                "attemptedEpisodes": len(shard_keys),
                "pass": actual_pass,
                "fail": actual_fail,
                "timeout": actual_timeout,
            }
            for field, actual in expected_counts.items():
                if manifest.get(field) != actual:
                    add_error(errors, f"{shard_name} manifest.{field}={manifest.get(field)}，实际为 {actual}")

    if len(episode_keys) != 50 or len(set(episode_keys)) != 50 or set(episode_keys) != set(expected_keys):
        add_error(errors, f"episode 全局覆盖不是 50 条唯一 selection：总数={len(episode_keys)}，唯一={len(set(episode_keys))}")

    retry_episode: dict[str, Any] | None = None
    retry_key: tuple[Any, Any] | None = None
    retry_manifest: dict[str, Any] | None = None
    if retry_dir is not None:
        retry_dir = retry_dir.resolve()
        try:
            retry_manifest = load_json(retry_dir / "manifest.json")
        except Exception as exc:  # noqa: BLE001
            add_error(errors, f"重试 manifest 无法读取：{exc}")
        if retry_manifest is not None:
            retry_selection_path = Path(str(retry_manifest.get("selectionPath")))
            try:
                retry_selection = load_json(retry_selection_path)
                retry_selected = retry_selection.get("results", [])
                if len(retry_selected) != 1:
                    add_error(errors, f"重试 selection 必须恰好一条，实际 {len(retry_selected)} 条")
                else:
                    retry_key = (retry_selected[0].get("file"), retry_selected[0].get("lineIndex"))
                if sha256_file(retry_selection_path) != retry_manifest.get("selectionSha256"):
                    add_error(errors, "重试 selection SHA-256 与 manifest 不一致")
            except Exception as exc:  # noqa: BLE001
                add_error(errors, f"重试 selection 无法读取：{exc}")
            retry_digest_signature = json_key(retry_manifest.get("sourceDigests"))
            if not digest_signatures or retry_digest_signature not in digest_signatures:
                add_error(errors, "重试 sourceDigests 与原始五分片不一致")
            retry_controls = retry_manifest.get("negativeControls")
            if isinstance(retry_controls, list):
                for control in retry_controls:
                    passed = isinstance(control, dict) and control.get("passed") is True
                    negative_controls.append({"shard": "retry", "passed": passed, "mutation": control.get("mutation") if isinstance(control, dict) else None})
                    if not passed:
                        add_error(errors, f"重试负对照未通过：{control}")
            retry_hashes = retry_manifest.get("artifactHashes", {})
            for filename in ("episodes.jsonl", "rows.jsonl"):
                path = retry_dir / filename
                expected = retry_hashes.get(filename) if isinstance(retry_hashes, dict) else None
                actual = sha256_file(path) if path.is_file() else None
                empty_rows_expected = filename == "rows.jsonl" and retry_manifest.get("rowCount") == 0
                matches = (isinstance(expected, str) and actual == expected) or (empty_rows_expected and expected is None and actual is None)
                artifact_checks.append({"shard": "retry", "file": filename, "expected": expected, "actual": actual, "matches": matches})
                if not matches:
                    add_error(errors, f"重试 {filename} 与 manifest SHA-256 不一致")
            try:
                retry_episodes = [item for _, item in read_jsonl(retry_dir / "episodes.jsonl")]
                if len(retry_episodes) != 1:
                    add_error(errors, f"重试 episodes.jsonl 必须恰好一条，实际 {len(retry_episodes)} 条")
                elif retry_key is not None:
                    retry_episode = retry_episodes[0]
                    observed_retry_key = (retry_episode.get("file"), retry_episode.get("lineIndex"))
                    if observed_retry_key != retry_key:
                        add_error(errors, f"重试 episode {observed_retry_key} 与重试 selection {retry_key} 不一致")
                    original = episode_by_key.get(retry_key)
                    if original is None:
                        add_error(errors, f"重试目标不在原始 50 条中：{retry_key}")
                    elif original.get("outcome") not in {"FAIL", "TIMEOUT"}:
                        add_error(errors, f"重试目标不是原始 FAIL/TIMEOUT，拒绝重复计算已有 PASS：{retry_key}")
                    else:
                        for field in ("sourceRecordSha256", "scenarioId", "seed"):
                            if retry_episode.get(field) != original.get(field):
                                add_error(errors, f"重试 {field} 与原始记录不一致：{retry_key}")
                        source_file = str(retry_key[0])
                        original_source_hashes = {
                            manifest.get("sources", {}).get(source_file)
                            for manifest in manifests
                            if isinstance(manifest.get("sources"), dict) and source_file in manifest.get("sources", {})
                        }
                        retry_source_hash = retry_manifest.get("sources", {}).get(source_file) if isinstance(retry_manifest.get("sources"), dict) else None
                        if not original_source_hashes or retry_source_hash not in original_source_hashes:
                            add_error(errors, f"重试源文件 SHA-256 与原始 manifest 不一致：{source_file}")
            except Exception as exc:  # noqa: BLE001
                add_error(errors, f"读取重试 episodes.jsonl 失败：{exc}")
            if retry_manifest.get("selectedEpisodes") != 1 or retry_manifest.get("attemptedEpisodes") != 1:
                add_error(errors, "重试 manifest 的 selectedEpisodes/attemptedEpisodes 必须均为 1")
            if retry_episode is not None:
                retry_outcome = retry_episode.get("outcome")
                if retry_outcome == "PASS" and (not isinstance(retry_controls, list) or not retry_controls):
                    add_error(errors, "成功重试未记录负对照")
                for field, actual in {
                    "pass": int(retry_outcome == "PASS"),
                    "fail": int(retry_outcome == "FAIL"),
                    "timeout": int(retry_outcome == "TIMEOUT"),
                }.items():
                    if retry_manifest.get(field) != actual:
                        add_error(errors, f"重试 manifest.{field}={retry_manifest.get(field)}，实际为 {actual}")

    effective_by_key = dict(episode_by_key)
    if retry_key is not None and retry_episode is not None and retry_key in episode_by_key:
        effective_by_key[retry_key] = retry_episode
    effective_outcomes = Counter(str(item.get("outcome", "<缺失>")) for item in effective_by_key.values())
    effective_replay_verified = sum(item.get("replayVerified") is True for item in effective_by_key.values())
    effective_pass = sum(item.get("outcome") == "PASS" for item in effective_by_key.values())

    row_errors: list[str] = []
    rows = 0
    schema_counts: Counter[str] = Counter()
    map_counts: Counter[str] = Counter()
    player_counts: Counter[str] = Counter()
    family_counts: Counter[str] = Counter()
    identity_counts: Counter[str] = Counter()
    identity_hard_target: dict[str, str] = {}
    identity_full_teacher: dict[str, str] = {}
    identity_examples: dict[str, list[str]] = defaultdict(list)
    hard_target_conflict_identities: set[str] = set()
    teacher_variation_identities: set[str] = set()
    initial_identity_episodes: dict[str, set[str]] = defaultdict(set)
    main_rows = 0
    main_identities: set[str] = set()
    provenance_main_true = 0
    provenance_main_mismatch = 0
    eligible_true = 0

    row_sources = [(shard_name, dataset_root / shard_name / "rows.jsonl") for shard_name in SHARD_NAMES]
    if retry_dir is not None:
        row_sources.append(("retry", retry_dir / "rows.jsonl"))
        if retry_manifest is not None:
            row_count_from_manifests += int(retry_manifest.get("rowCount", 0))
    row_counts_by_source: Counter[str] = Counter()
    for shard_name, path in row_sources:
        if not path.is_file():
            continue
        try:
            iterator = read_jsonl(path)
            for line_number, row in iterator:
                rows += 1
                row_counts_by_source[shard_name] += 1
                where = f"{shard_name}/rows.jsonl:{line_number}"
                schema = row.get("encoderSchemaId")
                increment(schema_counts, schema)
                if schema != SCHEMA_ID or row.get("candidateOrderingId") != ORDERING_ID or row.get("inputIdentityId") != IDENTITY_ID:
                    add_error(row_errors, f"{where} schema/order/identity id 不符")
                spatial = row.get("spatialTensor")
                global_features = row.get("globalFeatures")
                candidates = row.get("candidateActions")
                ordered = row.get("orderedActionCodes")
                teacher = row.get("teacher")
                if not all_finite(spatial) or len(spatial) != 13600:
                    add_error(row_errors, f"{where} spatialTensor 维度或 finite 错误")
                if not all_finite(global_features) or len(global_features) != 20:
                    add_error(row_errors, f"{where} globalFeatures 维度或 finite 错误")
                if not isinstance(candidates, list) or not candidates:
                    add_error(row_errors, f"{where} candidateActions 为空或类型错误")
                    candidates = []
                candidate_codes: list[Any] = []
                for candidate in candidates:
                    candidate_codes.append(candidate.get("actionCode") if isinstance(candidate, dict) else None)
                    if not isinstance(candidate, dict) or not all_finite(candidate.get("semantics")) or len(candidate.get("semantics", [])) != 53:
                        add_error(row_errors, f"{where} candidate semantics 维度或 finite 错误")
                        break
                if ordered != candidate_codes or len(set(candidate_codes)) != len(candidate_codes):
                    add_error(row_errors, f"{where} orderedActionCodes 与候选不一致或不唯一")
                target_index = row.get("targetActionIndex")
                target_code = teacher.get("targetActionCode") if isinstance(teacher, dict) else None
                action_codes = teacher.get("actionCodes") if isinstance(teacher, dict) else None
                raw_scores = teacher.get("rawScores") if isinstance(teacher, dict) else None
                target_ok = (
                    isinstance(target_index, int) and not isinstance(target_index, bool)
                    and 0 <= target_index < len(candidate_codes)
                    and candidate_codes[target_index] == target_code
                    and action_codes == ordered
                    and all_finite(raw_scores) and len(raw_scores) == len(candidate_codes)
                )
                if not target_ok:
                    add_error(row_errors, f"{where} 教师 target/actionCodes/rawScores 不一致")
                if row.get("policyLossMask") is not True or row.get("valueLossMask") is not False or row.get("valueTarget") is not None:
                    add_error(row_errors, f"{where} loss mask/valueTarget 不符合监督契约")

                provenance = row.get("provenance") if isinstance(row.get("provenance"), dict) else {}
                state = row.get("stateJson") if isinstance(row.get("stateJson"), dict) else {}
                metadata = state.get("metadata") if isinstance(state.get("metadata"), dict) else {}
                players = state.get("players") if isinstance(state.get("players"), list) else []
                map_name = metadata.get("apkMapName")
                player_count = len(players)
                family_id = provenance.get("familyId")
                increment(map_counts, map_name)
                increment(player_counts, player_count)
                increment(family_counts, family_id)
                identity = row.get("inputIdentity")
                if not isinstance(identity, str) or len(identity) != 64:
                    add_error(row_errors, f"{where} inputIdentity 不是 64 位字符串")
                    identity = f"<invalid:{where}>"
                identity_counts[identity] += 1
                if len(identity_examples[identity]) < 5:
                    identity_examples[identity].append(str(row.get("sampleId")))
                hard_target_signature = json_key({"targetActionIndex": target_index, "targetActionCode": target_code})
                previous_hard_target = identity_hard_target.setdefault(identity, hard_target_signature)
                if previous_hard_target != hard_target_signature:
                    hard_target_conflict_identities.add(identity)
                full_teacher_signature = json_key({"targetActionIndex": target_index, "teacher": teacher})
                previous_full_teacher = identity_full_teacher.setdefault(identity, full_teacher_signature)
                if previous_full_teacher != full_teacher_signature:
                    teacher_variation_identities.add(identity)
                if provenance.get("stepIndex") == 0:
                    episode_id = f"{provenance.get('sourceFile')}:{provenance.get('sourceLineIndex')}"
                    initial_identity_episodes[identity].add(episode_id)
                actual_main = player_count == 2 and map_name in MAIN_TWO_PLAYER_MAPS
                if actual_main:
                    main_rows += 1
                    main_identities.add(identity)
                if provenance.get("mainMapTwoPlayer") is True:
                    provenance_main_true += 1
                if provenance.get("mainMapTwoPlayer") is not actual_main:
                    provenance_main_mismatch += 1
                if provenance.get("eligibleForCurrentOpeningDataset") is True:
                    eligible_true += 1
                    add_error(row_errors, f"{where} 被误标为 current opening eligible")
        except Exception as exc:  # noqa: BLE001
            add_error(row_errors, f"读取 {path} 失败：{exc}")

    for message in row_errors:
        add_error(errors, message)
    if rows != row_count_from_manifests:
        add_error(errors, f"rows 实际 {rows} 与 manifest 合计 {row_count_from_manifests} 不一致")
    duplicate_groups = {identity: count for identity, count in identity_counts.items() if count > 1}
    initial_duplicate_groups = {
        identity: sorted(episodes)
        for identity, episodes in initial_identity_episodes.items()
        if len(episodes) > 1
    }

    if provenance_main_mismatch:
        warnings.append(
            f"原 provenance.mainMapTwoPlayer 与 stateJson 重算结果不一致 {provenance_main_mismatch} 行；"
            "这是已知短名比较问题，不判为数据内容失败。"
        )
    data_integrity_valid = not errors
    recovery_complete = (
        len(effective_by_key) == 50
        and effective_pass == 50
        and effective_replay_verified == 50
        and not any(outcome in effective_outcomes for outcome in ("FAIL", "TIMEOUT"))
    )
    status = "PASS" if data_integrity_valid and recovery_complete else ("INCOMPLETE" if data_integrity_valid else "FAIL")

    return {
        "kind": "v19-recovered-dataset-audit",
        "version": 1,
        "status": status,
        "valid": {
            "dataIntegrity": data_integrity_valid,
            "recoveryCompleteness": recovery_complete,
            "overall": data_integrity_valid and recovery_complete,
        },
        "scope": {
            "datasetRoot": str(dataset_root.resolve()), "shards": list(SHARD_NAMES),
            "selectionPath": str(selection_path) if selection_path else None,
            "retryDir": str(retry_dir) if retry_dir is not None else None,
        },
        "checks": {
            "errors": errors,
            "errorCount": len(errors),
            "warnings": warnings,
            "warningCount": len(warnings),
            "artifactHashes": artifact_checks,
            "sourceDigestsIdentical": len(digest_signatures) == 1 and len(manifests) == 5,
            "selectionIdentityConsistent": len(selection_paths) == 1 and len(selection_hashes) == 1,
            "selectionUniqueCoverage50": len(episode_keys) == 50 and len(set(episode_keys)) == 50 and set(episode_keys) == set(expected_keys),
            "negativeControls": negative_controls,
            "negativeControlsAllPassed": bool(negative_controls) and all(item["passed"] for item in negative_controls),
        },
        "episodes": {
            "view": "原始五分片，不被重试覆盖",
            "selected": len(expected_keys),
            "observed": len(episode_keys),
            "replayVerified": replay_verified,
            "passWithEncoding": encoded_pass,
            "replayVerifiedButEncodingFailed": replay_verified - encoded_pass,
            "outcomes": dict(sorted(outcomes.items())),
            "scenarioFamilies": dict(sorted(episode_family.items())),
            "playerCounts": dict(sorted(episode_players.items())),
        },
        "effectiveRecovery": {
            "view": "原始五分片加经身份核验的单条重试覆盖",
            "episodeCount": len(effective_by_key),
            "replayVerified": effective_replay_verified,
            "passWithEncoding": effective_pass,
            "fail": effective_outcomes.get("FAIL", 0),
            "timeout": effective_outcomes.get("TIMEOUT", 0),
            "outcomes": dict(sorted(effective_outcomes.items())),
            "retryKey": list(retry_key) if retry_key is not None else None,
            "retryOutcome": retry_episode.get("outcome") if retry_episode is not None else None,
        },
        "rows": {
            "count": rows,
            "originalCount": sum(row_counts_by_source[name] for name in SHARD_NAMES),
            "retryCount": row_counts_by_source["retry"],
            "effectiveCount": rows,
            "manifestCount": row_count_from_manifests,
            "schemaCounts": dict(sorted(schema_counts.items())),
            "mapDistribution": dict(sorted(map_counts.items())),
            "playerCountDistribution": dict(sorted(player_counts.items())),
            "declaredFamilyDistribution": dict(sorted(family_counts.items())),
            "uniqueInputIdentities": len(identity_counts),
            "exactDuplicateRows": sum(count - 1 for count in identity_counts.values() if count > 1),
            "exactDuplicateIdentityGroups": len(duplicate_groups),
            "duplicateIdentityExamples": [
                {"inputIdentity": identity, "count": duplicate_groups[identity], "sampleIds": identity_examples[identity]}
                for identity in sorted(duplicate_groups)[:50]
            ],
            "hardTargetConflictInputCount": len(hard_target_conflict_identities),
            "hardTargetConflictInputs": sorted(hard_target_conflict_identities),
            "teacherMetadataOrScoresVariationInputCount": len(teacher_variation_identities),
            "teacherMetadataOrScoresVariationInputs": sorted(teacher_variation_identities),
            "teacherConflictIdentityCount": len(teacher_variation_identities),
            "teacherConflictIdentities": sorted(teacher_variation_identities),
            "teacherConflictDefinition": "兼容旧字段：表示完整 teacher 对象或 targetActionIndex 有差异，不表示硬目标动作冲突；请优先读取 hardTargetConflictInputCount。",
            "semanticInitialFamilies": {
                "definition": "stepIndex=0 的 inputIdentity；相同初态模型输入归为同一语义家族，不按 seed 拆分",
                "familyCount": len(initial_identity_episodes),
                "initialRows": sum(len(items) for items in initial_identity_episodes.values()),
                "repeatedFamilyCount": len(initial_duplicate_groups),
                "repeatedFamilies": [
                    {"inputIdentity": identity, "episodes": episodes}
                    for identity, episodes in sorted(initial_duplicate_groups.items())
                ],
            },
            "mainFiveMapsTwoPlayer": {
                "definition": "由 stateJson.metadata.apkMapName 与 stateJson.players.length 重算",
                "maps": sorted(MAIN_TWO_PLAYER_MAPS),
                "rowCount": main_rows,
                "uniqueInputIdentities": len(main_identities),
                "provenanceTrueCount": provenance_main_true,
                "provenanceMismatchCount": provenance_main_mismatch,
            },
            "eligibleForCurrentOpeningDatasetTrueCount": eligible_true,
            "currentOpeningInterpretation": "mainMapTwoPlayer 只表示地图与玩家数分层；历史恢复行全部不得视为当前 opening 数据。",
        },
    }


def markdown(report: dict[str, Any]) -> str:
    episodes = report["episodes"]
    effective = report["effectiveRecovery"]
    rows = report["rows"]
    main = rows["mainFiveMapsTwoPlayer"]
    semantic = rows["semanticInitialFamilies"]
    lines = [
        "# V19 历史回放恢复数据审计",
        "",
        f"- 结论：**{report['status']}**；数据完整性={report['valid']['dataIntegrity']}，恢复完整性={report['valid']['recoveryCompleteness']}；错误 {report['checks']['errorCount']} 项，警告 {report['checks']['warningCount']} 项。",
        f"- 原始五分片：选择覆盖 {episodes['observed']}/50 条；整局回放验证通过 {episodes['replayVerified']} 条，含编码的 PASS {episodes['passWithEncoding']} 条；原始结果保持不变。",
        f"- 有效恢复视图：整局回放验证通过 {effective['replayVerified']}/50 条，含编码的 PASS {effective['passWithEncoding']}/50 条，FAIL={effective['fail']}，TIMEOUT={effective['timeout']}。",
        f"- 监督行：{rows['count']} 行，{rows['uniqueInputIdentities']} 个独特 inputIdentity；精确重复 {rows['exactDuplicateRows']} 行。",
        f"- 同 inputIdentity 的硬目标冲突：{rows['hardTargetConflictInputCount']} 个；教师分数或元数据差异：{rows['teacherMetadataOrScoresVariationInputCount']} 个。后者不等同于训练目标动作冲突。",
        f"- 主五图双人分层（按 stateJson 重算）：{main['rowCount']} 行，{main['uniqueInputIdentities']} 个独特 inputIdentity；原 provenance 误标 {main['provenanceMismatchCount']} 行。",
        f"- 语义初态家族：{semantic['familyCount']} 个，其中跨 episode 重复家族 {semantic['repeatedFamilyCount']} 个；按 stepIndex=0 的 inputIdentity 合并，不按 seed 拆分。",
        f"- current opening 边界：eligibleForCurrentOpeningDataset=true 为 {rows['eligibleForCurrentOpeningDatasetTrueCount']} 行；主图双人标签不改变历史恢复数据身份。",
        "",
    ]
    if report["checks"]["errors"]:
        lines.extend(["## 错误", ""] + [f"- {error}" for error in report["checks"]["errors"]] + [""])
    if report["checks"]["warnings"]:
        lines.extend(["## 警告", ""] + [f"- {warning}" for warning in report["checks"]["warnings"]] + [""])
    lines.extend([
        "完整的哈希核验、分布、重复组和冲突明细见 `audit.json`。",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="审计 recovered_s0..s4 历史回放恢复数据")
    parser.add_argument("--root", type=Path, required=True, help="数据根目录，或包含 v19/out/data_scale_20261003 的仓库根目录")
    parser.add_argument("--out-dir", type=Path, required=True, help="新建的审计输出目录")
    parser.add_argument("--retry-dir", type=Path, help="可选的单条重试目录；只允许覆盖原始 FAIL/TIMEOUT")
    args = parser.parse_args()
    dataset_root = resolve_dataset_root(args.root.resolve())
    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=False)
    report = audit(dataset_root, args.retry_dir)
    (out_dir / "audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out_dir / "audit.md").write_text(markdown(report), encoding="utf-8")
    print(json.dumps({"status": report["status"], "errors": report["checks"]["errorCount"], "outDir": str(out_dir)}, ensure_ascii=False))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
