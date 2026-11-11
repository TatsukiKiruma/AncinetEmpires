"""V18/T18-01：分析「验证输入与训练输入交集」的**阶段构成**，决定哪些状态能当未见验证。

背景：独立重算发现 V17「train∩val=0」的结论不成立——`val_h0.allmaps` 的 3,864 个不同输入中
有 1,524 个出现在 V17 新 train 里。本脚本回答：
1. 交集主要落在哪些阶段？如果是 0-2 开局，说明是确定性开局撞车，而不是抽样泄漏。
2. 换用 `val_h0.ext`（更多 root）后交集是多少？
3. 扣除交集后，真正可用的未见输入在各阶段/各图还剩多少？

用法：
    python v18/tools/analyze_val_overlap_by_phase.py --run-id run_20260927_v18_01
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
PHASE_RE = re.compile(r'"phaseBucket"\s*:\s*"([^"]+)"')
MAP_RE = re.compile(r'"mapName"\s*:\s*"([^"]+)"')


def scan_keys(path: Path):
    """返回 {(key, phase, mapName)} 的集合。"""
    out = set()
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            key = KEY_RE.search(line)
            if not key:
                continue
            phase = PHASE_RE.search(line)
            map_name = MAP_RE.search(line)
            out.add((key.group(1), phase.group(1) if phase else "?", map_name.group(1) if map_name else "?"))
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id

    train_keys: set[str] = set()
    train_dir = V17_RUN / "data" / "new_train" / "encoded"
    for path in sorted(train_dir.glob("*.jsonl")):
        if path.stat().st_size == 0:
            continue
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                match = KEY_RE.search(line)
                if match:
                    train_keys.add(match.group(1))

    results = {}
    for tag, rel in (
        ("val_h0.allmaps", "data/new_val/encoded/val.h0.allmaps.jsonl"),
        ("val_h0.ext", "data/new_val/encoded/val.h0.ext.jsonl"),
    ):
        path = V17_RUN / rel
        entries = scan_keys(path)
        by_key_phase: dict[str, str] = {}
        by_key_map: dict[str, str] = {}
        for key, phase, map_name in entries:
            by_key_phase[key] = phase
            by_key_map[key] = map_name
        shared = {k for k in by_key_phase if k in train_keys}
        unseen = {k for k in by_key_phase if k not in train_keys}
        phase_shared = collections.Counter(by_key_phase[k] for k in shared)
        phase_unseen = collections.Counter(by_key_phase[k] for k in unseen)
        phase_all = collections.Counter(by_key_phase.values())
        map_unseen = collections.Counter(by_key_map[k] for k in unseen)
        map_unseen_phase = collections.Counter(
            f"{by_key_map[k]}|{by_key_phase[k]}" for k in unseen if by_key_phase[k] == "0-2"
        )
        results[tag] = {
            "file": rel,
            "distinctInputs": len(by_key_phase),
            "sharedWithTrain": len(shared),
            "unseen": len(unseen),
            "sharedRate": round(len(shared) / max(1, len(by_key_phase)), 4),
            "byPhaseAll": dict(sorted(phase_all.items())),
            "byPhaseShared": dict(sorted(phase_shared.items())),
            "byPhaseUnseen": dict(sorted(phase_unseen.items())),
            "unseenOpeningByMap": dict(sorted(map_unseen_phase.items())),
            "unseenByMap": dict(sorted(map_unseen.items())),
        }
        print(f"[overlap] {tag}: 不同输入 {len(by_key_phase)}，与训练共享 {len(shared)}，未见 {len(unseen)}", flush=True)

    report = {
        "schema": "v18_val_overlap_analysis_1",
        "runId": args.run_id,
        "trainDistinctInputs": len(train_keys),
        "perValFile": results,
        "interpretation": [
            "若交集集中在 0-2 阶段，说明确定性开局在任何 seed 下都会产生相同状态，属于『共享开局』而非抽样泄漏。",
            "共享状态只能用于回归（SHARED_OPENING_REGRESSION），不能计入未见输入验证。",
            "独立初始化种子相同的地图，其开局前缀状态对任何采集进程都是同一批状态，因此开局覆盖必须靠**独立可达状态采集**而不是重复开局。",
        ],
    }
    out = run / "data" / "val_overlap_analysis.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk in ("distinctInputs", "sharedWithTrain", "unseen", "sharedRate", "byPhaseAll", "byPhaseShared", "byPhaseUnseen", "unseenOpeningByMap")} for k, v in results.items()}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
