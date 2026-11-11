"""把价值校准的结论指针写进 T18-03 报告与 task_status。可重复执行。"""
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v18" / "out" / "run_20260927_v18_01"
RPT = RUN / "reports" / "T18_03_report.md"

ANCHOR = """### 2.4b 校准集：修好数据缺陷后**已达标**"""
ADD = """### 2.4a 附带完成的**绝对校准**读数（按阶段与来源分开）

分报告：`reports/T18_03_value_calibration.md`；产物：`counterfactual/value_calibration_v18.json`。

任务书 T18-03 要求「分开评估开局、中盘、残局和学生分布」。实测（10,139 个有自然终局的行）：

| 阶段 | n | V0 MSE | V0 符号准确率 |
|---|---:|---:|---:|
| **0-2（开局）** | 1,563 | **0.9727** | **0.5272** |
| 3-7（中盘） | 4,253 | 0.3883 | 0.8585 |
| **8+（残局）** | 4,323 | **0.0099** | **0.9984** |

⇒ V0 的总体 MSE 0.317 **几乎全部来自残局**（那里「谁快赢了」肉眼可见）；
**在开局阶段它退回到常数水平，没有任何信息量**。
这正好补上 V17 的缺口：V17 的价值验证没有 0-2 阶段，所以「开局估值可用」从未被证明——**现在被证伪**。

跨来源还有系统偏差：学生状态 **+0.314**、教师状态 **−0.129**。
⇒ 价值头**没有跨分布校准**，即使只用它做叶评估也需要按来源分别校准。

**合并起来**：绝对校准（残局、同分布）好，但开局无信息、跨分布有偏、候选排序不过门。
两个能力被分离开了——这正是「总 MSE 改善不替代分支排序验证」的实测版本。

### 2.4b 校准集：修好数据缺陷后**已达标**"""


def main() -> int:
    text = io.open(RPT, encoding="utf-8").read()
    if ADD not in text:
        if ANCHOR not in text:
            print("ERROR: report anchor not found")
            return 2
        io.open(RPT, "w", encoding="utf-8").write(text.replace(ANCHOR, ADD, 1))
        print("report patched")
    else:
        print("report already patched")

    st_path = RUN / "task_status.json"
    st = json.loads(io.open(st_path, encoding="utf-8").read())
    for task in st["tasks"]:
        if task.get("id") != "T18-03":
            continue
        ev = task["evidence"]
        for item in ("counterfactual/value_calibration_v18.json", "reports/T18_03_value_calibration.md"):
            if item not in ev:
                ev.append(item)
        kr = task["keyResults"]
        line = ("绝对校准按阶段分开评估：V0 在残局近乎完美（MSE 0.0099、符号 99.8%），"
                "在开局退回常数水平（MSE 0.9727、符号 52.7%）⇒ 开局估值无信息量，"
                "补上了 V17 没有 0-2 阶段、从未证明开局估值可用的缺口")
        if line not in kr:
            kr.append(line)
        line2 = ("跨来源校准有系统偏差：学生状态 +0.314、教师状态 −0.129 ⇒ 价值头没有跨分布校准")
        if line2 not in kr:
            kr.append(line2)
        break
    io.open(st_path, "w", encoding="utf-8").write(json.dumps(st, ensure_ascii=False, indent=2) + "\n")
    print("task_status patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
