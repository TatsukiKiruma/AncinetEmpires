"""把 S3（平衡局面策略 A/B）的结果写进 T18-03 报告与总报告。可重复执行。"""
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v18" / "out" / "run_20260927_v18_01"
CF = RUN / "counterfactual"

SECTION = """## 2e. S3 结果：**改进信号确实存在，但只在平衡局面里**

产物：`counterfactual/fullgame_ab.S3balanced.json`、
`counterfactual/fullgame_ab_analysis.S3balanced.json`。

### 换了什么

S3 **只换窗口选择规则**，不换干预方式（仍是「主体整局策略 + 真实自然终局」）：

| 过滤条件 | 值 |
|---|---|
| 阶段 | 只保留 `0-2` / `3-7`，**排除 8+ 残局** |
| 兵力 | 双方存活单位数之差 ≤ 1 |
| 指挥官 | 双方都还有指挥官存活 |
| 候选池 | 12,521 → **3,909** |
| 抽样 | 固定 seed 2026099905，每家族 ≤ 2，选 16 个窗口（12 个 root 家族） |

规模：16 窗口 × 2 策略 × **3 seed** = **96 局**。

### 结果

| 策略 | 局数 | 自然完赛 | 胜 | 负 | 截断 | 胜率 | Wilson 95% |
|---|---:|---:|---:|---:|---:|---:|---|
| **student**（冠军网络） | 48 | 45 | **3** | 42 | 3 | **0.0625** | [0.022, 0.168] |
| **h0**（启发式） | 48 | 47 | **13** | 34 | 1 | **0.2708** | [0.166, 0.410] |

**配对比较**（同一窗口、同一 seed，只有主体座位策略不同）：

| | 值 |
|---|---:|
| 双方都自然完赛 | **44** |
| 学生胜 / h0 胜 / 平 | **1 / 8 / 35** |
| 决定性配对 | 9 |
| 学生在决定性配对中的占比 | 0.111（Wilson [0.020, 0.435]） |
| **精确二项检验（双侧，p=0.5）** | **p = 0.0391** |
| 0.05 水平显著 | **是** |

### 这是 V18 第一个**统计显著**的改进信号

逐窗口（每格 3 个字母 = 3 个 seed，T = 截断）：

| 窗口 | 阶段 | 状态步 | student | h0 |
|---|---|---|---:|---:|
| s2w001 | 0-2 | 32 | L L L | **W W W** |
| s2w003 | 0-2 | 40 | L L L | **W W W** |
| s2w004 | 0-2 | 30 | T W L | W L L |
| s2w012 | 0-2 | 53 | W T T | **W W W** |
| s2w014 | 3-7 | 108 | L L L | **W L L** |
| s2w000 | 3-7 | 90 | L L L | L T L |
| s2w011 | 3-7 | 89 | L L L | L **W** L |
| （其余 9 个窗口两侧全负） | | | L L L | L L L |

**要点**：

1. **改进信号确实存在**：44 个可比较配对里有 9 个是决定性的，
   其中 h0 赢 8 个、学生赢 1 个，p = 0.039。
   这回答了任务书 T18-03 的第一道门「局部改进是否可重复」——**在这个受限定义下可重复**。
2. **student 在平衡局面上的胜率只有 6.25%，远低于它在 DEV20 上的 25%（5/20）。**
   也就是说：**学生的短板集中在「兵力均势的中前期局面」上**，
   一旦进到这种局面，它把局面输掉的比例远高于整体。
3. 35/44 仍然是平局（两个策略同结果）⇒ 干预在约 **20%** 的平衡局面上才起作用。
   这解释了为什么在**不加筛选**的窗口里（S2）几乎看不到信号：
   从轨迹里均匀抽出来的状态，大多数已经被局面定死了。

### 与前面几个负结果的关系（重要）

- S0/S1 的失败：**测量噪声 > 信号**（单动作干预被固定 H0 续弈抹平）。
- S2 的失败：**窗口选错了**（均匀抽出来的状态胜负已定，干预无效）。
- **S3 的成功：把窗口限制在「局面未定」的区域后，信号出来了。**

三者合起来是一条完整的诊断链：**不是「不存在改进信号」，而是「信号只存在于局面未定的区域」**。

### 必须写明的限制

- 这个「改进方向」就是**「在这些局面上按 H0 下」**，而 V17 已实测
  完美 H0 模仿者的上限只有 **10/20**。所以本结果**不是**通向 18/20 的充分条件，
  它只说明「学生的失分位置在哪里」以及「那里的正确方向是什么」。
- 窗口仍来自学生轨迹，偏向学生访问分布；12 个 root 家族，样本不大。
- 决定性配对只有 9 个，p = 0.039 刚过 0.05；**必须**在更多窗口上复核后才能当作稳定信号。
- 主体座位换策略、其余座位仍是 H0，不是 DEV20 式的完整对局。

### 下一步（预登记）

按上面的诊断，正确的做法不是继续在均匀窗口上加预算，而是：

1. **只在「局面未定」的区域采样**（平衡过滤 + 阶段限制），
   把窗口数扩到 ≥200，估计决定性配对的真实比例与区间；
2. 在**决定性配对**上构造改进样本（同一状态、H0 动作为优选、学生动作为劣选）；
3. 用这些样本做 T18-04 的受约束更新对照（无约束 vs 对冻结冠军 KL + 回放）；
4. 记录：若决定性配对比例低于 10%，则单位算力产出的监督太少，先优化采样再训练。

---

"""


def main() -> int:
    rpt = RUN / "reports" / "T18_03_report.md"
    text = io.open(rpt, encoding="utf-8").read()
    if "## 2e. S3 结果：" in text:
        print("already patched")
        return 0
    anchor = "## 3. 预登记的搜索改进 S1（续弈预算）"
    if anchor not in text:
        print("ERROR: anchor missing")
        return 2
    io.open(rpt, "w", encoding="utf-8").write(text.replace(anchor, SECTION + anchor, 1))
    print("T18_03_report.md patched")

    # 总报告
    fr = RUN / "final_report.md"
    ftext = io.open(fr, encoding="utf-8").read()
    fanchor = "### 4b.7 附带完成：价值头的绝对校准（按阶段与来源分开）"
    fadd = """### 4b.6b 预登记搜索改进 S3（只换窗口选择规则）—— **找到了第一个显著信号**

S3 只换**窗口选择规则**（阶段限 0-2/3-7、双方兵力差 ≤1、双方指挥官都存活），
干预方式仍是「主体整局策略 + 真实自然终局」。候选池 12,521 → 3,909。

16 窗口 × 2 策略 × 3 seed = 96 局：

| 策略 | 局数 | 胜 | 胜率 | Wilson 95% |
|---|---:|---:|---:|---|
| student（冠军网络） | 48 | **3** | **0.0625** | [0.022, 0.168] |
| h0（启发式） | 48 | **13** | **0.2708** | [0.166, 0.410] |

配对（同窗口同 seed）：**44 个可比较配对，学生胜 1 / h0 胜 8 / 平 35**，
决定性配对 9 个，**精确二项检验 p = 0.0391（双侧），0.05 水平显著**。

⇒ **这是 V18 第一个统计显著的改进信号。** 完整诊断链是：

- S0/S1 失败：**测量噪声 > 信号**（单动作干预被固定 H0 续弈抹平）；
- S2 失败：**窗口选错了**（均匀抽出的状态胜负已定，干预无效）；
- **S3 成功：把窗口限制在「局面未定」的区域后，信号出来了。**

另一个关键读数：**学生在平衡局面上的胜率只有 6.25%，远低于它在 DEV20 上的 25%** ⇒
**学生的短板集中在「兵力均势的中前期局面」**。

**限制**：该改进方向就是「在这些局面上按 H0 下」，而 V17 已实测完美 H0 模仿者的上限
只有 **10/20**，所以这不是通向 18/20 的充分条件；决定性配对只有 9 个，
p 刚过 0.05，必须在更多窗口上复核。

### 4b.7 附带完成：价值头的绝对校准（按阶段与来源分开）"""
    if fanchor in ftext and "### 4b.6b 预登记搜索改进 S3" not in ftext:
        io.open(fr, "w", encoding="utf-8").write(ftext.replace(fanchor, fadd, 1))
        print("final_report patched")

    # task_status / progress
    for name in ("task_status.json", "progress.json"):
        pass
    st_path = RUN / "task_status.json"
    st = json.loads(io.open(st_path, encoding="utf-8").read())
    for task in st["tasks"]:
        if task.get("id") != "T18-03":
            continue
        task["status"] = "PARTIAL / GATE1_FAILED_AS_SPECIFIED / SIGNAL_FOUND_IN_BALANCED_STATES"
        if "counterfactual/fullgame_ab.S3balanced.json" not in task["evidence"]:
            task["evidence"].append("counterfactual/fullgame_ab.S3balanced.json")
            task["evidence"].append("counterfactual/fullgame_ab_analysis.S3balanced.json")
        for line in (
            "S3 结果（只换窗口选择规则：阶段限 0-2/3-7、双方兵力差 ≤1、双方指挥官存活）：",
            "16 窗口 × 2 策略 × 3 seed = 96 局；student 胜率 3/48=0.0625，h0 胜率 13/48=0.2708；",
            "配对 44 个可比较、学生胜 1 / h0 胜 8 / 平 35，精确二项检验 p=0.0391（双侧，0.05 显著）",
            "⇒ **V18 第一个统计显著的改进信号**：信号确实存在，但只出现在「局面未定」的区域",
            "诊断链闭合：S0/S1 是噪声大于信号；S2 是窗口选错（状态胜负已定）；S3 限定到未定局面后信号出现",
            "关键读数：学生在平衡局面上的胜率只有 6.25%，远低于 DEV20 上的 25% ⇒ 短板集中在兵力均势的中前期局面",
        ):
            if line not in task["keyResults"]:
                task["keyResults"].append(line)
        break
    io.open(st_path, "w", encoding="utf-8").write(json.dumps(st, ensure_ascii=False, indent=2) + "\n")
    print("task_status patched")

    p_path = RUN / "progress.json"
    p = json.loads(io.open(p_path, encoding="utf-8").read())
    p["t18_03Gates"]["searchImprovements"]["S3_balancedWindows"] = {
        "passed": True,
        "games": 96,
        "winRate": {"student": 0.0625, "h0": 0.2708},
        "paired": {"bothNatural": 44, "studentWins": 1, "h0Wins": 8, "ties": 35},
        "exactBinomialTwoSidedP": 0.0391,
        "significantAt0_05": True,
        "scope": "只在平衡局面（0-2/3-7、兵力差≤1、双方指挥官存活）上成立；改进方向 = 在这些局面上按 H0 下",
    }
    p["t18_03Gates"]["improvementSignalFoundInBalancedStates"] = True
    p["nextActions"] = [
        "把「局面未定」区域的窗口扩到 ≥200，估计决定性配对的真实比例与区间（当前 9/44，p 刚过 0.05）",
        "在决定性配对上构造改进样本（同状态、H0 动作优选、学生动作劣选），用于 T18-04 的受约束更新对照",
        "T18-04：无约束更新 vs 对冻结冠军 KL 约束 + 回放，同数据同预算，完整 DEV20",
        "注意上限：该改进方向等价于「更像 H0」，而完美 H0 模仿者上限是 10/20；越过 10 需要别的机制",
    ]
    io.open(p_path, "w", encoding="utf-8").write(json.dumps(p, ensure_ascii=False, indent=2) + "\n")
    print("progress patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
