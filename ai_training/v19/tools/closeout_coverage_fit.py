"""核验同轨迹预算延长实验并记录未通过门槛的原因。"""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "v19/out/coverage_fit_20261004"
OLD = ROOT / "v19/out/coverage_20261004"

def read(p):
    return json.loads(p.read_text(encoding="utf-8"))

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    out = RUN / "closeout.json"
    if out.exists():
        raise FileExistsError(out)
    folder = RUN / "trunk_ce16"
    assert read(folder / "process_result.json")["returnCode"] == 0
    ledger = [json.loads(s) for s in (folder / "best.optimizer_update_ledger.jsonl").read_text().splitlines()]
    old_ledger = [json.loads(s) for s in (OLD / "training/trunk_full/best.optimizer_update_ledger.jsonl").read_text().splitlines()]
    assert len(ledger) == 2648 and len(old_ledger) == 662
    for new, old in zip(ledger, old_ledger):
        assert {k: v for k, v in new.items() if k != "durationMs"} == {k: v for k, v in old.items() if k != "durationMs"}
    prefix = folder / "best.u662.json"
    assert sha(prefix) == sha(OLD / "training/trunk_full/final.json")
    plan = read(folder / "batch_plan.json")
    counts = Counter()
    for row, batch in zip(ledger, plan["updates"]):
        assert row["sampleIds"] == [item["sampleId"] for item in batch["items"]]
        counts.update(row["sampleIds"])
    assert len(counts) == 5295 and sum(counts.values()) == 84736
    assert all(abs(row["lr"] - 1e-5) < 1e-15 for row in ledger[662:])
    identity = read(folder / "experiment_identity.json")
    assert all(sha(Path(p)) == h for p, h in identity["sourceSha256"].items())
    curve = read(RUN / "checkpoint_curve.json")
    final_sha = sha(folder / "final.json")
    baseline = curve["checkpoints"][0]
    final = next(x for x in curve["checkpoints"] if x["sha256"] == final_sha)
    key = "previously_consumed_current_rules_regression_only"
    train = read(RUN / "fit16_final_train_diagnostic.json")["overall"]["models"]["trunk_ce16_final"]
    old_train = read(OLD / "train_agreement.json")["overall"]["models"]["trunk_full_final"]
    changes = final["diagnostics"]["comparisonToReference"][key]
    gate = {"currentMacroAtLeastTheta1": final["validationBySource"][key]["macroFamily"]["top1Accuracy"] >= baseline["validationBySource"][key]["macroFamily"]["top1Accuracy"],
            "correctedAtLeastRegressed": changes["teacherCorrected"] >= changes["teacherRegressed"],
            "trainingFitImproved": train["agreementRate"] > old_train["agreementRate"]}
    paths = [folder / x for x in ("experiment_identity.json", "process_result.json", "best.optimizer_update_ledger.jsonl", "final.json", "best.u662.json")]
    paths += [RUN / x for x in ("checkpoint_curve.json", "fit16_final_train_diagnostic.json", "fit16_final_train_samples.jsonl")]
    result = {"schema": "v19_coverage_fit_closeout_1", "date": "2026-10-04", "classification": "progress",
              "goalStatus": "active", "objectiveAchieved": False, "phaseCompleted": True,
              "actualUpdates": len(ledger), "actualExposures": sum(counts.values()),
              "uniqueOptimizedInputs": len(counts), "perSampleExposures": [min(counts.values()), max(counts.values())],
              "prefixModelByteIdentical": True, "prefixLedgerIdenticalExcludingDuration": True,
              "prefixReplayedUpdates": 662, "incrementalTrajectoryUpdates": 1986,
              "trainingBefore": old_train, "trainingAfter": train,
              "currentFinal": final["validationBySource"][key], "changesAgainstTheta1": changes,
              "arenaGate": gate, "arenaGatePassed": all(gate.values()), "newArenaGames": 0,
              "championChanged": False, "nextTask": "用已冻结3174训练一致锚点，配对检验全局KL与选择性保持约束；不扩大同配方预算，不回灌885验证输入",
              "interpretation": "继续低学习率训练提高训练拟合，却降低现行验证Top1；该预算配方失败，不能据此证明任何更大数据或模型都无效",
              "evidenceSha256": {str(p.relative_to(ROOT)).replace("\\", "/"): sha(p) for p in paths},
              "builderSha256": sha(Path(__file__))}
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"gate": gate, "training": train, "currentMacro": final["validationBySource"][key]["macroFamily"], "goalStatus": "active"}, ensure_ascii=False))

if __name__ == "__main__":
    main()
