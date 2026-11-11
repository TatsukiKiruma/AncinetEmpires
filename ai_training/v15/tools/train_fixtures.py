"""V15/T15-03：小型但「真实 schema」的训练夹具生成器。

用途：训练生命周期回归需要小模型 + 小数据，但数据必须与真实数据集同 schema，
否则测出来的东西和正式训练不是同一条路径。

字段结构参照 `v14/out/v14_20260924_t14/T14-02/dataset_v14.jsonl` 的一条记录：
  spatialTensor   26*20*20 扁平数组
  globalFeatures  20 维
  candidateActions 每条含 actorCoord/landingCoord/targetCoord 与 53 维 semantics
本模块只生成夹具，不参与任何生产数据流程。
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence

CHANNELS = 26
GRID = 20
GLOBAL_DIM = 20
SEMANTIC_DIM = 53


def _spatial_vector(rng: random.Random, channels: int = CHANNELS) -> List[float]:
    """确定性小数值空间张量；非零但幅度很小，便于稳定复现。"""
    n = channels * GRID * GRID
    return [round(rng.uniform(0.0, 0.25), 4) for _ in range(n)]


def make_row(
    index: int,
    *,
    root: str,
    sample_id: str,
    seed: int = 0,
    candidates: int = 4,
    target_idx: int | None = None,
    channels: int = CHANNELS,
    global_dim: int = GLOBAL_DIM,
    semantic_dim: int = SEMANTIC_DIM,
    partition: str = "train",
    policy_input_key: str | None = None,
    source_state_key: str | None = None,
    non_finite_spatial: bool = False,
    teacher_q_nan: bool = False,
) -> Dict[str, Any]:
    rng = random.Random(f"{seed}:{root}:{sample_id}")
    spatial = _spatial_vector(rng, channels)
    if non_finite_spatial:
        # 人为注入非有限输入：训练器必须报真实错误，而不是把它算成零消费。
        spatial[0] = float("nan")
    cands = []
    for c in range(candidates):
        semantics = [0.0] * semantic_dim
        semantics[c % semantic_dim] = 1.0
        semantics[(c + 7) % semantic_dim] = round(rng.uniform(0.0, 1.0), 4)
        cands.append({
            "actorCoord": {"x": (index + c) % GRID, "y": (index * 3 + c) % GRID},
            "landingCoord": {"x": (index + c + 1) % GRID, "y": (index * 3 + c) % GRID},
            "targetCoord": ({"x": (index + c + 2) % GRID, "y": (index * 3 + c + 1) % GRID}
                            if c % 2 == 0 else None),
            "semantics": semantics,
        })
    row: Dict[str, Any] = {
        "schemaVersion": "v15_spatial_dataset_fixture_1",
        "sampleId": sample_id,
        "sourceStateKey": source_state_key or f"FIXTURE:{root}#{index}",
        "rootFamilyId": root,
        "parentRootId": root,
        "lineageId": root,
        "partition": partition,
        "stateHash": f"fixture_state_{root}_{index}",
        "stateFidelity": "FIXTURE",
        "encoderSchemaId": "spatial26_global20_actionSemantics53_v14",
        "candidateSchemaId": "v14_candidates_all_policy_allowed_1",
        "spatialTensor": spatial,
        "globalFeatures": [round(rng.uniform(0.0, 1.0), 4) for _ in range(global_dim)],
        "candidateActions": cands,
        "candidateActionCodes": [f"fixture:act{c}" for c in range(candidates)],
        "targetActionCode": f"fixture:act{index % candidates if target_idx is None else target_idx}",
        "targetActionIndex": (index % candidates) if target_idx is None else target_idx,
        "policyLossMask": True,
        "valueLossMask": True,
        "valueTarget": 1.0 if index % 2 == 0 else -1.0,
        "outcomeKind": "FIXTURE",
    }
    if policy_input_key is not None:
        row["policyInputKey"] = policy_input_key
    if teacher_q_nan:
        # 人为注入非有限 loss：soft 模式下 softmax(NaN) 会让 loss 变成 NaN。
        row["teacherQ"] = [float("nan")] + [0.0] * (candidates - 1)
    return row


def write_dataset(path: str | Path, rows: Iterable[Dict[str, Any]]) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row) + "\n")
    return p


def build_split_dataset(
    out_dir: str | Path,
    *,
    train_rows: int = 16,
    val_rows: int = 4,
    seed: int = 20260925,
    candidates: int = 4,
    name: str = "fixture_dataset.jsonl",
    manifest_name: str = "fixture_split_manifest.json",
) -> Dict[str, Any]:
    """生成 train/val 两个 root 家族的小数据集 + 对应 split manifest。"""
    out_dir = Path(out_dir)
    rows: List[Dict[str, Any]] = []
    train_root = "FIXTURE_ROOT_TRAIN"
    val_root = "FIXTURE_ROOT_VAL"
    for i in range(train_rows):
        rows.append(make_row(i, root=train_root, sample_id=f"fix_tr_{i:04d}", seed=seed,
                             candidates=candidates, partition="train",
                             policy_input_key=f"pik_tr_{i:04d}"))
    for i in range(val_rows):
        rows.append(make_row(1000 + i, root=val_root, sample_id=f"fix_va_{i:04d}", seed=seed,
                             candidates=candidates, partition="val",
                             policy_input_key=f"pik_va_{i:04d}"))
    dataset_path = write_dataset(out_dir / name, rows)
    manifest_path = out_dir / manifest_name
    manifest_path.write_text(json.dumps({
        "schema": "v15_fixture_split_manifest_1",
        "rule": "夹具：按 root 家族分割。",
        "trainRootFamilies": [train_root],
        "valRootFamilies": [val_root],
        "testRootFamilies": [],
        "sampleCounts": {"train": train_rows, "val": val_rows, "test": 0},
    }, indent=2), encoding="utf-8")
    return {
        "datasetPath": str(dataset_path),
        "manifestPath": str(manifest_path),
        "trainRows": train_rows,
        "valRows": val_rows,
        "trainSampleIds": [f"fix_tr_{i:04d}" for i in range(train_rows)],
        "valSampleIds": [f"fix_va_{i:04d}" for i in range(val_rows)],
    }


def build_train_only_dataset(
    out_dir: str | Path,
    *,
    rows: int = 128,
    seed: int = 20260925,
    candidates: int = 4,
    name: str = "fixture_train_only.jsonl",
) -> Dict[str, Any]:
    """V14b 审核 §2.1 的 128 状态诊断：全部行都必须真的进入优化。"""
    out_dir = Path(out_dir)
    data = [
        make_row(i, root=f"FIXTURE_TO_{i // 8:03d}", sample_id=f"fix_to_{i:04d}", seed=seed,
                 candidates=candidates, partition="train",
                 policy_input_key=f"pik_to_{i:04d}")
        for i in range(rows)
    ]
    dataset_path = write_dataset(out_dir / name, data)
    return {"datasetPath": str(dataset_path), "rows": rows,
            "sampleIds": [f"fix_to_{i:04d}" for i in range(rows)]}


def write_rows(path: str | Path, rows: Sequence[Dict[str, Any]]) -> Path:
    return write_dataset(path, rows)
