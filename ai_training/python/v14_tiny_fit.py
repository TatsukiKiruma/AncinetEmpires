"""V14/T14-04：128 状态可拟合性检查的数据选择与训练链路诊断。

本脚本只做两件事，训练本身交给现有训练器（`python/train_spatial_resnet.py`），
以免在诊断里再写一套训练数学：

1. 从干净数据集里挑出 N 个（默认 128）互不相同、可追溯、覆盖重要动作类型与阶段/
   人数/地图的状态，写出 `tiny_fit_dataset.jsonl` 与 `tiny_fixture_manifest.json`；
2. 在训练完成后，用固定 final checkpoint 对同一批状态做一次完整重评，
   输出 `tiny_fit_metrics.json`（训练目标 top-1），而不是累加训练过程中各批的预测。

用法：
    py python/v14_tiny_fit.py select --dataset <dataset.jsonl> --out-dir <dir> [--states 128]
    py python/v14_tiny_fit.py evaluate --dataset <tiny_fit_dataset.jsonl> \\
        --checkpoint <model.json> --out-dir <dir>
    py python/v14_tiny_fit.py diagnose --dataset <tiny_fit_dataset.jsonl> --out-dir <dir>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "python"))


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def load_dataset(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def target_type_of(row: Dict[str, Any]) -> str:
    return str(row.get("targetActionCode", "")).split(":")[0] or "unknown"


def select_states(rows: List[Dict[str, Any]], target_states: int, seed: int = 314159) -> Dict[str, Any]:
    """分层挑选状态：按（目标动作类型 × 玩家人数）分层轮转，保证类型与人数覆盖。"""
    import random

    rng = random.Random(seed)
    # 同一状态只保留一行（sourceStateKey 唯一）；若重复取内容最少候选的那行更省成本。
    by_state: Dict[str, Dict[str, Any]] = {}
    dropped_duplicates = 0
    for row in rows:
        key = str(row.get("sourceStateKey") or row.get("sampleId"))
        existing = by_state.get(key)
        if existing is None:
            by_state[key] = row
        else:
            dropped_duplicates += 1
            if len(row.get("candidateActionCodes", [])) < len(existing.get("candidateActionCodes", [])):
                by_state[key] = row

    strata: Dict[tuple, List[Dict[str, Any]]] = defaultdict(list)
    for row in by_state.values():
        strata[(target_type_of(row), int(row.get("playerCount") or 0))].append(row)
    for bucket in strata.values():
        bucket.sort(key=lambda r: str(r.get("sampleId")))

    keys = sorted(strata.keys(), key=lambda k: (-len(strata[k]), str(k)))
    for key in keys:
        rng.shuffle(strata[key])

    selected: List[Dict[str, Any]] = []
    cursor = {key: 0 for key in keys}
    while len(selected) < target_states:
        progressed = False
        for key in keys:
            if len(selected) >= target_states:
                break
            index = cursor[key]
            bucket = strata[key]
            if index < len(bucket):
                selected.append(bucket[index])
                cursor[key] = index + 1
                progressed = True
        if not progressed:
            break

    # 兜底：若分层不足，用其余行补齐（仍保持状态唯一）
    if len(selected) < target_states:
        chosen = {str(r.get("sampleId")) for r in selected}
        pool = [r for r in by_state.values() if str(r.get("sampleId")) not in chosen]
        pool.sort(key=lambda r: str(r.get("sampleId")))
        selected.extend(pool[: target_states - len(selected)])

    by_type = Counter(target_type_of(r) for r in selected)
    by_players = Counter(int(r.get("playerCount") or 0) for r in selected)
    by_root = Counter(str(r.get("rootFamilyId")) for r in selected)
    by_partition = Counter(str(r.get("partition")) for r in selected)
    by_map = Counter(str(r.get("mapName")) for r in selected)

    return {
        "selected": selected,
        "diagnostics": {
            "candidateRows": len(rows),
            "uniqueStates": len(by_state),
            "droppedDuplicateStateRows": dropped_duplicates,
            "selectedStates": len(selected),
            "targetTypes": dict(by_type),
            "playerCounts": dict(by_players),
            "roots": dict(by_root),
            "partitions": dict(by_partition),
            "maps": dict(by_map),
            "distinctRoots": len(by_root),
            "distinctMaps": len(by_map),
        },
    }


def write_jsonl(path: Path, rows: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def command_select(args: argparse.Namespace) -> int:
    dataset = Path(args.dataset)
    if not dataset.exists():
        print(f"[T14-04] 缺少数据集 {dataset}", file=sys.stderr)
        return 1
    rows = load_dataset(dataset)
    result = select_states(rows, args.states, seed=args.seed)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    tiny_dataset = out_dir / "tiny_fit_dataset.jsonl"
    write_jsonl(tiny_dataset, result["selected"])

    # 训练/评估用的 split manifest：单一 root 家族标记，便于现有训练器做分组切分。
    # 训练配置使用 --val-split 0.5 会让 val 与 train 重叠；因此这里显式给出 manifest，
    # 但把全部 128 个状态都放进 trainRootFamilies，val 用一个不存在的占位 root，
    # 再配合 --val-split 0 的语义（见 docs：tiny-fit 是记忆诊断）。
    manifest = {
        "schema": "v14_tiny_fit_manifest_1",
        "task": "T14-04",
        "dataset": str(tiny_dataset).replace("\\", "/"),
        "datasetSha256": _sha256_file(tiny_dataset),
        "selectedStates": len(result["selected"]),
        "targetTypes": result["diagnostics"]["targetTypes"],
        "playerCounts": result["diagnostics"]["playerCounts"],
        "partitions": result["diagnostics"]["partitions"],
        "maps": result["diagnostics"]["maps"],
        "distinctRoots": result["diagnostics"]["distinctRoots"],
        "seed": args.seed,
        "selectionRule": "按（目标动作类型 × 玩家人数）分层轮转；同一 sourceStateKey 只保留一行；"
                         "不按候选数排序，避免只取候选最多的中间状态。",
        "sampleIds": [r.get("sampleId") for r in result["selected"]],
        "sourceStateKeys": [r.get("sourceStateKey") for r in result["selected"]],
    }
    (out_dir / "tiny_fixture_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    print(f"[T14-04] selected={len(result['selected'])} states -> {tiny_dataset}")
    print(f"[T14-04] targetTypes={result['diagnostics']['targetTypes']}")
    print(f"[T14-04] playerCounts={result['diagnostics']['playerCounts']} roots={result['diagnostics']['distinctRoots']}")
    return 0 if len(result["selected"]) >= args.states else 2


def _collate_tiny(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """把若干数据集行组装成训练器 run_epoch 可消费的 batch（复用其加载约定）。"""
    import numpy as np
    import torch

    candidates = []
    spatial = []
    globals_list = []
    targets = []
    values = []
    masks = []
    for row in rows:
        cand = []
        for entry in row.get("candidateActions", []):
            semantics = entry.get("semantics", [])
            padded = list(semantics[:53]) + [0.0] * max(0, 53 - len(semantics))
            cand.append({
                "actorCoord": entry.get("actorCoord"),
                "landingCoord": entry.get("landingCoord"),
                "targetCoord": entry.get("targetCoord"),
                "semantics_padded": np.array(padded, dtype=np.float32),
            })
        candidates.append(cand)
        spatial.append(torch.tensor(row["spatialTensor"], dtype=torch.float32).reshape(26, 20, 20))
        globals_list.append(torch.tensor(row["globalFeatures"], dtype=torch.float32))
        targets.append(int(row.get("targetActionIndex", 0)))
        value = row.get("valueTarget")
        values.append(0.0 if value is None else float(value))
        masks.append(bool(row.get("valueLossMask", value is not None)))
    return {
        "spatial_tensor": torch.stack(spatial),
        "global_features": torch.stack(globals_list),
        "candidates": candidates,
        "target_idx": targets,
        "value_target": torch.tensor(values, dtype=torch.float32),
        "value_mask": torch.tensor(masks, dtype=torch.bool),
        "teacherQ": [None] * len(rows),
        "equivalenceGroups": [None] * len(rows),
    }


def command_evaluate(args: argparse.Namespace) -> int:
    """用固定 final checkpoint 对全部 tiny 状态重新评估，输出真实 top-1。"""
    import torch

    import train_spatial_resnet as trainer
    from spatial_resnet_model import SpatialResNet, load_model_from_ts_json

    dataset = Path(args.dataset)
    checkpoint = Path(args.checkpoint)
    if not dataset.exists():
        print(f"[T14-04] 缺少数据集 {dataset}", file=sys.stderr)
        return 1
    if not checkpoint.exists():
        print(f"[T14-04] 缺少检查点 {checkpoint}", file=sys.stderr)
        return 1

    rows = load_dataset(dataset)
    # V14/T14-03：语义维度由数据决定（32 = 历史 v2，53 = v14 含兵种 one-hot）。
    sem_dims = {len(c.get("semantics", [])) for row in rows for c in row.get("candidateActions", [])}
    if len(sem_dims) != 1:
        print(f"[T14-04] 候选语义维度不唯一：{sorted(sem_dims)}", file=sys.stderr)
        return 6
    semantic_dim = sem_dims.pop()
    channels = {len(row["spatialTensor"]) // (20 * 20) for row in rows}
    if len(channels) != 1:
        print(f"[T14-04] 空间通道数不唯一：{sorted(channels)}", file=sys.stderr)
        return 6
    spatial_channels = channels.pop()
    global_dims = {len(row["globalFeatures"]) for row in rows}
    if len(global_dims) != 1:
        print(f"[T14-04] 全局特征维度不唯一：{sorted(global_dims)}", file=sys.stderr)
        return 6
    global_dim = global_dims.pop()
    print(f"[T14-04] checkpoint dims: channels={spatial_channels} global={global_dim} semantics={semantic_dim}")
    model = SpatialResNet(
        spatial_channels=spatial_channels, trunk_channels=32, global_dim=global_dim,
        action_semantic_dim=semantic_dim, version="spatial-resnet-v2", num_blocks=args.num_blocks,
    )
    load_model_from_ts_json(model, str(checkpoint))
    device = torch.device("cpu")
    model.to(device)

    # 中文：labels / 候选数 / 目标下标一致性检查 —— 目标下标必须真的指向目标动作码。
    index_errors = []
    empty_candidate_rows = []
    for row in rows:
        codes = row.get("candidateActionCodes", [])
        idx = int(row.get("targetActionIndex", -1))
        if not codes:
            empty_candidate_rows.append(row.get("sampleId"))
            continue
        if idx < 0 or idx >= len(codes) or codes[idx] != row.get("targetActionCode"):
            index_errors.append({
                "sampleId": row.get("sampleId"),
                "targetActionIndex": idx,
                "targetActionCode": row.get("targetActionCode"),
                "codeAtIndex": codes[idx] if 0 <= idx < len(codes) else None,
            })

    # 逐样本前向（batch=1）得到 top-1，与训练器的候选打分路径保持一致。
    batch = _collate_tiny(rows)
    with torch.no_grad():
        correct = 0
        total = 0
        logits_record = []
        for i, row in enumerate(rows):
            cands = batch["candidates"][i]
            if not cands:
                continue
            z = model.forward_trunk(batch["spatial_tensor"][i:i + 1])
            glob = batch["global_features"][i:i + 1]
            act = [c["actorCoord"] for c in cands]
            land = [c["landingCoord"] for c in cands]
            tgt = [c["targetCoord"] for c in cands]
            v_act = trainer.pool_coords_batch(z[0], act)
            v_land = trainer.pool_coords_batch(z[0], land)
            v_tgt = trainer.pool_coords_batch(z[0], tgt)
            sem = torch.from_numpy(__import__("numpy").stack([c["semantics_padded"] for c in cands]))
            glob_expanded = glob[0].unsqueeze(0).expand(len(cands), -1)
            feats = torch.cat([v_act, v_land, v_tgt, sem, glob_expanded], dim=-1).unsqueeze(0)
            logits = model.forward_action_logits(feats)[0]
            best = int(torch.argmax(logits).item())
            target = int(row.get("targetActionIndex", 0))
            total += 1
            if best == target:
                correct += 1
            else:
                logits_record.append({
                    "sampleId": row.get("sampleId"),
                    "targetActionIndex": target,
                    "predictedIndex": best,
                    "targetActionCode": row.get("targetActionCode"),
                    "predictedActionCode": row.get("candidateActionCodes", [None] * (best + 1))[best],
                    "logitMargin": float(logits[target].item() - logits[best].item()),
                    "candidateCount": len(cands),
                })

    top1 = correct / total if total else None
    metrics = {
        "schema": "v14_tiny_fit_metrics_1",
        "task": "T14-04",
        "diagnostic": True,
        "note": "这是训练集记忆诊断，不是泛化指标：被评估的状态就是被优化的状态。",
        "dataset": str(dataset).replace("\\", "/"),
        "datasetSha256": _sha256_file(dataset),
        "checkpoint": str(checkpoint).replace("\\", "/"),
        "checkpointSha256": _sha256_file(checkpoint),
        "states": total,
        "top1Correct": correct,
        "top1": top1,
        "acceptanceTarget": 0.99,
        "acceptancePassed": bool(top1 is not None and top1 >= 0.99),
        "targetIndexCodeMismatches": index_errors,
        "emptyCandidateRows": empty_candidate_rows,
        "errors": logits_record,
    }
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "tiny_fit_metrics.json").write_text(
        json.dumps(metrics, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    print(f"[T14-04] re-evaluated {total} states with final checkpoint: top-1 = "
          f"{(top1 or 0) * 100:.2f}% ({correct}/{total})")
    if index_errors:
        print(f"[T14-04] 目标下标/动作码不一致 {len(index_errors)} 例（必须先修数据）", file=sys.stderr)
        return 3
    return 0 if metrics["acceptancePassed"] else 4


def command_diagnose(args: argparse.Namespace) -> int:
    """训练链路诊断：候选 padding、mask、目标下标、数值有限性、空候选。"""
    import numpy as np

    rows = load_dataset(Path(args.dataset))
    report: Dict[str, Any] = {
        "schema": "v14_tiny_fit_dataset_diagnosis_1",
        "task": "T14-04",
        "dataset": args.dataset,
        "rows": len(rows),
        "checks": {},
        "problems": [],
    }
    problems: List[str] = []
    spatial_shapes = Counter()
    global_dims = Counter()
    sem_dims = Counter()
    candidate_counts = []
    nonfinite = 0
    for row in rows:
        tensor = np.asarray(row["spatialTensor"], dtype=np.float32)
        spatial_shapes[tuple(tensor.shape)] += 1
        if not np.isfinite(tensor).all():
            nonfinite += 1
        g = np.asarray(row["globalFeatures"], dtype=np.float32)
        global_dims[int(g.shape[0])] += 1
        if not np.isfinite(g).all():
            nonfinite += 1
        codes = row.get("candidateActionCodes", [])
        actions = row.get("candidateActions", [])
        candidate_counts.append(len(codes))
        if len(codes) != len(actions):
            problems.append(f"{row.get('sampleId')}: candidateActionCodes={len(codes)} 与 candidateActions={len(actions)} 长度不同")
        if len(codes) == 0:
            problems.append(f"{row.get('sampleId')}: 候选为空")
        for entry in actions:
            sem = np.asarray(entry.get("semantics", []), dtype=np.float32)
            sem_dims[int(sem.shape[0])] += 1
            if not np.isfinite(sem).all():
                nonfinite += 1
        idx = int(row.get("targetActionIndex", -1))
        if codes and (idx < 0 or idx >= len(codes) or codes[idx] != row.get("targetActionCode")):
            problems.append(f"{row.get('sampleId')}: 目标下标与目标动作码不一致")
        if len(codes) != int(row.get("candidateCountStored", len(codes))):
            problems.append(f"{row.get('sampleId')}: candidateCountStored 与候选数不一致")
        # 策略过滤（仅去掉 surrender）必须被显式记录：
        # engineLegal = policyAllowed + len(filteredActionCodes)，且 filtered 只能是 surrender。
        engine_legal = int(row.get("candidateCountEngineLegal", -1))
        policy_allowed = int(row.get("candidateCountPolicyAllowed", -1))
        filtered = row.get("filteredActionCodes") or []
        if engine_legal != policy_allowed + len(filtered):
            problems.append(
                f"{row.get('sampleId')}: engineLegal({engine_legal}) != "
                f"policyAllowed({policy_allowed}) + filtered({len(filtered)})"
            )
        unexpected = [code for code in filtered if code.split(':')[0] != "surrender"]
        if unexpected:
            problems.append(f"{row.get('sampleId')}: 策略过滤器剔除了非 surrender 动作 {unexpected[:3]}")
        if len(codes) != policy_allowed:
            problems.append(
                f"{row.get('sampleId')}: 存储候选数 {len(codes)} != candidateCountPolicyAllowed {policy_allowed}"
            )
    report["checks"] = {
        "spatialShapes": {str(k): v for k, v in spatial_shapes.items()},
        "globalDims": dict(global_dims),
        "semanticDims": dict(sem_dims),
        "candidateCountMin": min(candidate_counts) if candidate_counts else None,
        "candidateCountMax": max(candidate_counts) if candidate_counts else None,
        "candidateCountMean": (sum(candidate_counts) / len(candidate_counts)) if candidate_counts else None,
        "nonFiniteTensors": nonfinite,
        "emptyCandidateRows": sum(1 for c in candidate_counts if c == 0),
    }
    report["problems"] = problems
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "tiny_fit_link_diagnosis.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    print(f"[T14-04] diagnosis: rows={len(rows)} problems={len(problems)} nonFinite={nonfinite} "
          f"candidateRange=[{report['checks']['candidateCountMin']},{report['checks']['candidateCountMax']}]")
    return 0 if not problems else 5


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="V14/T14-04 tiny-fit 选择与重评")
    sub = parser.add_subparsers(dest="command", required=True)

    p_select = sub.add_parser("select", help="挑选 128 个状态并写出 tiny 数据集与 manifest")
    p_select.add_argument("--dataset", required=True)
    p_select.add_argument("--out-dir", required=True)
    p_select.add_argument("--states", type=int, default=128)
    p_select.add_argument("--seed", type=int, default=314159)
    p_select.set_defaults(func=command_select)

    p_eval = sub.add_parser("evaluate", help="用固定 final checkpoint 重评全部 tiny 状态")
    p_eval.add_argument("--dataset", required=True)
    p_eval.add_argument("--checkpoint", required=True)
    p_eval.add_argument("--out-dir", required=True)
    p_eval.add_argument("--num-blocks", type=int, default=2)
    p_eval.set_defaults(func=command_evaluate)

    p_diag = sub.add_parser("diagnose", help="训练链路诊断（padding/mask/目标下标/有限性）")
    p_diag.add_argument("--dataset", required=True)
    p_diag.add_argument("--out-dir", required=True)
    p_diag.set_defaults(func=command_diagnose)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
