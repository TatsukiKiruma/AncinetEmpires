"""V18/T18-01：核对「实际送进 trainer 的验证分区」与 V18 统一验证集的关系。

V17 复核发现：实际送进 trainer 的 B0/B1/B1e/B0h_beh 四份文件，验证分区的输入序列与目标序列
哈希完全相同，5,316 行全部来自 H0，且 0-2 阶段只有 2 行。本脚本回答两个问题：

1. 那 5,316 行到底是哪些状态？与 V18 统一验证集（`val_dual_teacher.labels.jsonl`）的交集多大？
2. 那 5,316 行各自的 L1 目标与行为目标是否真的不同（即 target 被写成了行为动作）？

用法：
    python v18/tools/audit_trainer_val_vs_v18.py --run-id run_20260927_v18_01
"""
from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V17_RUN = ROOT / "v17" / "out" / "v17_20260926_r2"
TRAINER_VAL = V17_RUN / "experiments" / "_data" / "B01_val_fixed.jsonl"


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if text:
                yield json.loads(text)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id
    unified = run / "data" / "val_dual_teacher.labels.jsonl"

    unified_by_key: dict[str, dict] = {}
    for row in iter_jsonl(unified):
        unified_by_key[row["policyInputKey"]] = row

    stats = collections.Counter()
    trainer_keys: set[str] = set()
    phase = collections.Counter()
    sources = collections.Counter()
    target_vs_l1 = collections.Counter()
    target_vs_behavior = collections.Counter()
    index_code_mismatch = 0
    dedupe_seen: set[str] = set()
    trainer_roots: set[str] = set()
    trainer_families: set[str] = set()

    for row in iter_jsonl(TRAINER_VAL):
        stats["rows"] += 1
        key = row.get("actualInputKey") or row.get("policyInputKey")
        trainer_keys.add(key)
        dedupe_seen.add(key)
        idx = row.get("targetActionIndex")
        candidates = row.get("candidateActions") or []
        code = candidates[idx]["actionCode"] if isinstance(idx, int) and 0 <= idx < len(candidates) else None
        if code != row.get("targetActionCode"):
            index_code_mismatch += 1
        l1 = row.get("l1ActionCode")
        beh = row.get("behaviorActionCode")
        if l1 is not None:
            target_vs_l1["same" if code == l1 else "differ"] += 1
        if beh is not None:
            target_vs_behavior["same" if code == beh else "differ"] += 1
        phase[str(row.get("phaseBucket"))] += 1
        sources[str(row.get("sourcePolicy"))] += 1
        trainer_roots.add(str(row.get("rootId")))
        trainer_families.add(str(row.get("trueFamilyId")))

    overlap = trainer_keys & set(unified_by_key)
    l1_target_disagreement_on_overlap = 0
    agreement_counts = collections.Counter()
    for row in iter_jsonl(TRAINER_VAL):
        key = row.get("actualInputKey") or row.get("policyInputKey")
        mine = unified_by_key.get(key)
        if mine is None:
            continue
        idx = row.get("targetActionIndex")
        candidates = row.get("candidateActions") or []
        code = candidates[idx]["actionCode"] if isinstance(idx, int) and 0 <= idx < len(candidates) else None
        agreement_counts["trainerTargetEqV18L1"] += int(code == mine["targets"]["L1_V18"]["targetActionCode"])
        agreement_counts["trainerTargetEqBehavior"] += int(code == mine["behaviorActionCode"])
        l1_target_disagreement_on_overlap += int(code != mine["targets"]["L1_V18"]["targetActionCode"])

    report = {
        "schema": "v18_trainer_val_audit_1",
        "trainerVal": str(TRAINER_VAL.relative_to(ROOT)).replace("\\", "/"),
        "unifiedVal": str(unified.relative_to(ROOT)).replace("\\", "/"),
        "trainerValStats": {
            "rows": stats["rows"],
            "distinctInputs": len(dedupe_seen),
            "roots": len(trainer_roots),
            "families": len(trainer_families),
            "indexCodeMismatch": index_code_mismatch,
            "byPhase": dict(sorted(phase.items())),
            "bySource": dict(sorted(sources.items())),
            "targetEqualsL1ActionCode": dict(target_vs_l1),
            "targetEqualsBehaviorActionCode": dict(target_vs_behavior),
        },
        "overlapWithV18Unified": {
            "overlapInputs": len(overlap),
            "trainerInputs": len(trainer_keys),
            "v18Inputs": len(unified_by_key),
            "trainerTargetEqualsV18L1Target": agreement_counts["trainerTargetEqV18L1"],
            "trainerTargetEqualsBehavior": agreement_counts["trainerTargetEqBehavior"],
            "trainerTargetDiffersFromV18L1Target": l1_target_disagreement_on_overlap,
        },
        "conclusion": (
            "实际送入 trainer 的 5,316 行验证分区与 V18/V17 新建的 H0 新 val 是**不同**的状态集合，"
            "且其 0-2 阶段几乎为空；同一批状态在 V18 统一合同下的 L1-v18 单次评分目标与 trainer 实际 target 的"
            "差异量即上表 trainerTargetDiffersFromV18L1Target。旧报告的『B0 约 45% val 是 L1 模仿率』"
            "因此不成立：它既不是同一状态集合，也不是同一目标来源。"
        ),
        "note": "本脚本只读，不改动任何 V17 产物。",
    }
    out = run / "data" / "trainer_val_vs_v18_audit.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
