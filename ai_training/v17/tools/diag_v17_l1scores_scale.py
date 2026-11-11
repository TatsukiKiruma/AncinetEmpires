"""V17：检查 `l1Scores` 是否可作为 soft ranking 目标（对齐、尺度、是否退化）。"""

from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

P = REPO / "v17/out/v17_20260926_r2/experiments/_data/B01_val_fixed.jsonl"

n = 0
aligned = 0
gaps = []
maxs = []
mins = []
spans = []
degenerate = 0
with P.open(encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        raw = r.get("l1Scores")
        order = r.get("orderedActionCodes")
        ti = r.get("targetActionIndex")
        if not raw or not order or ti is None or len(raw) != len(order):
            continue
        # 中文：l1Scores 是 [{"actionCode": ..., "score": ...}, ...]，与 orderedActionCodes 同序。
        s = [float(x.get("score")) if isinstance(x, dict) else float(x) for x in raw]
        n += 1
        if int(ti) == int(max(range(len(s)), key=lambda i: s[i])):
            aligned += 1
        srt = sorted(s, reverse=True)
        gaps.append(srt[0] - srt[1] if len(srt) > 1 else 0.0)
        maxs.append(srt[0])
        mins.append(srt[-1])
        spans.append(srt[0] - srt[-1])
        if len(srt) > 1 and (srt[0] - srt[1]) <= 1e-9:
            degenerate += 1
        if n >= 3000:
            break


def q(v, p):
    return round(float(sorted(v)[min(len(v) - 1, int(p * len(v)))]), 4)


print(f"rows checked            : {n}")
print(f"argmax(l1Scores)==target: {aligned}/{n} = {aligned / n:.4f}")
print(f"top1-top2 gap  p10/p50/p90: {q(gaps,0.1)} / {q(gaps,0.5)} / {q(gaps,0.9)}")
print(f"score span     p10/p50/p90: {q(spans,0.1)} / {q(spans,0.5)} / {q(spans,0.9)}")
print(f"max score      p10/p50/p90: {q(maxs,0.1)} / {q(maxs,0.5)} / {q(maxs,0.9)}")
print(f"min score      p10/p50/p90: {q(mins,0.1)} / {q(mins,0.5)} / {q(mins,0.9)}")
print(f"exact top1==top2 ties     : {degenerate}/{n}")
