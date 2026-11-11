"""V16/T16-05：从完整数据集里切出**固定对照核心集**并生成统一 split manifest。

核心集来自 `T16-04/core_set.json` 的 `coreSet.train[].policyInputKey` /
`coreSet.val[].policyInputKey`。本脚本只做三件事：

1. 按 `policyInputKey` 过滤出核心集行（顺序按原数据集顺序，保持可复算）；
2. 把 target 换成指定来源（复用 `make_train_variant_v16.ts` 的语义：只改
   `targetActionIndex` / `targetActionCode` / `policyLossMask`，缺标签不外推）；
3. 生成 `trainRootFamilies` / `valRootFamilies` 的 split manifest，并断言两侧 family 不相交。

用法：
    <py> v16/tools/make_core_variant.py --run-id v16_20260926_core --target l1
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List, Set

REPO = Path(__file__).resolve().parents[2]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 22)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="v16_20260926_core")
    parser.add_argument("--target", default="l1", choices=["l1", "s1", "behavior"])
    parser.add_argument("--no-gap-name", default=None, help="输出前缀，默认 core_<target>")
    args = parser.parse_args()

    root = REPO / "v16" / "out" / args.run_id / "T16-04"
    out_dir = REPO / "v16" / "out" / args.run_id / "T16-05"
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = json.loads((root / "core_set.json").read_text(encoding="utf-8"))
    train_keys: Set[str] = {entry["policyInputKey"] for entry in manifest["coreSet"]["train"]}
    val_keys: Set[str] = {entry["policyInputKey"] for entry in manifest["coreSet"]["val"]}

    prefix = args.no_gap_name or f"core_{args.target}"
    outputs: Dict[str, Dict[str, Any]] = {}

    for split, keys, source in (
        ("train", train_keys, root / "dataset_v16_train.jsonl"),
        ("val", val_keys, root / "dataset_v16_val.jsonl"),
    ):
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
                if row.get("policyInputKey") not in keys:
                    continue
                rows += 1
                families.add(row["rootFamilyId"])
                ordered: List[str] = row["orderedActionCodes"]
                if args.target == "l1":
                    code = row.get("l1ActionCode")
                elif args.target == "s1":
                    code = row.get("searchActionCode")
                else:
                    code = row.get("behaviorActionCode")
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
            "labelRate": (labeled / rows) if rows else None,
            "families": sorted(families),
            "sha256": hasher.hexdigest(),
            "fileSha256": sha256_file(out_path),
        }

    overlap = set(outputs["train"]["families"]) & set(outputs["val"]["families"])
    if overlap:
        raise SystemExit(f"train/val rootFamilyId 重叠 {len(overlap)} 个：{sorted(overlap)[:5]}")

    split_manifest = {
        "schema": "v16_core_split_manifest_1",
        "runId": args.run_id,
        "targetSource": args.target,
        "trainRootFamilies": outputs["train"]["families"],
        "valRootFamilies": outputs["val"]["families"],
        "testRootFamilies": [],
        "note": "对照核心集：A0/A1/A2 与后续 PV 对照必须使用同一份 manifest，只允许变一个因素。",
    }
    split_path = out_dir / f"{prefix}_split_manifest.json"
    split_path.write_text(json.dumps(split_manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    combined = out_dir / f"{prefix}_all.jsonl"
    with combined.open("wb") as out:
        for split in ("train", "val"):
            out.write((out_dir / f"{prefix}_{split}.jsonl").read_bytes())

    report = {
        "schema": "v16_core_variant_1",
        "runId": args.run_id,
        "targetSource": args.target,
        "splits": outputs,
        "combined": {
            "path": str(combined.relative_to(REPO)).replace("\\", "/"),
            "rows": outputs["train"]["rows"] + outputs["val"]["rows"],
            "sha256": sha256_file(combined),
        },
        "splitManifest": str(split_path.relative_to(REPO)).replace("\\", "/"),
        "splitManifestSha256": sha256_file(split_path),
    }
    (out_dir / f"{prefix}_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "prefix": prefix,
        "trainRows": outputs["train"]["rows"],
        "trainFamilies": len(outputs["train"]["families"]),
        "trainLabelRate": outputs["train"]["labelRate"],
        "valRows": outputs["val"]["rows"],
        "valFamilies": len(outputs["val"]["families"]),
        "valLabelRate": outputs["val"]["labelRate"],
        "combined": report["combined"]["path"],
        "splitManifest": report["splitManifest"],
        "familyOverlap": len(overlap),
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
