"""把 T18-03 的 S2（完整对局策略 A/B）预登记写进报告。

中文：预登记必须在结果之前写定。S2 的工具与命令在启动时已经固定，
本脚本把「判据、预算、允许的结论」写进 T18_03_report.md，避免事后改判据。
可重复执行。
"""
import io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "v18" / "out" / "run_20260927_v18_01" / "reports" / "T18_03_report.md"

ANCHOR = """## 3. 预登记的搜索改进 S1（续弈预算）"""

S2_SECTION = """## 2c. 预登记搜索改进 S2：完整对局的策略 A/B（干预单位改为整局）

**背景**：第一道门的诊断结论是「固定 H0 续弈把首手差异迅速抹平」。
S1 检验「是不是续弈太短」；**S2 换的是干预单位与标签类型**：

| 项 | S0 / S1 | **S2** |
|---|---|---|
| 干预 | 换掉一个原子动作 | 换掉**主体座位在整局中的策略** |
| 续弈 | 主体阶段 + 下一个敌方阶段（≤256/1024 转换）| **打到自然终局**（上限 6000 步 / 180 秒） |
| 其余座位 | H0 | H0（不变） |
| 随机流 | 每座位 `streamFor(seed, seat)` | **同一合同，不变** |
| 结局标签 | 有界截断下的净歼灭 | **真实自然终局胜负**；截断单列、不计入胜率比较 |
| 起始状态 | 同一批学生轨迹窗口（同一抽样 seed 合同） | 同左 |

**判据（预先写定）**：
1. 只比较**两侧都自然完赛**的 (窗口, seed) 配对；
2. 报三格计数（学生胜 / 对照胜 / 平）与 Wilson 区间；
3. 对「学生胜 vs 对照胜」做**精确二项检验**（p=0.5）；
4. 按 root family 给出逐家族读数，避免把同家族的多个窗口当独立样本；
5. **只有**当配对差异在 0.05 水平上显著、且方向稳定（≥3 个家族同向）时，
   才认为存在可用于训练的改进信号。

**允许的结论边界**：
- 主体座位换策略、其余座位仍是 H0 ⇒ 这不是「学生对 H0」的完整对局，
  而是「同一局面下不同主体策略」的对照，不能直接当成 DEV20 式的胜率；
- 窗口来自学生轨迹，偏向学生访问分布，结论只覆盖这些状态；
- 每窗口 seed 数很少，必须看区间与家族方向，不能只看胜场差。

**命令**：

```powershell
node --openssl-legacy-provider v12/tools/run-tool.mjs v18/tools/fullgame_ab_v18.ts `
  --run-id run_20260927_v18_01 --windows 16 --policies student,h0,b100q `
  --continuation-seeds 2026099901,2026099902 `
  --max-steps 6000 --wall-ms 180000 --out-tag S2fullgame

python v18/tools/analyze_fullgame_ab.py --run-id run_20260927_v18_01 --tag S2fullgame
```

结果见 `counterfactual/fullgame_ab.S2fullgame.json` 与
`counterfactual/fullgame_ab_analysis.S2fullgame.json`。

---

## 3. 预登记的搜索改进 S1（续弈预算）"""


def main() -> int:
    text = io.open(TARGET, encoding="utf-8").read()
    if S2_SECTION in text:
        print("already registered")
        return 0
    if ANCHOR not in text:
        print("ERROR: anchor not found")
        return 2
    io.open(TARGET, "w", encoding="utf-8").write(text.replace(ANCHOR, S2_SECTION, 1))
    print("registered S2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
