"""检查 S1 窗口清单里是否存在重复窗口（同 seed 家族产生同一根状态）。

只读分析工具；不改动任何清单。
"""

from __future__ import annotations

import collections
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PARTIAL = PROJECT_ROOT / "v19" / "out" / "s0s1_20260930" / "search" / "window_manifest.partial.jsonl"


def main() -> int:
    if not PARTIAL.is_file():
        print(f"未找到 {PARTIAL}")
        return 1
    rows = [json.loads(line) for line in PARTIAL.read_text(encoding="utf-8").splitlines() if line.strip()]
    rows = [row for row in rows if not row.get("skipped")]
    print(f"家族数：{len(rows)}")
    for row in rows:
        print(
            f"  {row['familyId']:22s} seed={row['seed']} seat={row['ownSeat']} "
            f"step={row['engineStepIndex']:5d} turn={row['phaseTurn']:3d} "
            f"root={row['rootStateHash']} gameSteps={row['gameSteps']:5d} {row['gameOutcomeKind']}"
        )
    counter = collections.Counter(row["rootStateHash"] for row in rows)
    print(f"不同根状态数：{len(counter)} / {len(rows)}")
    duplicates = {key: value for key, value in counter.items() if value > 1}
    print(f"重复根状态：{duplicates if duplicates else '无'}")
    by_map: dict[int, set[str]] = collections.defaultdict(set)
    for row in rows:
        by_map[row["mapIndex"]].add(row["rootStateHash"])
    print(f"逐图不同根状态数：{ {k: len(v) for k, v in sorted(by_map.items())} }")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
