"""从 S1 明细重算门槛与逐窗口结果，交叉核对汇总文件。

只读分析：不改动任何 S1 产物。用于发现汇总脚本与明细之间的口径差异。
"""

from __future__ import annotations

import collections
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SEARCH_DIR = PROJECT_ROOT / "v19" / "out" / "s0s1_20260930" / "search"
NATURAL = {"NATURAL_WIN", "NATURAL_LOSS", "NATURAL_DRAW"}


def load(group: str) -> list[dict]:
    path = SEARCH_DIR / f"s1_windows_{group}.jsonl"
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def analyse(group: str) -> dict:
    rows = load(group)
    both_natural = 0
    improved = 0
    regressed = 0
    same = 0
    undecided = 0
    selected_count = 0
    improved_maps: set[int] = set()
    detail: list[dict] = []
    for row in rows:
        validation = row.get("validation") or {}
        base = validation.get("baseline") or {}
        sel = validation.get("selected") or {}
        base_kind = base.get("outcomeKind")
        sel_kind = sel.get("outcomeKind")
        # 中文：驱动把选中分支写在 `search.selected` 子对象里；早期门槛函数误读顶层
        # `row.selected`，导致改善数被算成 0。这里按**实际落盘结构**读取，并兼容顶层别名。
        selected_record = row.get("selected") or (row.get("search") or {}).get("selected")
        has_selected = bool(selected_record)
        if has_selected:
            selected_count += 1
        if base_kind in NATURAL and sel_kind in NATURAL:
            both_natural += 1
        if not has_selected:
            same += 1
            verdict = "无选中分支"
        elif sel_kind not in NATURAL:
            undecided += 1
            verdict = f"选中分支未自然终局（{sel_kind}）"
        else:
            base_win = base_kind == "NATURAL_WIN"
            sel_win = sel_kind == "NATURAL_WIN"
            if sel_win and not base_win:
                improved += 1
                improved_maps.add(int(row.get("mapIndex", -1)))
                verdict = "改善"
            elif base_win and not sel_win:
                regressed += 1
                verdict = "退化"
            else:
                same += 1
                verdict = "持平"
        detail.append(
            {
                "windowId": row.get("windowId"),
                "mapIndex": row.get("mapIndex"),
                "group": row.get("group"),
                "hasSelected": has_selected,
                "selectedOwnActions": selected_record.get("ownActions") if has_selected else None,
                "selectionReason": selected_record.get("reason") if has_selected else None,
                "baselineOutcome": base_kind,
                "selectedOutcome": sel_kind,
                "verdict": verdict,
            }
        )
    passed = both_natural >= 10 and improved >= 4 and regressed <= 1 and len(improved_maps) >= 2
    return {
        "group": group,
        "windows": len(rows),
        "selectedWindows": selected_count,
        "bothNatural": both_natural,
        "improved": improved,
        "regressed": regressed,
        "unchangedOrNoSelection": same,
        "undecidedOrError": undecided,
        "improvedMaps": sorted(improved_maps),
        "gatePassed": passed,
        "baselineOutcomeCounts": dict(collections.Counter(r.get("baselineOutcome") for r in detail)),
        "selectedOutcomeCounts": dict(collections.Counter(r.get("selectedOutcome") for r in detail)),
        "detail": detail,
    }


def main() -> int:
    report = {group: analyse(group) for group in ("dev", "sealed")}
    out = SEARCH_DIR / "s1_recomputed.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for group, data in report.items():
        print(f"[{group}] 窗口={data['windows']} 有选中分支={data['selectedWindows']} "
              f"双方自然={data['bothNatural']} 改善={data['improved']} 退化={data['regressed']} "
              f"持平/无选中={data['unchangedOrNoSelection']} 未定/错误={data['undecidedOrError']} "
              f"门槛通过={data['gatePassed']}")
        print(f"      基线结果分布={data['baselineOutcomeCounts']}")
        print(f"      选中结果分布={data['selectedOutcomeCounts']}")
        for item in data["detail"]:
            if item["verdict"] in {"改善", "退化"} or (item["hasSelected"] and item["selectedOutcome"] != item["baselineOutcome"]):
                print(f"      * {item['windowId']} 基线={item['baselineOutcome']} 选中={item['selectedOutcome']} "
                      f"{item['selectedOwnActions']} -> {item['verdict']}")
    print(f"已写出 {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
