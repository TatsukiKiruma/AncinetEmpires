"""V15/T15-05：128 状态诊断的**任务组成对比**（V14 参照集 vs 本轮 V15 集）。

为什么要单列：任务书 §6 要求读取并记录 V14 成功 stageB 的完整诊断配置，并只做新 schema/数据
所需的适配。V14 的 tiny-fit 数据集是一个**按动作类型配平**的 128 状态集（每类型约 12 个），
而本轮的 128 状态是从 T15-04 冻结数据按 root 家族轮转取样的**自然分布**集。
两者不是同一任务，因此 117/128 的读数不能直接当作"新链路相对 V14 退步"的证据，
反之也不能用 V14 的 128/128 为 V15 结果背书。本脚本把这一差异固定成可复算的读数。

用法：
    python v15/tools/tiny_fit_v15_task_composition.py --out <T15-05>/tiny_fit_v15_task_composition.json
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List

V14_INPUT = "v14/out/v14_20260925_t14b/T14-04/tiny_fit_input.jsonl"
V15_INPUT = "v15/out/v15_20260925_core/T15-05/tiny_fit/tiny_fit_v15_input.jsonl"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def load(path: Path) -> List[Dict[str, Any]]:
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def summarize(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    types = collections.Counter(str(row["targetActionCode"]).split(":")[0] for row in rows)
    recruit_classes = collections.Counter(
        str(row["targetActionCode"]).split(":")[1] for row in rows
        if str(row["targetActionCode"]).startswith("recruit_to_castle"))
    counts = sorted(len(row["candidateActions"]) for row in rows)
    families = {row.get("rootFamilyId") for row in rows}
    return {
        "rows": len(rows),
        "targetActionTypeHistogram": dict(sorted(types.items())),
        "distinctTargetActionTypes": len(types),
        "targetRecruitClassHistogram": dict(sorted(recruit_classes.items())),
        "candidateCountMin": counts[0] if counts else None,
        "candidateCountMax": counts[-1] if counts else None,
        "candidateCountMedian": counts[len(counts) // 2] if counts else None,
        "rootFamilies": len(families),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--v14-input", default=V14_INPUT)
    parser.add_argument("--v15-input", default=V15_INPUT)
    args = parser.parse_args()

    v14_path = Path(args.v14_input)
    v15_path = Path(args.v15_input)
    v14 = load(v14_path)
    v15 = load(v15_path)

    report = {
        "schema": "v15_tiny_fit_task_composition_1",
        "task": "T15-05",
        "purpose": "说明本轮 V15 的 128 状态诊断集与 V14 stageB 参照集不是同一任务。",
        "v14ReferenceSet": {
            "path": str(v14_path).replace("\\", "/"),
            "sha256": sha256_file(v14_path),
            **summarize(v14),
            "note": "V14/T14-04 的 tiny-fit 集：按动作类型配平（每类型约 12 个目标）。",
        },
        "v15DiagnosticSet": {
            "path": str(v15_path).replace("\\", "/"),
            "sha256": sha256_file(v15_path),
            **summarize(v15),
            "note": "本轮从 T15-04 冻结数据按 root 家族轮转取样，目标是自然分布。",
        },
        "conclusion": {
            "sameTask": False,
            "reason": "目标动作类型分布、候选数分布与 root 家族构成都不同；"
                      "V14 是配平记忆任务，本轮是自然分布任务。",
            "consequence": "本轮 117/128 与 V14 的 128/128 不可直接相减作为回归量；"
                           "要得到可比的回归量，需要把 V14 的那 128 个状态用 V15 语义重编码后重跑同样的 train-only 诊断。",
            "notDone": "重跑 V14 状态集（任务书要求本轮只做**一次**回归，故未执行第二组训练）。",
        },
    }

    Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "out": args.out,
        "v14Types": report["v14ReferenceSet"]["distinctTargetActionTypes"],
        "v15Types": report["v15DiagnosticSet"]["distinctTargetActionTypes"],
        "v14RecruitTargets": sum(report["v14ReferenceSet"]["targetRecruitClassHistogram"].values()),
        "v15RecruitTargets": sum(report["v15DiagnosticSet"]["targetRecruitClassHistogram"].values()),
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
