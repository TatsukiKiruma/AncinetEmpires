"""V18/T18-05：冻结 RECHECK40 面板 manifest，并核验它与训练/验证 namespace 无交集。

任务书 T18-05 要求：
  > 每次晋升候选与旧冠军跑同一批新 RECHECK40；至少多赢 2 局、错误/非法/回退为 0。
  > 首次运行前冻结面板 manifest 并检测 namespace 与训练数据无交集。

RECHECK40 公式（任务书 §9）：`2610030000 + 100*wave + 10*mapIndex + s`，s=0..3、wave=1..3，各换边。
本脚本只**冻结 manifest 与做交集检查**，不消耗面板（当前没有任何候选达到晋升条件）。

用法：
    python v18/tools/freeze_recheck40_manifest.py --run-id run_20260927_v18_01 --wave 1
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

MAPS = [
    "(2) Duel.aem",
    "(2) Icy Paths.aem",
    "(2) Liberty Port.aem",
    "(2) Mourningstar.aem",
    "(2) Crossed swords.aem",
]

# 所有已经用过的 root seed namespace（用于交集检查）。
USED_NAMESPACES = {
    "v16_train": 2609250000,
    "v16_val": 2609260000,
    "dev20": 2609260100,
    "confirm20": 2609260300,
    "v17_train": 2610010000,
    "v17_val": 2610020000,
    "v18_val_calib_roots": 2610020000,  # 复用 v17 val 命名空间的 rootIndex 20..23 / 50,51 / 60
    "recheck40_wave1": 2610030100,
    "recheck40_wave2": 2610030200,
    "recheck40_wave3": 2610030300,
    "train_collect_wave1": 2610050000,
    "train_collect_wave2": 2610060000,
    "train_collect_wave3": 2610070000,
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    parser.add_argument("--wave", type=int, default=1)
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id

    base = 2610030000 + 100 * args.wave
    blocks = []
    for m in range(5):
        for s in range(4):
            seed = base + 10 * m + s
            for seat in (0, 1):
                blocks.append({
                    "mapIndex": m,
                    "mapName": MAPS[m],
                    "seed": seed,
                    "candidateSeat": seat,
                    "blockId": f"recheck:w{args.wave}:m{m}:s{s}:seat{seat}",
                })

    seed_set = {b["seed"] for b in blocks}
    # 交集检查 1：与其它 namespace 的 seed 集合比较（同一 base 的 100 宽窗口不能重叠）
    overlaps = []
    for name, other_base in USED_NAMESPACES.items():
        if name.startswith("recheck40") and name.endswith(f"wave{args.wave}"):
            continue
        other_seeds = {other_base + 10 * m + s for m in range(5) for s in range(10)}
        inter = seed_set & other_seeds
        if inter:
            overlaps.append({"namespace": name, "sharedSeeds": sorted(inter)})

    # 交集检查 2：与训练池实际网络输入的交集（面板尚未运行，因此按 seed/family 检查）
    train_dir = V17_RUN / "data" / "new_train" / "encoded"
    train_families: set[str] = set()
    for path in sorted(train_dir.glob("*.jsonl")):
        if path.stat().st_size == 0:
            continue
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                match = re.search(r'"trueFamilyId"\s*:\s*"([^"]+)"', line)
                if match:
                    train_families.add(match.group(1))
    panel_families = {f"{MAPS[b['mapIndex']]}#sd-first-turn-start-v1#{b['seed']}" for b in blocks}
    family_overlap = sorted(panel_families & train_families)

    manifest = {
        "schema": "v18_recheck40_manifest_1",
        "runId": args.run_id,
        "panelId": f"recheck40_wave{args.wave}",
        "frozen": True,
        "note": "冻结后不得修改；本面板当前**未运行**（没有任何候选达到晋升条件）。",
        "seedFormula": "2610030000 + 100*wave + 10*mapIndex + s，s=0..3，两座位",
        "wave": args.wave,
        "blocks": blocks,
        "blockCount": len(blocks),
        "distinctSeeds": len(seed_set),
        "maps": MAPS,
        "caps": {"maxStepsAtomicActions": 12000, "wallTimeoutMs": 900000},
        "filter": "filter-surrender-v1",
        "initializationPolicyId": "sd-first-turn-start-v1",
        "namespaceOverlapsWithOtherNamespaces": overlaps,
        "familyOverlapWithTrainingPool": family_overlap,
        "acceptance": {
            "noNamespaceOverlap": len(overlaps) == 0,
            "noFamilyOverlapWithTraining": len(family_overlap) == 0,
            "blockCountIs40": len(blocks) == 40,
        },
        "promotionRule": (
            "候选必须与旧冠军跑同一批 RECHECK40；至少多赢 2 局、错误/非法/回退为 0，"
            "才替换内部冠军。2/40 不是统计显著性证明，需同时报告逐图、换边、成对差异与区间。"
        ),
    }
    out = run / "arena" / "recheck" / f"recheck40_wave{args.wave}.manifest.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "manifest": str(out.relative_to(ROOT)).replace("\\", "/"),
        "blockCount": manifest["blockCount"],
        "distinctSeeds": manifest["distinctSeeds"],
        "acceptance": manifest["acceptance"],
        "trainingFamiliesScanned": len(train_families),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
