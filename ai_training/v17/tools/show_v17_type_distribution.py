"""打印 action_type_accuracy.json 里的动作类型分布对比（模型 vs 标签）。"""

from __future__ import annotations

import json
import pathlib
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

p = pathlib.Path("v17/out/v17_20260926_r2/data/action_type_accuracy.json")
d = json.loads(p.read_text(encoding="utf-8"))
for name, m in d["models"].items():
    lt, pt = m["labelTypeDistribution"], m["predTypeDistribution"]
    tot = sum(lt.values())
    keys = sorted(set(lt) | set(pt), key=lambda k: -(lt.get(k, 0) + pt.get(k, 0)))
    print(f"== {name}  rows={tot}  exact={m['exactTop1']}  type={m['typeTop1']}")
    print(f"   {'type':22s} {'label%':>8s} {'pred%':>8s} {'delta':>8s}")
    for k in keys:
        a = lt.get(k, 0) / tot * 100
        b = pt.get(k, 0) / tot * 100
        print(f"   {k:22s} {a:8.2f} {b:8.2f} {b - a:+8.2f}")
    print()
