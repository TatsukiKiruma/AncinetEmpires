"""V19 Path3 双臂离线蒸馏训练器。

训练器只更新策略头。control 臂把新增三维路径语义置零，path3 臂使用数据中的
真实值；teacher 原始分数只构造监督分布，绝不拼入模型输入。
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
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Mapping, Sequence

ROOT = Path(__file__).resolve().parents[2]
for directory in (ROOT / "python", ROOT / "v19" / "training"):
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))

import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402

from migrate_path3_model import (  # noqa: E402
    NEW_POLICY_IN_DIM,
    NEW_SCHEMA_ID,
    OLD_SCHEMA_ID,
    PATH3_DIM,
    PREFIX_DIM,
    migrate_model_dict,
)
from spatial_resnet_model import SpatialResNet  # noqa: E402


Arm = Literal["control", "path3"]
ROW_SCHEMA = "v19_path3_replay_row_1"
MANIFEST_SCHEMA = "v19_path3_replay_manifest_1"
CONFIG_SCHEMA = "v19_path3_distill_config_1"
STATE_SCHEMA = "v19_path3_distill_state_1"
SEED = 42
BATCH_SIZE = 64
TORCH_THREADS = 2
GRAD_CLIP = 0.5
REFERENCE_CACHE_CAPACITY = 4096
FROZEN_MANIFEST_SHA256 = "4d5cf5d01ab837c7bfe35378d597333ea50e541a41ebbe3957df252749ea2594"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_sha256(value: object) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _coord(value: object, where: str) -> tuple[int, int] | None:
    if value is None:
        return None
    if not isinstance(value, Mapping) or set(value) != {"x", "y"}:
        raise ValueError(f"{where} 坐标格式错误")
    x, y = value["x"], value["y"]
    if isinstance(x, bool) or isinstance(y, bool) or not isinstance(x, int) or not isinstance(y, int):
        raise ValueError(f"{where} 坐标必须是整数")
    if not (0 <= x < 20 and 0 <= y < 20):
        raise ValueError(f"{where} 坐标越界：({x}, {y})")
    return x, y


def teacher_distribution(scores: Sequence[float]) -> torch.Tensor:
    """q_i ∝ exp(-rank_i/2)，rank 只统计严格更高分，故同分同 rank。"""

    if not scores or any(not math.isfinite(float(score)) for score in scores):
        raise ValueError("teacher scores 必须是非空有限数值")
    ranks = [sum(float(other) > float(score) for other in scores) for score in scores]
    return torch.softmax(-torch.tensor(ranks, dtype=torch.float64) / 2.0, dim=0).float()


def teacher_ranks(scores: Sequence[float]) -> tuple[int, ...]:
    if not scores or any(not math.isfinite(float(score)) for score in scores):
        raise ValueError("teacher scores 必须是非空有限数值")
    return tuple(sum(float(other) > float(score) for other in scores) for score in scores)


@dataclass(frozen=True)
class Path3Sample:
    sample_id: str
    input_identity: str
    split: str
    map_name: str
    phase: str
    source: str
    family: str
    spatial: torch.Tensor
    globals: torch.Tensor
    coords: tuple[tuple[tuple[int, int] | None, tuple[int, int] | None, tuple[int, int] | None], ...]
    semantics: torch.Tensor
    action_codes: tuple[str, ...]
    teacher_q: torch.Tensor
    teacher_ranks: tuple[int, ...]


def _validate_manifest(manifest: object, manifest_sha: str, data_path: Path, config: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(manifest, dict) or manifest.get("schema") != MANIFEST_SCHEMA:
        raise ValueError("Path3 manifest schema 错误")
    if manifest_sha != FROZEN_MANIFEST_SHA256:
        raise ValueError(f"manifest SHA 不符：冻结值 {FROZEN_MANIFEST_SHA256}，实际 {manifest_sha}")
    contracts = manifest.get("contracts")
    expected = {
        "encoderSchemaId": NEW_SCHEMA_ID,
        "baseEncoderSchemaId": OLD_SCHEMA_ID,
        "spatialChannels": 34,
        "globalFeatureDim": 20,
        "actionSemanticDim": 56,
        "candidateOrderingId": "actionCode-codepoint-asc-v1",
    }
    if not isinstance(contracts, dict) or any(contracts.get(key) != value for key, value in expected.items()):
        raise ValueError("Path3 manifest 输入契约与训练器不一致")
    output = manifest.get("output")
    if not isinstance(output, dict) or output.get("sha256") != config["dataSha256"]:
        raise ValueError("manifest.output.sha256 与冻结 config 不一致")
    actual_data_sha = sha256_file(data_path)
    if actual_data_sha != output.get("sha256"):
        raise ValueError(f"JSONL SHA 不符：manifest={output.get('sha256')}，实际={actual_data_sha}")
    return manifest


def load_path3_replay(data_path: Path, manifest_path: Path, config: Mapping[str, Any]) -> tuple[list[Path3Sample], dict[str, Any]]:
    """强校验 manifest、JSONL SHA、张量形状、候选顺序与家族隔离。"""

    manifest_raw = manifest_path.read_bytes()
    manifest_sha = hashlib.sha256(manifest_raw).hexdigest()
    manifest = _validate_manifest(json.loads(manifest_raw), manifest_sha, data_path, config)
    samples: list[Path3Sample] = []
    seen_ids: set[str] = set()
    split_families: dict[str, set[str]] = {"train": set(), "holdout": set()}
    with data_path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            where = f"第{line_number}行"
            if row.get("schema") != ROW_SCHEMA:
                raise ValueError(f"{where} row schema 错误")
            identity_checks = {
                "encoderSchemaId": NEW_SCHEMA_ID,
                "baseEncoderSchemaId": OLD_SCHEMA_ID,
                "spatialChannels": 34,
                "globalFeatureDim": 20,
                "actionSemanticDim": 56,
                "candidateOrderingId": "actionCode-codepoint-asc-v1",
            }
            if any(row.get(key) != value for key, value in identity_checks.items()):
                raise ValueError(f"{where} 输入身份或维度声明错误")
            sample_id = row.get("sampleId")
            if not isinstance(sample_id, str) or not sample_id or sample_id in seen_ids:
                raise ValueError(f"{where} sampleId 缺失或重复")
            seen_ids.add(sample_id)
            input_identity = row.get("inputIdentity")
            if not isinstance(input_identity, str) or len(input_identity) != 64 \
                    or any(char not in "0123456789abcdef" for char in input_identity.lower()):
                raise ValueError(f"{sample_id} inputIdentity 不是 SHA-256")
            split = row.get("split")
            family = row.get("trueFamilyId")
            if split not in split_families or not isinstance(family, str) or not family:
                raise ValueError(f"{sample_id} split/trueFamilyId 错误")
            split_families[split].add(family)

            spatial_raw = row.get("spatialTensor")
            globals_raw = row.get("globalFeatures")
            if not isinstance(spatial_raw, list) or len(spatial_raw) != 34 * 20 * 20:
                raise ValueError(f"{sample_id} spatialTensor 不是 34×20×20")
            if not isinstance(globals_raw, list) or len(globals_raw) != 20:
                raise ValueError(f"{sample_id} globalFeatures 不是 20 维")
            spatial = torch.tensor(spatial_raw, dtype=torch.float32).view(34, 20, 20)
            globals_tensor = torch.tensor(globals_raw, dtype=torch.float32)
            if not torch.isfinite(spatial).all() or not torch.isfinite(globals_tensor).all():
                raise ValueError(f"{sample_id} 输入张量含非有限值")

            codes = row.get("orderedActionCodes")
            candidates = row.get("candidateActions")
            teacher = row.get("teacher")
            if not isinstance(codes, list) or not codes or len(codes) != len(set(codes)):
                raise ValueError(f"{sample_id} orderedActionCodes 必须非空且唯一")
            if not isinstance(candidates, list) or len(candidates) != len(codes) or not isinstance(teacher, dict):
                raise ValueError(f"{sample_id} 候选或 teacher 数量错误")
            candidate_codes = [candidate.get("actionCode") for candidate in candidates]
            teacher_codes = teacher.get("actionCodes")
            if candidate_codes != codes or teacher_codes != codes:
                raise ValueError(f"{sample_id} candidate/teacher actionCode 未严格对齐")
            target_index = teacher.get("targetActionIndex")
            if not isinstance(target_index, int) or not 0 <= target_index < len(codes) \
                    or teacher.get("targetActionCode") != codes[target_index]:
                raise ValueError(f"{sample_id} teacher 目标动作未与规范候选对齐")
            raw_scores = teacher.get("rawScores")
            candidate_scores = [candidate.get("teacherScore") for candidate in candidates]
            if not isinstance(raw_scores, list) or raw_scores != candidate_scores or len(raw_scores) != len(codes):
                raise ValueError(f"{sample_id} teacher scores 未逐候选对齐")

            semantics_rows: list[list[float]] = []
            coords_rows = []
            for index, candidate in enumerate(candidates):
                semantics = candidate.get("semantics")
                if not isinstance(semantics, list) or len(semantics) != 56:
                    raise ValueError(f"{sample_id} 候选{index}语义不是 56 维")
                if any(isinstance(value, bool) or not isinstance(value, (int, float))
                       or not math.isfinite(float(value)) for value in semantics):
                    raise ValueError(f"{sample_id} 候选{index}语义含非法数值")
                semantics_rows.append([float(value) for value in semantics])
                coords_rows.append(tuple(
                    _coord(candidate.get(field), f"{sample_id}.candidate[{index}].{field}")
                    for field in ("actorCoord", "landingCoord", "targetCoord")
                ))
            numeric_scores = [float(score) for score in raw_scores]
            samples.append(Path3Sample(
                sample_id=sample_id,
                input_identity=input_identity,
                split=split,
                map_name=str(row.get("mapName")),
                phase=str(row.get("phaseBucket")),
                source=str(row.get("sourcePolicy")),
                family=family,
                spatial=spatial,
                globals=globals_tensor,
                coords=tuple(coords_rows),
                semantics=torch.tensor(semantics_rows, dtype=torch.float32),
                action_codes=tuple(codes),
                teacher_q=teacher_distribution(numeric_scores),
                teacher_ranks=teacher_ranks(numeric_scores),
            ))
    output = manifest["output"]
    if len(samples) != output.get("rows"):
        raise ValueError(f"JSONL 行数不符：manifest={output.get('rows')}，实际={len(samples)}")
    overlap = split_families["train"] & split_families["holdout"]
    if overlap:
        raise ValueError(f"train/holdout trueFamilyId 有交集：{sorted(overlap)[:3]}")
    if not split_families["train"] or not split_families["holdout"]:
        raise ValueError("train/holdout 均必须含至少一个家族")
    return samples, manifest


class HierarchicalSampler:
    """按 map→phase→source→family 的可用单元逐层等额采样。"""

    def __init__(self, samples: Sequence[Path3Sample], seed: int = SEED):
        if not samples:
            raise ValueError("训练样本不能为空")
        self.rng = random.Random(seed)
        self.cells: dict[str, dict[str, dict[str, dict[str, list[Path3Sample]]]]] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
        )
        for sample in samples:
            self.cells[sample.map_name][sample.phase][sample.source][sample.family].append(sample)
        self.maps = sorted(self.cells)
        self.last_counts: dict[str, dict[str, int]] = {}

    def sample(self, size: int) -> list[Path3Sample]:
        if size <= 0:
            raise ValueError("batch size 必须为正数")
        levels: list[defaultdict[tuple[str, ...], int]] = [defaultdict(int) for _ in range(4)]
        result = []
        for _ in range(size):
            map_name = self._pick(self.maps, levels[0], ())
            phase = self._pick(sorted(self.cells[map_name]), levels[1], (map_name,))
            source = self._pick(sorted(self.cells[map_name][phase]), levels[2], (map_name, phase))
            family = self._pick(
                sorted(self.cells[map_name][phase][source]), levels[3], (map_name, phase, source)
            )
            result.append(self.rng.choice(self.cells[map_name][phase][source][family]))
            for counts, key in zip(levels, ((map_name,), (map_name, phase),
                                            (map_name, phase, source), (map_name, phase, source, family))):
                counts[key] += 1
        names = ("map", "mapPhase", "mapPhaseSource", "mapPhaseSourceFamily")
        self.last_counts = {
            name: {"::".join(key): count for key, count in sorted(counts.items())}
            for name, counts in zip(names, levels)
        }
        return result

    def _pick(self, options: Sequence[str], counts: Mapping[tuple[str, ...], int], prefix: tuple[str, ...]) -> str:
        minimum = min(counts[prefix + (option,)] for option in options)
        return self.rng.choice([option for option in options if counts[prefix + (option,)] == minimum])


def distillation_objective(
    current_logits: Sequence[torch.Tensor],
    reference_logits: Sequence[torch.Tensor],
    targets: Sequence[torch.Tensor],
    kl_coefficient: float,
) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
    if not current_logits or not (len(current_logits) == len(reference_logits) == len(targets)):
        raise ValueError("logits 与 teacher targets 批量必须非空同长")
    ce_rows, kl_rows, changes = [], [], []
    for current, reference, target in zip(current_logits, reference_logits, targets):
        if current.ndim != 1 or current.shape != reference.shape or current.shape != target.shape:
            raise ValueError("单样本 logits/target 必须是一维同形")
        logp = F.log_softmax(current.float(), dim=0)
        ref_logp = F.log_softmax(reference.detach().float(), dim=0)
        ce_rows.append(-(target.to(logp) * logp).sum())
        kl_rows.append((ref_logp.exp() * (ref_logp - logp)).sum())
        changes.append((current.argmax() != reference.argmax()).float())
    teacher_ce = torch.stack(ce_rows).mean()
    mean_kl = torch.stack(kl_rows).mean()
    loss = teacher_ce + kl_coefficient * mean_kl
    if not torch.isfinite(loss):
        raise FloatingPointError("蒸馏目标出现非有限值")
    return loss, {
        "teacherCe": teacher_ce,
        "referenceKl": mean_kl,
        "actionChangeRate": torch.stack(changes).mean(),
    }


def frozen_reference_targets(
    reference_logits: Sequence[torch.Tensor],
    teacher_q: Sequence[torch.Tensor],
    ranks: Sequence[Sequence[int]],
    teacher_mix: float,
) -> tuple[list[torch.Tensor], list[int]]:
    """按冻结参考首选的 teacher rank 构造静态目标，返回目标与参考首选 rank。"""

    if not (len(reference_logits) == len(teacher_q) == len(ranks)) or not reference_logits:
        raise ValueError("参考 logits、teacher q 与 rank 必须非空同长")
    if not 0 <= teacher_mix <= 1:
        raise ValueError("teacherMix 必须在 [0,1]")
    targets, selected_ranks = [], []
    for logits, q, sample_ranks in zip(reference_logits, teacher_q, ranks):
        if logits.ndim != 1 or q.shape != logits.shape or len(sample_ranks) != logits.numel():
            raise ValueError("参考 logits、teacher q 与 rank 单样本形状不一致")
        p0 = F.softmax(logits.detach().float(), dim=0)
        selected_rank = int(sample_ranks[int(logits.argmax())])
        target = p0 if selected_rank == 0 else (1.0 - teacher_mix) * p0 + teacher_mix * q.to(p0)
        targets.append(target.detach())
        selected_ranks.append(selected_rank)
    return targets, selected_ranks


def freeze_policy_head_only(model: SpatialResNet) -> list[torch.nn.Parameter]:
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    trainable = []
    for module in (model.pol_dense1, model.pol_dense2):
        for parameter in module.parameters():
            parameter.requires_grad_(True)
            trainable.append(parameter)
    return trainable


def _load_layer(layer: torch.nn.Module, raw: Mapping[str, Any]) -> None:
    with torch.no_grad():
        layer.weight.copy_(torch.tensor(raw["weights"], dtype=torch.float32).view_as(layer.weight))
        layer.bias.copy_(torch.tensor(raw["biases"], dtype=torch.float32).view_as(layer.bias))


def load_migrated_theta1(path: Path, expected_sha: str) -> tuple[SpatialResNet, dict[str, Any]]:
    actual_sha = sha256_file(path)
    if actual_sha != expected_sha:
        raise ValueError(f"θ1 SHA 不符：期望 {expected_sha}，实际 {actual_sha}")
    source = json.loads(path.read_text(encoding="utf-8"))
    migrated = migrate_model_dict(source)
    model = SpatialResNet(spatial_channels=34, trunk_channels=32, global_dim=20, action_semantic_dim=56)
    mapping = {
        "stem": model.stem,
        "res1_1": model.res_blocks[0].conv1,
        "res1_2": model.res_blocks[0].conv2,
        "res2_1": model.res_blocks[1].conv1,
        "res2_2": model.res_blocks[1].conv2,
        "valDense1": model.val_dense1,
        "valDense2": model.val_dense2,
        "polDense1": model.pol_dense1,
        "polDense2": model.pol_dense2,
    }
    for key, layer in mapping.items():
        if key not in migrated:
            raise ValueError(f"θ1 缺少权重层：{key}")
        _load_layer(layer, migrated[key])
    old_policy = torch.tensor(source["polDense1"]["weights"], dtype=torch.float32).view(48, 169)
    if not torch.equal(model.pol_dense1.weight[:, :PREFIX_DIM], old_policy[:, :PREFIX_DIM]) \
            or not torch.equal(model.pol_dense1.weight[:, -20:], old_policy[:, -20:]) \
            or torch.count_nonzero(model.pol_dense1.weight[:, PREFIX_DIM:PREFIX_DIM + PATH3_DIM]):
        raise AssertionError("Path3 迁移后的 policy 全局列或新增零列布局错误")
    return model, migrated


def policy_logits(model: SpatialResNet, samples: Sequence[Path3Sample], arm: Arm) -> list[torch.Tensor]:
    spatial = torch.stack([sample.spatial for sample in samples])
    globals_batch = torch.stack([sample.globals for sample in samples])
    z = model.forward_trunk(spatial)
    results = []
    for batch_index, sample in enumerate(samples):
        rows = []
        for candidate_index, points in enumerate(sample.coords):
            spatial_parts = []
            for point in points:
                spatial_parts.append(
                    torch.zeros(32, dtype=z.dtype) if point is None else z[batch_index, :, point[1], point[0]]
                )
            semantics = sample.semantics[candidate_index]
            if arm == "control":
                semantics = semantics.clone()
                semantics[-3:] = 0
            rows.append(torch.cat((*spatial_parts, semantics, globals_batch[batch_index])))
        features = torch.stack(rows)
        if features.shape[1] != NEW_POLICY_IN_DIM:
            raise AssertionError(f"policy 输入维度错误：{features.shape}")
        results.append(model.forward_action_logits(features))
    return results


class ReferenceLogitCache:
    def __init__(self, model: SpatialResNet, arm: Arm, capacity: int):
        self.model, self.arm, self.capacity = model, arm, max(1, capacity)
        self.values: OrderedDict[str, torch.Tensor] = OrderedDict()

    def get_many(self, samples: Sequence[Path3Sample]) -> list[torch.Tensor]:
        batch_values: dict[str, torch.Tensor] = {}
        missing: dict[str, Path3Sample] = {}
        for sample in samples:
            if sample.sample_id in self.values:
                batch_values[sample.sample_id] = self.values[sample.sample_id]
                self.values.move_to_end(sample.sample_id)
            else:
                missing.setdefault(sample.sample_id, sample)
        if missing:
            with torch.no_grad():
                computed = policy_logits(self.model, list(missing.values()), self.arm)
            for sample, logits in zip(missing.values(), computed):
                value = logits.detach().cpu().float()
                batch_values[sample.sample_id] = value
                self.values[sample.sample_id] = value
                self.values.move_to_end(sample.sample_id)
                while len(self.values) > self.capacity:
                    self.values.popitem(last=False)
        return [batch_values[sample.sample_id] for sample in samples]


def _layer_dict(layer: torch.nn.Module, original: Mapping[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(dict(original))
    result["weights"] = layer.weight.detach().cpu().flatten().tolist()
    result["biases"] = layer.bias.detach().cpu().flatten().tolist()
    return result


def export_model(model: SpatialResNet, template: Mapping[str, Any], path: Path) -> None:
    if path.exists():
        raise FileExistsError(f"拒绝覆盖模型：{path}")
    output = copy.deepcopy(dict(template))
    mapping = {
        "stem": model.stem,
        "res1_1": model.res_blocks[0].conv1,
        "res1_2": model.res_blocks[0].conv2,
        "res2_1": model.res_blocks[1].conv1,
        "res2_2": model.res_blocks[1].conv2,
        "valDense1": model.val_dense1,
        "valDense2": model.val_dense2,
        "polDense1": model.pol_dense1,
        "polDense2": model.pol_dense2,
    }
    for key, layer in mapping.items():
        output[key] = _layer_dict(layer, output[key])
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _read_config(path: Path) -> dict[str, Any]:
    config = json.loads(path.read_text(encoding="utf-8"))
    required = {
        "schema", "dataSha256", "initSha256", "targetRule", "teacherMix", "rankTemperature",
        "learningRate", "klCoefficient", "klStop", "batchSize", "updates", "checkpointSteps",
        "gradClip", "seed", "torchThreads", "weightDecay", "trainable",
    }
    if not isinstance(config, dict) or set(config) != required or config.get("schema") != CONFIG_SCHEMA:
        raise ValueError(f"config 必须且只能包含冻结字段：{sorted(required)}")
    fixed = {
        "targetRule": "frozen_reference_top_tie_keep_else_rank_mix",
        "teacherMix": 0.25,
        "rankTemperature": 2.0,
        "learningRate": 5e-5,
        "klCoefficient": 0.1,
        "klStop": 0.1,
        "batchSize": BATCH_SIZE,
        "updates": 800,
        "checkpointSteps": [400, 800],
        "gradClip": GRAD_CLIP,
        "seed": SEED,
        "torchThreads": TORCH_THREADS,
        "weightDecay": 0.0,
        "trainable": ["pol_dense1", "pol_dense2"],
    }
    if any(config.get(key) != value for key, value in fixed.items()):
        raise ValueError(f"固定运行参数必须是 {fixed}")
    for field in ("dataSha256", "initSha256"):
        if not isinstance(config[field], str) or len(config[field]) != 64 \
                or any(char not in "0123456789abcdef" for char in config[field].lower()):
            raise ValueError(f"{field} 必须是 SHA-256")
    return config


def _source_identity() -> dict[str, str]:
    files = [
        ROOT / "v19/training/path3_distill.py",
        ROOT / "v19/training/migrate_path3_model.py",
        ROOT / "python/spatial_resnet_model.py",
    ]
    return {path.relative_to(ROOT).as_posix(): sha256_file(path) for path in files}


def _write_json_new(path: Path, value: object) -> None:
    if path.exists():
        raise FileExistsError(f"拒绝覆盖已有文件：{path}")
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _critic_snapshot(model: SpatialResNet) -> dict[str, torch.Tensor]:
    return {name: value.detach().clone() for name, value in model.state_dict().items()
            if not name.startswith("pol_dense")}


def _critic_exact(model: SpatialResNet, snapshot: Mapping[str, torch.Tensor]) -> bool:
    current = model.state_dict()
    return all(torch.equal(current[name], value) for name, value in snapshot.items())


def _monitor(model: SpatialResNet, reference: ReferenceLogitCache,
             samples: Sequence[Path3Sample], arm: Arm, teacher_mix: float) -> dict[str, Any]:
    totals: dict[str, dict[str, float]] = defaultdict(
        lambda: {"samples": 0.0, "teacherCe": 0.0, "referenceKl": 0.0,
                 "argmaxRetained": 0.0, "referenceArgmaxTeacherRank": 0.0,
                 "referenceTopInTeacherTopSet": 0.0}
    )
    with torch.no_grad():
        for start in range(0, len(samples), 128):
            chunk = list(samples[start:start + 128])
            current = policy_logits(model, chunk, arm)
            initial = reference.get_many(chunk)
            targets, selected_ranks = frozen_reference_targets(
                initial, [sample.teacher_q for sample in chunk],
                [sample.teacher_ranks for sample in chunk], teacher_mix,
            )
            for now, old, target, selected_rank, sample in zip(
                    current, initial, targets, selected_ranks, chunk):
                logp = F.log_softmax(now.float(), dim=0)
                old_logp = F.log_softmax(old.float(), dim=0)
                for key in ("overall", sample.phase):
                    bucket = totals[key]
                    bucket["samples"] += 1
                    bucket["teacherCe"] += float(-(target * logp).sum())
                    bucket["referenceKl"] += float((old_logp.exp() * (old_logp - logp)).sum())
                    bucket["argmaxRetained"] += int(now.argmax() == old.argmax())
                    bucket["referenceArgmaxTeacherRank"] += selected_rank
                    bucket["referenceTopInTeacherTopSet"] += int(selected_rank == 0)
    result: dict[str, Any] = {}
    for key, bucket in sorted(totals.items()):
        count = int(bucket["samples"])
        result[key] = {
            "samples": count,
            "targetCrossEntropy": bucket["teacherCe"] / count,
            "referenceKl": bucket["referenceKl"] / count,
            "argmaxRetentionRateVsP0": bucket["argmaxRetained"] / count,
            "referenceArgmaxTeacherRankMean": bucket["referenceArgmaxTeacherRank"] / count,
            "referenceTopInTeacherTopSetRate": bucket["referenceTopInTeacherTopSet"] / count,
        }
    return result


def _save_state(path: Path, model: SpatialResNet, optimizer: torch.optim.Optimizer,
                step: int, identity: Mapping[str, Any], sampler: HierarchicalSampler,
                rows: Sequence[Mapping[str, Any]], stopped_by_kl: bool = False) -> None:
    temporary = path.with_name(f"{path.name}.tmp-{os.getpid()}")
    torch.save({
        "schema": STATE_SCHEMA,
        "updatesPerformed": step,
        "identity": identity,
        "model": model.state_dict(),
        "optimizer": optimizer.state_dict(),
        "rng": {"torch": torch.get_rng_state(), "python": random.getstate(), "sampler": sampler.rng.getstate()},
        "metricsRows": list(rows),
        "stoppedByKl": stopped_by_kl,
    }, temporary)
    os.replace(temporary, path)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="V19 Path3 双臂离线蒸馏")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--init-checkpoint", type=Path, required=True)
    parser.add_argument("--arm", choices=("control", "path3"), required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--smoke", action="store_true", help="只执行2次更新；仍使用同一冻结配置")
    args = parser.parse_args(argv)

    config = _read_config(args.config)
    effective_updates = 2 if args.smoke else int(config["updates"])
    if args.out_dir.exists() and any(args.out_dir.iterdir()):
        raise FileExistsError(f"拒绝覆盖非空输出目录：{args.out_dir}")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(TORCH_THREADS)
    torch.manual_seed(SEED)
    random.seed(SEED)

    samples, manifest = load_path3_replay(args.data, args.manifest, config)
    train = [sample for sample in samples if sample.split == "train"]
    holdout = [sample for sample in samples if sample.split == "holdout"]
    model, template = load_migrated_theta1(args.init_checkpoint, config["initSha256"])
    reference_model = copy.deepcopy(model).eval()
    for parameter in reference_model.parameters():
        parameter.requires_grad_(False)
    trainable = freeze_policy_head_only(model)
    optimizer = torch.optim.AdamW(trainable, lr=float(config["learningRate"]), weight_decay=0.0)
    sampler = HierarchicalSampler(train, seed=SEED)
    reference = ReferenceLogitCache(reference_model, args.arm, REFERENCE_CACHE_CAPACITY)
    critic_initial = _critic_snapshot(model)
    initial_path_columns = model.pol_dense1.weight[:, PREFIX_DIM:PREFIX_DIM + PATH3_DIM].detach().clone()

    source_files = _source_identity()
    identity = {
        "arm": args.arm,
        "config": config,
        "configSha256": canonical_sha256(config),
        "dataSha256": sha256_file(args.data),
        "manifestSha256": sha256_file(args.manifest),
        "initSha256": sha256_file(args.init_checkpoint),
        "sourceFiles": source_files,
        "sourceSha256": canonical_sha256(source_files),
        "modelSchema": NEW_SCHEMA_ID,
        "effectiveUpdates": effective_updates,
        "smoke": bool(args.smoke),
    }
    summary = {
        "total": len(samples), "train": len(train), "holdout": len(holdout),
        "trainFamilies": len({sample.family for sample in train}),
        "holdoutFamilies": len({sample.family for sample in holdout}),
        "maps": dict(sorted(Counter(sample.map_name for sample in samples).items())),
    }
    _write_json_new(args.out_dir / "identity.json", {
        "schema": "v19_path3_distill_identity_1", "identity": identity, "sampleSummary": summary,
        "manifestOutput": manifest["output"],
    })
    print(f"[Path3蒸馏] arm={args.arm} train={len(train)} holdout={len(holdout)} data={identity['dataSha256'][:12]}")

    rows: list[dict[str, Any]] = []
    checkpoint_steps = {2} if args.smoke else set(config["checkpointSteps"])
    state_path = args.out_dir / "train_state.pt"
    stopped_by_kl = False
    stop_kl = None
    for step in range(1, effective_updates + 1):
        batch = sampler.sample(BATCH_SIZE)
        current = policy_logits(model, batch, args.arm)
        initial = reference.get_many(batch)
        targets, selected_ranks = frozen_reference_targets(
            initial, [sample.teacher_q for sample in batch],
            [sample.teacher_ranks for sample in batch], float(config["teacherMix"]),
        )
        loss, parts = distillation_objective(
            current, initial, targets, float(config["klCoefficient"])
        )
        pre_step_kl = float(parts["referenceKl"].detach())
        if pre_step_kl > float(config["klStop"]):
            stopped_by_kl = True
            stop_kl = pre_step_kl
            break
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        grad_norm = float(torch.nn.utils.clip_grad_norm_(trainable, GRAD_CLIP))
        optimizer.step()
        with torch.no_grad():
            post = policy_logits(model, batch, args.arm)
            _, post_parts = distillation_objective(
                post, initial, targets, float(config["klCoefficient"])
            )
        row = {
            "update": step,
            "lossBeforeStep": float(loss.detach()),
            "teacherCeBeforeStep": float(parts["teacherCe"].detach()),
            "referenceKlBeforeStep": float(parts["referenceKl"].detach()),
            "teacherCeAfterStep": float(post_parts["teacherCe"]),
            "referenceKlAfterStep": float(post_parts["referenceKl"]),
            "actionChangeRateAfterStep": float(post_parts["actionChangeRate"]),
            "referenceArgmaxTeacherRankMean": sum(selected_ranks) / len(selected_ranks),
            "referenceTopInTeacherTopSetRate": sum(rank == 0 for rank in selected_ranks) / len(selected_ranks),
            "gradNormBeforeClip": grad_norm,
            "batchSamplesSha256": canonical_sha256([
                {"sampleId": sample.sample_id, "inputIdentity": sample.input_identity} for sample in batch
            ]),
            "batchJointCounts": copy.deepcopy(sampler.last_counts),
        }
        rows.append(row)
        if step % 25 == 0 or step in checkpoint_steps:
            print(f"[Path3蒸馏] arm={args.arm} update={step}/{effective_updates} ce={row['teacherCeAfterStep']:.6f} kl={row['referenceKlAfterStep']:.6f}")
        if step % 25 == 0 or step in checkpoint_steps:
            _save_state(state_path, model, optimizer, step, identity, sampler, rows)
        if step in checkpoint_steps:
            if not _critic_exact(model, critic_initial):
                raise AssertionError("冻结的 trunk/value 参数发生变化")
            control_zero = bool(torch.count_nonzero(
                model.pol_dense1.weight[:, PREFIX_DIM:PREFIX_DIM + PATH3_DIM]
            ).item() == 0)
            if args.arm == "control" and not control_zero:
                raise AssertionError("control 臂新增三列不再全零")
            model_path = args.out_dir / f"{args.arm}_u{step:04d}.json"
            export_model(model, template, model_path)
            _write_json_new(args.out_dir / f"{args.arm}_u{step:04d}.metrics.json", {
                "schema": "v19_path3_distill_metrics_1",
                "arm": args.arm,
                "updatesPerformed": step,
                "identity": identity,
                "latestTrain": row,
                "holdout": _monitor(model, reference, holdout, args.arm, float(config["teacherMix"])),
                "criticExactFrozen": True,
                "controlPath3ColumnsStillZero": control_zero if args.arm == "control" else None,
                "initialPath3ColumnsZero": bool(torch.count_nonzero(initial_path_columns).item() == 0),
                "output": {"path": model_path.as_posix(), "sha256": sha256_file(model_path)},
                "holdoutCaveat": "训练源内部家族隔离诊断，不作为独立棋力证据。",
            })
    completed = int(rows[-1]["update"]) if rows else 0
    _save_state(state_path, model, optimizer, completed, identity, sampler, rows, stopped_by_kl)
    early_stop_export = None
    if stopped_by_kl and completed not in checkpoint_steps:
        if not _critic_exact(model, critic_initial):
            raise AssertionError("早停端点的冻结 trunk/value 参数发生变化")
        early_control_zero = bool(torch.count_nonzero(
            model.pol_dense1.weight[:, PREFIX_DIM:PREFIX_DIM + PATH3_DIM]
        ).item() == 0)
        initial_path_zero = bool(torch.count_nonzero(initial_path_columns).item() == 0)
        if args.arm == "control" and not early_control_zero:
            raise AssertionError("control 臂早停端点的新增三列不再全零")
        early_model = args.out_dir / f"{args.arm}_earlystop_u{completed:04d}.json"
        export_model(model, template, early_model)
        early_metrics = args.out_dir / f"{args.arm}_earlystop_u{completed:04d}.metrics.json"
        _write_json_new(early_metrics, {
            "schema": "v19_path3_distill_metrics_1",
            "arm": args.arm,
            "updatesPerformed": completed,
            "stoppedByKl": True,
            "stopMeanKlBeforeStep": stop_kl,
            "identity": identity,
            "latestTrain": rows[-1] if rows else None,
            "holdout": _monitor(model, reference, holdout, args.arm, float(config["teacherMix"])),
            "criticExactFrozen": True,
            "controlPath3ColumnsStillZero": early_control_zero if args.arm == "control" else None,
            "initialPath3ColumnsZero": initial_path_zero,
            "output": {"path": early_model.as_posix(), "sha256": sha256_file(early_model)},
        })
        early_stop_export = completed
    final_control_zero = bool(torch.count_nonzero(
        model.pol_dense1.weight[:, PREFIX_DIM:PREFIX_DIM + PATH3_DIM]
    ).item() == 0)
    if args.arm == "control" and not final_control_zero:
        raise AssertionError("control 臂最终新增三列不再全零")
    _write_json_new(args.out_dir / "summary.json", {
        "schema": "v19_path3_distill_summary_1",
        "arm": args.arm,
        "updatesRequested": effective_updates,
        "updatesPerformed": completed,
        "stoppedByKl": stopped_by_kl,
        "stopMeanKlBeforeStep": stop_kl,
        "earlyStopExport": early_stop_export,
        "fixedExports": [step for step in sorted(checkpoint_steps)
                         if (args.out_dir / f"{args.arm}_u{step:04d}.json").is_file()],
        "criticExactFrozen": _critic_exact(model, critic_initial),
        "controlPath3ColumnsStillZero": final_control_zero if args.arm == "control" else None,
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
