"""V18/T18-01：对「val 输入出现在 train 里」的说法做**原始数据抽查**，避免误判。

只比 key 会误伤，只比 `stateHash` 也会误判：`stateHash` 覆盖完整原始状态（含不进入网络输入的字段），
而网络输入身份 `actualInputKey` 只覆盖 float32 空间张量 + 全候选语义 + 全局特征。
两个不同的原始状态完全可以有同一个网络输入。

因此本脚本对抽查到的共享 key，**逐项比对网络输入分量**：
`spatialTensor`、`candidateActions`（含 actionCode 与 semantics）、`globalFeatures`、
`actualInputFloat32Hash`。只有当这些全部相同，才认定「同一个网络输入」，共享成立。

用法：
    python v18/tools/spotcheck_shared_inputs.py --run-id run_20260927_v18_01 --samples 5
"""
from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V17_RUN = ROOT / "v17" / "out" / "v17_20260926_r2"
KEY_RE = re.compile(r'"actualInputKey"\s*:\s*"([0-9a-f]{64})"')
MAX_SHARED = 400


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    parser.add_argument("--samples", type=int, default=5)
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id

    train_dir = V17_RUN / "data" / "new_train" / "encoded"
    val_path = V17_RUN / "data" / "new_val" / "encoded" / "val.h0.allmaps.jsonl"

    # 1) val 侧只先取键（不保留张量，避免把 260MB 展开进内存）
    val_keys: set[str] = set()
    with val_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            match = KEY_RE.search(line)
            if match:
                val_keys.add(match.group(1))

    # 2) 扫 train，收集共享键与其原始行身份
    train_side: dict[str, dict] = {}
    scanned = 0
    phase_pairs_raw = collections.Counter()
    for path in sorted(train_dir.glob("*.jsonl")):
        if path.stat().st_size == 0:
            continue
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                scanned += 1
                match = KEY_RE.search(line)
                if not match:
                    continue
                key = match.group(1)
                if key not in val_keys or key in train_side:
                    continue
                row = json.loads(line)
                train_side[key] = {
                    "sampleId": row["sampleId"],
                    "stateHash": row["stateHash"],
                    "phaseBucket": row["phaseBucket"],
                    "mapName": row["mapName"],
                    "rootId": row["rootId"],
                    "split": row["split"],
                    "actualInputFloat32Hash": row["actualInputFloat32Hash"],
                    "spatialTensor": row["spatialTensor"],
                    "candidateActions": row["candidateActions"],
                    "globalFeatures": row["globalFeatures"],
                    "file": path.name,
                }
                if len(train_side) >= MAX_SHARED:
                    break
        if len(train_side) >= MAX_SHARED:
            break

    # 3) 回到 val，只解析被抽中的那些行
    val_side: dict[str, dict] = {}
    with val_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            match = KEY_RE.search(line)
            if not match or match.group(1) not in train_side:
                continue
            row = json.loads(line)
            key = match.group(1)
            if key in val_side:
                continue
            val_side[key] = {
                "sampleId": row["sampleId"],
                "stateHash": row["stateHash"],
                "phaseBucket": row["phaseBucket"],
                "mapName": row["mapName"],
                "rootId": row["rootId"],
                "split": row["split"],
                "actualInputFloat32Hash": row["actualInputFloat32Hash"],
                "spatialTensor": row["spatialTensor"],
                "candidateActions": row["candidateActions"],
                "globalFeatures": row["globalFeatures"],
            }

    def cand_sig(actions):
        return [(c["actionCode"], tuple(c.get("semantics") or [])) for c in actions]

    checks = collections.Counter()
    for key, train_row in train_side.items():
        val_row = val_side.get(key)
        if val_row is None:
            checks["missingValRow"] += 1
            continue
        checks["total"] += 1
        checks["identicalStateHash"] += int(train_row["stateHash"] == val_row["stateHash"])
        checks["identicalActualInputFloat32Hash"] += int(
            train_row["actualInputFloat32Hash"] == val_row["actualInputFloat32Hash"]
        )
        checks["identicalSpatialTensor"] += int(train_row["spatialTensor"] == val_row["spatialTensor"])
        checks["identicalCandidateSemantics"] += int(
            cand_sig(train_row["candidateActions"]) == cand_sig(val_row["candidateActions"])
        )
        checks["identicalGlobalFeatures"] += int(train_row["globalFeatures"] == val_row["globalFeatures"])
        checks["samePhase"] += int(train_row["phaseBucket"] == val_row["phaseBucket"])
        phase_pairs_raw[f"{train_row['phaseBucket']}->{val_row['phaseBucket']}"] += 1

    samples = []
    for key in list(train_side)[: args.samples]:
        train_row = train_side[key]
        val_row = val_side.get(key)
        samples.append(
            {
                "key": key,
                "trainSampleId": train_row["sampleId"],
                "valSampleId": val_row["sampleId"] if val_row else None,
                "phase": train_row["phaseBucket"],
                "trainStateHash16": train_row["stateHash"][:16],
                "valStateHash16": val_row["stateHash"][:16] if val_row else None,
                "spatialEqual": val_row is not None and train_row["spatialTensor"] == val_row["spatialTensor"],
                "candidatesEqual": val_row is not None
                and cand_sig(train_row["candidateActions"]) == cand_sig(val_row["candidateActions"]),
                "globalsEqual": val_row is not None and train_row["globalFeatures"] == val_row["globalFeatures"],
                "float32Equal": val_row is not None
                and train_row["actualInputFloat32Hash"] == val_row["actualInputFloat32Hash"],
            }
        )

    all_same_input = (
        checks["total"] > 0
        and checks["identicalActualInputFloat32Hash"] == checks["total"]
        and checks["identicalSpatialTensor"] == checks["total"]
        and checks["identicalGlobalFeatures"] == checks["total"]
        and checks["identicalCandidateSemantics"] == checks["total"]
    )
    report = {
        "schema": "v18_shared_input_spotcheck_1",
        "runId": args.run_id,
        "trainLinesScanned": scanned,
        "sampledSharedKeys": checks["total"],
        "checks": dict(checks),
        "phasePairs": dict(sorted(phase_pairs_raw.items())),
        "samples": samples,
        "conclusion": (
            "抽中的共享 key 在 train 与 val 两侧的 float32 输入哈希、空间张量、候选语义与全局特征"
            "全部相同 ⇒ 它们是**同一个网络输入**，共享成立；而原始 stateHash 大量不同，"
            "说明 stateHash 覆盖了不进入网络输入的字段，因此**不能用 stateHash 判定输入是否见过**。"
            if all_same_input
            else "抽查未能确认共享输入为同一网络输入，需进一步检查编码口径。"
        ),
    }
    out = run / "data" / "shared_input_spotcheck.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "trainLinesScanned": scanned,
        "sampledSharedKeys": checks["total"],
        "checks": report["checks"],
        "phasePairs": report["phasePairs"],
        "conclusion": report["conclusion"],
    }, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
