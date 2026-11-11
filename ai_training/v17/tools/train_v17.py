"""
AncientEmpires - Spatial ResNet Offline Training Pipeline (Path B)

Loads spatial dataset (.jsonl), trains 2D Convolutional ResNet with
hierarchical candidate action scoring & value head, and exports weights
directly to TypeScript-loadable JSON format.

=======================================================================
V17/T17-02 copy:  v17/tools/train_v17.py
=======================================================================
本文件是 `python/train_spatial_resnet.py` 的**逐字副本**（复制时 SHA256
D6CB5AC32ECD7E4CF699C53A28F13F127F62DC9D84EB641929774C61857D4220），
只加了下面列出的可选项。共享 trainer 文件本身未被修改（另一个 worker 可能仍在使用）。

--- 精确 diff 清单（相对 python/train_spatial_resnet.py）--------------------
[0] 迁移性改动（非行为改动，必须）：
    在 import 之前把 `<repo>/python` 插入 sys.path，因为本文件位于 `v17/tools/`，
    否则 `from spatial_resnet_model import ...` 找不到模块。不改变任何训练数学。

[1] 新增可选开关 `--trainable-parts`（默认 "trunk,policy,value" = 全部可训练）
    位置：模型构造与 --init-checkpoint 载入之后、optim.AdamW 构造之前。
    行为：对未列出的部分执行 requires_grad_(False)，并把它们从优化器参数组中排除。
    模块名映射**按 python/spatial_resnet_model.py 的真实 named_parameters 核对**：
        trunk  -> stem, res_blocks.<i>.conv1, res_blocks.<i>.conv2
        value  -> val_dense1, val_dense2
        policy -> pol_dense1, pol_dense2
    启动时打印每个参数的 (name, part, requires_grad, numel) 与分组汇总，便于复核。
    额外护栏：--trainable-parts 非全量时禁止与 --resume-state 同用（优化器状态与
    参数组不再等价，拒绝静默错配）；错误的部分名直接报错。

[2] 新增可选开关 `--value-loss-normalize`（默认 "legacy-batch"）
    先说明**上游已经做到的部分**：value MSE 本来就是按「有效 value target 的行数」平均的
    （`mse_loss_fn(val_p, val_t)` 只对 value_valid 的行计算），因此 **value 侧无需新增开关**，
    本文件也没有改它。
    真正缺的是 policy CE 的分母：上游是 `batch_pol_loss / max(1, batch_size)`，
    即 policyLossMask=false 的行损失为 0 但仍占分母。
    `--value-loss-normalize valid-mask` 把 policy CE 改成按 policyLossMask=true 的行数平均。
    为什么默认是 "legacy-batch" 而不是 "valid-mask"：本任务硬性要求
    「不加新开关时行为与 python/train_spatial_resnet.py 完全一致」，而改变分母会改变默认数学。
    T17-02 的三次真实运行显式传入 `--value-loss-normalize valid-mask`；
    本数据集 policyLossMask=false 的行数为 0（见 value_label_audit.json），
    因此两种模式在此数据上数值等价——每个 epoch 都会打印两个分母以便当场核对。
    每个 epoch 追加打印并写入 metrics：policy/value 的有效行数、掩码行数、实际使用的分母。

[3] 纯记录性改动（不参与任何数学）：
    history 每条 epoch 增加 "maskAccounting"；metrics 顶层增加 "maskAccounting" 与
    "v17ValueSupervision"（trainableParts / 冻结参数清单 / 参数组统计）。
    `identity` 字典**未改动**，因此默认开关下与上游的 resume 身份完全兼容。
--------------------------------------------------------------------------
"""

import os
import sys
import json
import copy
import shutil
import argparse
import time
import itertools
from typing import List, Dict, Any, Tuple

# [V17/T17-02 diff 0] 本文件位于 v17/tools/，把 <repo>/python 放到 sys.path 前面，
# 以便 import spatial_resnet_model。纯迁移性改动，不影响训练数学。
_V17_HERE = os.path.dirname(os.path.abspath(__file__))
_V17_PY_DIR = os.path.join(os.path.dirname(os.path.dirname(_V17_HERE)), "python")
if os.path.isdir(_V17_PY_DIR) and _V17_PY_DIR not in sys.path:
    sys.path.insert(0, _V17_PY_DIR)

try:
    import numpy as np
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import Dataset, DataLoader, random_split
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False


if not TORCH_AVAILABLE:
    def main():
        print("Error: PyTorch and NumPy are required to execute train_spatial_resnet.py.")
        print("Please install them via: pip install torch numpy")
        sys.exit(1)
else:
    from spatial_resnet_model import SpatialResNet, export_model_to_ts_json, load_model_from_ts_json

    def _sha256_file(path: str, chunk: int = 1 << 20) -> str:
        """V13/T13-00: real file digest. Never report a Git blob ID as a SHA-256."""
        import hashlib
        h = hashlib.sha256()
        with open(path, "rb") as fh:
            while True:
                block = fh.read(chunk)
                if not block:
                    break
                h.update(block)
        return h.hexdigest()

    def _atomic_replace(tmp_path: str, final_path: str, attempts: int = 8) -> None:
        """V14/T14-04: 带有限重试的原子替换。

        Windows 上 `os.replace` 会因杀毒/索引短暂持有目标文件句柄而抛
        `PermissionError: [WinError 5]`（T14-04 首次 tiny-fit 在 epoch 202 就是这样中断的）。
        这里做有限次退避重试，最后一次退化为「先删目标再改名」，
        避免长训练因为一次瞬时占用丢掉整轮进度。写入始终在 tmp 上完成，
        因此不会留下半写文件。
        """
        import time
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                os.replace(tmp_path, final_path)
                return
            except PermissionError as error:  # pragma: no cover - 依赖 Windows 文件占用行为
                last_error = error
                time.sleep(0.2 * (attempt + 1))
        try:
            if os.path.exists(final_path):
                os.remove(final_path)
            os.replace(tmp_path, final_path)
        except OSError:
            if last_error is not None:
                raise last_error
            raise

    class ConsumptionRecorder:
        """
        V11/T11-03: measured optimizer consumption.

        The V10 pipeline wrote a "consumed" manifest *before* training, from the
        planned index split, and then validated DAgger coverage against that same
        file - a closed loop that could not fail. This recorder only accumulates
        after a successful optimizer.step().
        """

        def __init__(self) -> None:
            self.updates = 0
            self.unique_sample_ids: set = set()
            # V15/T15-03：数据契约 §7 要求的累计消费维度。dataset 里缺某字段时保持
            # 空集合，并在 to_json 里用 *_available=false 明确说明，不伪造读数。
            self.unique_policy_input_keys: set = set()
            self.unique_source_state_keys: set = set()
            self.unique_root_families: set = set()
            self.total_exposures = 0
            self.value_supervised = 0
            self.value_masked = 0
            self.policy_masked = 0
            self.exposures_by_source: Dict[str, int] = {}
            self.exposures_by_partition: Dict[str, int] = {}
            self.lr_trace: List[Dict[str, Any]] = []
            self.per_epoch: Dict[int, Dict[str, int]] = {}
            self.updates_by_epoch: Dict[int, int] = {}
            self.update_log: List[Dict[str, Any]] = []

        def record_update(self, *, epoch: int, samples: List[Any], policy_masked: int,
                          value_masked: int, value_used: int,
                          lr: float | None = None,
                          sample_meta: List[Dict[str, Any]] | None = None,
                          sources: Dict[str, int] | None = None,
                          duration_ms: float | None = None) -> None:
            ids = [str(s) for s in samples if s is not None]
            self.updates += 1
            self.total_exposures += len(ids)
            self.unique_sample_ids.update(ids)
            self.policy_masked += int(policy_masked)
            self.value_masked += int(value_masked)
            self.value_supervised += int(value_used)
            for _meta in (sample_meta or []):
                if not _meta:
                    continue
                _pik = _meta.get("policyInputKey")
                if _pik:
                    self.unique_policy_input_keys.add(str(_pik))
                _ssk = _meta.get("sourceStateKey")
                if _ssk:
                    self.unique_source_state_keys.add(str(_ssk))
                _root = _meta.get("rootFamilyId")
                if _root:
                    self.unique_root_families.add(str(_root))
                _part = _meta.get("partition")
                if _part:
                    self.exposures_by_partition[str(_part)] = (
                        self.exposures_by_partition.get(str(_part), 0) + 1)
            for _name, _count in (sources or {}).items():
                self.exposures_by_source[str(_name)] = (
                    self.exposures_by_source.get(str(_name), 0) + int(_count))
            bucket = self.per_epoch.setdefault(epoch, {
                "updates": 0, "exposures": 0, "policy_masked": 0,
                "value_masked": 0, "value_supervised": 0,
            })
            bucket["updates"] += 1
            bucket["exposures"] += len(ids)
            bucket["policy_masked"] += int(policy_masked)
            bucket["value_masked"] += int(value_masked)
            bucket["value_supervised"] += int(value_used)
            self.updates_by_epoch[epoch] = self.updates_by_epoch.get(epoch, 0) + 1
            entry: Dict[str, Any] = {
                "epoch": epoch, "update": self.updates, "updateIndex": self.updates - 1,
                "batchSize": len(ids),
                "sampleIds": ids, "policyMasked": int(policy_masked),
                "valueMasked": int(value_masked), "valueSupervised": int(value_used),
            }
            if lr is not None:
                entry["lr"] = float(lr)
                self.lr_trace.append({
                    "updateIndex": self.updates - 1,
                    "update": self.updates,
                    "epoch": epoch,
                    "lr": float(lr),
                })
            if sources is not None:
                entry["sources"] = {str(k): int(v) for k, v in sources.items()}
            if duration_ms is not None:
                entry["durationMs"] = float(duration_ms)
            self.update_log.append(entry)

        def to_json(self, planned_train_rows: int, batch_size: int,
                    *, planned_updates: int | None = None,
                    extra: Dict[str, Any] | None = None) -> Dict[str, Any]:
            payload = {
                "schema": "v15_optimizer_consumption_2",
                "measured": True,
                "method": "accumulated only after a successful optimizer.step()",
                "plannedTrainRows": planned_train_rows,
                "batchSize": batch_size,
                "updates": self.updates,
                "maxExampleExposures": self.updates * batch_size,
                "totalExposures": self.total_exposures,
                "optimizedUniqueSamples": len(self.unique_sample_ids),
                "plannedButNeverOptimized": max(0, planned_train_rows - len(self.unique_sample_ids)),
                "policyMaskedExposures": self.policy_masked,
                "valueSupervisedExposures": self.value_supervised,
                "valueMaskedExposures": self.value_masked,
                "uniquePolicyInputKeys": len(self.unique_policy_input_keys),
                "uniqueSourceStateKeys": len(self.unique_source_state_keys),
                "uniqueRootFamilies": len(self.unique_root_families),
                "exposuresBySource": dict(sorted(self.exposures_by_source.items())),
                "exposuresByPartition": dict(sorted(self.exposures_by_partition.items())),
                "updatesByEpoch": {str(k): v for k, v in sorted(self.updates_by_epoch.items())},
                "perEpoch": {str(k): v for k, v in sorted(self.per_epoch.items())},
            }
            if planned_updates is not None:
                payload["plannedUpdates"] = int(planned_updates)
                payload["plannedButNeverUpdated"] = max(0, int(planned_updates) - self.updates)
            if extra:
                payload.update(extra)
            return payload

        def to_state(self) -> Dict[str, Any]:
            """可恢复的累计消费游标（不含逐 update 日志，日志在 ledger 文件里）。"""
            return {
                "updates": self.updates,
                "totalExposures": self.total_exposures,
                "policyMasked": self.policy_masked,
                "valueMasked": self.value_masked,
                "valueSupervised": self.value_supervised,
                "uniqueSampleIds": sorted(self.unique_sample_ids),
                "uniquePolicyInputKeys": sorted(self.unique_policy_input_keys),
                "uniqueSourceStateKeys": sorted(self.unique_source_state_keys),
                "uniqueRootFamilies": sorted(self.unique_root_families),
                "exposuresBySource": dict(self.exposures_by_source),
                "exposuresByPartition": dict(self.exposures_by_partition),
                "perEpoch": {str(k): dict(v) for k, v in self.per_epoch.items()},
                "updatesByEpoch": {str(k): int(v) for k, v in self.updates_by_epoch.items()},
                "lrLast": (self.lr_trace[-1]["lr"] if self.lr_trace else None),
            }

        def from_state(self, state: Dict[str, Any]) -> None:
            """恢复累计消费。恢复的是「同一逻辑运行」的累计量，不是重新从 0 开始。"""
            self.updates = int(state.get("updates", 0))
            self.total_exposures = int(state.get("totalExposures", 0))
            self.policy_masked = int(state.get("policyMasked", 0))
            self.value_masked = int(state.get("valueMasked", 0))
            self.value_supervised = int(state.get("valueSupervised", 0))
            self.unique_sample_ids = set(str(x) for x in state.get("uniqueSampleIds", []))
            self.unique_policy_input_keys = set(str(x) for x in state.get("uniquePolicyInputKeys", []))
            self.unique_source_state_keys = set(str(x) for x in state.get("uniqueSourceStateKeys", []))
            self.unique_root_families = set(str(x) for x in state.get("uniqueRootFamilies", []))
            self.exposures_by_source = {str(k): int(v)
                                        for k, v in (state.get("exposuresBySource") or {}).items()}
            self.exposures_by_partition = {str(k): int(v)
                                           for k, v in (state.get("exposuresByPartition") or {}).items()}
            self.per_epoch = {int(k): dict(v) for k, v in (state.get("perEpoch") or {}).items()}
            self.updates_by_epoch = {int(k): int(v)
                                     for k, v in (state.get("updatesByEpoch") or {}).items()}

    class SpatialDataset(Dataset):
        # V14/T14-03：动作语义维度由数据自身决定（32 = 历史 v2，48 = v14 含兵种 one-hot）。
        # 在加载时统计并暴露，供模型构造与校验使用，避免把 48 维数据静默截成 32 维。
        semantic_dim: int = 0
        channels: int = 0
        global_dim: int = 0

        def __init__(self, jsonl_path: str):
            self.samples = []
            _sem_dims: set = set()
            _channels: set = set()
            _global_dims: set = set()
            with open(jsonl_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    s = json.loads(line)
                    # V13/T13-01: non-finite labels are refused rather than silently
                    # propagated into the loss.
                    raw_value = s.get("valueTarget")
                    if raw_value is not None:
                        try:
                            fv = float(raw_value)
                        except (TypeError, ValueError):
                            raise ValueError(
                                f"non-numeric valueTarget {raw_value!r} in sample {s.get('sampleId')!r}"
                            )
                        if not np.isfinite(fv):
                            raise ValueError(
                                f"non-finite valueTarget {raw_value!r} in sample {s.get('sampleId')!r}"
                            )
                        s["valueTarget"] = fv
                    cand_actions = s.get("candidateActions", [])
                    _row_dims = {len(c.get("semantics", [])) for c in cand_actions}
                    if len(_row_dims) > 1:
                        raise ValueError(
                            f"sample {s.get('sampleId')!r}: 同一行出现多种语义维度 {sorted(_row_dims)}"
                        )
                    _sem_dims.update(_row_dims)
                    _channels.add(len(s["spatialTensor"]) // (20 * 20))
                    _global_dims.add(len(s["globalFeatures"]))
                    for c in cand_actions:
                        sem_raw = c.get("semantics", [])
                        # 先按 48 维上界补齐；实际使用长度由 self.semantic_dim 决定。
                        sem_padded = sem_raw[:53] + [0.0] * max(0, 53 - len(sem_raw))
                        c["semantics_padded"] = np.array(sem_padded, dtype=np.float32)

                    # V13/T13-01: an explicit mask that contradicts the target used to
                    # produce a batch where the prediction filter and the target filter
                    # disagreed. Refuse the dataset instead of broadcasting silently.
                    if "valueLossMask" in s:
                        explicit = bool(s.get("valueLossMask"))
                        has_target = s.get("valueTarget") is not None
                        if explicit != has_target:
                            raise ValueError(
                                f"sample {s.get('sampleId')!r}: valueLossMask={explicit} contradicts "
                                f"valueTarget={s.get('valueTarget')!r}. V13/T13-01 requires the value "
                                "mask and the value target to describe the same rows."
                            )

                    self.samples.append({
                        "sampleId": s.get("sampleId"),
                        # V14/T14-03：通道数由数据自身决定，避免把 26 通道数据静默 reshape 成 24 通道。
                        "spatial_tensor": np.array(s["spatialTensor"], dtype=np.float32).reshape(-1, 20, 20),
                        "global_features": np.array(s["globalFeatures"], dtype=np.float32),
                        "candidates": cand_actions,
                        "target_idx": s.get("targetActionIndex", 0),
                        "value_target": s.get("valueTarget"),
                        "episodeId": s.get("episodeId"),
                        "rootFamilyId": s.get("rootFamilyId"),
                        "teacherQ": s.get("teacherQ"),
                        "equivalenceGroups": s.get("equivalenceGroups"),
                        "teacherSoftTargets": s.get("teacherSoftTargets"),
                        # V11/T11-03: supervision masks. Defaults keep older datasets
                        # (which have no mask fields) behaviourally identical.
                        #
                        # V13/T13-01: the default for valueLossMask is now derived from the
                        # SAME predicate the loss uses for the target, so prediction and
                        # target filtering can never disagree. Datasets that carry an
                        # explicit valueLossMask that contradicts valueTarget are refused.
                        "policyLossMask": s.get("policyLossMask", True),
                        "valueLossMask": s.get("valueLossMask", s.get("valueTarget") is not None),
                        "stateHash": s.get("stateHash"),
                        "encoderSchema": s.get("encoderSchema"),
                        # V15/T15-03：数据契约 §7 的消费台账需要能按输入身份去重。
                        # 数据集缺字段时如实写 None，不伪造。
                        "policyInputKey": s.get("policyInputKey"),
                        "sourceStateKey": s.get("sourceStateKey"),
                        "partition": s.get("partition"),
                    })

            if len(_sem_dims) != 1:
                raise ValueError(
                    f"{jsonl_path}: 数据集出现多种候选语义维度 {sorted(_sem_dims)}；"
                    "拒绝继续（同一数据集必须来自同一编码器 schema）。"
                )
            if len(_channels) != 1:
                raise ValueError(f"{jsonl_path}: 数据集出现多种空间张量长度 {sorted(_channels)}")
            if len(_global_dims) != 1:
                raise ValueError(f"{jsonl_path}: 数据集出现多种全局特征维度 {sorted(_global_dims)}")
            self.semantic_dim = _sem_dims.pop()
            self.channels = _channels.pop()
            self.global_dim = _global_dims.pop()
            print(f"Loaded {len(self.samples)} spatial samples from {jsonl_path} "
                  f"(channels={self.channels}, global={self.global_dim}, semantics={self.semantic_dim})")

        def __len__(self) -> int:
            return len(self.samples)

        def __getitem__(self, idx: int) -> Dict[str, Any]:
            return self.samples[idx]


    def pool_coords_batch(z: torch.Tensor, coords: List[Any]) -> torch.Tensor:
        """
        Vectorized pooling of [K, 32] feature vectors from z [32, 20, 20] across K coordinates.
        """
        K = len(coords)
        if K == 0:
            return torch.zeros((0, 32), dtype=torch.float32, device=z.device)
        y = []
        x = []
        valid = []
        for c in coords:
            if c is not None and isinstance(c, dict) and "x" in c and "y" in c:
                cx, cy = c["x"], c["y"]
                if 0 <= cx < 20 and 0 <= cy < 20:
                    x.append(cx)
                    y.append(cy)
                    valid.append(1.0)
                    continue
            x.append(0)
            y.append(0)
            valid.append(0.0)
        y_t = torch.tensor(y, dtype=torch.long, device=z.device)
        x_t = torch.tensor(x, dtype=torch.long, device=z.device)
        val_t = torch.tensor(valid, dtype=torch.float32, device=z.device).unsqueeze(-1)
        pooled = z[:, y_t, x_t].permute(1, 0)
        return pooled * val_t


    # ------------------------------------------------------------------
    # V15/T15-03：确定性 batch plan、按 update 的 LR 调度、恢复身份校验。
    # ------------------------------------------------------------------

    V15_BATCH_PLAN_SCHEMA = "v15_batch_plan_1"
    # V13 的 state 只有 epoch/model/optimizer/scheduler/rng/updates；
    # V15 起要求累计消费、采样游标与身份，缺字段时拒绝「精确恢复」。
    V15_STATE_SCHEMA = "v15_train_state_2"
    V15_STATE_REQUIRED_FIELDS = (
        "schema",
        "identity",
        "updates",
        "totalExposures",
        "epoch",
        "updatesInEpoch",
        "model",
        "optimizer",
        "scheduler",
        "rng",
        "consumption",
    )

    class ResumeIdentityError(RuntimeError):
        """恢复身份与当前运行不一致。拒绝精确 resume，而不是假装等价续跑。"""

    def load_batch_plan(path: str) -> Dict[str, Any]:
        """读取并校验冻结的确定性 batch plan。

        plan 是「每个 update 用哪些数据行」的显式清单，支持每步按来源配额（例如 16+16）。
        它让曝光由计划文件保证，而不是靠复制 JSONL 长度去近似。
        """
        with open(path, "r", encoding="utf-8") as fh:
            plan = json.load(fh)
        if plan.get("schema") != V15_BATCH_PLAN_SCHEMA:
            raise ValueError(
                f"batch plan {path!r} 的 schema 是 {plan.get('schema')!r}，"
                f"要求 {V15_BATCH_PLAN_SCHEMA!r}"
            )
        batch_size = int(plan.get("batchSize", 0))
        if batch_size <= 0:
            raise ValueError(f"batch plan {path!r}: batchSize 必须为正整数")
        updates_per_epoch = int(plan.get("updatesPerEpoch", 0))
        if updates_per_epoch <= 0:
            raise ValueError(
                f"batch plan {path!r}: 必须声明 updatesPerEpoch>0（它同时决定验证/保存频率）"
            )
        sources = plan.get("sources") or []
        source_names = [str(s.get("name")) for s in sources]
        if len(set(source_names)) != len(source_names):
            raise ValueError(f"batch plan {path!r}: 来源名重复")
        quotas = {str(s.get("name")): int(s.get("quota", 0)) for s in sources}
        if sum(quotas.values()) != batch_size:
            raise ValueError(
                f"batch plan {path!r}: 各来源配额之和 {sum(quotas.values())} != batchSize {batch_size}"
            )
        updates = plan.get("updates") or []
        if int(plan.get("totalUpdates", len(updates))) != len(updates):
            raise ValueError(
                f"batch plan {path!r}: totalUpdates 与 updates 条目数 {len(updates)} 不一致"
            )
        for idx, entry in enumerate(updates):
            if int(entry.get("updateIndex", idx)) != idx:
                raise ValueError(f"batch plan {path!r}: 第 {idx} 条的 updateIndex 不是 {idx}")
            items = entry.get("items") or []
            if len(items) != batch_size:
                raise ValueError(
                    f"batch plan {path!r}: update {idx} 有 {len(items)} 项，期望 {batch_size}"
                )
            counts: Dict[str, int] = {}
            for item in items:
                name = str(item.get("source"))
                if name not in quotas:
                    raise ValueError(f"batch plan {path!r}: update {idx} 出现未声明来源 {name!r}")
                counts[name] = counts.get(name, 0) + 1
                if item.get("datasetRow") is None:
                    raise ValueError(f"batch plan {path!r}: update {idx} 有缺失 datasetRow 的项")
            if counts != {k: v for k, v in quotas.items() if v > 0}:
                raise ValueError(
                    f"batch plan {path!r}: update {idx} 的来源配额 {counts} 与声明 {quotas} 不符"
                )
        plan["_resolvedPath"] = os.path.abspath(path)
        return plan

    class PlanBatchSampler:
        """按冻结 plan 逐 update 产出数据集行索引。

        给定 (plan, start, count) 的输出序列完全确定，与 DataLoader shuffle/generator 无关，
        因此「第 k 步保存后恢复」可以精确续上同一条采样序列。

        V15/T15-08：`row_to_position` 必须把 plan 里的**全量数据集行号**映射成
        `train_data`（一个 Subset）的**位置**。

        为什么需要它（真实缺陷，本会话实测）：plan 里的 `datasetRow` 是全量文件的绝对行号，
        但 `train_data = Subset(full_dataset, train_indices)`，其 `__getitem__(i)` 取的是
        `full_dataset[train_indices[i]]`。只有在「train 行恰好是文件前缀」时绝对行号才等于位置
        —— 这正是 C2 数据集的情形（train 6140 行在前），所以 C2 训练没有暴露这个错误。
        D1/D2 的数据集把新池行追加在 train+val 之后，plan 引用的行号 ≥ len(train_indices)，
        于是 DataLoader 直接用绝对行号索引 Subset，抛
        `IndexError: list index out of range`（D1/D2 seed 42 因此失败，D0 因为池全在 train 前缀内而成功）。

        显式映射后，「plan 的行号」与「Subset 的位置」是两个独立概念，不再依赖文件布局。
        """

        def __init__(self, updates: List[Dict[str, Any]], *, start: int = 0,
                     count: int | None = None,
                     row_to_position: Dict[int, int] | None = None) -> None:
            self._updates = updates
            self._row_to_position = row_to_position
            self.start = max(0, int(start))
            end = len(updates) if count is None else min(len(updates), self.start + int(count))
            self.end = max(self.start, end)

        def _position(self, row: int) -> int:
            if self._row_to_position is None:
                return row
            if row not in self._row_to_position:
                raise ValueError(
                    f"batch plan 引用的行 {row} 不在 train 分区内；调用方本应在此之前拒绝。"
                )
            return self._row_to_position[row]

        def __iter__(self):
            for entry in self._updates[self.start:self.end]:
                yield [self._position(int(item["datasetRow"])) for item in entry["items"]]

        def __len__(self) -> int:
            return self.end - self.start

    class SkipBatches:
        """跳过已消费 batch 的包装器，用于「epoch 中途暂停后继续」的精确续跑。

        关键点：RandomSampler 在 __iter__ 开始时用 generator 抽一次排列，所以只要把
        generator 恢复到该 epoch 开始时（尚未抽签）的状态，再跳过前 k 个 batch，
        余下的 batch 序列与连续运行完全一致。
        """

        def __init__(self, loader: Any, skip: int) -> None:
            self._loader = loader
            self._skip = max(0, int(skip))

        def __iter__(self):
            return itertools.islice(iter(self._loader), self._skip, None)

        def __len__(self) -> int:
            try:
                return max(0, len(self._loader) - self._skip)
            except TypeError:  # pragma: no cover - 仅当底层 loader 无长度时
                return 0

    def plan_batch_sources(updates: List[Dict[str, Any]], *, start: int = 0,
                           count: int | None = None) -> List[Dict[str, int]]:
        """与 PlanBatchSampler 一一对应的来源配额列表（写台账用）。"""
        end = len(updates) if count is None else min(len(updates), int(start) + int(count))
        out: List[Dict[str, int]] = []
        for entry in updates[int(start):max(int(start), end)]:
            counts: Dict[str, int] = {}
            for item in entry["items"]:
                name = str(item["source"])
                counts[name] = counts.get(name, 0) + 1
            out.append(counts)
        return out

    def make_update_lr_fn(lr_max: float, lr_min: float, total_updates: int, schedule: str):
        """协议 §3.1：第 u 次更新（u=0..U-1）使用
        lr = lrMin + (lrMax-lrMin)*(1+cos(pi*u/(U-1)))/2；U=1 用 lrMax。
        """
        import math
        if total_updates < 1:
            raise ValueError("按 update 调度要求 totalUpdates >= 1")
        if schedule == "constant":
            return lambda u: float(lr_max)
        if total_updates == 1:
            return lambda u: float(lr_max)

        def _cosine(u: int) -> float:
            uu = min(max(int(u), 0), total_updates - 1)
            return float(lr_min + (lr_max - lr_min) * (1.0 + math.cos(math.pi * uu / (total_updates - 1))) / 2.0)

        return _cosine

    def collect_rng_state(order_generator: Any = None) -> Dict[str, Any]:
        """保存全部随机流：Python / NumPy / Torch / DataLoader 的 shuffle generator。"""
        import random as _random
        return {
            "torch": torch.get_rng_state(),
            "numpy": np.random.get_state(),
            "python": _random.getstate(),
            "dataOrderGenerator": (order_generator.get_state()
                                   if order_generator is not None else None),
        }

    def restore_rng_state(rng_state: Dict[str, Any], order_generator: Any = None) -> None:
        import random as _random
        if rng_state.get("torch") is not None:
            _t = rng_state["torch"]
            torch.set_rng_state(_t.cpu() if hasattr(_t, "cpu") else _t)
        if rng_state.get("numpy") is not None:
            np.random.set_state(rng_state["numpy"])
        if rng_state.get("python") is not None:
            _random.setstate(rng_state["python"])
        if order_generator is not None and rng_state.get("dataOrderGenerator") is not None:
            order_generator.set_state(rng_state["dataOrderGenerator"])

    def run_epoch(
        model: SpatialResNet,
        dataloader: DataLoader,
        optimizer: optim.Optimizer | None,
        device: torch.device,
        value_weight: float = 0.5,
        is_train: bool = True,
        max_steps: int | None = None,
        *,
        epoch: int = 1,
        # V11/T11-03: hard cap on optimizer steps for the WHOLE run, distinct from
        # `max_steps`, which resets every epoch.
        global_update_limit: int | None = None,
        updates_before_epoch: int = 0,
        recorder: "ConsumptionRecorder | None" = None,
        loss_mode: str = "ce",
        teacher_temperature: float = 1.0,
        soft_weight: float = 0.5,
        equiv_weight: float = 0.5,
        legacy_bug_repro: bool = False,
        # V15/T15-03：以下三个是新增的可选出参/钩子，默认不改变旧行为。
        # status        —— 被就地填写的运行状态（本 epoch 真实更新数、是否撞到总预算）。
        # lr_at_update  —— 按「全局第 u 次更新」给出实际学习率（u 从 0 开始）。
        # batch_sources —— 与本 epoch 的 batch 一一对应的来源配额（来自确定性 batch plan）。
        status: Dict[str, Any] | None = None,
        lr_at_update: Any = None,
        batch_sources: List[Dict[str, int]] | None = None,
        # [V17/T17-02 diff 2] 损失分母模式与逐 epoch 掩码台账（默认值 = 上游行为）。
        value_loss_normalize: str = "legacy-batch",
        mask_stats: Dict[str, Any] | None = None,
        # V18/T18-04：冻结参考模型与 KL 权重。默认 None / 0.0 ⇒ 与上游行为一致。
        frozen_ref: SpatialResNet | None = None,
        kl_weight: float = 0.0,
        # V19/T19-00：按「真实 optimizer 更新序号」触发的检查点钩子。
        #
        # 旧实现在 main() 的 epoch 循环末尾比较 `consumption.updates == 保存点`，
        # 只要保存点落在 epoch 中间（例如 U/K 每 epoch 255 次更新时的 1000、2000）
        # 就永远不相等，1k/2k 检查点因此从未产出（V18 复核 §2.3）。
        # 钩子在这里拿到的是**本次 optimizer.step() 之后**的累计更新数，
        # 因此命中条件与真实更新一一对应，不再依赖 epoch 边界。
        update_checkpoint_hook: Any = None,
    ) -> Tuple[float, float, float]:
        if is_train:
            model.train()
        else:
            model.eval()

        total_loss = 0.0
        total_pol_loss = 0.0
        total_val_loss = 0.0
        correct_actions = 0
        total_actions = 0
        steps_run = 0
        batches_accumulated = 0
        samples_seen = 0

        ce_loss_fn = nn.CrossEntropyLoss()
        mse_loss_fn = nn.MSELoss()

        with torch.set_grad_enabled(is_train):
            batch_in_epoch = 0
            for batch in dataloader:
                if is_train and optimizer:
                    # V11/T11-03: the global cap is checked against the *measured*
                    # update count, so it holds across epoch boundaries.
                    #
                    # V15/T15-03：这里只负责「本 epoch 内不再多走一步」；到达总预算后
                    # 由 main() 的 epoch 循环正常退出，不再进入下一个空 epoch。
                    if global_update_limit is not None and (updates_before_epoch + steps_run) >= global_update_limit:
                        break
                    optimizer.zero_grad()
                masked_policy_samples = 0
                masked_value_samples = 0
                # [V17/T17-02] 有候选、因而真正参与 policy CE 的行数（用于 valid-mask 分母）。
                policy_scored_samples = 0
                # V18/T18-04：KL 项的实际读数额（有 KL 时才增长）。
                kl_accum = 0.0
                kl_rows = 0
                _batch_start = time.perf_counter()

                spatial_t = batch["spatial_tensor"].to(device)  # [B, C, 20, 20]
                global_f = batch["global_features"].to(device)  # [B, G]
                # V15/T15-03：非有限输入必须作为真实错误上报，而不是让 NaN 悄悄流进
                # loss 后与「零消费 epoch」混为一谈。
                if not torch.isfinite(spatial_t).all():
                    raise RuntimeError(
                        "non-finite input: spatial_tensor of epoch "
                        f"{epoch} batch {batch_in_epoch} contains NaN/Inf "
                        f"(sampleIds={batch.get('sample_ids')})"
                    )
                if not torch.isfinite(global_f).all():
                    raise RuntimeError(
                        "non-finite input: global_features of epoch "
                        f"{epoch} batch {batch_in_epoch} contains NaN/Inf "
                        f"(sampleIds={batch.get('sample_ids')})"
                    )
                is_v2 = getattr(model, "version", "spatial-resnet-v2") == "spatial-resnet-v2"

                # Pad or slice global features for value head
                target_g_dim = 20 if is_v2 else 16
                if global_f.size(-1) < target_g_dim:
                    pad = torch.zeros((global_f.size(0), target_g_dim - global_f.size(-1)), dtype=torch.float32, device=device)
                    global_f_val = torch.cat([global_f, pad], dim=-1)
                else:
                    global_f_val = global_f[:, :target_g_dim]

                # Forward Trunk & Value
                z = model.forward_trunk(spatial_t)  # [B, 32, 20, 20]
                val_pred = model.forward_value(z, global_f_val).squeeze(-1)  # [B]
                global_policy_pool = bool(getattr(model, "global_policy_pool", False))
                gap = torch.mean(z, dim=[2, 3]) if global_policy_pool else None

                batch_size = spatial_t.size(0)
                batch_pol_loss = torch.tensor(0.0, device=device)

                for b in range(batch_size):
                    cand_list = batch["candidates"][b]
                    target_i = batch["target_idx"][b]
                    if len(cand_list) == 0:
                        continue
                    policy_scored_samples += 1

                    K = len(cand_list)
                    z_b = z[b]  # [32, 20, 20]
                    glob_b = global_f_val[b]  # [20 or 16]

                    act_coords = [c.get("actorCoord") for c in cand_list]
                    land_coords = [c.get("landingCoord") for c in cand_list]
                    tgt_coords = [c.get("targetCoord") for c in cand_list]

                    v_act = pool_coords_batch(z_b, act_coords)
                    v_land = pool_coords_batch(z_b, land_coords)
                    v_tgt = pool_coords_batch(z_b, tgt_coords)

                    sem_list = [c["semantics_padded"] for c in cand_list]
                    sem_tensor = torch.from_numpy(np.stack(sem_list, axis=0)).to(device)
                    if not torch.isfinite(sem_tensor).all():
                        raise RuntimeError(
                            "non-finite input: candidate semantics of epoch "
                            f"{epoch} batch {batch_in_epoch} row {b} contains NaN/Inf"
                        )

                    if is_v2:
                        glob_expanded = glob_b.unsqueeze(0).expand(K, -1)
                        cand_feats = torch.cat([v_act, v_land, v_tgt, sem_tensor, glob_expanded], dim=-1)
                        if global_policy_pool:
                            gap_expanded = gap[b].unsqueeze(0).expand(K, -1)
                            cand_feats = torch.cat([cand_feats, gap_expanded], dim=-1)
                    else:
                        if global_policy_pool:
                            raise ValueError("global_policy_pool is only supported for spatial-resnet-v2")
                        sem_24 = sem_tensor[:, :24]
                        cand_feats = torch.cat([v_act, v_land, v_tgt, sem_24], dim=-1)

                    cand_tensor = cand_feats.unsqueeze(0)  # [1, K, pol_dim]
                    logits = model.forward_action_logits(cand_tensor)  # [1, K]

                    target_tensor = torch.tensor([target_i], dtype=torch.long, device=device)
                    loss_terms = [ce_loss_fn(logits, target_tensor)]

                    # Soft ranking loss from trusted teacher scores. teacherQ is
                    # deliberately NOT treated as a value target.
                    teacher_q = batch.get("teacherQ", [None] * batch_size)[b] if isinstance(batch.get("teacherQ", None), list) else None
                    if loss_mode in ("soft", "soft+equiv") and teacher_q is not None:
                        q = torch.tensor(teacher_q, dtype=torch.float32, device=device)[:K]
                        if q.numel() == K:
                            temp = max(1e-6, float(teacher_temperature))
                            soft_target = torch.softmax(q / temp, dim=-1).unsqueeze(0)
                            loss_soft = -(soft_target * torch.log_softmax(logits, dim=-1)).sum()
                            loss_terms.append(float(soft_weight) * loss_soft)

                    # Equivalence-aware group loss: any candidate in the target
                    # action's equivalent group is an acceptable label.
                    groups = batch.get("equivalenceGroups", [None] * batch_size)[b] if isinstance(batch.get("equivalenceGroups", None), list) else None
                    if loss_mode in ("equiv", "soft+equiv") and groups is not None and target_i < len(groups):
                        group = groups[target_i]
                        if group is not None and len(group) > 1:
                            group_t = torch.tensor(group, dtype=torch.long, device=device)
                            loss_equiv = (torch.logsumexp(logits, dim=-1) - torch.logsumexp(logits[0, group_t], dim=-1)).sum()
                            loss_terms.append(float(equiv_weight) * loss_equiv)

                    loss_step = torch.stack(loss_terms).sum()

                    # V18/T18-04：对冻结冠军的 KL 约束（KL(current || frozen)，
                    # 在**同一批候选**上算，因此是真正的同分布约束）。
                    # 中文：这一项只在 --kl-to-frozen 给出且 --kl-weight > 0 时存在；
                    # 「无约束」那一臂完全不加这一项，两臂同数据同预算。
                    if frozen_ref is not None and kl_weight > 0.0:
                        with torch.no_grad():
                            ref_logits = frozen_ref.forward_action_logits(cand_tensor)
                        log_p = torch.log_softmax(logits, dim=-1)
                        log_q = torch.log_softmax(ref_logits, dim=-1)
                        kl_row = torch.sum(torch.exp(log_p) * (log_p - log_q), dim=-1).mean()
                        loss_terms.append(float(kl_weight) * kl_row)
                        loss_step = torch.stack(loss_terms).sum()
                        kl_accum += float(kl_row.item())
                        kl_rows += 1

                    # V11/T11-03: an explicit policy mask. A row without a
                    # trustworthy teacher label contributes no policy gradient,
                    # even when it carries a real value target.
                    if not bool(batch["policy_loss_mask"][b]):
                        loss_step = loss_step * 0.0
                        masked_policy_samples += 1
                    batch_pol_loss = batch_pol_loss + loss_step

                    pred_top = torch.argmax(logits, dim=-1).item()
                    # V13/T13-01: accuracy is a policy metric, so a row whose policy
                    # label is masked must not be scored. Previously an all-masked run
                    # still reported a non-zero accuracy, which read as "learning".
                    if bool(batch["policy_loss_mask"][b]):
                        if pred_top == target_i:
                            correct_actions += 1
                        total_actions += 1

                # ---- [V17/T17-02 diff 2] policy CE 分母 -------------------------
                # 上游行为：/ max(1, batch_size)（掩码行损失为 0 但仍占分母）＝ legacy-batch。
                # valid-mask：/ max(1, 有候选且 policyLossMask=true 的行数)。
                _policy_valid_in_batch = int(policy_scored_samples - masked_policy_samples)
                if value_loss_normalize == "valid-mask":
                    _policy_denominator = max(1, _policy_valid_in_batch)
                else:
                    _policy_denominator = max(1, batch_size)
                batch_pol_loss = batch_pol_loss / _policy_denominator

                # Value Loss (masked for None targets)
                #
                # V13/T13-01: the prediction filter and the target filter used to be
                # different predicates ("not None AND mask" vs "not None"). On a batch
                # that mixes a masked row with an unmasked one, torch then broadcast the
                # prediction across the target axis and silently produced a wrong loss and
                # a reversed gradient sign. Both sides now use ONE index set and the
                # shapes are asserted equal.
                val_targets_raw = batch["value_target"]
                value_valid = [
                    vt is not None and bool(batch["value_loss_mask"][i])
                    for i, vt in enumerate(val_targets_raw)
                ]
                masked_value_samples += sum(
                    1 for i, vt in enumerate(val_targets_raw)
                    if vt is not None and not bool(batch["value_loss_mask"][i])
                )
                if any(value_valid):
                    valid_t = torch.tensor(value_valid, device=device)
                    if legacy_bug_repro:
                        # Pre-V13 behaviour, kept only for the failing-regression test.
                        val_t = torch.tensor(
                            [vt for vt in val_targets_raw if vt is not None],
                            dtype=torch.float32, device=device,
                        )
                        val_p = val_pred[valid_t]
                    else:
                        val_t = torch.tensor(
                            [vt for i, vt in enumerate(val_targets_raw)
                             if vt is not None and value_valid[i]],
                            dtype=torch.float32, device=device,
                        )
                        val_p = val_pred[valid_t]
                    if val_p.shape != val_t.shape:
                        raise RuntimeError(
                            f"value mask mismatch: {val_p.shape[0]} prediction(s) vs "
                            f"{val_t.shape[0]} target(s) for the same batch. V13/T13-01 "
                            "requires identical index sets; refusing to broadcast."
                        )
                    batch_val_loss = mse_loss_fn(val_p, val_t)
                else:
                    batch_val_loss = torch.tensor(0.0, device=device)

                # ---- [V17/T17-02 diff 2/3] 掩码计数与「实际使用的分母」台账 --------
                # 纯记录，不参与任何数学；用于当场核对 valid-mask 与 legacy-batch 是否等价。
                if mask_stats is not None:
                    _value_valid_in_batch = int(sum(1 for m in value_valid if m))
                    mask_stats["policyValidRows"] = mask_stats.get("policyValidRows", 0) + _policy_valid_in_batch
                    mask_stats["policyMaskedRows"] = mask_stats.get("policyMaskedRows", 0) + int(masked_policy_samples)
                    mask_stats["policyNoCandidateRows"] = mask_stats.get("policyNoCandidateRows", 0) + int(batch_size - policy_scored_samples)
                    mask_stats["policyDenominatorUsed"] = mask_stats.get("policyDenominatorUsed", 0) + int(_policy_denominator)
                    mask_stats["policyLegacyBatchDenominator"] = mask_stats.get("policyLegacyBatchDenominator", 0) + int(max(1, batch_size))
                    mask_stats["valueValidRows"] = mask_stats.get("valueValidRows", 0) + _value_valid_in_batch
                    mask_stats["valueMaskedRows"] = mask_stats.get("valueMaskedRows", 0) + int(masked_value_samples)
                    mask_stats["valueNullRows"] = mask_stats.get("valueNullRows", 0) + int(sum(1 for vt in val_targets_raw if vt is None))
                    mask_stats["valueDenominatorUsed"] = mask_stats.get("valueDenominatorUsed", 0) + _value_valid_in_batch
                    mask_stats["batches"] = mask_stats.get("batches", 0) + 1
                    mask_stats["rows"] = mask_stats.get("rows", 0) + int(batch_size)
                    # V18/T18-04：KL 项读数经 mask_stats 带出（与其它台账同一通道）。
                    if kl_rows:
                        mask_stats["klRows"] = mask_stats.get("klRows", 0) + kl_rows
                        mask_stats["klSum"] = mask_stats.get("klSum", 0.0) + kl_accum
                        mask_stats["klWeight"] = float(kl_weight)

                loss = batch_pol_loss + value_weight * batch_val_loss

                stop_after_this_batch = False
                if is_train and optimizer:
                    if not torch.isfinite(loss):
                        raise RuntimeError(f"Non-finite loss encountered: {loss.item()}")
                    loss.backward()
                    for name, param in model.named_parameters():
                        if param.grad is not None and not torch.all(torch.isfinite(param.grad)):
                            raise RuntimeError(f"Non-finite gradient in {name} during backpropagation!")
                    # V14/T14-04：梯度裁剪，只改变数值稳定性，不改变目标函数。
                    #
                    # V15/T15-03：删除原先「logits 过大导致 argmax 退化、train_loss→0 且
                    # train_acc→0」的归因。V14b 审核（V14B_AUDIT_REVIEW §3 [P2]）已证明那段
                    # 零准确率来自「预算耗尽后继续跑空 epoch」的控制流缺陷，与 logits 数值无关；
                    # 在拿到新的直接证据前不再保留没有证据的解释。裁剪本身保留。
                    torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
                    # V15/T15-03：按「全局第 u 次更新」显式设定学习率，再执行本次 step，
                    # 因此台账里记录的 lr 就是这一步真正使用的 lr（不依赖 scheduler 调用先后）。
                    global_update_index = updates_before_epoch + steps_run
                    if lr_at_update is not None:
                        _lr_this_step = float(lr_at_update(global_update_index))
                        for _group in optimizer.param_groups:
                            _group["lr"] = _lr_this_step
                    else:
                        _lr_this_step = float(optimizer.param_groups[0]["lr"])
                    optimizer.step()
                    steps_run += 1
                    if recorder is not None:
                        recorder.record_update(
                            epoch=epoch, samples=batch["sample_ids"],
                            policy_masked=masked_policy_samples,
                            value_masked=masked_value_samples,
                            value_used=int(sum(1 for m in value_valid if m)),
                            lr=_lr_this_step,
                            sample_meta=batch.get("sample_meta"),
                            sources=(batch_sources[batch_in_epoch]
                                     if batch_sources is not None and batch_in_epoch < len(batch_sources)
                                     else None),
                            duration_ms=(time.perf_counter() - _batch_start) * 1000.0,
                        )
                    # V19/T19-00：权重导出挂在「这一步真的更新过」之后，
                    # 传入的累计更新数与 ledger 的 consumption.updates 同源同义。
                    if update_checkpoint_hook is not None:
                        update_checkpoint_hook(updates_before_epoch + steps_run)
                    if legacy_bug_repro:
                        # Pre-V13 accounting: accumulation site #1 of 2, inside the
                        # optimizer-success block.
                        total_loss += loss.item()
                        total_pol_loss += batch_pol_loss.item()
                        total_val_loss += batch_val_loss.item()
                    if max_steps is not None and steps_run >= max_steps:
                        stop_after_this_batch = True
                    if global_update_limit is not None and (updates_before_epoch + steps_run) >= global_update_limit:
                        stop_after_this_batch = True

                # V13/T13-01: ONE accumulation site per batch, and it runs before the
                # early exit so the last (already optimized) batch is never dropped.
                if not legacy_bug_repro:
                    total_loss += loss.item()
                    total_pol_loss += batch_pol_loss.item()
                    total_val_loss += batch_val_loss.item()
                else:
                    # Pre-V13 accounting: accumulation site #2 of 2, the common footer.
                    # It is deliberately skipped when the cap fires on the final batch,
                    # because the original `break` sat between the two sites.
                    if not stop_after_this_batch:
                        total_loss += loss.item()
                        total_pol_loss += batch_pol_loss.item()
                        total_val_loss += batch_val_loss.item()
                batches_accumulated += 1
                batch_in_epoch += 1
                samples_seen += len(batch.get("sample_ids") or [])

                if stop_after_this_batch:
                    break

        # V13/T13-01: normalise by the number of batches actually accumulated, not by
        # len(dataloader) (which was wrong whenever an early break fired) and not by
        # steps_run alone (which dropped the last batch of a capped run).
        #
        # The legacy branch reproduces the pre-V13 denominator exactly, including its
        # `steps_run` / `len(dataloader)` split, so the regression test compares the
        # old accounting against the new one rather than two variants of the new one.
        if legacy_bug_repro:
            if is_train and (max_steps is not None or global_update_limit is not None):
                n = max(1, steps_run)
            else:
                n = max(1, len(dataloader))
        else:
            n = max(1, batches_accumulated)
        acc = correct_actions / max(1, total_actions)
        # V15/T15-03：把「本 epoch 真实发生了多少次更新」暴露给外层循环。
        # 外层据此区分「真实 epoch」与「零消费 epoch」，并在到达总预算后正常退出。
        if status is not None:
            status["updatesRun"] = int(steps_run)
            status["batchesAccumulated"] = int(batches_accumulated)
            status["samplesSeen"] = int(samples_seen)
            status["isTrain"] = bool(is_train)
        return total_loss / n, total_pol_loss / n, acc


    # V14/T14-03：模型实际使用的动作语义维度（由 main() 设置；None 表示不截断）。
    _MODEL_SEMANTIC_DIM: Dict[str, Any] = {"value": None}

    def collate_samples(batch: List[Dict[str, Any]]) -> Dict[str, Any]:
        spatial_t = torch.from_numpy(np.stack([s["spatial_tensor"] for s in batch], axis=0))
        # V14/T14-03：数据集按 53 维上界补齐语义，但历史 v2 数据集是 32 维，
        # 必须截到模型实际使用的维度，否则与模型形状不一致（mat1/mat2 相乘失败）。
        _sem_dim = _MODEL_SEMANTIC_DIM.get("value")
        if _sem_dim is not None:
            for _s in batch:
                for _cand in _s.get("candidates", []):
                    _padded = _cand.get("semantics_padded")
                    if _padded is not None and _padded.shape[0] > _sem_dim:
                        _cand["semantics_padded"] = _padded[:_sem_dim]
        spatial_t = torch.from_numpy(np.stack([s["spatial_tensor"] for s in batch], axis=0))
        # Support variable length globals by padding to max length in batch
        max_g = max(len(s["global_features"]) for s in batch)
        padded_g = [
            np.pad(s["global_features"], (0, max_g - len(s["global_features"])))
            for s in batch
        ]
        global_f = torch.from_numpy(np.stack(padded_g, axis=0))
        return {
            "spatial_tensor": spatial_t,
            "global_features": global_f,
            "candidates": [s["candidates"] for s in batch],
            "target_idx": [s["target_idx"] for s in batch],
            "value_target": [s["value_target"] for s in batch],
            "teacherQ": [s.get("teacherQ") for s in batch],
            "equivalenceGroups": [s.get("equivalenceGroups") for s in batch],
            "teacherSoftTargets": [s.get("teacherSoftTargets") for s in batch],
            # V11/T11-03: identity and supervision masks travel with the batch so
            # consumption can be attributed to individual samples.
            "sample_ids": [s.get("sampleId") for s in batch],
            # V15/T15-03：每行输入身份随 batch 一起进入台账（唯一 key / root 计数）。
            "sample_meta": [
                {
                    "sampleId": s.get("sampleId"),
                    "policyInputKey": s.get("policyInputKey"),
                    "sourceStateKey": s.get("sourceStateKey"),
                    "rootFamilyId": s.get("rootFamilyId"),
                    "partition": s.get("partition"),
                }
                for s in batch
            ],
            "policy_loss_mask": [bool(s.get("policyLossMask", True)) for s in batch],
            "value_loss_mask": [
                bool(s.get("valueLossMask", s.get("value_target") is not None)) for s in batch
            ],
        }


    def main():
        parser = argparse.ArgumentParser(description="Train Spatial ResNet for AncientEmpires (Path B)")
        parser.add_argument("--dataset", type=str, default="training_runs/spatial_dataset/spatial_train_scaled_30k.jsonl", help="Input .jsonl dataset")
        parser.add_argument("--epochs", type=int, default=8, help="Number of training epochs")
        parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
        # 中文：调度策略必须由命令行显式定义，默认值保持原有余弦退火行为。
        parser.add_argument("--lr-schedule", type=str, default="cosine",
                            choices=["cosine", "cosine-to-min", "constant"],
                            help="学习率调度：cosine 保持历史行为，cosine-to-min 使用指定最小值，constant 全程固定")
        parser.add_argument("--lr-min", type=float, default=1e-5,
                            help="cosine-to-min 调度的最低学习率")
        # V15/T15-03：显式按 update 的调度。默认 epoch —— 历史命令与历史可复现性完全不变。
        parser.add_argument("--lr-schedule-unit", type=str, default="epoch", choices=["epoch", "update"],
                            help="学习率调度的推进单位：epoch 保持历史语义（默认）；update 使用协议 "
                                 "§3.1 的按真实 optimizer update 余弦 lr(u)=lrMin+(lrMax-lrMin)*(1+cos(pi*u/(U-1)))/2")
        parser.add_argument("--save-at-updates", type=str, default=None,
                            help="V19/T19-00：在这些累计真实 optimizer 更新数处额外导出中间权重，"
                                 "逗号分隔（例如 1000,2000,4000）。钩子挂在 optimizer.step() 之后，"
                                 "因此在 epoch 中间也能精确命中；不改变训练数学与 LR 调度。")
        parser.add_argument("--lr-total-updates", type=int, default=None,
                            help="按 update 调度时的总更新数 U；默认取 --global-update-limit，其次取 batch plan 的 totalUpdates")
        parser.add_argument("--weight-decay", type=float, default=1e-4,
                            help="AdamW 权重衰减系数；tiny-fit 记忆诊断可显式设为 0")
        parser.add_argument("--batch-size", type=int, default=32, help="Batch size")
        parser.add_argument("--val-split", type=float, default=0.1, help="Validation ratio")
        parser.add_argument("--out-model", type=str, default="training_runs/models/spatial_resnet_v2_checkpoint.json", help="Output JSON checkpoint")
        parser.add_argument("--out-last-model", type=str, default=None, help="Output JSON checkpoint for last epoch (defaults to out-model with _last suffix)")
        parser.add_argument("--out-final-model", type=str, default=None,
                            help="V15/T15-03: 最后一次真实更新的权重（final）。默认回落到 --out-last-model，再回落到 <out-model>_last.json")
        parser.add_argument("--out-metrics", type=str, default=None, help="Output path for metrics JSON (defaults to model-specific metrics file)")
        parser.add_argument("--value-weight", type=float, default=0.0, help="Weight for value head loss (default: 0.0 for policy-only)")
        # ---- [V17/T17-02 diff 1] 可训练部分（默认全部 = 上游行为） ----------------
        parser.add_argument("--trainable-parts", type=str, default="trunk,policy,value",
                            help="V17/T17-02：逗号分隔的可训练部分，取值 trunk/policy/value，"
                                 "默认 'trunk,policy,value'（与上游一致，全部可训练）。"
                                 "未列出的部分会被 requires_grad=False 并排除出优化器参数组。"
                                 "模块映射：trunk=stem+res_blocks.*，value=val_dense1/val_dense2，"
                                 "policy=pol_dense1/pol_dense2（与 spatial_resnet_model.py 实际命名核对）。")
        # ---- [V17/T17-02 diff 2] 损失分母模式（默认 = 上游行为） -----------------
        parser.add_argument("--value-loss-normalize", type=str, default="legacy-batch",
                            choices=["legacy-batch", "valid-mask"],
                            help="V17/T17-02：legacy-batch（默认，与上游完全一致）按整批行数平均 "
                                 "policy CE；valid-mask 按 policyLossMask=true 的行数平均。"
                                 "value MSE 在上游本来就是按有效 value target 行数平均，两种模式都不改它。")
        parser.add_argument("--max-steps", type=int, default=None, help="Maximum training optimizer steps per epoch (equal-work A/B/C controls)")
        parser.add_argument("--global-update-limit", type=int, default=None, help="V11/T11-03: hard cap on optimizer steps for the whole run (distinct from --max-steps, which is per epoch)")
        parser.add_argument("--planned-manifest", type=str, default=None, help="V11/T11-03: output path for the PRE-training plan (index split). Not evidence of consumption.")
        parser.add_argument("--optimized-manifest", type=str, default=None, help="V11/T11-03: output path for the POST-training measured consumption ledger.")
        parser.add_argument("--consumed-manifest", type=str, default=None, help="Optional explicit path for consumed sample manifest")
        parser.add_argument("--deploy-to-src", action="store_true", default=False, help="Explicitly deploy to src/game/ai/models/ (default: False)")
        # V13/T13-01: the three random streams used to share one --seed, so three
        # "seeds" were never three initialisations on a fixed validation set.
        # --seed is kept as a legacy fallback for all three.
        parser.add_argument("--seed", type=int, default=42, help="Legacy seed; used as the default value for --model-seed, --split-seed and --data-order-seed")
        parser.add_argument("--model-seed", type=int, default=None, help="Seed for network init, dropout-free determinism and torch.manual_seed")
        parser.add_argument("--split-seed", type=int, default=None, help="Seed for the grouped train/val partition. Ignored when --split-manifest is given.")
        parser.add_argument("--data-order-seed", type=int, default=None, help="Seed for the training DataLoader shuffle order")
        parser.add_argument("--allow-legacy-grouping", action="store_true", default=False,
                            help="V13/T13-01: permit the legacy f'ep_{idx//60}' grouping key when a row has no "
                                 "rootFamilyId/episodeId. Diagnostic only; the run is watermarked in metrics.")
        parser.add_argument("--resume-state", type=str, default=None, help="V13/T13-01: torch training-state file (model+optimizer+scheduler+epoch) to resume from")
        parser.add_argument("--out-state", type=str, default=None, help="V13/T13-01: where to write the resumable training state (defaults to out-model with .state.pt suffix)")
        parser.add_argument("--legacy-bug-repro", action="store_true", default=False,
                            help="V13/T13-01: re-enable the pre-V13 loss double-count and mismatched value-mask "
                                 "filters. Used ONLY by the regression test that proves the old code was wrong; "
                                 "never set this for a real run.")
        parser.add_argument("--model-version", type=str, default="spatial-resnet-v2", choices=["spatial-resnet-v1", "spatial-resnet-v2"])
        parser.add_argument("--num-blocks", type=int, default=2, choices=[2, 4], help="Number of ResNet trunk blocks (2 or 4)")
        parser.add_argument("--global-policy-pool", action="store_true", default=False, help="Append board-wide GAP vector to the policy head (Arm 2)")
        # V18/T18-02 Arm B：结构扩展时必须把新增 policy 输入列置零，
        # 这样初始 logits 与扩展前逐位相同，结构效果才不会被随机初始化漂移污染。
        parser.add_argument("--zero-init-new-policy-dims", action="store_true", default=False,
                            help="V18/T18-02: zero newly added policy input columns on warm-start so initial logits match the pre-extension model")
        # V18/T18-04：对冻结冠军的 KL 约束（防无益漂移的假设，不是提升开关）。
        parser.add_argument("--kl-to-frozen", type=str, default=None,
                            help="V18/T18-04: path to a frozen reference checkpoint; enables the KL-to-frozen arm")
        parser.add_argument("--kl-weight", type=float, default=0.0,
                            help="V18/T18-04: weight of KL(current||frozen) over the policy candidate distribution (0 = off)")
        parser.add_argument("--loss-mode", type=str, default="ce", choices=["ce", "soft", "equiv", "soft+equiv"], help="Policy loss mode; soft/equiv require teacherQ/equivalenceGroups")
        parser.add_argument("--teacher-temperature", type=float, default=1.0, help="Temperature for teacherQ soft ranking")
        parser.add_argument("--soft-weight", type=float, default=0.5, help="Weight for soft ranking loss")
        parser.add_argument("--equiv-weight", type=float, default=0.5, help="Weight for equivalence-group loss")
        parser.add_argument("--split-manifest", type=str, default=None, help="Path to unified split_manifest.json")
        parser.add_argument("--init-checkpoint", type=str, default=None, help="Path to initial JSON checkpoint to warm-start from")
        # V14/T14-03：默认 None 表示「以数据为准」，并在日志里打印推断出的通道数。
        # 显式传入时作为契约声明，与数据不一致会直接失败（历史 v8/v9 数据是 24 通道，V14 数据是 26 通道）。
        parser.add_argument("--spatial-channels", type=int, default=None, help="V14/T14-03: spatial tensor channel count; default None = infer from the dataset and print it. Pass explicitly to assert a contract (v13=24, v14=26)")
        # V14/T14-03：默认 None ⇒ 由导出侧按权重实际形状推断 schema（避免把 24 通道权重标成 v14）。
        parser.add_argument("--encoder-schema-id", type=str, default=None, help="V14/T14-03: input feature semantics identity; default None = infer from the trained tensor shapes. If given it must match the shapes or export fails")
        # ---------------------------------------------------------------- V15/T15-03
        parser.add_argument("--batch-plan", type=str, default=None,
                            help="V15/T15-03: 冻结的确定性 batch plan（v15_batch_plan_1）。给出后按 plan 逐 update "
                                 "取数，支持每步来源配额（例如 16+16）；不再使用 shuffle DataLoader")
        parser.add_argument("--train-only", action="store_true", default=False,
                            help="V15/T15-03: 诊断模式。全部样本进入优化（允许没有验证集），不按 val 选 best，"
                                 "输出依据为 final 与训练命中；正式训练禁止使用")
        parser.add_argument("--pause-after-updates", type=int, default=None,
                            help="V15/T15-03: 受控暂停。累计真实更新达到 N 后正常收尾（final+state），"
                                 "stopReason=CONTROLLED_PAUSE")

        args = parser.parse_args()

        # V13/T13-01: separate the three random streams. Legacy --seed remains the
        # fallback so historical commands keep working, but each stream can now be
        # pinned independently and the effective values are recorded in the metrics.
        model_seed = args.model_seed if args.model_seed is not None else args.seed
        split_seed = args.split_seed if args.split_seed is not None else args.seed
        data_order_seed = args.data_order_seed if args.data_order_seed is not None else args.seed
        if args.legacy_bug_repro:
            print("[!] LEGACY BUG REPRODUCTION MODE: the pre-V13 loss double-count and the "
                  "mismatched value-mask filters are re-enabled. This output is NOT a "
                  "valid training result.")
        # V15/T15-03：诊断模式与部署互斥；正式训练不得缺验证集。
        if args.train_only and args.deploy_to_src:
            raise ValueError(
                "--train-only 是诊断模式，禁止与 --deploy-to-src 同时使用：诊断权重不是生产候选。"
            )
        if args.pause_after_updates is not None and int(args.pause_after_updates) < 1:
            raise ValueError("--pause-after-updates 必须 >= 1")

        # ---- [V17/T17-02 diff 1/2] 新开关的解析与校验（默认值下不改变任何行为） ----
        _PARTS_ALL = ("trunk", "policy", "value")
        _requested = [p.strip() for p in str(args.trainable_parts).split(",") if p.strip()]
        _unknown_parts = [p for p in _requested if p not in _PARTS_ALL]
        if _unknown_parts:
            raise ValueError(
                f"--trainable-parts 含未知部分 {_unknown_parts}；只允许 {list(_PARTS_ALL)}。"
            )
        if not _requested:
            raise ValueError("--trainable-parts 不能为空。")
        if len(set(_requested)) != len(_requested):
            raise ValueError(f"--trainable-parts 有重复项：{_requested}")
        trainable_parts = [p for p in _PARTS_ALL if p in _requested]  # 规范化顺序
        frozen_parts = [p for p in _PARTS_ALL if p not in _requested]
        if frozen_parts and args.resume_state:
            raise ValueError(
                "--trainable-parts 冻结了部分参数时禁止与 --resume-state 同用："
                "存档里的优化器状态对应的是另一组参数（含被冻结部分），"
                "按缩减后的参数组恢复不是等价续跑。请改用 --init-checkpoint 做 weights-only 热启动。"
            )

        batch_plan: Dict[str, Any] | None = None
        batch_plan_sha: str | None = None
        if args.batch_plan:
            if not os.path.exists(args.batch_plan):
                raise FileNotFoundError(
                    f"--batch-plan 已给出但文件不存在：{args.batch_plan!r}；拒绝静默退回到 shuffle。"
                )
            batch_plan = load_batch_plan(args.batch_plan)
            batch_plan_sha = _sha256_file(args.batch_plan)
            if int(batch_plan["batchSize"]) != int(args.batch_size):
                raise ValueError(
                    f"--batch-size {args.batch_size} 与 batch plan 的 batchSize "
                    f"{batch_plan['batchSize']} 不一致。"
                )
            print(f"[BatchPlan] {args.batch_plan} sha256={batch_plan_sha} "
                  f"totalUpdates={len(batch_plan['updates'])} "
                  f"updatesPerEpoch={batch_plan['updatesPerEpoch']} "
                  f"sources={ {str(s['name']): int(s['quota']) for s in batch_plan['sources']} }")

        # 按 update 调度必须能确定总更新数 U（协议 §3.1）。
        lr_total_updates = args.lr_total_updates
        if args.lr_schedule_unit == "update":
            if lr_total_updates is None:
                if args.global_update_limit is not None:
                    lr_total_updates = int(args.global_update_limit)
                elif batch_plan is not None:
                    lr_total_updates = len(batch_plan["updates"])
            if lr_total_updates is None or int(lr_total_updates) < 1:
                raise ValueError(
                    "--lr-schedule-unit update 需要确定的总更新数：请给出 --lr-total-updates，"
                    "或 --global-update-limit，或 --batch-plan（其 totalUpdates 即 U）。"
                )
            lr_total_updates = int(lr_total_updates)
            if args.global_update_limit is not None and lr_total_updates != int(args.global_update_limit):
                # 不禁止：校准/提前停止时希望用「正式预算形状」的 lr(u)。
                # 但必须显式提示，避免把「调度区间」和「本次运行预算」混为一谈。
                print(f"[LR] 注意：lr 调度区间 U={lr_total_updates} 与本次 "
                      f"--global-update-limit={args.global_update_limit} 不同；"
                      "本次运行在预算处停止，u 超过 U-1 时 lr 取 lrMin。")
            print(f"[LR] unit=update U={lr_total_updates} schedule={args.lr_schedule} "
                  f"lrMax={args.lr} lrMin={args.lr_min}")

        torch.manual_seed(model_seed)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"=======================================================")
        print(f"[Path B Training] Spatial ResNet Scaled PyTorch Engine ({args.model_version}, {args.num_blocks} blocks)")
        print(f"Device: {device} (CPU Threads: {torch.get_num_threads()})")
        print(f"Dataset: {args.dataset}")
        print(f"Blocks: {args.num_blocks} | Batch Size: {args.batch_size} | Epochs: {args.epochs} | LR: {args.lr}")
        print(f"Seeds: model={model_seed} split={split_seed} dataOrder={data_order_seed}")
        if args.split_manifest:
            print(f"Split Manifest: {args.split_manifest}")
        print(f"=======================================================\n")

        full_dataset = SpatialDataset(args.dataset)
        total_len = len(full_dataset)

        val_indices: List[int] = []
        train_indices: List[int] = []
        group_keys: List[str] = []
        # V13/T13-01: provenance of the partition actually applied, recorded in metrics.
        split_provenance: Dict[str, Any] = {
            "mode": None,
            "manifestPath": None,
            "manifestSha256": None,
            "splitSeed": None,
            "legacyGroupingUsed": False,
            "legacyGroupRows": 0,
            "watermark": None,
        }

        if args.split_manifest:
            # V13/T13-01: an explicit manifest that does not exist used to fall back to
            # the internal grouped split, so a run could silently use a different
            # partition than the one it claimed. Fail closed.
            if not os.path.exists(args.split_manifest):
                raise FileNotFoundError(
                    f"--split-manifest was given but does not exist: {args.split_manifest!r}. "
                    "V13/T13-01 refuses to silently substitute a different partition."
                )
            with open(args.split_manifest, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)
            train_roots = set(manifest_data.get("trainRootFamilies", []))
            val_roots = set(manifest_data.get("valRootFamilies", []))
            test_roots = set(manifest_data.get("testRootFamilies", []))

            # V13/T13-01: reject overlapping root families across the three partitions.
            for left, right, left_name, right_name in (
                (train_roots, val_roots, "train", "val"),
                (train_roots, test_roots, "train", "test"),
                (val_roots, test_roots, "val", "test"),
            ):
                overlap = left & right
                if overlap:
                    raise ValueError(
                        f"Split manifest has {len(overlap)} root famil(y/ies) in both {left_name} "
                        f"and {right_name}: {sorted(overlap)[:5]}. Leakage is refused."
                    )

            unknown_roots = set()
            missing_identity = set()
            for idx, sample in enumerate(full_dataset.samples):
                r_id = sample.get("rootFamilyId")
                if r_id is None:
                    missing_identity.add(str(sample.get("sampleId")))
                    continue
                if r_id in test_roots:
                    continue
                if r_id in val_roots:
                    val_indices.append(idx)
                elif r_id in train_roots:
                    train_indices.append(idx)
                else:
                    unknown_roots.add(str(r_id))
            if missing_identity:
                raise ValueError(
                    f"{len(missing_identity)} row(s) carry no rootFamilyId, so they cannot be "
                    f"assigned to a manifest partition (e.g. {sorted(missing_identity)[:3]}). "
                    "V13/T13-01 refuses to guess."
                )
            if unknown_roots:
                raise ValueError(
                    f"{len(unknown_roots)} rootFamilyId value(s) are not in the split manifest "
                    f"({sorted(unknown_roots)[:5]}). Refusing to default unknown roots into train."
                )
            if len(val_indices) == 0 and len(train_indices) > 1 and not args.train_only:
                raise ValueError(
                    "Manifest split produced 0 validation samples. V11/T11-03 refuses to "
                    "silently carve the tail rows out of train as a validation set. "
                    "（诊断模式请显式加 --train-only。）"
                )
            split_provenance.update({
                "mode": "manifest",
                "manifestPath": os.path.abspath(args.split_manifest),
                "manifestSha256": _sha256_file(args.split_manifest),
            })
            print(f"[Manifest Split] Applied unified split_manifest: Train = {len(train_indices)} samples ({len(train_roots)} roots) | Validation = {len(val_indices)} samples ({len(val_roots)} roots)\n")
        elif args.train_only:
            # V15/T15-03：明确 train-only 诊断模式。全部行进入优化，不切出验证集，
            # 也不再依赖「最后一行当验证占位」那种含糊说明（V14b 审核 §2.1）。
            train_indices = list(range(total_len))
            split_provenance.update({
                "mode": "train_only_all_rows",
                "note": "TRAIN_ONLY 诊断模式：所有样本进入优化，无验证集；best 选择被禁用。",
            })
            print(f"[TrainOnly] 诊断模式：{len(train_indices)} 行全部进入优化，不设验证集。\n")
        else:
            # Grouped split by episodeId / rootFamilyId to prevent leakage across state frames
            episode_groups: Dict[str, List[int]] = {}
            legacy_rows = 0
            for idx, sample in enumerate(full_dataset.samples):
                ep_id = sample.get("rootFamilyId") or sample.get("episodeId")
                if not ep_id:
                    # V13/T13-01: this fallback manufactured 811 pseudo-groups out of 48,714
                    # rows and leaked 95.48% of samples across the train/val boundary on the
                    # v2 pool. It is now opt-in and watermarked.
                    if not args.allow_legacy_grouping:
                        raise ValueError(
                            f"Row {idx} (sampleId={sample.get('sampleId')!r}) has neither rootFamilyId "
                            "nor episodeId. The legacy f'ep_{idx//60}' grouping key is diagnostic-only "
                            "and would let train/val leak. Pass --allow-legacy-grouping to run it anyway "
                            "(the run will be watermarked)."
                        )
                    legacy_rows += 1
                    ep_id = f"ep_{idx // 60}"
                if ep_id not in episode_groups:
                    episode_groups[ep_id] = []
                episode_groups[ep_id].append(idx)

            group_keys = sorted(list(episode_groups.keys()))
            import random
            rng = random.Random(split_seed)
            rng.shuffle(group_keys)

            val_target_count = max(1, int(total_len * args.val_split))
            cur_val_count = 0

            for k in group_keys:
                idxs = episode_groups[k]
                if cur_val_count < val_target_count:
                    val_indices.extend(idxs)
                    cur_val_count += len(idxs)
                else:
                    train_indices.extend(idxs)
            split_provenance.update({
                "mode": "internal_grouped_split",
                "splitSeed": split_seed,
                "legacyGroupingUsed": legacy_rows > 0,
                "legacyGroupRows": legacy_rows,
            })
            if legacy_rows:
                split_provenance["watermark"] = (
                    "LEGACY_GROUPING: rows without root/episode identity were grouped by a "
                    "row-index proxy. Do not treat the resulting validation split as clean."
                )
                print(f"[!] {split_provenance['watermark']} ({legacy_rows} rows affected)")

        if len(train_indices) == 0:
            raise ValueError(
                f"Partition error: train set is empty with {total_len} samples "
                f"({len(val_indices)} assigned to val). Refusing to train on nothing."
            )
        if len(val_indices) == 0 and not args.train_only:
            raise ValueError(f"Partition error: validation set is empty with {total_len} samples. "
                             "（诊断模式请显式加 --train-only；正式训练禁止缺验证集。）")

        train_data = torch.utils.data.Subset(full_dataset, train_indices)
        val_data = torch.utils.data.Subset(full_dataset, val_indices)
        if split_provenance["mode"] == "manifest":
            total_roots = len(train_roots) + len(val_roots)
        else:
            total_roots = len(group_keys) or None
        print(f"Final Partition: Train = {len(train_data)} samples | Validation = {len(val_data)} samples "
              f"(Grouped by {total_roots} roots)\n")

        # V11/T11-03: the PLAN. Written before training, explicitly not evidence.
        if args.planned_manifest:
            os.makedirs(os.path.dirname(os.path.abspath(args.planned_manifest)), exist_ok=True)
            with open(args.planned_manifest, "w", encoding="utf-8") as f:
                json.dump({
                    "schema": "v11_planned_manifest_1",
                    "measured": False,
                    "warning": "Pre-training plan (index split). It does NOT prove which samples were optimized.",
                    "train_sample_count": len(train_indices),
                    "val_sample_count": len(val_indices),
                    "batch_size": args.batch_size,
                    "train_sample_ids": [full_dataset.samples[i].get("sampleId") for i in train_indices if full_dataset.samples[i].get("sampleId")],
                    "val_sample_ids": [full_dataset.samples[i].get("sampleId") for i in val_indices if full_dataset.samples[i].get("sampleId")],
                }, f, indent=2)
            print(f"[Planned Manifest] {len(train_indices)} planned train rows -> {args.planned_manifest}")

        # V11/T11-03: duplicate sampleId with a conflicting stateHash is a data
        # integrity failure, not something to average over.
        seen_sample_ids: Dict[str, Any] = {}
        for idx in train_indices:
            sample = full_dataset.samples[idx]
            sid = sample.get("sampleId")
            if sid is None:
                continue
            shash = sample.get("stateHash")
            if sid in seen_sample_ids:
                prev = seen_sample_ids[sid]
                if shash is not None and prev is not None and shash != prev:
                    raise ValueError(
                        f"duplicate sampleId {sid!r} maps to two different stateHash "
                        f"values ({prev} vs {shash}); refusing to train on ambiguous identity"
                    )
            else:
                seen_sample_ids[sid] = shash

        if args.consumed_manifest:
            train_ids = [str(full_dataset.samples[i].get("sampleId")) for i in train_indices if full_dataset.samples[i].get("sampleId") is not None]
            val_ids = [str(full_dataset.samples[i].get("sampleId")) for i in val_indices if full_dataset.samples[i].get("sampleId") is not None]
            if len(train_ids) == 0:
                raise ValueError(f"consumed_manifest error: train_sample_ids is empty for {len(train_indices)} train samples!")
            if len(val_ids) == 0:
                raise ValueError(f"consumed_manifest error: val_sample_ids is empty for {len(val_indices)} val samples!")
            consumed_info = {
                # V13/T13-01: this file is written BEFORE the first optimizer step, so it
                # can never be evidence of consumption. V10's pipeline validated DAgger
                # coverage against it, which was a closed loop that could not fail.
                "schema": "v13_planned_split_1",
                "measured": False,
                "isConsumptionEvidence": False,
                "warning": "PLANNED index split written before training. It does NOT prove "
                           "which samples were optimized. Consumption evidence comes from "
                           "<out-model>.optimized_samples_manifest.json and "
                           "optimizer_update_ledger.jsonl, which are written after "
                           "successful optimizer.step() calls only.",
                "model_version": args.model_version,
                "encoder_schema_id": args.encoder_schema_id,
                "num_blocks": args.num_blocks,
                "dataset": os.path.abspath(args.dataset),
                "train_sample_count": len(train_indices),
                "val_sample_count": len(val_indices),
                "train_sample_ids": train_ids,
                "val_sample_ids": val_ids,
                "trainSampleIds": train_ids,
                "valSampleIds": val_ids
            }
            os.makedirs(os.path.dirname(os.path.abspath(args.consumed_manifest)), exist_ok=True)
            with open(args.consumed_manifest, "w", encoding="utf-8") as f:
                json.dump(consumed_info, f, indent=2)
            print(f"[Planned Split] (NOT consumption evidence) wrote {len(train_ids)} train and "
                  f"{len(val_ids)} val sample IDs to: {args.consumed_manifest}\n")

        # V13/T13-01: shuffle order is its own stream, so two runs can share a model
        # seed and a split while differing only in batch order.
        #
        # drop_last=False is explicit: torch's default already keeps the partial
        # batch, but the pre-V13 normaliser divided by len(dataloader) while the loop
        # could break early, so the two disagreed. Making the batch count explicit
        # keeps `batches_accumulated` the single source of truth for the mean.
        _order_gen = torch.Generator()
        _order_gen.manual_seed(int(data_order_seed))
        # V15/T15-03：两种取数模式。
        #   plan 模式 —— 按冻结 plan 逐 update 取数（来源配额由文件保证，序列确定）。
        #   默认模式 —— 历史 shuffle DataLoader，行为与默认值完全不变。
        train_loader = None
        if batch_plan is None:
            train_loader = DataLoader(train_data, batch_size=args.batch_size, shuffle=True,
                                      collate_fn=collate_samples, generator=_order_gen,
                                      drop_last=False)
        else:
            # plan 里的 datasetRow 是全量数据集行号；必须全部落在 train 分区内。
            _train_set = set(int(i) for i in train_indices)
            _bad_rows = sorted({
                int(item["datasetRow"])
                for entry in batch_plan["updates"] for item in entry["items"]
                if int(item["datasetRow"]) not in _train_set
            })
            if _bad_rows:
                raise ValueError(
                    f"batch plan 引用了不属于 train 分区的 {len(_bad_rows)} 行（例如 {_bad_rows[:5]}）；"
                    "拒绝用验证/测试行做训练。"
                )
            _plan_ids = {}
            for entry in batch_plan["updates"]:
                for item in entry["items"]:
                    row = int(item["datasetRow"])
                    sid = item.get("sampleId")
                    if sid is None:
                        continue
                    actual = full_dataset.samples[row].get("sampleId")
                    if actual is not None and str(actual) != str(sid):
                        _plan_ids[(row, str(sid), str(actual))] = True
            if _plan_ids:
                raise ValueError(
                    "batch plan 的 sampleId 与数据集行不一致（例如 "
                    f"{list(_plan_ids)[:3]}）；拒绝按错误身份曝光。"
                )
            # V15/T15-08：把 plan 的绝对行号映射成 Subset 位置。
            # 当 train_indices 恰好是 [0,1,2,...] 时这个映射是恒等的（C2 即如此），
            # 因此不会改变已冻结运行的行为；只有 train 不是文件前缀时才真正生效。
            _row_to_position = {int(row): pos for pos, row in enumerate(train_indices)}
            _identity = all(row == pos for row, pos in _row_to_position.items())
            print(f"[BatchPlan] 行号->位置映射：{len(_row_to_position)} 个 train 行，"
                  f"恒等={_identity}（train 是否恰好为文件前缀）")
            # 未显式给出总预算时，plan 的 totalUpdates 就是本次运行的预算。
            if args.global_update_limit is None:
                args.global_update_limit = len(batch_plan["updates"])
                print(f"[BatchPlan] 未给出 --global-update-limit，按 plan 的 totalUpdates "
                      f"{args.global_update_limit} 作为总预算。")
            elif int(args.global_update_limit) > len(batch_plan["updates"]):
                raise ValueError(
                    f"--global-update-limit {args.global_update_limit} 超过 batch plan 的 "
                    f"totalUpdates {len(batch_plan['updates'])}；plan 无法覆盖该预算。"
                )
            print(f"[BatchPlan] 取数模式=plan；每 epoch 计划 {batch_plan['updatesPerEpoch']} 次更新")
        val_loader = None
        if len(val_data) > 0:
            val_loader = DataLoader(val_data, batch_size=args.batch_size, shuffle=False,
                                    collate_fn=collate_samples, drop_last=False)

        # V14/T14-03：特征维度全部来自数据本身，并与 --spatial-channels 声明核对。
        # 不一致时直接失败，不做静默 reshape / 截断。
        spatial_channels_from_data = int(full_dataset.channels)
        if args.spatial_channels is not None and spatial_channels_from_data != int(args.spatial_channels):
            raise ValueError(
                f"数据集的通道数 {spatial_channels_from_data} 与 --spatial-channels "
                f"{args.spatial_channels} 不一致。V14/T14-03 要求显式声明编码器 schema 的通道数："
                "v13 为 24，v14 为 26。"
            )
        global_dim = int(full_dataset.global_dim)
        action_semantic_dim = int(full_dataset.semantic_dim)
        expected_global = 20 if args.model_version == "spatial-resnet-v2" else 16
        allowed_sem = ({32, 53} if args.model_version == "spatial-resnet-v2" else {24})
        if global_dim != expected_global:
            raise ValueError(
                f"数据集全局特征维度 {global_dim} 与 --model-version {args.model_version} 期望的 "
                f"{expected_global} 不一致。"
            )
        if action_semantic_dim not in allowed_sem:
            raise ValueError(
                f"数据集候选语义维度 {action_semantic_dim} 不在 {args.model_version} 支持的 "
                f"{sorted(allowed_sem)} 内（v14 schema 为 53，含 21 维兵种 one-hot）。"
            )
        _MODEL_SEMANTIC_DIM["value"] = action_semantic_dim
        print(f"[V14] spatial channels from data = {spatial_channels_from_data}, "
              f"global = {global_dim}, semantic = {action_semantic_dim}")

        model = SpatialResNet(
            spatial_channels=spatial_channels_from_data,
            trunk_channels=32,
            global_dim=global_dim,
            action_semantic_dim=action_semantic_dim,
            version=args.model_version,
            num_blocks=args.num_blocks,
            global_policy_pool=args.global_policy_pool
        ).to(device)

        # V13/T13-01: an explicitly named init checkpoint that does not exist used to
        # be a silent "train from scratch instead". Fail closed.
        if args.init_checkpoint:
            if not os.path.exists(args.init_checkpoint):
                raise FileNotFoundError(
                    f"--init-checkpoint was given but does not exist: {args.init_checkpoint!r}. "
                    "V13/T13-01 refuses to silently train from scratch instead."
                )
            load_model_from_ts_json(model, args.init_checkpoint, zero_new_policy_dims=args.zero_init_new_policy_dims)
            print(f"[Init] Warm-started from {args.init_checkpoint} "
                  f"(sha256={_sha256_file(args.init_checkpoint)})")

        # V18/T18-04：冻结参考模型，用于「对冻结冠军的 KL 约束」这一臂。
        # 中文：KL 是防止无益漂移的**假设**，不是保证提升的开关；
        # 因此它必须是一个可关闭的显式开关，并且与「无约束更新」用同数据同预算对照。
        frozen_ref = None
        if args.kl_to_frozen:
            if not os.path.exists(args.kl_to_frozen):
                raise FileNotFoundError(
                    f"--kl-to-frozen was given but does not exist: {args.kl_to_frozen!r}"
                )
            frozen_ref = SpatialResNet(
                spatial_channels=spatial_channels_from_data,
                trunk_channels=32,
                global_dim=global_dim,
                action_semantic_dim=action_semantic_dim,
                version=args.model_version,
                num_blocks=args.num_blocks,
                global_policy_pool=args.global_policy_pool
            ).to(device)
            load_model_from_ts_json(frozen_ref, args.kl_to_frozen)
            frozen_ref.eval()
            for param in frozen_ref.parameters():
                param.requires_grad_(False)
            print(f"[KL] 冻结参考模型 {args.kl_to_frozen} "
                  f"(sha256={_sha256_file(args.kl_to_frozen)}) kl_weight={args.kl_weight}")
        elif args.kl_weight > 0.0:
            raise ValueError("--kl-weight > 0 需要同时给 --kl-to-frozen（否则 KL 没有参考）。")
        if args.resume_state:
            if not os.path.exists(args.resume_state):
                raise FileNotFoundError(
                    f"--resume-state was given but does not exist: {args.resume_state!r}"
                )

        # ==================================================================
        # [V17/T17-02 diff 1] 冻结指定部分并据此构造优化器参数组。
        # 默认 --trainable-parts trunk,policy,value 时：没有任何参数被冻结，
        # 参数组 = 全部参数，与上游 `optim.AdamW(model.parameters(), ...)` 完全等价。
        # ==================================================================
        def _v17_part_of(param_name: str) -> str:
            # 与 python/spatial_resnet_model.py 的 named_parameters 实际命名核对：
            #   trunk  -> stem, res_blocks.<i>.conv1, res_blocks.<i>.conv2
            #   value  -> val_dense1, val_dense2
            #   policy -> pol_dense1, pol_dense2
            if param_name.startswith("val_dense"):
                return "value"
            if param_name.startswith("pol_dense"):
                return "policy"
            if param_name == "stem" or param_name.startswith("stem.") \
                    or param_name.startswith("res_blocks"):
                return "trunk"
            raise ValueError(
                f"未知参数 {param_name!r}：--trainable-parts 的模块映射需要更新。"
                "拒绝在无法归类的情况下继续冻结/训练。"
            )

        _param_breakdown: List[Dict[str, Any]] = []
        _trainable_params: List[Any] = []
        _part_totals: Dict[str, Dict[str, int]] = {
            p: {"params": 0, "numel": 0, "trainableParams": 0, "trainableNumel": 0,
                "requiresGradNumel": 0}
            for p in _PARTS_ALL
        }
        for _name, _param in model.named_parameters():
            _part = _v17_part_of(_name)
            _should_train = _part in trainable_parts
            _param.requires_grad_(bool(_should_train))
            _numel = int(_param.numel())
            _param_breakdown.append({
                "name": _name, "part": _part,
                "requiresGrad": bool(_param.requires_grad), "numel": _numel,
            })
            _part_totals[_part]["params"] += 1
            _part_totals[_part]["numel"] += _numel
            if _should_train:
                _trainable_params.append(_param)
                _part_totals[_part]["trainableParams"] += 1
                _part_totals[_part]["trainableNumel"] += _numel
        for _part, _tot in _part_totals.items():
            if _part in trainable_parts and _tot["params"] == 0:
                raise ValueError(f"--trainable-parts 指定了 {_part!r}，但模型里没有该部分的参数。")
        print("[V17/T17-02] trainable-parts 解析结果（默认全部 = 上游行为）：")
        for _row in _param_breakdown:
            print(f"    {_row['name']:<28} part={_row['part']:<7} "
                  f"requires_grad={str(_row['requiresGrad']):<5} numel={_row['numel']}")
        for _part in _PARTS_ALL:
            _tot = _part_totals[_part]
            print(f"    [group {_part}] params={_tot['params']} numel={_tot['numel']} "
                  f"trainable={_part in trainable_parts} "
                  f"requiresGradNumel={_tot['trainableNumel'] if _part in trainable_parts else 0}")
        print(f"[V17/T17-02] trainable parts={trainable_parts} frozen={frozen_parts} "
              f"optimizerParams={len(_trainable_params)}/"
              f"{sum(1 for _ in model.parameters())} "
              f"optimizerNumel={sum(int(p.numel()) for p in _trainable_params)}/"
              f"{sum(int(p.numel()) for p in model.parameters())}")

        optimizer = optim.AdamW(_trainable_params, lr=args.lr, weight_decay=args.weight_decay)
        # V14/T14-04b：学习率调度可显式选择。
        # 为什么需要：cosine 的 T_max 是 **epoch 数**，而每 epoch 的更新次数取决于数据集大小
        # 与 batch。128 状态的记忆诊断每 epoch 只有 8 次更新，用「跑满 epochs」的 cosine
        # 会在总更新远未用尽时就把学习率衰减到 eta_min，于是曲线提前变平，
        # 无法区分「记忆能力上限」与「学习率已归零」。constant 用于隔离这个混淆因素。
        # 默认仍为 cosine，保持历史命令的行为不变。
        #
        # V15/T15-03：`--lr-schedule-unit update` 时不用 epoch 调度器推进，改由
        # lr_at_update(u) 在每次 optimizer.step 之前显式写入，公式见 make_update_lr_fn。
        lr_at_update = None
        if args.lr_schedule_unit == "update":
            lr_at_update = make_update_lr_fn(args.lr, args.lr_min, lr_total_updates,
                                             args.lr_schedule)
            # scheduler 仅作为 state 里的占位对象，不参与推进（不调用 step）。
            scheduler = optim.lr_scheduler.ConstantLR(optimizer, factor=1.0, total_iters=1)
        elif args.lr_schedule == "constant":
            scheduler = optim.lr_scheduler.ConstantLR(optimizer, factor=1.0, total_iters=1)
        elif args.lr_schedule == "cosine-to-min":
            scheduler = optim.lr_scheduler.CosineAnnealingLR(
                optimizer, T_max=max(1, args.epochs), eta_min=float(args.lr_min))
        else:
            scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)

        # ------------------------------------------------------------------
        # V15/T15-03：恢复身份。数据/split/schema/预算/调度任一不一致都拒绝精确 resume。
        # ------------------------------------------------------------------
        identity: Dict[str, Any] = {
            "datasetPath": os.path.abspath(args.dataset),
            "datasetSha256": _sha256_file(args.dataset),
            "splitMode": split_provenance["mode"],
            "splitManifestPath": split_provenance.get("manifestPath"),
            "splitManifestSha256": split_provenance.get("manifestSha256"),
            "splitSeed": split_seed,
            "trainSampleCount": len(train_indices),
            "valSampleCount": len(val_indices),
            "trainIndicesSha256": __import__("hashlib").sha256(
                ",".join(str(i) for i in sorted(int(i) for i in train_indices)).encode("utf-8")
            ).hexdigest(),
            "encoderSchemaId": args.encoder_schema_id,
            "spatialChannels": int(spatial_channels_from_data),
            "globalDim": int(global_dim),
            "actionSemanticDim": int(action_semantic_dim),
            "modelVersion": args.model_version,
            "numBlocks": int(args.num_blocks),
            "globalPolicyPool": bool(args.global_policy_pool),
            "batchSize": int(args.batch_size),
            "globalUpdateLimit": (int(args.global_update_limit)
                                  if args.global_update_limit is not None else None),
            "maxStepsPerEpoch": (int(args.max_steps) if args.max_steps is not None else None),
            "lr": float(args.lr),
            "lrMin": float(args.lr_min),
            "lrSchedule": args.lr_schedule,
            "lrScheduleUnit": args.lr_schedule_unit,
            "lrTotalUpdates": (int(lr_total_updates) if lr_total_updates is not None else None),
            "batchPlanPath": (batch_plan["_resolvedPath"] if batch_plan is not None else None),
            "batchPlanSha256": batch_plan_sha,
            "lossMode": args.loss_mode,
            "valueWeight": float(args.value_weight),
            "weightDecay": float(args.weight_decay),
            "seeds": {"model": model_seed, "split": split_seed, "dataOrder": data_order_seed},
        }

        state_path = args.out_state
        if not state_path:
            base, _ = os.path.splitext(args.out_model)
            state_path = f"{base}.state.pt"
        final_model_path = args.out_final_model or args.out_last_model
        if not final_model_path:
            base, ext = os.path.splitext(args.out_model)
            final_model_path = f"{base}_last{ext}"

        plan_updates = batch_plan["updates"] if batch_plan is not None else None
        plan_updates_per_epoch = int(batch_plan["updatesPerEpoch"]) if batch_plan is not None else None

        # V15/T15-03：在指定更新数处额外导出中间权重（协议 §3.1 要求保留 500/1500/3000）。
        # V19/T19-00：保存点改为挂在**真实 optimizer 更新**上（见 update_checkpoint_hook），
        # 不再要求保存点恰好落在 epoch 边界；未达到的保存点仍如实记为缺失。
        extra_save_points = sorted({int(v) for v in str(args.save_at_updates).split(",")
                                    if v.strip()}) if args.save_at_updates else []
        # 预登记保存点集合在整轮运行内不变；命中情况单独记录，缺失情况据此在收尾时如实统计。
        extra_save_point_set = set(extra_save_points)
        extra_saved: List[Dict[str, Any]] = []
        # 已写出中间权重的更新序号（防止同一序号被重复导出）。
        _inline_saved_points: set = set()

        def _export_intermediate_at_update(global_updates: int, _model: Any) -> None:
            """中间权重导出：在 optimizer.step() 之后立刻按当前权重写盘。

            命中条件是「累计真实更新数等于预登记保存点」，与 lr 调度、epoch 结构无关，
            也不改变训练数学（只读 state_dict，不触碰计算图）。
            """
            if global_updates not in extra_save_point_set or global_updates in _inline_saved_points:
                return
            _path = f"{os.path.splitext(args.out_model)[0]}.u{global_updates}.json"
            os.makedirs(os.path.dirname(os.path.abspath(_path)), exist_ok=True)
            export_model_to_ts_json(_model, _path, encoder_schema_id=args.encoder_schema_id)
            _sha = _sha256_file(_path)
            extra_saved.append({"updates": int(global_updates), "path": os.path.abspath(_path),
                                "sha256": _sha, "hook": "optimizer_update"})
            _inline_saved_points.add(int(global_updates))
            print(f"[V19] 中间权重 @update {global_updates} -> {_path} (sha256={_sha[:12]}…)")

        _update_checkpoint_hook = (
            (lambda _u: _export_intermediate_at_update(_u, model)) if extra_save_points else None
        )

        best_val_acc = -1.0
        best_train_acc = 0.0
        best_epoch = 0
        best_update = 0
        best_sha = None
        # V14/T14-04：连续退化计数（见下面的 earlyStop 护栏）。
        degraded_epochs = 0
        consumption = ConsumptionRecorder()
        # 本进程写出的 ledger 覆盖的全局更新区间起点（resume 时从累计游标开始）。
        ledger_start_index = 0

        start_epoch = 1
        skip_batches = 0
        resume_info: Dict[str, Any] | None = None
        if args.resume_state:
            state = torch.load(args.resume_state, map_location=device, weights_only=False)
            missing_fields = [f for f in V15_STATE_REQUIRED_FIELDS if f not in state]
            if missing_fields or state.get("schema") != V15_STATE_SCHEMA:
                raise ResumeIdentityError(
                    f"旧 state {args.resume_state!r} 缺少精确恢复所需字段 "
                    f"{missing_fields}（schema={state.get('schema')!r}）。"
                    "拒绝把不完整的进度当成等价续跑；如需复用权重请改用 "
                    "--init-checkpoint 做 weights-only warm-start，并另建新运行。"
                )
            state_identity = state.get("identity") or {}
            mismatches = []
            for key in sorted(identity):
                before = state_identity.get(key, "<缺失>")
                now = identity[key]
                if before != now:
                    mismatches.append({"field": key, "state": before, "now": now})
            if mismatches:
                lines = "\n".join(
                    f"  - {m['field']}: state={m['state']!r} now={m['now']!r}" for m in mismatches)
                raise ResumeIdentityError(
                    "恢复身份不一致，拒绝精确 resume（数据/split/schema/预算/调度任一不同都不等价）："
                    f"\n{lines}\n"
                    "如确认要复用权重，请用 --init-checkpoint 另建新运行，不要宣称等价续跑。"
                )
            model.load_state_dict(state["model"])
            optimizer.load_state_dict(state["optimizer"])
            scheduler.load_state_dict(state["scheduler"])
            consumption.from_state(state["consumption"])
            if state.get("best") is not None:
                best_val_acc = float(state["best"].get("valAcc", -1.0))
                best_epoch = int(state["best"].get("epoch", 0))
                best_update = int(state["best"].get("update", 0))
                best_sha = state["best"].get("sha256")
            best_train_acc = float(state.get("bestTrainAcc", 0.0) or 0.0)
            restore_rng_state(state["rng"], _order_gen)
            _resume_cursor = state.get("samplerCursor") or {}
            if batch_plan is not None:
                start_epoch = consumption.updates // max(1, plan_updates_per_epoch) + 1
                skip_batches = 0
            else:
                start_epoch = int(state["epoch"])
                skip_batches = int(state["updatesInEpoch"])
                if skip_batches >= int(state.get("epochBatchCount") or 0) or skip_batches == 0:
                    start_epoch = int(state["epoch"]) + 1
                    skip_batches = 0
            resume_info = {
                "resumeStatePath": os.path.abspath(args.resume_state),
                "resumedAtEpoch": start_epoch,
                "resumedAtUpdate": consumption.updates,
                "skipBatchesInFirstEpoch": skip_batches,
                "stateStopReason": state.get("stopReason"),
                "stateSchema": state.get("schema"),
                "samplerCursor": _resume_cursor,
            }
            print(f"[Resume] resumed at epoch {start_epoch} from {args.resume_state} "
                  f"(best_val_acc={best_val_acc:.4f} @ epoch {best_epoch}; "
                  f"updates={consumption.updates}; skipBatches={skip_batches})")
        ledger_start_index = int(consumption.updates)
        # 恢复时若预算已用完：不再训练，只做幂等收尾（0 次额外更新）。
        budget_already_reached = (
            args.resume_state is not None
            and args.global_update_limit is not None
            and consumption.updates >= int(args.global_update_limit))

        print(f"Starting scaled training for {args.epochs} epochs (value_weight={args.value_weight})...\n")
        history: List[Dict[str, Any]] = []
        stop_reason = "EPOCHS_COMPLETED"
        zero_consumption_epochs = 0
        degradation_triggered = False
        # 最后已确认有效的快照：每个 epoch 边界以及每次收尾时更新。
        last_confirmed: Dict[str, Any] = {
            "epoch": int(state.get("epoch", 0)) if args.resume_state else 0,
            "updatesInEpoch": 0,
            "epochBatchCount": 0,
            "updates": consumption.updates,
            "model": {k: v.detach().clone() for k, v in model.state_dict().items()},
            "optimizer": copy.deepcopy(optimizer.state_dict()),
            "scheduler": copy.deepcopy(scheduler.state_dict()),
            "rng": collect_rng_state(_order_gen),
            "consumption": consumption.to_state(),
        }
        epoch_start_gen_state = None
        epoch_batches_planned = 0
        last_epoch_ran = int(state.get("epoch", 0)) if args.resume_state else 0
        updates_in_last_epoch = 0

        def _build_epoch_loader(epoch_index: int):
            """返回 (loader, sources, planned_batches, plan_start, skip)。

            planned_batches 是「本 epoch 按自身配置应当消费的 batch 数」，已经把
            --max-steps 算进去（历史语义：每个 epoch 只取该 epoch 排列的前 max_steps 个 batch）。
            它决定 state 里「epoch 是否跑完」，从而决定恢复是续跑同 epoch 还是进入下一 epoch。
            """
            _cap = int(args.max_steps) if args.max_steps is not None else None
            if batch_plan is not None:
                plan_start = consumption.updates
                remaining = len(plan_updates) - plan_start
                take = min(int(plan_updates_per_epoch), remaining)
                if take <= 0:
                    return None, None, 0, plan_start, 0
                if _cap is not None:
                    take = min(take, _cap)
                # V15/T15-08：plan 的行号 -> Subset 位置。必须在构造 sampler 之前解析，
                # 否则 DataLoader 会拿绝对行号去索引 Subset（见 PlanBatchSampler 的说明）。
                sampler = PlanBatchSampler(plan_updates, start=plan_start, count=take,
                                           row_to_position=_row_to_position)
                loader = DataLoader(train_data, batch_sampler=sampler,
                                    collate_fn=collate_samples)
                sources = plan_batch_sources(plan_updates, start=plan_start, count=take)
                return loader, sources, take, plan_start, 0
            _skip = skip_batches if epoch_index == start_epoch else 0
            loader = train_loader if _skip == 0 else SkipBatches(train_loader, _skip)
            planned = max(0, len(train_loader) - _skip)
            if _cap is not None:
                planned = min(planned, _cap)
            return loader, None, planned, 0, _skip

        try:
            for epoch in range(start_epoch, args.epochs + 1):
                # 进入本 epoch 前预算已耗尽：正常退出，不产生空 epoch。
                if args.global_update_limit is not None and consumption.updates >= args.global_update_limit:
                    stop_reason = "GLOBAL_UPDATE_LIMIT"
                    break
                if args.pause_after_updates is not None and consumption.updates >= args.pause_after_updates:
                    stop_reason = "CONTROLLED_PAUSE"
                    break

                epoch_loader, epoch_sources, epoch_batches_planned, _plan_start, _skip = \
                    _build_epoch_loader(epoch)
                if epoch_loader is None or epoch_batches_planned <= 0:
                    stop_reason = "PLAN_EXHAUSTED"
                    break
                epoch_start_gen_state = _order_gen.get_state()
                updates_before_epoch = consumption.updates
                # 本 epoch 的步数上限：--max-steps、总预算余额、受控暂停余额三者取最小。
                # 这样「暂停在第 N 次更新」是精确的，不会以 epoch 为单位过冲。
                _epoch_caps = []
                if args.max_steps is not None:
                    _epoch_caps.append(int(args.max_steps))
                if args.global_update_limit is not None:
                    _epoch_caps.append(int(args.global_update_limit) - updates_before_epoch)
                if args.pause_after_updates is not None:
                    _epoch_caps.append(int(args.pause_after_updates) - updates_before_epoch)
                if batch_plan is not None:
                    _epoch_caps.append(int(epoch_batches_planned))
                epoch_max_steps = min(_epoch_caps) if _epoch_caps else None
                if epoch_max_steps is not None and epoch_max_steps <= 0:
                    stop_reason = ("CONTROLLED_PAUSE"
                                   if (args.pause_after_updates is not None
                                       and updates_before_epoch >= int(args.pause_after_updates))
                                   else "GLOBAL_UPDATE_LIMIT")
                    break
                epoch_status: Dict[str, Any] = {}
                # [V17/T17-02 diff 3] 本 epoch 的掩码/分母台账（只记录）。
                epoch_mask_stats: Dict[str, Any] = {}
                train_loss, train_pol, train_acc = run_epoch(
                    model, epoch_loader, optimizer, device, value_weight=args.value_weight,
                    is_train=True, max_steps=epoch_max_steps,
                    loss_mode=args.loss_mode, teacher_temperature=args.teacher_temperature,
                    soft_weight=args.soft_weight, equiv_weight=args.equiv_weight,
                    epoch=epoch, global_update_limit=args.global_update_limit,
                    updates_before_epoch=updates_before_epoch, recorder=consumption,
                    legacy_bug_repro=args.legacy_bug_repro,
                    status=epoch_status, lr_at_update=lr_at_update,
                    batch_sources=epoch_sources,
                    value_loss_normalize=args.value_loss_normalize,
                    mask_stats=epoch_mask_stats,
                    frozen_ref=frozen_ref,
                    kl_weight=args.kl_weight,
                    update_checkpoint_hook=_update_checkpoint_hook,
                )
                updates_this_epoch = int(epoch_status.get("updatesRun", 0))
                last_epoch_ran = epoch
                updates_in_last_epoch = updates_this_epoch

                if updates_this_epoch == 0:
                    # 零消费 epoch：不验证、不推进 scheduler、不参与平均、不触发退化保护，
                    # 也绝不写进 history（V14b 审核 §3 [P2] 的假零准确率就是这么来的）。
                    zero_consumption_epochs += 1
                    stop_reason = ("GLOBAL_UPDATE_LIMIT"
                                   if (args.global_update_limit is not None
                                       and consumption.updates >= args.global_update_limit)
                                   else "ZERO_CONSUMPTION_EPOCH")
                    break

                val_loss = None
                val_acc = None
                val_mask_stats: Dict[str, Any] = {}
                if val_loader is not None:
                    val_loss, val_pol, val_acc = run_epoch(
                        model, val_loader, None, device, value_weight=args.value_weight, is_train=False,
                        loss_mode=args.loss_mode, teacher_temperature=args.teacher_temperature,
                        soft_weight=args.soft_weight, equiv_weight=args.equiv_weight,
                        legacy_bug_repro=args.legacy_bug_repro,
                        value_loss_normalize=args.value_loss_normalize,
                        mask_stats=val_mask_stats,
                    )
                # V15/T15-03：scheduler 只在「本 epoch 真正跑完」时推进一次。
                # 被总预算或受控暂停截断的 epoch 不算跑完——否则「暂停在第 3 步后恢复」
                # 会在恢复时用已经推进过的 lr 继续跑同一个 epoch 的剩余 batch，
                # 与连续运行不再等价（这正是 resume 权重不一致的来源）。
                _stopped_by_global_stop = (
                    (args.global_update_limit is not None
                     and consumption.updates >= int(args.global_update_limit))
                    or (args.pause_after_updates is not None
                        and consumption.updates >= int(args.pause_after_updates)))
                _epoch_completed = updates_this_epoch >= int(epoch_batches_planned)
                if args.lr_schedule_unit == "epoch" and (_epoch_completed or not _stopped_by_global_stop):
                    scheduler.step()

                # V14/T14-04：真实 epoch 的退化护栏。
                # V15/T15-03：只在真实消费的 epoch 上判定；零消费 epoch 已在上面直接退出。
                if best_train_acc > 0 and train_acc < 0.5 * best_train_acc:
                    degraded_epochs += 1
                else:
                    degraded_epochs = 0
                if train_acc > best_train_acc:
                    best_train_acc = train_acc

                is_best = False
                if val_acc is not None and val_acc > best_val_acc:
                    is_best = True
                    best_val_acc = val_acc
                    best_epoch = epoch
                    best_update = consumption.updates
                    for name, param in model.named_parameters():
                        if not torch.all(torch.isfinite(param.data)):
                            raise RuntimeError(f"Non-finite parameter weight in {name} before export!")
                    os.makedirs(os.path.dirname(os.path.abspath(args.out_model)), exist_ok=True)
                    export_model_to_ts_json(model, args.out_model,
                                            encoder_schema_id=args.encoder_schema_id)
                    best_sha = _sha256_file(args.out_model)
                    if args.deploy_to_src:
                        deployed_path = "src/game/ai/models/spatial_resnet_checkpoint.json"
                        os.makedirs(os.path.dirname(deployed_path), exist_ok=True)
                        shutil.copyfile(args.out_model, deployed_path)

                best_mark = " [*BEST]" if is_best else ""
                # V19/T19-00：中间权重已在 update_checkpoint_hook 里按真实更新数写出。
                # 这里不再用 epoch 末尾的相等比较补写——那正是 1k/2k 从未产出的原因。
                _never_hit = sorted(p for p in extra_save_point_set if p not in _inline_saved_points)
                if _never_hit and consumption.updates > max(_never_hit):
                    print(f"[V19][WARN] 累计更新 {consumption.updates} 已越过保存点 {_never_hit} "
                          f"却未命中；这些点将如实记为缺失。")
                print(
                    f"[Epoch {epoch:02d}/{args.epochs:02d}] "
                    f"Train Loss: {train_loss:.4f} (Acc: {train_acc*100:.2f}%) | "
                    + (f"Val Loss: {val_loss:.4f} (Acc: {val_acc*100:.2f}%)" if val_acc is not None
                       else "Val: (train-only 诊断模式，无验证集)")
                    + best_mark
                )
                # [V17/T17-02 diff 3] 每 epoch 打印 policy/value 两个分母（便于当场核对）。
                print(
                    f"    [masks] mode={args.value_loss_normalize} "
                    f"policy valid={epoch_mask_stats.get('policyValidRows')} "
                    f"masked={epoch_mask_stats.get('policyMaskedRows')} "
                    f"noCandidate={epoch_mask_stats.get('policyNoCandidateRows')} "
                    f"denominatorUsed={epoch_mask_stats.get('policyDenominatorUsed')} "
                    f"legacyBatchDenominator={epoch_mask_stats.get('policyLegacyBatchDenominator')} "
                    f"| value valid={epoch_mask_stats.get('valueValidRows')} "
                    f"masked={epoch_mask_stats.get('valueMaskedRows')} "
                    f"null={epoch_mask_stats.get('valueNullRows')} "
                    f"denominatorUsed={epoch_mask_stats.get('valueDenominatorUsed')} "
                    f"| val policy valid={val_mask_stats.get('policyValidRows')} "
                    f"val value valid={val_mask_stats.get('valueValidRows')} "
                    f"val value denominatorUsed={val_mask_stats.get('valueDenominatorUsed')}"
                )
                history.append({
                    "epoch": epoch,
                    "train_loss": train_loss,
                    "train_acc": train_acc,
                    "val_loss": val_loss,
                    "val_acc": val_acc,
                    "updatesInEpoch": updates_this_epoch,
                    "updatesCumulative": consumption.updates,
                    "exposuresCumulative": consumption.total_exposures,
                    # [V17/T17-02 diff 3] 掩码与分母台账（纯记录）。
                    "maskAccounting": dict(epoch_mask_stats),
                    "valMaskAccounting": dict(val_mask_stats),
                    # V18/T18-04：KL 项的真实读数。run_epoch 的局部变量在 main() 里不可见，
                    # 因此 KL 台账经 epoch_mask_stats 带出（与其它掩码台账同一通道）。
                    "kl": (
                        {
                            "weight": float(epoch_mask_stats.get("klWeight", args.kl_weight)),
                            "meanKlCurrentToFrozen": (
                                epoch_mask_stats["klSum"] / epoch_mask_stats["klRows"]
                            ),
                            "rowsWithKl": epoch_mask_stats["klRows"],
                            "referenceCheckpoint": args.kl_to_frozen,
                        }
                        if epoch_mask_stats.get("klRows")
                        else None
                    ),
                })

                # 每个真实 epoch 结束时刷新「最后已确认有效状态」。
                last_confirmed = {
                    "epoch": epoch,
                    "updatesInEpoch": updates_this_epoch,
                    "epochBatchCount": epoch_batches_planned,
                    "planStartUpdate": _plan_start,
                    "updates": consumption.updates,
                    "model": {k: v.detach().clone() for k, v in model.state_dict().items()},
                    "optimizer": copy.deepcopy(optimizer.state_dict()),
                    "scheduler": copy.deepcopy(scheduler.state_dict()),
                    "rng": collect_rng_state(_order_gen),
                    "consumption": consumption.to_state(),
                }

                if args.pause_after_updates is not None and consumption.updates >= args.pause_after_updates:
                    stop_reason = "CONTROLLED_PAUSE"
                    break
                if args.global_update_limit is not None and consumption.updates >= args.global_update_limit:
                    stop_reason = "GLOBAL_UPDATE_LIMIT"
                    break
                if degraded_epochs >= 3:
                    print(f"\n[V14] 训练退化：train_acc={train_acc:.4f} 连续 {degraded_epochs} 个 epoch "
                          f"低于历史最好值 {best_train_acc:.4f} 的一半；提前结束以保留可用检查点。")
                    history[-1]["earlyStop"] = "train_accuracy_degradation"
                    degradation_triggered = True
                    stop_reason = "TRAIN_DEGRADATION"
                    break
        except KeyboardInterrupt:
            # 受控暂停：保留最后一次已确认有效的状态并正常收尾。
            print("\n[V15] 收到中断信号，按受控暂停收尾（保留最后已确认有效状态）。")
            stop_reason = "CONTROLLED_PAUSE"
        except Exception as exc:  # noqa: BLE001 —— 真实异常必须保留现场、标失败，再向上抛
            import traceback
            failure_traceback = traceback.format_exc()
            fail_stem = os.path.splitext(os.path.basename(args.out_model))[0]
            fail_dir = os.path.dirname(os.path.abspath(args.out_model))
            os.makedirs(fail_dir, exist_ok=True)
            fail_state_path = f"{state_path}.failed.pt"
            fail_weights_path = os.path.join(fail_dir, f"{fail_stem}_failed_final.json")
            fail_record_path = os.path.join(fail_dir, f"{fail_stem}_failure.json")
            print(f"\n[V15][FAILED] 训练中出现真实异常：{type(exc).__name__}: {exc}")
            print(f"[V15][FAILED] 保留最后已确认有效状态（updates={last_confirmed['updates']}，"
                  f"失败时已完成的成功更新={consumption.updates}）。")
            try:
                fail_model = copy.deepcopy(model)
                fail_model.load_state_dict(last_confirmed["model"])
                export_model_to_ts_json(fail_model, fail_weights_path,
                                        encoder_schema_id=args.encoder_schema_id)
                torch.save({
                    "schema": V15_STATE_SCHEMA,
                    "stopReason": "ERROR",
                    "runFailed": True,
                    "identity": identity,
                    "epoch": int(last_confirmed["epoch"]),
                    "updatesInEpoch": 0,
                    "epochBatchCount": int(last_confirmed.get("epochBatchCount") or 0),
                    "updates": int(last_confirmed["updates"]),
                    "totalExposures": int(last_confirmed["consumption"]["totalExposures"]),
                    "consumption": last_confirmed["consumption"],
                    "samplerCursor": {"mode": "plan" if batch_plan is not None else "shuffle_seeded",
                                      "updatesInEpoch": 0, "note": "失败现场的确认状态"},
                    "model": last_confirmed["model"],
                    "optimizer": last_confirmed["optimizer"],
                    "scheduler": last_confirmed["scheduler"],
                    "rng": last_confirmed["rng"],
                    "best": {"valAcc": best_val_acc, "epoch": best_epoch, "update": best_update,
                             "sha256": best_sha, "path": os.path.abspath(args.out_model)},
                    "bestTrainAcc": best_train_acc,
                    "failure": {"errorType": type(exc).__name__, "errorMessage": str(exc)},
                }, fail_state_path)
            except Exception as save_exc:  # 保存现场失败也不能掩盖原始错误
                print(f"[V15][FAILED] 失败现场保存本身也出错：{save_exc}")
            try:
                with open(fail_record_path, "w", encoding="utf-8") as fh:
                    json.dump({
                        "schema": "v15_train_failure_1",
                        "runFailed": True,
                        "stopReason": "ERROR",
                        "errorType": type(exc).__name__,
                        "errorMessage": str(exc),
                        "traceback": failure_traceback,
                        "identity": identity,
                        "updatesMeasuredAtFailure": consumption.updates,
                        "exposuresMeasuredAtFailure": consumption.total_exposures,
                        "preservedStatePath": os.path.abspath(fail_state_path),
                        "preservedStateUpdates": int(last_confirmed["updates"]),
                        "preservedStateEpoch": int(last_confirmed["epoch"]),
                        "preservedWeightsPath": os.path.abspath(fail_weights_path),
                        "note": "保留的是最后一次已确认有效的状态，不是失败发生时的最新权重；"
                                "本运行按失败处理，不产生 final/best 成功产物。",
                    }, fh, indent=2, ensure_ascii=False)
                print(f"[V15][FAILED] 失败记录：{fail_record_path}")
            except OSError as record_exc:  # pragma: no cover
                print(f"[V15][FAILED] 失败记录写入出错：{record_exc}")
            raise

        # ------------------------------------------------------------------
        # V15/T15-03：统一收尾。预算耗尽 / epoch 正常结束 / 受控暂停 三条路径共用；
        # final 权重与 state 都对应「最后一次真实更新」。
        # ------------------------------------------------------------------
        def _finalize(reason: str, *, current_epoch: int | None = None,
                      current_updates_in_epoch: int | None = None) -> Dict[str, Any]:
            _epoch = int(last_epoch_ran if current_epoch is None else current_epoch)
            _upd_in_epoch = int(updates_in_last_epoch
                                if current_updates_in_epoch is None else current_updates_in_epoch)
            _batches = int(last_confirmed.get("epochBatchCount") or epoch_batches_planned or 0)
            mid_epoch = 0 < _upd_in_epoch < _batches
            if batch_plan is not None:
                sampler_cursor = {
                    "mode": "plan",
                    "planPath": batch_plan["_resolvedPath"],
                    "planSha256": batch_plan_sha,
                    "nextPlanIndex": consumption.updates,
                    "updatesPerEpoch": plan_updates_per_epoch,
                }
                _state_gen_state = _order_gen.get_state()
            else:
                sampler_cursor = {
                    "mode": "shuffle_seeded",
                    "dataOrderSeed": data_order_seed,
                    "updatesInEpoch": _upd_in_epoch,
                    "epochBatchCount": _batches,
                    "resumeMode": "mid_epoch_skip" if mid_epoch else "next_epoch",
                }
                _state_gen_state = (epoch_start_gen_state
                                    if mid_epoch and epoch_start_gen_state is not None
                                    else _order_gen.get_state())
            os.makedirs(os.path.dirname(os.path.abspath(final_model_path)), exist_ok=True)
            for _name, _param in model.named_parameters():
                if not torch.all(torch.isfinite(_param.data)):
                    raise RuntimeError(f"Non-finite parameter weight in {_name} before final export!")
            export_model_to_ts_json(model, final_model_path,
                                    encoder_schema_id=args.encoder_schema_id)
            final_sha = _sha256_file(final_model_path)
            state_payload = {
                "schema": V15_STATE_SCHEMA,
                "stopReason": reason,
                "identity": identity,
                "epoch": _epoch,
                "updatesInEpoch": (0 if not mid_epoch else _upd_in_epoch),
                "epochBatchCount": _batches,
                "updates": consumption.updates,
                "totalExposures": consumption.total_exposures,
                "consumption": consumption.to_state(),
                "samplerCursor": sampler_cursor,
                "model": model.state_dict(),
                "optimizer": optimizer.state_dict(),
                "scheduler": scheduler.state_dict(),
                "rng": {**collect_rng_state(_order_gen), "dataOrderGenerator": _state_gen_state},
                "best": {"valAcc": best_val_acc, "epoch": best_epoch, "update": best_update,
                         "sha256": best_sha, "path": os.path.abspath(args.out_model)},
                "bestTrainAcc": best_train_acc,
                "final": {"path": os.path.abspath(final_model_path), "sha256": final_sha,
                          "selectedAtUpdate": consumption.updates},
                "budget": {"globalUpdateLimit": identity["globalUpdateLimit"],
                           "maxStepsPerEpoch": identity["maxStepsPerEpoch"],
                           "epochsRequested": int(args.epochs)},
                "seeds": {"model": model_seed, "split": split_seed, "dataOrder": data_order_seed},
            }
            os.makedirs(os.path.dirname(os.path.abspath(state_path)), exist_ok=True)
            _tmp_state = f"{state_path}.tmp"
            torch.save(state_payload, _tmp_state)
            _atomic_replace(_tmp_state, state_path)
            return {"finalPath": os.path.abspath(final_model_path), "finalSha256": final_sha,
                    "statePath": os.path.abspath(state_path),
                    "stateSha256": _sha256_file(state_path),
                    "samplerCursor": sampler_cursor,
                    "resumeMode": sampler_cursor.get("resumeMode", "plan")}

        artifacts: Dict[str, Any] = {}
        if budget_already_reached:
            # 恢复时预算已经用完：0 次额外更新，只做身份核对与幂等收尾。
            stop_reason = "GLOBAL_UPDATE_LIMIT"
            artifacts = _finalize(stop_reason)
            print(f"[V15] 恢复时预算已用完（updates={consumption.updates}/"
                  f"{args.global_update_limit}）：跳过训练，只做身份核对与幂等收尾。")
        else:
            artifacts = _finalize(stop_reason)
        # 预算没用完就停下（例如 --epochs 不足、plan 已走完）时必须明说，不能静默少算消费。
        if (args.global_update_limit is not None
                and consumption.updates < int(args.global_update_limit)):
            print(f"[V15][WARN] 未用完预算：updates={consumption.updates}/"
                  f"{args.global_update_limit}，stopReason={stop_reason}；"
                  "state 已保存，可用 --resume-state 续跑到预算。")
        print(f"[V15] stopReason={stop_reason} updates={consumption.updates} "
              f"exposures={consumption.total_exposures} "
              f"zeroConsumptionEpochs={zero_consumption_epochs}")

        metrics_file = args.out_metrics
        if not metrics_file:
            base, _ = os.path.splitext(args.out_model)
            metrics_file = f"{base}_metrics.json"
        os.makedirs(os.path.dirname(os.path.abspath(metrics_file)), exist_ok=True)
        lr_first = (consumption.lr_trace[0]["lr"] if consumption.lr_trace else None)
        lr_last = (consumption.lr_trace[-1]["lr"] if consumption.lr_trace else None)
        metrics_payload = {
            "schema": "v15_spatial_train_metrics_2",
            "model_version": args.model_version,
            "encoder_schema_id": args.encoder_schema_id,
            "num_blocks": args.num_blocks,
            "global_policy_pool": bool(args.global_policy_pool),
            "dataset": args.dataset,
            "datasetSha256": _sha256_file(args.dataset) if os.path.exists(args.dataset) else None,
            "initCheckpoint": os.path.abspath(args.init_checkpoint) if args.init_checkpoint else None,
            "initCheckpointSha256": (_sha256_file(args.init_checkpoint)
                                     if args.init_checkpoint and os.path.exists(args.init_checkpoint) else None),
            "value_weight": args.value_weight,
            # ---- [V17/T17-02 diff 3] 价值监督身份（证明 value 权重/冻结是否真的生效）----
            "v17ValueSupervision": {
                "trainableParts": list(trainable_parts),
                "frozenParts": list(frozen_parts),
                "valueWeightEffective": float(args.value_weight),
                "valueLossNormalize": args.value_loss_normalize,
                "policyCeDenominatorMode": ("per-batch policyLossMask=true count"
                                            if args.value_loss_normalize == "valid-mask"
                                            else "per-batch row count (upstream behaviour)"),
                "valueMseDenominator": "rows with a valid value target (upstream behaviour, unchanged)",
                "paramGroups": {p: dict(_part_totals[p]) for p in _PARTS_ALL},
                "paramBreakdown": list(_param_breakdown),
                "frozenParamNames": [r["name"] for r in _param_breakdown if not r["requiresGrad"]],
                "optimizerParamCount": len(_trainable_params),
                "optimizerNumel": int(sum(int(p.numel()) for p in _trainable_params)),
                "note": "valueWeightEffective>0 且 value 参数出现在 optimizer 参数组里，是本轮 value 梯度"
                        "能真正改变权重的必要条件；充分性由 v17/tools/verify_training_runs.py 的"
                        "value-head 参数增量证明。",
            },
            "maskAccounting": {
                "mode": args.value_loss_normalize,
                "perEpoch": [
                    {"epoch": h.get("epoch"), "updates": h.get("updatesInEpoch"),
                     "train": h.get("maskAccounting"), "val": h.get("valMaskAccounting")}
                    for h in history
                ],
            },
            "loss_mode": args.loss_mode,
            "teacher_temperature": args.teacher_temperature,
            "soft_weight": args.soft_weight,
            "equiv_weight": args.equiv_weight,
            # V13/T13-01: the three streams are reported separately. `seed` is kept for
            # readers of the historic schema and equals the model seed.
            "seed": model_seed,
            "seeds": {"model": model_seed, "split": split_seed, "dataOrder": data_order_seed},
            "split": split_provenance,
            "lossAccounting": {
                "mode": "legacy_bug_repro" if args.legacy_bug_repro else "v13_fixed",
                "note": "train_loss/val_loss are single-counted means over accumulated batches"
                        if not args.legacy_bug_repro else
                        "LEGACY BUG REPRODUCTION: train_loss is inflated by double accumulation",
            },
            "best_val_acc": (best_val_acc if best_epoch > 0 else None),
            "best_epoch": best_epoch,
            "train_samples": len(train_data),
            "val_samples": len(val_data),
            "epochsRequested": args.epochs,
            "epochsCompleted": len(history),
            "optimizerUpdates": consumption.updates,
            "history": history,
            # ------------------------------ V15/T15-03 新增的身份与生命周期字段
            "spatial_channels": int(spatial_channels_from_data),
            "globalDim": int(global_dim),
            "actionSemanticDim": int(action_semantic_dim),
            "batchSize": int(args.batch_size),
            "globalUpdateLimit": identity["globalUpdateLimit"],
            "maxStepsPerEpoch": identity["maxStepsPerEpoch"],
            "identity": identity,
            "diagnosticMode": "train_only" if args.train_only else None,
            "bestSelectionRule": ("disabled_train_only_diagnostic" if args.train_only
                                  else "clean_val_top1_then_lower_ce_then_earlier_update"),
            "lrSchedule": {
                "schedule": args.lr_schedule,
                "unit": args.lr_schedule_unit,
                "lrMax": float(args.lr),
                "lrMin": float(args.lr_min),
                "totalUpdates": (int(lr_total_updates) if lr_total_updates is not None else None),
                "lrAtFirstUpdate": lr_first,
                "lrAtLastUpdate": lr_last,
            },
            "batchPlan": (None if batch_plan is None else {
                "path": batch_plan["_resolvedPath"],
                "sha256": batch_plan_sha,
                "totalUpdates": len(batch_plan["updates"]),
                "updatesPerEpoch": plan_updates_per_epoch,
                "sources": {str(s["name"]): int(s["quota"]) for s in batch_plan["sources"]},
            }),
            "lifecycle": {
                "stopReason": stop_reason,
                "updatesCompleted": consumption.updates,
                "exposuresMeasured": consumption.total_exposures,
                "zeroConsumptionEpochs": zero_consumption_epochs,
                "degradationGuardTriggered": degradation_triggered,
                "epochsRecorded": len(history),
                "controlledPauseAfterUpdates": args.pause_after_updates,
                "budgetAlreadyReachedOnResume": bool(budget_already_reached),
                "resume": resume_info,
            },
            "artifacts": {
                "best": (None if best_epoch <= 0 else {
                    "path": os.path.abspath(args.out_model), "sha256": best_sha,
                    "selectedAtUpdate": best_update, "selectedAtEpoch": best_epoch,
                    "valAcc": best_val_acc}),
                "final": {"path": artifacts["finalPath"], "sha256": artifacts["finalSha256"],
                          "selectedAtUpdate": consumption.updates, "stopReason": stop_reason},
                "state": {"path": artifacts["statePath"], "sha256": artifacts["stateSha256"],
                          "updates": consumption.updates, "resumable": True,
                          "schema": V15_STATE_SCHEMA},
                # V15/T15-03：协议 §3.1 要求的中间权重（500/1500/3000）。
                # V19/T19-00：保存钩子挂在真实 optimizer 更新上；未命中的点在这里如实缺失，
                # 便于第三方核对（不再出现「保存点落在 epoch 中间 ⇒ 永远不产出」的静默丢失）。
                "intermediate": extra_saved,
                "intermediateHook": "optimizer_update",
                "requestedIntermediateUpdates": (
                    [int(v) for v in str(args.save_at_updates).split(",") if v.strip()]
                    if args.save_at_updates else []),
                "missingIntermediateUpdates": sorted(
                    p for p in extra_save_point_set if p not in _inline_saved_points),
            },
        }
        if args.train_only:
            metrics_payload["trainOnly"] = {
                "allRowsOptimized": True,
                "optimizedSamples": len(train_data),
                "finalTrainHitRate": (history[-1]["train_acc"] if history else None),
                "outputBasis": "final_weights_and_train_hit",
                "note": "诊断模式：不使用验证集，不按 val 选 best。",
            }
        _tmp_metrics = f"{metrics_file}.tmp"
        with open(_tmp_metrics, "w", encoding="utf-8") as f:
            json.dump(metrics_payload, f, indent=2)
        _atomic_replace(_tmp_metrics, metrics_file)

        consumption_json = consumption.to_json(len(train_data), args.batch_size,
                                               planned_updates=identity["globalUpdateLimit"])
        consumption_json.update({
            "dataset": os.path.abspath(args.dataset),
            "datasetSha256": identity["datasetSha256"],
            "epochs": args.epochs,
            "maxStepsPerEpoch": args.max_steps,
            "globalUpdateLimit": args.global_update_limit,
            "plannedValRows": len(val_data),
            "optimizedSampleIds": sorted(consumption.unique_sample_ids),
            "stopReason": stop_reason,
            "lifecycle": metrics_payload["lifecycle"],
            "lrSchedule": metrics_payload["lrSchedule"],
            "batchPlan": metrics_payload["batchPlan"],
            "diagnosticMode": metrics_payload["diagnosticMode"],
            "identity": identity,
            "ledgerStartUpdateIndex": int(ledger_start_index),
        })
        consumed_manifest_file = args.optimized_manifest or os.path.join(
            os.path.dirname(os.path.abspath(args.out_model)), "optimized_samples_manifest.json")
        os.makedirs(os.path.dirname(os.path.abspath(consumed_manifest_file)), exist_ok=True)
        with open(consumed_manifest_file, "w", encoding="utf-8") as f:
            json.dump(consumption_json, f, indent=2)
        # V13/T13-07: the ledger used to be named after its DIRECTORY, so two runs sharing
        # an output directory silently overwrote each other's consumption evidence - which
        # is exactly what happened during the first pass of T13-07. Name it after the
        # out-model instead, so each run gets its own file by default, and keep the
        # overwrite guard as a second line of defence against an explicit path collision.
        _stem = os.path.splitext(os.path.basename(args.out_model))[0]
        ledger_file = os.path.join(os.path.dirname(os.path.abspath(args.out_model)),
                                   f"{_stem}.optimizer_update_ledger.jsonl")
        if os.path.exists(ledger_file):
            raise FileExistsError(
                f"refusing to overwrite an existing optimizer ledger: {ledger_file!r}. "
                "Give this run its own --out-model path."
            )
        with open(ledger_file, "w", encoding="utf-8") as f:
            for entry in consumption.update_log:
                f.write(json.dumps(entry) + "\n")
        print("[Measured consumption] updates=" + str(consumption.updates) +
              " exposures=" + str(consumption.total_exposures) +
              " uniqueOptimized=" + str(len(consumption.unique_sample_ids)) + "/" + str(len(train_data)) +
              " plannedNeverOptimized=" + str(consumption_json["plannedButNeverOptimized"]))

        print(f"\n=======================================================")
        if best_epoch > 0:
            print(f"[Training Complete] Best Validation Accuracy: {best_val_acc * 100:.2f}% (Epoch {best_epoch})")
        else:
            print("[Training Complete] 本次运行没有可用的 best 选择（诊断模式或没有验证集）。")
        print(f"stopReason: {stop_reason} | updates: {consumption.updates} | "
              f"exposures: {consumption.total_exposures} | finalUpdate: "
              f"{artifacts['finalSha256'][:12] if artifacts.get('finalSha256') else None}")
        print(f"Best model checkpoint: {args.out_model}")
        print(f"Final model checkpoint: {artifacts.get('finalPath')} "
              f"(sha256={artifacts.get('finalSha256')})")
        print(f"Resumable state: {artifacts.get('statePath')} "
              f"(sha256={artifacts.get('stateSha256')})")
        print(f"Metrics saved to: {metrics_file}")
        print(f"Consumed samples manifest: {consumed_manifest_file}")
        print(f"=======================================================\n")


if __name__ == "__main__":
    main()
