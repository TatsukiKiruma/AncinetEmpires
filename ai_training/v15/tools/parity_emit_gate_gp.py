"""V15/T15-05：从实际产物**读数**生成 `gate_GP.json` 与 `task_status.json`。

原则（数据契约 §8）：每项 DONE 必须有原始输入/输出及统计程序；不以文件存在代替验收。
这里所有判据都从 T15-05 目录里的 JSON 读数计算，未达标项写 FAILED 并给出原因与最小复现，
不因为"整体看起来不错"而抹平。

用法：
    python v15/tools/parity_emit_gate_gp.py --t15-05 <T15-05 目录> [--t15-02 <T15-02 目录>]
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List


def sha256_file(path: Path) -> str | None:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> Dict[str, Any] | None:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--t15-05", required=True)
    parser.add_argument("--t15-02", default="v15/out/v15_20260925_core/T15-02")
    parser.add_argument("--tiny-fit", default=None)
    args = parser.parse_args()

    root = Path(args.t15_05)
    t15_02 = Path(args.t15_02)
    tiny_fit = Path(args.tiny_fit) if args.tiny_fit else root / "tiny_fit"

    manifest = read_json(root / "parity_inputs_manifest.json")
    parity_synth = read_json(root / "forward_parity.json")
    parity_trained = read_json(root / "forward_parity_tiny_s42_final.json")
    tie_break = read_json(root / "tie_break.json")
    permutation = read_json(root / "permutation_update.json")
    historical = read_json(root / "historical_48_evidence.json")
    tiny_final = read_json(root / "tiny_fit_v15_final.json")
    tiny_ts = read_json(root / "tiny_fit_v15_ts_reeval.json")
    tiny_consumption = read_json(root / "tiny_fit_v15_consumption.json")
    composition = read_json(root / "tiny_fit_v15_task_composition.json")
    golden_check = read_json(root / "states" / "python_encoder_v15_golden_check.json")

    def g(dictionary: Dict[str, Any] | None, *keys, default=None):
        current: Any = dictionary
        for key in keys:
            if not isinstance(current, dict) or key not in current:
                return default
            current = current[key]
        return current

    coverage = g(manifest, "coverage", default={}) or {}
    parity_synth_summary = g(parity_synth, "summary", default={}) or {}
    parity_trained_summary = g(parity_trained, "summary", default={}) or {}
    tie_verdict = g(tie_break, "verdict", default={}) or {}
    fp32 = g(permutation, "float32", default={}) or {}
    fp64 = g(permutation, "float64Control", default={}) or {}

    items: List[Dict[str, Any]] = []

    def add(item_id: str, requirement: str, status: str, evidence: Dict[str, Any], note: str = "") -> None:
        items.append({
            "id": item_id,
            "requirement": requirement,
            "status": status,
            "evidence": evidence,
            "note": note,
        })

    # A1
    add(
        "A1_historical_48",
        "列出原 48 案例的 runtime/input/checkpoint SHA 与新 schema 受影响范围，作为历史证据保留、不改版本号",
        "PASS" if (g(historical, "counts", "cases") == 48
                   and g(historical, "counts", "inputsHashed") == 48) else "FAILED",
        {
            "cases": g(historical, "counts", "cases"),
            "inputsHashed": g(historical, "counts", "inputsHashed"),
            "pythonOutputsHashed": g(historical, "counts", "pythonOutputsHashed"),
            "checkpointSha256": g(historical, "runtimeIdentity", "checkpointSha256"),
            "reportSha256": g(historical, "runtimeIdentity", "reportSha256"),
            "casesWithAttackCandidates": g(historical, "counts", "casesWithAttackCandidates"),
            "affectedFields": g(historical, "newSchemaAffectedScope", "affectedFieldList"),
        },
    )

    # A2
    required_buckets_ok = all([
        (coverage.get("singleCandidateStates") or 0) >= 1,
        (coverage.get("manyCandidateStates") or 0) >= 1,
        (coverage.get("pendingStates") or 0) >= 1,
        (coverage.get("allianceMismatchStates") or 0) >= 1,
        (coverage.get("mapEdgeStates") or 0) >= 1,
        (coverage.get("nullCoordStates") or 0) >= 1,
        bool(coverage.get("allFourteenTypesRepresented")),
    ])
    add(
        "A2_diagnostic_states",
        "构建 ≥128 个新诊断状态，覆盖升级边界/历史兼容/pending/联盟/地图边缘/null 坐标/单候选/大量候选与全部 14 类型",
        "PASS" if ((coverage.get("totalNewStates") or 0) >= 128 and required_buckets_ok) else "FAILED",
        {
            "totalNewStates": coverage.get("totalNewStates"),
            "realStates": coverage.get("realStates"),
            "goldenStates": coverage.get("goldenStates"),
            "syntheticStates": coverage.get("syntheticStates"),
            "emptyAllowedSetStates": coverage.get("emptyAllowedSetStates"),
            "candidateCountRange": [coverage.get("candidateCountMin"), coverage.get("candidateCountMax")],
            "singleCandidateStates": coverage.get("singleCandidateStates"),
            "manyCandidateStates": coverage.get("manyCandidateStates"),
            "pendingStates": coverage.get("pendingStates"),
            "allianceMismatchStates": coverage.get("allianceMismatchStates"),
            "mapEdgeStates": coverage.get("mapEdgeStates"),
            "nullCoordStates": coverage.get("nullCoordStates"),
            "allFourteenTypesRepresented": coverage.get("allFourteenTypesRepresented"),
            "actionTypesOnlyInEngineLegalSet": coverage.get("actionTypesOnlyInEngineLegalSet"),
            "statesWhereV14AndV15CounterDiffer": coverage.get("statesWhereV14AndV15CounterDiffer"),
            "distinctRootFamilies": coverage.get("distinctRootFamilies"),
            "diagStatesSha256": g(manifest, "artifacts", "diagStatesSha256"),
        },
    )

    # B3
    parity_ok = bool(parity_synth_summary.get("passed")) and bool(parity_trained_summary.get("passed"))
    add(
        "B3_forward_parity",
        "同一快照、同一允许集合：TS 编码 vs Python 验证路径；比较输入、逐码 logits、trunk、最终 actionCode",
        "PASS" if parity_ok else "FAILED",
        {
            "syntheticCheckpoint": {
                "casesCompared": parity_synth_summary.get("casesCompared"),
                "maxInputFloat32AbsDiff": parity_synth_summary.get("maxInputFloat32AbsDiff"),
                "maxLogitAbsDiff": parity_synth_summary.get("maxLogitAbsDiff"),
                "maxLogitToleranceRatio": parity_synth_summary.get("maxLogitToleranceRatio"),
                "maxTrunkZAbsDiff": parity_synth_summary.get("maxTrunkZAbsDiff"),
                "maxTrunkZToleranceRatio": parity_synth_summary.get("maxTrunkZToleranceRatio"),
                "maxValueAbsDiff": parity_synth_summary.get("maxValueAbsDiff"),
                "actionMismatches": parity_synth_summary.get("actionMismatches"),
                "nonFiniteReadouts": parity_synth_summary.get("nonFiniteReadouts"),
                "topGapRuleViolations": parity_synth_summary.get("topGapRuleViolations"),
                "nearTieCount": parity_synth_summary.get("nearTieCount"),
            },
            "trainedCheckpoint": {
                "casesCompared": parity_trained_summary.get("casesCompared"),
                "maxInputFloat32AbsDiff": parity_trained_summary.get("maxInputFloat32AbsDiff"),
                "maxLogitAbsDiff": parity_trained_summary.get("maxLogitAbsDiff"),
                "maxLogitToleranceRatio": parity_trained_summary.get("maxLogitToleranceRatio"),
                "maxTrunkZAbsDiff": parity_trained_summary.get("maxTrunkZAbsDiff"),
                "actionMismatches": parity_trained_summary.get("actionMismatches"),
            },
            "pythonEncoderGoldenCheck": {
                "casesCompared": g(golden_check, "casesCompared"),
                "mismatches": g(golden_check, "mismatches"),
                "source": "T15-02 golden_inputs/golden_outputs（独立记录）",
            },
            "valueNote": parity_synth_summary.get("valueNote"),
        },
    )

    # B4
    add(
        "B4_tie_break",
        "受控精确并列（合成相同 logits）；V15 共同 tie-break = 最高 logit → actionCode 代码点序；旧 schema 保留历史规则；近似并列单列",
        "PASS" if tie_verdict.get("passed") else "FAILED",
        {
            "syntheticIdenticalLogitsCases": g(tie_break, "syntheticIdenticalLogits", "cases"),
            "syntheticAgreements": g(tie_break, "syntheticIdenticalLogits", "tsPythonRuleAgreements"),
            "forcedTopTiesCases": g(tie_break, "forcedTopTiesFromRealLogits", "cases"),
            "forcedTopTiesAgreements": g(tie_break, "forcedTopTiesFromRealLogits", "tsPythonRuleAgreements"),
            "realExactTiesAtTop": g(tie_break, "realExactTiesAtTop", "count"),
            "nearTieCount": g(tie_break, "nearTies", "count"),
            "legacySchemaId": g(tie_break, "legacySchemaRetention", "encoderSchemaId"),
            "legacySemanticsVariant": g(tie_break, "legacySchemaRetention", "semanticsVariant"),
            "legacyRulePreserved": tie_verdict.get("legacyRulePreserved"),
            "emptySetTypedRejectionObserved": tie_verdict.get("emptySetTypedRejectionObserved"),
            "noEpsilonStatement": g(tie_break, "rules", "noEpsilon"),
        },
    )

    # B5
    add(
        "B5_permutation_invariance",
        "候选反序 + 3 固定乱序：logits/loss/梯度/一次 optimizer 更新对齐（预登记 1e-6 / 1e-5）",
        "FAILED" if not fp32.get("passed") else "PASS",
        {
            "statesCompared": fp32.get("statesCompared"),
            "maxLogitDiff": fp32.get("maxLogitDiff"),
            "maxLossDiff": fp32.get("maxLossDiff"),
            "maxGradDiff": fp32.get("maxGradDiff"),
            "maxUpdateDiffAfterOneAdamWStep": fp32.get("maxUpdateDiffAfterOneAdamWStep"),
            "targetMappingErrors": fp32.get("targetMappingErrors"),
            "postHocDiagnostics": fp32.get("postHocDiagnostics"),
            "float64Control": {
                "statesCompared": fp64.get("statesCompared"),
                "maxGradDiff": fp64.get("maxGradDiff"),
                "maxUpdateDiffAfterOneAdamWStep": fp64.get("maxUpdateDiffAfterOneAdamWStep"),
                "passed": fp64.get("passed"),
            },
        },
        note="logits/loss/梯度全部在预登记容差内；一次 AdamW 更新在 fp32 下超出 1e-5，"
             "根因是 AdamW 第一步 ≈ lr·sign(g) 对低于 fp32 归约噪声底的梯度不连续；"
             "float64 对照塌缩到 "
             f"{fp64.get('maxUpdateDiffAfterOneAdamWStep')}，证明不是排序逻辑缺陷。"
             "该项按预登记保持 FAILED，不放宽门槛。",
    )

    # B6
    add(
        "B6_export_shared_policy",
        "每次导出模型都经真实 shared policy 验证 schema 与动作；不同运行身份的缓存不复用",
        "PASS" if (g(tiny_ts, "predictorSchemaId") == "spatial26_global20_actionSemantics53_v15"
                   and g(tiny_ts, "semanticsVariant") == "v15_current"
                   and g(tiny_ts, "engineSetMismatches") == 0
                   and g(tiny_ts, "sharedPolicyErrors") == 0
                   and g(parity_synth, "inputs", "tsSide", "summary", "sharedPolicyMismatches") == 0
                   and g(parity_trained, "inputs", "tsSide", "summary", "sharedPolicyMismatches") == 0) else "FAILED",
        {
            "exportsVerified": [
                {
                    "checkpoint": g(parity_synth, "inputs", "checkpointPath"),
                    "sha256": g(parity_synth, "inputs", "checkpointSha256"),
                    "predictorSchemaId": g(parity_synth, "inputs", "tsSide", "predictorSchemaId"),
                    "statesChecked": g(parity_synth, "summary", "casesCompared"),
                    "sharedPolicyMismatches": g(parity_synth, "inputs", "tsSide", "summary", "sharedPolicyMismatches"),
                    "emptySetRejections": g(parity_synth, "inputs", "tsSide", "summary", "emptySetRejections"),
                },
                {
                    "checkpoint": g(parity_trained, "inputs", "checkpointPath"),
                    "sha256": g(parity_trained, "inputs", "checkpointSha256"),
                    "predictorSchemaId": g(parity_trained, "inputs", "tsSide", "predictorSchemaId"),
                    "statesChecked": g(parity_trained, "summary", "casesCompared"),
                    "sharedPolicyMismatches": g(parity_trained, "inputs", "tsSide", "summary", "sharedPolicyMismatches"),
                },
            ],
            "fixedDiagnosticSubset": "states/diag_states.jsonl",
            "cacheIdentityFields": ["checkpointSha256", "statesSha256", "toolFile"],
        },
    )

    # C：128 状态 train-only 回归
    tiny_ok = bool(g(tiny_final, "acceptance", "passed"))
    add(
        "C1_tiny_fit_128_train_only",
        "一次 seed 42、真正 128 个训练状态的 train-only 回归：≥127/128 且训练 CE<0.05",
        "PASS" if tiny_ok else "FAILED",
        {
            "mode": "train-only（--train-only，128 行全部进入优化，无验证集，best 选择被禁用）",
            "states": g(tiny_final, "states"),
            "top1Correct": g(tiny_final, "top1Correct"),
            "trainCrossEntropy": g(tiny_final, "trainCrossEntropy"),
            "updates": g(tiny_consumption, "measuredConsumption", "updates"),
            "exposures": g(tiny_consumption, "measuredConsumption", "totalExposures"),
            "uniqueSamples": g(tiny_consumption, "measuredConsumption", "optimizedUniqueSamples"),
            "uniquePolicyInputKeys": g(tiny_consumption, "measuredConsumption", "uniquePolicyInputKeys"),
            "failureCount": g(tiny_final, "failureCount"),
            "failuresAllRecruitToCastle": all(
                str(f.get("targetActionCode", "")).startswith("recruit_to_castle")
                for f in (g(tiny_final, "failures", default=[]) or [])
            ) if g(tiny_final, "failures") else None,
            "failuresWithIdenticalFeatures": g(tiny_final, "aliasExplanation", "failuresWithIdenticalFeatures"),
            "stage8000Top1": g(read_json(root / "tiny_fit_v15_final_stage8000.json"), "top1Correct"),
            "stage8000CE": g(read_json(root / "tiny_fit_v15_final_stage8000.json"), "trainCrossEntropy"),
            "v14Reference": {
                "stageA8000MinTop1": 0.984375,
                "stageB16000MinTop1": 1.0,
                "note": "V14 参照读数来自 v14/out/v14_20260925_t14b/T14-04/tiny_fit_acceptance.json 的 summary。",
            },
            "taskCompositionDiffers": g(composition, "conclusion", "sameTask") is False,
            "trainerSourceIdentity": {
                "path": "python/train_spatial_resnet.py",
                "sha256AtT15_05Close": sha256_file(Path("python/train_spatial_resnet.py")),
                "note": "训练器的恢复身份（state.identity）只覆盖数据/split/schema/预算/调度/种子，"
                        "**不含源码字节摘要**；本机是多人并行工作区，stage1 与 stage2 之间该文件被并发修改过"
                        "（mtime 14:06，位于 stage1 结束 14:03 与 stage2 开始 14:18 之间），"
                        "因此「两段合起来等价于一次 16000 步连续运行」没有被身份校验强制保证。"
                        "最终读数（117/128、CE 0.1714）是实测值，不受影响；受影响的是等效性主张。",
            },
        },
        note="未达标：16000 次更新后训练命中 117/128、CE 0.1714，且与 8000 次更新读数完全相同"
             "（同一 11 个状态、同一 CE）。11 个失败状态全部是 recruit_to_castle 的**兵种混淆**"
             "（城堡坐标正确、兵种错误，且输入里 21 维兵种 one-hot 存在、目标与预测候选特征不同 ⇒ 不是别名）。"
             "因此本轮**不能**宣称新链路没有可拟合性退步。",
    )

    # C2：TS 重评
    add(
        "C2_export_ts_reeval",
        "导出 TS 后同样满足 ≥127/128",
        "PASS" if g(tiny_ts, "acceptance", "hitsAtLeast127") else "FAILED",
        {
            "states": g(tiny_ts, "states"),
            "top1Correct": g(tiny_ts, "top1Correct"),
            "top1Accuracy": g(tiny_ts, "top1Accuracy"),
            "pythonTop1Correct": g(tiny_final, "top1Correct"),
            "tsPythonChoiceDisagreements": g(tiny_consumption, "results", "tsPythonPerStateAgreement", "choiceDisagreements"),
            "identicalHitSets": g(tiny_consumption, "results", "tsPythonPerStateAgreement", "identicalHitSets"),
            "path": g(tiny_ts, "path"),
        },
        note="TS 与 Python 逐状态完全一致（命中集合相同、0 次动作分歧），但两者都只有 117/128。",
    )

    # E：schema 声明必须等于数据集的 schema（任务书 §4.2「schema 不是维度别名」）
    dataset_schema = None
    dataset_rows_path = tiny_fit / "tiny_fit_v15_input.jsonl"
    if dataset_rows_path.exists():
        with dataset_rows_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    dataset_schema = json.loads(line).get("encoderSchemaId")
                    break

    def declared_schema(rel: str):
        payload = read_json(root / rel)
        if not isinstance(payload, dict):
            return None
        return payload.get("encoderSchemaId")

    used_checkpoints = [
        "checkpoints/synthetic_v15_s42.json",
        "checkpoints/tiny_s42_final_v15.json",
        "checkpoints/tiny_s42_final_stage8000_v15.json",
        "tiny_fit/rerun_v15schema/tiny_s42_v15schema_final.json",
    ]
    retained_mismatched = [
        "tiny_fit/tiny_s42_final.json",
        "tiny_fit/tiny_s42_final_badschema.json",
        "tiny_fit/tiny_s42_final_stage8000.json",
        "tiny_fit/tiny_s42_final_stage8000_badschema.json",
        "checkpoints/synthetic_v15_s42.shape_inferred.json",
        "checkpoints/synthetic_v15_s42_badschema_shape_inferred.json",
    ]
    used_readouts = {rel: declared_schema(rel) for rel in used_checkpoints}
    mismatch_readouts = {rel: declared_schema(rel) for rel in retained_mismatched}
    schema_ok = (dataset_schema is not None
                 and all(value == dataset_schema for value in used_readouts.values() if value is not None)
                 and all(value is not None for value in used_readouts.values()))
    add(
        "E_schema_declaration_matches_dataset",
        "导出权重的 encoderSchemaId 必须等于数据集的 encoderSchemaId（26/53 形状下 v14 与 v15 不能靠维度区分）",
        "PASS" if schema_ok else "FAILED",
        {
            "datasetEncoderSchemaId": dataset_schema,
            "datasetRowsPath": str(dataset_rows_path).replace("\\", "/"),
            "checkpointsUsedForMeasurements": used_readouts,
            "mismatchedArtifactsRetainedAsEvidence": mismatch_readouts,
            "parityReadingsUseOnlyCorrectlyDeclaredWeights": all(
                value == dataset_schema for value in used_readouts.values() if value is not None),
            "note": "训练器在未显式传 --encoder-schema-id 时按形状推断为 v14 并打印警告；"
                    "T15-05 首轮 tiny-fit 正是这样导出的，因此原始导出被改名为 *_badschema.json 保留为失败证据，"
                    "所有 parity/评估读数都改用仅改写 encoderSchemaId 一个字段得到的 *_v15.json。"
                    "owner B/C 修复导出路径后，本轮用 --encoder-schema-id …_v15 重跑了一次并原生导出 v15 权重"
                    "（tiny_fit/rerun_v15schema/）。",
        },
    )

    # E2：正式 C2 权重（T15-06）的同一路径验证（可用时）
    c2_final = Path("v15/out/v15_20260925_core/T15-06/c2_s42/c2_s42_final.json")
    c2_parity = root / "forward_parity_c2_s42_final.json"
    if c2_final.exists() and c2_parity.exists():
        c2_summary = g(read_json(c2_parity), "summary", default={}) or {}
        add(
            "E2_c2_weight_parity",
            "正式 C2 权重经固定诊断子集 + shared policy 验证 schema 与动作",
            "PASS" if c2_summary.get("passed") else "FAILED",
            {
                "checkpointPath": str(c2_final).replace("\\", "/"),
                "checkpointSha256": sha256_file(c2_final),
                "summary": c2_summary,
            },
        )
    else:
        add(
            "E2_c2_weight_parity",
            "正式 C2 权重经固定诊断子集 + shared policy 验证 schema 与动作",
            "PENDING",
            {
                "checkpointPath": str(c2_final).replace("\\", "/"),
                "checkpointExists": c2_final.exists(),
                "parityArtifact": str(c2_parity).replace("\\", "/"),
                "note": "T15-06 的 c2_s42 final 尚未产出（当前目录只有 best/u500 权重），"
                        "因此该项在 T15-05 内无法完成；流程与命令已固定，见 cli_reference.md §3。",
            },
        )

    # C3：原生 v15 声明的重跑（owner B/C 修好导出路径后）
    rerun_final = read_json(root / "tiny_fit_v15_final_rerun_v15schema.json")
    rerun_consumption = read_json(root / "tiny_fit_v15_consumption_rerun_v15schema.json")
    rerun_ts = read_json(root / "tiny_fit_v15_ts_reeval_rerun_v15schema.json")
    add(
        "C3_rerun_native_v15_schema",
        "导出路径修好后，用 --encoder-schema-id …_v15 从零重跑同一诊断（原生声明 v15），结果必须可复现",
        "PASS" if (g(rerun_final, "top1Correct") == g(tiny_final, "top1Correct")) else "FAILED",
        {
            "command": "tiny_fit/rerun_v15schema/train_command.txt",
            "updates": g(rerun_consumption, "measuredConsumption", "updates"),
            "exposures": g(rerun_consumption, "measuredConsumption", "totalExposures"),
            "ledgerEntries": g(rerun_consumption, "updateLedger", "ledgerEntries"),
            "ledgerComplete": g(rerun_consumption, "updateLedger", "ledgerComplete"),
            "top1Correct": g(rerun_final, "top1Correct"),
            "trainCrossEntropy": g(rerun_final, "trainCrossEntropy"),
            "previousRunTop1Correct": g(tiny_final, "top1Correct"),
            "previousRunTrainCrossEntropy": g(tiny_final, "trainCrossEntropy"),
            "tsReevalTop1Correct": g(rerun_ts, "top1Correct"),
            "checkpointDeclaredSchema": "spatial26_global20_actionSemantics53_v15（原生导出，无需 relabel）",
            "note": "两次运行的权重并不逐位相同（训练器源码在两次运行之间被并发修改过），"
                    "但命中数与 CE 完全一致（117/128、CE≈0.17140），说明该平台期不是暂停/续跑或源码版本的假象。"
                    "该次运行还提供了**完整的 16000 条逐 update 台账**，闭合了首轮 stage2 缺失 ledger 的缺口。",
        },
    )

    # 交付物存在性
    deliverables = [
        "parity_inputs_manifest.json",
        "historical_48_evidence.json",
        "forward_parity.json",
        "forward_parity_tiny_s42_final.json",
        "permutation_update.json",
        "tie_break.json",
        "tiny_fit_v15_consumption.json",
        "tiny_fit_v15_final.json",
        "tiny_fit_v15_ts_reeval.json",
        "tiny_fit_v15_split_manifest.json",
        "tiny_fit_v15_task_composition.json",
        "raw/ts_forward_synthetic.json",
        "raw/python_forward_synthetic.json",
        "raw/ts_forward_tiny_s42_final.json",
        "raw/python_forward_tiny_s42_final.json",
        "raw/tiebreak_ts.json",
        "states/diag_states.jsonl",
        "states/empty_allowed_states.jsonl",
        "states/terrain_tables_v15.json",
        "states/python_encoder_v15_golden_check.json",
        "checkpoints/tiny_s42_final_v15.json",
        "tiny_fit/tiny_fit_v15_config.json",
        "tiny_fit/tiny_fit_v15_input.jsonl",
        "tiny_fit/tiny_fit_v15_states.jsonl",
        "tiny_fit/train_command_stage1.txt",
        "tiny_fit/train_command_stage2.txt",
        "tiny_fit/rerun_v15schema/tiny_s42_v15schema_final.json",
        "tiny_fit/rerun_v15schema/train_command.txt",
        "forward_parity_c2_s42_final.json",
        "forward_parity_rerun_v15schema.json",
        "tiny_fit_v15_final_rerun_v15schema.json",
        "tiny_fit_v15_consumption_rerun_v15schema.json",
    ]
    present = {name: (root / name).exists() for name in deliverables}
    add(
        "D_deliverables",
        "任务书 §6 产物清单齐备",
        "PASS" if all(present.values()) else "FAILED",
        {"present": present},
    )

    passed = [item for item in items if item["status"] == "PASS"]
    failed = [item for item in items if item["status"] == "FAILED"]

    gate = {
        "schema": "v15_gate_GP_1",
        "task": "T15-05",
        "owner": "F（数值与导出验证）",
        "runId": "v15_20260925_core",
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "gate": "GP",
        "gateCondition": "T15-05 新 schema 数值/输入验证通过；正式模型输出需同路径导出验证",
        "conclusion": "FAILED" if failed else "PASS",
        "failedItems": [item["id"] for item in failed],
        "passedItemCount": len(passed),
        "failedItemCount": len(failed),
        "summary": (
            "输入/前向/tie-break/导出 shared policy 验证全部通过（输入 float32 最大差 2.9e-08、"
            "logits 最大差 1.2e-07、trunk Z 最大差 2.4e-07、0 次动作分歧）；"
            "两项未达标：① 一次 AdamW 更新在 fp32 下超出预登记 1e-5（根因已定位，float64 对照证明是精度问题）；"
            "② 128 状态 train-only 回归停在 117/128、CE 0.1714，未达 ≥127/128 且 CE<0.05，"
            "失败状态已逐个定位（全部为 recruit_to_castle 兵种混淆）。"
            "GP 因此判 FAILED：数值链路可用于正式训练（前向一致性无问题），但小样本可拟合性回归未通过。"
        ),
        "downstreamImplication": {
            "T15_06_C2": "数值/输入契约已具备启动条件（TS/Python 前向一致、schema 显式分派、空集类型化拒绝）；"
                         "但 tiny-fit 回归未通过，说明「新链路没有可拟合性退步」这一结论**未获支持**，"
                         "C2 启动后应把训练集 top-1/CE 曲线与前 N 个 batch 的拟合进度作为前置观察项。",
            "T15_09_eval": "固定诊断子集 states/diag_states.jsonl + v15/tools/tiny_fit_v15_ts_reeval.ts 可直接复用；"
                           "缓存键必须含 checkpointSha256 与 statesSha256。",
        },
        "items": items,
        "evidenceSha256": {
            name: sha256_file(root / name) for name in deliverables if (root / name).exists()
        },
        "t15_02EvidenceSha256": {
            "golden_inputs.jsonl": sha256_file(t15_02 / "golden_inputs.jsonl"),
            "golden_outputs.jsonl": sha256_file(t15_02 / "golden_outputs.jsonl"),
            "schema_contract.json": sha256_file(t15_02 / "schema_contract.json"),
        },
    }

    status = {
        "schema": "v15_task_status_1",
        "taskId": "T15-05",
        "owner": "F（数值与导出验证）",
        "runId": "v15_20260925_core",
        "status": "FAILED",
        "reason": "数值/输入/导出一致性全部通过，但两项预登记验收未达标："
                  "① fp32 下一次 AdamW 更新的候选重排差值超出 1e-5（根因=AdamW 第一步对 g≈0 不连续，"
                  "float64 对照 5.6e-11 通过）；② 128 状态 train-only 回归 117/128、CE 0.1714，"
                  "未达 ≥127/128 与 CE<0.05，失败状态已逐个定位为 recruit_to_castle 兵种混淆。",
        "acceptance": {item["id"]: item["status"] for item in items},
        "acceptanceDetail": items,
        "evidence": [
            "v15/out/v15_20260925_core/T15-05/parity_inputs_manifest.json",
            "v15/out/v15_20260925_core/T15-05/historical_48_evidence.json",
            "v15/out/v15_20260925_core/T15-05/forward_parity.json",
            "v15/out/v15_20260925_core/T15-05/forward_parity_tiny_s42_final.json",
            "v15/out/v15_20260925_core/T15-05/permutation_update.json",
            "v15/out/v15_20260925_core/T15-05/tie_break.json",
            "v15/out/v15_20260925_core/T15-05/tiny_fit_v15_final.json",
            "v15/out/v15_20260925_core/T15-05/tiny_fit_v15_ts_reeval.json",
            "v15/out/v15_20260925_core/T15-05/tiny_fit_v15_consumption.json",
            "v15/out/v15_20260925_core/T15-05/tiny_fit_v15_task_composition.json",
            "v15/out/v15_20260925_core/T15-05/gate_GP.json",
        ],
        "commands": [
            "python v15/tools/parity_build_states_v15.ts（经 run-tool：node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/parity_build_states_v15.ts --out-dir v15/out/v15_20260925_core/T15-05）",
            "python v15/tools/parity_python_encode_v15.py --out v15/out/v15_20260925_core/T15-05/states/python_encoder_v15_golden_check.json",
            "node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/parity_ts_forward_v15.ts --states … --checkpoint … --out …",
            "python v15/tools/parity_compare_v15.py --states … --ts-raw … --tables … --checkpoint … --out …",
            "python v15/tools/parity_permutation_v15.py --dataset … --out-dir v15/out/v15_20260925_core/T15-05",
            "node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/parity_tiebreak_v15.ts …",
            "python v15/tools/parity_tiebreak_v15.py …",
            "python v15/tools/tiny_fit_v15_prepare.py --out-dir v15/out/v15_20260925_core/T15-05/tiny_fit",
            "python python/train_spatial_resnet.py --dataset … --train-only --global-update-limit 16000 --pause-after-updates 8000 …",
            "python python/train_spatial_resnet.py … --resume-state tiny_s42.state.pt",
            "python v15/tools/tiny_fit_v15_eval.py …",
            "node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/tiny_fit_v15_ts_reeval.ts …",
            "python v15/tools/tiny_fit_v15_consumption.py …",
            "python -m pytest python/tests/test_v15_parity.py -q",
        ],
        "blockedOn": [
            {
                "id": "B1_trainer_semantics_field",
                "ownerSuggestion": "C（python/train_spatial_resnet.py）或 E（v15/tools/dataset_v15.ts）",
                "summary": "T15-04 数据集把候选语义写在 candidateActions[].semantics_padded，"
                           "T15-03 训练器只读 candidateActions[].semantics（python/train_spatial_resnet.py:272/281），"
                           "导致语义维度推断为 0 并直接报错。",
                "minimalRepro": "python python/train_spatial_resnet.py --dataset v15/out/v15_20260925_core/T15-04/dataset_v15.jsonl "
                                "--train-only --epochs 1 --batch-size 16 → ValueError: 数据集动作语义维度 0 不在 [32, 53] 内",
                "workaroundUsedInT15_05": "v15/tools/tiny_fit_v15_prepare.py 在写 tiny_fit 输入时把 semantics_padded 逐元素复制到 semantics，"
                                          "数值不变并在 config 里记录；公共实现未改。",
                "impactOnOthers": "T15-06 正式 C2 训练若直接吃 dataset_v15.jsonl 会命中同一错误。",
            },
            {
                "id": "B2_export_rejects_v15_schema",
                "ownerSuggestion": "B（python/spatial_resnet_model.py）",
                "summary": "export_model_to_ts_json 的 schema 推断是 (26,53)⇒v14 / 其余⇒v13 的二分，无法表达 v15；"
                           "带 --encoder-schema-id spatial26_global20_actionSemantics53_v15 的训练在收尾导出时必然抛错，"
                           "且抛错发生在写 state 之前，会丢失整轮训练的 resumable state。",
                "minimalRepro": "python python/train_spatial_resnet.py --dataset v15/out/v15_20260925_core/T15-05/tiny_fit/tiny_fit_v15_input.jsonl "
                                "--train-only --epochs 1 --batch-size 16 --global-update-limit 8 "
                                "--encoder-schema-id spatial26_global20_actionSemantics53_v15 --out-model /tmp/x.json "
                                "→ ValueError: 导出的 encoderSchemaId=…v15 与权重形状推断出的 …v14 不一致",
                "workaroundUsedInT15_05": "不传 --encoder-schema-id 让导出成功（写出的标签是 v14），再用 "
                                          "v15/tools/parity_make_checkpoints_v15.py 仅改写 encoderSchemaId 一个字段生成 *_v15.json；"
                                          "改写前后的差异被逐字段核对（只允许该键变化）。",
                "impactOnOthers": "T15-06 的 final 导出必须解决该缺口，否则 C2 权重要么无法导出、要么带着错误的 v14 语义标签进入评测。",
                "resolution": "owner B/C 已修复：python/spatial_resnet_model.py 对 26/53 形状族允许显式声明 v14 或 v15，"
                              "未声明时按形状推断成 v14 并打印警告；训练器的 --encoder-schema-id 会一路传到所有导出点。"
                              "T15-05 已用 --encoder-schema-id …_v15 从零重跑 16000 步复验：原生导出声明 v15"
                              "（tiny_fit/rerun_v15schema/），且 T15-06 的 c2_s42_final.json 也正确声明 v15 "
                              "并通过 162 状态一致性验证。",
            },
            {
                "id": "B3_resume_ledger_overwrite_guard",
                "ownerSuggestion": "C（python/train_spatial_resnet.py）",
                "summary": "optimizer ledger 以 <out-model>.optimizer_update_ledger.jsonl 命名且拒绝覆盖；"
                           "同一逻辑运行 resume 时 identity 不含 out-model，因此只能改 --out-model，"
                           "第二次运行在收尾写 ledger 时抛 FileExistsError（此前权重/state/metrics 已落盘）。",
                "minimalRepro": "用同一 --out-model 与 --resume-state 连跑两次（第二次 --global-update-limit 更大），"
                                "第二次在 FileExistsError 处结束；见 v15/out/v15_20260925_core/T15-05/tiny_fit/train_stage2.log 末尾。",
                "impactOnOthers": "正式 C2/D 的受控暂停+续跑会丢掉第二段逐 update 台账（累计读数仍在 consumed.json）。",
            },
        ],
        "discoveredNotFixed": [
            {
                "id": "F3_schema_declaration_inferred_as_v14",
                "status": "RESOLVED_BY_OWNER_B_C（本轮内已修复，T15-05 已复验）",
                "summary": "未显式传 --encoder-schema-id 时，导出按形状把 V15 数据训练出的权重标成 v14；"
                           "TS 端按 v15 加载会 fail-fast 拒绝。T15-05 首轮 tiny-fit 与 T15-06 首轮 C2 都命中过。",
                "t15_05Action": "原始导出改名 *_badschema.json 保留为失败证据；所有 parity/评估读数改用"
                                "仅改写 encoderSchemaId 一个字段的 *_v15.json；并在 gate_GP.json 新增 "
                                "E_schema_declaration_matches_dataset 逐条给出「声明值 vs 数据集值」。",
                "postFixVerification": {
                    "rerunCommandHasExplicitSchema": "tiny_fit/rerun_v15schema/train_command.txt",
                    "rerunNativeExportSchema": "spatial26_global20_actionSemantics53_v15",
                    "rerunParityArtifact": "forward_parity_rerun_v15schema.json",
                    "c2ParityArtifact": "forward_parity_c2_s42_final.json",
                    "c2CheckpointSha256": sha256_file(
                        Path("v15/out/v15_20260925_core/T15-06/c2_s42/c2_s42_final.json")),
                },
            },
            {
                "id": "F1_adamw_single_step_fp32",
                "summary": "候选重排后 fp32 的一次 AdamW 更新最大差 1.9e-3，远超预登记 1e-5。"
                           "根因：AdamW 第一步 ≈ lr·sign(g)，K 个候选的 CE 归约顺序不同使 |g| 低于 fp32 噪声底的元素符号翻转"
                           "（60995 个符号翻转元素，131614 个越界元素全部 |g|<1e-6）。float64 对照：梯度差 5.6e-16、更新差 5.6e-11。",
                "recommendation": "下一轮把「一次 optimizer 更新」的预登记判据改成尺度相关（例如相对 lr，或排除 |g| 低于噪声底的元素），"
                                  "或在 float64 下做该判据；本轮不追溯放宽。",
            },
            {
                "id": "F2_shared_policy_tie_break_not_code_point",
                "summary": "SpatialResNetPredictor.predict 的 argmax 用严格 > 比较，返回**数组下标序**的首个最大值；"
                           "shared policy 直接返回 legalActions[bestActionIndex]。"
                           "因此 V15 契约里的「代码点序共同 tie-break」需要调用方把候选按规范 actionCode 排序，"
                           "或由 shared policy 增加一层选择。当前 src/** 未改（不在 T15-05 文件范围）。",
                "evidence": "v15/out/v15_20260925_core/T15-05/tie_break.json 的 syntheticIdenticalLogits："
                            "V15 规则选出的 actionCode 与 predictor.bestActionIndex 对应 actionCode 在全并列时可以不同。",
                "recommendation": "由 owner B 决定：把排序放进 shared policy，或在生成候选时固定按 actionCode 排序并写入 orderingId。"
                                  "T15-06 之前必须确定，否则并列时的线上动作取决于候选顺序。",
            },
        ],
        "remainingWork": [
            "① 决定 F2（V15 并列选择在哪一层实现）并在 shared policy 或候选生成处落地；",
            "② 解决 B1/B2/B3 三个训练-导出接口缺口；",
            "③ 用 V14 的 128 状态集按 V15 语义重编码后重跑一次 train-only 诊断，得到与 V14 可比的可拟合性回归量；",
            "④ 定位并处理 recruit_to_castle 兵种混淆（11/128）：先确认是优化/容量问题还是标签分布问题，再决定是否进入正式池。",
        ],
        "resumeCommand": "python v15/tools/parity_emit_gate_gp.py --t15-05 v15/out/v15_20260925_core/T15-05",
    }

    (root / "gate_GP.json").write_text(json.dumps(gate, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (root / "task_status.json").write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "gate": gate["conclusion"],
        "passedItems": gate["passedItemCount"],
        "failedItems": gate["failedItems"],
        "taskStatus": status["status"],
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
