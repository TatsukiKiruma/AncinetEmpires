"""V14/T14-04：为 tiny-fit 生成自洽的输入（数据集 + 训练/验证 split manifest）。

为什么需要它：
V14 训练器拒绝「验证集为空」（V11/T11-03 明确不再从训练尾部偷切验证集），
而上一轮的 `tiny_split_manifest.json` 指向的占位验证 root 在当前 tiny 数据集里
已经不存在（数据集后来被重写，哈希不同），于是新一轮无法复现该运行的输入身份。
与其手工拼一个 manifest，不如让脚本**从数据集本身**推导：

- 按 rootFamilyId 分组，取样本数最少、且不与其他组重叠的一组作为 val 占位；
- 其余全部进 train（记忆诊断要求 128 个状态全部被优化）；
- 写出 `tiny_fit_split_manifest.json` 与仅含 train+val 的 `tiny_fit_input.jsonl`
  （val 行同时出现在两者中，符合任务书「128 状态全部参与优化」的诊断口径）。

同时输出 `tiny_fit_inputs_report.json`，记录 val 占位选择、行数、root 家族与数据集摘要，
使「同一实验的输入身份」可复核。

用法：
    py v14/tools/make_tiny_fit_inputs.py --tiny-dataset <tiny_fit_dataset.jsonl> \
        --out-dir <dir> --run-id <runId>
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="V14/T14-04 tiny-fit 输入与 split 生成")
    parser.add_argument("--tiny-dataset", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()

    tiny_path = Path(args.tiny_dataset)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rows: List[Dict[str, Any]] = []
    with tiny_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    by_family: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        family = str(row.get("rootFamilyId") or row.get("baseRootId") or "UNKNOWN")
        by_family.setdefault(family, []).append(row)

    # 中文：val 占位取「样本数最少」的家族，保证 train 仍然包含绝大多数状态；
    # 该家族的行同时保留在 train 中（记忆诊断要求全部状态被优化），
    # 因此在报告中显式标注 val 不是泛化指标。
    families_sorted = sorted(by_family.items(), key=lambda kv: (len(kv[1]), kv[0]))
    if len(families_sorted) < 2:
        raise SystemExit("tiny 数据集只包含一个 root 家族，无法构造 train/val 划分")
    val_family, val_rows = families_sorted[0]
    train_families = [family for family, _ in families_sorted if family != val_family]

    manifest = {
        "schema": "v14_tiny_fit_split_manifest_1",
        "task": "T14-04",
        "runId": args.run_id,
        "purpose": "128 状态记忆能力诊断（diagnostic=true）：全部状态参与优化；val 只是训练器要求的非空占位。",
        "datasetPath": str(tiny_path).replace("\\", "/"),
        "datasetSha256": sha256_file(tiny_path),
        "rows": len(rows),
        "trainRootFamilies": train_families,
        "valRootFamilies": [val_family],
        "testRootFamilies": [],
        "valPlaceholderRoot": val_family,
        "valPlaceholderRows": len(val_rows),
        "valSizeNote": "val 是形状占位：来自训练 root 家族，仅用于满足训练器的非空检查，"
                       "不参与优化、不用于选择 epoch，也不作为泛化指标；记忆能力以 128 个状态上的 final checkpoint 重评为准。",
    }
    manifest_path = out_dir / "tiny_fit_split_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    input_path = out_dir / "tiny_fit_input.jsonl"
    with input_path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    report = {
        "schema": "v14_tiny_fit_inputs_report_1",
        "task": "T14-04",
        "runId": args.run_id,
        "sourceTinyDataset": str(tiny_path).replace("\\", "/"),
        "sourceTinyDatasetSha256": sha256_file(tiny_path),
        "inputDataset": str(input_path).replace("\\", "/"),
        "inputDatasetSha256": sha256_file(input_path),
        "splitManifest": str(manifest_path).replace("\\", "/"),
        "rows": len(rows),
        "distinctRootFamilies": len(by_family),
        "valPlaceholderFamily": val_family,
        "valPlaceholderRows": len(val_rows),
        "trainRootFamilies": len(train_families),
        "familySizes": {family: len(items) for family, items in families_sorted},
    }
    report_path = out_dir / "tiny_fit_inputs_report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"[T14-04] rows={len(rows)} families={len(by_family)} valPlaceholder={val_family} ({len(val_rows)} rows)")
    print(f"[T14-04] -> {input_path} / {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
