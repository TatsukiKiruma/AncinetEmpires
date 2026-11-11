"""把 S2（完整对局策略 A/B）的结果写进 T18-03 报告。可重复执行。"""
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v18" / "out" / "run_20260927_v18_01"
CF = RUN / "counterfactual"

SECTION = """## 2d. S2 结果：从这些状态出发，**换掉主体整局策略也改不了胜负**

产物：`counterfactual/fullgame_ab.S2fullgame.json`、
`counterfactual/fullgame_ab_analysis.S2fullgame.json`。

规模：16 个窗口（15 个 root 家族）× 3 个策略 × 2 个 seed = **96 局**，
全部从同一精确状态、同一每座位随机流出发，只有主体座位的策略不同。

### 总量

| 策略 | 局数 | 自然完赛 | 胜 | 负 | 截断 | 胜率 | Wilson 95% |
|---|---:|---:|---:|---:|---:|---:|---|
| student（冠军网络） | 32 | 29 | 12 | 17 | 3 | 0.375 | [0.23, 0.55] |
| h0（启发式） | 32 | 32 | 14 | 18 | 0 | 0.438 | [0.28, 0.61] |
| b100q（搜索教师） | 32 | 28 | 12 | 16 | 4 | 0.375 | [0.23, 0.55] |

### 配对比较（这是关键）

| 配对 | 双方都自然完赛 | A 胜 | B 胜 | **平（结果相同）** |
|---|---:|---:|---:|---:|
| student vs h0 | 29 | **0** | **0** | **29** |
| student vs b100q | 26 | **0** | **0** | **26** |
| h0 vs b100q | 28 | **0** | **0** | **28** |

**每一个可比较的配对里，两个策略给出完全相同的胜负结果。**

而三者的对局长度差别很大（例如 s2w000：student 129 步 / h0 404 步 / b100q 697 步），
说明轨迹确实分叉了、动作确实不同——**但赢家没变**。

### 逐窗口

| 窗口 | 阶段 | 状态步 | 原局结果 | student | h0 | b100q |
|---|---|---|---|---:|---:|---:|
| s2w000 | 8+ | 8329 | win | W W | W W | W W |
| s2w001 | 0-2 | 6 | loss | L L | L L | L L |
| s2w002 | 3-7 | 117 | win | T T | W W | W W |
| s2w003 | 0-2 | 41 | win | W W | W W | W W |
| s2w004 | 8+ | 233 | loss | L T | L L | T T |
| s2w005 | 3-7 | 142 | loss | L L | L L | L L |
| s2w006 | 3-7 | 103 | loss | L L | L L | L L |
| s2w007 | 3-7 | 152 | win | W W | W W | T T |
| s2w008 | 0-2 | 27 | win | W W | W W | W W |
| s2w009 | 0-2 | 42 | win | W W | W W | W W |
| s2w010 | 8+ | 334 | loss | L L | L L | L L |
| s2w011 | 0-2 | 23 | loss | L L | L L | L L |
| s2w012 | 8+ | 466 | loss | L L | L L | L L |
| s2w013 | 8+ | 235 | loss | L L | L L | L L |
| s2w014 | 3-7 | 77 | loss | L L | L L | L L |
| s2w015 | 3-7 | 149 | win | W W | W W | W W |

（每格两个字母 = 两个 seed；T = 截断。**「原局结果」是窗口来自的那一局，
不是本次 A/B 的结果**，放在这里只为说明窗口池的来源分布。）

### 怎么读这个结果

1. **这不是「测量噪声」问题，而是「干预无效」问题。**
   S0/S1 的失败是「信号淹没在噪声里」；S2 的失败是「换掉整局策略，结果一模一样」——
   说明**这批状态本身已经把胜负定死了**，无论主体怎么下。
2. 5 个 8+ 阶段的窗口（其中一个是第 8329 个原子步）本来就接近终局，结果锁定不奇怪；
   但 **5 个 0-2 阶段的窗口（第 6–42 步）同样是三种策略同结果**，这个更值得注意。
3. 因此「从学生轨迹里均匀抽窗口」**不是找改进信号的地方**。
   要找的是**对主体策略敏感**的状态，而在这 16 个窗口里一个都没出现。

### 必须写明的限制

- 窗口来自学生自己的轨迹，偏向学生访问分布；结论只覆盖这 16 个状态。
- 每个窗口只有 2 个 seed，对单个窗口而言证据很弱；
  但「29/29 全平」这个整体模式不是单窗口噪声能解释的。
- 主体座位换策略、其余座位仍是 H0 ⇒ 这不是 DEV20 式的完整对局，不能直接当胜率用。
- **不能**由此推出「在这五图上主体策略永远不重要」——B100-Q 在 DEV20 上是 12/20、
  冠军是 5/20，策略显然是有影响的。本结果只说**这批状态**对干预不敏感。

---

"""


def main() -> int:
    rpt = RUN / "reports" / "T18_03_report.md"
    text = io.open(rpt, encoding="utf-8").read()
    marker = "## 2d. S2 结果："
    if marker in text:
        print("already patched")
        return 0
    anchor = "## 3. 预登记的搜索改进 S1（续弈预算）"
    if anchor not in text:
        print("ERROR: anchor missing")
        return 2
    io.open(rpt, "w", encoding="utf-8").write(text.replace(anchor, SECTION + anchor, 1))
    print("T18_03_report.md patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
