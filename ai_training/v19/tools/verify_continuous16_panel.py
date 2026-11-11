#!/usr/bin/env python3
"""只读验证 V19 的 DEV20 / CONFIRM20 连续 16 胜面板证据。"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


MAPS = (
    "(2) Duel.aem",
    "(2) Icy Paths.aem",
    "(2) Liberty Port.aem",
    "(2) Mourningstar.aem",
    "(2) Crossed swords.aem",
)
PANEL_BASE_SEEDS = {"dev": 2609260100, "confirm": 2609260300}
EXPECTED_H0_IDENTITY = "heuristic-seatstream-v1"
EXPECTED_CAPS = {"maxSteps": 12000, "maxPlies": None, "wallTimeoutMs": 900000}
WIN_TARGET = 16
SOURCE_DIGEST_ALIASES = {
    "engine": ("engineSourceSha256", "engineSourceSha", "engineSourceDigest"),
    "policy": ("policySourceSha256", "policySourceSha", "policySourceDigest"),
    "h0": ("heuristicSourceSha256", "heuristicSourceSha", "h0SourceSha256", "h0SourceDigest"),
    "runner": ("runnerSourceSha256", "runnerSourceSha", "runnerSourceDigest"),
}


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_jsonl(paths: Iterable[Path]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []
    for source_index, path in enumerate(paths):
        if not path.is_file():
            raise ValueError(f"输入必须是显式存在的 games.jsonl 文件：{path}")
        file_rows = 0
        with path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, 1):
                if not line.strip():
                    continue
                try:
                    value = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"{path}:{line_number} 不是完整 JSON：{exc}") from exc
                if not isinstance(value, dict):
                    raise ValueError(f"{path}:{line_number} 必须是 JSON 对象")
                value["__source"] = f"{path}:{line_number}"
                value["__source_index"] = source_index
                rows.append(value)
                file_rows += 1
        sources.append({
            "path": str(path.resolve()),
            "bytes": path.stat().st_size,
            "sha256": _file_sha256(path),
            "rows": file_rows,
        })
    return rows, sources


def _expected_entities(panel_role: str) -> set[tuple[str, int, int]]:
    base = PANEL_BASE_SEEDS[panel_role]
    return {
        (map_name, base + 10 * map_index + episode_index, seat)
        for map_index, map_name in enumerate(MAPS)
        for episode_index in range(2)
        for seat in (0, 1)
    }


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value.lower())


def _row_source_digest(row: dict[str, Any], group: str) -> tuple[Any, str | None]:
    """兼容新旧字段；新 SHA 与旧 Digest 并存时不假定两种算法等价。"""
    nested = row.get("sourceDigests")
    if isinstance(nested, dict) and group in nested:
        return nested[group], f"sourceDigests.{group}"
    for key in SOURCE_DIGEST_ALIASES[group]:
        if key in row and not key.endswith("Digest"):
            return row[key], key
    for key in SOURCE_DIGEST_ALIASES[group]:
        if key in row:
            return row[key], key
    return None, None


def _expected_row_sources(identity_path: str | Path | None) -> tuple[dict[str, str], dict[str, Any] | None]:
    """读取显式身份文件；只比较其中可明确对应到 arena 行的逻辑摘要组。"""
    if identity_path is None:
        return {}, None
    path = Path(identity_path)
    if not path.is_file():
        raise ValueError(f"experiment_identity 不存在：{path}")
    raw = path.read_bytes()
    try:
        identity = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"experiment_identity 不是有效 JSON：{path}") from exc
    expected: dict[str, str] = {}
    explicit = identity.get("arenaRowSourceDigests")
    if isinstance(explicit, dict):
        expected.update({key: value for key, value in explicit.items() if key in SOURCE_DIGEST_ALIASES})
    # 中文：不同清单即使使用同一哈希算法也不是同一身份。只有身份文件显式声明
    # arenaRowSourceDigests 时才逐值比较；其余文件闭包由上层冻结审计负责。
    for group, value in expected.items():
        if not _is_sha256(value):
            raise ValueError(f"experiment_identity 的 {group} 行来源摘要不是 SHA-256")
    return expected, {"path": str(path.resolve()), "sha256": hashlib.sha256(raw).hexdigest()}


def _termination_result(row: dict[str, Any], candidate_alliance: int) -> tuple[str | None, str | None]:
    """联合终止类型和胜者重算结果，返回（可信结果，错误原因）。"""
    kind = row.get("outcomeKind")
    winner = row.get("winnerAllianceId")
    if kind == "NATURAL_WIN":
        if winner != candidate_alliance:
            return None, "NATURAL_WIN 的 winnerAllianceId 不属于候选方"
        return kind, None
    if kind == "NATURAL_LOSS":
        if not isinstance(winner, int) or isinstance(winner, bool) or winner < 0:
            return None, "NATURAL_LOSS 缺少有效 winnerAllianceId"
        if winner == candidate_alliance:
            return None, "NATURAL_LOSS 的 winnerAllianceId 却属于候选方"
        return kind, None
    if kind == "NATURAL_DRAW":
        if winner not in (-1, None):
            return None, "NATURAL_DRAW 不应声明获胜联盟"
        return kind, None
    if kind in {"STEP_LIMIT", "PLY_LIMIT", "WALL_TIMEOUT", "CANCELLED"}:
        if winner not in (-1, None):
            return None, f"{kind} 截断结果不应声明获胜联盟"
        if kind == "STEP_LIMIT" and row.get("steps", -1) < EXPECTED_CAPS["maxSteps"]:
            return None, "STEP_LIMIT 尚未达到原子动作上限"
        if kind == "WALL_TIMEOUT" and row.get("wallMs", -1) < EXPECTED_CAPS["wallTimeoutMs"]:
            return None, "WALL_TIMEOUT 尚未达到墙钟上限"
        return kind, None
    return None, f"未知 outcomeKind：{kind!r}"


def verify_panel(
    games_paths: Iterable[str | Path],
    panel_role: str,
    expected_model_sha256: str,
    experiment_identity_path: str | Path | None = None,
    progress_paths: Iterable[str | Path] | None = None,
) -> dict[str, Any]:
    """验证显式给出的文件；函数不会发现目录、通配符或其他面板结果。"""
    if panel_role not in PANEL_BASE_SEEDS:
        raise ValueError("panel_role 必须明确为 dev 或 confirm")
    expected_model_sha256 = expected_model_sha256.lower()
    if len(expected_model_sha256) != 64 or any(c not in "0123456789abcdef" for c in expected_model_sha256):
        raise ValueError("expected_model_sha256 必须是 64 位十六进制 SHA-256")
    paths = [Path(value) for value in games_paths]
    if not paths:
        raise ValueError("至少需要一个显式 games.jsonl 路径")

    expected_row_sources, experiment_identity = _expected_row_sources(experiment_identity_path)
    rows, sources = _read_jsonl(paths)
    errors: list[str] = []
    progress_evidence: list[dict[str, Any]] = []
    trusted_progress_digests: dict[int, dict[str, str]] = {}

    progress_list = [Path(value) for value in progress_paths] if progress_paths is not None else []
    if progress_list:
        if len(paths) != 5 or len(progress_list) != 5 or len(progress_list) != len(paths):
            errors.append("正式五图面板必须为每个 games 分片显式提供且仅提供一份 progress sidecar")
        for progress_path in progress_list:
            if not progress_path.is_file():
                raise ValueError(f"progress sidecar 不存在：{progress_path}")
            raw = progress_path.read_bytes()
            try:
                progress = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ValueError(f"progress sidecar 不是有效 JSON：{progress_path}") from exc
            out_path_value = progress.get("outPath")
            if not isinstance(out_path_value, str) or not Path(out_path_value).is_absolute():
                errors.append(f"{progress_path}：outPath 必须是 games 文件的绝对路径")
                mapped_index = None
            else:
                resolved_out = Path(out_path_value).resolve()
                matches = [index for index, game_path in enumerate(paths) if game_path.resolve() == resolved_out]
                mapped_index = matches[0] if len(matches) == 1 else None
                if mapped_index is None:
                    errors.append(f"{progress_path}：outPath 未精确对应唯一输入 games 文件")
            progress_item = {
                "path": str(progress_path.resolve()),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "outPath": out_path_value,
                "mappedGamesPath": str(paths[mapped_index].resolve()) if mapped_index is not None else None,
                "trusted": False,
                "validationErrors": [],
            }
            progress_evidence.append(progress_item)
            if mapped_index is None:
                progress_item["validationErrors"] = ["outPath 未绑定唯一输入 games 文件"]
                continue
            local_errors: list[str] = []
            shard_rows = [row for row in rows if row.get("__source_index") == mapped_index]
            if progress.get("appendedRows") != len(shard_rows):
                local_errors.append(f"appendedRows={progress.get('appendedRows')!r}，games 行数={len(shard_rows)}")
            if progress.get("checkpointSha256") != expected_model_sha256:
                local_errors.append("checkpointSha256 与冻结模型不一致")
            if progress.get("panelId") != panel_role or progress.get("runMode") != panel_role:
                local_errors.append("panelId/runMode 与明确面板角色不一致")
            if progress.get("failed") != 0:
                local_errors.append("failed 必须为 0")
            if progress.get("policy") != "model":
                local_errors.append("policy 必须明确为 model")
            progress_model_id = progress.get("modelId")
            if (not isinstance(progress_model_id, str) or not progress_model_id
                    or "heuristic" in progress_model_id.lower() or "b100" in progress_model_id.lower()):
                local_errors.append("modelId 不是允许的纯模型身份")
            row_encoders = {row.get("encoderSchema") for row in shard_rows}
            if len(row_encoders) != 1 or progress.get("encoderSchemaId") not in row_encoders:
                local_errors.append("encoderSchemaId 与 games 行不一致")
            progress_caps = progress.get("caps")
            if not isinstance(progress_caps, dict) or {
                "maxSteps": progress_caps.get("maxSteps"),
                "maxPlies": progress_caps.get("maxPlies"),
                "wallTimeoutMs": progress_caps.get("wallTimeoutMs"),
            } != EXPECTED_CAPS:
                local_errors.append("caps 与冻结协议不一致")
            row_blocks = {row.get("blockId") for row in shard_rows}
            progress_blocks = progress.get("blocks")
            if (not isinstance(progress_blocks, list) or len(progress_blocks) != len(set(progress_blocks))
                    or set(progress_blocks) != row_blocks):
                local_errors.append("blocks 未精确对应 games 分片")
            digests = progress.get("sourceDigests")
            if not isinstance(digests, dict) or any(not _is_sha256(digests.get(group)) for group in SOURCE_DIGEST_ALIASES):
                local_errors.append("sourceDigests 必须完整包含四组 SHA-256")
            else:
                for group in ("engine", "policy"):
                    row_values = {row.get(f"{group}SourceDigest") for row in shard_rows}
                    if row_values != {digests[group]}:
                        local_errors.append(f"{group} sourceDigest 与 games 行不一致")
            if local_errors:
                errors.extend(f"{progress_path}：{message}" for message in local_errors)
                progress_item["validationErrors"] = local_errors
            else:
                if mapped_index in trusted_progress_digests:
                    errors.append(f"{progress_path}：同一 games 分片绑定了多份 progress sidecar")
                    progress_item["validationErrors"] = ["同一 games 分片绑定了多份 progress sidecar"]
                else:
                    trusted_progress_digests[mapped_index] = dict(digests)
                    progress_item["trusted"] = True
        if set(trusted_progress_digests) != set(range(len(paths))):
            errors.append("并非每个 games 分片都有一份通过完整绑定校验的 progress sidecar")
    game_ids: list[Any] = []
    entities: list[tuple[Any, Any, Any]] = []
    outcomes: Counter[str] = Counter()
    per_map: dict[str, Counter[str]] = defaultdict(Counter)
    per_seat: dict[str, Counter[str]] = defaultdict(Counter)
    model_shas: set[Any] = set()
    h0_identities: set[Any] = set()
    source_digest_values: dict[str, set[Any]] = {group: set() for group in SOURCE_DIGEST_ALIASES}
    source_digest_schemas: dict[str, set[str | None]] = {group: set() for group in SOURCE_DIGEST_ALIASES}
    fallback_count = 0
    error_count = 0

    for index, row in enumerate(rows):
        source = row.pop("__source")
        source_index = row.pop("__source_index")
        prefix = f"第 {index + 1} 局（{source}）"
        game_id = row.get("gameId")
        game_ids.append(game_id)
        if not isinstance(game_id, str) or not game_id:
            errors.append(f"{prefix}：缺少 gameId")

        if row.get("panelId") != panel_role or row.get("runMode") != panel_role:
            errors.append(f"{prefix}：panelId/runMode 与明确的 {panel_role} 角色不符")
        if row.get("arm") != "CANDIDATE":
            errors.append(f"{prefix}：arm 必须为 CANDIDATE")

        map_name = row.get("mapName")
        seat = row.get("candidateSeat")
        root_seed = row.get("rootSeed")
        entities.append((map_name, root_seed, seat))
        if row.get("subjectSeat") is not None and row.get("subjectSeat") != seat:
            errors.append(f"{prefix}：subjectSeat 与 candidateSeat 不一致")
        if seat not in (0, 1) or row.get("viewedSeat") != seat:
            errors.append(f"{prefix}：候选/观察座位必须一致且为 0 或 1")
        if row.get("seed") != root_seed:
            errors.append(f"{prefix}：seed 与 rootSeed 不一致")

        try:
            map_index = MAPS.index(map_name)
            episode_index = root_seed - PANEL_BASE_SEEDS[panel_role] - 10 * map_index
        except (ValueError, TypeError):
            episode_index = None
        if episode_index not in (0, 1):
            errors.append(f"{prefix}：地图或 rootSeed 不属于冻结 {panel_role.upper()}20 面板")
        else:
            if row.get("episodeIndex") != episode_index:
                errors.append(f"{prefix}：episodeIndex 与 rootSeed 不一致")
            if row.get("blockId") != f"{panel_role}:m{map_index}:s{episode_index}":
                errors.append(f"{prefix}：blockId 与冻结面板不一致")

        sha = row.get("checkpointSha256")
        model_shas.add(sha)
        if sha != expected_model_sha256:
            errors.append(f"{prefix}：checkpointSha256 与冻结模型不一致")
        cache_fields = ((row.get("cacheIdentity") or {}).get("fields") or {})
        if cache_fields.get("checkpointSha256") != expected_model_sha256:
            errors.append(f"{prefix}：cacheIdentity 中的 checkpoint SHA 缺失或不一致")
        encoder_schema = row.get("encoderSchema")
        if (not isinstance(encoder_schema, str) or not encoder_schema
                or "heuristic" in encoder_schema.lower()
                or cache_fields.get("encoderSchemaId") != encoder_schema):
            errors.append(f"{prefix}：模型 encoder schema 缺失、非模型或与 cacheIdentity 不一致")

        h0_values = (row.get("mirrorPolicyVersion"), row.get("rngContract"), cache_fields.get("rngContract"))
        h0_identities.update(h0_values)
        if any(value != EXPECTED_H0_IDENTITY for value in h0_values):
            errors.append(f"{prefix}：H0 identity 缺失或不一致")
        if any(row.get(key) != value for key, value in EXPECTED_CAPS.items()):
            errors.append(f"{prefix}：顶层 caps 与冻结协议不一致")
        cache_caps = {
            "maxSteps": cache_fields.get("maxStepsAtomicActions"),
            "maxPlies": cache_fields.get("maxPliesAtomicActions"),
            "wallTimeoutMs": cache_fields.get("wallTimeoutMs"),
        }
        if cache_caps != EXPECTED_CAPS:
            errors.append(f"{prefix}：cacheIdentity caps 缺失或与冻结协议不一致")

        if row.get("fallbackUsed") is not False or row.get("fallbackReason") not in (None, ""):
            fallback_count += 1
            errors.append(f"{prefix}：发生 fallback 或 fallback 字段不完整")
        if row.get("error") not in (None, ""):
            error_count += 1
            errors.append(f"{prefix}：存在 error")
        requested_policy = row.get("requestedPolicyId")
        actual_policy = row.get("actualPolicyId")
        if not isinstance(requested_policy, str) or not requested_policy or requested_policy != actual_policy:
            errors.append(f"{prefix}：请求策略与实际策略不一致")
        pure_model_ids = {
            "requestedPolicyId": requested_policy,
            "actualPolicyId": actual_policy,
            "modelTag": row.get("modelTag"),
            "cacheIdentity.modelId": cache_fields.get("modelId"),
        }
        for field, value in pure_model_ids.items():
            lowered = value.lower() if isinstance(value, str) else ""
            if not lowered or "heuristic" in lowered or "b100" in lowered:
                errors.append(f"{prefix}：{field} 不是允许的纯模型身份")

        for group in SOURCE_DIGEST_ALIASES:
            digest, digest_schema = _row_source_digest(row, group)
            if digest is None and source_index in trusted_progress_digests:
                digest = trusted_progress_digests[source_index][group]
                digest_schema = "verifiedProgressSidecar"
            try:
                source_digest_values[group].add(digest)
                source_digest_schemas[group].add(digest_schema)
            except TypeError:
                errors.append(f"{prefix}：{group} 来源摘要的多个字段互相冲突")
                continue
            if not _is_sha256(digest):
                errors.append(f"{prefix}：缺少有效的 {group} 来源 SHA-256 摘要")
            elif (digest_schema is not None and not digest_schema.endswith("Digest")
                  and group in expected_row_sources
                  and digest.lower() != expected_row_sources[group].lower()):
                errors.append(f"{prefix}：{group} 来源摘要与 experiment_identity 不一致")
        if cache_fields.get("engineSourceDigest") != row.get("engineSourceDigest"):
            errors.append(f"{prefix}：cacheIdentity 的 engine 来源摘要缺失或不一致")
        if cache_fields.get("policySourceDigest") != row.get("policySourceDigest"):
            errors.append(f"{prefix}：cacheIdentity 的 policy 来源摘要缺失或不一致")

        alliances = row.get("seatAlliances")
        candidate_alliance = row.get("candidateAllianceId")
        if not isinstance(alliances, dict) or alliances.get(str(seat)) != candidate_alliance:
            errors.append(f"{prefix}：candidateAllianceId 与座位联盟映射不一致")
            trusted_kind = None
        else:
            trusted_kind, termination_error = _termination_result(row, candidate_alliance)
            if termination_error:
                errors.append(f"{prefix}：{termination_error}")
        if trusted_kind:
            outcomes[trusted_kind] += 1
            per_map[str(map_name)][trusted_kind] += 1
            per_seat[str(seat)][trusted_kind] += 1

    expected_entities = _expected_entities(panel_role)
    if len(rows) != 20:
        errors.append(f"总局数必须恰为 20，实际 {len(rows)}")
    if len(set(game_ids)) != 20:
        errors.append(f"gameId 必须恰有 20 个非重复值，实际 {len(set(game_ids))}")
    if set(entities) != expected_entities or len(entities) != len(set(entities)):
        errors.append("(mapName, rootSeed, candidateSeat) 未恰好覆盖冻结 20 个实体")

    map_counts = Counter(row.get("mapName") for row in rows)
    seat_counts = Counter(row.get("candidateSeat") for row in rows)
    if map_counts != Counter({name: 4 for name in MAPS}):
        errors.append("五图未做到每图恰好 4 局")
    if seat_counts != Counter({0: 10, 1: 10}):
        errors.append("候选座位未做到每座位恰好 10 局")
    for group, values in source_digest_values.items():
        if (len(values) != 1 or len(source_digest_schemas[group]) != 1
                or not all(_is_sha256(value) for value in values)):
            errors.append(f"20 行的 {group} 来源摘要必须存在且全表唯一")

    valid_panel = not errors
    natural_wins = outcomes["NATURAL_WIN"]
    met = valid_panel and natural_wins >= WIN_TARGET
    role_note = (
        "DEV20 仅用于 checkpoint 筛选；即使达标也不构成独立交付或最终验收。"
        if panel_role == "dev"
        else "本证据明确属于 CONFIRM20 独立面板；只有协议校验全部通过时才能用于确认验收。"
    )
    return {
        "schema": "v19-continuous16-panel-evidence-v1",
        "panelRole": panel_role,
        "panelLabel": panel_role.upper() + "20",
        "roleInterpretation": role_note,
        "inputs": sources,
        "frozenProtocol": {
            "maps": list(MAPS),
            "baseSeed": PANEL_BASE_SEEDS[panel_role],
            "seedsPerMap": 2,
            "seats": [0, 1],
            "caps": EXPECTED_CAPS,
            "h0Identity": EXPECTED_H0_IDENTITY,
            "expectedModelSha256": expected_model_sha256,
        },
        "counts": {
            "games": len(rows),
            "uniqueGameIds": len(set(game_ids)),
            "uniqueEntities": len(set(entities)),
            "byMap": dict(sorted(map_counts.items(), key=lambda item: str(item[0]))),
            "bySeat": {str(key): value for key, value in sorted(seat_counts.items(), key=lambda item: str(item[0]))},
            "trustedOutcomes": dict(sorted(outcomes.items())),
            "fallbacks": fallback_count,
            "errors": error_count,
        },
        "breakdown": {
            "byMap": {name: dict(sorted(per_map[name].items())) for name in MAPS},
            "bySeat": {seat: dict(sorted(per_seat[seat].items())) for seat in ("0", "1")},
        },
        "identity": {
            "checkpointSha256Values": sorted(str(value) for value in model_shas),
            "h0IdentityValues": sorted(str(value) for value in h0_identities),
            "sourceDigests": {
                group: {
                    "schemaFields": sorted(str(value) for value in source_digest_schemas[group]),
                    "values": sorted(str(value) for value in values),
                }
                for group, values in source_digest_values.items()
            },
            "experimentIdentity": experiment_identity,
            "expectedRowSourceDigests": expected_row_sources,
            "progressSidecars": progress_evidence,
            "sourceProvenance": {
                group: (
                    "games行及progress交叉验证"
                    if group in ("engine", "policy") and trusted_progress_digests
                    else "runner完成的progress sidecar"
                    if group in ("h0", "runner") and trusted_progress_digests
                    else "games行"
                )
                for group in SOURCE_DIGEST_ALIASES
            },
        },
        "result": {
            "validPanel": valid_panel,
            "naturalWins": natural_wins,
            "targetNaturalWins": WIN_TARGET,
            "continuous16Met": met,
        },
        "validationErrors": errors,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--games", action="append", required=True, help="显式 games.jsonl 路径；可重复")
    parser.add_argument("--panel-role", required=True, choices=sorted(PANEL_BASE_SEEDS))
    parser.add_argument("--expected-model-sha", required=True)
    parser.add_argument("--experiment-identity", help="可选：显式 experiment_identity.json，用于核对行来源摘要")
    parser.add_argument("--progress", action="append", help="每个 games 分片对应的一份 progress sidecar；正式五图共五份")
    parser.add_argument("--output", help="可选 JSON 证据输出路径；省略则只写标准输出")
    args = parser.parse_args(argv)
    try:
        evidence = verify_panel(
            args.games,
            args.panel_role,
            args.expected_model_sha,
            args.experiment_identity,
            args.progress,
        )
    except (OSError, ValueError) as exc:
        evidence = {
            "schema": "v19-continuous16-panel-evidence-v1",
            "panelRole": args.panel_role,
            "result": {"validPanel": False, "naturalWins": 0, "targetNaturalWins": WIN_TARGET, "continuous16Met": False},
            "validationErrors": [str(exc)],
        }
    rendered = json.dumps(evidence, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    sys.stdout.write(rendered)
    result = evidence.get("result", {})
    return 0 if result.get("validPanel") and result.get("continuous16Met") else 1


if __name__ == "__main__":
    raise SystemExit(main())
