"""把 S3 独立复核（S3replication）与 S5 登记写进 T18-03 报告。可重复执行。"""
import io
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v18" / "out" / "run_20260927_v18_01"


def binom2(k: int, n: int) -> float:
    if n == 0:
        return 1.0
    total = 2 ** n
    p_obs = math.comb(n, k) / total
    acc = 0.0
    for i in range(n + 1):
        p_i = math.comb(n, i) / total
        if p_i <= p_obs + 1e-12:
            acc += p_i
    return min(1.0, acc)


SECTION = """## 2f. S3 独立复核：**信号复现且更强**

产物：`counterfactual/fullgame_ab.S3replication.json`、
`counterfactual/fullgame_ab_analysis.S3replication.json`。

复核用**全新的抽样 seed**（2026099911）、32 个窗口、23 个 root 家族、96 局 × 2 策略。
窗口选择规则、干预方式、随机流合同与 S3 **完全一致**，只有抽样 seed 和窗口数不同。

| 面板 | 窗口 | 配对（双方自然完赛） | 学生胜 / H0 胜 / 平 | 决定性 | 精确二项 p（双侧） |
|---|---:|---:|---|---:|---:|
| S3（发现） | 16 | 44 | 1 / 8 / 35 | 9 | 0.0391 |
| **S3 独立复核** | 32 | 88 | **5 / 20 / 63** | **25** | **0.0041** |
| **合并** | 48 | 132 | **6 / 28 / 98** | **34** | **0.000195** |

胜率（按局）：

| 策略 | S3 | 独立复核 |
|---|---|---|
| student | 3/48 = 0.0625 | 18/96 = **0.1875**（Wilson [0.122, 0.277]） |
| h0 | 13/48 = 0.2708 | 39/96 = **0.4063**（Wilson [0.314, 0.506]） |

⇒ **在平衡局面上，按 H0 下棋的胜率大约是学生网络的 2.2 倍，独立复核后 p = 0.0002。**
这是 V18 唯一一个**经过独立面板复核**的正面结果。

**仍须记住的限制**：
- 改进方向是「在这些局面上更像 H0」，而完美 H0 模仿者的上限已被实测为 **10/20**；
- 98/132 个配对仍然是平局（两策略同结果）⇒ 干预只在约 **26%** 的平衡局面上起作用；
- 主体座位换策略、其余座位仍是 H0，不是 DEV20 式的完整对局。

## 2g. S5：平衡局面上「搜索教师能不能赢过 H0」——为什么这是关键一问

T18-04 第 1 波已实测：把 targeted 定向到平衡局面、目标仍是 H0 的动作，
DEV20 从 5/20 掉到 4/20（见 `reports/T18_04_report.md`）。
原因是**监督方向本身被 H0 上限锁死**。

因此下一个决定性的问题是：**在这批平衡局面上，B100-Q 能不能赢过 H0？**
- 如果能（且显著），说明存在一个**超过 H0 的信息源**，且它就落在学生最弱的区域里
  ⇒ 蒸馏它是有依据的，而不是又一次模仿 H0；
- 如果不能，则「用搜索教师突破 10/20」这条路线在平衡局面上也没有依据，
  应当转向 T18-06 的结果驱动路线。

**S5 预登记**：窗口规则与 S3 相同（平衡局面），抽样 seed 2026099931，16 窗口，
策略 `student,h0,b100q`，3 个续弈 seed，判据与 S3 逐字相同（配对 + 精确二项检验）。
结果见 `counterfactual/fullgame_ab.S5balancedTeacher.json`。

---

"""


def main() -> int:
    rpt = RUN / "reports" / "T18_03_report.md"
    text = io.open(rpt, encoding="utf-8").read()
    if "## 2f. S3 独立复核" in text:
        print("already patched")
        return 0
    anchor = "## 3. 预登记的搜索改进 S1（续弈预算）"
    if anchor not in text:
        print("ERROR: anchor missing", file=sys.stderr)
        return 2
    io.open(rpt, "w", encoding="utf-8").write(text.replace(anchor, SECTION + anchor, 1))
    print("T18_03_report.md patched")
    print("pooled p =", binom2(6, 34))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
