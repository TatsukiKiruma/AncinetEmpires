"""V17/T17-05：把任意 train/val 分片整形为 trainer 可消费的单一数据集 + 真实 family manifest。

与 `make_v17_trainer_input.py`（T17-02 用的固定版本）的区别：本脚本接受**任意文件列表**，
因此 B0 / B1 / B2 三次对照可以用同一套 train/val 输入、只换标签列（标签列由
`make_train_variant_v17.ts` 在整形**之后**替换，行顺序逐行不变）。

整形内容（显式、可复核，不改 trainer）：
  1. 先写全部 train 行，再写全部 val 行；
  2. `rootFamilyId` ← `trueFamilyId`（旧值保留在 `v16RootFamilyId`）；
  3. `partition` ← "train"/"val"；
  4. 输入级去重（`actualInputKey`，train 优先）；val 行若与任何 train 输入相同 → 剔除并写证据；
  5. 输出 manifest 与 provenance：源文件 SHA256、行数、family 数、跨分区 family 交集（必须 0）、
     val∩train 输入交集（必须 0）。

用法（真实命令）：
  & 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe' `
    v17/tools/make_v17_pool_trainer_input.py `
    --train v17/out/v17_20260926_r2/data/legacy_train_dedup.jsonl `
    --train v17/out/v17_20260926_r2/data/new_train/dataset_v17_newtrain.jsonl `
    --val v17/out/v17_20260926_r2/data/legacy_val_clean.jsonl `
    --val v17/out/v17_20260926_r2/data/new_val/dataset_v17_newval.jsonl `
    --out v17/out/v17_20260926_r2/experiments/_data/pool_v17_trainval.jsonl `
    --manifest-out v17/out/v17_20260926_r2/experiments/_data/pool_v17_split_manifest.json `
    --provenance v17/out/v17_20260926_r2/experiments/_data/pool_v17_provenance.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def resolve(spec: str) -> Path:
    p = Path(spec)
    return p if p.is_absolute() else (REPO / p)


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def rows(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def family_of(row: dict) -> str:
    fam = row.get("trueFamilyId")
    if fam:
        return str(fam)
    root = str(row.get("rootFamilyId") or "")
    parts = root.split("|")
    if len(parts) >= 3:
        tail = parts[2].split("#")
        if len(tail) >= 2:
            return f"{tail[0]}#{row.get('initializationPolicyId')}#{tail[1]}"
    return root


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", action="append", required=True)
    parser.add_argument("--val", action="append", default=[])
    parser.add_argument("--out", required=True)
    parser.add_argument("--manifest-out", required=True)
    parser.add_argument("--provenance", required=True)
    parser.add_argument("--max-rows-per-family", type=int, default=None,
                        help="可选：每 family 最多保留多少行（默认不截断，如实报占比）")
    args = parser.parse_args()

    out_path = resolve(args.out)
    manifest_path = resolve(args.manifest_out)
    prov_path = resolve(args.provenance)
    for p in (out_path, manifest_path, prov_path):
        p.parent.mkdir(parents=True, exist_ok=True)

    started = time.time()
    seen_keys: dict[str, str] = {}
    stats = {
        "train": Counter(), "val": Counter(),
    }
    dropped = {"train": Counter(), "val": Counter()}
    train_families: Counter = Counter()
    val_families: Counter = Counter()
    family_kept = Counter()
    val_overlap_with_train = 0
    dup_within = 0
    missing_key = 0
    sources: list[dict] = []

    with out_path.open("w", encoding="utf-8") as out, \
            (out_path.parent / f"{out_path.stem}.val_train_overlap.jsonl").open("w", encoding="utf-8") as overlap_handle, \
            (out_path.parent / f"{out_path.stem}.duplicates.jsonl").open("w", encoding="utf-8") as dup_handle:

        for partition, specs in (("train", args.train), ("val", args.val)):
            for spec in specs:
                path = resolve(spec)
                if not path.exists():
                    raise SystemExit(f"[pool-input] 不存在：{path}")
                sources.append({"partition": partition, "path": str(path).replace("\\", "/"),
                                "bytes": path.stat().st_size, "sha256": sha256_file(path)})
                for row in rows(path):
                    key = row.get("actualInputKey")
                    if not key:
                        missing_key += 1
                        continue
                    fam = family_of(row)
                    if partition == "val" and key in seen_keys:
                        val_overlap_with_train += 1
                        dropped["val"]["same-input-as-train"] += 1
                        overlap_handle.write(json.dumps({
                            "actualInputKey": key, "sampleId": row.get("sampleId"),
                            "trainSampleId": seen_keys[key], "family": fam,
                        }, ensure_ascii=False) + "\n")
                        continue
                    if key in seen_keys:
                        dup_within += 1
                        dropped[partition]["duplicate-input"] += 1
                        dup_handle.write(json.dumps({
                            "actualInputKey": key, "sampleId": row.get("sampleId"),
                            "keptSampleId": seen_keys[key], "partition": partition,
                        }, ensure_ascii=False) + "\n")
                        continue
                    if args.max_rows_per_family is not None and family_kept[fam] >= args.max_rows_per_family:
                        dropped[partition]["family-cap"] += 1
                        continue
                    seen_keys[key] = str(row.get("sampleId"))
                    family_kept[fam] += 1

                    out_row = dict(row)
                    out_row["v16RootFamilyId"] = row.get("rootFamilyId")
                    out_row["rootFamilyId"] = fam
                    out_row["trueFamilyId"] = fam
                    out_row["partition"] = partition
                    out.write(json.dumps(out_row, ensure_ascii=False) + "\n")

                    stats[partition]["rows"] += 1
                    stats[partition][f"source:{row.get('sourcePolicy')}"] += 1
                    stats[partition][f"map:{row.get('mapName')}"] += 1
                    stats[partition][f"value:{row.get('valueTarget')}"] += 1
                    if row.get("l1ActionCode"):
                        stats[partition]["l1Labeled"] += 1
                    if row.get("teacherActionCode"):
                        stats[partition]["teacherLabeled"] += 1
                    if partition == "train":
                        train_families[fam] += 1
                    else:
                        val_families[fam] += 1

    shared = set(train_families) & set(val_families)
    train_total = sum(train_families.values())
    val_total = sum(val_families.values())
    family_share = {
        "trainMaxShare": round(max(train_families.values()) / train_total, 4) if train_total else None,
        "trainMaxFamilyRows": max(train_families.values()) if train_families else 0,
        "trainFamilyCount": len(train_families),
        "valMaxShare": round(max(val_families.values()) / val_total, 4) if val_total else None,
        "valFamilyCount": len(val_families),
    }

    manifest = {
        "schema": "v17_pool_split_manifest_1",
        "familyDefinition": "mapName#initializationPolicyId#rootSeed (no split/source/seat)",
        "trainRootFamilies": sorted(train_families),
        "valRootFamilies": sorted(val_families),
        "testRootFamilies": [],
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    provenance = {
        "schema": "v17_pool_trainer_input_provenance_1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sources": sources,
        "out": str(out_path).replace("\\", "/"),
        "outSha256": sha256_file(out_path),
        "outBytes": out_path.stat().st_size,
        "rows": {k: dict(v) for k, v in stats.items()},
        "dropped": {k: dict(v) for k, v in dropped.items()},
        "duplicatesWithinPartition": dup_within,
        "valRowsRejectedSameInputAsTrain": val_overlap_with_train,
        "rowsWithoutActualInputKey": missing_key,
        "families": {
            "train": len(train_families), "val": len(val_families),
            "shared": len(shared), "sharedExamples": sorted(shared)[:5],
            **family_share,
        },
        "gates": {
            # 中文：交集不是"测出来恰好为 0"，而是**由构造保证**：任何 val 行只要其 key 已出现在
            # train（或之前的 val）里就被剔除并写入证据文件。因此这里报两个数：
            # 被剔除的行数（原始重叠）与剔除后剩余交集（恒为 0）。
            "preRejectionValTrainInputOverlapRows": val_overlap_with_train,
            "valInputIntersectionAfterRejection": 0,
            "valInputIntersectionIsZeroByConstruction": True,
            "familyIntersectionIsZero": len(shared) == 0,
            "trainUniqueInputs": train_total,
            "valUniqueInputs": val_total,
        },
        "wallSeconds": round(time.time() - started, 1),
        "discipline": [
            "val 与 train 同实际输入的行被剔除并留证据，不静默保留。",
            "rootFamilyId 换成真实 family；旧值保留在 v16RootFamilyId。",
            "行顺序：全部 train（按输入顺序）再全部 val；变体工具只改标签列，不改顺序。",
        ],
    }
    prov_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(provenance, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())