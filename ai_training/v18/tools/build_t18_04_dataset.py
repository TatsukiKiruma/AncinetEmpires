"""V18/T18-04 第 1 波：受约束更新的**同数据对照**数据集。

设计（预登记见 reports/T18_04_report.md）：

- **targeted（重点覆盖）**：学生训练轨迹里落在「平衡局面」区域的状态
  （阶段 0-2/3-7、双方存活单位数之差 ≤1、双方都还有指挥官）。
  这些状态由 `extract_balanced_keys_v18.ts` 用与 S3/S4 相同的判据挑出，
  再按 `stateHash|subjectPlayerId` 从已编码的学生数据里取行。
- **replay（回放）**：从既有 B0 训练池里取一部分保留，防止只学新区域而遗忘。
- **val（验证）**：**V18 修正后的未见输入验证集**——
  从编码 val 取行，并把 `targetActionIndex/targetActionCode` 覆盖为 L1-v18 单次评分标签，
  只保留 `UNSEEN_INPUT_VALIDATION` 的行。

三部分写进一个数据集文件 + 一个显式 split manifest，保证 trainer 不会丢行、也不会
把 targeted 的家族混进 val。

用法：
    python v18/tools/build_t18_04_dataset.py --run-id run_20260927_v18_01 --replay-rows 4000
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


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if text:
                yield json.loads(text)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    parser.add_argument("--replay-rows", type=int, default=4000)
    parser.add_argument("--replay-seed", type=int, default=2026099931)
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id
    out_dir = run / "data" / "t18_04"
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1) 平衡状态键
    keys_path = run / "data" / "t18_04_balanced_keys.txt"
    balanced = set(keys_path.read_text(encoding="utf-8").split())
    print(f"[T18-04] 平衡状态键 {len(balanced)}")

    # 2) targeted：从已编码的学生训练数据里取行
    targeted_path = out_dir / "T18_04_targeted.jsonl"
    targeted = 0
    targeted_families: set[str] = set()
    targeted_phase = collections.Counter()
    targeted_by_map = collections.Counter()
    with targeted_path.open("w", encoding="utf-8") as sink:
        for m in range(5):
            path = V17_RUN / "data" / "new_train" / "encoded" / f"train.student.m{m}.jsonl"
            if not path.is_file():
                continue
            for row in iter_jsonl(path):
                key = f"{row['stateHash']}|{row['subjectPlayerId']}"
                if key not in balanced:
                    continue
                # trainer 读的是 targetActionIndex；这里保持既有 L1 标签
                # （V17 复核确认训练分区 target 与 l1ActionCode 100% 一致 = H0 的动作）。
                row["split"] = "train"
                row["_t18_04_partition"] = "targeted"
                sink.write(json.dumps(row, ensure_ascii=False) + "\n")
                targeted += 1
                targeted_families.add(str(row.get("trueFamilyId")))
                targeted_phase[str(row.get("phaseBucket"))] += 1
                targeted_by_map[str(row.get("mapName"))] += 1
    print(f"[T18-04] targeted 行 {targeted}（家族 {len(targeted_families)}）")

    # 3) replay：从 B0 训练池抽固定数量
    replay_path = out_dir / "T18_04_replay.jsonl"
    replay = 0
    replay_families: set[str] = set()
    pool = V17_RUN / "experiments" / "_data" / "B0_trainval.jsonl"
    stride = max(1, 12021 // max(1, args.replay_rows))
    with replay_path.open("w", encoding="utf-8") as sink:
        idx = 0
        for row in iter_jsonl(pool):
            if row.get("split") != "train":
                continue
            if idx % stride != 0:
                idx += 1
                continue
            idx += 1
            if replay >= args.replay_rows:
                break
            row["split"] = "train"
            row["_t18_04_partition"] = "replay"
            sink.write(json.dumps(row, ensure_ascii=False) + "\n")
            replay += 1
            replay_families.add(str(row.get("trueFamilyId")))
    print(f"[T18-04] replay 行 {replay}（家族 {len(replay_families)}，stride={stride}）")

    # 4) val：编码 val + V18 修正标签
    labels_path = run / "data" / "val_dual_teacher.labels.jsonl"
    labels = {row["policyInputKey"]: row for row in iter_jsonl(labels_path)}
    val_path = out_dir / "T18_04_val.jsonl"
    val_rows = 0
    val_families: set[str] = set()
    val_index_mismatch = 0
    with val_path.open("w", encoding="utf-8") as sink:
        for row in iter_jsonl(V17_RUN / "data" / "new_val" / "encoded" / "val.h0.allmaps.jsonl"):
            key = row.get("actualInputKey") or row.get("policyInputKey")
            label = labels.get(key)
            if label is None or label.get("independenceClass") != "UNSEEN_INPUT_VALIDATION":
                continue
            target_index = label["targets"]["L1_V18"]["targetActionIndex"]
            target_code = label["targets"]["L1_V18"]["targetActionCode"]
            codes = [c["actionCode"] for c in row["candidateActions"]]
            if target_index is None or codes[target_index] != target_code:
                val_index_mismatch += 1
                continue
            row["split"] = "val"
            row["targetActionIndex"] = int(target_index)
            row["targetActionCode"] = target_code
            row["targetSource"] = "L1_V18_SINGLE_PASS"
            row["_t18_04_partition"] = "val_unseen"
            sink.write(json.dumps(row, ensure_ascii=False) + "\n")
            val_rows += 1
            val_families.add(str(row.get("trueFamilyId")))
    print(f"[T18-04] val 行 {val_rows}（家族 {len(val_families)}，索引不一致剔除 {val_index_mismatch}）")

    # 5) 合并 + split manifest
    merged = out_dir / "T18_04_wave1_trainval.jsonl"
    with merged.open("w", encoding="utf-8") as sink:
        for part in (targeted_path, replay_path, val_path):
            sink.write(part.read_text(encoding="utf-8"))
    manifest = {
        "schema": "v18_t18_04_split_manifest_1",
        "familyDefinition": "mapName#initializationPolicyId#rootSeed（不含 split/source/seat）",
        "trainRootFamilies": sorted(targeted_families | replay_families),
        "valRootFamilies": sorted(val_families),
        "testRootFamilies": [],
    }
    manifest_path = out_dir / "T18_04_split_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report = {
        "schema": "v18_t18_04_dataset_1",
        "runId": args.run_id,
        "balancedKeys": len(balanced),
        "targetedRows": targeted,
        "targetedFamilies": len(targeted_families),
        "targetedByPhase": dict(sorted(targeted_phase.items())),
        "targetedByMap": dict(sorted(targeted_by_map.items())),
        "replayRows": replay,
        "replayFamilies": len(replay_families),
        "replayStride": stride,
        "valRows": val_rows,
        "valFamilies": len(val_families),
        "valIndexMismatchDropped": val_index_mismatch,
        "valTargetSource": "L1_V18_SINGLE_PASS（V18 修正后的单次评分标签）",
        "trainValFamilyOverlap": sorted((targeted_families | replay_families) & val_families),
        "dataset": str(merged.relative_to(ROOT)).replace("\\", "/"),
        "manifest": str(manifest_path.relative_to(ROOT)).replace("\\", "/"),
        "notes": [
            "targeted 用与 S3/S4 完全相同的平衡判据挑选，保证「找信号的位置」与「训练的位置」一致。",
            "replay 保留既有训练池的一部分，防止只学新区域而遗忘。",
            "val 是 V18 修正后的未见输入验证集，标签覆盖为 L1-v18 单次评分结果。",
            "train/val 的家族必须不重叠；重叠列表写进 trainValFamilyOverlap，非空即视为构建失败。",
        ],
    }
    (out_dir / "T18_04_dataset_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({k: v for k, v in report.items() if k != "notes"}, ensure_ascii=False, indent=2))
    if report["trainValFamilyOverlap"]:
        print("ERROR: train/val family overlap is not empty", file=__import__("sys").stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
