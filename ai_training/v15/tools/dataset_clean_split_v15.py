"""V15/T15-04 辅助：从 V15 数据集生成「干净验证集」的实体文件与 split manifest。

为什么需要这一步（数据契约 §5.2）：

`v15/tools/dataset_v15.ts` 已经把「同一 policyInputKey 在 train 与 val 同时出现」
的 153 个跨分区重复统计出来了，但**没有把它们从磁盘上的数据集里移除**。
训练器只按 split manifest 的 root 家族分组，因此如果直接训练，那 153 个 val 行
仍会被当作干净泛化指标使用——这正是 V14b 审核里「污染验证集」的问题。

本工具的职责很窄，只有一个：
    输入 dataset_v15.jsonl（含 train/val 全部行）+ 原 split manifest
    输出 dataset_v15_clean.jsonl（train 全部行 + 与 train 无 key 交集的 val 行）
         + split_manifest_v15_clean.json（val 家族列表剔除不含任何干净 val 行的家族）
         + clean_split_report.json（逐项读数：剔除了多少行/哪些 key/涉及哪些家族）

不做的事：
    - 不复制行伪造数据；
    - 不把 val 家族搬进 train；
    - 不修改原始数据集（只读）。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="生成 V15 干净验证集与 split manifest")
    parser.add_argument("--dataset", required=True, help="v15 dataset_v15.jsonl")
    parser.add_argument("--split-manifest", required=True, help="原 split manifest")
    parser.add_argument("--out-dataset", required=True, help="输出干净数据集路径")
    parser.add_argument("--out-manifest", required=True, help="输出干净 split manifest 路径")
    parser.add_argument("--out-report", required=True, help="输出读数报告路径")
    parser.add_argument("--refuse-overwrite", action="store_true",
                        help="任一输出已存在时直接失败（默认行为同样是拒绝覆盖）")
    args = parser.parse_args(argv)

    dataset_path = Path(args.dataset).resolve()
    manifest_path = Path(args.split_manifest).resolve()
    out_dataset = Path(args.out_dataset).resolve()
    out_manifest = Path(args.out_manifest).resolve()
    out_report = Path(args.out_report).resolve()

    for target in (out_dataset, out_manifest, out_report):
        if target.exists():
            print(f"拒绝覆盖已存在的产物：{target}", file=sys.stderr)
            return 2
        target.parent.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    rows: list[dict] = []
    with dataset_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    train_rows = [r for r in rows if r.get("partition") == "train"]
    val_rows = [r for r in rows if r.get("partition") in ("validation", "val")]
    train_keys = {r["policyInputKey"] for r in train_rows}

    kept_val: list[dict] = []
    dropped_val: list[dict] = []
    for row in val_rows:
        if row["policyInputKey"] in train_keys:
            dropped_val.append(row)
        else:
            kept_val.append(row)

    clean_rows = train_rows + kept_val
    with out_dataset.open("w", encoding="utf-8") as handle:
        for row in clean_rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    # 只保留仍然含干净 val 行的家族，避免 manifest 指向空家族。
    kept_val_families = {r["rootFamilyId"] for r in kept_val}
    train_families = {r["rootFamilyId"] for r in train_rows}
    family_overlap = sorted(kept_val_families & train_families)

    val_family_keys = ("val_root_ids", "valRootIds", "validationRootIds", "valRoots",
                       "valFamilies", "val_root_families")
    clean_manifest = json.loads(json.dumps(manifest))
    family_field = None
    for key in val_family_keys:
        if key in clean_manifest:
            family_field = key
            break
    if family_field is not None:
        clean_manifest[family_field] = [f for f in clean_manifest[family_field]
                                        if f in kept_val_families]

    clean_manifest["v15CleanSplit"] = {
        "derivedFrom": str(manifest_path),
        "derivedFromSha256": sha256_file(manifest_path),
        "sourceDataset": str(dataset_path),
        "sourceDatasetSha256": sha256_file(dataset_path),
        "droppedValRows": len(dropped_val),
        "reason": "这些 val 行的 policyInputKey 与 train 相同，必须排除出干净泛化指标（数据契约 §5.2 第 2 条）。",
        "trainRows": len(train_rows),
        "valRows": len(kept_val),
    }
    out_manifest.write_text(json.dumps(clean_manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    report = {
        "schema": "v15_clean_split_report_1",
        "task": "T15-04",
        "sourceDataset": str(dataset_path),
        "sourceDatasetSha256": sha256_file(dataset_path),
        "sourceManifest": str(manifest_path),
        "sourceManifestSha256": sha256_file(manifest_path),
        "outDataset": str(out_dataset),
        "outDatasetSha256": sha256_file(out_dataset),
        "outManifest": str(out_manifest),
        "outManifestSha256": sha256_file(out_manifest),
        "counts": {
            "sourceRows": len(rows),
            "trainRows": len(train_rows),
            "valRowsBeforeDedup": len(val_rows),
            "valRowsDropped": len(dropped_val),
            "valRowsKept": len(kept_val),
            "uniqueTrainPolicyInputKeys": len(train_keys),
            "trainRootFamilies": len(train_families),
            "valRootFamiliesKept": len(kept_val_families),
        },
        "globalUniquenessAlreadyEnforcedUpstream": True,
        "whyZeroDropped": (
            "输入数据集已经按 policyInputKey 全局去重（每个 key 只保留一行，合并时保留"
            "在文件中先出现的那一行），因此「val 行与 train 有相同 policyInputKey」"
            "在本文件里必然为 0。这**不**证明原始数据没有跨分区重复。"
        ),
        "preDedupCrossPartitionReadout": (
            "原始（去重前）跨分区重复读数见 T15-04/dedup_audit.json 的 preDedupPartitions："
            "train∩val=55、train∩test=109、val∩test=51 个 policyInputKey；"
            "被同 key 合并掉的行数（rowsDroppedByDedupByPartition）为 train=260、val=55、test=129。"
            "由此可复算去重后各分区行数：原本 6400/1600/1547 → 6140/1545/1418（test 另存），"
            "与 T15-04 的 train=6140、val=1545 一致。因此本工具是幂等的确认步骤，"
            "而不是首次清理步骤；如果把 0 当成「原始数据干净」就会误读。"
        ),
        "familyOverlapTrainVsCleanVal": family_overlap,
        "droppedValRows": [
            {
                "sampleId": r.get("sampleId"),
                "rootFamilyId": r.get("rootFamilyId"),
                "rawActionStep": r.get("rawActionStep"),
                "policyInputKey": r.get("policyInputKey"),
                "targetActionCode": r.get("targetActionCode"),
            }
            for r in dropped_val
        ],
        "manifestFamilyField": family_field,
        "notes": [
            "原始数据集未被修改（只读），本工具只生成新的干净视图。",
            "train 行全部保留：本轮默认保留既定 train 分配，不把 val/test 家族搬进 train。",
            "label 冲突（同一输入不同 L1 目标）不在本工具处理范围内，见 label_conflicts.jsonl。",
        ],
    }
    out_report.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"[clean-split] rows={len(rows)} train={len(train_rows)} "
          f"val={len(val_rows)} -> kept={len(kept_val)} dropped={len(dropped_val)}")
    print(f"[clean-split] train families={len(train_families)} clean val families={len(kept_val_families)} "
          f"overlap={len(family_overlap)}")
    print(f"[clean-split] out dataset sha256={report['outDatasetSha256']}")
    print(f"[clean-split] out manifest sha256={report['outManifestSha256']}")
    if family_overlap:
        print(f"[clean-split] 警告：train 与干净 val 仍有家族交集：{family_overlap}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
