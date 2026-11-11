"""最后一段补丁：把 S5、T18-04/05/06 的最终状态写进总报告。可重复执行。"""
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v18" / "out" / "run_20260927_v18_01"


def main() -> int:
    target = RUN / "final_report.md"
    text = io.open(target, encoding="utf-8").read()

    anchor = "### 4b.7 附带完成：价值头的绝对校准（按阶段与来源分开）"
    add = """### 4b.6g S5：平衡局面上三个策略的整局 A/B（决定路线的一问）

16 窗口 / 15 家族 / 3 续弈 seed，策略 `student,h0,b100q`。

| 策略 | 局数 | 自然完赛 | 胜 | 截断 | 截断率 |
|---|---:|---:|---:|---:|---:|
| student | 48 | 47 | 17 | 1 | 2% |
| h0 | 48 | 46 | 20 | 2 | 4% |
| **b100q** | 48 | 34 | 17 | **14** | **29%** |

| 配对 | 双方自然完赛 | A 胜 | B 胜 | 平 | 决定性 | 精确二项 p |
|---|---:|---:|---:|---:|---:|---:|
| student vs h0 | 45 | 1 | 5 | 39 | 6 | 0.2188 |
| **student vs b100q** | 33 | **0** | **6** | 27 | 6 | **0.0312** ✔ |
| h0 vs b100q | 33 | 2 | 7 | 24 | 9 | 0.1797 |

**合并三个面板（S3 + 独立复核 + S5）的 student vs h0**：

| 面板 | 配对 | 学生胜 | H0 胜 | 决定性 |
|---|---:|---:|---:|---:|
| S3 | 44 | 1 | 8 | 9 |
| S3 独立复核 | 88 | 5 | 20 | 25 |
| S5 | 45 | 1 | 5 | 6 |
| **合并** | **177** | **7** | **33** | **40** |

**精确二项检验 p = 0.000042。**
⇒ 「平衡局面上按 H0 下显著优于学生网络」现在是**三个独立面板一致的结论**。

**但 S5 真正要问的问题没有解决**：B100-Q 相对 H0 只是方向性占优（2:7，p=0.18），
而且它的截断率是 H0 的 7 倍（29% vs 4%）——被截断的很可能是更长、更接近失败的对局，
所以「自然完赛内胜率 50%」**可能被高估**。
⇒ **「存在超过 H0 的信息源」这一点本轮不足以确立。**
按实测速度，要在无混杂下拿到 60 个决定性配对需要 10 小时以上，超出本轮本地预算。

### 4b.7 附带完成：价值头的绝对校准（按阶段与来源分开）"""
    if "### 4b.6g S5：" not in text:
        if anchor not in text:
            print("ERROR: anchor missing")
            return 2
        text = text.replace(anchor, add, 1)
        print("final_report: S5 section added")

    # 收尾：把「未完成项」一节更新成最终状态
    old_tail = "| T18-06 结果驱动优化 | NOT_STARTED | 触发条件未走到 |"
    new_tail = """| T18-04 第 1 波（定向平衡局面 + KL 对照） | **PARTIAL / 无提升** | U/K 均 4/20（冠军 5/20）；KL 无可测差别 |
| T18-05 闭环选型 | **PARTIAL / 无晋升** | DEV20 台账齐全；RECHECK40 manifest 已冻结但未运行；CONFIRM20 未运行 |
| T18-06 结果驱动 | **PARTIAL / 合同已写、分支未执行** | 触发条件「两轮蒸馏无收益」只完成一轮，且 B100-Q 相对 H0 的优势未确立 |"""
    if old_tail in text and "T18-04 第 1 波（定向平衡局面 + KL 对照）" not in text:
        text = text.replace(old_tail, new_tail, 1)
        print("final_report: tail updated")

    io.open(target, "w", encoding="utf-8").write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
