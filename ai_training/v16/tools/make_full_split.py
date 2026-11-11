"""V16/T16-06：把完整 train/val 合成一个数据集并生成统一 split manifest。

与 `make_core_variant.py` 的区别：那个脚本切的是**固定对照核心集**（A0/A1/A2 用），
本脚本用**全部**行（正式策略训练用，任务书 §8.1）。两套 split 的 family 都互不相交。

用法：
    <py> v16/tools/make_full_split.py --run-id v16_20260926_core --target l1
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List, Set

REPO = Path(__file__).resolve().parents[2]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="v16_20260926_core")
    parser.add_argument("--target", default="l1", choices=["l1", "s1", "behavior"])
    args = parser.parse_args()

    root = REPO / "v16" / "out" / args.run_id / "T16-04"
    out_dir = REPO / "v16" / "out" / args.run_id / "T16-06"
    out_dir.mkdir(parents=True, exist_ok=True)
    prefix = f"full_{args.target}"

    outputs: Dict[str, Dict[str, Any]] = {}
    for split, source in (("train", root / "dataset_v16_train.jsonl"), ("val", root / "dataset_v16_val.jsonl")):
        out_path = out_dir / f"{prefix}_{split}.jsonl"
        rows = 0
        labeled = 0
        families: Set[str] = set()
        hasher = hashlib.sha256()
        with source.open("r", encoding="utf-8") as handle, out_path.open("w", encoding="utf-8") as out:
            for line in handle:
                if not line.strip():
                    continue
                row = json.loads(line)
                rows += 1
                families.add(row["rootFamilyId"])
                ordered: List[str] = row["orderedActionCodes"]
                code = row.get("l1ActionCode") if args.target == "l1" else (
                    row.get("searchActionCode") if args.target == "s1" else row.get("behaviorActionCode"))
                usable = args.target != "s1" or row.get("softLossUsable") is not False
                if not code or not usable or code not in ordered:
                    row["targetActionIndex"] = 0
                    row["targetActionCode"] = None
                    row["policyLossMask"] = False
                else:
                    row["targetActionIndex"] = ordered.index(code)
                    row["targetActionCode"] = code
                    row["policyLossMask"] = True
                    labeled += 1
                row["targetSource"] = args.target
                text = json.dumps(row, ensure_ascii=False) + "\n"
                out.write(text)
                hasher.update(text.encode("utf-8"))
        outputs[split] = {
            "path": str(out_path.relative_to(REPO)).replace("\\", "/"),
            "rows": rows,
            "labeledRows": labeled,
            "families": sorted(families),
            "sha256": hasher.hexdigest(),
        }

    overlap = set(outputs["train"]["families"]) & set(outputs["val"]["families"])
    if overlap:
        raise SystemExit(f"train/val rootFamilyId 重叠 {len(overlap)} 个")

    manifest = {
        "schema": "v16_full_split_manifest_1",
        "runId": args.run_id,
        "targetSource": args.target,
        "trainRootFamilies": outputs["train"]["families"],
        "valRootFamilies": outputs["val"]["families"],
        "testRootFamilies": [],
        "note": "正式策略训练（T16-06）用全部行；family 级隔离，train/val 的 seed 命名空间不同。",
    }
    split_path = out_dir / f"{prefix}_split_manifest.json"
    split_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    combined = out_dir / f"{prefix}_all.jsonl"
    with combined.open("wb") as out:
        for split in ("train", "val"):
            out.write((out_dir / f"{prefix}_{split}.jsonl").read_bytes())

    report = {
        "schema": "v16_full_dataset_1",
        "runId": args.run_id,
        "targetSource": args.target,
        "train": {k: v for k, v in outputs["train"].items() if k != "families"},
        "val": {k: v for k, v in outputs["val"].items() if k != "families"},
        "trainFamilyCount": len(outputs["train"]["families"]),
        "valFamilyCount": len(outputs["val"]["families"]),
        "combined": str(combined.relative_to(REPO)).replace("\\", "/"),
        "splitManifest": str(split_path.relative_to(REPO)).replace("\\", "/"),
    }
    (out_dir / f"{prefix}_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
