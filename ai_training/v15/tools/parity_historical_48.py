"""V15/T15-05：原 48 案例的历史证据清单与新 schema 受影响范围。

任务书 §6 步骤 1：列出原 48 案例的 runtime/input/checkpoint SHA 与新 schema 的受影响范围；
**作为历史证据保留，不直接改其版本号**。

本脚本只读取、只哈希、只统计，不重跑、不改写任何 V14 产物。它把下面几件事固定成可复核的 JSON：

- 48 个案例的输入/输出文件 SHA256（逐个），以及汇总报告与所用检查点的 SHA256；
- 每个案例的候选数、动作类型、是否含 attack 候选（V15 语义只改攻击语义槽 15/17）；
- 历史运行身份：该批案例在哪种 schema 下产生（v14），以及新 schema 相对它的受影响字段表。

用法：
    python v15/tools/parity_historical_48.py \
        --t14-03-dir v14/out/v14_20260925_t14b/T14-03 --out <T15-05>/historical_48_evidence.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parents[2]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def action_type_of(code: str) -> str:
    return str(code).split(":")[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--t14-03-dir", default="v14/out/v14_20260925_t14b/T14-03")
    parser.add_argument("--fixture", default="v14/out/v14_20260924_t14/T14-03/parity_fixture.json")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    t14 = Path(args.t14_03_dir)
    work = t14 / "forward_parity_work"
    report_path = t14 / "ts_python_forward_parity.json"
    md_path = t14 / "forward_parity_report.md"

    if not report_path.exists():
        raise SystemExit(f"缺少历史报告：{report_path}")
    report = json.loads(report_path.read_text(encoding="utf-8"))

    checkpoint_rel = report.get("checkpoint")
    checkpoint_path = Path(checkpoint_rel) if checkpoint_rel else None
    checkpoint_exists = bool(checkpoint_path and checkpoint_path.exists())

    cases: List[Dict[str, Any]] = []
    affected = 0
    for entry in report.get("cases", []):
        state_index = entry.get("stateIndex")
        player_id = entry.get("playerId")
        input_path = work / f"case_{state_index}_{player_id}.input.json"
        python_path = work / f"case_{state_index}_{player_id}.python.json"
        record: Dict[str, Any] = {
            "stateId": entry.get("stateId"),
            "stateIndex": state_index,
            "playerId": player_id,
            "candidates": entry.get("candidates"),
            "types": entry.get("types"),
            "reportedMaxLogitAbsDiff": entry.get("maxLogitAbsDiff"),
            "reportedMaxLogitRelDiff": entry.get("maxLogitRelDiff"),
            "reportedTsBestActionIndex": entry.get("tsBestActionIndex"),
            "reportedPythonBestActionIndex": entry.get("pythonBestActionIndex"),
            "inputPath": str(input_path).replace("\\", "/"),
            "pythonPath": str(python_path).replace("\\", "/"),
            "inputExists": input_path.exists(),
            "pythonExists": python_path.exists(),
            "inputSha256": sha256_file(input_path) if input_path.exists() else None,
            "pythonSha256": sha256_file(python_path) if python_path.exists() else None,
        }
        # 受影响范围：V15 只改攻击候选的语义槽 15/17，因此含 attack 候选的案例受影响。
        has_attack = False
        attack_candidates = 0
        if input_path.exists():
            payload = json.loads(input_path.read_text(encoding="utf-8"))
            codes = [c.get("actionCode") for c in payload.get("candidateActions", [])]
            codes = [c for c in codes if isinstance(c, str)]
            attack_candidates = sum(1 for c in codes if action_type_of(c) == "attack")
            has_attack = attack_candidates > 0
            record["candidateCountInInput"] = len(payload.get("candidateActions", []))
            record["spatialTensorLength"] = len(payload.get("spatialTensor", []))
            record["globalFeatureLength"] = len(payload.get("globalFeatures", []))
        record["containsAttackCandidates"] = has_attack
        record["attackCandidateCount"] = attack_candidates
        if has_attack:
            affected += 1
        cases.append(record)

    evidence = {
        "schema": "v15_historical_48_evidence_1",
        "task": "T15-05",
        "runId": "v15_20260925_core",
        "status": "HISTORICAL_EVIDENCE_RETAINED",
        "statement": (
            "这 48 个案例是 V14b/T14-03 在 V14 schema 下产生的历史证据。"
            "本轮**不重跑、不改版本号、不覆盖**，只记录其文件 SHA 与新 schema 的受影响范围。"
        ),
        "runtimeIdentity": {
            "producingTask": "V14b/T14-03",
            "producingTool": "v14/tools/forward_parity_probe.ts",
            "producingSchemaId": "spatial26_global20_actionSemantics53_v14",
            "reportPath": str(report_path).replace("\\", "/"),
            "reportSha256": sha256_file(report_path),
            "reportMarkdownPath": str(md_path).replace("\\", "/"),
            "reportMarkdownSha256": sha256_file(md_path) if md_path.exists() else None,
            "checkpointPath": checkpoint_rel,
            "checkpointExists": checkpoint_exists,
            "checkpointSha256": sha256_file(checkpoint_path) if checkpoint_exists else None,
            "checkpointEncoderSchemaIdReported": report.get("checkpointEncoderSchemaId"),
            "fixturePath": report.get("fixture"),
            "fixtureCasesAvailable": report.get("fixtureCasesAvailable"),
            "casesCompared": report.get("casesCompared"),
            "pythonFailures": report.get("pythonFailures"),
            "reportedTolerance": report.get("tolerance"),
            "reportedSummary": report.get("summary"),
            "reportedActionTypeCoverage": report.get("actionTypeCoverage"),
        },
        "newSchemaAffectedScope": {
            "newSchemaId": "spatial26_global20_actionSemantics53_v15",
            "shapeChange": "无（仍为 26 空间通道 / 20 全局 / 53 动作语义）",
            "semanticChange": "仅攻击候选的语义槽 15「预计反击」与槽 17「自杀风险」："
                              "改用包含攻击者本次攻击经验/升级投影的完整引擎结算顺序。",
            "affectedFieldList": [
                "candidateActions[].semantics[15]",
                "candidateActions[].semantics[17]",
            ],
            "unaffectedFields": [
                "spatialTensor（26×20×20）",
                "globalFeatures（20）",
                "候选坐标 actorCoord / landingCoord / targetCoord",
                "非攻击候选的 semantics",
                "候选顺序与候选集合",
            ],
            "casesWithAttackCandidates": affected,
            "casesWithoutAttackCandidates": len(cases) - affected,
            "whyNotRerun": (
                "历史 48 案例的 encoderSchemaId 是 v14；在新 schema 下重算会改变其语义身份，"
                "使历史读数与历史权重不再对应。正确的复核方式是按 v14 语义解释这些输入"
                "（见 states/diag_states.jsonl 里 golden_* 案例的 attackSemanticsByVariant）。"
            ),
        },
        "cases": cases,
        "counts": {
            "cases": len(cases),
            "inputsHashed": sum(1 for c in cases if c["inputExists"]),
            "pythonOutputsHashed": sum(1 for c in cases if c["pythonExists"]),
            "casesWithAttackCandidates": affected,
        },
    }

    out = Path(args.out)
    out.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "out": str(out),
        "cases": evidence["counts"]["cases"],
        "inputsHashed": evidence["counts"]["inputsHashed"],
        "pythonOutputsHashed": evidence["counts"]["pythonOutputsHashed"],
        "casesWithAttackCandidates": affected,
        "checkpointSha256": evidence["runtimeIdentity"]["checkpointSha256"],
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
