"""把 S5 与合并统计写进 T18-05/T18-06 报告与状态文件。可重复执行。"""
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v18" / "out" / "run_20260927_v18_01"

S5_SECTION = """
---

## 9. S5：平衡局面上「搜索教师能不能赢过 H0」（决定下一步方向的关键一问）

产物：`counterfactual/fullgame_ab.S5balancedTeacher.json`、
`counterfactual/fullgame_ab_analysis.S5balancedTeacher.json`。

窗口规则与 S3 相同（平衡局面），抽样 seed 2026099931，16 窗口 / 15 家族，
策略 `student,h0,b100q`，3 个续弈 seed，判据与 S3 逐字相同。

### 9.1 总量

| 策略 | 局数 | 自然完赛 | 胜 | 负 | **截断** | 截断率 | 自然完赛内胜率 |
|---|---:|---:|---:|---:|---:|---:|---:|
| student | 48 | 47 | 17 | 30 | 1 | 2% | 36.2% |
| h0 | 48 | 46 | 20 | 26 | 2 | 4% | 43.5% |
| **b100q** | 48 | 34 | 17 | 17 | **14** | **29%** | **50.0%** |

### 9.2 配对比较（决定性配对 = 两局都自然完赛且胜负不同）

| 配对 | 双方自然完赛 | A 胜 | B 胜 | 平 | 决定性 | 精确二项 p |
|---|---:|---:|---:|---:|---:|---:|
| student vs h0 | 45 | 1 | **5** | 39 | 6 | 0.2188 |
| **student vs b100q** | 33 | **0** | **6** | 27 | 6 | **0.0312** ✔ |
| h0 vs b100q | 33 | 2 | **7** | 24 | 9 | 0.1797 |

### 9.3 合并统计：student vs H0 已经是**极强**的结论

把 S3、S3 独立复核、S5 三个面板合并（判据完全相同，只是抽样 seed 不同）：

| 面板 | 配对 | 学生胜 | H0 胜 | 决定性 |
|---|---:|---:|---:|---:|
| S3 | 44 | 1 | 8 | 9 |
| S3 独立复核 | 88 | 5 | 20 | 25 |
| S5 | 45 | 1 | 5 | 6 |
| **合并** | **177** | **7** | **33** | **40** |

**精确二项检验（双侧，p=0.5）：p = 0.000042。**

⇒ 「**在平衡局面上，按 H0 下棋显著优于学生网络**」现在是**三个独立面板一致的结论**，
不是单次抽样噪声。

### 9.4 S5 真正要回答的问题：B100-Q 能不能赢过 H0

| 证据 | 值 | 能下什么结论 |
|---|---|---|
| student vs b100q | 0 : 6，p = 0.031 | **B100-Q 在平衡局面上显著强于学生** |
| h0 vs b100q | 2 : 7，p = 0.180 | 方向倾向 B100-Q，但**不显著** |
| b100q 截断率 | **29%**（h0 4%、student 2%） | **存在混杂** |

**混杂必须写明**：B100-Q 每步都要搜索，被 180 秒墙钟截断的比例是另外两个策略的 7–14 倍。
「自然完赛内胜率 50%」是在**只有 71% 的对局完赛**的子集上算的，
而被截断的很可能是**更长、更接近失败**的对局 ⇒ 该数字**可能被高估**。

⇒ **结论：B100-Q 在平衡局面上「可能」强于 H0，但本轮证据不足以确立。**
要把这一点确立，必须先把 B100-Q 的截断率压到与 H0 相当（提高墙钟或降低单步搜索成本），
再用 ≥60 个决定性配对复核。

**成本现实**：S5 的 144 局用了约 2.2 小时，其中 b100q 48 局占了绝大部分。
按此速度，要在无截断混杂下拿到 60 个决定性配对（约 240 个配对、
约 700 局）需要 **10 小时以上**，超出本轮本地预算。

### 9.5 这一步对路线选择的影响

| 路线 | 依据强度 | 上限 |
|---|---|---|
| 继续模仿 H0（含定向到平衡局面） | **强**（p = 0.000042） | **10/20**（V17 实测的完美 H0 模仿者上限），且 T18-04 第 1 波实测 5/20 → 4/20 |
| 蒸馏 B100-Q 在平衡局面上的行为 | **中**（0:6 显著胜过学生；2:7 不显著胜过 H0，且有 29% 截断混杂） | 未知，**有可能超过 10/20** |
| T18-06 结果驱动（整局 A/B 当信号） | 方法可行（S3 验证），但单轮成本 6–8 小时 | 未知 |

⇒ 下一步应当**先消除 B100-Q 的截断混杂**，因为这决定了「有没有超过 H0 的信息源」；
在这一点确立之前，做 T18-04 第 2 波（换 B100 目标）并不比第 1 波更有依据。
"""


def main() -> int:
    # 1) T18-05 报告追加 S5
    r05 = RUN / "reports" / "T18_05_report.md"
    text = io.open(r05, encoding="utf-8").read()
    if "## 9. S5：平衡局面上" not in text:
        io.open(r05, "w", encoding="utf-8").write(text.rstrip() + "\n" + S5_SECTION)
        print("T18_05_report.md patched")

    # 2) T18-06 报告（合同已写，分支未执行）
    r06 = RUN / "reports" / "T18_06_report.md"
    r06_body = """# T18-06 执行报告：算法合同已写定，分支**未执行**

runId：`run_20260927_v18_01`　日期：2026-09-28
合同：`contracts/T18_06_ALGORITHM_CONTRACT.md`

---

## 1. 触发条件核对

| 条件 | 状态 | 证据 |
|---|---|---|
| 标签/验证正确 | **满足** | T18-01：单次评分合同、双教师标签、未见/共享分离、开局覆盖，全部验收项通过 |
| 局部改进可用 | **满足** | S3 + 独立复核 + S5 合并：平衡局面上 H0 胜 33 / 学生胜 7（决定性 40），p = 0.000042 |
| 两轮受约束蒸馏无收益 | **一轮无收益，第二轮未做** | T18-04 第 1 波 U/K 均 4/20（冠军 5/20） |

## 2. 为什么这一轮**没有**启动 T18-06

任务书把 T18-06 放在「**两轮**受约束蒸馏仍无收益」之后。本轮只完成了第一波，
而第二波是否值得做，取决于一个尚未解决的问题：

> **在平衡局面上，B100-Q 到底能不能赢过 H0？**（S5，见 `reports/T18_05_report.md` §9）

- 若**能**：存在一个超过 H0 的信息源，且落在学生最弱的位置 ⇒
  应当先做「用 B100 目标做 T18-04 第 2 波」，而不是转去结果驱动；
- 若**不能**：蒸馏路线被 10/20 上限封死 ⇒ 才轮到 T18-06。

S5 给的是**中等的证据**：B100-Q 显著强于学生（0:6，p = 0.031），
但相对 H0 只是方向性占优（2:7，p = 0.180），而且有 **29% 的墙钟截断混杂**
（H0 只有 4%）。⇒ **这个问题本轮没有解决，所以不启动 T18-06。**

## 3. 已交付的合同内容（不需要等到执行）

尽管分支未执行，任务书要求的「算法合同与单轮预算」已经写定，包括：

1. **算法定义**：搜索访问分布迭代（主选）与 actor-critic（备选）；
2. **六项正确性验证**及其通过标准（变长合法集 / 行为 log-prob / 根阵营价值符号 /
   真实换手 / 终局 mask / 截断处理）；
3. **奖励定义**：只用自然胜负；明确禁止把招募、攻击、占领等 dense 量当目标；
4. **单轮预算**：40 局采样、≤200 次整局配对、≥50 个决定性配对、4,000 更新、
   最多 3 轮、连续两轮无提升即停；
5. **成本现实检查**：按 S3 的实测速度，一轮 6–8 小时，三轮超出本轮本地预算
   ⇒ 先做 1 轮并记录真实产出率。

## 4. 未执行项（如实标记）

| 项 | 状态 |
|---|---|
| 可解小残局的六项正确性验证 | **未执行** |
| 搜索访问分布迭代第 1 轮 | **未执行** |
| actor-critic 备选 | **未执行** |
| 用整局 A/B 产出 ≥50 个决定性偏好样本 | **未执行**（S3 的 44 配对用了约 1 小时，200 配对约 4.5 小时） |

## 5. 下一步（预登记，按优先级）

1. **消除 B100-Q 的截断混杂**：提高墙钟上限或降低单步搜索成本，
   把截断率压到与 H0 相当（<10%），再在平衡局面上跑 ≥60 个决定性配对；
2. 若 B100-Q 确认强于 H0 ⇒ 用 B100 在平衡局面上的动作做 T18-04 第 2 波
   （同数据同预算，仍带 KL 开关作对照）；
3. 若确认不强于 H0 ⇒ 启动 T18-06 第 1 轮，并先在可解小残局过六项正确性验证；
4. RECHECK40 / CONFIRM20 仍需等到有候选达到 DEV20 ≥18/20。
"""
    io.open(r06, "w", encoding="utf-8").write(r06_body)
    print("T18_06_report.md written")

    # 3) task_status / progress / final_report
    st_path = RUN / "task_status.json"
    st = json.loads(io.open(st_path, encoding="utf-8").read())
    for task in st["tasks"]:
        if task.get("id") == "T18-05":
            task["status"] = "PARTIAL / NO_PROMOTION / RECHECK_AND_CONFIRM_NOT_RUN"
            for item in (
                "arena/recheck/recheck40_wave1.manifest.json",
                "counterfactual/fullgame_ab.S5balancedTeacher.json",
                "counterfactual/fullgame_ab_analysis.S5balancedTeacher.json",
                "reports/T18_05_report.md",
            ):
                if item not in task.get("evidence", []):
                    task.setdefault("evidence", []).append(item)
            for line in (
                "DEV20 台账（逐局重算）：冠军 5/20（对照复跑同样 5/20，与 V17 独立审核逐图逐座位一致）、"
                "T18_02_A 5/20、T18_02_B 4/20、T18_04_w1_U 4/20、T18_04_w1_K 4/20；全部模型 fallback/非法/回退与判定矛盾均为 0",
                "没有任何候选达到「比冠军至少多赢 2 局」的晋升门槛 ⇒ RECHECK40 未运行、CONFIRM20 未运行",
                "RECHECK40 wave1 面板已按任务书先冻结 manifest：40 block / 20 seed，与其它 namespace 及训练池 family 交集均为空",
                "三 seed 重复未做：预登记规定「先有改善配方」，而没有任何配方出现改善；如实报告而不是遗漏",
                "S5：平衡局面上 student vs b100q = 0:6（p=0.031，B100-Q 显著强于学生）；h0 vs b100q = 2:7（p=0.180，不显著）"
                "；b100q 截断率 29% 对 h0 4% ⇒ 存在混杂，本轮不足以确立 B100-Q 强于 H0",
                "合并 S3 + 独立复核 + S5：student vs h0 = 7:33（决定性 40），p = 0.000042 ⇒ "
                "「平衡局面上按 H0 下显著优于学生」是三面板一致的结论",
            ):
                if line not in task.get("keyResults", []):
                    task.setdefault("keyResults", []).append(line)
            task["notDone"] = [
                "RECHECK40 未运行（没有候选达到 DEV20 ≥ 冠军 +2）",
                "CONFIRM20 未运行（模型未冻结；任务书禁止提前消耗最终面板）",
                "三 seed 重复未启动（预登记条件未满足）",
                "90% 稳定性目标（40 局 ≥36 胜）未评估（需先冻结候选）",
            ]
        if task.get("id") == "T18-06":
            task["status"] = "PARTIAL / CONTRACT_WRITTEN / BRANCH_NOT_EXECUTED"
            task["evidence"] = ["contracts/T18_06_ALGORITHM_CONTRACT.md", "reports/T18_06_report.md"]
            task["keyResults"] = [
                "算法合同与单轮预算已写定（搜索访问分布迭代为主选、actor-critic 为备选）",
                "六项正确性验证及通过标准已写明（变长合法集 / 行为 log-prob / 根阵营价值符号 / 真实换手 / 终局 mask / 截断处理）",
                "奖励定义写明只用自然胜负，明确禁止用 dense 量冒充目标",
                "成本现实检查：按 S3 实测，一轮 6–8 小时，三轮超出本轮本地预算",
                "**未执行**：触发条件里的「两轮受约束蒸馏无收益」只完成一轮，"
                "且「B100-Q 是否强于 H0」尚未确立（S5：2:7，p=0.18，29% 截断混杂）",
            ]
            task["notDone"] = [
                "可解小残局的六项正确性验证：未执行",
                "搜索访问分布迭代第 1 轮：未执行",
                "actor-critic 备选：未执行",
                "用整局 A/B 产出 ≥50 个决定性偏好样本：未执行",
            ]
            task["reason"] = "触发条件未完全满足（第二轮未做、B100-Q 相对 H0 的优势未确立），按任务书的依赖顺序不提前启动。"
    st["overallStatus"] = "PARTIAL_EXECUTION / NO_PROMOTION / IN_PROGRESS_BUDGET_LIMIT"
    st["overallStatement"] = (
        "V18 完成 T18-00/01/02，T18-03 找到并**用独立面板复核**了唯一的显著改进信号"
        "（平衡局面上 H0 胜学生 33:7，决定性 40，p=0.000042），T18-04 第 1 波定向训练无提升"
        "（U/K 均 4/20，KL 无可测差别），T18-05 冻结了 RECHECK40 面板但无候选可晋升，"
        "T18-06 写定算法合同但未执行。S5 显示 B100-Q 显著强于学生（0:6，p=0.031），"
        "但相对 H0 只是方向性占优（2:7，p=0.18）且被 29% 截断率混杂 ⇒ 本轮不足以确立"
        "「存在超过 H0 的信息源」。冠军仍是 P1:s2026（DEV20 5/20，V18 评测器上逐图逐座位复现一致），"
        "总目标（独立 CONFIRM20 >= 18/20）未达成，CONFIRM20 未运行。"
    )
    io.open(st_path, "w", encoding="utf-8").write(json.dumps(st, ensure_ascii=False, indent=2) + "\n")
    print("task_status patched")

    p_path = RUN / "progress.json"
    p = json.loads(io.open(p_path, encoding="utf-8").read())
    p["phase"] = "T18-00/01 完成；T18-02 部分完成；T18-03 找到并复核改进信号；T18-04 第 1 波无提升；T18-05 无可晋升候选；T18-06 合同已写、分支未执行"
    p["t18_03Gates"]["searchImprovements"]["S5_balancedThreePolicies"] = {
        "studentVsH0": {"bothNatural": 45, "studentWins": 1, "h0Wins": 5, "p": 0.2188},
        "studentVsB100q": {"bothNatural": 33, "studentWins": 0, "b100qWins": 6, "p": 0.0312, "significant": True},
        "h0VsB100q": {"bothNatural": 33, "h0Wins": 2, "b100qWins": 7, "p": 0.1797, "significant": False,
                      "confound": "b100q 截断率 29% vs h0 4%"},
    }
    p["t18_03Gates"]["pooledStudentVsH0"] = {
        "panels": ["S3", "S3replication", "S5"],
        "paired": 177, "studentWins": 7, "h0Wins": 33, "decisive": 40,
        "exactBinomialTwoSidedP": 0.000042,
        "verdict": "三面板一致：平衡局面上按 H0 下显著优于学生网络",
    }
    p["nextActions"] = [
        "先消除 B100-Q 的截断混杂（提高墙钟或降低单步搜索成本，把截断率压到 <10%），"
        "再在平衡局面上跑 ≥60 个决定性配对，回答「有没有超过 H0 的信息源」",
        "若 B100-Q 确认强于 H0：用 B100 在平衡局面上的动作做 T18-04 第 2 波（同数据同预算，KL 作对照）",
        "若确认不强于 H0：启动 T18-06 第 1 轮，并先在可解小残局过六项正确性验证",
        "RECHECK40 / CONFIRM20 需等到有候选达到 DEV20 ≥18/20 的前置条件",
    ]
    io.open(p_path, "w", encoding="utf-8").write(json.dumps(p, ensure_ascii=False, indent=2) + "\n")
    print("progress patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
