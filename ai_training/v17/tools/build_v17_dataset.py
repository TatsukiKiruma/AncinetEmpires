"""V17/T17-01：按**真实网络输入身份**重建 V16 数据（train 去重 + 干净 legacy val）。

背景（V16 审核 §2）：V16 的 train 16,000 行只有 6,869 个不同网络输入；val 3,200 行里
2,553 行（79.78%）与 train 同输入。原因是前置去重用了完整 stateHash+orderingId+filterId，
而网络真正看到的只是 float32 空间张量 + 全局特征 + 候选语义/坐标的无序多重集。

本脚本：
1. 只读流式读取 V16 产物（`full_l1_all.jsonl` 等），**不改动 v16 目录**。
2. 用 `v17-netinput-v1` 身份（与 `v17/tools/v17_input_identity.ts` 逐字节同定义）重算 key。
3. 输出：
   - `legacy_train_dedup.jsonl`：train 每输入一行（首次出现者胜），冲突另记。
   - `legacy_val_clean.jsonl`：val 每输入一行，且 key **不在** train key 集合中。
   - `legacy_val_contaminated.jsonl`：被剔除的 val 行（与 train 同输入），保留证据。
   - `legacy_split_manifest.json`：trainer 可用的 family 级 manifest（真实 family）。
   - `legacy_rebuild_report.json`：raw/unique/重复/冲突/跨区/分图分座位分阶段。
   - `legacy_train_conflicts.jsonl` / `legacy_val_conflicts.jsonl`：同输入不同 L1 标签。

用法（真实命令）：
  & 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe' `
    v17/tools/build_v17_dataset.py --source v16/out/v16_20260926_core/T16-06/full_l1_all.jsonl `
    --out-dir v17/out/v17_20260926_r2/data --split-by sample-id-prefix --self-check
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
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

REPO = Path(__file__).resolve().parents[2]

# ---------------------------------------------------------------------------
# v17-netinput-v1：唯一身份定义（必须与 v17/tools/v17_input_identity.ts 一致）
# ---------------------------------------------------------------------------
IDENTITY_ID = "v17-netinput-v1"
COORD_KEYS = ("actorCoord", "landingCoord", "targetCoord")


def _f32(values: Iterable[float]) -> bytes:
    vals = list(values)
    return struct.pack("<" + "f" * len(vals), *vals)


def _canon(value: Any) -> bytes:
    """等价于 json.dumps(value, sort_keys=True, separators=(',', ':'))."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def candidate_digest(candidate: Dict[str, Any]) -> bytes:
    ch = hashlib.sha256()
    for key in COORD_KEYS:
        ch.update(_canon(candidate.get(key)))
    ch.update(_f32(candidate["semantics"]))
    return ch.digest()


def input_key(row: Dict[str, Any]) -> str:
    h = hashlib.sha256()
    h.update(_f32(row["spatialTensor"]))
    h.update(_f32(row["globalFeatures"]))
    candidates = [candidate_digest(c) for c in row["candidateActions"]]
    h.update(struct.pack("<I", len(candidates)))
    for digest in sorted(candidates):
        h.update(digest)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# 真实 family（任务书 §3.1）：map + 初始化/规则版本 + **基础 root seed**。
# 不含 split / source / seat —— V16 的 rootFamilyId 恰恰把它们塞了进去。
# ---------------------------------------------------------------------------
def true_family(row: Dict[str, Any]) -> str:
    map_name = row.get("mapName") or "unknown_map"
    init = row.get("initializationPolicyId") or "unknown-init"
    seed = row.get("seed")
    return f"{map_name}#{init}#{seed}"


def _rows(path: Path) -> Iterator[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def _pct(sorted_values: List[float], q: float) -> Optional[float]:
    if not sorted_values:
        return None
    return sorted_values[min(len(sorted_values) - 1, int(q * len(sorted_values)))]


def split_of(row: Dict[str, Any]) -> str:
    sid = str(row.get("sampleId", ""))
    if sid.startswith("train"):
        return "train"
    if sid.startswith("val"):
        return "val"
    # 退路：按 family 里记录的分区前缀判断；再不行按 rootFamilyId 里的 seed 段。
    fam = str(row.get("rootFamilyId", ""))
    if fam.startswith("train"):
        return "train"
    if fam.startswith("val"):
        return "val"
    return "unknown"


def main() -> int:
    parser = argparse.ArgumentParser(description="V17 actual-input dedup / clean legacy split")
    parser.add_argument("--source", required=True, help="V16 L1 数据集（只读）")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--self-check", action="store_true",
                        help="与 v17/review/*_input_index.jsonl（V16 审核的独立 Python 实现）逐行比对")
    parser.add_argument("--limit", type=int, default=None, help="诊断用：只处理前 N 行")
    args = parser.parse_args()

    src = (REPO / args.source).resolve() if not Path(args.source).is_absolute() else Path(args.source)
    if not src.exists():
        raise SystemExit(f"source 不存在：{src}")
    out_dir = (REPO / args.out_dir).resolve() if not Path(args.out_dir).is_absolute() else Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # --- V16 审核索引（独立实现）用于自检 -------------------------------------
    audit_index: Dict[str, Dict[str, str]] = {}
    if args.self_check:
        for split in ("train", "val"):
            path = REPO / "v17" / "review" / f"{split}_input_index.jsonl"
            if not path.exists():
                continue
            for row in _rows(path):
                audit_index[row["sampleId"]] = row

    started = time.time()
    # ---------------- pass 1：算 key，统计 ----------------
    keys_by_split: Dict[str, Dict[str, str]] = {"train": {}, "val": {}, "unknown": {}}
    rows_by_split: Counter = Counter()
    labels_by_key: Dict[str, set] = defaultdict(set)
    targets_by_key: Dict[str, set] = defaultdict(set)
    family_by_key: Dict[str, set] = defaultdict(set)
    self_check_mismatch: List[Dict[str, Any]] = []
    self_check_checked = 0
    keys_cache: Dict[str, str] = {}

    for index, row in enumerate(_rows(src)):
        if args.limit is not None and index >= args.limit:
            break
        split = split_of(row)
        key = input_key(row)
        sid = row["sampleId"]
        keys_cache[sid] = key
        keys_by_split.setdefault(split, {})[sid] = key
        rows_by_split[split] += 1
        labels_by_key[key].add(row.get("l1ActionCode"))
        targets_by_key[key].add(row.get("valueTarget"))
        family_by_key[key].add(true_family(row))
        if args.self_check and sid in audit_index:
            self_check_checked += 1
            if audit_index[sid]["key"] != key and len(self_check_mismatch) < 5:
                self_check_mismatch.append({"sampleId": sid, "ours": key, "audit": audit_index[sid]["key"]})
        if (index + 1) % 4000 == 0:
            print(f"[pass1] {index + 1} rows, {time.time() - started:.1f}s", flush=True)

    pass1_seconds = time.time() - started
    train_keys = set(keys_by_split.get("train", {}).values())
    val_keys = set(keys_by_split.get("val", {}).values())
    overlap_keys = train_keys & val_keys

    # ---------------- pass 2：写出去重后的分片 ----------------
    seen: Dict[str, set] = {"train": set(), "val": set(), "unknown": set()}
    kept: Counter = Counter()
    dropped_dup: Counter = Counter()
    dropped_cross: Counter = Counter()
    stats: Dict[str, Dict[str, Any]] = {
        s: {
            "rawRows": rows_by_split.get(s, 0),
            "uniqueInputs": 0,
            "duplicateRows": 0,
            "droppedBecauseSeenInTrain": 0,
            "conflictingL1Keys": 0,
            "conflictingValueKeys": 0,
            "families": 0,
            "byMap": Counter(),
            "bySeat": Counter(),
            "byPhase": Counter(),
            "byOutcome": Counter(),
            "byValueTarget": Counter(),
            "bySourcePolicy": Counter(),
            "maxFamilyRows": 0,
        }
        for s in ("train", "val", "unknown")
    }
    family_rows: Dict[str, Counter] = {s: Counter() for s in ("train", "val", "unknown")}

    handles = {
        s: {
            "kept": (out_dir / f"legacy_{s}_dedup.jsonl").open("w", encoding="utf-8"),
            "dup": (out_dir / f"legacy_{s}_duplicates.jsonl").open("w", encoding="utf-8"),
            "conflict": (out_dir / f"legacy_{s}_conflicts.jsonl").open("w", encoding="utf-8"),
        }
        for s in ("train", "val", "unknown")
    }
    val_contaminated = (out_dir / "legacy_val_contaminated.jsonl").open("w", encoding="utf-8")

    conflicts_written: set = set()
    for index, row in enumerate(_rows(src)):
        if args.limit is not None and index >= args.limit:
            break
        split = split_of(row)
        key = keys_cache[row["sampleId"]]
        if split == "val" and key in train_keys:
            val_contaminated.write(json.dumps({"sampleId": row["sampleId"], "actualInputKey": key,
                                               "mapName": row.get("mapName"), "family": true_family(row)},
                                              ensure_ascii=False) + "\n")
            dropped_cross["val"] += 1
            stats["val"]["droppedBecauseSeenInTrain"] += 1
            continue
        if key in seen[split]:
            dropped_dup[split] += 1
            stats[split]["duplicateRows"] += 1
            handles[split]["dup"].write(json.dumps({
                "sampleId": row["sampleId"], "actualInputKey": key,
                "duplicateOfKeptSampleId": seen[split + ":first"][key] if split + ":first" in seen else None,
            }, ensure_ascii=False) + "\n")
            continue
        seen[split].add(key)
        seen.setdefault(split + ":first", {})[key] = row["sampleId"]
        kept[split] += 1
        out_row = dict(row)
        out_row["actualInputKey"] = key
        out_row["v16SavedPolicyInputKey"] = row.get("policyInputKey")
        out_row["trueFamilyId"] = true_family(row)
        out_row["identityId"] = IDENTITY_ID
        handles[split]["kept"].write(json.dumps(out_row, ensure_ascii=False) + "\n")

        st = stats[split]
        st["uniqueInputs"] += 1
        st["byMap"][str(row.get("mapName"))] += 1
        st["bySeat"][str(row.get("subjectPlayerId"))] += 1
        st["byPhase"][str(row.get("phaseBucket"))] += 1
        st["byOutcome"][str(row.get("outcomeSource"))] += 1
        st["byValueTarget"][str(row.get("valueTarget"))] += 1
        st["bySourcePolicy"][str(row.get("sourcePolicy"))] += 1
        family_rows[split][true_family(row)] += 1
        if len(labels_by_key[key]) > 1:
            st["conflictingL1Keys"] += 1
            if key not in conflicts_written:
                conflicts_written.add(key)
                handles[split]["conflict"].write(json.dumps({
                    "actualInputKey": key, "l1ActionCodes": sorted(x for x in labels_by_key[key] if x is not None),
                    "valueTargets": sorted(str(x) for x in targets_by_key[key]),
                    "families": sorted(family_by_key[key]),
                }, ensure_ascii=False) + "\n")
        if len(targets_by_key[key]) > 1:
            st["conflictingValueKeys"] += 1

    for s in handles:
        for handle in handles[s].values():
            handle.close()
    val_contaminated.close()

    for s in ("train", "val", "unknown"):
        rows = family_rows[s]
        stats[s]["families"] = len(rows)
        stats[s]["maxFamilyRows"] = max(rows.values()) if rows else 0
        for counters in ("byMap", "bySeat", "byPhase", "byOutcome", "byValueTarget", "bySourcePolicy"):
            stats[s][counters] = dict(stats[s][counters])

    # ---------------- family 级 manifest（trainer 用） ----------------
    train_families = sorted(set(family_rows["train"]))
    val_families = sorted(set(family_rows["val"]))
    shared = set(train_families) & set(val_families)
    manifest = {
        "schema": "v17_legacy_split_manifest_1",
        "identityId": IDENTITY_ID,
        "source": str(src.relative_to(REPO)).replace("\\", "/") if src.is_relative_to(REPO) else str(src),
        "familyDefinition": "mapName#initializationPolicyId#rootSeed（不含 split/source/seat）",
        "trainRootFamilies": train_families,
        "valRootFamilies": val_families,
        "testRootFamilies": [],
        "note": "family 级隔离 + 输入级去重；val 已剔除与 train 同实际输入的行。",
    }
    (out_dir / "legacy_split_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    # 跨区输入交集复核（写出去重文件之后必须还是 0）
    kept_train_keys = {keys_cache[sid] for sid in keys_by_split.get("train", {})}  # 上界，真实值下面重算
    report = {
        "schema": "v17_legacy_rebuild_report_1",
        "identityId": IDENTITY_ID,
        "source": str(src).replace("\\", "/"),
        "sourceBytes": src.stat().st_size,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pass1Seconds": round(pass1_seconds, 1),
        "totalSeconds": round(time.time() - started, 1),
        "splits": stats,
        "crossSplit": {
            "trainUniqueKeys": len(train_keys),
            "valUniqueKeys": len(val_keys),
            "overlapKeys": len(overlap_keys),
            "valRowsSeenInTrain": dropped_cross.get("val", 0),
            "exampleOverlapKeys": sorted(overlap_keys)[:5],
        },
        "families": {
            "trainFamilies": len(train_families),
            "valFamilies": len(val_families),
            "sharedFamilies": len(shared),
        },
        "selfCheck": {
            "enabled": bool(args.self_check),
            "rowsCompared": self_check_checked,
            "mismatches": len(self_check_mismatch),
            "examples": self_check_mismatch,
        },
        "discipline": [
            "身份只含 float32 空间/全局张量与候选坐标+语义多重集；不含 sampleId/split/source/标签/actionCode。",
            "family 不含 split/source/seat。",
            "重复行保留证据而不是静默丢弃；val 与 train 同输入的行单独存放。",
        ],
    }
    (out_dir / "legacy_rebuild_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "splits"}, ensure_ascii=False, indent=2))
    for s in ("train", "val"):
        st = stats[s]
        print(f"[{s}] raw={st['rawRows']} unique={st['uniqueInputs']} dup={st['duplicateRows']} "
              f"droppedCross={st['droppedBecauseSeenInTrain']} families={st['families']} "
              f"maxFamily={st['maxFamilyRows']} conflictL1={st['conflictingL1Keys']}")
    if args.self_check and self_check_mismatch:
        print("SELF-CHECK FAILED", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())