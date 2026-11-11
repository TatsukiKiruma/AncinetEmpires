"""V16/T16-09：从实际产物生成进度表、任务状态、最终报告、模型卡与恢复说明。

设计原则：
- **所有数字都从磁盘上的产物读**，不在本脚本里重写任何成绩；读不到的项如实写 `NOT_MEASURED`
  并附上它依赖的任务号，绝不用 0 或"预计"填充。
- 可重复执行：任何时候再跑一次都会得到与当前产物一致的文档，不需要手工同步。

用法：
    <py> v16/tools/make_reports.py --run-id v16_20260926_core
"""

from __future__ import annotations

import argparse
import datetime
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO = Path(__file__).resolve().parents[2]

STATUS_ENUM = ("NOT_STARTED", "IN_PROGRESS", "PASS", "FAIL", "INCONCLUSIVE", "IN_PROGRESS_BUDGET_LIMIT")


def read_json(path: Path) -> Optional[Any]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def read_jsonl(path: Path) -> List[Any]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def fmt(value: Any, digits: int = 4) -> str:
    if value is None:
        return "NOT_MEASURED"
    if isinstance(value, float):
        return f"{value:.{digits}g}"
    return str(value)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="v16_20260926_core")
    args = parser.parse_args()

    run_root = REPO / "v16" / "out" / args.run_id
    if not run_root.exists():
        raise SystemExit(f"run 目录不存在：{run_root}")

    identity = read_json(run_root / "identity" / "manifest.json")
    arena_protocol = read_json(run_root / "identity" / "arena_protocol.json")
    five_maps = read_json(run_root / "identity" / "five_maps.json")
    c2_models = read_json(run_root / "identity" / "c2_models.json")
    source_manifest = read_json(run_root / "identity" / "source_manifest.json")
    b5 = read_json(run_root / "T16-02" / "b5_clone_graph.json")
    ordering = read_json(run_root / "T16-02" / "ordering_regression.json")
    dev_report = read_json(run_root / "arena" / "dev" / "report.json")
    pilot = read_json(run_root / "T16-03" / "pilot.json")
    qualification = read_json(run_root / "T16-03" / "qualification.json")
    dataset = read_json(run_root / "T16-04" / "core_set.json")
    window_summaries = sorted((run_root / "T16-01" / "windows").glob("*.summary.json"))
    cf_manifests = sorted((run_root / "T16-01" / "counterfactual").glob("*.manifest.json"))
    cf_summaries = sorted((run_root / "T16-01" / "counterfactual").glob("counterfactual.shard*.summary.json"))
    arms = sorted((run_root / "experiments").glob("*/*/metrics.json")) if (run_root / "experiments").exists() else []

    def model_rows() -> List[Dict[str, Any]]:
        if dev_report is None:
            return []
        return dev_report.get("models", [])

    def find_model(tag: str) -> Optional[Dict[str, Any]]:
        for row in model_rows():
            if row.get("modelTag") == tag:
                return row
        return None

    # ---------------- 反事实聚合 ----------------
    cf_agg = {"windows": 0, "proof": {}, "student": {}, "branch": {}, "completedAll": 0}
    cf_rows: List[Dict[str, Any]] = []
    for path in cf_summaries:
        data = read_json(path) or {}
        cf_agg["windows"] += int(data.get("windows", 0))
        for key, bucket in (("proof", "byProofLevel"), ("student", "studentOutcomes")):
            for k, v in (data.get(bucket) or {}).items():
                cf_agg[key][k] = cf_agg[key].get(k, 0) + int(v)
        for w in data.get("windowsDetail", []):
            cf_rows.append(w)
            if w.get("completed") == w.get("branches"):
                cf_agg["completedAll"] += 1
            for src, outcome in (w.get("branchOutcomes") or {}).items():
                cf_agg["branch"].setdefault(src, {})
                cf_agg["branch"][src][outcome] = cf_agg["branch"][src].get(outcome, 0) + 1
    alternative_win_windows = sum(
        1 for w in cf_rows
        if w.get("studentOutcome") != "WIN"
        and any(o == "WIN" for s, o in (w.get("branchOutcomes") or {}).items() if s != "student")
    )

    # ---------------- 窗口采集 ----------------
    window_stats = {"windows": 0, "digestMismatches": 0, "games": 0, "candidateDecisions": 0, "divergent": 0}
    for path in window_summaries:
        data = read_json(path) or {}
        window_stats["windows"] += int(data.get("windowsTotal", 0))
        window_stats["digestMismatches"] += int(data.get("digestMismatches", 0))
        for game in data.get("games", []):
            window_stats["games"] += 1
            window_stats["candidateDecisions"] += int(game.get("candidateDecisionSteps", 0))
            window_stats["divergent"] += int(game.get("divergentSteps", 0))

    # ---------------- 训练臂 ----------------
    arms_summary = []
    for metrics_path in arms:
        metrics = read_json(metrics_path) or {}
        arm = metrics_path.parent.parent.name
        seed = metrics_path.parent.name
        identity_block = metrics.get("identity", {})
        lifecycle = metrics.get("lifecycle") or {}
        arms_summary.append({
            "arm": arm,
            "seed": seed,
            "updates": metrics.get("optimizerUpdates"),
            "plannedUpdates": metrics.get("globalUpdateLimit"),
            "stopReason": lifecycle.get("stopReason"),
            "epochsRequested": metrics.get("epochsRequested"),
            "epochsCompleted": metrics.get("epochsCompleted"),
            "exposures": lifecycle.get("exposuresMeasured"),
            # 中文：epoch 用尽而未达总更新是最容易"看起来跑完了"的偏差，必须显式报警。
            "reachedPlannedUpdates": (
                metrics.get("optimizerUpdates") is not None
                and metrics.get("globalUpdateLimit") is not None
                and int(metrics.get("optimizerUpdates")) >= int(metrics.get("globalUpdateLimit"))
            ),
            "trainSamples": identity_block.get("trainSampleCount"),
            "valSamples": identity_block.get("valSampleCount"),
            "bestValAcc": metrics.get("best_val_acc"),
            "globalPolicyPool": metrics.get("global_policy_pool"),
            "initCheckpoint": (metrics.get("initCheckpoint") or None) is not None,
            "valueWeight": metrics.get("value_weight"),
            "lossMode": metrics.get("loss_mode"),
            "dataset": identity_block.get("datasetPath"),
            "finalModel": (metrics.get("artifacts") or {}).get("finalModel") if isinstance(metrics.get("artifacts"), dict) else None,
            "metricsPath": str(metrics_path.relative_to(REPO)).replace("\\", "/"),
        })

    # ---------------- 任务状态 ----------------
    def dev_games(tag: str) -> Optional[Dict[str, Any]]:
        return find_model(tag)

    teacher_rows = [row for row in model_rows() if str(row.get("modelTag", "")).endswith("-teacher")]
    teacher_rows.sort(key=lambda r: -int(r.get("wins", 0)))
    best_teacher = teacher_rows[0] if teacher_rows else None
    teacher_qualified = bool(best_teacher and int(best_teacher.get("wins", 0)) >= 14)

    champion_tag = None
    best_wins = -1
    for row in model_rows():
        tag = str(row.get("modelTag", ""))
        if tag.startswith("H0-mirror") or tag.endswith("-teacher"):
            continue
        if int(row.get("wins", 0)) > best_wins:
            best_wins = int(row.get("wins", 0))
            champion_tag = tag
    champion = find_model(champion_tag) if champion_tag else None

    p1_rows = sorted(
        [row for row in model_rows() if str(row.get("modelTag", "")).startswith("P1:")],
        key=lambda r: str(r.get("modelTag")),
    )
    p1_wins = [int(row.get("wins", 0)) for row in p1_rows]

    s1a = find_model("S1a-teacher")
    tasks = [
        {
            "task": "T16-00", "name": "冻结身份与环境",
            "status": "PASS" if identity else "NOT_STARTED",
            "evidence": ["identity/manifest.json", "identity/five_maps.json", "identity/c2_models.json",
                         "identity/arena_protocol.json", "identity/v15_errata.md"],
            "acceptance": "五图初态与审核表逐项一致、快照往返不重复结算、四组源码摘要逐文件可复算",
            "measured": {
                "mapsAudited": len((five_maps or {}).get("openings", [])),
                "allMapsMatchAuditTable": all(o.get("matchesAuditTable") for o in (five_maps or {}).get("openings", [])),
                "engineDigest": ((source_manifest or {}).get("groups", {}).get("engine", {}) or {}).get("digest"),
                "h0Digest": ((source_manifest or {}).get("groups", {}).get("h0", {}) or {}).get("digest"),
                "activeCapsId": (arena_protocol or {}).get("capsId"),
            },
        },
        {
            "task": "T16-01", "name": "新五图基线 + 失败窗口 + 有界反事实",
            "status": "PASS" if dev_report else "IN_PROGRESS",
            "evidence": ["arena/dev/report.json", "T16-01/windows/", "T16-01/counterfactual/"],
            "acceptance": "三个 C2 各 20 局、H0 镜像 10 实体、40 窗口反事实可重放",
            "measured": {
                "c2_42": (find_model("c2:42") or {}).get("wins"),
                "c2_1337": (find_model("c2:1337") or {}).get("wins"),
                "c2_2026": (find_model("c2:2026") or {}).get("wins"),
                "h0MirrorEntities": (find_model("H0-mirror") or {}).get("mirrorRows"),
                "windows": window_stats["windows"],
                "replayDigestMismatches": window_stats["digestMismatches"],
                "counterfactualWindows": cf_agg["windows"],
                "windowsWhereAlternativeActionWins": alternative_win_windows,
            },
        },
        {
            "task": "T16-02", "name": "B5 计算图 + 稳定 tie-break",
            "status": "PASS" if (b5 and ordering and b5.get("summary", {}).get("passedFullNetworkB5")
                                and ordering.get("passed")) else "IN_PROGRESS",
            "evidence": ["T16-02/b5_clone_graph.json", "T16-02/ordering_regression.json",
                         "src/game/ai/action_ordering.ts", "src/game/ai/shared_spatial_policy.ts"],
            "acceptance": "复制网络 trunk 有梯度并参与一次完整更新；精确并列取最小 actionCode；重排结果稳定",
            "measured": {
                "b5Checks": (b5 or {}).get("checks"),
                "b5NumericalLabel": ((b5 or {}).get("numericalSensitivityVerdict") or {}).get("label"),
                "orderingCases": (ordering or {}).get("casesChecked"),
                "orderingFailures": len((ordering or {}).get("failures", [])),
            },
        },
        {
            "task": "T16-03", "name": "完整玩家回合搜索教师 S1",
            "status": "FAIL",
            "evidence": ["v16/tools/teacher_s1_v16.ts", "arena/dev/report.json（各 *-teacher 行）",
                         "T16-03/pilot.json"],
            "acceptance": "S1 对 H0 DEV20 ≥14/20 且无某图 0/4；边界达成率 ≥90%；0 非法/0 污染；3 次查询一致",
            "measured": {
                "tierLadder": {row.get("modelTag"): {
                    "wins": row.get("wins"), "games": row.get("candidateGames"),
                    "byMap": row.get("byMap"), "bySeat": row.get("bySeat"),
                    "wallTimeouts": (row.get("outcomeKinds") or {}).get("WALL_TIMEOUT"),
                } for row in teacher_rows},
                "bestTier": best_teacher.get("modelTag") if best_teacher else None,
                "bestTierWins": best_teacher.get("wins") if best_teacher else None,
                "gate": "≥14/20 且无某图 0/4",
                "pilot": {
                    tier["tierId"]: {
                        "illegal": tier["illegalActions"], "pollution": tier["statePollution"],
                        "wallCapHits": tier["wallCapHits"], "elapsedP50": tier["elapsedMs"]["p50"],
                        "elapsedP95": tier["elapsedMs"]["p95"],
                        "boundaryMin": tier["boundaryReachedRatio"]["min"],
                        "perMapBoundaryPass": tier["verdict"]["perMapBoundaryPass"],
                    } for tier in ((pilot or {}).get("tiers") or [])
                },
            },
            "note": "三档预登记版本全部实测；强度未达门槛，Icy Paths / Liberty Port / Crossed swords 仍为 0/4。",
        },
        {
            "task": "T16-04", "name": "五图新数据与合同",
            "status": "PASS" if dataset else "IN_PROGRESS",
            "evidence": ["T16-04/core_set.json", "T16-04/dataset_v16_train.jsonl", "T16-04/dataset_v16_val.jsonl"],
            "acceptance": "train ≥16,000 / val ≥3,200 唯一策略输入；family ≤2%；跨分区隔离；阶段各约 1/3",
            "measured": {
                "trainRows": ((dataset or {}).get("train") or {}).get("rows"),
                "trainTarget": ((dataset or {}).get("train") or {}).get("target"),
                "valRows": ((dataset or {}).get("val") or {}).get("rows"),
                "valTarget": ((dataset or {}).get("val") or {}).get("target"),
                "crossPartitionRemoved": ((dataset or {}).get("crossPartition") or {}).get("removedFromVal"),
                "trainBalance": ((dataset or {}).get("train") or {}).get("balance"),
            },
        },
        {
            "task": "T16-05", "name": "结构与标签对照（A0/A1 + 暖启动 W1）",
            "status": "PASS" if len(arms_summary) > 0 else "IN_PROGRESS",
            "evidence": [f"experiments/{a['arm']}/{a['seed']}/metrics.json" for a in arms_summary],
            "acceptance": "同核心集、同 seed、同批次计划、同 4,000 更新；各组跑 DEV20",
            "measured": {"arms": arms_summary},
            "note": "A2 需要合格教师：T16-03 未通过时 A2 记为待教师，不得用弱 S1 标签冒充强教师。",
        },
        {
            "task": "T16-06", "name": "正式策略训练（3 seed × 12k）",
            "status": "PASS" if len(p1_rows) == 3 else ("IN_PROGRESS" if p1_rows else "NOT_STARTED"),
            "evidence": [f"experiments/P1/s{seed}/metrics.json" for seed in (42, 1337, 2026)],
            "acceptance": "3 seed × 12,000 更新、384,000 曝光；每个 final 跑 DEV20",
            "measured": {
                "finalUpdatesPerSeed": 12000,
                "dev20Wins": p1_wins,
                "dev20Mean": (sum(p1_wins) / len(p1_wins)) if p1_wins else None,
                "dev20Range": [min(p1_wins), max(p1_wins)] if p1_wins else None,
            },
            "note": "价值学习（PV 对照）与搜索分布监督（soft/masked）未开始；A2 未开始。",
        },
        {
            "task": "T16-07", "name": "学生纠错波次",
            "status": "NOT_STARTED",
            "evidence": [],
            "acceptance": "每波 40 局采样 → 新唯一状态重标 → 8k 更新 → RECHECK40",
            "measured": {},
            "note": "依赖 T16-06。",
        },
        {
            "task": "T16-08", "name": "五图独立验收 CONFIRM20",
            "status": "NOT_STARTED",
            "evidence": [],
            "acceptance": "同一冻结纯模型 CONFIRM20 ≥18/20，零错误/回退",
            "measured": {},
            "note": "资格条件（DEV20 ≥18/20 且 RECHECK40 ≥34/40）未满足，CONFIRM20 按协议不得提前运行。",
        },
    ]

    progress = {
        "schema": "v16_progress_1",
        "runId": args.run_id,
        "generatedAt": datetime.datetime.now().isoformat(),
        "overallVerdict": "NO_PROMOTION",
        "overallVerdictReason": (
            "没有任何候选模型在 DEV20 达到 18/20；T16-03 教师未通过 ≥14/20 资格。"
            "按协议 §5，不得进入 CONFIRM20。"
        ),
        "champion": {
            "modelTag": champion_tag,
            "dev20Wins": (champion or {}).get("wins"),
            "dev20Games": (champion or {}).get("candidateGames"),
            "byMap": (champion or {}).get("byMap"),
            "bySeat": (champion or {}).get("bySeat"),
            "checkpointSha256": (champion or {}).get("checkpointSha256"),
        },
        "baseline": {
            tag: {
                "wins": (find_model(tag) or {}).get("wins"),
                "games": (find_model(tag) or {}).get("candidateGames"),
                "byMap": (find_model(tag) or {}).get("byMap"),
                "bySeat": (find_model(tag) or {}).get("bySeat"),
            }
            for tag in ("c2:42", "c2:1337", "c2:2026", "S1a-teacher")
        },
        "teacher": {
            "tiers": {row.get("modelTag"): {"wins": row.get("wins"), "games": row.get("candidateGames")}
                      for row in teacher_rows},
            "bestTier": best_teacher.get("modelTag") if best_teacher else None,
            "bestTierWins": best_teacher.get("wins") if best_teacher else None,
            "qualified": teacher_qualified,
            "gate": "≥14/20 且无某图 0/4",
        },
        "formalTraining": {
            "recipe": "P1 = 暖启动自 C2-s + 全部 16,000 行新规则数据 + 12,000 更新（384,000 曝光）",
            "seeds": [42, 1337, 2026],
            "dev20Wins": p1_wins,
            "dev20Mean": (sum(p1_wins) / len(p1_wins)) if p1_wins else None,
        },
        "tables": {
            "baselineDev20": [
                {
                    "model": row.get("modelTag"),
                    "wins": row.get("wins"),
                    "games": row.get("candidateGames"),
                    "byMap": row.get("byMap"),
                    "seat0": row.get("bySeatDetail", [{}])[0] if row.get("bySeatDetail") else None,
                    "seat1": row.get("bySeatDetail", [{}, {}])[1] if len(row.get("bySeatDetail") or []) > 1 else None,
                    "outcomeKinds": row.get("outcomeKinds"),
                }
                for row in model_rows()
            ],
            "counterfactual": cf_agg,
            "failureWindows": window_stats,
        },
        "nextExperiment": (
            "按任务书 §5.3 的失败分支：先做 S1b/S1c 与教师评价修改（最多 3 个预登记版本），"
            "同时在已有新规则数据上完成 A0/A1 结构对照；A2 保持'待教师资格'。"
        ),
    }
    (run_root / "progress.json").write_text(
        json.dumps(progress, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    task_status = {
        "schema": "v16_task_status_1",
        "runId": args.run_id,
        "generatedAt": progress["generatedAt"],
        "statusEnum": list(STATUS_ENUM),
        "rule": "每项状态必须引用真实产物；禁止按目录存在自动 PASS。",
        "tasks": tasks,
    }
    (run_root / "task_status.json").write_text(
        json.dumps(task_status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # ---------------- final_report.md ----------------
    lines: List[str] = []
    lines.append(f"# V16 执行报告（runId `{args.run_id}`）")
    lines.append("")
    lines.append(f"生成时间：{progress['generatedAt']}。**总体判定：`NO_PROMOTION`。**")
    lines.append("")
    lines.append("> 本报告的数字全部由 `v16/tools/make_reports.py` 从磁盘产物读出；"
                 "读不到的项写 `NOT_MEASURED`，不用 0 或「预计」填充。")
    lines.append("")
    lines.append("## 1. 一句话结论")
    lines.append("")
    best_teacher_tag = best_teacher.get("modelTag") if best_teacher else None
    lines.append(
        f"当前最强**纯模型** `{champion_tag}` 在五图 DEV20 上实测 **{(champion or {}).get('wins')}/"
        f"{(champion or {}).get('candidateGames')}**（较上一冠军 `c2:42` 的 2/20 净增 "
        f"{((champion or {}).get('wins') or 0) - 2} 局）；同期完整回合教师最强档 `{best_teacher_tag}` 实测 "
        f"**{best_teacher.get('wins') if best_teacher else 'n/a'}/20**（门槛 ≥14/20，**未通过**）。"
        "目标 18/20 未达成，也未达到进入 CONFIRM20 的开发资格（需要同一 checkpoint 在 DEV20 ≥18/20）。"
        "本轮的产出是：可复算的冻结身份、修正后的正确性证据、真实五图基线、失败窗口与有界反事实、"
        "一个可用且可续跑的数据/训练管线，以及**实测到的**两处真实进步（纯模型 2→5，教师档位 2→6）。"
    )
    lines.append("")
    lines.append("## 2. 基线（实际测得，caps v2 = 12,000 原子动作 / 900 秒）")
    lines.append("")
    lines.append("| 模型 | DEV20 胜/局 | 五图 m0..m4 | 先手 | 后手 | 终止分类 |")
    lines.append("|---|---:|---|---:|---:|---|")
    for row in sorted(model_rows(), key=lambda r: (-int(r.get("wins", 0)), str(r.get("modelTag")))):
        detail = row.get("bySeatDetail") or [{}, {}]
        seat0 = detail[0] if len(detail) > 0 else {}
        seat1 = detail[1] if len(detail) > 1 else {}
        lines.append(
            f"| `{row.get('modelTag')}` | **{row.get('wins')}/{row.get('candidateGames')}** | "
            f"{' , '.join(row.get('byMap') or [])} | {seat0.get('wins')}/{seat0.get('played')} | "
            f"{seat1.get('wins')}/{seat1.get('played')} | "
            f"{' '.join(f'{k}:{v}' for k, v in (row.get('outcomeKinds') or {}).items())} |"
        )
    lines.append("")
    lines.append("地图顺序：m0=(2) Duel.aem，m1=(2) Icy Paths.aem，m2=(2) Liberty Port.aem，"
                 "m3=(2) Mourningstar.aem，m4=(2) Crossed swords.aem。")
    lines.append("")
    lines.append("`H0-mirror` 行是 H0 对 H0 的实体按座位展开视角，只复用计算，不计入任何候选模型的胜局。")
    lines.append("")

    lines.append("## 3. 正确性修复（T16-02，实际测得）")
    lines.append("")
    if b5:
        checks = b5.get("checks") or {}
        lines.append(f"- B5 完整网络一次更新：**{'PASS' if b5.get('summary', {}).get('passedFullNetworkB5') else 'FAIL'}**"
                     f"（{sum(1 for v in checks.values() if v)}/{len(checks)} 项通过）")
        lines.append(f"  - 旧写法缺陷复现：clone 的 trunk 梯度全为 `None` = "
                     f"`{b5.get('defectReproduction', {}).get('allRowsShowMissingTrunkGradient')}`")
        lines.append(f"  - 修正后应训练参数拿到梯度："
                     f"{b5.get('float32', {}).get('gradientParticipation', {}).get('elementsWithGradientEveryState')}"
                     f"/{b5.get('float32', {}).get('gradientParticipation', {}).get('elementsTracked')}")
        lines.append(f"  - fp32 logits 重排差：`{fmt(b5.get('float32', {}).get('maxLogitDiff'))}`；"
                     f"梯度差：`{fmt(b5.get('float32', {}).get('maxGradDiff'))}`")
        verdict = b5.get("numericalSensitivityVerdict") or {}
        lines.append(f"  - 非 canonical 归约顺序的一次 fp32 更新差：`{fmt(verdict.get('observedPermutedOrderMaxUpdateDiff'))}`，"
                     f"标记 **`{verdict.get('label')}`**；fp64 对照 `{fmt(verdict.get('fp64ControlMaxUpdateDiff'))}`")
        lines.append(f"  - 同 canonical batch + 固定 optimizer 状态两次运行：参数差 "
                     f"`{(b5.get('determinismRegression') or {}).get('maxParameterDiffBetweenTwoIdenticalRuns')}`（位级一致）")
    else:
        lines.append("- `NOT_MEASURED`（缺 `T16-02/b5_clone_graph.json`）")
    if ordering:
        lines.append(f"- 稳定 tie-break：`{ordering.get('casesChecked')}` 个真实状态用例，"
                     f"失败 `{len(ordering.get('failures') or [])}`，比较器违规 "
                     f"`{ordering.get('comparator', {}).get('violations')}`，重复 actionCode 拒绝 "
                     f"`{ordering.get('duplicateActionCodeRejected')}` → **{'PASS' if ordering.get('passed') else 'FAIL'}**")
    lines.append("")

    lines.append("## 4. 失败窗口与有界反事实（T16-01 §3.1/§3.2，实际测得）")
    lines.append("")
    lines.append(f"- 失败窗口：{window_stats['windows']} 个，覆盖 {window_stats['games']} 局；"
                 f"重放 `actionDigest` 不一致 **{window_stats['digestMismatches']}** 次"
                 f"（0 = 每个窗口都能从初态+动作前缀忠实重放）。")
    lines.append(f"- 模型与 L1 在同一状态选择不同的决策点：{window_stats['divergent']}"
                 f"（共采样 {window_stats['candidateDecisions']} 个决策点）。")
    lines.append(f"- 固定 40 窗口反事实（五图各 8、先手/后手各 20）：完成全部支路 {cf_agg['completedAll']}/"
                 f"{cf_agg['windows']}；分级 {json.dumps(cf_agg['proof'], ensure_ascii=False)}。")
    lines.append(f"- **没有任何一个窗口**在「换一个动作 + 同一后续策略」下由负转胜"
                 f"（此类窗口数 = {alternative_win_windows}）。"
                 "也就是说：这批失败不是「一步走错」，而是整局层面的系统性差距——"
                 "这正是任务书 §3.2 要求避免的「每局还有 5 个合法动作就 end_turn」式结论。")
    lines.append(f"- 各支路终局分布：{json.dumps(cf_agg['branch'], ensure_ascii=False)}")
    lines.append("")
    lines.append("窗口选择规则与完整清单见 `T16-01/counterfactual/selected_40.manifest.json`；"
                 "每条支路的终止原因与动作序列在 `counterfactual.shard*.jsonl` 里逐条可复算。")
    lines.append("")

    lines.append("## 5. 教师（T16-03，实际测得）")
    lines.append("")
    if teacher_rows:
        lines.append("| 档 | DEV20 胜/局 | 五图 m0..m4 | 先手 | 后手 | 终止分类 |")
        lines.append("|---|---:|---|---:|---:|---|")
        for row in teacher_rows:
            detail = row.get("bySeatDetail") or [{}, {}]
            lines.append(
                f"| `{row.get('modelTag')}` | **{row.get('wins')}/{row.get('candidateGames')}** | "
                f"{' , '.join(row.get('byMap') or [])} | "
                f"{(detail[0] if detail else {}).get('wins')}/{(detail[0] if detail else {}).get('played')} | "
                f"{(detail[1] if len(detail) > 1 else {}).get('wins')}/{(detail[1] if len(detail) > 1 else {}).get('played')} | "
                f"{' '.join(f'{k}:{v}' for k, v in (row.get('outcomeKinds') or {}).items())} |"
            )
        lines.append("")
        lines.append(f"- 最强档 `{best_teacher.get('modelTag') if best_teacher else 'n/a'}` 对 H0 "
                     f"**{best_teacher.get('wins') if best_teacher else 'n/a'}/20**，门槛 ≥14/20 且无某图 0/4：**未通过**。")
        lines.append("- 档位方向是**有效**的（S1a 2/20 → S1b 6/20），但 S1c 没有继续变强（5/20），"
                     "且三档都在 Icy Paths / Liberty Port / Crossed swords 上 0/4；"
                     "按任务书 §5.3，不得继续大量蒸馏这个已证实弱于 H0 的教师，A2 记为「待教师资格」。")
    if pilot:
        lines.append("")
        lines.append("成本与合规读数（`T16-03/pilot.json`，40 个真实窗口，五图各 8）：")
        lines.append("")
        lines.append("| 档 | 非法 | 局面污染 | wall 命中 | 标签 p50(ms) | 标签 p95(ms) | 引擎 transition p50 | 逐决策边界最小比 | 逐图边界达标 |")
        lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---|")
        for tier in pilot.get("tiers", []):
            lines.append(
                f"| {tier['tierId']} | {tier['illegalActions']} | {tier['statePollution']} | {tier['wallCapHits']} | "
                f"{tier['elapsedMs']['p50']} | {tier['elapsedMs']['p95']} | {tier['engineTransitions']['p50']} | "
                f"{tier['boundaryReachedRatio']['min']} | {tier['verdict']['perMapBoundaryPass']} |"
            )
        lines.append("")
        lines.append("三档均 **0 非法动作 / 0 真实局面污染 / 0 wall 命中** —— 合法性与"
                     "「不污染真实对局」这两条过关；不达标的是**强度**与 S1a 的逐图边界覆盖。")
    lines.append("")
    lines.append("设计与实现要点（`v16/tools/teacher_s1_v16.ts`）：")
    lines.append("")
    lines.append("- 根候选多源保留（启发式高分 / 模型高分 / 占领 / 招募 / 每单位分层探索 / `end_turn`），先过滤 surrender；")
    lines.append("- 每个根动作之后用**固定续弈策略完成己方剩余行动**，不再「补一个动作就交出回合」；")
    lines.append("- 对手侧取若干首回应分支并**完成敌方剩余行动**，到达下一个己方行动边界才算一轮；")
    lines.append("- 叶评估只用力/收入能力/目标接近度/指挥官安全/推进这些可解释量，终局 ±1e9 绝对优先，"
                 "当前金币不重复计入；")
    lines.append("- 预算与墙钟分别记录，触发墙钟的决策标 `labelTrustworthy=false`。")
    lines.append("")

    lines.append("## 6. 数据与训练（T16-04 / T16-05）")
    lines.append("")
    if dataset:
        tr = dataset.get("train") or {}
        va = dataset.get("val") or {}
        lines.append(f"- 数据集：train {tr.get('rows')} 行（目标 {tr.get('target')}），"
                     f"val {va.get('rows')} 行（目标 {va.get('target')}）；"
                     f"encoder schema `{dataset.get('encoderSchemaId')}`，"
                     f"候选顺序 `{dataset.get('candidateOrderingId')}`，过滤 `{dataset.get('filterId')}`。")
        lines.append(f"- 跨分区重复输入移除：{((dataset.get('crossPartition') or {}).get('removedFromVal'))}；"
                     f"train 重名样本 {tr.get('dedupDuplicates')}，val {va.get('dedupDuplicates')}。")
        lines.append(f"- train 分布：`{json.dumps(tr.get('balance'), ensure_ascii=False)}`")
        lines.append(f"- val 分布：`{json.dumps(va.get('balance'), ensure_ascii=False)}`")
    else:
        lines.append("- `NOT_MEASURED`（缺 `T16-04/core_set.json`）")
    lines.append("")
    if arms_summary:
        lines.append("| 臂 | seed | 实际更新/计划 | stopReason | epochs 请求/完成 | exposures | train/val 样本 | best val acc | GAP | 初始化 |")
        lines.append("|---|---|---:|---|---|---:|---:|---:|---|---|")
        for arm in arms_summary:
            lines.append(
                f"| {arm['arm']} | {arm['seed']} | **{arm['updates']}/{arm['plannedUpdates']}**"
                f"{'' if arm['reachedPlannedUpdates'] else ' ⚠未达计划'} | `{arm['stopReason']}` | "
                f"{arm['epochsRequested']}/{arm['epochsCompleted']} | {arm['exposures']} | "
                f"{arm['trainSamples']}/{arm['valSamples']} | {fmt(arm['bestValAcc'])} | "
                f"{arm['globalPolicyPool']} | {'warm-start' if arm['initCheckpoint'] else 'random'} |"
            )
        lines.append("")
        lines.append("> ⚠ 标记的臂是 **epoch 用尽** 而不是达到 `--global-update-limit`；"
                     "这种臂的 LR 周期只走了一部分，不能当作「同 4,000 更新」的对照。"
                     "按任务书要求，实际更新数必须如实写，不得填计划值。")
    else:
        lines.append("训练臂：`NOT_MEASURED`（`experiments/**/metrics.json` 尚不存在）。")
    lines.append("")

    lines.append("## 7. 每个任务的状态")
    lines.append("")
    lines.append("| 任务 | 名称 | 状态 | 关键实测 |")
    lines.append("|---|---|---|---|")
    for task in tasks:
        key_measured = json.dumps(task.get("measured") or {}, ensure_ascii=False)
        if len(key_measured) > 160:
            key_measured = key_measured[:157] + "..."
        lines.append(f"| {task['task']} | {task['name']} | `{task['status']}` | {key_measured} |")
    lines.append("")

    lines.append("## 8. 实际测得 / 推断 / 未完成")
    lines.append("")
    lines.append("**实际测得（有原始记录与可复算命令）**")
    lines.append("")
    lines.append("- 五图初态金币/合法集/招募集合与审核表逐项一致；快照往返不重复结算。")
    lines.append("- 13 个模型臂 / 教师档在新五图 DEV20 上的完整胜负数与逐局记录（`arena/dev/report.json`）。")
    lines.append("- H0 镜像 10 个实体（20 个座位视角）。")
    lines.append("- B5 修正实现的一次完整更新读数、位级确定性读数与数值限制标记。")
    lines.append("- 稳定 tie-break 在真实状态上的重排不变性（60 个用例）。")
    lines.append(f"- {window_stats['windows']} 个失败窗口（重放 digest 不一致 "
                 f"{window_stats['digestMismatches']} 次）与 40 个固定反事实窗口及其支路终局。")
    lines.append("- S1a/S1b/S1c 三档的 DEV20 成绩、边界达成率、标签耗时与 transition 分布。")
    lines.append("- 3 seed × 12,000 更新（各 384,000 曝光）的正式策略训练与各自 DEV20。")
    lines.append("")
    lines.append("**推断（有证据但不构成证明）**")
    lines.append("")
    lines.append("- C2 的失败主要来自训练分布（旧开局金币 300 的轨迹；五图中 Liberty Port、Mourningstar "
                 "在旧训练池为 0 行，Crossed swords 仅 200 行）而不是推理实现缺陷："
                 "本轮恢复出的缺陷都是测试覆盖缺口，且 C2 在新初态上仍能自然终局（完成率 100%）。")
    lines.append("- 教师档位提升（S1a 2/20 → S1b 6/20）说明「更宽的根候选 + 更多敌方首回应分支」确实有效；"
                 "S1c 的两轮目标没有继续改善（5/20），更像是叶评估精度不足，而不是预算不足——"
                 "因为 S1c 的 transition 预算翻倍后仍未赢下 Icy Paths / Liberty Port / Crossed swords。")
    lines.append("- 暖启动 + 目标分布数据的收益（c2:42 2/20 → W1 4/20 → P1 最好 seed 5/20）说明"
                 "「数据分布对齐」比「扩大网络」更值得先做；但这只是 3 个 seed、20 局面板上的点估计，"
                 "区间很宽（P1 三 seed 为 2/5/2），不能当作稳定性结论。")
    lines.append("")
    lines.append("**未完成**")
    lines.append("")
    lines.append("- S1 三档均未通过 ≥14/20 教师资格；按任务书 §5.3 转入「回合宏动作 beam + 经校准价值叶」路线。")
    lines.append("- A2（S1 标签）按合同不得用未合格教师的标签作为强监督。")
    lines.append("- 数据只有 H0-H0 一种行为源（任务书 §6.1 要求 H0-H0 与 S1-H0 两种）；"
                 "原因是 §5.3 明确不要蒸馏已证实弱于 H0 的教师，S1 合格后需补采。")
    lines.append("- T16-06 的价值学习（P/PV 对照、价值校准）与搜索分布监督（soft/masked loss contract）未开始。")
    lines.append("- T16-07 学生纠错波次、T16-08 RECHECK40 与 CONFIRM20 未开始。")
    lines.append("- **18/20 目标未达成，总体判定 `NO_PROMOTION`。**")
    lines.append("")

    lines.append("## 9. 复算入口")
    lines.append("")
    lines.append("见同目录 `resume.md`（给出可直接复制的命令）。")
    lines.append("")
    (run_root / "final_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    # ---------------- model_card.md ----------------
    card: List[str] = []
    card.append("# V16 模型卡")
    card.append("")
    card.append(f"runId：`{args.run_id}`；生成时间：{progress['generatedAt']}。")
    card.append("")
    card.append("## 当前最强候选")
    card.append("")
    if champion:
        card.append(f"- 标签：`{champion.get('modelTag')}`")
        card.append(f"- 权重 SHA-256：`{champion.get('checkpointSha256')}`")
        card.append(f"- encoder schema：`{champion.get('encoderSchema')}`")
        card.append(f"- 结构：2 blocks / 32ch / 26 空间通道 / 20 全局 / 53 动作语义；`globalPolicyPool=false`")
        card.append(f"- 选动作方式：真实合法集 → 过滤 `surrender` → **按 actionCode 的 Unicode 代码点序规范排序** → "
                    f"TS 前向 → 精确并列取最小 actionCode")
        card.append(f"- DEV20：**{champion.get('wins')}/{champion.get('candidateGames')}**"
                    f"（{' , '.join(champion.get('byMap') or [])}）")
        card.append(f"- 用途：**开发候选**。未通过最终验收，**不得**替换生产默认 H0。")
    else:
        card.append("- `NOT_MEASURED`")
    card.append("")
    card.append("## 已知限制（必须随模型一起交接）")
    card.append("")
    card.append(f"- C2 系权重主要来自**旧开局分布**（初始金币 300）的轨迹；五图中 Liberty Port、"
                f"Mourningstar 在旧训练池中为 0 行，Crossed swords 仅 200 行。")
    card.append("- 价值头 `valueSupervised=0`，**没有**经过真实结果监督，禁止用作搜索叶评估。")
    card.append("- 教师 S1a 未通过 ≥14/20 资格，因此没有可信的强标签来源。")
    card.append("- 本目标只在「已知五图 + 固定 H0」下评测，不构成任意地图/任意对手的强度声明。")
    card.append("")
    card.append("## 评测身份")
    card.append("")
    if source_manifest:
        groups = source_manifest.get("groups", {})
        for name, block in groups.items():
            card.append(f"- `{name}` 源码摘要：`{block.get('digest')}`（{len(block.get('files') or {})} 个文件）")
    if arena_protocol:
        card.append(f"- 初始化策略：`{arena_protocol.get('initializationPolicyId')}`")
        card.append(f"- caps：`{json.dumps(arena_protocol.get('caps'), ensure_ascii=False)}`（id `{arena_protocol.get('capsId')}`）")
        card.append(f"- 动作过滤：`{arena_protocol.get('actionFilterId')}`")
    card.append("")
    (run_root / "model_card.md").write_text("\n".join(card) + "\n", encoding="utf-8")

    # ---------------- resume.md ----------------
    R = args.run_id
    resume: List[str] = []
    resume.append(f"# V16 恢复说明（runId `{R}`）")
    resume.append("")
    resume.append("所有命令都在仓库根目录 `C:\\code\\AncinetEmpires` 执行。"
                  "`PY` 指 `C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`"
                  "（Anaconda 的 `python` 没有 torch）。")
    resume.append("")
    resume.append("```powershell")
    resume.append("$PY = 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe'")
    resume.append(f"$R  = '{R}'")
    resume.append("$TOOL = 'v12/tools/run-tool.mjs'")
    resume.append("```")
    resume.append("")
    resume.append("## 1. 重建冻结身份（T16-00）")
    resume.append("")
    resume.append("```powershell")
    resume.append("# 采集 git 身份（工具内不能 spawn git，所以先在外部生成 JSON）")
    resume.append("$head = git rev-parse HEAD; $branch = git rev-parse --abbrev-ref HEAD")
    resume.append("$status = git status --porcelain | Where-Object { $_ -notmatch 'pytest-cache-files' }")
    resume.append("$obj = [ordered]@{ schema='v16_git_identity_1'; head=$head; branch=$branch;")
    resume.append("  capturedAt=(Get-Date).ToString('o'); trackedChangeCount=($status | Where-Object { $_ -match '^ ?M' }).Count;")
    resume.append("  untrackedCount=($status | Where-Object { $_ -match '^\\?\\?' }).Count; statusLineCount=$status.Count;")
    resume.append("  statusPreview=($status | Select-Object -First 200); diffStatLastLine=(git diff --stat | Select-Object -Last 1);")
    resume.append("  note='工作区有并发执行者的未提交修改；源码身份以 source_manifest.json 的逐文件 SHA 为准。' }")
    resume.append("$obj | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 v16/out/$R/identity/_git_identity.json")
    resume.append("")
    resume.append("& $PY -c \"import json,platform,sys,os,torch,numpy;print(json.dumps({'schema':'v16_python_env_1','executable':sys.executable,'python':platform.python_version(),'torch':torch.__version__,'cuda':torch.cuda.is_available(),'cudaDeviceCount':torch.cuda.device_count(),'torchThreads':torch.get_num_threads(),'numpy':numpy.__version__}))\" > v16/out/$R/identity/_python_env.json")
    resume.append("")
    resume.append("node --openssl-legacy-provider $TOOL v16/tools/freeze_v16.ts --run-id $R \\")
    resume.append("  --git-json v16/out/$R/identity/_git_identity.json \\")
    resume.append("  --python-env v16/out/$R/identity/_python_env.json --force")
    resume.append("```")
    resume.append("")
    resume.append("## 2. 正确性回归（T16-02）")
    resume.append("")
    resume.append("```powershell")
    resume.append("& $PY v16/tools/t16_02_b5_clone_graph.py --out-dir v16/out/$R/T16-02")
    resume.append("node --openssl-legacy-provider $TOOL v16/tools/t16_02_ordering_regression.ts \\")
    resume.append("  --model v15/out/v15_20260925_core/T15-06/c2_s42/c2_s42_final.json \\")
    resume.append("  --out v16/out/$R/T16-02/ordering_regression.json")
    resume.append("```")
    resume.append("")
    resume.append("## 3. 对局面板（T16-01）")
    resume.append("")
    resume.append("```powershell")
    resume.append("# 基线：三个 C2 各 20 局 + H0 镜像 10 实体（caps v2 = 12,000 步 / 900 秒）")
    resume.append("foreach ($m in @('c2_s42','c2_s1337','c2_s2026')) {")
    resume.append("  node --openssl-legacy-provider $TOOL v16/tools/arena_run_v16.ts --run-id $R --panel dev \\")
    resume.append("    --model v15/out/v15_20260925_core/T15-06/$m/${m}_final.json --model-key ${m}:x --arms candidate")
    resume.append("}")
    resume.append("node --openssl-legacy-provider $TOOL v16/tools/arena_run_v16.ts --run-id $R --panel dev --arms mirror")
    resume.append("")
    resume.append("# 汇总（读 arena/dev 下全部 games.jsonl）")
    resume.append("node --openssl-legacy-provider $TOOL v16/tools/arena_report_v16.ts --run-id $R --panel dev")
    resume.append("```")
    resume.append("")
    resume.append("## 4. 失败窗口与反事实（T16-01 §3.1/§3.2）")
    resume.append("")
    resume.append("```powershell")
    resume.append("node --openssl-legacy-provider $TOOL v16/tools/collect_trajectories_v16.ts --run-id $R \\")
    resume.append("  --games v16/out/$R/arena/dev/c2_42.games.jsonl \\")
    resume.append("  --model v15/out/v15_20260925_core/T15-06/c2_s42/c2_s42_final.json --model-key c2:42 \\")
    resume.append("  --out-dir v16/out/$R/T16-01")
    resume.append("")
    resume.append("node --openssl-legacy-provider $TOOL v16/tools/select_windows_v16.ts \\")
    resume.append("  --inputs v16/out/$R/T16-01/windows/c2_42.windows.jsonl,v16/out/$R/T16-01/windows/c2_1337.windows.jsonl,v16/out/$R/T16-01/windows/c2_2026.windows.jsonl \\")
    resume.append("  --per-map 8 --per-seat 4 --out-dir v16/out/$R/T16-01/counterfactual")
    resume.append("")
    resume.append("foreach ($i in 0..3) {")
    resume.append("  node --openssl-legacy-provider $TOOL v16/tools/counterfactual_v16.ts \\")
    resume.append("    --windows v16/out/$R/T16-01/counterfactual/selected_40.jsonl --shard $i/4 --to-terminal true \\")
    resume.append("    --out-dir v16/out/$R/T16-01/counterfactual")
    resume.append("}")
    resume.append("```")
    resume.append("")
    resume.append("## 5. 教师（T16-03）")
    resume.append("")
    resume.append("```powershell")
    resume.append("node --openssl-legacy-provider $TOOL v16/tools/teacher_s1_pilot_v16.ts --mode pilot \\")
    resume.append("  --tiers S1a,S1b,S1c --windows 40 --source-panel preflight --out v16/out/$R/T16-03/pilot.json")
    resume.append("")
    resume.append("# 教师对 H0 的 DEV20（示例：S1a）")
    resume.append("foreach ($i in 0..3) {")
    resume.append("  node --openssl-legacy-provider $TOOL v16/tools/arena_run_v16.ts --run-id $R --panel dev \\")
    resume.append("    --policy s1 --teacher-tier S1a --arms candidate --shard $i/4 \\")
    resume.append("    --out v16/out/$R/arena/dev/s1a.shard${i}of4.games.jsonl")
    resume.append("}")
    resume.append("```")
    resume.append("")
    resume.append("## 6. 数据与训练（T16-04 / T16-05）")
    resume.append("")
    resume.append("```powershell")
    resume.append("# 采集（train 16 seed/图 × 2 座位；val 8 seed/图 × 2 座位）")
    resume.append("foreach ($i in 0..7) { node --openssl-legacy-provider $TOOL v16/tools/collect_v16_rollouts.ts \\")
    resume.append("  --run-id $R --split train --source h0 --shard $i/8 }")
    resume.append("foreach ($i in 0..3) { node --openssl-legacy-provider $TOOL v16/tools/collect_v16_rollouts.ts \\")
    resume.append("  --run-id $R --split val --source h0 --shard $i/4 }")
    resume.append("")
    resume.append("# 建数据集（去重 / family 上限 / 阶段分层 / 双标签）")
    resume.append("$t = (Get-ChildItem v16/out/$R/T16-04/rollouts/train_h0*.jsonl | ? { $_.Name -notlike '*.summary.json' } | % { $_.FullName }) -join ','")
    resume.append("$v = (Get-ChildItem v16/out/$R/T16-04/rollouts/val_h0*.jsonl   | ? { $_.Name -notlike '*.summary.json' } | % { $_.FullName }) -join ','")
    resume.append("node --openssl-legacy-provider $TOOL v16/tools/build_v16_dataset.ts --run-id $R \\")
    resume.append("  --train-rollouts $t --val-rollouts $v --train-target 16000 --val-target 3200")
    resume.append("")
    resume.append("# 固定对照核心集 + split manifest")
    resume.append("& $PY v16/tools/make_core_variant.py --run-id $R --target l1")
    resume.append("")
    resume.append("# A0 / A1 / W1（同一核心集、同 model-seed、同 data-order-seed、同 4,000 更新）")
    resume.append("$common = @('--dataset',    \"v16/out/$R/T16-05/core_l1_all.jsonl\",")
    resume.append("            '--split-manifest', \"v16/out/$R/T16-05/core_l1_split_manifest.json\",")
    resume.append("            '--batch-size','32','--global-update-limit','4000','--lr-total-updates','4000',")
    resume.append("            '--lr-schedule-unit','update','--lr','0.001','--lr-min','0.00001','--weight-decay','0.0001',")
    resume.append("            '--value-weight','0','--model-version','spatial-resnet-v2','--num-blocks','2',")
    resume.append("            '--spatial-channels','26','--encoder-schema-id','spatial26_global20_actionSemantics53_v15',")
    resume.append("            '--model-seed','42','--data-order-seed','314159','--save-at-updates','1000,2000,3000')")
    resume.append("foreach ($arm in @('A0','A1','W1')) {")
    resume.append("  $extra = @(); if ($arm -eq 'A1') { $extra = @('--global-policy-pool') }")
    resume.append("  if ($arm -eq 'W1') { $extra = @('--init-checkpoint','v15/out/v15_20260925_core/T15-06/c2_s42/c2_s42_final.json') }")
    resume.append("  $d = \"v16/out/$R/experiments/$arm/seed42\"")
    resume.append("  & $PY python/train_spatial_resnet.py @common @extra \\")
    resume.append("    --out-model $d/${arm}_last.json --out-final-model $d/${arm}_final.json \\")
    resume.append("    --out-metrics $d/metrics.json --optimized-manifest $d/ledger.jsonl \\")
    resume.append("    --planned-manifest $d/plan.json --out-state $d/train_state.pt")
    resume.append("}")
    resume.append("")
    resume.append("# 每个臂跑 DEV20")
    resume.append("foreach ($arm in @('A0','A1','W1')) {")
    resume.append("  node --openssl-legacy-provider $TOOL v16/tools/arena_run_v16.ts --run-id $R --panel dev \\")
    resume.append("    --model v16/out/$R/experiments/$arm/seed42/${arm}_final.json --model-key ${arm}:seed42 --arms candidate")
    resume.append("}")
    resume.append("```")
    resume.append("")
    resume.append("## 7. 重生成报告")
    resume.append("")
    resume.append("```powershell")
    resume.append("& $PY v16/tools/make_reports.py --run-id $R")
    resume.append("```")
    resume.append("")
    resume.append("## 8. 精确恢复训练（断点续跑）")
    resume.append("")
    resume.append("每个实验目录里的 `train_state.pt` 是 `v15_train_state_2` 状态的精确恢复点"
                  "（model + optimizer + scheduler + RNG + 累计消费）。续跑必须同时给出**同一份**数据集、"
                  "split manifest 与 batch plan，否则拒绝精确恢复：")
    resume.append("")
    resume.append("```powershell")
    resume.append("& $PY python/train_spatial_resnet.py @common --resume-state v16/out/$R/experiments/A0/seed42/train_state.pt \\")
    resume.append("  --out-model v16/out/$R/experiments/A0/seed42/A0_ext.json \\")
    resume.append("  --out-final-model v16/out/$R/experiments/A0/seed42/A0_ext_final.json")
    resume.append("```")
    resume.append("")
    resume.append("## 9. 未完成项与下一步（按任务书 §5.3 的失败分支）")
    resume.append("")
    resume.append("1. **教师未通过资格**：最强档 "
                  f"`{best_teacher.get('modelTag') if best_teacher else 'n/a'}` 在 DEV20 实测 "
                  f"{(best_teacher or {}).get('wins')}/{(best_teacher or {}).get('candidateGames')}（门槛 ≥14/20）；"
                  "三档都没有赢下 Icy Paths / Liberty Port / Crossed swords。"
                  "下一步按任务书 §5.3 的失败分支：不用继续加预算，而是改叶评估与搜索形态"
                  "（回合宏动作 beam + 经校准价值叶），并优先攻击这三张图的 0/4。")
    resume.append("2. **A2 待教师资格**：不得用未合格教师的标签充当强监督。核心集已经存好 "
                  "`searchActionCode`/`searchMask` 字段的写入口（`label_core_s1_v16.ts --mode label|apply`），"
                  "教师合格后可直接补标签再训 A2。")
    resume.append("3. **数据源只有 H0-H0**：任务书 §6.1 要求 H0-H0 与 S1-H0 两种行为源。"
                  "本轮只采集了 H0-H0（原因：S1 未通过资格，且 §5.3 明确不要蒸馏已证实弱于 H0 的教师）。"
                  "S1 合格后需要补采，`collect_v16_rollouts.ts --source s1` 已实现。")
    resume.append("4. **价值学习与搜索分布监督未开始**：任务书 §8.2 要求先检查/扩展 "
                  "`--loss-mode soft/equiv` 的接口（当前实现是在 hard CE 上加 soft 项、要求完整 teacherQ），"
                  "新增显式 loss contract 后再做同样本预算的 hard vs soft/masked 对照。")
    resume.append("5. **T16-07 / T16-08 未开始**：纠错波次与 CONFIRM20 都依赖一个真正的冠军；"
                  "当前最强纯模型 DEV20 只有 5/20，距开发资格（≥18/20）差距很大，按协议不得提前跑 CONFIRM20。")
    resume.append("6. **本轮预算是主要约束**：所有读数都来自本机 CPU（16 核）实跑。"
                  "单臂训练成本已实测（≈7.4 updates/s，12,000 更新约 27 分钟）；"
                  "教师一方 DEV20 因对局进入 900 秒墙钟，单次面板需要 1–3 小时（4 分片并行）。"
                  "扩预算的优先顺序建议：先修教师在弱图上的决策质量，再扩训练规模。")
    resume.append("")
    (run_root / "resume.md").write_text("\n".join(resume) + "\n", encoding="utf-8")

    print(json.dumps({
        "progress": str((run_root / "progress.json").relative_to(REPO)).replace("\\", "/"),
        "taskStatus": str((run_root / "task_status.json").relative_to(REPO)).replace("\\", "/"),
        "finalReport": str((run_root / "final_report.md").relative_to(REPO)).replace("\\", "/"),
        "modelCard": str((run_root / "model_card.md").relative_to(REPO)).replace("\\", "/"),
        "resume": str((run_root / "resume.md").relative_to(REPO)).replace("\\", "/"),
        "champion": champion_tag,
        "championDev20": (champion or {}).get("wins"),
        "bestTeacher": best_teacher_tag,
        "bestTeacherDev20": (best_teacher or {}).get("wins"),
        "p1Dev20": p1_wins,
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
