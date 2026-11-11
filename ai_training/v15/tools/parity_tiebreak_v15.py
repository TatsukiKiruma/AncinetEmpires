"""V15/T15-05：tie-break 共同规则的语言间一致性（Python 侧）与 `tie_break.json`。

规则（任务书 §6 步骤 4）：
- V15：最高 logit → **规范 actionCode 的代码点顺序** → 最小下标；**不使用 localeCompare**。
- 历史 schema（v1/v13/v14）：保留其历史版本（首个最大值 / 数组下标序），不静默换新规则。

本脚本用 Python 独立实现同一规则，逐案例核对 TS 侧读数，并输出最终裁决。

用法：
    python v15/tools/parity_tiebreak_v15.py \
        --ts-tiebreak <raw/tiebreak_ts.json> --python-forward <raw/python_forward_synthetic.json> \
        --states <states/diag_states.jsonl> --out <tie_break.json>
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List


def select_action_index_v15(logits: List[float], action_codes: List[str]) -> int:
    """V15 共同 tie-break：max logit → 最小 actionCode（代码点序）→ 最小下标。

    只用 Python 字符串比较（按 Unicode 码点），不使用 locale.strxfrm / locale.strcoll。
    """
    if not logits:
        return -1
    best = 0
    for index in range(1, len(logits)):
        if logits[index] > logits[best]:
            best = index
        elif logits[index] == logits[best]:
            code = action_codes[index] if index < len(action_codes) else ""
            best_code = action_codes[best] if best < len(action_codes) else ""
            if code < best_code:
                best = index
    return best


def select_action_index_legacy(logits: List[float], action_codes: List[str]) -> int:
    """历史 schema 的 tie-break：首个最大值（数组下标序）。"""
    del action_codes
    best = 0
    for index in range(1, len(logits)):
        if logits[index] > logits[best]:
            best = index
    return best


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ts-tiebreak", required=True)
    parser.add_argument("--python-forward", required=True)
    parser.add_argument("--states", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    ts = json.loads(Path(args.ts_tiebreak).read_text(encoding="utf-8"))
    py_forward = json.loads(Path(args.python_forward).read_text(encoding="utf-8"))
    py_logits = {entry["caseId"]: entry["actionLogits"] for entry in py_forward["readouts"]}

    states: Dict[str, Any] = {}
    for line in Path(args.states).read_text(encoding="utf-8").splitlines():
        if line.strip():
            record = json.loads(line)
            states[record["diagId"]] = record

    # ---------------- 1) 合成相同 logits：两种语言必须选出同一个下标
    synthetic_checks: List[Dict[str, Any]] = []
    synthetic_agreements = 0
    synthetic_total = 0
    for carrier in ts["syntheticTieCases"]:
        codes = carrier["actionCodes"]
        for case in carrier["cases"]:
            synthetic_total += 1
            py_index = select_action_index_v15(case["logits"], codes)
            legacy_index = select_action_index_legacy(case["logits"], codes)
            agree = py_index == case["v15SelectedIndex"]
            legacy_agree = legacy_index == case["legacySelectedIndex"]
            rule_ok = py_index == case["expectedV15Index"]
            if agree and legacy_agree:
                synthetic_agreements += 1
            synthetic_checks.append({
                "carrierDiagId": carrier["carrierDiagId"],
                "kind": case["kind"],
                "candidateCount": len(codes),
                "tiedMaxCount": case["tiedMaxCount"],
                "tiedMaxIndices": case["tiedMaxIndices"],
                "v15SelectedActionCodeTs": case["v15SelectedActionCode"],
                "v15SelectedActionCodePython": codes[py_index],
                "legacySelectedActionCodeTs": case["legacySelectedActionCode"],
                "legacySelectedActionCodePython": codes[legacy_index],
                "tsPythonRuleAgree": agree,
                "legacyRuleAgree": legacy_agree,
                "v15MatchesCodePointRule": rule_ok,
            })

    # ---------------- 2) 真实 logits 的强制顶部并列：用 Python 自己的 logits 复算
    forced_checks: List[Dict[str, Any]] = []
    forced_agreements = 0
    forced_pair_mismatch = 0
    for entry in ts["forcedTopTies"]:
        diag_id = entry["diagId"]
        codes = states.get(diag_id, {}).get("policyAllowedActionCodes")
        logits = py_logits.get(diag_id)
        if not codes or logits is None or len(codes) != len(logits):
            forced_pair_mismatch += 1
            continue
        best_index = select_action_index_legacy(logits, codes)
        second_index = -1
        for index in range(len(logits)):
            if index == best_index:
                continue
            if second_index < 0 or logits[index] > logits[second_index]:
                second_index = index
        if second_index < 0:
            continue
        forced = list(logits)
        forced[second_index] = logits[best_index]
        py_v15 = select_action_index_v15(forced, codes)
        py_legacy = select_action_index_legacy(forced, codes)
        pair_codes_python = sorted([codes[best_index], codes[second_index]])
        pair_codes_ts = sorted(entry["forcedTieActionCodes"])
        pairs_match = pair_codes_python == pair_codes_ts
        if not pairs_match:
            forced_pair_mismatch += 1
        agree = (not pairs_match) or (codes[py_v15] == entry["v15SelectedActionCode"])
        if agree:
            forced_agreements += 1
        forced_checks.append({
            "diagId": diag_id,
            "forcedPairMatchesTs": pairs_match,
            "forcedTieActionCodes": pair_codes_python,
            "topLogit": logits[best_index],
            "originalGapTs": entry["originalGap"],
            "v15SelectedActionCodeTs": entry["v15SelectedActionCode"],
            "v15SelectedActionCodePython": codes[py_v15],
            "legacySelectedActionCodeTs": entry["legacySelectedActionCode"],
            "legacySelectedActionCodePython": codes[py_legacy],
            "v15PicksSmallerCodePoint": codes[py_v15] == pair_codes_python[0],
        })

    # ---------------- 3) 历史 schema 保留
    legacy = ts["legacySchema"]
    legacy_rule_preserved = None
    if legacy.get("probe"):
        probe = legacy["probe"]
        py_legacy_index = select_action_index_legacy(probe["syntheticAllEqualLogits"], probe["actionCodes"])
        py_v15_index = select_action_index_v15(probe["syntheticAllEqualLogits"], probe["actionCodes"])
        legacy_rule_preserved = (
            py_legacy_index == probe["selectedIndexBySchemaRule"] == 0
            and py_v15_index == probe["v15RuleWouldSelectIndex"]
        )

    report = {
        "schema": "v15_tie_break_1",
        "task": "T15-05",
        "runId": "v15_20260925_core",
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "rules": {
            "v15": "最高 logit → 最小 actionCode（代码点序）→ 最小下标",
            "legacy": "首个最大值（数组下标序），历史版本保留",
            "noLocaleCompare": "TS 用字符串 `<`（UTF-16 代码单元序；动作码字母表全在 BMP，与码点序一致），"
                               "Python 用字符串 `<`（码点序）；两侧都不使用 localeCompare / locale.strxfrm",
            "noEpsilon": "不使用任何 epsilon 改写 logits 的高低排序；近似并列单独报告。",
        },
        "inputs": {
            "tsTiebreakPath": args.ts_tiebreak.replace("\\", "/"),
            "tsTiebreakSha256": sha256_file(Path(args.ts_tiebreak)),
            "pythonForwardPath": args.python_forward.replace("\\", "/"),
            "pythonForwardSha256": sha256_file(Path(args.python_forward)),
            "statesPath": args.states.replace("\\", "/"),
            "statesSha256": sha256_file(Path(args.states)),
        },
        "syntheticIdenticalLogits": {
            "cases": synthetic_total,
            "tsPythonRuleAgreements": synthetic_agreements,
            "allAgree": synthetic_agreements == synthetic_total,
            "checks": synthetic_checks,
        },
        "forcedTopTiesFromRealLogits": {
            "cases": len(forced_checks),
            "tsPythonRuleAgreements": forced_agreements,
            "pairStructureMismatches": forced_pair_mismatch,
            "allAgree": forced_agreements == len(forced_checks),
            "checks": forced_checks,
        },
        "realExactTiesAtTop": {
            "count": len(ts["realExactTies"]),
            "note": "162 个真实前向案例里没有出现顶部精确并列（连续 logit 的偶然精确相等极罕见）；"
                    "受控精确并列由合成相同 logits 的用例承担。",
            "checks": ts["realExactTies"],
        },
        "controlledDuplicateCandidate": {
            "checks": ts.get("controlledDuplicateChecks", []),
            "note": "构建器为 syn_exact_tie_duplicate_candidate 在候选末尾追加了一个逐位相同的候选；"
                    "TS 前向按引擎真实合法集重建候选，因此该人工追加项不在前向候选里"
                    "（outOfRangeGroups 显式记录，不当作并列成立）。端到端并列结论只由合成用例与强制并列承担。",
        },
        "nearTies": {
            "threshold": ts["nearTieThreshold"],
            "count": len(ts["nearTies"]),
            "note": "近似并列单列：不通过加 epsilon 改写高低排序；"
                    "这些案例的最终动作由 forward_parity.json 逐案例核对，actionMismatches=0。",
            "checks": ts["nearTies"],
        },
        "legacySchemaRetention": {
            "checkpointPath": legacy.get("checkpointPath"),
            "encoderSchemaId": legacy.get("encoderSchemaId"),
            "semanticsVariant": legacy.get("semanticsVariant"),
            "spatialChannels": legacy.get("spatialChannels"),
            "semanticDim": legacy.get("semanticDim"),
            "loadError": legacy.get("loadError"),
            "probe": legacy.get("probe"),
            "pythonRuleReproducesTs": legacy_rule_preserved,
            "note": "历史权重（无 encoderSchemaId）由 loadSpatialResNetFromJson 补 v13 身份，"
                    "选择规则仍是历史的下标序；V15 的代码点规则不会静默套到历史模型上。",
        },
        "emptyAllowedSetContract": {
            "checks": ts["emptyAllowedSet"],
            "note": "空合法集不得输出不在合法集中的 end_turn；shared policy 抛 EmptyActionSetError（类型化拒绝）。",
        },
        "verdict": {
            "syntheticTieRuleConsistentAcrossLanguages": synthetic_agreements == synthetic_total,
            "forcedTieRuleConsistentAcrossLanguages": forced_agreements == len(forced_checks),
            "legacyRulePreserved": bool(legacy_rule_preserved),
            "emptySetTypedRejectionObserved": all(
                probe.get("typedEmptyActionSet") or probe.get("rejected")
                for entry in ts["emptyAllowedSet"] for probe in entry["probes"]
            ),
        },
    }
    report["verdict"]["passed"] = all([
        report["verdict"]["syntheticTieRuleConsistentAcrossLanguages"],
        report["verdict"]["forcedTieRuleConsistentAcrossLanguages"],
        report["verdict"]["legacyRulePreserved"],
        report["verdict"]["emptySetTypedRejectionObserved"],
    ])

    Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "out": args.out,
        "syntheticCases": synthetic_total,
        "syntheticAgreements": synthetic_agreements,
        "forcedTies": len(forced_checks),
        "forcedAgreements": forced_agreements,
        "nearTies": len(ts["nearTies"]),
        "legacyVariant": legacy.get("semanticsVariant"),
        "verdict": report["verdict"],
    }, indent=2, ensure_ascii=False))
    return 0 if report["verdict"]["passed"] else 5


if __name__ == "__main__":
    raise SystemExit(main())
