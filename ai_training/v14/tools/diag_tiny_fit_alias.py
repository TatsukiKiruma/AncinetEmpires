"""V14/T14-04 诊断：128 状态可拟合性失败到底来自「输入别名」还是「优化不足」。

为什么单独做这个诊断：
上一轮 tiny-fit 只报告了 top-1 = 96.09%，没有区分两种完全不同的原因。
- 若两个不同目标动作在策略打分的输入向量上完全相同（或差异在 float32 下不可分辨），
  那么任何模型都无法同时答对这两行 —— 这是**输入别名**，属于数据/特征缺陷，必须补特征；
- 若所有目标输入向量互不相同，那么 128 行、~19 万参数的记忆任务失败属于**优化/预算**问题，
  继续扩数据没有意义，应先修训练链路。
任务书要求「先证明再扩容」，因此本脚本给出可复核的判据，而不是继续猜。

判据（全部可机械复核）：
1. targetInputKey（空间张量 + 全局特征 + 目标候选的三坐标与 53 维语义，逐 float32 位比较）
   在 128 行之间的重复情况；
2. 同一状态内，目标候选与其他候选的输入是否重复（重复 ⇒ 该状态的答案不唯一）；
3. 训练前向（用同一 checkpoint）复现 top-1，并给出失败行的逐候选读数；
4. 招募候选的兵种 one-hot 槽位是否真的被写入（槽 32..52）。

用法：
    py v14/tools/diag_tiny_fit_alias.py --dataset <tiny_fit_dataset.jsonl> \
        --checkpoint <model.json> --out-dir <dir>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "python"))

ACTION_UNIT_CLASS_SLOT_START = 32
ACTION_UNIT_CLASS_DIM = 21


def load_rows(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _bits(values) -> bytes:
    """把 float 序列转成逐位可比较的字节串（float32，含 NaN 规范化）。"""
    out = bytearray()
    for value in values:
        number = float(value)
        if number != number:  # NaN
            out += struct.pack("<I", 0x7FC00000)
            continue
        out += struct.pack("<f", number)
    return bytes(out)


def candidate_input_key(row: Dict[str, Any], index: int) -> str:
    """候选的「策略打分输入」身份：空间张量 + 全局特征 + 该候选坐标与语义。"""
    digest = hashlib.sha256()
    digest.update(_bits(row["spatialTensor"]))
    digest.update(_bits(row["globalFeatures"]))
    entry = row["candidateActions"][index]
    digest.update(json.dumps([
        entry.get("actorCoord"), entry.get("landingCoord"), entry.get("targetCoord"),
    ], sort_keys=True).encode("utf-8"))
    digest.update(_bits(entry.get("semantics", [])))
    return digest.hexdigest()


def target_input_key(row: Dict[str, Any]) -> str:
    return candidate_input_key(row, int(row["targetActionIndex"]))


def check_one_hot(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """招募候选必须带 21 维兵种 one-hot，否则同类兵种在输入上不可区分。"""
    recruit_rows = 0
    recruit_candidates = 0
    recruit_missing_one_hot = 0
    multi_hot = 0
    examples: List[Dict[str, Any]] = []
    for row in rows:
        for index, entry in enumerate(row["candidateActions"]):
            code = row["candidateActionCodes"][index]
            if not code.startswith("recruit"):
                continue
            recruit_candidates += 1
            semantics = entry.get("semantics", [])
            slots = [i for i in range(ACTION_UNIT_CLASS_SLOT_START, ACTION_UNIT_CLASS_SLOT_START + ACTION_UNIT_CLASS_DIM)
                     if i < len(semantics) and abs(float(semantics[i])) > 1e-9]
            if len(slots) == 0:
                recruit_missing_one_hot += 1
                if len(examples) < 5:
                    examples.append({"sampleId": row["sampleId"], "code": code, "semanticsLen": len(semantics)})
            elif len(slots) > 1:
                multi_hot += 1
    for row in rows:
        if any(code.startswith("recruit") for code in row["candidateActionCodes"]):
            recruit_rows += 1
    return {
        "recruitRows": recruit_rows,
        "recruitCandidates": recruit_candidates,
        "recruitCandidatesMissingOneHot": recruit_missing_one_hot,
        "recruitCandidatesWithMultipleHot": multi_hot,
        "missingExamples": examples,
    }


def check_collisions(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """跨行同名输入 + 同行目标重复输入。"""
    by_key: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        key = target_input_key(row)
        by_key[key].append({
            "sampleId": row["sampleId"],
            "targetActionCode": row["targetActionCode"],
            "targetActionIndex": int(row["targetActionIndex"]),
            "sourceStateKey": row.get("sourceStateKey"),
        })

    cross_collisions = []
    for key, entries in by_key.items():
        targets = {entry["targetActionCode"] for entry in entries}
        if len(entries) > 1 and len(targets) > 1:
            cross_collisions.append({"inputKey": key[:16], "entries": entries})

    # 同一状态内：目标候选的输入是否与别的候选完全相同
    same_state_duplicates = []
    for row in rows:
        index = int(row["targetActionIndex"])
        target_key = candidate_input_key(row, index)
        duplicates = [
            {"index": i, "code": row["candidateActionCodes"][i]}
            for i in range(len(row["candidateActions"]))
            if i != index and candidate_input_key(row, i) == target_key
        ]
        if duplicates:
            same_state_duplicates.append({
                "sampleId": row["sampleId"],
                "targetActionCode": row["targetActionCode"],
                "duplicates": duplicates,
            })

    # 状态级身份：空间张量 + 全局特征是否重复（不同状态是否被压成同一输入）
    state_keys: Dict[str, List[str]] = defaultdict(list)
    for row in rows:
        digest = hashlib.sha256()
        digest.update(_bits(row["spatialTensor"]))
        digest.update(_bits(row["globalFeatures"]))
        state_keys[digest.hexdigest()].append(row["sampleId"])
    duplicate_states = {k[:16]: v for k, v in state_keys.items() if len(v) > 1}

    return {
        "rows": len(rows),
        "distinctTargetInputs": len(by_key),
        "crossRowInputCollisionsWithDifferentTargets": cross_collisions,
        "sameStateTargetDuplicateCandidates": same_state_duplicates,
        "duplicateStateEncodings": duplicate_states,
    }


def forward_check(rows: List[Dict[str, Any]], checkpoint: Path) -> Dict[str, Any]:
    """用给定 checkpoint 复现 top-1，并输出失败行的逐候选读数。"""
    import numpy as np
    import torch

    import train_spatial_resnet as trainer  # noqa: F401  (保持与训练器同一打分路径)
    from spatial_resnet_model import SpatialResNet, load_model_from_ts_json

    sem_dim = {len(c.get("semantics", [])) for row in rows for c in row["candidateActions"]}
    channels = {len(row["spatialTensor"]) // (20 * 20) for row in rows}
    global_dim = {len(row["globalFeatures"]) for row in rows}
    if len(sem_dim) != 1 or len(channels) != 1 or len(global_dim) != 1:
        raise SystemExit(f"维度不唯一：sem={sem_dim} channels={channels} global={global_dim}")
    action_semantic_dim = sem_dim.pop()
    spatial_channels = channels.pop()
    glob_dim = global_dim.pop()

    model = SpatialResNet(
        spatial_channels=spatial_channels, trunk_channels=32, global_dim=glob_dim,
        action_semantic_dim=action_semantic_dim, version="spatial-resnet-v2", num_blocks=2,
    )
    load_model_from_ts_json(model, str(checkpoint))
    model.eval()

    correct = 0
    failures = []
    with torch.no_grad():
        for row in rows:
            spatial = torch.tensor(row["spatialTensor"], dtype=torch.float32).reshape(1, spatial_channels, 20, 20)
            glob = torch.tensor(row["globalFeatures"], dtype=torch.float32).unsqueeze(0)
            z = model.forward_trunk(spatial)[0]
            candidates = row["candidateActions"]
            act = [c.get("actorCoord") for c in candidates]
            land = [c.get("landingCoord") for c in candidates]
            tgt = [c.get("targetCoord") for c in candidates]
            v_act = trainer.pool_coords_batch(z, act)
            v_land = trainer.pool_coords_batch(z, land)
            v_tgt = trainer.pool_coords_batch(z, tgt)
            sem = np.stack([
                list(c.get("semantics", []))[:action_semantic_dim]
                + [0.0] * max(0, action_semantic_dim - len(c.get("semantics", [])))
                for c in candidates
            ]).astype("float32")
            sem_t = torch.from_numpy(sem)
            glob_expanded = glob[0].unsqueeze(0).expand(len(candidates), -1)
            feats = torch.cat([v_act, v_land, v_tgt, sem_t, glob_expanded], dim=-1).unsqueeze(0)
            logits = model.forward_action_logits(feats)[0]
            order = torch.argsort(logits, descending=True).tolist()
            target = int(row["targetActionIndex"])
            if order[0] == target:
                correct += 1
            else:
                failures.append({
                    "sampleId": row["sampleId"],
                    "sourceStateKey": row.get("sourceStateKey"),
                    "targetActionCode": row["targetActionCode"],
                    "targetRank": order.index(target),
                    "candidateCount": len(candidates),
                    "topk": [
                        {
                            "index": i,
                            "code": row["candidateActionCodes"][i],
                            "logit": float(logits[i].item()),
                            "sameAsTarget": candidate_input_key(row, i) == candidate_input_key(row, target),
                        }
                        for i in order[:5]
                    ],
                    "targetLogit": float(logits[target].item()),
                })
    return {
        "checkpoint": str(checkpoint).replace("\\", "/"),
        "states": len(rows),
        "top1Correct": correct,
        "top1": correct / len(rows) if rows else None,
        "failures": failures,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V14/T14-04 tiny-fit 输入别名诊断")
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--checkpoint", default=None)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--forward-only", action="store_true",
                        help="只做前向重评（预算阶梯逐档调用时用），不重复写输入别名诊断")
    parser.add_argument("--collisions-only", action="store_true",
                        help="只做输入别名/重复检查（可对完整数据集运行，用于把「无别名」结论"
                             "从 128 状态推广到全部干净数据）")
    parser.add_argument("--report-name", default=None,
                        help="覆盖输出文件名（默认 tiny_fit_alias_diagnosis.json）")
    args = parser.parse_args()

    dataset = Path(args.dataset)
    rows = load_rows(dataset)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.forward_only:
        if not args.checkpoint:
            raise SystemExit("--forward-only 需要 --checkpoint")
        forward = forward_check(rows, Path(args.checkpoint))
        (out_dir / "tiny_fit_forward_eval.json").write_text(
            json.dumps({"schema": "v14_tiny_fit_forward_eval_1", "task": "T14-04", **forward},
                       indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
        )
        print(f"[T14-04] forward top-1={forward['top1']:.4f} "
              f"({forward['top1Correct']}/{forward['states']})")
        return 0

    if args.collisions_only:
        collisions = check_collisions(rows)
        report = {
            "schema": "v14_candidate_input_collision_scan_1",
            "task": "T14-04",
            "dataset": str(dataset).replace("\\", "/"),
            "rows": len(rows),
            "collisions": collisions,
            "oneHot": check_one_hot(rows),
        }
        name = args.report_name or "candidate_input_collision_scan.json"
        (out_dir / name).write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
        )
        print(f"[T14-04] 全量重复检查 rows={len(rows)} "
              f"distinctTargetInputs={collisions['distinctTargetInputs']}")
        print(f"[T14-04] 跨行输入别名={len(collisions['crossRowInputCollisionsWithDifferentTargets'])} "
              f"同状态目标重复={len(collisions['sameStateTargetDuplicateCandidates'])} "
              f"状态编码重复={len(collisions['duplicateStateEncodings'])}")
        return 0

    report: Dict[str, Any] = {
        "schema": "v14_tiny_fit_alias_diag_1",
        "task": "T14-04",
        "dataset": str(dataset).replace("\\", "/"),
        "rows": len(rows),
        "targetTypeCounts": dict(Counter(str(r["targetActionCode"]).split(":")[0] for r in rows)),
    }
    report["oneHot"] = check_one_hot(rows)
    report["collisions"] = check_collisions(rows)
    if args.checkpoint:
        report["forward"] = forward_check(rows, Path(args.checkpoint))

    out_path = out_dir / "tiny_fit_alias_diagnosis.json"
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    collisions = report["collisions"]
    print(f"[T14-04] rows={report['rows']} distinctTargetInputs={collisions['distinctTargetInputs']}")
    print(f"[T14-04] 跨行输入别名（不同目标）={len(collisions['crossRowInputCollisionsWithDifferentTargets'])}")
    print(f"[T14-04] 同状态目标候选输入重复={len(collisions['sameStateTargetDuplicateCandidates'])}")
    print(f"[T14-04] 状态编码重复={len(collisions['duplicateStateEncodings'])}")
    print(f"[T14-04] 招募候选缺 one-hot={report['oneHot']['recruitCandidatesMissingOneHot']}"
          f"/{report['oneHot']['recruitCandidates']}")
    if "forward" in report:
        print(f"[T14-04] forward top-1={report['forward']['top1']:.4f} "
              f"({report['forward']['top1Correct']}/{report['forward']['states']})")
    print(f"[T14-04] -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
