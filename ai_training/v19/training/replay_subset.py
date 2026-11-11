"""从多个历史波次构造有界、确定性的离策略自然终局回放子集。

本模块只读取既有采样产物。它不会把回放数据重新定义为 on-policy 样本，
也不会修改任何历史文件。元数据逐行扫描，只有 reservoir 留下的样本才从
tensor blob 随机读取实际张量。
"""

from __future__ import annotations

import hashlib
import heapq
import json
import mmap
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterator, List, Literal, Sequence, Tuple

import torch

from behavior_identity import BehaviorIdentity, validate_behavior_identity
from ppo import Decision, POLICY_GLOBAL_DIM, SPATIAL_H, SPATIAL_W


SPATIAL_CHANNELS = 34
ACTION_SEMANTIC_DIM = 53
Phase = Literal["opening", "midgame", "late"]
Split = Literal["train", "holdout"]


@dataclass(frozen=True)
class ReplaySource:
    """一个真实采样波次；不同波次允许使用不同的行为模型。"""

    wave_dir: Path
    key: str


@dataclass
class ReplaySample:
    """一个保留的离策略回放决策及其自然终局标签。"""

    decision: Decision
    natural_return: float
    phase: Phase
    family_id: str
    split: Split
    behavior_sha256: str
    source_key: str
    ordered_action_codes: Tuple[str, ...]
    chosen_action_code: str
    behavior_value: float


@dataclass
class ReplaySubset:
    samples: List[ReplaySample]
    manifest: Dict[str, object]


@dataclass(frozen=True)
class _GameMeta:
    natural_return: float
    map_name: str
    seed: int


@dataclass(frozen=True)
class _SelectedRow:
    source_index: int
    source_key: str
    behavior_sha256: str
    game_id: str
    phase: Phase
    family_id: str
    split: Split
    priority: int
    row: Dict[str, object]
    natural_return: float


def _json_lines(path: Path) -> Iterator[Tuple[int, Dict[str, object]]]:
    """逐行读取 JSONL，避免 read_text/read_bytes 的整文件副本。"""

    if not path.is_file():
        raise FileNotFoundError(f"缺少回放文件：{path}")
    with path.open("r", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path.name} 第 {line_number} 行 JSON 损坏：{exc.msg}") from exc
            if not isinstance(row, dict):
                raise ValueError(f"{path.name} 第 {line_number} 行必须是 JSON 对象")
            yield line_number, row


def _phase(turn: int) -> Phase:
    if turn <= 5:
        return "opening"
    if turn <= 15:
        return "midgame"
    return "late"


def _family_id(map_name: str, seed: int) -> str:
    return f"map={map_name}|seed={seed}"


def _family_split(family_id: str, modulus: int, holdout_buckets: int) -> Split:
    digest = hashlib.sha256(family_id.encode("utf-8")).digest()
    bucket = int.from_bytes(digest[:8], "big") % modulus
    return "holdout" if bucket < holdout_buckets else "train"


def _priority(source: ReplaySource, game_id: str, phase: Phase, decision_index: int, seed: int) -> int:
    token = f"{seed}\0{source.wave_dir.resolve()}\0{source.key}\0{game_id}\0{phase}\0{decision_index}"
    return int.from_bytes(hashlib.sha256(token.encode("utf-8")).digest(), "big")


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _summary_behavior_sha(source: ReplaySource) -> str:
    path = source.wave_dir / f"{source.key}.summary.json"
    if not path.is_file():
        raise FileNotFoundError(f"缺少回放 summary：{path}")
    with path.open("r", encoding="utf-8") as stream:
        summary = json.load(stream)
    if not isinstance(summary, dict) or not isinstance(summary.get("behaviorCheckpointSha256"), str):
        raise ValueError(f"{path} 缺少 behaviorCheckpointSha256")
    return str(summary["behaviorCheckpointSha256"])


def _validate_source(source: ReplaySource) -> BehaviorIdentity:
    """复用生产门禁逐波校验；diagnostic_branch 不要求跨波行为 SHA 相同。"""

    declared_sha = _summary_behavior_sha(source)
    return validate_behavior_identity(
        wave_dir=source.wave_dir,
        key=source.key,
        init_checkpoint_sha256=declared_sha,
        lineage_kind="diagnostic_branch",
        expected_behavior_sha256=declared_sha,
    )


def _read_games(path: Path, stats: Dict[str, int]) -> Tuple[Dict[str, _GameMeta], str]:
    eligible: Dict[str, _GameMeta] = {}
    seen = set()
    digest = hashlib.sha256()
    for line_number, row in _json_lines(path):
        digest.update(json.dumps(row, sort_keys=True, separators=(",", ":")).encode("utf-8"))
        digest.update(b"\n")
        stats["games_scanned"] += 1
        game_id = row.get("gameId")
        if not isinstance(game_id, str) or not game_id:
            raise ValueError(f"{path.name} 第 {line_number} 行缺少 gameId")
        if game_id in seen:
            raise ValueError(f"{path.name} 出现重复 gameId：{game_id}")
        seen.add(game_id)
        natural = row.get("naturalTerminal") is True
        truncated = row.get("truncated") is True
        terminal_return = row.get("terminalReturn")
        valid_return = (
            not isinstance(terminal_return, bool)
            and isinstance(terminal_return, (int, float))
            and float(terminal_return) in (-1.0, 0.0, 1.0)
        )
        if truncated:
            stats["games_excluded_truncated"] += 1
            continue
        if not natural:
            stats["games_excluded_non_natural"] += 1
            continue
        if not valid_return:
            stats["games_excluded_missing_return"] += 1
            continue
        map_name = row.get("mapName")
        seed = row.get("seed")
        if not isinstance(map_name, str) or not isinstance(seed, int) or isinstance(seed, bool):
            raise ValueError(f"{path.name} 第 {line_number} 行缺少有效 mapName/seed")
        eligible[game_id] = _GameMeta(float(terminal_return), map_name, seed)
        stats["games_eligible"] += 1
    return eligible, digest.hexdigest()


def _require_int(row: Dict[str, object], name: str, where: str) -> int:
    value = row.get(name)
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{where} 缺少整数 {name}")
    return value


def _select_rows(
    source_index: int,
    source: ReplaySource,
    identity: BehaviorIdentity,
    games: Dict[str, _GameMeta],
    cap: int,
    modulus: int,
    holdout_buckets: int,
    reservoir_seed: int,
    reservoirs: Dict[Tuple[int, str, Phase], List[Tuple[int, int, _SelectedRow]]],
    stats: Dict[str, int],
) -> str:
    path = source.wave_dir / f"{source.key}.transitions.jsonl"
    serial = 0
    digest = hashlib.sha256()
    for line_number, row in _json_lines(path):
        digest.update(json.dumps(row, sort_keys=True, separators=(",", ":")).encode("utf-8"))
        digest.update(b"\n")
        stats["transitions_scanned"] += 1
        game_id = row.get("gameId")
        if not isinstance(game_id, str) or not game_id:
            raise ValueError(f"{path.name} 第 {line_number} 行缺少 gameId")
        meta = games.get(game_id)
        if meta is None:
            stats["transitions_excluded_game"] += 1
            continue
        map_name = row.get("mapName")
        seed = row.get("seed")
        if map_name != meta.map_name or seed != meta.seed:
            raise ValueError(f"局 {game_id} 的 transitions 与 games 家族字段不一致")
        turn = _require_int(row, "turn", f"{path.name}:{line_number}")
        decision_index = _require_int(row, "subjectDecisionIndex", f"{path.name}:{line_number}")
        phase = _phase(turn)
        family_id = _family_id(meta.map_name, meta.seed)
        selected = _SelectedRow(
            source_index=source_index,
            source_key=source.key,
            behavior_sha256=identity.behavior_sha256,
            game_id=game_id,
            phase=phase,
            family_id=family_id,
            split=_family_split(family_id, modulus, holdout_buckets),
            priority=_priority(source, game_id, phase, decision_index, reservoir_seed),
            row=row,
            natural_return=meta.natural_return,
        )
        bucket = reservoirs.setdefault((source_index, game_id, phase), [])
        item = (-selected.priority, -serial, selected)
        serial += 1
        stats["transitions_eligible"] += 1
        if len(bucket) < cap:
            heapq.heappush(bucket, item)
        elif item > bucket[0]:
            heapq.heapreplace(bucket, item)
            stats["transitions_reservoir_discarded"] += 1
        else:
            stats["transitions_reservoir_discarded"] += 1
    return digest.hexdigest()


def _unpack_floats(blob: mmap.mmap, offset: int, count: int, where: str) -> Tuple[float, ...]:
    if offset < 0 or count < 0 or offset + count * 4 > len(blob):
        raise ValueError(f"{where} 张量越界：offset={offset} count={count} blob={len(blob)}")
    return struct.unpack_from(f"<{count}f", blob, offset)


def _coords(value: object, candidate_count: int, where: str):
    if not isinstance(value, list) or len(value) != candidate_count:
        raise ValueError(f"{where} candidateCoords 数量与动作码不一致")
    result = []
    for triple in value:
        if not isinstance(triple, list) or len(triple) != 3:
            raise ValueError(f"{where} candidateCoords 结构错误")
        parsed = []
        for pair in triple:
            if not isinstance(pair, list) or len(pair) != 2:
                raise ValueError(f"{where} candidateCoords 坐标结构错误")
            x, y = int(pair[0]), int(pair[1])
            parsed.append(None if x < 0 or y < 0 else (x, y))
        result.append((parsed[0], parsed[1], parsed[2]))
    return result


def _materialize(selected: _SelectedRow, blob: mmap.mmap) -> ReplaySample:
    row = selected.row
    where = f"{selected.source_key}:{selected.game_id}:{row.get('subjectDecisionIndex')}"
    channels = _require_int(row, "channels", where)
    semantic_dim = _require_int(row, "semanticDim", where)
    global_dim = _require_int(row, "globalDim", where)
    if (channels, semantic_dim, global_dim) != (SPATIAL_CHANNELS, ACTION_SEMANTIC_DIM, POLICY_GLOBAL_DIM):
        raise ValueError(
            f"{where} 张量形状必须为 channels=34/semantic=53/global=20，"
            f"实际 {channels}/{semantic_dim}/{global_dim}"
        )
    codes_value = row.get("orderedActionCodes")
    if not isinstance(codes_value, list) or not codes_value or not all(isinstance(code, str) for code in codes_value):
        raise ValueError(f"{where} orderedActionCodes 无效")
    codes = tuple(codes_value)
    chosen_index = _require_int(row, "chosenIndex", where)
    if chosen_index < 0 or chosen_index >= len(codes):
        raise ValueError(f"{where} chosenIndex 越界")
    chosen_code = row.get("chosenActionCode")
    if chosen_code != codes[chosen_index]:
        raise ValueError(f"{where} chosenActionCode 与 chosenIndex 不一致")
    checkpoint_sha = row.get("checkpointSha256")
    if checkpoint_sha != selected.behavior_sha256:
        raise ValueError(f"{where} behavior SHA 与逐波身份校验结果不一致")

    tensor_offset = _require_int(row, "tensorOffset", where)
    global_offset = _require_int(row, "globalOffset", where)
    tensor_bytes = _require_int(row, "tensorBytes", where)
    spatial_count = SPATIAL_CHANNELS * SPATIAL_H * SPATIAL_W
    spatial_bytes = spatial_count * 4
    if global_offset != tensor_offset + spatial_bytes:
        raise ValueError(f"{where} globalOffset 与空间张量尾部不连续")
    semantic_offset = global_offset + POLICY_GLOBAL_DIM * 4
    expected_bytes = spatial_bytes + POLICY_GLOBAL_DIM * 4 + len(codes) * ACTION_SEMANTIC_DIM * 4
    if tensor_bytes != expected_bytes:
        raise ValueError(f"{where} tensorBytes 不匹配：{tensor_bytes} != {expected_bytes}")
    spatial = torch.tensor(
        _unpack_floats(blob, tensor_offset, spatial_count, where), dtype=torch.float32,
    ).view(SPATIAL_CHANNELS, SPATIAL_H, SPATIAL_W)
    globals_vec = torch.tensor(
        _unpack_floats(blob, global_offset, POLICY_GLOBAL_DIM, where), dtype=torch.float32,
    )
    semantics_flat = _unpack_floats(blob, semantic_offset, len(codes) * ACTION_SEMANTIC_DIM, where)
    semantics = torch.tensor(semantics_flat, dtype=torch.float32).view(len(codes), ACTION_SEMANTIC_DIM)
    candidate_coords = _coords(row.get("candidateCoords"), len(codes), where)
    behavior_value_raw = row.get("behaviorValue", row.get("value"))
    if isinstance(behavior_value_raw, bool) or not isinstance(behavior_value_raw, (int, float)):
        raise ValueError(f"{where} 缺少 behaviorValue/value")
    behavior_value = float(behavior_value_raw)

    decision = Decision(
        game_id=selected.game_id,
        map_name=str(row["mapName"]),
        seed=_require_int(row, "seed", where),
        subject_seat=_require_int(row, "subjectSeat", where),
        decision_index=_require_int(row, "subjectDecisionIndex", where),
        turn=_require_int(row, "turn", where),
        spatial=spatial,
        globals=globals_vec,
        candidate_coords=candidate_coords,
        candidate_semantics=semantics,
        chosen_index=chosen_index,
        behavior_log_prob=float(row["behaviorLogProb"]),
        value=behavior_value,
        reward=float(row.get("reward", 0.0)),
        terminal=bool(row.get("terminal")),
        truncated=bool(row.get("truncated")),
        entropy=float(row.get("policyEntropy", 0.0)),
        checkpoint_sha=selected.behavior_sha256,
    )
    return ReplaySample(
        decision=decision,
        natural_return=selected.natural_return,
        phase=selected.phase,
        family_id=selected.family_id,
        split=selected.split,
        behavior_sha256=selected.behavior_sha256,
        source_key=selected.source_key,
        ordered_action_codes=codes,
        chosen_action_code=str(chosen_code),
        behavior_value=behavior_value,
    )


def load_replay_subset(
    sources: Sequence[ReplaySource],
    *,
    max_per_game_phase: int = 32,
    holdout_modulus: int = 5,
    holdout_buckets: int = 1,
    reservoir_seed: int = 42,
) -> ReplaySubset:
    """读取多个波次的确定性离策略子集和可审计统计。"""

    if not sources:
        raise ValueError("至少需要一个 ReplaySource")
    if max_per_game_phase <= 0:
        raise ValueError("max_per_game_phase 必须为正整数")
    if holdout_modulus <= 1 or not 0 < holdout_buckets < holdout_modulus:
        raise ValueError("holdout bucket 参数无效")
    stats = {
        "games_scanned": 0,
        "games_eligible": 0,
        "games_excluded_truncated": 0,
        "games_excluded_non_natural": 0,
        "games_excluded_missing_return": 0,
        "transitions_scanned": 0,
        "transitions_eligible": 0,
        "transitions_excluded_game": 0,
        "transitions_reservoir_discarded": 0,
    }
    reservoirs: Dict[Tuple[int, str, Phase], List[Tuple[int, int, _SelectedRow]]] = {}
    source_reports = []
    for source_index, source in enumerate(sources):
        identity = _validate_source(source)
        games_path = source.wave_dir / f"{source.key}.games.jsonl"
        transitions_path = source.wave_dir / f"{source.key}.transitions.jsonl"
        summary_path = source.wave_dir / f"{source.key}.summary.json"
        tensors_path = source.wave_dir / f"{source.key}.tensors.f32"
        games, games_metadata_sha = _read_games(games_path, stats)
        transitions_metadata_sha = _select_rows(
            source_index, source, identity, games, max_per_game_phase,
            holdout_modulus, holdout_buckets, reservoir_seed, reservoirs, stats,
        )
        tensor_stat = tensors_path.stat()
        metadata_digest = hashlib.sha256(json.dumps({
            "gamesMetadataSha256": games_metadata_sha,
            "transitionsMetadataSha256": transitions_metadata_sha,
            "summarySha256": _file_sha256(summary_path),
            "tensorBytes": tensor_stat.st_size,
            "tensorMtimeNs": tensor_stat.st_mtime_ns,
        }, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        source_reports.append({
            "waveDir": str(source.wave_dir),
            "key": source.key,
            "behaviorCheckpointSha256": identity.behavior_sha256,
            "identityVerified": identity.identity_verified,
            "lineageKind": "diagnostic_branch",
            "sourceMetadataSha256": metadata_digest,
            "gamesMetadataSha256": games_metadata_sha,
            "transitionsMetadataSha256": transitions_metadata_sha,
            "tensorFile": {"bytes": tensor_stat.st_size, "mtimeNs": tensor_stat.st_mtime_ns},
        })

    selected_rows = [item[2] for bucket in reservoirs.values() for item in bucket]
    selected_rows.sort(key=lambda item: (
        item.family_id, item.source_index, item.game_id, item.phase,
        _require_int(item.row, "subjectDecisionIndex", item.game_id),
    ))
    by_source: Dict[int, List[_SelectedRow]] = {}
    for row in selected_rows:
        by_source.setdefault(row.source_index, []).append(row)
    samples: List[ReplaySample] = []
    selected_tensor_shas: Dict[int, str] = {}
    for source_index, rows in by_source.items():
        tensor_path = sources[source_index].wave_dir / f"{sources[source_index].key}.tensors.f32"
        if not tensor_path.is_file():
            raise FileNotFoundError(f"缺少回放 tensor blob：{tensor_path}")
        with tensor_path.open("rb") as stream:
            if stream.seek(0, 2) == 0:
                raise ValueError(f"tensor blob 为空：{tensor_path}")
            stream.seek(0)
            with mmap.mmap(stream.fileno(), length=0, access=mmap.ACCESS_READ) as blob:
                selected_digest = hashlib.sha256()
                for row in rows:
                    offset = _require_int(row.row, "tensorOffset", row.game_id)
                    byte_count = _require_int(row.row, "tensorBytes", row.game_id)
                    if offset < 0 or byte_count <= 0 or offset + byte_count > len(blob):
                        raise ValueError(f"{row.game_id} 保留张量越界")
                    selected_digest.update(struct.pack("<QQ", offset, byte_count))
                    selected_digest.update(blob[offset:offset + byte_count])
                    samples.append(_materialize(row, blob))
                selected_tensor_shas[source_index] = selected_digest.hexdigest()
    for source_index, report in enumerate(source_reports):
        report["selectedTensorSha256"] = selected_tensor_shas.get(
            source_index, hashlib.sha256(b"").hexdigest(),
        )
    samples.sort(key=lambda sample: (
        sample.family_id, sample.source_key, sample.decision.game_id,
        sample.decision.decision_index,
    ))
    phase_counts = {phase: sum(sample.phase == phase for sample in samples)
                    for phase in ("opening", "midgame", "late")}
    split_counts = {split: sum(sample.split == split for sample in samples)
                    for split in ("train", "holdout")}
    train_families = {sample.family_id for sample in samples if sample.split == "train"}
    holdout_families = {sample.family_id for sample in samples if sample.split == "holdout"}
    overlap = sorted(train_families & holdout_families)
    if overlap:
        raise AssertionError(f"train/holdout 家族发生泄漏：{overlap[:5]}")
    map_phase_outcome: Dict[str, Dict[str, Dict[str, int]]] = {}
    outcome_name = {-1.0: "loss", 0.0: "draw", 1.0: "win"}
    for sample in samples:
        phase_counts_for_map = map_phase_outcome.setdefault(sample.decision.map_name, {})
        outcomes = phase_counts_for_map.setdefault(sample.phase, {"win": 0, "draw": 0, "loss": 0})
        outcomes[outcome_name[sample.natural_return]] += 1
    index_digest = hashlib.sha256()
    for row in selected_rows:
        index_digest.update(json.dumps({
            "sourceMetadataSha256": source_reports[row.source_index]["sourceMetadataSha256"],
            "key": row.source_key,
            "gameId": row.game_id,
            "decisionIndex": row.row.get("subjectDecisionIndex"),
            "tensorOffset": row.row.get("tensorOffset"),
            "tensorBytes": row.row.get("tensorBytes"),
            "phase": row.phase,
            "family": row.family_id,
            "split": row.split,
            "naturalReturn": row.natural_return,
        }, sort_keys=True, separators=(",", ":")).encode("utf-8"))
        index_digest.update(b"\n")
    manifest: Dict[str, object] = {
        "schema": "v19_replay_subset_1",
        "dataRole": "off_policy_natural_outcome_replay",
        "sources": source_reports,
        "maxPerGamePhase": max_per_game_phase,
        "reservoirSeed": reservoir_seed,
        "dataIndexSha256": index_digest.hexdigest(),
        "holdout": {"modulus": holdout_modulus, "buckets": holdout_buckets},
        "familySplit": {
            "trainFamilies": len(train_families),
            "holdoutFamilies": len(holdout_families),
            "overlapCount": 0,
            "verifiedDisjoint": True,
        },
        "mapPhaseOutcomeCounts": map_phase_outcome,
        "stats": {
            **stats,
            "selected": len(samples),
            "phaseCounts": phase_counts,
            "splitCounts": split_counts,
            "families": len({sample.family_id for sample in samples}),
        },
    }
    return ReplaySubset(samples=samples, manifest=manifest)
