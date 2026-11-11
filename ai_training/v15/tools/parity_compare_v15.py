"""V15/T15-05：TS ↔ Python 前向/导出逐数值一致性比较（Python 侧，可 spawn）。

设计（为什么这样切）：
- 沙箱拒绝 Node 的 `child_process.spawn*`，所以 TS 侧只写原始读数
  （`v15/tools/parity_ts_forward_v15.ts`），比较与 Python 前向都在这里做。
- 「同一快照、同一允许集合」：
  * 快照 = `states/diag_states.jsonl` 里的完整 `state`；
  * 允许集合 = TS 侧用真实引擎算出的 `actions`（策略过滤 surrender 后的 Action 对象），
    原样传给 Python，保证两侧候选集完全一致。
- Python 侧**独立重编码**（`parity_python_encode_v15.py`），而不是复用 TS 的张量；
  因此三种东西被分别验证：
  1. 输入：TS 编码 vs Python 编码（float32 最大绝对差 ≤1e-6）；
  2. 前向：同一权重下逐码 logits、trunk Z、value（atol=rtol=1e-4）；
  3. 决策：最终 actionCode 必须一致。
- value 一并比较；但 value 未训练（valueWeight=0），**不据此宣称任何价值学习资格**。

用法：
    python v15/tools/parity_compare_v15.py \
        --states <diag_states.jsonl> --ts-raw <ts_forward_x.json> \
        --tables <terrain_tables_v15.json> --checkpoint <model.json> \
        --out <forward_parity.json> [--python-raw <python_forward_x.json>] [--tag synthetic]
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
sys.path.insert(0, str(REPO_ROOT / "v15" / "tools"))

import verify_parity  # noqa: E402
import parity_python_encode_v15 as pyenc  # noqa: E402

# 预登记容差（任务书 §6）：不随结果放宽。
INPUT_MAX_ABS_DIFF = 1e-6
FORWARD_ATOL = 1e-4
FORWARD_RTOL = 1e-4
NEAR_TIE_REPORT_THRESHOLD = 1e-3


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def max_abs_diff(a: List[float], b: List[float]) -> float:
    if len(a) != len(b):
        return float("inf")
    worst = 0.0
    for x, y in zip(a, b):
        diff = abs(x - y)
        if diff > worst:
            worst = diff
    return worst


def tolerance_ratio(a: List[float], b: List[float], atol: float, rtol: float) -> float:
    """|a-b| / (atol + rtol*|b|) 的最大值；>1 即越界。"""
    if len(a) != len(b):
        return float("inf")
    worst = 0.0
    for x, y in zip(a, b):
        allowed = atol + rtol * abs(y)
        ratio = abs(x - y) / allowed if allowed > 0 else float("inf") if x != y else 0.0
        if ratio > worst:
            worst = ratio
    return worst


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--states", required=True)
    parser.add_argument("--ts-raw", required=True)
    parser.add_argument("--tables", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--python-raw", default=None)
    parser.add_argument("--tag", default="synthetic")
    parser.add_argument("--expect-schema", default="spatial26_global20_actionSemantics53_v15")
    args = parser.parse_args()

    states_path = Path(args.states)
    ts_raw_path = Path(args.ts_raw)
    tables_path = Path(args.tables)
    checkpoint_path = Path(args.checkpoint)

    states = {}
    for line in states_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            record = json.loads(line)
            states[record["diagId"]] = record

    ts_raw = json.loads(ts_raw_path.read_text(encoding="utf-8"))
    tables = pyenc.load_tables(tables_path)

    schema_info = verify_parity.verify_checkpoint_schema(str(checkpoint_path), args.expect_schema)
    model = verify_parity.load_spatial_model_from_json(str(checkpoint_path))
    shape_hint = verify_parity.shape_schema_hint(model.spatial_channels, model.action_semantic_dim)

    per_case: List[Dict[str, Any]] = []
    python_readouts: List[Dict[str, Any]] = []

    worst_input_diff = 0.0
    worst_global_diff = 0.0
    worst_semantics_diff = 0.0
    worst_logit_diff = 0.0
    worst_logit_ratio = 0.0
    worst_z_diff = 0.0
    worst_z_ratio = 0.0
    worst_value_diff = 0.0
    action_mismatches = 0
    non_finite = 0
    case_errors: List[Dict[str, Any]] = []
    near_ties: List[Dict[str, Any]] = []
    threshold_checks: List[Dict[str, Any]] = []

    for readout in ts_raw["readouts"]:
        diag_id = readout["diagId"]
        record = states.get(diag_id)
        if record is None:
            case_errors.append({"diagId": diag_id, "error": "states 里找不到该 diagId"})
            continue

        state = record["state"]
        player_id = record["actingPlayerId"]
        actions = readout["actions"]

        # 1) Python 独立重编码（只用 state + 动作对象）。
        py_encoded = pyenc.encode_state_v15(state, player_id, actions, tables)
        py_spatial = py_encoded["spatialTensor"]
        py_global = py_encoded["globalFeatures"]
        py_candidates = py_encoded["candidates"]

        input_diff = max_abs_diff(readout["spatialTensor"], py_spatial)
        global_diff = max_abs_diff(readout["globalFeatures"], py_global)
        semantics_diff = 0.0
        coord_mismatch = 0
        for ts_candidate, py_candidate in zip(readout["candidates"], py_candidates):
            if (ts_candidate["actorCoord"] != py_candidate["actorCoord"]
                    or ts_candidate["landingCoord"] != py_candidate["landingCoord"]
                    or ts_candidate["targetCoord"] != py_candidate["targetCoord"]):
                coord_mismatch += 1
            semantics_diff = max(semantics_diff, max_abs_diff(ts_candidate["semantics"], py_candidate["semantics"]))

        # 2) Python 前向：走 verify_parity 的同一函数（单例/批次共用）。
        py_input = {
            "spatialTensor": py_spatial,
            "globalFeatures": py_global,
            "candidateActions": [
                {
                    "actionCode": ts_candidate["actionCode"],
                    "actorCoord": py_candidate["actorCoord"],
                    "landingCoord": py_candidate["landingCoord"],
                    "targetCoord": py_candidate["targetCoord"],
                    "semantics": py_candidate["semantics"],
                }
                for ts_candidate, py_candidate in zip(readout["candidates"], py_candidates)
            ],
        }
        py_result = verify_parity.forward_case(model, py_input)
        python_readouts.append({"caseId": diag_id, **py_result})

        ts_logits = readout["logits"]
        py_logits = py_result["actionLogits"]
        logit_diff = max_abs_diff(ts_logits, py_logits)
        logit_ratio = tolerance_ratio(ts_logits, py_logits, FORWARD_ATOL, FORWARD_RTOL)
        z_diff = max_abs_diff(readout["z"], py_result["spatialZ"])
        z_ratio = tolerance_ratio(readout["z"], py_result["spatialZ"], FORWARD_ATOL, FORWARD_RTOL)
        value_diff = (abs(readout["value"] - py_result["value"])
                      if readout["value"] is not None and py_result["value"] is not None else None)

        for values in (ts_logits, py_logits, readout["z"], py_result["spatialZ"]):
            for value in values:
                if not math.isfinite(value):
                    non_finite += 1

        ts_best = readout["bestActionIndex"]
        py_best = py_result["bestActionIndex"]
        ts_code = readout["bestActionCode"]
        py_code = readout["actionCodes"][py_best] if 0 <= py_best < len(readout["actionCodes"]) else None
        action_match = ts_code == py_code
        if not action_match:
            action_mismatches += 1

        # 3) 预登记判据：最高分差 > 2×该例最大 logit 数值差 ⇒ 最终动作必须相同。
        top_gap = None
        if len(ts_logits) >= 2:
            ordered = sorted(ts_logits, reverse=True)
            top_gap = ordered[0] - ordered[1]
            threshold_ok = (top_gap > 2.0 * logit_diff)
            threshold_checks.append({
                "diagId": diag_id,
                "topGap": top_gap,
                "maxLogitAbsDiff": logit_diff,
                "twoTimesDiff": 2.0 * logit_diff,
                "gapExceedsTwiceDiff": threshold_ok,
                "actionMatched": action_match,
                "ruleSatisfied": (not threshold_ok) or action_match,
            })
            if top_gap <= NEAR_TIE_REPORT_THRESHOLD:
                near_ties.append({
                    "diagId": diag_id,
                    "topGap": top_gap,
                    "candidateCount": len(ts_logits),
                    "tsBestActionCode": ts_code,
                    "pythonBestActionCode": py_code,
                    "actionMatched": action_match,
                    "maxLogitAbsDiff": logit_diff,
                })

        worst_input_diff = max(worst_input_diff, input_diff)
        worst_global_diff = max(worst_global_diff, global_diff)
        worst_semantics_diff = max(worst_semantics_diff, semantics_diff)
        worst_logit_diff = max(worst_logit_diff, logit_diff)
        worst_logit_ratio = max(worst_logit_ratio, logit_ratio)
        worst_z_diff = max(worst_z_diff, z_diff)
        worst_z_ratio = max(worst_z_ratio, z_ratio)
        if value_diff is not None:
            worst_value_diff = max(worst_value_diff, value_diff)

        if input_diff > INPUT_MAX_ABS_DIFF or coord_mismatch > 0 or logit_ratio > 1.0 or z_ratio > 1.0 or not action_match:
            case_errors.append({
                "diagId": diag_id,
                "inputMaxAbsDiff": input_diff,
                "coordMismatch": coord_mismatch,
                "logitToleranceRatio": logit_ratio,
                "zToleranceRatio": z_ratio,
                "actionMatched": action_match,
            })

        per_case.append({
            "diagId": diag_id,
            "buckets": record["buckets"],
            "candidateCount": len(ts_logits),
            "inputMaxAbsDiff": input_diff,
            "globalMaxAbsDiff": global_diff,
            "semanticsMaxAbsDiff": semantics_diff,
            "coordMismatchCount": coord_mismatch,
            "maxLogitAbsDiff": logit_diff,
            "logitToleranceRatio": logit_ratio,
            "maxTrunkZAbsDiff": z_diff,
            "trunkZToleranceRatio": z_ratio,
            "valueAbsDiff": value_diff,
            "tsValue": readout["value"],
            "pythonValue": py_result["value"],
            "tsBestActionIndex": ts_best,
            "pythonBestActionIndex": py_best,
            "tsBestActionCode": ts_code,
            "pythonBestActionCode": py_code,
            "actionMatched": action_match,
            "topGap": top_gap,
            "sharedPolicyRejected": bool(readout["sharedPolicy"].get("rejected")),
            "sharedPolicyTypedEmptySet": readout["sharedPolicy"].get("typedEmptyActionSet"),
            "spatialTensorSha256Ts": readout["spatialTensorSha256"],
            "spatialTensorSha256Python": hashlib.sha256(canonical_json(py_spatial).encode("utf-8")).hexdigest(),
        })

    threshold_violations = [entry for entry in threshold_checks if not entry["ruleSatisfied"]]

    summary = {
        "casesCompared": len(per_case),
        "caseErrors": case_errors,
        "nonFiniteReadouts": non_finite,
        "maxInputFloat32AbsDiff": worst_input_diff,
        "maxGlobalFloat32AbsDiff": worst_global_diff,
        "maxCandidateSemanticsAbsDiff": worst_semantics_diff,
        "maxLogitAbsDiff": worst_logit_diff,
        "maxLogitToleranceRatio": worst_logit_ratio,
        "maxTrunkZAbsDiff": worst_z_diff,
        "maxTrunkZToleranceRatio": worst_z_ratio,
        "maxValueAbsDiff": worst_value_diff,
        "valueNote": "valueWeight=0，value 未训练；本项只证明两侧数值一致，不构成任何价值学习资格。",
        "actionMismatches": action_mismatches,
        "nearTieCases": near_ties,
        "nearTieCount": len(near_ties),
        "topGapRuleViolations": len(threshold_violations),
        "topGapRule": "最高分差 > 2×该例最大 logit 数值差 ⇒ 最终动作必须相同（预登记）",
        "passed": (
            len(case_errors) == 0
            and non_finite == 0
            and action_mismatches == 0
            and worst_input_diff <= INPUT_MAX_ABS_DIFF
            and worst_logit_ratio <= 1.0
            and worst_z_ratio <= 1.0
            and len(threshold_violations) == 0
        ),
    }

    report = {
        "schema": "v15_ts_python_forward_parity_1",
        "task": "T15-05",
        "runId": "v15_20260925_core",
        "tag": args.tag,
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "scope": "同一快照、同一允许集合：TS 编码 + TS 前向 vs Python 独立重编码 + Python 验证路径前向。",
        "tolerances": {
            "inputFloat32MaxAbsDiff": INPUT_MAX_ABS_DIFF,
            "forwardAtol": FORWARD_ATOL,
            "forwardRtol": FORWARD_RTOL,
            "gradientAtol": 1e-5,
            "gradientRtol": 1e-5,
            "note": "任务书 §6 预登记容差；未随结果放宽。",
        },
        "inputs": {
            "statesPath": str(states_path).replace("\\", "/"),
            "statesSha256": sha256_file(states_path),
            "tsRawPath": str(ts_raw_path).replace("\\", "/"),
            "tsRawSha256": sha256_file(ts_raw_path),
            "terrainTablesPath": str(tables_path).replace("\\", "/"),
            "terrainTablesSha256": sha256_file(tables_path),
            "checkpointPath": str(checkpoint_path).replace("\\", "/"),
            "checkpointSha256": sha256_file(checkpoint_path),
            "checkpointEncoderSchemaId": schema_info["declaredSchema"],
            "shapeSchemaHint": shape_hint,
            "expectedSchema": args.expect_schema,
            "tsSide": {
                "predictorSchemaId": ts_raw.get("predictorSchemaId"),
                "semanticsVariant": ts_raw.get("predictorSemanticsVariant"),
                "spatialChannels": ts_raw.get("predictorSpatialChannels"),
                "semanticDim": ts_raw.get("predictorSemanticDim"),
                "summary": ts_raw.get("summary"),
            },
        },
        "summary": summary,
        "topGapChecks": threshold_checks,
        "cases": per_case,
    }

    out_path = Path(args.out)
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    python_raw = {
        "schema": "v15_python_forward_raw_1",
        "task": "T15-05",
        "side": "python",
        "checkpointPath": str(checkpoint_path).replace("\\", "/"),
        "checkpointEncoderSchemaId": schema_info["declaredSchema"],
        "spatialChannels": int(model.spatial_channels),
        "semanticDim": int(model.action_semantic_dim),
        "cases": len(python_readouts),
        "readouts": python_readouts,
    }
    if args.python_raw:
        Path(args.python_raw).write_text(json.dumps(python_raw), encoding="utf-8")

    print(json.dumps({
        "out": str(out_path),
        "tag": args.tag,
        "casesCompared": summary["casesCompared"],
        "maxInputFloat32AbsDiff": summary["maxInputFloat32AbsDiff"],
        "maxLogitAbsDiff": summary["maxLogitAbsDiff"],
        "maxLogitToleranceRatio": summary["maxLogitToleranceRatio"],
        "maxTrunkZAbsDiff": summary["maxTrunkZAbsDiff"],
        "maxTrunkZToleranceRatio": summary["maxTrunkZToleranceRatio"],
        "maxValueAbsDiff": summary["maxValueAbsDiff"],
        "actionMismatches": summary["actionMismatches"],
        "nearTieCount": summary["nearTieCount"],
        "topGapRuleViolations": summary["topGapRuleViolations"],
        "caseErrors": len(case_errors),
        "passed": summary["passed"],
    }, indent=2, ensure_ascii=False))
    return 0 if summary["passed"] else 4


if __name__ == "__main__":
    raise SystemExit(main())
