"""V17/T17-01：对**新采集数据**的独立复算（只读）。

中文：本脚本故意不复用 TS 侧代码，而是把 `v17/review/audit_v16.py::input_key` 的
独立 Python 实现直接用在 V17 新数据集上，用来回答四个问题：

1. 落盘行里的 `actualInputKey` 是否真的等于按 float32 张量 + 候选语义/坐标多重集重算的值？
   （TS 实现自己说自己对不算证据。）
2. 数据集的真正不同输入数、重复行数、family 数、单 family 最大占比是多少？
3. new_val 与 new_train、以及与 V16 legacy train 已用输入的交集是不是 0？
4. 胜负 / 分图 / 分座位 / 分阶段分布如何，自然终局比例多少？

用法：
  & 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe' v17/tools/verify_v17_newdata.py --data-dir v17/out/v17_20260926_r2/data
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
COORD_KEYS = ("actorCoord", "landingCoord", "targetCoord")


def f32(a):
    return struct.pack("<" + "f" * len(a), *a)


def input_key(row):
    """独立实现（与 v17/review/audit_v16.py 逐字节相同口径）。"""
    h = hashlib.sha256(f32(row["spatialTensor"]) + f32(row["globalFeatures"]))
    candidates = []
    for c in row["candidateActions"]:
        ch = hashlib.sha256()
        for key in COORD_KEYS:
            ch.update(json.dumps(c.get(key), sort_keys=True, separators=(",", ":")).encode())
        ch.update(f32(c["semantics"]))
        candidates.append(ch.digest())
    h.update(struct.pack("<I", len(candidates)))
    for c in sorted(candidates):
        h.update(c)
    return h.hexdigest()


def rows(path: Path):
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def scan(path: Path):
    keys = Counter()
    first = {}
    mismatches = []
    families = Counter()
    by_map = Counter()
    by_seat = Counter()
    by_phase = Counter()
    by_outcome = Counter()
    by_value = Counter()
    by_source = Counter()
    labels = defaultdict(set)
    values = defaultdict(set)
    rows_n = 0
    started = time.time()
    for row in rows(path):
        rows_n += 1
        key = input_key(row)
        keys[key] += 1
        if key not in first:
            first[key] = row.get("sampleId")
        stored = row.get("actualInputKey")
        if stored != key and len(mismatches) < 5:
            mismatches.append({"sampleId": row.get("sampleId"), "ours": key, "stored": stored})
        families[row.get("trueFamilyId")] += 1
        by_map[row.get("mapName")] += 1
        by_seat[str(row.get("subjectPlayerId"))] += 1
        by_phase[str(row.get("phaseBucket"))] += 1
        by_outcome[str(row.get("subjectOutcome"))] += 1
        by_value[str(row.get("valueTarget"))] += 1
        by_source[str(row.get("sourcePolicy"))] += 1
        labels[key].add(row.get("l1ActionCode"))
        values[key].add(str(row.get("valueTarget")))
        if rows_n % 3000 == 0:
            print(f"  [{path.name}] {rows_n} rows {time.time() - started:.0f}s", flush=True)
    return {
        "path": str(path).replace("\\", "/"),
        "rows": rows_n,
        "uniqueActualInputs": len(keys),
        "duplicateRows": sum(v - 1 for v in keys.values()),
        "identityMismatch": len(mismatches),
        "identityMismatchExamples": mismatches,
        "families": len(families),
        "maxFamilyRows": max(families.values()) if families else 0,
        "maxFamilyShare": (max(families.values()) / rows_n) if rows_n else 0.0,
        "conflictingL1Keys": sum(1 for v in labels.values() if len(v) > 1),
        "conflictingValueKeys": sum(1 for v in values.values() if len(v) > 1),
        "byMap": dict(by_map),
        "bySeat": dict(by_seat),
        "byPhase": dict(by_phase),
        "byOutcome": dict(by_outcome),
        "byValueTarget": dict(by_value),
        "bySource": dict(by_source),
        "naturalWin": by_outcome.get("win", 0),
        "naturalLoss": by_outcome.get("loss", 0),
        "naturalDraw": by_outcome.get("draw", 0),
        "nonNatural": by_outcome.get("None", 0),
        "keys": set(keys),
        "seconds": round(time.time() - started, 1),
    }


def legacy_keys(data_dir: Path):
    keys = set()
    index = REPO / "v17" / "review" / "train_input_index.jsonl"
    if index.exists():
        with index.open(encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                keys.add(json.loads(line)["key"])
    dedup = data_dir / "legacy_train_dedup.jsonl"
    if dedup.exists():
        with dedup.open(encoding="utf-8") as handle:
            for line in handle:
                pos = line.find('"actualInputKey":"')
                if pos >= 0:
                    keys.add(line[pos + 18 : pos + 82])
    return keys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="v17/out/v17_20260926_r2/data")
    parser.add_argument("--skip-legacy", action="store_true")
    args = parser.parse_args()
    data_dir = (REPO / args.data_dir).resolve()

    train_path = data_dir / "new_train" / "dataset_v17_newtrain.jsonl"
    val_path = data_dir / "new_val" / "dataset_v17_newval.jsonl"
    out = {
        "schema": "v17_new_data_verification_1",
        "identityId": "v17-netinput-v1",
        "implementation": "independent Python (v17/review/audit_v16.py 同口径)",
        "splits": {},
    }
    for name, path in (("train", train_path), ("val", val_path)):
        if not path.exists():
            out["splits"][name] = {"status": "MISSING", "path": str(path).replace("\\", "/")}
            continue
        print(f"[verify] 扫描 {path}", flush=True)
        result = scan(path)
        result["status"] = "OK"
        out["splits"][name] = result

    train = out["splits"].get("train", {})
    val = out["splits"].get("val", {})
    train_keys = train.pop("keys", set())
    val_keys = val.pop("keys", set())
    out["crossSplit"] = {
        "trainUnique": len(train_keys),
        "valUnique": len(val_keys),
        "overlapKeys": len(train_keys & val_keys),
        "overlapExamples": sorted(train_keys & val_keys)[:5],
    }
    if not args.skip_legacy:
        legacy = legacy_keys(data_dir)
        out["legacyTrain"] = {
            "legacyKeys": len(legacy),
            "trainRowsMatchingLegacy": len(train_keys & legacy),
            "valRowsMatchingLegacy": len(val_keys & legacy),
            "valRowsMatchingLegacyExamples": sorted(val_keys & legacy)[:5],
        }
    outpath = data_dir / "new_data_verification.json"
    outpath.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "splits"}, ensure_ascii=False, indent=2))
    for name in ("train", "val"):
        s = out["splits"].get(name)
        if not s or s.get("status") != "OK":
            continue
        print(f"[{name}] rows={s['rows']} unique={s['uniqueActualInputs']} dup={s['duplicateRows']} "
              f"families={s['families']} maxFamilyShare={s['maxFamilyShare']*100:.2f}% "
              f"identityMismatch={s['identityMismatch']} conflictL1={s['conflictingL1Keys']} "
              f"conflictVal={s['conflictingValueKeys']} win={s['naturalWin']} loss={s['naturalLoss']}")
    print(f"[verify] -> {outpath}")
    return 0 if all(out["splits"].get(n, {}).get("identityMismatch", 0) == 0 for n in ("train", "val")) else 1


if __name__ == "__main__":
    raise SystemExit(main())
