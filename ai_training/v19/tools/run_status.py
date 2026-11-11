"""V19/T19-00.5：统一训练/任务报告状态口径。

V18 的教训之一是「本轮 agent 停止执行」被写成了近似「任务达标完成」。这里把四种状态
在**类型上**分开，任何报告只能取其中之一，不允许用含糊词替代：

- `STAGE_COMPLETE`      某个阶段（例如 T19-00）交付完成。**不等于**棋力提升或总目标完成。
- `RECIPE_STOPPED`      某条配方经连续复核无改善，按计划停用并保留最好模型。
- `BUDGET_EXHAUSTED`    预算用完但总目标未达成；必须同时给出 `OBJECTIVE_NOT_MET`。
- `OBJECTIVE_COMPLETE`  仅当 CONFIRM20 达到 18 次自然胜利且逐局证据齐全时才可使用。

另有一个与上述并列、必须始终显式给出的字段 `objectiveMet`（bool）：它只由正式 CONFIRM20
的逐局文件决定，不由任何工程产物决定。

用法：
    python v19/tools/run_status.py --run-id run_20260928_v19_01 \
        --stage T19-00 --status STAGE_COMPLETE --note "..." \
        --evidence path1 --evidence path2
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]

STATUS_VOCABULARY = {
    "STAGE_COMPLETE": "某一阶段交付完成；不表示棋力提升，也不表示总目标完成。",
    # 2026-09-29 接续任务 G 节要求的七态口径（上面四态保留兼容，语义不变）。
    "ENGINEERING_COMPLETE": "工程/流程修复完成（训练流程、分块存储、谱系）。**不表示**棋力提升。",
    "TRAINING_WAVE_COMPLETE": "一波完整训练闭环完成（新采样→PPO→导出→DEV20），并已报告实际局数。",
    "PROVISIONAL_IMPROVEMENT": "DEV 相对对照出现改善，但尚未通过独立 FRESH 面板；不得替换冠军。",
    "CONFIRMED_IMPROVEMENT": "已有 FRESH 面板方向复现的改善；可考虑暂定晋升。",
    "RECIPE_STOPPED": "某条配方经连续复核无改善而按计划停用；保留最好模型并记录停止依据。",
    "BUDGET_EXHAUSTED": "预算用完但总目标未达成；必须同时标记 objectiveMet=false。",
    "OBJECTIVE_COMPLETE": "仅当正式 CONFIRM20 达到 18 次自然胜利、逐局证据齐全时使用。",
}
OBJECTIVE_NOT_MET = "OBJECTIVE_NOT_MET"


def load(path: Path, default: dict) -> dict:
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260928_v19_01")
    parser.add_argument("--stage", required=True)
    parser.add_argument("--status", required=True, choices=sorted(STATUS_VOCABULARY))
    parser.add_argument("--note", default="")
    parser.add_argument("--evidence", action="append", default=[])
    parser.add_argument("--objective-met", default="false")
    parser.add_argument("--next-step", default="")
    parser.add_argument("--dev-wins", type=int, default=None)
    parser.add_argument("--dev-games", type=int, default=None)
    args = parser.parse_args()

    run_dir = ROOT / "v19" / "out" / args.run_id
    objective_met = args.objective_met.lower() == "true"
    if args.status == "OBJECTIVE_COMPLETE" and not objective_met:
        raise SystemExit("拒绝：OBJECTIVE_COMPLETE 必须同时 objectiveMet=true（由 CONFIRM20 逐局文件决定）。")

    stage_row = {
        "stage": args.stage,
        "status": args.status,
        "statusMeaning": STATUS_VOCABULARY[args.status],
        "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "note": args.note,
        "evidence": args.evidence,
    }
    if args.status == "BUDGET_EXHAUSTED" and not objective_met:
        stage_row["objectiveFlag"] = OBJECTIVE_NOT_MET

    progress_path = run_dir / "progress.json"
    progress = load(progress_path, {
        "schema": "v19_progress_1",
        "runId": args.run_id,
        "objective": "同一纯网络、原五图、冻结 H0、每图两个新 seed 换边共 20 局至少 18 次自然胜利",
        "statusVocabulary": STATUS_VOCABULARY,
        "stages": [],
    })
    progress.setdefault("stages", [])
    progress["stages"] = [s for s in progress["stages"] if s.get("stage") != args.stage] + [stage_row]
    progress["objectiveMet"] = objective_met
    progress["objectiveFlag"] = None if objective_met else OBJECTIVE_NOT_MET
    progress["updatedAt"] = stage_row["recordedAt"]
    if args.next_step:
        progress["nextStep"] = args.next_step
    if args.dev_wins is not None and args.dev_games is not None:
        progress.setdefault("measurements", {})["latestDev20"] = {
            "wins": args.dev_wins, "games": args.dev_games, "recordedAt": stage_row["recordedAt"],
        }
    write(progress_path, progress)

    status_path = run_dir / "task_status.json"
    status = load(status_path, {"schema": "v19_task_status_1", "runId": args.run_id})
    status.update({
        "schema": "v19_task_status_1",
        "runId": args.run_id,
        "objective": progress["objective"],
        "objectiveMet": objective_met,
        "objectiveFlag": None if objective_met else OBJECTIVE_NOT_MET,
        "currentStage": args.stage,
        "currentStageStatus": args.status,
        "statusMeaning": STATUS_VOCABULARY[args.status],
        "note": args.note,
        "nextStep": args.next_step or status.get("nextStep", ""),
        "updatedAt": stage_row["recordedAt"],
        "statusVocabulary": STATUS_VOCABULARY,
        "discipline": [
            "写合同、修工具、降低 loss 都不等于目标完成。",
            "没有 18/20 时只能报告实际阶段进度，并保留 OBJECTIVE_NOT_MET。",
            "截断不计为胜，也不从分母删除。",
        ],
    })
    write(status_path, status)

    print(json.dumps({
        "ok": True,
        "progress": str(progress_path.relative_to(ROOT)).replace("\\", "/"),
        "taskStatus": str(status_path.relative_to(ROOT)).replace("\\", "/"),
        "stage": args.stage,
        "status": args.status,
        "objectiveMet": objective_met,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
