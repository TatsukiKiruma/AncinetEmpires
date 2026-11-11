"""核对真实验证标签、分布和分数来源，保留独立证据，不改训练文件。"""

from collections import Counter
from pathlib import Path
import hashlib
import json

from v17_independent_audit import RUN, rows


def inspect(path, trainer=False):
    counts = Counter()
    sources = Counter()
    phases = Counter()
    label_sources = Counter()
    label_hash = hashlib.sha256()
    input_hash = hashlib.sha256()
    for row in rows(path):
        if trainer and row.get("partition") != "val":
            continue
        counts["rows"] += 1
        code = row["candidateActions"][row["targetActionIndex"]]["actionCode"]
        input_hash.update((row["actualInputKey"] + "\n").encode())
        label_hash.update((row["actualInputKey"] + ":" + code + "\n").encode())
        sources[str(row.get("sourcePolicy"))] += 1
        phases[str(row.get("phaseBucket"))] += 1
        label_sources[str(row.get("targetSource"))] += 1
        counts["indexCodeMismatch"] += int(code != row.get("targetActionCode"))
        for field in ("l1ActionCode", "behaviorActionCode", "teacherActionCode"):
            counts[field + "Present"] += int(row.get(field) is not None)
            counts[field + "Matches"] += int(code == row.get(field))
        scores = row.get("l1Scores") or []
        if scores:
            # 必须按动作码对齐，不能把评分列表的位置当成候选下标。
            top = max(scores, key=lambda item: item["score"])["actionCode"]
            counts["scoreRows"] += 1
            counts["scoreArgmaxMatchesL1"] += int(top == row.get("l1ActionCode"))
            counts["scoreArgmaxMatchesTarget"] += int(top == code)
    return {
        **dict(counts), "sources": dict(sources), "phases": dict(phases),
        "targetSources": dict(label_sources), "inputSequenceHash": input_hash.hexdigest(),
        "inputAndTargetSequenceHash": label_hash.hexdigest(),
    }


def main():
    report = {}
    report["fixedValidation"] = inspect(RUN / "experiments/_data/B01_val_fixed.jsonl")
    for name in ("B0", "B1", "B1e", "B0h_beh"):
        report[name] = inspect(RUN / f"experiments/_data/{name}_trainval.jsonl", trainer=True)
        print(name, json.dumps(report[name], ensure_ascii=False), flush=True)
    path = Path(__file__).with_name("v17_validation_audit_20260927.json")
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
