"""V19 PPO 训练波的行为模型身份校验。

只扫描元数据，不读取张量 blob，也不修改历史产物。生产 PPO 必须能从
transitions、games 与 summary 三处得到同一个、完整的 SHA-256。
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterator, Optional, Tuple


_SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")


class BehaviorIdentityError(ValueError):
    """训练波行为身份不完整或互相矛盾。"""


@dataclass(frozen=True)
class BehaviorIdentity:
    """已核验的单一行为模型身份及扫描计数。"""

    behavior_sha256: str
    transition_rows: int
    game_rows: int
    transition_games: int
    identity_verified: bool
    chain_verified: bool

    def report(self, expected_behavior_sha256: Optional[str]) -> Dict[str, object]:
        return {
            "identityVerified": self.identity_verified,
            # 保持既有报告的数组形状，但严格校验后这里只能有一个元素。
            "behaviorCheckpointSha256": [self.behavior_sha256],
            "expectedBehaviorSha256": expected_behavior_sha256,
            "transitionRows": self.transition_rows,
            "gameRows": self.game_rows,
            "transitionGames": self.transition_games,
            "chainVerified": self.chain_verified,
        }


def sha256_file(path: Path) -> str:
    """流式计算文件 SHA-256，避免把检查点整体读入内存。"""

    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _valid_sha(value: object, where: str) -> str:
    if not isinstance(value, str) or _SHA256_RE.fullmatch(value) is None:
        raise BehaviorIdentityError(f"{where} 缺少合法的 64 位 SHA-256")
    return value.lower()


def _json_lines(path: Path, label: str) -> Iterator[Tuple[int, Dict[str, object]]]:
    if not path.is_file():
        raise BehaviorIdentityError(f"缺少 {label} 文件：{path}")
    with path.open("r", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise BehaviorIdentityError(
                    f"{label} 第 {line_number} 行不是合法 JSON：{exc.msg}"
                ) from exc
            if not isinstance(value, dict):
                raise BehaviorIdentityError(f"{label} 第 {line_number} 行必须是 JSON 对象")
            yield line_number, value


def validate_behavior_identity(
    wave_dir: Path,
    key: str,
    init_checkpoint_sha256: str,
    lineage_kind: str,
    expected_behavior_sha256: Optional[str] = None,
) -> BehaviorIdentity:
    """严格核验一个 PPO 训练波的单一行为模型身份。

    continuous 边必须由初始化模型亲自采样。显式旁支可以从不同检查点
    初始化，但仍必须保持训练波内部只有一个行为模型。
    """

    init_sha = _valid_sha(init_checkpoint_sha256, "初始化检查点")
    expected_sha = (
        _valid_sha(expected_behavior_sha256, "--expected-behavior-sha")
        if expected_behavior_sha256 is not None
        else None
    )
    transitions_path = wave_dir / f"{key}.transitions.jsonl"
    games_path = wave_dir / f"{key}.games.jsonl"
    summary_path = wave_dir / f"{key}.summary.json"

    transition_shas = set()
    transition_game_ids = set()
    transition_rows = 0
    for line_number, row in _json_lines(transitions_path, "transitions"):
        transition_rows += 1
        transition_shas.add(_valid_sha(
            row.get("checkpointSha256"),
            f"transitions 第 {line_number} 行 checkpointSha256",
        ))
        game_id = row.get("gameId")
        if not isinstance(game_id, str) or not game_id:
            raise BehaviorIdentityError(f"transitions 第 {line_number} 行缺少非空 gameId")
        transition_game_ids.add(game_id)
    if transition_rows == 0:
        raise BehaviorIdentityError("transitions 没有可核验的记录")
    if len(transition_shas) != 1:
        raise BehaviorIdentityError(
            f"transitions 必须只有一个行为 SHA，实际为 {sorted(transition_shas)}"
        )

    game_shas = set()
    game_ids = set()
    game_rows = 0
    for line_number, row in _json_lines(games_path, "games"):
        game_rows += 1
        game_shas.add(_valid_sha(
            row.get("behaviorCheckpointSha256"),
            f"games 第 {line_number} 行 behaviorCheckpointSha256",
        ))
        game_id = row.get("gameId")
        if not isinstance(game_id, str) or not game_id:
            raise BehaviorIdentityError(f"games 第 {line_number} 行缺少非空 gameId")
        if game_id in game_ids:
            raise BehaviorIdentityError(f"games 出现重复 gameId：{game_id}")
        game_ids.add(game_id)
    if game_rows == 0:
        raise BehaviorIdentityError("games 没有可核验的记录")
    if len(game_shas) != 1:
        raise BehaviorIdentityError(f"games 必须只有一个行为 SHA，实际为 {sorted(game_shas)}")

    missing_games = transition_game_ids - game_ids
    if missing_games:
        preview = sorted(missing_games)[:5]
        raise BehaviorIdentityError(
            f"有 {len(missing_games)} 个 transition gameId 不在 games 中：{preview}"
        )

    if not summary_path.is_file():
        raise BehaviorIdentityError(f"缺少 summary 文件：{summary_path}")
    try:
        with summary_path.open("r", encoding="utf-8") as stream:
            summary = json.load(stream)
    except json.JSONDecodeError as exc:
        raise BehaviorIdentityError(f"summary 不是合法 JSON：{exc.msg}") from exc
    if not isinstance(summary, dict):
        raise BehaviorIdentityError("summary 必须是 JSON 对象")
    summary_sha = _valid_sha(summary.get("behaviorCheckpointSha256"), "summary behaviorCheckpointSha256")

    transition_sha = next(iter(transition_shas))
    game_sha = next(iter(game_shas))
    if transition_sha != game_sha or transition_sha != summary_sha:
        raise BehaviorIdentityError(
            "行为 SHA 三方不一致："
            f"transitions={transition_sha} games={game_sha} summary={summary_sha}"
        )
    if expected_sha is not None and transition_sha != expected_sha:
        raise BehaviorIdentityError(
            f"行为 SHA 与 --expected-behavior-sha 不一致：实际 {transition_sha}，预期 {expected_sha}"
        )
    if lineage_kind == "continuous" and transition_sha != init_sha:
        raise BehaviorIdentityError(
            "continuous 谱系要求初始化检查点就是采样行为模型："
            f"behavior={transition_sha} init={init_sha}"
        )

    return BehaviorIdentity(
        behavior_sha256=transition_sha,
        transition_rows=transition_rows,
        game_rows=game_rows,
        transition_games=len(transition_game_ids),
        identity_verified=True,
        # 延续既有语义：chainVerified 是 init 是否等于事实行为 SHA；kind 另行区分主链与旁支。
        chain_verified=transition_sha == init_sha,
    )
