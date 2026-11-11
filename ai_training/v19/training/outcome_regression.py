"""V19 有限离策略结果加权策略回归。

只使用旧 wave2/wave3 的自然终局轨迹更新策略头。该方法不是 PPO；stem、残差骨干和
value 头全部冻结，因此 critic 函数严格不变。holdout 只监测加权 NLL 与动作变化，不能
解释为独立棋力证据。
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import random
import sys
from collections import Counter, OrderedDict, defaultdict
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Literal, Sequence, Tuple

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "python") not in sys.path:
    sys.path.insert(0, str(ROOT / "python"))
if str(ROOT / "v19" / "training") not in sys.path:
    sys.path.insert(0, str(ROOT / "v19" / "training"))

import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402

from ppo import SCHEMA_BY_CHANNELS, build_model, evaluate_batch  # noqa: E402
from spatial_resnet_model import export_model_to_ts_json, load_model_from_ts_json  # noqa: E402

WeightMode = Literal["uniform", "advantage"]

THETA1_PATH = "v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json"
THETA1_SHA256 = "0089afe67e14462819bcc80601180e690327c40400b1aa9bd0bad03f19a30b47"
DEFAULT_SOURCES = (
    ("v19/out/run_20260929_v19_02/data/wave2", "w2"),
    ("v19/out/run_20260929_v19_02/data/wave3", "w3"),
)
DEFAULT_UPDATES = 800
BATCH_SIZE = 64
LEARNING_RATE = 2e-5
BETA = 0.5
MAX_WEIGHT = 20.0
KL_COEFFICIENT = 0.1
KL_STOP = 0.02
GRAD_CLIP = 0.5
SEED = 42
TORCH_THREADS = 4
STATE_INTERVAL = 25


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_sha256(value: object) -> str:
    text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def compute_raw_weights(
    natural_returns: torch.Tensor,
    behavior_values: torch.Tensor,
    mode: WeightMode,
    beta: float = BETA,
    max_weight: float = MAX_WEIGHT,
) -> torch.Tensor:
    """计算离策略结果权重；归一化留给当前批次处理。"""
    if mode == "uniform":
        return torch.ones_like(natural_returns, dtype=torch.float32)
    if mode != "advantage":
        raise ValueError(f"未知权重模式：{mode}")
    if beta <= 0 or max_weight <= 0:
        raise ValueError("beta 和 max_weight 必须为正数")
    advantage = (natural_returns.float() - behavior_values.float()) / beta
    return torch.exp(advantage).clamp(max=max_weight)


def normalize_batch_weights(raw_weights: torch.Tensor) -> torch.Tensor:
    """让每批权重均值为1，避免两臂仅因梯度尺度不同而失去可比性。"""
    if raw_weights.numel() == 0 or not torch.isfinite(raw_weights).all():
        raise ValueError("权重必须是非空有限张量")
    mean = raw_weights.mean()
    if not torch.isfinite(mean) or float(mean) <= 0:
        raise ValueError("权重均值必须为正数")
    return raw_weights / mean


def outcome_regression_objective(
    current_logits: Sequence[torch.Tensor],
    reference_logits: Sequence[torch.Tensor],
    chosen_indices: Sequence[int],
    normalized_weights: torch.Tensor,
    kl_coefficient: float = KL_COEFFICIENT,
) -> Tuple[torch.Tensor, Dict[str, torch.Tensor]]:
    """合法候选 softmax 上的加权 NLL 加冻结初始策略 KL。"""
    if not (len(current_logits) == len(reference_logits) == len(chosen_indices) == normalized_weights.numel()):
        raise ValueError("logits、动作索引与权重批量长度不一致")
    if not current_logits:
        raise ValueError("空批次不能计算目标")
    nll_rows: List[torch.Tensor] = []
    kl_rows: List[torch.Tensor] = []
    for current, reference, chosen in zip(current_logits, reference_logits, chosen_indices):
        if current.ndim != 1 or reference.ndim != 1 or current.shape != reference.shape or current.numel() == 0:
            raise ValueError("每条样本的当前/参考 logits 必须是一维同形非空张量")
        if chosen < 0 or chosen >= current.numel():
            raise ValueError(f"chosen_index 越界：{chosen}/{current.numel()}")
        current_logp = F.log_softmax(current.float(), dim=0)
        reference_logp = F.log_softmax(reference.detach().float(), dim=0)
        reference_prob = reference_logp.exp()
        nll_rows.append(-current_logp[chosen])
        kl_rows.append(torch.sum(reference_prob * (reference_logp - current_logp)))
    nll = torch.stack(nll_rows)
    mean_kl = torch.stack(kl_rows).mean()
    policy_loss = torch.mean(normalized_weights.to(nll.device) * nll)
    total = policy_loss + kl_coefficient * mean_kl
    if not torch.isfinite(total):
        raise FloatingPointError("结果加权目标出现非有限值")
    return total, {"policy_loss": policy_loss, "mean_kl": mean_kl, "mean_nll": nll.mean()}


def mean_reference_kl(
    current_logits: Sequence[torch.Tensor],
    reference_logits: Sequence[torch.Tensor],
) -> torch.Tensor:
    """计算冻结初始策略到当前策略的平均合法候选KL。"""
    if len(current_logits) != len(reference_logits) or not current_logits:
        raise ValueError("当前/参考 logits 批量必须同长且非空")
    rows: List[torch.Tensor] = []
    for current, reference in zip(current_logits, reference_logits):
        if current.shape != reference.shape or current.ndim != 1:
            raise ValueError("当前/参考 logits 必须是一维同形张量")
        current_logp = F.log_softmax(current.float(), dim=0)
        reference_logp = F.log_softmax(reference.detach().float(), dim=0)
        rows.append(torch.sum(reference_logp.exp() * (reference_logp - current_logp)))
    return torch.stack(rows).mean()


def freeze_policy_head_only(model: torch.nn.Module) -> List[torch.nn.Parameter]:
    """冻结 trunk 与 value，只返回两个策略全连接层的可训练参数。"""
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    trainable: List[torch.nn.Parameter] = []
    for module in (model.pol_dense1, model.pol_dense2):
        for parameter in module.parameters():
            parameter.requires_grad_(True)
            trainable.append(parameter)
    return trainable


def fixed_checkpoint_steps(updates: int) -> Tuple[int, ...]:
    """正式训练只在真实完成400/800步后导出；smoke在真实完成末步导出。"""
    if updates <= 0:
        raise ValueError("updates 必须为正数")
    formal = tuple(step for step in (400, 800) if step <= updates)
    return formal if formal else (updates,)


class BalancedBatchSampler:
    """按地图、阶段和家族的当前批次计数贪心等额采样，允许有放回。"""

    def __init__(self, samples: Sequence[Any], seed: int = SEED):
        if not samples:
            raise ValueError("训练样本不能为空")
        self.samples = list(samples)
        self.rng = random.Random(seed)
        self.by_map_phase_family: Dict[str, Dict[str, Dict[str, List[Any]]]] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(list))
        )
        for sample in self.samples:
            map_name = str(sample.decision.map_name)
            phase = str(sample.phase)
            family = str(sample.family_id)
            self.by_map_phase_family[map_name][phase][family].append(sample)
        self.maps = sorted(self.by_map_phase_family)
        self.last_counts: Dict[str, Dict[str, int]] = {"map": {}, "mapPhase": {}, "mapPhaseFamily": {}}

    def sample(self, batch_size: int = BATCH_SIZE) -> List[Any]:
        if batch_size <= 0:
            raise ValueError("batch_size 必须为正数")
        map_counts: Dict[str, int] = defaultdict(int)
        phase_counts: Dict[Tuple[str, str], int] = defaultdict(int)
        family_counts: Dict[Tuple[str, str, str], int] = defaultdict(int)
        batch: List[Any] = []
        for _ in range(batch_size):
            minimum_map = min(map_counts[name] for name in self.maps)
            candidate_maps = [name for name in self.maps if map_counts[name] == minimum_map]
            map_name = self.rng.choice(candidate_maps)
            phases = sorted(self.by_map_phase_family[map_name])
            minimum_phase = min(phase_counts[(map_name, name)] for name in phases)
            candidate_phases = [name for name in phases if phase_counts[(map_name, name)] == minimum_phase]
            phase = self.rng.choice(candidate_phases)
            families = sorted(self.by_map_phase_family[map_name][phase])
            minimum_family = min(family_counts[(map_name, phase, name)] for name in families)
            candidate_families = [
                name for name in families if family_counts[(map_name, phase, name)] == minimum_family
            ]
            family = self.rng.choice(candidate_families)
            sample = self.rng.choice(self.by_map_phase_family[map_name][phase][family])
            batch.append(sample)
            map_counts[map_name] += 1
            phase_counts[(map_name, phase)] += 1
            family_counts[(map_name, phase, family)] += 1
        self.last_counts = {
            "map": dict(sorted(map_counts.items())),
            "mapPhase": {
                f"{map_name}::{phase}": count
                for (map_name, phase), count in sorted(phase_counts.items())
            },
            "mapPhaseFamily": {
                f"{map_name}::{phase}::{family}": count
                for (map_name, phase, family), count in sorted(family_counts.items())
            },
        }
        return batch


class ReferenceLogitCache:
    """有界 LRU 缓存冻结 θ1 的合法候选 logits，避免每步重复参考前向。"""

    def __init__(self, model: torch.nn.Module, capacity: int = 4096):
        self.model = model
        self.capacity = max(1, capacity)
        self.values: OrderedDict[int, torch.Tensor] = OrderedDict()

    def get_many(self, samples: Sequence[Any]) -> List[torch.Tensor]:
        batch_values: Dict[int, torch.Tensor] = {}
        missing_by_id: Dict[int, Any] = {}
        for sample in samples:
            key = id(sample)
            if key in self.values:
                batch_values[key] = self.values[key]
                self.values.move_to_end(key)
            elif key not in missing_by_id:
                missing_by_id[key] = sample
        missing = list(missing_by_id.values())
        if missing:
            self.model.eval()
            with torch.no_grad():
                logits, _, _ = evaluate_batch(self.model, [sample.decision for sample in missing])
            for sample, row in zip(missing, logits):
                key = id(sample)
                value = row.detach().cpu().float()
                batch_values[key] = value
                self.values[key] = value
                self.values.move_to_end(key)
                while len(self.values) > self.capacity:
                    self.values.popitem(last=False)
        return [batch_values[id(sample)] for sample in samples]


def _atomic_torch_save(value: object, path: Path) -> None:
    temporary = path.with_name(f"{path.name}.tmp-{os.getpid()}")
    torch.save(value, temporary)
    os.replace(temporary, path)


def _write_json(path: Path, value: object) -> None:
    temporary = path.with_name(f"{path.name}.tmp-{os.getpid()}")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _source_identity() -> Dict[str, str]:
    files = [
        ROOT / "v19/training/outcome_regression.py",
        ROOT / "v19/training/replay_subset.py",
        ROOT / "v19/training/ppo.py",
        ROOT / "v19/training/behavior_identity.py",
        ROOT / "python/spatial_resnet_model.py",
    ]
    missing = [str(path) for path in files if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"训练源码身份缺少文件：{missing}")
    return {str(path.relative_to(ROOT)).replace("\\", "/"): sha256_file(path) for path in files}


def _checkpoint_state(
    path: Path,
    model: torch.nn.Module,
    optimizer: torch.optim.Optimizer,
    step: int,
    identity: Dict[str, object],
    sampler: BalancedBatchSampler,
    rows: List[Dict[str, Any]],
    stopped: bool,
) -> None:
    _atomic_torch_save({
        "schema": "v19_outcome_regression_state_1",
        "identity": identity,
        "updatesPerformed": step,
        "model": model.state_dict(),
        "optimizer": optimizer.state_dict(),
        "rng": {"torch": torch.get_rng_state(), "python": random.getstate(), "sampler": sampler.rng.getstate()},
        "metricsRows": rows,
        "stoppedByKl": stopped,
    }, path)


def _monitor_holdout(
    model: torch.nn.Module,
    reference: ReferenceLogitCache,
    samples: Sequence[Any],
    mode: WeightMode,
    chunk_size: int = 128,
) -> Dict[str, float]:
    if not samples:
        return {"samples": 0, "weightedNll": math.nan, "actionChangeRate": math.nan}
    weighted_sum = 0.0
    weight_sum = 0.0
    changes = 0
    model.eval()
    with torch.no_grad():
        for start in range(0, len(samples), chunk_size):
            chunk = list(samples[start:start + chunk_size])
            current, _, _ = evaluate_batch(model, [sample.decision for sample in chunk])
            initial = reference.get_many(chunk)
            returns = torch.tensor([sample.natural_return for sample in chunk], dtype=torch.float32)
            values = torch.tensor([sample.behavior_value for sample in chunk], dtype=torch.float32)
            weights = compute_raw_weights(returns, values, mode)
            for sample, now, old, weight in zip(chunk, current, initial, weights):
                nll = -F.log_softmax(now.float(), dim=0)[sample.decision.chosen_index]
                weighted_sum += float(weight * nll)
                weight_sum += float(weight)
                changes += int(int(now.argmax()) != int(old.argmax()))
    return {
        "samples": len(samples),
        "weightedNll": weighted_sum / max(weight_sum, 1e-12),
        "actionChangeRate": changes / len(samples),
    }


def _export_checkpoint(
    out_dir: Path,
    tag: str,
    step: int,
    model: torch.nn.Module,
    identity: Dict[str, object],
    rows: List[Dict[str, Any]],
    holdout: Dict[str, float],
    stopped_by_kl: bool,
) -> None:
    model_path = out_dir / f"{tag}_u{step:04d}.json"
    if model_path.exists():
        raise FileExistsError(f"拒绝覆盖已有固定检查点：{model_path}")
    channels = int(model.spatial_channels)
    schema = SCHEMA_BY_CHANNELS.get(channels)
    if schema is None:
        raise ValueError(f"未登记的空间通道数：{channels}")
    export_model_to_ts_json(model, str(model_path), encoder_schema_id=schema)
    metrics = {
        "schema": "v19_outcome_regression_metrics_1",
        "method": "有限离策略结果加权策略回归（不是PPO）",
        "updatesPerformed": step,
        "fixedCheckpoint": step in (400, 800),
        "stoppedByKl": stopped_by_kl,
        "identity": identity,
        "output": {"path": str(model_path).replace("\\", "/"), "sha256": sha256_file(model_path)},
        "latestTrain": rows[-1] if rows else None,
        "holdout": holdout,
        "holdoutCaveat": "旧预训练可能见过其中部分数据；仅监测加权NLL和动作变化，不是独立棋力声明。",
        "criticCaveat": "stem、残差骨干和value头均冻结，critic函数严格不变。",
    }
    _write_json(out_dir / f"{tag}_u{step:04d}.metrics.json", metrics)


def _parse_sources(values: Sequence[str]) -> List[Tuple[Path, str]]:
    raw = list(values) if values else [f"{directory}:{key}" for directory, key in DEFAULT_SOURCES]
    sources: List[Tuple[Path, str]] = []
    for value in raw:
        if ":" not in value:
            raise ValueError("--source 格式必须是 wave_dir:key")
        directory, key = value.rsplit(":", 1)
        sources.append(((ROOT / directory).resolve() if not Path(directory).is_absolute() else Path(directory), key))
    return sources


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="V19 有限离策略结果加权策略回归（非PPO）")
    parser.add_argument("--source", action="append", default=[], help="wave_dir:key；默认旧wave2与wave3")
    parser.add_argument("--init-checkpoint", default=THETA1_PATH)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--tag", default="outcome_regression")
    parser.add_argument("--weight-mode", choices=["uniform", "advantage"], required=True)
    parser.add_argument("--updates", type=int, default=DEFAULT_UPDATES, help="正式为800；smoke可用2")
    parser.add_argument("--resume", default=None, help="从已保存train_state.pt恢复")
    parser.add_argument("--expected-data-index-sha", default=None,
                        help="可选：冻结ReplaySubset.dataIndexSha256，确保两训练臂使用同一子集")
    args = parser.parse_args(argv)
    if args.updates not in (2, 800):
        raise SystemExit("--updates 只允许正式800或 smoke 2")

    torch.set_num_threads(TORCH_THREADS)
    torch.manual_seed(SEED)
    random.seed(SEED)
    out_dir = Path(args.out_dir).resolve()
    if out_dir.exists() and any(out_dir.iterdir()) and not args.resume:
        raise FileExistsError(f"拒绝覆盖非空输出目录：{out_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)

    init_path = (ROOT / args.init_checkpoint).resolve() if not Path(args.init_checkpoint).is_absolute() else Path(args.init_checkpoint)
    init_sha = sha256_file(init_path)
    if init_sha != THETA1_SHA256:
        raise ValueError(f"起点必须是冻结θ1：实际SHA {init_sha}")

    from replay_subset import ReplaySource, load_replay_subset  # noqa: E402

    source_specs = _parse_sources(args.source)
    subset = load_replay_subset([ReplaySource(wave_dir=directory, key=key) for directory, key in source_specs])
    data_index_sha = str(subset.manifest.get("dataIndexSha256", ""))
    if not data_index_sha:
        raise ValueError("ReplaySubset manifest 缺少 dataIndexSha256")
    if args.expected_data_index_sha and args.expected_data_index_sha != data_index_sha:
        raise ValueError(
            f"ReplaySubset数据索引SHA不符：期望 {args.expected_data_index_sha}，实际 {data_index_sha}"
        )
    family_split = subset.manifest.get("familySplit")
    if not isinstance(family_split, dict) or family_split.get("verifiedDisjoint") is not True \
            or int(family_split.get("overlapCount", -1)) != 0:
        raise ValueError("ReplaySubset未证明train/holdout家族隔离")
    train_samples = [sample for sample in subset.samples if sample.split == "train"]
    holdout_samples = [sample for sample in subset.samples if sample.split == "holdout"]
    if not train_samples:
        raise ValueError("结果子集没有训练样本")
    channels = int(train_samples[0].decision.spatial.shape[0])
    if channels != 34:
        raise ValueError(f"结果回归只接受V19 34通道样本，实际 {channels}")

    config = {
        "weightMode": args.weight_mode, "updatesRequested": args.updates, "batchSize": BATCH_SIZE,
        "learningRate": LEARNING_RATE, "beta": BETA, "maxWeight": MAX_WEIGHT,
        "klCoefficient": KL_COEFFICIENT, "klStop": KL_STOP, "gradClip": GRAD_CLIP,
        "seed": SEED, "torchThreads": TORCH_THREADS, "trainable": ["pol_dense1", "pol_dense2"],
    }
    source_identity = _source_identity()
    identity: Dict[str, object] = {
        "config": config,
        "configSha256": canonical_sha256(config),
        "sourceFiles": source_identity,
        "sourceSha256": canonical_sha256(source_identity),
        "dataManifest": subset.manifest,
        "dataSha256": canonical_sha256(subset.manifest),
        "initPath": str(init_path).replace("\\", "/"),
        "initSha256": init_sha,
    }
    sample_summary = {
        "total": len(subset.samples),
        "train": len(train_samples),
        "holdout": len(holdout_samples),
        "maps": dict(sorted(Counter(sample.decision.map_name for sample in subset.samples).items())),
        "phases": dict(sorted(Counter(sample.phase for sample in subset.samples).items())),
        "families": len({sample.family_id for sample in subset.samples}),
        "dataIndexSha256": data_index_sha,
    }
    identity_path = out_dir / f"{args.tag}.identity.json"
    identity_record = {"schema": "v19_outcome_regression_identity_1", "identity": identity,
                       "sampleSummary": sample_summary}
    if identity_path.exists():
        existing_identity = json.loads(identity_path.read_text(encoding="utf-8"))
        if existing_identity != identity_record:
            raise ValueError("输出目录已有不一致的训练身份记录")
    else:
        _write_json(identity_path, identity_record)
    print(
        f"[结果回归] mode={args.weight_mode} train={len(train_samples)} holdout={len(holdout_samples)} "
        f"families={sample_summary['families']} data={data_index_sha[:12]}"
    )

    model = build_model(channels)
    load_model_from_ts_json(model, str(init_path))
    reference_model = copy.deepcopy(model).eval()
    for parameter in reference_model.parameters():
        parameter.requires_grad_(False)
    trainable = freeze_policy_head_only(model)
    optimizer = torch.optim.AdamW(trainable, lr=LEARNING_RATE, weight_decay=0.0)
    sampler = BalancedBatchSampler(train_samples, seed=SEED)
    reference_cache = ReferenceLogitCache(reference_model)
    rows: List[Dict[str, Any]] = []
    start_step = 0

    if args.resume:
        state = torch.load(Path(args.resume), map_location="cpu", weights_only=False)
        if state.get("schema") != "v19_outcome_regression_state_1" or state.get("identity") != identity:
            raise ValueError("resume状态的config/source/data/init身份不一致")
        model.load_state_dict(state["model"])
        optimizer.load_state_dict(state["optimizer"])
        torch.set_rng_state(state["rng"]["torch"])
        random.setstate(state["rng"]["python"])
        sampler.rng.setstate(state["rng"]["sampler"])
        start_step = int(state["updatesPerformed"])
        rows = list(state.get("metricsRows", []))
        if bool(state.get("stoppedByKl")):
            raise ValueError("resume状态已经因KL门槛停止，禁止继续追加更新")
        if start_step >= args.updates:
            raise ValueError("resume状态已达到或超过请求更新数")

    checkpoint_steps = set(fixed_checkpoint_steps(args.updates))
    stopped_by_kl = False
    stop_mean_kl: float | None = None
    latest_state = out_dir / f"{args.tag}.train_state.pt"
    for requested_step in range(start_step + 1, args.updates + 1):
        batch = sampler.sample(BATCH_SIZE)
        decisions = [sample.decision for sample in batch]
        current_logits, _, _ = evaluate_batch(model, decisions)
        reference_logits = reference_cache.get_many(batch)
        raw_weights = compute_raw_weights(
            torch.tensor([sample.natural_return for sample in batch], dtype=torch.float32),
            torch.tensor([sample.behavior_value for sample in batch], dtype=torch.float32),
            args.weight_mode,
        )
        weights = normalize_batch_weights(raw_weights)
        loss, parts = outcome_regression_objective(
            current_logits,
            reference_logits,
            [sample.decision.chosen_index for sample in batch],
            weights,
        )
        mean_kl = float(parts["mean_kl"].detach())
        if mean_kl > KL_STOP:
            stopped_by_kl = True
            stop_mean_kl = mean_kl
            break
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        grad_norm = float(torch.nn.utils.clip_grad_norm_(trainable, GRAD_CLIP))
        optimizer.step()
        completed_step = requested_step
        model.eval()
        with torch.no_grad():
            post_step_logits, _, _ = evaluate_batch(model, decisions)
            post_step_kl = float(mean_reference_kl(post_step_logits, reference_logits))
        row = {
            "update": float(completed_step), "loss": float(loss.detach()),
            "policyLoss": float(parts["policy_loss"].detach()), "meanKlBeforeStep": mean_kl,
            "meanKlAfterStep": post_step_kl,
            "meanRawWeight": float(raw_weights.mean()), "maxRawWeight": float(raw_weights.max()),
            "gradNormBeforeClip": grad_norm,
            "batchJointCounts": copy.deepcopy(sampler.last_counts),
        }
        rows.append(row)
        if completed_step % 25 == 0 or completed_step in checkpoint_steps or completed_step == args.updates:
            print(
                f"[结果回归] update={completed_step}/{args.updates} "
                f"loss={row['loss']:.6f} kl_pre={mean_kl:.6f} kl_post={post_step_kl:.6f}"
            )
        if completed_step % STATE_INTERVAL == 0 or completed_step in checkpoint_steps:
            _checkpoint_state(latest_state, model, optimizer, completed_step, identity, sampler, rows, False)
        if completed_step in checkpoint_steps:
            holdout = _monitor_holdout(model, reference_cache, holdout_samples, args.weight_mode)
            _export_checkpoint(out_dir, args.tag, completed_step, model, identity, rows, holdout, False)

    completed = int(rows[-1]["update"]) if rows else start_step
    _checkpoint_state(latest_state, model, optimizer, completed, identity, sampler, rows, stopped_by_kl)
    early_stop_export: int | None = None
    if stopped_by_kl and completed > 0 and completed not in checkpoint_steps:
        holdout = _monitor_holdout(model, reference_cache, holdout_samples, args.weight_mode)
        _export_checkpoint(out_dir, f"{args.tag}_earlystop", completed, model, identity, rows, holdout, True)
        early_stop_export = completed
    actual_fixed_exports = [
        step for step in sorted(checkpoint_steps)
        if step <= completed
        and (out_dir / f"{args.tag}_u{step:04d}.json").is_file()
        and (out_dir / f"{args.tag}_u{step:04d}.metrics.json").is_file()
    ]
    summary = {
        "schema": "v19_outcome_regression_summary_1",
        "method": "有限离策略结果加权策略回归（不是PPO）",
        "identity": identity,
        "updatesRequested": args.updates,
        "updatesPerformed": completed,
        "stoppedByKl": stopped_by_kl,
        "stopMeanKlBeforeStep": stop_mean_kl,
        "completedRequestedUpdates": completed == args.updates,
        "fixedExports": actual_fixed_exports,
        "earlyStopExport": early_stop_export,
        "statePath": str(latest_state).replace("\\", "/"),
        "criticUnchangedByConstruction": True,
        "note": "旧wave2/3自然轨迹的离策略结果加权回归；holdout不是独立棋力证据。",
    }
    _write_json(out_dir / f"{args.tag}.summary.json", summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
