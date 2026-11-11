"""一次性补丁：把 T18-03 的真实状态写进 task_status.json 与 progress.json。

中文：这两个文件是交付物，必须反映实际结论；用结构化方式更新，避免手改 JSON 出错。
可重复执行。
"""
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v18" / "out" / "run_20260927_v18_01"

T18_03 = {
    "id": "T18-03",
    "title": "让监督携带真实改进信号",
    "status": "PARTIAL / BOTH_GATES_FAILED",
    "evidence": [
        "counterfactual/preference_repeatability.json",
        "counterfactual/preference_pairs.jsonl",
        "counterfactual/preference_failure_diagnosis.json",
        "counterfactual/high_cost_recheck.json",
        "counterfactual/successor_values.jsonl",
        "counterfactual/value_ranking_gate.json",
        "counterfactual/paired_continuation.S1horizon.json",
        "reports/T18_03_report.md",
        "reports/T18_03_S1_result.md",
    ],
    "keyResults": [
        "第一道门（偏好可重复性）未通过：122 个「学生 vs 分支」对的 3 seed 一致率 0.7951、留一一致率 0.8716，均低于各自随机重排基线（P95 = 0.8279 / 0.9016）",
        "7 个切分（两侧到达边界 / 至少一侧自然终局 / 未被歼灭 / 未被压倒 / 组合）全部不超过随机；「至少一侧自然终局」的 33 个对里一致改善数为 0",
        "主因不是截断：限制到「两侧都到达边界」后一致率升到 0.902，但随机基线升到 0.935，仍不过；更合理的解释是固定 H0 续弈抹平了首手差异",
        "撤回 T18-02 的窗口级判据：随机重排分支结果后平均产生 13.7 个「高代价窗口」（中位 14、P95 18），观测值 12 落在噪声分布内",
        "第二道门（价值头候选后继排序）未通过：四个价值头（V0_final / P1_s2026 / T18_02_A / T18_02_B）在 116 个后果不同的成对比较上 Wilson 下界均 < 0.5",
        "V0_final 是唯一按真实自然胜负训练过的价值头，却是排序最差的（大差异档 0.4727，低于随机）⇒ 低 MSE 不转化为候选排序能力",
        "价值头判定为不得接入搜索（searchAllowed=false）",
        "修好数据缺陷后校准集达标：编码行不携带 naturalTerminal，面板脚本误读导致校准 family 被压到 20；改用「valueTarget 非空」判据并补采 val_calib 面板后达到 55 个 family（45 个含两类结果）",
        "已登记并执行预登记搜索改进 S1（只把续弈预算从 256 转换/30 秒提高到 1024 转换/120 秒），输出到独立文件，不覆盖 S0",
    ],
    "notDone": [
        "第二道门存在双向混杂：后果标签本身不过可重复性检验，因此「排序失败」不能单独用来判价值学习整类方法无效",
        "T18-03 要求的「>=1,000 个可靠偏好/改进样本」未采集——门禁未通过，按任务书不应扩容",
        "第二个预登记搜索改进 S2 未登记（等 S1 结果决定必要性）",
    ],
    "reason": "两道门均未通过；按任务书应修候选搜索/续弈预算/标签证据，而不是扩容数据。S1 正在验证「续弈预算」这一项。",
}


def main() -> int:
    status_path = RUN / "task_status.json"
    status = json.loads(io.open(status_path, encoding="utf-8").read())
    tasks = status["tasks"]
    for i, task in enumerate(tasks):
        if task.get("id") == "T18-03":
            tasks[i] = T18_03
            break
    else:
        tasks.append(T18_03)
    status["overallStatus"] = "PARTIAL_EXECUTION / NO_PROMOTION / IN_PROGRESS_BUDGET_LIMIT"
    status["overallStatement"] = (
        "V18 完成 T18-00 身份冻结与勘误、T18-01 监督与验证合同修复、T18-02 三臂表示对照与 48 窗口成对续弈，"
        "并在 T18-03 对改进信号做了两道门禁检验——**两道都没通过**："
        "偏好方向的可重复率（0.795 / 留一 0.872）低于随机重排基线（P95 = 0.828 / 0.902）；"
        "价值头在候选后继排序上四个检查点全部 Wilson 下界 < 0.5，其中唯一按真实胜负训练过的 V0_final 反而最差。"
        "同时**撤回** T18-02 的「12/48 高代价失误」判据（随机重排后平均产生 13.7 个，观测值落在噪声内）。"
        "按任务书，不扩容偏好数据、价值头不接入搜索；已登记并执行预登记搜索改进 S1（只改续弈预算）。"
        "冠军仍是 P1:s2026（DEV20 5/20），总目标（独立 CONFIRM20 >= 18/20）未达成，CONFIRM20 未运行。"
    )
    io.open(status_path, "w", encoding="utf-8").write(json.dumps(status, ensure_ascii=False, indent=2) + "\n")

    prog_path = RUN / "progress.json"
    prog = json.loads(io.open(prog_path, encoding="utf-8").read())
    prog["phase"] = "T18-00/01 完成；T18-02 部分完成（含判据勘误）；T18-03 两道门未通过；T18-04..06 未开始"
    prog["nextActions"] = [
        "读取 S1 结果：若续弈预算提高后可重复率超过随机基线，则按 S1 合同扩容偏好样本；否则登记第二个改进 S2 或改证据来源",
        "实现 Arm C 的候选关系特征：更新编码 schema、输入身份与 TS/Python 双语言一致性",
        "把价值头校准面板接入真正的价值训练（当前 55 个 family 已达标），并用真实换手结果重训后再跑排序门",
        "在监督信号通过门禁之前，不启动 T18-04 的受约束学生纠错（不能用噪声标签训练）",
    ]
    prog["t18_03Gates"] = {
        "preferenceRepeatability": {"passed": False, "observed": 0.7951, "randomP95": 0.8279},
        "leaveOneSeedOut": {"passed": False, "observed": 0.8716, "randomP95": 0.9016},
        "valueSuccessorRanking": {"passed": False, "note": "四个价值头 Wilson 下界均 < 0.5"},
        "valueCalibrationFamilies": {"passed": True, "families": 55, "withBothOutcomes": 45},
        "searchAllowed": False,
        "t18_02HighCostRetracted": True,
    }
    io.open(prog_path, "w", encoding="utf-8").write(json.dumps(prog, ensure_ascii=False, indent=2) + "\n")
    print("task_status.json and progress.json updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
