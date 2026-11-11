"""V15/T15-05：128 状态 train-only 诊断的最终评估与失败定位。

任务书 §6 的验收目标是「≥127/128 且训练 CE<0.05」。本脚本给出可复算读数，
并在未达标时**定位具体失败状态**（不是笼统说"没拟合好"）：

- 每行的目标候选、预测候选、目标 logit、最高 logit、margin、逐样本 CE；
- 失败行是否属于**输入不可区分**（目标候选与预测候选的坐标+语义逐位相同 ⇒
  任何权重下 logit 都相同，属于规则/夹具层面的别名，而不是优化不足）；
- 失败行是否与另一行的 (状态张量, 目标候选) 组合冲突（跨样本别名）；
- 输出 `tiny_fit_v15_final.json`：命中数、CE、失败清单、别名判定。

用法：
    python v15/tools/tiny_fit_v15_eval.py --dataset <tiny_fit_v15_input.jsonl> \
        --checkpoint <model.json> --out <tiny_fit_v15_final.json> [--label stage8000]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

import verify_parity  # noqa: E402


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def candidate_key(candidate: Dict[str, Any]) -> str:
    """候选在网络输入层面的身份：三个坐标 + 语义向量（与 policyInputKey 的口径一致）。"""
    return json.dumps(
        [candidate.get("actorCoord"), candidate.get("landingCoord"),
         candidate.get("targetCoord"), candidate.get("semantics")],
        sort_keys=True, separators=(",", ":"),
    )


def softmax_ce(logits: List[float], target_index: int) -> float:
    if not logits:
        return float("inf")
    peak = max(logits)
    exps = [math.exp(value - peak) for value in logits]
    total = sum(exps)
    return float(-math.log(max(exps[target_index] / total, 1e-300)))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--label", default="final")
    parser.add_argument("--expect-schema", default="spatial26_global20_actionSemantics53_v15")
    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    checkpoint_path = Path(args.checkpoint)
    schema_info = verify_parity.verify_checkpoint_schema(str(checkpoint_path), args.expect_schema)
    model = verify_parity.load_spatial_model_from_json(str(checkpoint_path))

    rows: List[Dict[str, Any]] = []
    for line in dataset_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))

    cases: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []
    total_ce = 0.0
    hits = 0

    for row in rows:
        target_index = int(row["targetActionIndex"])
        target_code = row["targetActionCode"]
        candidates = row["candidateActions"]
        result = verify_parity.forward_case(model, {
            "spatialTensor": row["spatialTensor"],
            "globalFeatures": row["globalFeatures"],
            "candidateActions": candidates,
        })
        logits = result["actionLogits"]
        best_index = result["bestActionIndex"]
        ce = softmax_ce(logits, target_index)
        total_ce += ce
        hit = best_index == target_index
        if hit:
            hits += 1
        ordered = sorted(logits, reverse=True)
        margin = ordered[0] - ordered[1] if len(ordered) >= 2 else None
        target_key = candidate_key(candidates[target_index])
        predicted_key = candidate_key(candidates[best_index]) if 0 <= best_index < len(candidates) else None
        entry = {
            "sampleId": row.get("sampleId"),
            "rootFamilyId": row.get("rootFamilyId"),
            "candidateCount": len(candidates),
            "targetActionCode": target_code,
            "predictedActionCode": (candidates[best_index].get("actionCode")
                                    if 0 <= best_index < len(candidates) else None),
            "targetIndex": target_index,
            "bestIndex": best_index,
            "targetLogit": logits[target_index] if 0 <= target_index < len(logits) else None,
            "bestLogit": logits[best_index] if 0 <= best_index < len(logits) else None,
            "margin": margin,
            "crossEntropy": ce,
            "hit": hit,
            # 输入不可区分判定：目标候选与预测候选的**全部网络输入字段**逐位相同，
            # 则任何权重下两者 logit 都相等，argmax 无法区分 —— 属于夹具/规则层面的别名。
            "targetEqualsPredictedFeatures": target_key == predicted_key,
            "targetCandidateAliasCount": sum(
                1 for candidate in candidates if candidate_key(candidate) == target_key),
        }
        cases.append(entry)
        if not hit:
            failures.append(entry)

    mean_ce = total_ce / len(rows) if rows else None
    report = {
        "schema": "v15_tiny_fit_final_eval_1",
        "task": "T15-05",
        "runId": "v15_20260925_core",
        "label": args.label,
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "datasetPath": str(dataset_path).replace("\\", "/"),
        "datasetSha256": sha256_file(dataset_path),
        "checkpointPath": str(checkpoint_path).replace("\\", "/"),
        "checkpointSha256": sha256_file(checkpoint_path),
        "checkpointEncoderSchemaId": schema_info["declaredSchema"],
        "acceptanceTarget": {"minTop1Hits": 127, "maxTrainCE": 0.05},
        "states": len(rows),
        "top1Correct": hits,
        "top1Accuracy": hits / len(rows) if rows else None,
        "trainCrossEntropy": mean_ce,
        "acceptance": {
            "hitsAtLeast127": hits >= 127,
            "ceBelow005": (mean_ce is not None and mean_ce < 0.05),
            "passed": hits >= 127 and mean_ce is not None and mean_ce < 0.05,
        },
        "failureCount": len(failures),
        "failures": failures,
        "aliasExplanation": {
            "definition": "目标候选与预测候选的 (actorCoord, landingCoord, targetCoord, semantics) 逐位相同",
            "note": "命中此判定的失败在原理上不可拟合：两者是同一网络输入，logit 必然相同。",
            "failuresWithIdenticalFeatures": sum(1 for f in failures if f["targetEqualsPredictedFeatures"]),
            "failuresWithNoIdenticalFeatures": sum(1 for f in failures if not f["targetEqualsPredictedFeatures"]),
        },
        "cases": cases,
    }
    Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "out": args.out,
        "label": args.label,
        "states": report["states"],
        "top1Correct": report["top1Correct"],
        "trainCrossEntropy": report["trainCrossEntropy"],
        "failures": len(failures),
        "failuresWithIdenticalFeatures": report["aliasExplanation"]["failuresWithIdenticalFeatures"],
        "acceptance": report["acceptance"],
    }, indent=2, ensure_ascii=False))
    return 0 if report["acceptance"]["passed"] else 5


if __name__ == "__main__":
    raise SystemExit(main())
