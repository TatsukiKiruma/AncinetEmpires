"""V18/T18-01：独立复核「训练输入 ∩ 验证输入 = 0」，并分离共享开局回归集。

V17 报告声称新 train 与新 val 的实际输入交集为 0。本脚本**不引用该结论**，
而是直接从编码后的训练文件里重新抽取输入键，再做交集。

同时回答任务书要求的两件事：
1. 哪些验证状态其实与训练共享（它们只能用于回归，不能冒充独立泛化）；
2. 开局（0-2 阶段）的未见输入到底有多少。

抽取方式：逐行正则取 `actualInputKey` 与 `phaseBucket`，不做完整 JSON 解析（1.2GB 级文件）。
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V17_RUN = ROOT / "v17" / "out" / "v17_20260926_r2"

KEY_RE = re.compile(r'"actualInputKey"\s*:\s*"([0-9a-f]{64})"')
PHASE_RE = re.compile(r'"phaseBucket"\s*:\s*"([^"]+)"')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id

    train_dir = V17_RUN / "data" / "new_train" / "encoded"
    train_files = sorted(p for p in train_dir.glob("*.jsonl") if p.stat().st_size > 0)
    val_labels = run / "data" / "val_dual_teacher.labels.jsonl"

    # 1) 训练输入键（按阶段分开记，用于开局共享判定）
    train_keys: set[str] = set()
    train_opening_keys: set[str] = set()
    stats = collections.Counter()
    started = time.time()
    for path in train_files:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                stats["trainLines"] += 1
                match = KEY_RE.search(line)
                if not match:
                    stats["trainLinesWithoutKey"] += 1
                    continue
                key = match.group(1)
                train_keys.add(key)
                phase = PHASE_RE.search(line)
                if phase and phase.group(1) == "0-2":
                    train_opening_keys.add(key)
        print(f"[train-keys] {path.name} 累计不同键 {len(train_keys)}（{time.time() - started:.0f}s）", flush=True)

    # 2) 验证输入键与阶段
    val_rows = 0
    val_keys: set[str] = set()
    val_opening_keys: set[str] = set()
    val_phase_of: dict[str, str] = {}
    with val_labels.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if not text:
                continue
            row = json.loads(text)
            val_rows += 1
            key = row["policyInputKey"]
            val_keys.add(key)
            val_phase_of[key] = row["phaseBucket"]
            if row["phaseBucket"] == "0-2":
                val_opening_keys.add(key)

    shared = val_keys & train_keys
    shared_opening = val_opening_keys & train_keys
    unseen = val_keys - train_keys
    unseen_opening = val_opening_keys - train_opening_keys

    report = {
        "schema": "v18_train_val_separation_1",
        "runId": args.run_id,
        "trainSourceFiles": [str(p.relative_to(ROOT)).replace("\\", "/") for p in train_files],
        "counts": {
            "trainLines": stats["trainLines"],
            "trainLinesWithoutKey": stats["trainLinesWithoutKey"],
            "trainDistinctInputs": len(train_keys),
            "trainOpeningDistinctInputs": len(train_opening_keys),
            "valRows": val_rows,
            "valDistinctInputs": len(val_keys),
            "valOpeningDistinctInputs": len(val_opening_keys),
        },
        "separation": {
            "valMinusTrainDistinctInputs": len(unseen),
            "valIntersectTrainDistinctInputs": len(shared),
            "valOpeningMinusTrainOpeningDistinctInputs": len(unseen_opening),
            "valOpeningIntersectTrainOpeningDistinctInputs": len(shared_opening),
            "intersectionZero": len(shared) == 0,
        },
        "independenceClasses": {
            "UNSEEN_INPUT_VALIDATION": {
                "distinctInputs": len(unseen),
                "openingDistinctInputs": len(unseen_opening),
                "meaning": "与训练实际输入无交集，可用于未见输入验证。",
            },
            "SHARED_OPENING_REGRESSION": {
                "distinctInputs": len(shared),
                "openingDistinctInputs": len(shared_opening),
                "meaning": "与训练共享实际输入的验证状态；只能用于回归，不能冒充独立泛化。",
            },
        },
        "verdict": {
            "v17ClaimTrainValIntersectionZeroReproduced": len(shared) == 0,
            "openingCoverageInUnseenSet": len(unseen_opening),
            "openingCoverageMeetsSuggestion100": len(unseen_opening) >= 100,
        },
        "elapsedSeconds": round(time.time() - started, 1),
        "note": "本脚本独立重算，不引用 V17 报告的交集结论。",
    }
    out = run / "data" / "train_val_separation.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
