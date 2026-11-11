"""从已核验的覆盖训练与完整面板证据生成阶段结论，目标未达时保持 active。"""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v19/out/coverage_20261004"

def read(path):
    return json.loads(path.read_text(encoding="utf-8"))

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    destination = RUN / "closeout.json"
    if destination.exists():
        raise FileExistsError(destination)
    identity = read(RUN / "arena_identity.json")
    curve = read(RUN / "checkpoint_curve.json")
    evidence_paths = [RUN / name for name in (
        "pilot/manifest.json", "training_audit.json", "checkpoint_curve.json",
        "teacher_regret.json", "arena_identity.json")]
    models = []
    total_updates = total_exposures = 0
    for arm in ("trunk_small", "trunk_full", "head_ce", "head_kl"):
        folder = RUN / "training" / arm
        training = read(folder / "experiment_identity.json")
        process = read(folder / "process_result.json")
        if process["returnCode"] != 0:
            raise ValueError("训练未正常完成：" + arm)
        digest = sha(folder / "final.json")
        row = next(x for x in curve["checkpoints"] if x["sha256"] == digest)
        total_updates += training["updates"]
        total_exposures += training["plannedExposures"]
        models.append({"arm": arm, "sha256": digest, "uniqueInputs": training["availableTrainRows"],
                       "updates": training["updates"], "exposures": training["plannedExposures"],
                       "offline": row["validationBySource"], "diagnostics": row["diagnostics"]})
        evidence_paths += [folder / "experiment_identity.json", folder / "process_result.json",
                           folder / "optimized.json", folder / "best.optimizer_update_ledger.jsonl"]
    panels = []
    for candidate in identity["candidates"]:
        arm = candidate["arm"]
        panel_path = RUN / f"{arm}_dev20_evidence.json"
        panel = read(panel_path)
        if not panel["result"]["validPanel"]:
            raise ValueError("面板完整性失败：" + arm)
        games = []
        by_map = {}
        for index in range(5):
            path = RUN / f"arena/dev/{arm}.m{index}.games.jsonl"
            rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
            games.extend(rows)
            by_map[rows[0]["mapName"]] = dict(Counter(r["outcomeKind"] for r in rows))
            evidence_paths += [path, path.with_name(path.name.replace(".games.jsonl", ".progress.json"))]
        if len(games) != 20:
            raise ValueError("固定20局数量错误")
        panels.append({"arm": arm, "modelSha256": candidate["sha256"], "result": panel["result"],
                       "outcomes": dict(Counter(r["outcomeKind"] for r in games)), "byMap": by_map})
        evidence_paths.append(panel_path)
    any_pass = any(p["result"]["continuous16Met"] for p in panels)
    result = {"schema": "v19_coverage_round_closeout_1", "date": "2026-10-04",
              "phaseCompleted": True, "goalStatus": "active", "objectiveAchieved": False,
              "classification": "progress", "trainingRuns": 4,
              "optimizerUpdates": total_updates, "actualExposures": total_exposures,
              "uniqueTrainInputsFull": 5295, "validationInputs": 885,
              "offlineCheckpointsIncludingInitial": len(curve["checkpoints"]),
              "newArenaGames": 40, "models": models, "panels": panels,
              "anyDev16Met": any_pass, "confirmRun": False, "championChanged": False,
              "nextAction": ("冻结DEV达标模型后运行原CONFIRM面板" if any_pass else
                             "停止重复同配方扩量；先在训练池构建θ1/H0一致性与动作分差诊断，再检验选择性保持损失与全局KL的配对差异"),
              "limitations": ["DEV已反复消费，不能作为独立泛化证据", "H0分差不是Q值或自然收益",
                              "optimized.maxExampleExposures字段语义错误，真实4至5次曝光以逐更新台账为准",
                              "同75家族扩状态覆盖，尚未扩大起点家族或网络参数规模"],
              "evidenceSha256": {str(p.relative_to(ROOT)).replace("\\", "/"): sha(p) for p in evidence_paths},
              "builderSha256": sha(Path(__file__))}
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"panels": panels, "updates": total_updates, "exposures": total_exposures,
                      "goalStatus": "active"}, ensure_ascii=False))

if __name__ == "__main__":
    main()
