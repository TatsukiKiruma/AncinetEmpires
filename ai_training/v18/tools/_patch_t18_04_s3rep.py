"""把 T18-04 第 1 波、S3 独立复核、S4 结果写进总报告与状态文件。可重复执行。"""
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v18" / "out" / "run_20260927_v18_01"


def patch_final() -> None:
    target = RUN / "final_report.md"
    text = io.open(target, encoding="utf-8").read()
    anchor = "### 4b.7 附带完成：价值头的绝对校准（按阶段与来源分开）"
    add = """### 4b.6c S3 独立复核：信号复现且更强

用**全新抽样 seed** 重跑 S3（32 窗口 / 23 家族 / 96 局 × 2 策略），规则与判据逐字不变：

| 面板 | 窗口 | 配对 | 学生胜 / H0 胜 / 平 | 决定性 | 精确二项 p |
|---|---:|---:|---|---:|---:|
| S3（发现） | 16 | 44 | 1 / 8 / 35 | 9 | 0.0391 |
| **独立复核** | 32 | 88 | **5 / 20 / 63** | **25** | **0.0041** |
| **合并** | 48 | 132 | **6 / 28 / 98** | **34** | **0.000195** |

胜率：student 18.75% vs h0 **40.63%**（独立复核）。
⇒ **在平衡局面上按 H0 下棋的胜率约为学生网络的 2.2 倍，独立复核后 p = 0.0002。**
这是 V18 唯一一个经过独立面板复核的正面结果。但方向仍是「更像 H0」，而 H0 模仿上限是 10/20。

### 4b.6d S4：便宜的证据源在平衡局面上**仍然不超过随机**

把同一套平衡判据搬到**单动作成对续弈**（S0 的便宜做法）上，
32 窗口 / 24 家族 / 72 对：

| 指标 | 观测 | 随机重排 P95 | 超过随机 |
|---|---:|---:|---|
| 3-seed 一致率 | 0.8333 | 0.8472 | **否** |
| 留一一致率 | 0.9167 | 0.9259 | **否** |

⇒ **改进信号只有整局 A/B 测得出来**。S3 的 44 个配对花了约 1 小时墙钟，
按此成本扩到任务书要求的 ≥1,000 个改进样本需要数百小时，**本地预算内不可行**。

### 4b.6e T18-04 第 1 波：定向到平衡局面后 **DEV20 由 5/20 降到 4/20**

数据 = targeted 4,133 行（平衡局面，与 S3/S4 同一判据）+ replay 4,000 行
+ V18 修正后的未见输入 val 2,556 行（train/val 家族重叠为空）。
两臂同数据同预算（4,000 更新、seed 42），唯一差异是 KL：

| 模型 | DEV20 | 逐图 | L1 总体 | 3-7 阶段 | 8+ 阶段 | fallback/error |
|---|---:|---|---:|---:|---:|---:|
| 冠军 P1:s2026 | **5/20** | 2,0,2,0,1 | 0.6916 | 0.7166 | 0.4126 | 0 / 0 |
| **U（无约束）** | **4/20** | 2,1,1,0,0 | 0.6750 | **0.7283** | **0.4739** | 0 / 0 |
| **K（KL 0.5）** | **4/20** | 2,1,1,0,0 | 0.6715 | 0.7214 | 0.4732 | 0 / 0 |

三条可复核的结论：
1. **定向训练确实让被针对的区域变好了**（3-7：0.7166→0.7283；8+：0.4126→0.4739），
   但**总体下降**、**胜场下降** ⇒ 又一次实测「离线模仿率不能作为晋升依据」。
2. **KL 约束在本数据本预算下没有可测差别**（DEV20 与逐图逐座位完全相同；
   离线差 ≤0.7pp）。KL 读数在 epoch 2 达峰 0.0920 后单调回落到 0.0325。
   「KL 能防止无益漂移」这个假设在本轮**未获支持**。
3. 原因是**监督方向被 H0 上限锁死**：targeted 的目标仍是「按 H0 下」，
   而完美 H0 模仿者上限是 10/20。

按任务书纪律：**不替换冠军**，且**相同配方不再重复第二波**（已失败且机制上受限）。

### 4b.6f S5：平衡局面上「搜索教师能不能赢过 H0」

这是决定下一步方向的关键一问：若 B100-Q 在平衡局面上显著赢过 H0，
就存在一个**超过 H0 的信息源**、且落在学生最弱的区域 ⇒ 蒸馏它有依据；
若不能，则应转向 T18-06 的结果驱动路线。结果见 `reports/T18_05_report.md`。

### 4b.7 附带完成：价值头的绝对校准（按阶段与来源分开）"""
    if anchor in text and "### 4b.6c S3 独立复核" not in text:
        io.open(target, "w", encoding="utf-8").write(text.replace(anchor, add, 1))
        print("final_report patched")
    else:
        print("final_report already patched or anchor missing")


def patch_status() -> None:
    path = RUN / "task_status.json"
    st = json.loads(io.open(path, encoding="utf-8").read())
    for task in st["tasks"]:
        if task.get("id") == "T18-03":
            for line in (
                "S3 独立复核（全新抽样 seed、32 窗口、96 局×2 策略）：学生胜 5 / H0 胜 20 / 平 63，"
                "决定性 25，精确二项 p=0.0041；与 S3 合并后 6/28/98、p=0.000195 ⇒ 信号复现且更强",
                "S4（把平衡判据搬到便宜的单动作成对续弈）：一致率 0.8333 < 随机 P95 0.8472，"
                "留一 0.9167 < 0.9259 ⇒ 便宜的证据源在平衡局面上仍不超过随机",
                "⇒ 改进信号只有整局 A/B 测得出来；按 S3 的成本（44 配对≈1 小时）扩到 ≥1,000 个样本需数百小时，"
                "本地预算内不可行",
            ):
                if line not in task["keyResults"]:
                    task["keyResults"].append(line)
            for item in (
                "counterfactual/fullgame_ab.S3replication.json",
                "counterfactual/fullgame_ab_analysis.S3replication.json",
                "counterfactual/preference_repeatability.S4balanced.json",
            ):
                if item not in task["evidence"]:
                    task["evidence"].append(item)
        if task.get("id") == "T18-04":
            task["status"] = "PARTIAL / WAVE1_NO_IMPROVEMENT"
            task["evidence"] = [
                "data/t18_04/T18_04_dataset_report.json",
                "data/t18_04/T18_04_wave1_trainval.jsonl",
                "data/t18_04/T18_04_split_manifest.json",
                "data/t18_04_balanced_keys.txt",
                "experiments/T18_04_w1_U/",
                "experiments/T18_04_w1_K/",
                "arena/dev/T18_04_w1_U_final.summary.v18.json",
                "arena/dev/T18_04_w1_K_final.summary.v18.json",
                "reports/T18_04_report.md",
            ]
            task["keyResults"] = [
                "数据集：targeted 4,133 行（平衡局面，与 S3/S4 同一判据）+ replay 4,000 行 + 未见输入 val 2,556 行；train/val 家族重叠为空",
                "两臂同数据同预算（4,000 更新、seed 42、warm start 冠军），唯一差异是 KL 约束",
                "DEV20：U = 4/20、K = 4/20（冠军 5/20），两臂逐图逐座位分解完全相同；fallback/error/判定矛盾均为 0",
                "离线：定向区域确实变好（3-7 阶段 0.7166→0.7283/0.7214；8+ 0.4126→0.4739/0.4732），但总体下降（0.6916→0.6750/0.6715）",
                "⇒ 又一次实测『离线模仿率不能作为晋升依据』：区域指标变好、总分变差、胜场变差",
                "KL 假设未获支持：DEV20 与逐图逐座位与无约束臂完全相同，离线差 ≤0.7pp；KL 读数在 epoch 2 达峰 0.0920 后回落到 0.0325",
                "原因：监督方向仍是『按 H0 下』，被完美 H0 模仿者的 10/20 上限锁死",
                "按任务书纪律：不替换冠军，相同配方不再重复第二波",
            ]
            task["notDone"] = [
                "第 2 / 3 波：不做（相同配方已失败且机制上受限，任务书要求停止）",
                "三 seed 重复（42/1337/2026）：未启动（预登记条件为先有提升）",
                "用 S3 的整局 A/B 筛选『能翻盘的动作』作为新目标：未开始",
            ]
            task["reason"] = "第 1 波无提升且方向受 H0 上限约束；按纪律停止相同配方，转 S5/T18-06 找超过 H0 的信息源。"
    st["overallStatus"] = "PARTIAL_EXECUTION / NO_PROMOTION / IN_PROGRESS_BUDGET_LIMIT"
    io.open(path, "w", encoding="utf-8").write(json.dumps(st, ensure_ascii=False, indent=2) + "\n")
    print("task_status patched")


def patch_progress() -> None:
    path = RUN / "progress.json"
    p = json.loads(io.open(path, encoding="utf-8").read())
    p["phase"] = "T18-00/01 完成；T18-02 部分完成（含判据勘误）；T18-03 找到并独立复核了改进信号；T18-04 第 1 波无提升；T18-05/06 进行中"
    p["t18_03Gates"]["searchImprovements"]["S3replication"] = {
        "passed": True,
        "windows": 32,
        "games": 192,
        "paired": {"bothNatural": 88, "studentWins": 5, "h0Wins": 20, "ties": 63},
        "exactBinomialTwoSidedP": 0.0041,
        "pooledWithS3": {"studentWins": 6, "h0Wins": 28, "decisive": 34, "p": 0.000195},
    }
    p["t18_03Gates"]["searchImprovements"]["S4_balancedSingleAction"] = {
        "passed": False,
        "pairs": 72,
        "unanimousRate": 0.8333,
        "randomP95": 0.8472,
        "meaning": "便宜的单动作证据源在平衡局面上仍不超过随机 ⇒ 信号只有整局 A/B 测得出来",
    }
    p["t18_04"] = {
        "wave1": {
            "arms": {"U": {"dev20": 4}, "K": {"dev20": 4}},
            "champion": 5,
            "verdict": "无提升；KL 无可测差别；定向区域变好但不转化为胜场",
        }
    }
    p["nextActions"] = [
        "读 S5 结果：B100-Q 在平衡局面上是否显著赢过 H0；这是「有没有超过 H0 的信息源」的判据",
        "若 S5 为是：把 B100-Q 在平衡局面上的动作作为新监督目标（不再是 H0），做 T18-04 第 2 波",
        "若 S5 为否：转 T18-06 结果驱动路线，并先写独立算法合同与单轮预算",
        "RECHECK40 / CONFIRM20 仍需等到有候选达到 DEV20 ≥18/20 的前置条件",
    ]
    io.open(path, "w", encoding="utf-8").write(json.dumps(p, ensure_ascii=False, indent=2) + "\n")
    print("progress patched")


def main() -> int:
    patch_final()
    patch_status()
    patch_progress()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
