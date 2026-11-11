"""V17/T17-02：生成 trainer 可消费的合并数据集（**不改** python/train_spatial_resnet.py）。

为什么需要这一步（不是可选的整理）：
  * `python/train_spatial_resnet.py` 只接受**一个** `--dataset`，而重建产物把 train 与
    干净 val 分成两个文件（`legacy_train_dedup.jsonl` / `legacy_val_clean.jsonl`）。
  * trainer 的 `--split-manifest` 按 `rootFamilyId` 匹配分区，而重建行保留的
    `rootFamilyId` 是 V16 旧格式 `"train|h0|SDPLAN:<map>#<seed>#seat0"`（含 split/source/seat），
    与 manifest 使用的**真实 family** `mapName#initializationPolicyId#rootSeed` 不一致。
    T17-01 已把真实 family 写在 `trueFamilyId` 字段里。

因此本脚本只做一次显式、可复核的数据整形，**不修改 trainer**：
  1. 顺序写入 train 行 + val 行；
  2. `rootFamilyId` ← `trueFamilyId`（旧值保留在 `v16RootFamilyId`，不丢证据）；
  3. `partition` ← "train"/"val"（供 ledger 的 exposuresByPartition 使用）；
  4. 写出 `provenance.json`：源文件 SHA256、行数、family 数、跨分区 family 交集（必须 0）。

用法（真实命令）：
  & 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe' `
    v17/tools/make_v17_trainer_input.py
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "v17" / "out" / "v17_20260926_r2" / "data"
OUT_DIR = REPO / "v17" / "out" / "v17_20260926_r2" / "experiments" / "_data"
OUT_FILE = OUT_DIR / "legacy_trainval_truefamily.jsonl"


def sha256(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            block = fh.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def pick_val() -> Path:
    clean = DATA / "legacy_val_clean.jsonl"
    if clean.exists():
        return clean
    dedup = DATA / "legacy_val_dedup.jsonl"
    if dedup.exists():
        print("[!] legacy_val_clean.jsonl 不存在，使用 legacy_val_dedup.jsonl"
              "（val 内部去重 + 已剔除与 train 同实际输入的行）")
        return dedup
    raise SystemExit("缺少 val 输入文件")


def main() -> int:
    train_path = DATA / "legacy_train_dedup.jsonl"
    val_path = pick_val()
    if not train_path.exists():
        raise SystemExit(f"缺少 train 输入文件：{train_path}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    started = time.time()
    counts = {"train": 0, "val": 0}
    fams = {"train": set(), "val": set()}
    masks = {"train": {"value": 0, "policy_false": 0}, "val": {"value": 0, "policy_false": 0}}

    with OUT_FILE.open("w", encoding="utf-8", newline="\n") as out:
        for part, path in (("train", train_path), ("val", val_path)):
            with path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    row = json.loads(line)
                    true_fam = row.get("trueFamilyId")
                    if not true_fam:
                        raise SystemExit(f"{path.name}: 行缺少 trueFamilyId（sampleId={row.get('sampleId')}）")
                    row["v16RootFamilyId"] = row.get("rootFamilyId")
                    row["rootFamilyId"] = true_fam
                    row["partition"] = part
                    row["v17TrainerInputId"] = "v17-legacy-truefamily-1"
                    out.write(json.dumps(row, ensure_ascii=False) + "\n")
                    counts[part] += 1
                    fams[part].add(true_fam)
                    if bool(row.get("valueLossMask", row.get("valueTarget") is not None)):
                        masks[part]["value"] += 1
                    if not bool(row.get("policyLossMask", True)):
                        masks[part]["policy_false"] += 1

    shared = sorted(fams["train"] & fams["val"])
    provenance = {
        "schema": "v17_trainer_input_provenance_1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "purpose": "把重建后的 train/val 合并成 trainer 可消费的单一数据集，并把 rootFamilyId "
                   "改写为真实 family（trueFamilyId），以匹配 legacy_split_manifest.json。",
        "trainerScript": "v17/tools/train_v17.py（python/train_spatial_resnet.py 的副本，仅加两个可选开关）",
        "outputs": {
            "dataset": str(OUT_FILE).replace("\\", "/"),
            "datasetSha256": sha256(OUT_FILE),
            "datasetBytes": OUT_FILE.stat().st_size,
            "manifest": str(DATA / "legacy_split_manifest.json").replace("\\", "/"),
            "manifestSha256": sha256(DATA / "legacy_split_manifest.json"),
        },
        "sources": {
            "train": {"path": str(train_path).replace("\\", "/"), "sha256": sha256(train_path),
                      "rows": counts["train"], "families": len(fams["train"]),
                      "originalRootFamilyIdKeptAs": "v16RootFamilyId"},
            "val": {"path": str(val_path).replace("\\", "/"), "sha256": sha256(val_path),
                    "rows": counts["val"], "families": len(fams["val"]),
                    "isCleanValFallback": val_path.name != "legacy_val_clean.jsonl"},
        },
        "rowCounts": counts,
        "valueLossMaskTrue": {k: v["value"] for k, v in masks.items()},
        "policyLossMaskFalse": {k: v["policy_false"] for k, v in masks.items()},
        "familyOverlapBetweenParts": {"count": len(shared), "examples": shared[:5]},
        "discipline": [
            "逐行 json 解析后原样重写，只改 rootFamilyId/partition 并加两个溯源字段。",
            "不删除任何重复行、不改标签、不改张量。",
            "trainer 侧 --split-manifest 以 rootFamilyId(=真实 family) 分区，因此 train/val 由 manifest 决定。",
        ],
        "elapsedSeconds": round(time.time() - started, 1),
    }
    (OUT_DIR / "provenance.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2),
                                             encoding="utf-8")
    print(json.dumps({k: v for k, v in provenance.items() if k != "discipline"},
                     ensure_ascii=False, indent=2))
    if shared:
        print(f"[FAIL] train/val 共享 {len(shared)} 个 family", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
