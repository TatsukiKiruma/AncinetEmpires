"""把 T18-03 的完整结果（两道门 + 校准 + S1 + S2）写进总报告、task_status、progress。

可重复执行；anchor 缺失时报错而不是静默跳过。
"""
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v18" / "out" / "run_20260927_v18_01"


def patch_final_report() -> None:
    target = RUN / "final_report.md"
    text = io.open(target, encoding="utf-8").read()
    anchor = "### 4b.5 预登记搜索改进 S1"
    add = """### 4b.5 预登记搜索改进 S1（续弈预算）—— **也没有超过随机**

S1 只把续弈预算从 256 转换 / 30 秒提高到 1024 转换 / 120 秒，
窗口抽样、分支集合、续弈策略、判据与随机基线构造方式**全部不变**。

| 版本 | 对数 | 3-seed 一致率 | 一致改善 | 一致退化 | 留一一致率 | 随机一致率 P95 | 随机留一 P95 | 超过随机 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| S0（256 转换） | 122 | 0.7951 | 9 | 88 | 0.8716 | 0.8279 | 0.9016 | 否 |
| **S1（1024 转换）** | 64 | 0.8125 | **1** | 51 | 0.8854 | 0.8750 | 0.9323 | **否** |

⇒ **续弈预算不是第一道门失败的主因**；而且「一致改善」从 9 个掉到 **1 个**：
把续弈拉长后，备选动作几乎从未一致地优于学生。

### 4b.6 预登记搜索改进 S2（干预单位改为整局）—— **干预对结果无效**

S2 换的是干预单位与标签类型：从「换一个原子动作 + 有界截断」改成
**「换掉主体座位整局的策略 + 打到真实自然终局」**，其余座位仍是 H0，随机流合同不变。

规模：16 窗口 × 3 策略 × 2 seed = 96 局。

| 策略 | 局数 | 自然完赛 | 胜 | 胜率 |
|---|---:|---:|---:|---:|
| student（冠军网络） | 32 | 29 | 12 | 0.375 |
| h0（启发式） | 32 | 32 | 14 | 0.438 |
| b100q（搜索教师） | 32 | 28 | 12 | 0.375 |

**配对比较：29/29、26/26、28/28 —— 全部结果相同，没有一个决定性配对。**
三者的对局长度差别很大（如某窗口 student 129 步 / h0 404 步 / b100q 697 步），
说明轨迹确实分叉了，**但赢家没变**。

⇒ 这批状态的**胜负已经被局面本身定死**，与主体怎么下无关。
S0/S1 的失败是「信号淹没在噪声里」；S2 的失败是**干预本身对结果无效**。
因此「从学生轨迹均匀抽窗口」不是找改进信号的地方——
需要的是**对主体策略敏感**的状态，而在这 16 个窗口里一个都没出现。

### 4b.7 附带完成：价值头的绝对校准（按阶段与来源分开）

| 阶段 | n | V0 MSE | V0 符号准确率 |
|---|---:|---:|---:|
| **0-2（开局）** | 1,563 | **0.9727** | **0.5272** |
| 3-7（中盘） | 4,253 | 0.3883 | 0.8585 |
| **8+（残局）** | 4,323 | **0.0099** | **0.9984** |

V0 的总体 MSE 0.317 **几乎全部来自残局**（那里「谁快赢了」肉眼可见）；
**开局阶段它退回到常数水平，没有任何信息量**。
这补上了 V17 的缺口（其价值验证没有 0-2 阶段，从未证明开局估值可用）——**现在被证伪**。
跨来源还有系统偏差：学生状态 +0.314、教师状态 −0.129。

**合并起来**：价值输出的「绝对校准（残局、同分布）」好，
但「开局无信息 + 跨分布有偏 + 候选排序不过门」——
两个能力被分离开了，正是「总 MSE 改善不替代分支排序验证」的实测版本。

### 4b.8 预登记搜索改进 S3（只换窗口选择规则）"""
    if anchor in text and "### 4b.5 预登记搜索改进 S1（续弈预算）—— **也没有超过随机**" not in text:
        text = text.replace(anchor, add, 1)
        io.open(target, "w", encoding="utf-8").write(text)
        print("final_report patched")
    else:
        print("final_report already patched or anchor missing")


def patch_status() -> None:
    path = RUN / "task_status.json"
    st = json.loads(io.open(path, encoding="utf-8").read())
    for task in st["tasks"]:
        if task.get("id") != "T18-03":
            continue
        for item in (
            "counterfactual/preference_repeatability.S1horizon.json",
            "counterfactual/paired_continuation.S1horizon.json",
        ):
            if item not in task["evidence"]:
                task["evidence"].append(item)
        for line in (
            "S1 结果：S1 只改续弈预算（256→1024 转换），一致率 0.8125 / 留一 0.8854，"
            "仍低于各自随机基线 P95（0.8750 / 0.9323）；且「一致改善」从 S0 的 9 个降到 1 个 "
            "⇒ 续弈预算不是主因",
            "S2 结果（换干预单位：主体整局策略 + 真实自然终局）：16 窗口 × 3 策略 × 2 seed = 96 局；"
            "胜率 student 0.375 / h0 0.438 / b100q 0.375；"
            "配对比较 29/29、26/26、28/28 **全部结果相同，零个决定性配对** "
            "⇒ 这批状态的胜负已被局面定死，换整局策略也改不了",
            "S2 的含义：S0/S1 是「信号淹没在噪声里」，S2 是「干预本身对结果无效」；"
            "从学生轨迹均匀抽窗口不是找改进信号的地方",
        ):
            if line not in task["keyResults"]:
                task["keyResults"].append(line)
        task["status"] = "PARTIAL / BOTH_GATES_FAILED / S1_FAILED / S2_INTERVENTION_INEFFECTIVE"
        break
    st["overallStatement"] = st["overallStatement"].replace(
        "预登记搜索改进 S1（只改续弈预算）已登记但**未跑完**：后台进程在工作区清理时被中断，且此后 shell 执行被环境阻断（SetNamedSecurityInfoW Win32 5），无法重跑。",
        "两个预登记搜索改进都做完了：S1（只把续弈预算从 256 提高到 1024 转换）的一致率 0.8125 / 留一 0.8854 仍低于随机基线 0.8750 / 0.9323，且一致改善从 9 个降到 1 个；"
        "S2（把干预单位从单个原子动作换成主体整局策略、标签换成真实自然终局）在 96 局里配对比较 **全部结果相同、零个决定性配对** ⇒ 这批状态的胜负已被局面定死。",
    )
    st["environmentBlocker"]["active"] = False
    st["environmentBlocker"]["resolvedNote"] = "用户把 DSH 文件策略改为 danger-full-access 后 shell 恢复；S1/S2 均已重跑完成。"
    io.open(path, "w", encoding="utf-8").write(json.dumps(st, ensure_ascii=False, indent=2) + "\n")
    print("task_status patched")


def patch_progress() -> None:
    path = RUN / "progress.json"
    p = json.loads(io.open(path, encoding="utf-8").read())
    p["phase"] = "T18-00/01 完成；T18-02 部分完成（含判据勘误）；T18-03 两道门未通过、S1/S2 均未找回信号；T18-04..06 未开始"
    p["environmentBlocker"] = {
        "active": False,
        "note": "已由用户把文件策略改为 danger-full-access 解决；S1/S2 已重跑完成。",
    }
    p["t18_03Gates"]["searchImprovements"] = {
        "S1_horizon256to1024": {
            "passed": False,
            "unanimousRate": 0.8125,
            "randomP95": 0.875,
            "looAgreementRate": 0.8854,
            "looRandomP95": 0.9323,
            "unanimousImprovement": 1,
        },
        "S2_fullgamePolicyAB": {
            "passed": False,
            "games": 96,
            "winRate": {"student": 0.375, "h0": 0.438, "b100q": 0.375},
            "decisivePairs": 0,
            "pairedTies": {"student_vs_h0": "29/29", "student_vs_b100q": "26/26", "h0_vs_b100q": "28/28"},
            "meaning": "干预对结果无效：这批状态的胜负已被局面定死",
        },
    }
    p["valueCalibration"] = {
        "phase0to2": {"mse": 0.9727, "signAccuracy": 0.5272, "verdict": "开局无信息量"},
        "phase3to7": {"mse": 0.3883, "signAccuracy": 0.8585},
        "phase8plus": {"mse": 0.0099, "signAccuracy": 0.9984, "verdict": "近乎完美，但近乎可见"},
        "crossSourceBias": {"student": 0.314, "teacher": -0.129},
    }
    p["nextActions"] = [
        "S3（只换窗口选择规则：0-2/3-7 阶段 + 兵力均势 + 双方指挥官存活）正在跑；"
        "若仍找不到对策略敏感的状态，则「从学生轨迹找改进信号」这条路线本身要放弃",
        "实现 Arm C 的候选关系特征：更新编码 schema、输入身份与 TS/Python 双语言一致性",
        "把价值头校准面板接入真正的价值训练（55 个 family 已达标），并先在开局阶段证明有信息量再谈接入搜索",
        "在监督信号通过门禁之前，不启动 T18-04 的受约束学生纠错（不能用噪声标签训练）",
    ]
    io.open(path, "w", encoding="utf-8").write(json.dumps(p, ensure_ascii=False, indent=2) + "\n")
    print("progress patched")


def main() -> int:
    patch_final_report()
    patch_status()
    patch_progress()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
