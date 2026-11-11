"""V19/T19-04：真实胜负驱动的 PPO 首轮实现。

与 V18 的 CE 模仿训练的根本区别：这里唯一的策略改进信号来自**主体真实对局的自然胜负**
（`+1 / −1 / 0`，见 `v19/env/subject_episode.ts` 的奖励合同）。截断局没有胜负标签，
因此本实现默认**不把截断局用于梯度**，并在报告里如实给出被排除的局数与 transition 数。

实现要点（对应任务书 T19-04 的首版配方）：
- AdamW，LR=1e-4；PPO clip=0.1；value loss 权重 0.5；entropy 权重 0.01；
- 每批最多 4 个 epoch，minibatch 64，梯度裁剪 0.5；
- gamma=1.0（同一自然胜利不因原子动作多而指数衰减），GAE lambda=0.98；
- 同一批近似 KL > 0.02 立即停止继续重复优化该批，改为重新采样。

数值一致性：策略打分必须与 TS `SpatialResNetPredictor.predict` 逐位同构
（池化 3×32 坐标特征 + 语义 + 全局，再经 pol_dense1/relu/pol_dense2）。
"""

from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "python") not in sys.path:
    sys.path.insert(0, str(ROOT / "python"))

import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402

from behavior_identity import sha256_file, validate_behavior_identity  # noqa: E402
from spatial_resnet_model import SpatialResNet, export_model_to_ts_json, load_model_from_ts_json  # noqa: E402

SPATIAL_H = 20
SPATIAL_W = 20
TRUNK = 32
POLICY_GLOBAL_DIM = 20

#: 形状族 → encoder schema id。与 `python/spatial_resnet_model.py` 的导出校验表保持一致。
SCHEMA_BY_CHANNELS = {
    26: "spatial26_global20_actionSemantics53_v15",
    34: "spatial34_global20_actionSemantics53_v19",
}


def build_model(spatial_channels: int) -> SpatialResNet:
    """按空间通道数构造模型；通道数由数据决定，不再硬编码 26。"""
    return SpatialResNet(
        spatial_channels=spatial_channels, trunk_channels=TRUNK, global_dim=20,
        action_semantic_dim=53, version="spatial-resnet-v2", num_blocks=2,
    )


@dataclass
class Decision:
    """一次主体决策：状态 + 候选 + 行为策略读数。"""

    game_id: str
    map_name: str
    seed: int
    subject_seat: int
    decision_index: int
    turn: int
    spatial: torch.Tensor  # [C, 20, 20]
    globals: torch.Tensor  # [G]
    candidate_coords: List[Tuple[Optional[Tuple[int, int]], Optional[Tuple[int, int]], Optional[Tuple[int, int]]]]
    candidate_semantics: torch.Tensor  # [K, S]
    chosen_index: int
    behavior_log_prob: float
    value: float
    reward: float
    terminal: bool
    truncated: bool
    entropy: float
    checkpoint_sha: Optional[str] = None


@dataclass
class Episode:
    game_id: str
    map_name: str
    seed: int
    subject_seat: int
    outcome_kind: str
    natural_terminal: bool
    truncated: bool
    terminal_return: Optional[float]
    record_capped: bool = False
    decisions: List[Decision] = field(default_factory=list)


def _read_tensor(blob: bytes, offset: int, count: int) -> List[float]:
    need = offset + count * 4
    if need > len(blob):
        raise ValueError(
            f"张量 blob 不完整：需要读到 {need} 字节，实际只有 {len(blob)} 字节。"
            "最常见的原因是这一波**仍在采样中**（transitions 索引先于张量落盘）。"
            "请等采样正常收尾（写出 summary.json）后再训练。"
        )
    return list(struct.unpack_from(f"<{count}f", blob, offset))


def load_wave(wave_dir: Path, key: str) -> List[Episode]:
    transitions_path = wave_dir / f"{key}.transitions.jsonl"
    tensors_path = wave_dir / f"{key}.tensors.f32"
    games_path = wave_dir / f"{key}.games.jsonl"
    for path in (transitions_path, tensors_path, games_path):
        if not path.is_file():
            raise FileNotFoundError(f"缺少波次文件：{path}")

    blob = tensors_path.read_bytes()
    meta_by_game: Dict[str, dict] = {}
    for line in games_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            row = json.loads(line)
            meta_by_game[row["gameId"]] = row

    episodes: Dict[str, Episode] = {}
    for line in transitions_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        game_id = row["gameId"]
        if game_id not in episodes:
            meta = meta_by_game.get(game_id, {})
            episodes[game_id] = Episode(
                game_id=game_id,
                map_name=row["mapName"],
                seed=row["seed"],
                subject_seat=row["subjectSeat"],
                outcome_kind=meta.get("outcomeKind", "UNKNOWN"),
                natural_terminal=bool(meta.get("naturalTerminal")),
                truncated=bool(meta.get("truncated")),
                terminal_return=meta.get("terminalReturn"),
                record_capped=bool(meta.get("recordCapped")),
            )
        channels = int(row["channels"])
        semantic_dim = int(row["semanticDim"])
        global_dim = int(row.get("globalDim") or 20)
        offset = int(row["tensorOffset"])
        spatial_count = channels * SPATIAL_H * SPATIAL_W
        spatial = torch.tensor(_read_tensor(blob, offset, spatial_count), dtype=torch.float32).view(
            channels, SPATIAL_H, SPATIAL_W
        )
        globals_vec = torch.tensor(
            _read_tensor(blob, int(row["globalOffset"]), global_dim), dtype=torch.float32
        )
        offset += spatial_count * 4 + global_dim * 4
        codes = row["orderedActionCodes"]
        semantics = []
        for _ in codes:
            semantics.append(_read_tensor(blob, offset, semantic_dim))
            offset += semantic_dim * 4
        # 坐标直接取落盘值，禁止从 actionCode 反解（解析口径不一致会静默改掉策略输入）。
        coords = []
        for triple in row["candidateCoords"]:
            parsed = []
            for pair in triple:
                x, y = int(pair[0]), int(pair[1])
                parsed.append(None if x < 0 or y < 0 else (x, y))
            coords.append((parsed[0], parsed[1], parsed[2]))
        episodes[game_id].decisions.append(
            Decision(
                game_id=game_id,
                map_name=row["mapName"],
                seed=row["seed"],
                subject_seat=row["subjectSeat"],
                decision_index=int(row["subjectDecisionIndex"]),
                turn=int(row["turn"]),
                spatial=spatial,
                globals=globals_vec,
                candidate_coords=coords,
                candidate_semantics=torch.tensor(semantics, dtype=torch.float32),
                chosen_index=int(row["chosenIndex"]),
                behavior_log_prob=float(row["behaviorLogProb"]),
                value=float(row["value"]),
                reward=float(row["reward"]),
                terminal=bool(row["terminal"]),
                truncated=bool(row["truncated"]),
                entropy=float(row["policyEntropy"]),
                checkpoint_sha=row.get("checkpointSha256"),
            )
        )
    for episode in episodes.values():
        episode.decisions.sort(key=lambda d: d.decision_index)
        # 记录上限的**推断**：早期收集器没有写 recordCapped 字段，但 games.jsonl 里有
        # subjectDecisions。若实际加载到的 transition 少于该局的主体决策数，就说明记录被截断。
        # 不做这个推断会让超长局（实测单局上万次决策）以「奖励全为 0」的伪监督进入梯度，
        # 对自然胜局尤其有害。
        meta = meta_by_game.get(episode.game_id, {})
        subject_decisions = meta.get("subjectDecisions")
        if meta.get("recordCapped") is not None:
            episode.record_capped = bool(meta.get("recordCapped"))
        elif isinstance(subject_decisions, int):
            episode.record_capped = len(episode.decisions) < subject_decisions
    return list(episodes.values())


def masked_log_softmax(logits: torch.Tensor) -> torch.Tensor:
    return F.log_softmax(logits, dim=-1)


def compute_gae(
    rewards: Sequence[float],
    values: Sequence[float],
    terminal: Sequence[bool],
    truncated: Sequence[bool],
    gamma: float = 1.0,
    lam: float = 0.98,
    bootstrap_value: float = 0.0,
) -> Tuple[List[float], List[float]]:
    """GAE(γ, λ)。返回 (advantages, returns)。

    合同：
    - 自然终局步：bootstrap = 0（不存在真实 winner 时禁止写终局 z）。
    - 截断步：bootstrap = bootstrap_value（由调用方显式给出，默认 0 且必须被标记）。
    - 中间步：bootstrap = V(s_{t+1})。
    """
    n = len(rewards)
    advantages = [0.0] * n
    returns = [0.0] * n
    next_value = 0.0
    next_advantage = 0.0
    for t in range(n - 1, -1, -1):
        if terminal[t]:
            next_value = 0.0
            next_advantage = 0.0
        elif truncated[t]:
            next_value = bootstrap_value
            next_advantage = 0.0
        else:
            next_value = values[t + 1] if t + 1 < n else bootstrap_value
        delta = rewards[t] + gamma * next_value - values[t]
        next_advantage = delta + gamma * lam * next_advantage
        advantages[t] = next_advantage
        returns[t] = advantages[t] + values[t]
    return advantages, returns


def policy_features_for_batch(
    model: SpatialResNet,
    z: torch.Tensor,
    globals_batch: torch.Tensor,
    decisions: Sequence[Decision],
) -> List[torch.Tensor]:
    """按 TS 的候选打分口径构造每个决策的候选特征矩阵 [K, pol_in_dim]。

    注意：这里返回的是**特征**，不是 logits；logits 必须再经 `forward_action_logits`
    （pol_dense1/relu/pol_dense2）。把两者混用会让策略分布完全错误。
    """
    out: List[torch.Tensor] = []
    semantic_dim = model.action_semantic_dim
    for b, decision in enumerate(decisions):
        z_b = z[b]  # [32, 20, 20]
        glob = globals_batch[b][:POLICY_GLOBAL_DIM]
        rows = []
        for ci, (actor, landing, target) in enumerate(decision.candidate_coords):
            feats = []
            for coord in (actor, landing, target):
                if coord is None:
                    feats.append(torch.zeros(TRUNK, dtype=z_b.dtype))
                else:
                    x, y = coord
                    if 0 <= x < SPATIAL_W and 0 <= y < SPATIAL_H:
                        feats.append(z_b[:, y, x])
                    else:
                        feats.append(torch.zeros(TRUNK, dtype=z_b.dtype))
            sem = decision.candidate_semantics[ci][:semantic_dim]
            if sem.numel() < semantic_dim:
                sem = torch.cat([sem, torch.zeros(semantic_dim - sem.numel(), dtype=sem.dtype)])
            rows.append(torch.cat([feats[0], feats[1], feats[2], sem, glob]))
        out.append(torch.stack(rows, dim=0))
    return out


def evaluate_batch(
    model: SpatialResNet,
    decisions: Sequence[Decision],
) -> Tuple[List[torch.Tensor], torch.Tensor, torch.Tensor]:
    spatial = torch.stack([d.spatial for d in decisions], dim=0)
    globals_batch = torch.stack([d.globals for d in decisions], dim=0)
    z = model.forward_trunk(spatial)
    values = model.forward_value(z, globals_batch[:, : model.global_dim]).squeeze(-1)
    features_list = policy_features_for_batch(model, z, globals_batch, decisions)
    logits_list = [model.forward_action_logits(feats) for feats in features_list]
    return logits_list, values, z


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wave-dir", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--init-checkpoint", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--tag", default="ppo_w1")
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--clip", type=float, default=0.1)
    parser.add_argument("--value-weight", type=float, default=0.5)
    parser.add_argument("--entropy-weight", type=float, default=0.01)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--minibatch", type=int, default=64)
    parser.add_argument("--grad-clip", type=float, default=0.5)
    parser.add_argument("--gamma", type=float, default=1.0)
    parser.add_argument("--lam", type=float, default=1.0,
                        help="GAE lambda。首版取 1.0（纯蒙特卡洛优势）：一局有数百次主体决策，"
                             "lambda=0.98 会让最早决策的优势被 0.98^k 衰减到近乎为 0，"
                             "与任务书“gamma=1 使同一自然胜利不因动作多而被指数衰减”的目的冲突。"
                             "0.98 作为可选变体保留。")
    parser.add_argument("--kl-stop", type=float, default=0.02)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--include-truncated", action="store_true",
                        help="默认关闭：截断局没有真实胜负标签，不用于梯度")
    parser.add_argument("--run-id", default="run_20260929_v19_02",
                        help="谱系账本所在的运行目录名（v19/out/<runId>/lineage.json）")
    parser.add_argument("--wave-id", default=None,
                        help="本波标识（写进可恢复状态与谱系）；默认取 --key")
    parser.add_argument("--lineage-kind", default="continuous",
                        choices=["continuous", "value_warmup_branch", "rollback",
                                 "exploration_start", "diagnostic_branch"],
                        help="这条谱系边的性质。continuous = θk → 新采样 → θk+1 的连续训练链；"
                             "diagnostic_branch = 从同一 θk 分出的诊断对照（不属于连续链）；"
                             "value_warmup_branch / rollback / exploration_start = 显式声明的旁支")
    parser.add_argument("--baseline", default="sampling", choices=["sampling", "recompute"],
                        help="优势基线身份。sampling（默认）= 采样时冻结的 critic，标准 on-policy PPO；"
                             "recompute = 用初始化模型重算（只在预热后重新采样的谱系里使用）")
    parser.add_argument("--constant-baseline-from", default=None,
                        help="独立价值验证的常数基线来源（上一波数据目录）；缺省则退回本波均值并标注为同分布常数")
    parser.add_argument("--constant-baseline-key", default=None)
    parser.add_argument("--phase-weighting", default="uniform", choices=["uniform", "equalized"],
                        help="阶段权重。uniform（默认）= 每条决策等权，即历史配方；"
                             "equalized = 按开局/中盘/后期三个桶各占 1/3 总权重重新加权。"
                             "这会**改变训练目标**（不是标准 PPO 的天然正确答案），必须在报告里公开权重。")
    parser.add_argument("--expected-behavior-sha", default=None,
                        help="可选的采样行为模型 SHA-256；缺省时以 transitions/games/summary 三方一致值为准")
    args = parser.parse_args()
    if args.wave_id is None:
        args.wave_id = args.key

    torch.manual_seed(args.seed)
    wave_dir = Path(args.wave_dir)
    out_dir = Path(args.out_dir)
    init_sha = sha256_file(ROOT / args.init_checkpoint)
    behavior_identity = validate_behavior_identity(
        wave_dir=wave_dir,
        key=args.key,
        init_checkpoint_sha256=init_sha,
        lineage_kind=args.lineage_kind,
        expected_behavior_sha256=args.expected_behavior_sha,
    )
    behavior_shas = {behavior_identity.behavior_sha256}
    print(f"[PPO] 行为身份通过：sha={behavior_identity.behavior_sha256[:12]}… "
          f"transitions={behavior_identity.transition_rows} games={behavior_identity.game_rows} "
          f"chainVerified={behavior_identity.chain_verified}")
    out_dir.mkdir(parents=True, exist_ok=True)

    episodes = load_wave(wave_dir, args.key)
    # 记录被上限截断的局：如果它**有真实胜负**，就把真实终局回报归到最后一条已记录的
    # transition 上（超长局实测单局上万次决策，而自然胜局是最稀缺的训练信号）。
    # 截断局（没有 winner）仍然一律排除，绝不伪造胜负标签。
    capped_natural = []
    capped_truncated = []
    for episode in episodes:
        if not episode.record_capped:
            continue
        if episode.natural_terminal and episode.decisions:
            last = episode.decisions[-1]
            last.reward = float(episode.terminal_return or 0.0)
            last.terminal = True
            last.truncated = False
            capped_natural.append(episode)
        else:
            capped_truncated.append(episode)
    usable = [e for e in episodes if not e.record_capped or e in capped_natural]
    used = [e for e in usable if e.natural_terminal or args.include_truncated]
    excluded = [e for e in usable if e not in used]
    decisions_used = sum(len(e.decisions) for e in used)
    decisions_excluded = sum(len(e.decisions) for e in excluded + capped_truncated)

    model = build_model(int(episodes[0].decisions[0].spatial.shape[0]) if used and used[0].decisions
                        else 26)
    load_model_from_ts_json(model, str(ROOT / args.init_checkpoint))
    model.train()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)

    # 每个 epoch 前重新计算行为策略读数（ratio 起点应为 1）。
    report: Dict[str, object] = {
        "schema": "v19_ppo_run_1",
        "waveDir": str(wave_dir).replace("\\", "/"),
        "key": args.key,
        "initCheckpoint": args.init_checkpoint,
        "identityVerified": behavior_identity.identity_verified,
        "behaviorCheckpointSha256": [behavior_identity.behavior_sha256],
        "behaviorIdentity": behavior_identity.report(args.expected_behavior_sha),
        "hyperparameters": {
            "lr": args.lr, "clip": args.clip, "valueWeight": args.value_weight,
            "entropyWeight": args.entropy_weight, "epochs": args.epochs,
            "minibatch": args.minibatch, "gradClip": args.grad_clip,
            "gamma": args.gamma, "lam": args.lam, "klStop": args.kl_stop,
            "includeTruncated": bool(args.include_truncated),
        },
        "data": {
            "episodesTotal": len(episodes),
            "episodesUsed": len(used),
            "episodesExcluded": len(excluded),
            "episodesRecordCapped": len(capped_natural) + len(capped_truncated),
            "episodesRecordCappedNaturalCredited": len(capped_natural),
            "episodesRecordCappedTruncatedExcluded": len(capped_truncated),
            "decisionsUsed": decisions_used,
            "decisionsExcluded": decisions_excluded,
            "exclusionReason": "截断局没有引擎 winner，不写终局 z；记录被上限截断且**没有**真实胜负的局"
                               "同样排除。记录被截断但有真实胜负的局，把真实终局回报归到最后一条已记录"
                               "transition 上并单独计数（超长局上万次决策，自然胜局是最稀缺信号）。"
                               "所有被排除的局都保留在分母里。",
            "byOutcome": {},
        },
        "epochs": [],
    }
    by_outcome: Dict[str, int] = {}
    for e in episodes:
        by_outcome[e.outcome_kind] = by_outcome.get(e.outcome_kind, 0) + 1
    report["data"]["byOutcome"] = by_outcome

    print(f"[PPO] episodes={len(episodes)} used={len(used)} excluded={len(excluded)} "
          f"decisions={decisions_used}")

    # 预先算好每个决策的回报（GAE 按 episode 内顺序）。
    adv_map: Dict[Tuple[str, int], float] = {}
    ret_map: Dict[Tuple[str, int], float] = {}
    for episode in used:
        rewards = [d.reward for d in episode.decisions]
        values = [d.value for d in episode.decisions]
        terminal = [d.terminal for d in episode.decisions]
        truncated = [d.truncated for d in episode.decisions]
        advantages, returns = compute_gae(rewards, values, terminal, truncated,
                                         gamma=args.gamma, lam=args.lam, bootstrap_value=0.0)
        for d, a, r in zip(episode.decisions, advantages, returns):
            adv_map[(d.game_id, d.decision_index)] = a
            ret_map[(d.game_id, d.decision_index)] = r

    all_decisions = [d for e in used for d in e.decisions]
    n = len(all_decisions)
    if n == 0:
        raise SystemExit("[PPO] 没有可用于梯度的 transition；拒绝生成空训练报告。")

    # 更新前对账。这里必须把两件事**分开**，否则会误判：
    #   1) 策略对账（强制）：Python 重算的 log_prob / 熵必须等于 TS 采样时的读数。
    #      它同时验证跨语言前向一致，以及「一批数据更新前 ratio 应约 1」。
    #   2) 价值对账（有条件）：只有当**初始化检查点就是采样时的行为检查点**时，
    #      critic 读数才应当一致。若本轮故意换了 critic（例如先做价值预热），
    #      价值必然不同 —— 这是预期内的差异，必须如实报告，而不是当成口径错误。
    value_parity_required = (not behavior_shas) or (init_sha in behavior_shas)

    parity = {"checked": 0, "maxAbsLogProbDiff": 0.0, "maxAbsEntropyDiff": 0.0,
              "maxAbsValueDiff": 0.0, "maxAbsRatioDeviation": 0.0,
              "initCheckpointSha256": init_sha,
              "behaviorCheckpointSha256": sorted(behavior_shas),
              "valueParityRequired": value_parity_required,
              "valueParityNote": (
                  "初始化检查点就是采样时的行为检查点 ⇒ critic 读数也必须一致。"
                  if value_parity_required else
                  "初始化检查点与采样时的行为检查点不同（例如本轮先做了价值预热）⇒ "
                  "critic 读数必然不同，这是预期内的差异；策略读数仍然必须一致。"
              )}
    with torch.no_grad():
        for start in range(0, n, 128):
            batch = all_decisions[start:start + 128]
            logits_list, values, _ = evaluate_batch(model, batch)
            for logits, value, decision in zip(logits_list, values, batch):
                log_probs = masked_log_softmax(logits)
                py_log_prob = float(log_probs[decision.chosen_index])
                py_entropy = float(-(log_probs.exp() * log_probs).sum())
                parity["checked"] += 1
                parity["maxAbsLogProbDiff"] = max(
                    parity["maxAbsLogProbDiff"], abs(py_log_prob - decision.behavior_log_prob))
                parity["maxAbsEntropyDiff"] = max(
                    parity["maxAbsEntropyDiff"], abs(py_entropy - decision.entropy))
                parity["maxAbsValueDiff"] = max(
                    parity["maxAbsValueDiff"], abs(float(value) - decision.value))
                parity["maxAbsRatioDeviation"] = max(
                    parity["maxAbsRatioDeviation"],
                    abs(math.exp(py_log_prob - decision.behavior_log_prob) - 1.0))
    parity["policyParityPassed"] = (
        parity["maxAbsLogProbDiff"] < 1e-4 and parity["maxAbsEntropyDiff"] < 1e-3
    )
    parity["valueParityPassed"] = parity["maxAbsValueDiff"] < 1e-4
    parity["passed"] = parity["policyParityPassed"] and (
        parity["valueParityPassed"] or not value_parity_required)
    report["preUpdateParity"] = parity
    print(f"[PPO] 更新前对账 checked={parity['checked']} "
          f"maxΔlogProb={parity['maxAbsLogProbDiff']:.2e} maxΔH={parity['maxAbsEntropyDiff']:.2e} "
          f"maxΔV={parity['maxAbsValueDiff']:.2e} max|ratio-1|={parity['maxAbsRatioDeviation']:.2e} "
          f"policyPassed={parity['policyParityPassed']} valueRequired={value_parity_required} "
          f"valuePassed={parity['valueParityPassed']} passed={parity['passed']}")
    if not parity["passed"]:
        raise SystemExit(
            "[PPO] 拒绝训练：策略读数与 TS 采样时不一致，说明策略输入或前向口径不同。"
            "先修一致性问题，不允许在错误的策略分布上更新。"
        )

    index = list(range(n))
    del index

    # 独立价值验证（对应复核 A.4）：在**任何使用本波标签的更新之前**，先给初始化模型的 critic
    # 在本波自然对局上打分。θk 的 critic 从未见过本波标签，因此这是真正的样本外读数。
    # 常数基线优先取「上一波训练分布」的均值（--constant-baseline-from），没有上一波时
    # 才退回本波均值，并明确标注它是同分布常数（较弱）。
    reference_returns = None
    if args.constant_baseline_from:
        ref_dir = Path(args.constant_baseline_from)
        ref_key = args.constant_baseline_key or ref_dir.name
        try:
            ref_episodes = load_wave(ref_dir, ref_key)
            ref_returns = [float(e.terminal_return) for e in ref_episodes
                           if e.natural_terminal and e.terminal_return is not None]
            if ref_returns:
                reference_returns = ref_returns
        except Exception as exc:  # noqa: BLE001 —— 参考分布缺失要如实记录，不静默降级
            print(f"[PPO][WARN] 无法读取参考分布 {ref_dir}/{ref_key}：{exc}")

    value_targets = torch.tensor([ret_map[(d.game_id, d.decision_index)] for d in all_decisions],
                                 dtype=torch.float32)
    sampled_values = torch.tensor([d.value for d in all_decisions], dtype=torch.float32)
    if reference_returns:
        constant = float(sum(reference_returns) / len(reference_returns))
        constant_source = "previousWaveTrainingDistribution"
    else:
        constant = float(value_targets.mean())
        constant_source = "sameWaveMean(inSampleWeaker)"
    mse_critic = float(((sampled_values - value_targets) ** 2).mean())
    mse_constant = float(((value_targets - constant) ** 2).mean())

    # 按 map / 阶段 / episode 分解，便于看出 critic 在哪些分布上不可靠。
    def _grouped_value_report(key_fn) -> Dict[str, dict]:
        groups: Dict[str, List[int]] = {}
        for i, decision in enumerate(all_decisions):
            groups.setdefault(key_fn(decision), []).append(i)
        out: Dict[str, dict] = {}
        for name, idx_list in sorted(groups.items()):
            idx = torch.tensor(idx_list)
            out[name] = {
                "decisions": len(idx_list),
                "mseCritic": float(((sampled_values[idx] - value_targets[idx]) ** 2).mean()),
                "meanPredicted": float(sampled_values[idx].mean()),
                "meanActual": float(value_targets[idx].mean()),
            }
        return out

    value_validation = {
        "note": "θk 的 critic 在本波自然对局上的样本外读数；在任何使用本波标签的更新之前计算。",
        "criticIdentity": "samplingTimeFrozen（就是本波采样时记录的 value）",
        "initCheckpointSha256": init_sha,
        "behaviorCheckpointSha256": sorted(behavior_shas),
        "decisions": n,
        "episodes": len(used),
        "mseCritic": mse_critic,
        "mseConstant": mse_constant,
        "constantValue": constant,
        "constantSource": constant_source,
        "improvementVsConstant": ((mse_constant - mse_critic) / mse_constant) if mse_constant > 0 else None,
        "byMap": _grouped_value_report(lambda d: d.map_name),
        "byPhase": _grouped_value_report(
            lambda d: "early(<=5)" if d.turn <= 5 else ("mid(6..15)" if d.turn <= 15 else "late(>15)")),
    }
    report["valueValidation"] = value_validation
    _improvement = value_validation["improvementVsConstant"]
    print(f"[PPO] 独立价值验证（更新前）decisions={n} mseCritic={mse_critic:.5f} "
          f"mseConstant={mse_constant:.5f}（{constant_source}）"
          f" 改善={'n/a（常数基线 MSE 为 0，说明本波结局全同）' if _improvement is None else f'{_improvement:.4f}'}")

    # 优势基线身份（对应复核 A.1）：默认使用**采样时冻结的** critic 读数，
    # 这是标准 on-policy PPO 做法，old logprob 与优势都来自同一个行为策略。
    # `--baseline recompute` 会用初始化模型重算优势 —— 只在「预热后重新采样」的流程里才有意义；
    # 在同批终局上拟合 critic 再回填同批优势会引入同批偏差，这里显式拒绝那种用法。
    if args.baseline == "recompute":
        if value_parity_required:
            raise SystemExit(
                "[PPO] 拒绝 --baseline recompute：初始化检查点就是采样时的行为检查点，"
                "重算优势不会改变任何东西，只会掩盖真实的数据流。"
            )
        with torch.no_grad():
            recomputed = []
            for start in range(0, n, 128):
                batch = all_decisions[start:start + 128]
                _, values, _ = evaluate_batch(model, batch)
                recomputed.extend(float(v) for v in values)
        if len(recomputed) != n:
            raise SystemExit("[PPO] 优势基线重算长度不一致，拒绝继续。")
        print(f"[PPO] 使用 --baseline recompute：用初始化模型的 critic 重建优势"
              f"（最大 |ΔV|={max(abs(a - b) for a, b in zip(recomputed, sampled_values.tolist())):.4f}）")
        for i, decision in enumerate(all_decisions):
            decision.value = recomputed[i]
        adv_map.clear()
        ret_map.clear()
        for episode in used:
            rewards = [d.reward for d in episode.decisions]
            values = [d.value for d in episode.decisions]
            terminal = [d.terminal for d in episode.decisions]
            truncated = [d.truncated for d in episode.decisions]
            advantages, returns = compute_gae(rewards, values, terminal, truncated,
                                             gamma=args.gamma, lam=args.lam, bootstrap_value=0.0)
            for d, a, r in zip(episode.decisions, advantages, returns):
                adv_map[(d.game_id, d.decision_index)] = a
                ret_map[(d.game_id, d.decision_index)] = r
    baseline_identity = {
        "mode": args.baseline,
        "description": (
            "采样时冻结的 critic（行为策略的 value）；old logprob 与优势来自同一行为策略。"
            if args.baseline == "sampling" else
            "用初始化模型重算的优势（仅用于「预热后重新采样」的谱系；同批拟合回填被拒绝）。"
        ),
        "valueParityRequired": value_parity_required,
    }
    report["advantageBaseline"] = baseline_identity

    kl_stop_events: List[dict] = []
    updates_performed = 0
    kl_exceeded = False

    # 阶段权重（R2 修正臂）。复核要求：若改动训练权重，必须公开它如何改变目标，
    # 并且不得把「每条决策等权」当作标准 PPO 的天然正确答案。
    def phase_of(turn: int) -> str:
        if turn <= 5:
            return "early(<=5)"
        if turn <= 15:
            return "mid(6..15)"
        return "late(>15)"

    phase_counts: Dict[str, int] = {}
    for d in all_decisions:
        phase_counts[phase_of(d.turn)] = phase_counts.get(phase_of(d.turn), 0) + 1
    if args.phase_weighting == "equalized":
        n_phases = len(phase_counts)
        weights_by_phase = {
            p: (n / (n_phases * c)) if c > 0 else 0.0 for p, c in phase_counts.items()
        }
    else:
        weights_by_phase = {p: 1.0 for p in phase_counts}
    decision_weight = torch.tensor(
        [weights_by_phase.get(phase_of(d.turn), 1.0) for d in all_decisions], dtype=torch.float32)
    weight_report = {
        "mode": args.phase_weighting,
        "phaseCounts": phase_counts,
        "phaseShares": {p: c / n for p, c in phase_counts.items()},
        "weightsByPhase": weights_by_phase,
        "effectiveGradientShareByPhase": {
            p: (phase_counts[p] * weights_by_phase.get(p, 1.0))
               / sum(c * weights_by_phase.get(q, 1.0) for q, c in phase_counts.items())
            for p in phase_counts
        },
        "objectiveChanged": args.phase_weighting != "uniform",
        "note": "uniform = 每条决策等权（历史配方）；equalized = 三个阶段各占 1/3 总权重。"
                "两者目标不同，不能互相冒充；这是复核 R2 要求的预定义对照。",
    }
    report["phaseWeighting"] = weight_report
    print(f"[PPO] 阶段权重 mode={args.phase_weighting} 计数={phase_counts} "
          f"权重={ {k: round(v, 3) for k, v in weights_by_phase.items()} } "
          f"梯度份额={ {k: round(v, 3) for k, v in weight_report['effectiveGradientShareByPhase'].items()} }")

    for epoch in range(1, args.epochs + 1):
        if kl_exceeded:
            # 复核 A.3：KL 一旦超限，**本批后续所有 epoch 都不再更新**。
            report["epochs"].append({"epoch": epoch, "stopReason": "SKIPPED_AFTER_KL_STOP",
                                     "batches": 0})
            print(f"[PPO] epoch {epoch} 跳过：上一轮已触发 KL 早停（本批不再更新）。")
            continue
        torch.manual_seed(args.seed + epoch)
        perm = torch.randperm(n).tolist()
        sums = {"policy": 0.0, "value": 0.0, "entropy": 0.0, "kl": 0.0, "clipFrac": 0.0,
                "ratioAbsDev": 0.0, "batches": 0.0, "policyGradNorm": 0.0, "valueGradNorm": 0.0}
        stop_reason = "EPOCH_COMPLETE"
        for start in range(0, n, args.minibatch):
            batch_idx = perm[start:start + args.minibatch]
            batch = [all_decisions[i] for i in batch_idx]
            logits_list, values, _ = evaluate_batch(model, batch)
            log_probs = [masked_log_softmax(l) for l in logits_list]
            new_log_prob = torch.stack([lp[d.chosen_index] for lp, d in zip(log_probs, batch)])
            old_log_prob = torch.tensor([d.behavior_log_prob for d in batch], dtype=torch.float32)
            ratio = torch.exp(new_log_prob - old_log_prob)
            advantage = torch.tensor([adv_map[(d.game_id, d.decision_index)] for d in batch],
                                     dtype=torch.float32)
            advantage = (advantage - advantage.mean()) / (advantage.std() + 1e-8)
            unclipped = ratio * advantage
            clipped = torch.clamp(ratio, 1.0 - args.clip, 1.0 + args.clip) * advantage
            batch_weight = torch.tensor([decision_weight[i] for i in batch_idx], dtype=torch.float32)
            weight_sum = batch_weight.sum().clamp_min(1e-8)
            policy_loss = -((torch.min(unclipped, clipped) * batch_weight).sum() / weight_sum)

            entropy = torch.stack([-(lp.exp() * lp).sum() for lp in log_probs]).mean()
            returns = torch.tensor([ret_map[(d.game_id, d.decision_index)] for d in batch],
                                   dtype=torch.float32)
            value_loss = (((values - returns) ** 2) * batch_weight).sum() / weight_sum
            loss = policy_loss + args.value_weight * value_loss - args.entropy_weight * entropy

            approx_kl = ((ratio - 1.0) - (new_log_prob - old_log_prob)).mean()
            clip_frac = ((ratio - 1.0).abs() > args.clip).float().mean()

            # 复核 A.3：KL 判断必须在 optimizer.step() **之前**。
            # 旧实现在 step 之后判断，于是「已超限的那一次更新照样生效」，
            # 而且 break 只退出内层 minibatch 循环，外层 epoch 仍继续更新
            # （pilot 的 metrics 就是第 1 轮 KL=0.0214 标 KL_STOP、第 2 轮仍更新了 1 个 batch）。
            if float(approx_kl) > args.kl_stop:
                kl_exceeded = True
                stop_reason = f"KL_STOP_BEFORE_STEP(approxKl={float(approx_kl):.4f}>{args.kl_stop})"
                kl_stop_events.append({
                    "epoch": epoch, "batchStart": start, "approxKl": float(approx_kl),
                    "updatesPerformedSoFar": updates_performed,
                    "action": "skipped this optimizer.step and all remaining epochs",
                })
                print(f"[PPO][KL] epoch {epoch} batch@{start} approxKl={float(approx_kl):.4f} > "
                      f"{args.kl_stop}：跳过本次更新并停止本批所有后续 epoch"
                      f"（已完成更新 {updates_performed} 次）。")
                break

            optimizer.zero_grad()
            loss.backward()
            policy_grad = 0.0
            value_grad = 0.0
            for name, param in model.named_parameters():
                if param.grad is None:
                    continue
                norm = float(param.grad.detach().norm())
                if name.startswith("pol_"):
                    policy_grad += norm
                elif name.startswith("val_"):
                    value_grad += norm
            torch.nn.utils.clip_grad_norm_(model.parameters(), args.grad_clip)
            optimizer.step()
            updates_performed += 1

            sums["policy"] += float(policy_loss)
            sums["value"] += float(value_loss)
            sums["entropy"] += float(entropy)
            sums["kl"] += float(approx_kl)
            sums["clipFrac"] += float(clip_frac)
            sums["ratioAbsDev"] += float((ratio - 1.0).abs().mean())
            sums["policyGradNorm"] += policy_grad
            sums["valueGradNorm"] += value_grad
            sums["batches"] += 1

        batches = max(1.0, sums["batches"])
        epoch_row = {
            "epoch": epoch,
            "stopReason": stop_reason,
            "policyLoss": sums["policy"] / batches,
            "valueLoss": sums["value"] / batches,
            "entropy": sums["entropy"] / batches,
            "approxKl": sums["kl"] / batches,
            "clipFraction": sums["clipFrac"] / batches,
            "meanAbsRatioDeviation": sums["ratioAbsDev"] / batches,
            "policyGradNorm": sums["policyGradNorm"] / batches,
            "valueGradNorm": sums["valueGradNorm"] / batches,
            "batches": int(sums["batches"]),
        }
        report["epochs"].append(epoch_row)
        print(f"[PPO] epoch {epoch} polLoss={epoch_row['policyLoss']:.5f} valLoss={epoch_row['valueLoss']:.5f} "
              f"entropy={epoch_row['entropy']:.4f} kl={epoch_row['approxKl']:.5f} "
              f"clipFrac={epoch_row['clipFraction']:.4f} ratioDev={epoch_row['meanAbsRatioDeviation']:.5f} "
              f"polGrad={epoch_row['policyGradNorm']:.4f} {stop_reason}")

    model.eval()
    out_model = out_dir / f"{args.tag}.json"
    channels = int(model.spatial_channels)
    schema_id = SCHEMA_BY_CHANNELS.get(channels)
    if schema_id is None:
        raise SystemExit(f"未登记的空间通道数 {channels}：拒绝导出一个 schema 身份不明的检查点。")
    export_model_to_ts_json(model, str(out_model), encoder_schema_id=schema_id)
    import hashlib
    sha = hashlib.sha256(out_model.read_bytes()).hexdigest()
    report["output"] = {"path": str(out_model).replace("\\", "/"), "sha256": sha,
                        "encoderSchemaId": schema_id, "channels": channels}
    report["klStop"] = {
        "threshold": args.kl_stop,
        "events": kl_stop_events,
        "exitedAllRemainingEpochs": bool(kl_stop_events),
        "updatesPerformed": updates_performed,
    }

    # 可恢复训练状态 + 谱系（对应复核 A.5）：
    # 除 TS 推理 JSON 外，另存 optimizer、已完成更新数、RNG、waveId 与行为/输出 SHA。
    # 下一波采样器必须用本波的输出 SHA；谱系账本记录每一跳，禁止静默改起点。
    state_path = out_dir / f"{args.tag}.train_state.pt"
    torch.save({
        "schema": "v19_ppo_train_state_1",
        "waveId": args.wave_id,
        "behaviorCheckpointSha256": sorted(behavior_shas),
        "outputCheckpointSha256": sha,
        "outputPath": str(out_model).replace("\\", "/"),
        "initCheckpoint": args.init_checkpoint,
        "initCheckpointSha256": init_sha,
        "updatesPerformed": updates_performed,
        "epochsRequested": args.epochs,
        "epochsCompleted": len([e for e in report["epochs"] if e.get("batches", 0) > 0]),
        "klStopEvents": kl_stop_events,
        "optimizer": optimizer.state_dict(),
        "model": model.state_dict(),
        "rng": {"torch": torch.get_rng_state()},
        "hyperparameters": report["hyperparameters"],
        "identityVerified": behavior_identity.identity_verified,
    }, state_path)
    report["resumableState"] = {
        "path": str(state_path).replace("\\", "/"),
        "waveId": args.wave_id,
        "updatesPerformed": updates_performed,
        "nextWaveMustUseOutputSha256": sha,
    }
    lineage_path = ROOT / "v19" / "out" / args.run_id / "lineage.json"
    lineage_path.parent.mkdir(parents=True, exist_ok=True)
    lineage = json.loads(lineage_path.read_text(encoding="utf-8")) if lineage_path.is_file() else {
        "schema": "v19_lineage_1", "runId": args.run_id, "edges": [],
    }
    lineage["edges"].append({
        "waveId": args.wave_id,
        "kind": args.lineage_kind,
        "initCheckpoint": args.init_checkpoint,
        "initCheckpointSha256": init_sha,
        "behaviorCheckpointSha256": sorted(behavior_shas),
        "outputCheckpointSha256": sha,
        "outputPath": str(out_model).replace("\\", "/"),
        "identityVerified": behavior_identity.identity_verified,
        "chainVerified": behavior_identity.chain_verified,
        "chainNote": (
            "初始化检查点就是本波采样的行为检查点 ⇒ 谱系连续（θk → 新采样 → θk+1）。"
            if behavior_identity.chain_verified and args.lineage_kind == "continuous" else (
            "初始化检查点与行为检查点相同，但该边被显式分类为旁支，不计入 continuous 主链。"
            if behavior_identity.chain_verified else
            "初始化检查点**不是**本波采样的行为检查点：这是一条显式声明的旁支边"
            "（例如 value-only 预热或回滚），必须写明理由，不能当作连续训练。"
            )
        ),
        "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    })
    lineage_path.write_text(json.dumps(lineage, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report["lineage"] = lineage["edges"][-1]
    print(f"[PPO] 谱系：init={init_sha[:12]}… behavior={[s[:12] for s in sorted(behavior_shas)]} "
          f"output={sha[:12]}… chainVerified={report['lineage']['chainVerified']}")

    report["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    (out_dir / f"{args.tag}.metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[PPO] -> {out_model} sha256={sha[:16]}…")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
