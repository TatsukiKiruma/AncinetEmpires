"""收尾补丁：更新 T18-03 报告的结论段、未完成项与复现命令，并把 S2/S3 加进 resume 脚本。"""
import io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v18" / "out" / "run_20260927_v18_01"
RPT = RUN / "reports" / "T18_03_report.md"

# ---- 1. 报告结论段：把「两道门都没过」改写成完整诊断链 ----
OLD_HEAD = """**两道门本轮都没有通过。** 按任务书的处置规则，
**不扩容偏好数据**，改为修候选搜索 / 续弈预算 / 标签证据；
**价值头不得接入搜索**。"""

NEW_HEAD = """**两道门按原样都没有通过。** 按任务书的处置规则，
**不扩容偏好数据**，改为修候选搜索 / 续弈预算 / 标签证据；
**价值头不得接入搜索**。

修的过程本身给出了完整诊断链，并且**在第三个改进里找到了信号**：

| 版本 | 改了什么 | 结果 |
|---|---|---|
| S0 | 单动作干预 + 256 转换有界续弈 | 一致率 0.795 / 留一 0.872，**低于**随机基线 0.828 / 0.902 ⇒ 噪声大于信号 |
| S1 | 只把续弈预算提到 1024 转换 | 一致率 0.8125 / 留一 0.8854，仍**低于**随机基线 0.875 / 0.9323；一致改善从 9 个降到 **1** 个 ⇒ 预算不是主因 |
| S2 | 干预单位换成「主体整局策略」，标签换成真实自然终局 | 96 局配对比较 **全部结果相同，零个决定性配对** ⇒ 窗口选错了：这批状态胜负已被局面定死 |
| **S3** | **只换窗口选择规则**：限定「局面未定」区域（阶段 0-2/3-7、双方兵力差 ≤1、双方指挥官存活） | 44 个可比较配对里 **学生胜 1 / H0 胜 8 / 平 35**，精确二项检验 **p = 0.0391（0.05 显著）** ⇒ **信号确实存在** |

**结论**：不是「不存在改进信号」，而是**信号只存在于局面未定的区域**；
在均匀抽样出来的窗口上，无论怎么改干预都测不到东西。

同时另一个关键读数是：**学生在平衡局面上的胜率只有 6.25%（3/48），
远低于它在 DEV20 上的 25%（5/20）** ⇒ 学生的短板集中在**兵力均势的中前期局面**。"""

# ---- 2. 未完成项与复现命令 ----
OLD_TAIL_ANCHOR = "## 5. 未完成项"
NEW_SECTIONS = """## 4b. 下一步（预登记）

按 S3 的诊断，正确的做法不是继续在均匀窗口上加预算，而是：

1. **只在「局面未定」的区域采样**（平衡过滤 + 阶段限制），把窗口数扩到 ≥200，
   估计决定性配对的真实比例与区间（当前 9/44，p 刚过 0.05）；
2. 在**决定性配对**上构造改进样本（同一状态、H0 动作为优选、学生动作为劣选）；
3. 用这些样本做 T18-04 的受约束更新对照（无约束 vs 对冻结冠军 KL + 回放），同数据同预算；
4. **上限提醒**：该改进方向等价于「在这些局面上更像 H0」，
   而完美 H0 模仿者的上限已被实测为 **10/20**；越过 10 需要别的机制。

## 5. 未完成项"""


def main() -> int:
    text = io.open(RPT, encoding="utf-8").read()
    changed = 0
    if NEW_HEAD not in text:
        if OLD_HEAD not in text:
            print("ERROR: head anchor missing")
            return 2
        text = text.replace(OLD_HEAD, NEW_HEAD, 1)
        changed += 1
    if "## 4b. 下一步（预登记）" not in text:
        if OLD_TAIL_ANCHOR not in text:
            print("ERROR: tail anchor missing")
            return 2
        text = text.replace(OLD_TAIL_ANCHOR, NEW_SECTIONS, 1)
        changed += 1
    io.open(RPT, "w", encoding="utf-8").write(text)
    print(f"report updated ({changed} blocks)")

    # ---- 3. resume 脚本加 S2 / S3 ----
    resume = ROOT / "v18" / "scripts" / "resume_v18.ps1"
    rtext = io.open(resume, encoding="utf-8").read()
    if "fullgame_ab_v18.ts" not in rtext:
        rtext = rtext.replace(
            "    'counterfactual' {\n"
            "        $files = (0..4 | ForEach-Object { \"$v17/data/new_train/rollouts/train_student_P1s2026.m$_.jsonl\" }) -join ','\n"
            "        Invoke-Tool @('v18/tools/counterfactual_v18.ts', '--run-id', $RunId, '--rollouts', $files, '--target-windows', '48', '--max-per-root', '3')\n"
            "    }",
            "    'counterfactual' {\n"
            "        $files = (0..4 | ForEach-Object { \"$v17/data/new_train/rollouts/train_student_P1s2026.m$_.jsonl\" }) -join ','\n"
            "        Invoke-Tool @('v18/tools/counterfactual_v18.ts', '--run-id', $RunId, '--rollouts', $files, '--target-windows', '48', '--max-per-root', '3')\n"
            "    }\n"
            "    's1' {\n"
            "        # S1：只把续弈预算提到 1024 转换 / 120 秒，输出到独立文件不覆盖 S0。\n"
            "        $files = (0..4 | ForEach-Object { \"$v17/data/new_train/rollouts/train_student_P1s2026.m$_.jsonl\" }) -join ','\n"
            "        Invoke-Tool @('v18/tools/counterfactual_v18.ts', '--run-id', $RunId, '--rollouts', $files, '--target-windows', '24', '--max-per-root', '2', '--max-transitions', '1024', '--wall-ms', '120000', '--out-tag', 'S1horizon')\n"
            "        & $py v18/tools/analyze_preference_repeatability.py --run-id $RunId --branches \"$run/counterfactual/paired_continuation.S1horizon.branches.jsonl\" --out-name preference_repeatability.S1horizon.json\n"
            "    }\n"
            "    's2' {\n"
            "        # S2：干预单位换成主体整局策略，标签换成真实自然终局。\n"
            "        # 注意：逗号分隔的参数必须加引号，否则 PowerShell 会拆成多个参数。\n"
            "        Invoke-Tool @('v18/tools/fullgame_ab_v18.ts', '--run-id', $RunId, '--windows', '16', '--policies', 'student,h0,b100q', '--continuation-seeds', '2026099901,2026099902', '--max-steps', '6000', '--wall-ms', '180000', '--out-tag', 'S2fullgame')\n"
            "        & $py v18/tools/analyze_fullgame_ab.py --run-id $RunId --tag S2fullgame\n"
            "    }\n"
            "    's3' {\n"
            "        # S3：只换窗口选择规则，限定「局面未定」区域。\n"
            "        Invoke-Tool @('v18/tools/fullgame_ab_v18.ts', '--run-id', $RunId, '--windows', '16', '--policies', 'student,h0', '--continuation-seeds', '2026099901,2026099902,2026099903', '--max-steps', '6000', '--wall-ms', '180000', '--balance-filter', 'balanced', '--sample-seed', '2026099905', '--out-tag', 'S3balanced')\n"
            "        & $py v18/tools/analyze_fullgame_ab.py --run-id $RunId --tag S3balanced\n"
            "    }\n"
            "    'valuegate' {\n"
            "        & $py v18/tools/value_ranking_gate.py --run-id $RunId\n"
            "        & $py v18/tools/value_calibration_v18.py --run-id $RunId\n"
            "    }",
        )
        rtext = rtext.replace(
            "[ValidateSet('identity', 'labels', 'val', 'probe', 'separation', 'rescore', 'arms', 'dev20', 'counterfactual')]",
            "[ValidateSet('identity', 'labels', 'val', 'probe', 'separation', 'rescore', 'arms', 'dev20', 'counterfactual', 's1', 's2', 's3', 'valuegate')]",
        )
        io.open(resume, "w", encoding="utf-8").write(rtext)
        print("resume script updated")
    else:
        print("resume script already updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
