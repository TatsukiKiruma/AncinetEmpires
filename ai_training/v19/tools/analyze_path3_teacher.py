#!/usr/bin/env python3
"""比较 V19 θ1 与 Path-3 pilot 中 L1 原始分数导出的固定软目标。"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

# 导入 torch 前限制底层线程池，避免诊断挤占正在运行的正式评测。
for _name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[_name] = "2"

import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
from spatial_resnet_model import SpatialResNet, load_model_from_ts_json  # noqa: E402


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def coord(value: Any) -> tuple[int, int] | None:
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {"x", "y"}:
        raise ValueError(f"非法候选坐标：{value!r}")
    return int(value["x"]), int(value["y"])


def quantile(values: list[float], probability: float) -> float:
    ordered = sorted(values)
    if not ordered:
        raise ValueError("空分组不能计算分位数")
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def aggregate(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    items = list(rows)
    ranks = [float(item["theta1SelectedTeacherRank"]) for item in items]
    return {
        "count": len(items),
        "teacherTop1Theta1ArgmaxAgreementRate": sum(item["teacherTop1Agreement"] for item in items) / len(items),
        "teacherTopScoreSetTheta1ArgmaxAgreementRate": sum(item["teacherTopScoreSetAgreement"] for item in items) / len(items),
        "theta1SelectedTeacherRankMean": statistics.fmean(ranks),
        "theta1SelectedTeacherRankMedian": statistics.median(ranks),
        "theta1SelectedTeacherRankP90": quantile(ranks, 0.9),
        "teacherTargetEntropyMean": statistics.fmean(item["teacherTargetEntropy"] for item in items),
        "crossEntropyMean": statistics.fmean(item["crossEntropy"] for item in items),
        "klQToTheta1Mean": statistics.fmean(item["klQToTheta1"] for item in items),
        "theta1Top1ProbabilityMean": statistics.fmean(item["theta1Top1Probability"] for item in items),
    }


def grouped(rows: list[dict[str, Any]], fields: tuple[str, ...]) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups["|".join(str(row[field]) for field in fields)].append(row)
    return {key: aggregate(groups[key]) for key in sorted(groups)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        type=Path,
        default=ROOT / "v19/out/continuous16_20261003/path3_pilot/path3_pilot.jsonl",
    )
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=ROOT / "v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "v19/out/continuous16_20261003/path3_teacher_diagnostic.json",
    )
    args = parser.parse_args()

    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.manual_seed(0)
    checkpoint = json.loads(args.checkpoint.read_text(encoding="utf-8"))
    if checkpoint.get("spatialChannels") != 34 or checkpoint["polDense1"]["inDim"] != 169:
        raise ValueError("θ1 必须是 spatial34/global20/actionSemantics53 且不含 GAP 的策略头")
    model = SpatialResNet(
        spatial_channels=34,
        trunk_channels=32,
        global_dim=20,
        action_semantic_dim=53,
        version=checkpoint["version"],
        num_blocks=int(checkpoint["numBlocks"]),
        global_policy_pool=bool(checkpoint.get("globalPolicyPool", False)),
    )
    load_model_from_ts_json(model, str(args.checkpoint))
    model.eval()

    source_rows = [json.loads(line) for line in args.input.read_text(encoding="utf-8").splitlines() if line.strip()]
    results: list[dict[str, Any]] = []
    with torch.inference_mode():
        for source in source_rows:
            candidates = source["candidateActions"]
            codes = source["orderedActionCodes"]
            teacher = source["teacher"]
            candidate_codes = [item["actionCode"] for item in candidates]
            if len(codes) != len(set(codes)) or candidate_codes != codes or teacher["actionCodes"] != codes:
                raise ValueError(f"{source['sampleId']} 的 actionCode 顺序或唯一性不一致")
            target_index = int(teacher["targetActionIndex"])
            if not 0 <= target_index < len(codes) or codes[target_index] != teacher["targetActionCode"]:
                raise ValueError(f"{source['sampleId']} 的 teacher targetActionIndex 与 actionCode 不一致")
            raw_scores = [float(value) for value in teacher["rawScores"]]
            candidate_scores = [float(item["teacherScore"]) for item in candidates]
            if len(raw_scores) != len(codes) or raw_scores != candidate_scores:
                raise ValueError(f"{source['sampleId']} 的 teacher rawScores 未与候选逐索引严格对齐")
            if any(not math.isfinite(value) for value in raw_scores):
                raise ValueError(f"{source['sampleId']} 含非有限 teacher score")

            spatial = torch.tensor(source["spatialTensor"], dtype=torch.float32).view(1, 34, 20, 20)
            globals_tensor = torch.tensor(source["globalFeatures"], dtype=torch.float32)
            if globals_tensor.numel() != 20:
                raise ValueError(f"{source['sampleId']} 的 globalFeatures 不是 20 维")
            z = model.forward_trunk(spatial)[0]
            feature_rows = []
            for candidate in candidates:
                semantics = candidate["semantics"]
                if len(semantics) != 56:
                    raise ValueError(f"{source['sampleId']} 的候选语义不是 56 维")
                parts = []
                for field in ("actorCoord", "landingCoord", "targetCoord"):
                    point = coord(candidate[field])
                    if point is None:
                        parts.append(torch.zeros(32, dtype=z.dtype))
                    else:
                        x, y = point
                        if not (0 <= x < 20 and 0 <= y < 20):
                            raise ValueError(f"{source['sampleId']} 含越界坐标 {point}")
                        parts.append(z[:, y, x])
                # θ1 只解释旧 schema 的前 53 维，新追加的三个路径事实不得进入本次前向。
                semantic53 = torch.tensor(semantics[:53], dtype=torch.float32)
                feature_rows.append(torch.cat((parts[0], parts[1], parts[2], semantic53, globals_tensor)))
            logits = model.forward_action_logits(torch.stack(feature_rows))
            log_p = torch.log_softmax(logits, dim=0)
            p = log_p.exp()
            theta_index = int(torch.argmax(logits).item())

            ranks = [sum(other > score for other in raw_scores) for score in raw_scores]
            rank_tensor = torch.tensor(ranks, dtype=torch.float64)
            q = torch.softmax(-rank_tensor / 2.0, dim=0)
            log_q = torch.log(q)
            log_p64 = log_p.to(torch.float64)
            entropy = float(-(q * log_q).sum().item())
            cross_entropy = float(-(q * log_p64).sum().item())
            kl = float((q * (log_q - log_p64)).sum().item())
            max_score = max(raw_scores)
            results.append({
                "sampleId": source["sampleId"],
                "split": source["split"],
                "mapIndex": int(source["mapIndex"]),
                "mapName": source["mapName"],
                "sourcePolicy": source["sourcePolicy"],
                "phaseBucket": source["phaseBucket"],
                "candidateCount": len(codes),
                "teacherTop1ActionCode": teacher["targetActionCode"],
                "theta1ArgmaxActionCode": codes[theta_index],
                "teacherTop1Agreement": theta_index == target_index,
                "teacherTopScoreSetAgreement": raw_scores[theta_index] == max_score,
                "theta1SelectedTeacherRank": ranks[theta_index],
                "teacherTargetEntropy": entropy,
                "crossEntropy": cross_entropy,
                "klQToTheta1": kl,
                "theta1Top1Probability": float(p[theta_index].item()),
            })

    overall = aggregate(results)
    report = {
        "schema": "v19_path3_teacher_diagnostic_1",
        "purpose": "只读比较 θ1 logits 与 L1 原始分数导出的固定 soft-rank 目标；不训练。",
        "input": {"path": args.input.relative_to(ROOT).as_posix(), "sha256": sha256(args.input), "rows": len(results)},
        "model": {
            "name": "theta1",
            "path": args.checkpoint.relative_to(ROOT).as_posix(),
            "sha256": sha256(args.checkpoint),
            "encoderSchemaId": checkpoint["encoderSchemaId"],
            "semanticInput": "candidateActions[*].semantics[:53]",
        },
        "runtime": {"python": sys.version.split()[0], "torch": torch.__version__, "device": "cpu", "intraopThreads": 2, "interopThreads": 1},
        "targetRule": {"formula": "q_i ∝ exp(-r_i/2)", "rank": "r_i = count(score_j > score_i)，同分同 rank", "temperatureSweep": False},
        "alignmentValidation": {
            "orderedActionCodesEqualsCandidateActionCodes": True,
            "orderedActionCodesEqualsTeacherActionCodes": True,
            "targetIndexResolvesTargetActionCode": True,
            "teacherRawScoresEqualsCandidateTeacherScores": True,
            "validatedRows": len(results),
        },
        "metrics": {
            "overall": overall,
            "bySplit": grouped(results, ("split",)),
            "byMap": grouped(results, ("mapIndex", "mapName")),
            "bySource": grouped(results, ("sourcePolicy",)),
            "byPhase": grouped(results, ("phaseBucket",)),
            "bySplitMapSourcePhase": grouped(results, ("split", "mapIndex", "sourcePolicy", "phaseBucket")),
        },
        "metricDefinitions": {
            "teacherTop1Theta1ArgmaxAgreementRate": "θ1 argmax 索引是否等于 teacher.targetActionIndex（其 actionCode 已严格校验）",
            "teacherTopScoreSetTheta1ArgmaxAgreementRate": "θ1 argmax 是否落在最高原始 score 的同分集合",
            "crossEntropy": "-Σ q log p_theta1",
            "klQToTheta1": "Σ q(log q-log p_theta1)；恒等于 crossEntropy-teacherTargetEntropy",
        },
        "rows": results,
    }
    gap = overall["klQToTheta1Mean"] / 0.02
    report["klBudgetAssessment"] = {
        "referenceBudget": 0.02,
        "meanTeacherToTheta1KLRatioToBudget": gap,
        "assessment": (
            "0.02 相对当前 teacher→θ1 分布差距很紧，单轮会强约束旧动作保持；但二者 KL 方向与训练期间参考 KL 不同，不能据此直接换算正式阈值。"
            if gap >= 5
            else "仅凭当前 teacher→θ1 分布差距，尚不能判定 0.02 明显过紧；仍需以训练期间参考 KL 实测。"
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "overall": overall, "bySplit": report["metrics"]["bySplit"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
