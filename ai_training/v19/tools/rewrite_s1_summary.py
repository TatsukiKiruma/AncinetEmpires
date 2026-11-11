"""用修正后的口径，从既有 S1 明细重建汇总文件（不重跑搜索）。

背景：`v19/search/s1_experiment.ts` 早期版本把选中分支只写进 `search.selected`，
而门槛函数读顶层 `row.selected`，于是「改善」被误算成 0。驱动已修（两处都写、
门槛兼容两种路径）；本脚本把**已跑完的两组明细**按修正口径重新汇总，
避免为了一个字段路径重跑约 2 小时的搜索。

只读明细，只重写 `s1_summary_<group>.json`。
"""

from __future__ import annotations

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SEARCH_DIR = PROJECT_ROOT / "v19" / "out" / "s0s1_20260930" / "search"
NATURAL = {"NATURAL_WIN", "NATURAL_LOSS", "NATURAL_DRAW"}


def evaluate_gate(rows: list[dict]) -> dict:
    both_natural = 0
    improved = 0
    regressed = 0
    same = 0
    undecided = 0
    improved_maps: set[int] = set()
    for row in rows:
        validation = row.get("validation") or {}
        base = validation.get("baseline") or {}
        sel = validation.get("selected") or {}
        base_kind = base.get("outcomeKind")
        sel_kind = sel.get("outcomeKind")
        if base_kind in NATURAL and sel_kind in NATURAL:
            both_natural += 1
        selected_record = row.get("selected") or (row.get("search") or {}).get("selected")
        if not selected_record:
            same += 1
            continue
        if sel_kind not in NATURAL:
            undecided += 1
            continue
        base_win = base_kind == "NATURAL_WIN"
        sel_win = sel_kind == "NATURAL_WIN"
        if sel_win and not base_win:
            improved += 1
            improved_maps.add(int(row.get("mapIndex", -1)))
        elif base_win and not sel_win:
            regressed += 1
        else:
            same += 1
    passed = both_natural >= 10 and improved >= 4 and regressed <= 1 and len(improved_maps) >= 2
    return {
        "rule": "封存20窗口中 ≥10 个双方自然结果；≥4 个家族改善且退化 ≤1；改善跨 ≥2 图",
        "bothNatural": both_natural,
        "improved": improved,
        "regressed": regressed,
        "unchangedOrNoSelection": same,
        "undecidedOrError": undecided,
        "improvedMaps": sorted(improved_maps),
        "passed": passed,
        "note": "该门槛只允许有限扩展，不是统计显著性或整体胜率证明。",
        "correctedAt": "2026-09-30",
        "correctionNote": (
            "原汇总把选中分支只写在 search.selected，门槛函数却读顶层 selected，"
            "导致 improved 被误算为 0；本文件按修正口径重建。"
        ),
    }


def main() -> int:
    for group in ("dev", "sealed"):
        detail_path = SEARCH_DIR / f"s1_windows_{group}.jsonl"
        summary_path = SEARCH_DIR / f"s1_summary_{group}.json"
        if not detail_path.is_file():
            print(f"[跳过] 缺少 {detail_path}")
            continue
        rows = [json.loads(line) for line in detail_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        summary = json.loads(summary_path.read_text(encoding="utf-8")) if summary_path.is_file() else {}
        summary["gate"] = evaluate_gate(rows) if group in {"sealed", "all"} else None
        summary["totals"] = {
            "searchErrors": sum(1 for r in rows if r.get("error")),
            "selectedWindows": sum(
                1 for r in rows if (r.get("selected") or (r.get("search") or {}).get("selected"))
            ),
            "naturalTerminalInSearch": sum(
                1 for r in rows if ((r.get("search") or {}).get("naturalBranches") or [])
            ),
        }
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        gate = summary["gate"]
        print(f"[{group}] 已重建汇总；totals={summary['totals']}")
        if gate:
            print(
                f"      门槛：双方自然={gate['bothNatural']} 改善={gate['improved']} "
                f"退化={gate['regressed']} 持平/无选中={gate['unchangedOrNoSelection']} "
                f"未定/错误={gate['undecidedOrError']} 改善图={gate['improvedMaps']} 通过={gate['passed']}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
