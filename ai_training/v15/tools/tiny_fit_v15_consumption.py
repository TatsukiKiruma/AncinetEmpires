"""V15/T15-05：单次 128 状态 train-only 诊断的消费证据与 TS/Python 逐状态一致核对。

产出 `tiny_fit_v15_consumption.json`：
- 训练器实测消费（updates/exposures/唯一样本/唯一 policyInputKey/唯一 root 家族）；
- 每条 update 的记录来源（stage1 ledger 覆盖 update 0..7999；stage2 的 ledger 因训练器
  的防覆盖守卫未写出，见 `ledgerGap`，以 metrics/consumed 的累计读数补齐）；
- 学习曲线关键点；
- TS shared policy 重评（`tiny_fit_v15_ts_reeval.json`）与 Python 前向评估
  （`tiny_fit_v15_final.json`）的**逐状态一致**核对：命中集合必须完全相同。

用法：
    python v15/tools/tiny_fit_v15_consumption.py --run-dir <T15-05>/tiny_fit \
        --artifact-dir <T15-05> --out <T15-05>/tiny_fit_v15_consumption.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List


def sha256_file(path: Path) -> str | None:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--artifact-dir", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--stem", default="tiny_s42",
                        help="训练产物文件名前缀（默认 tiny_s42；重跑用 tiny_s42_v15schema）")
    parser.add_argument("--label", default=None, help="写入报告的运行标签")
    parser.add_argument("--results", nargs="*", default=None,
                        help="覆盖用于逐状态一致的评估产物路径：<pythonEval.json> <tsReeval.json>")
    parser.add_argument("--config", default=None,
                        help="tiny_fit_v15_config.json 路径（重跑目录不含该文件时指向父目录）")
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    artifact_dir = Path(args.artifact_dir)
    stem = args.stem

    consumed = json.loads((run_dir / f"{stem}.consumed.json").read_text(encoding="utf-8"))
    metrics = json.loads((run_dir / f"{stem}_metrics.json").read_text(encoding="utf-8"))
    stage8000_metrics_path = run_dir / "tiny_s42_metrics_stage8000.json"
    stage8000_metrics = (json.loads(stage8000_metrics_path.read_text(encoding="utf-8"))
                         if stage8000_metrics_path.exists() else None)
    if args.results and len(args.results) == 2:
        py_eval_path = Path(args.results[0])
        ts_reeval_path = Path(args.results[1])
    else:
        py_eval_path = artifact_dir / "tiny_fit_v15_final.json"
        ts_reeval_path = artifact_dir / "tiny_fit_v15_ts_reeval.json"
    ts_reeval = json.loads(ts_reeval_path.read_text(encoding="utf-8"))
    py_final = json.loads(py_eval_path.read_text(encoding="utf-8"))
    config_path = Path(args.config) if args.config else (run_dir / "tiny_fit_v15_config.json")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    split_manifest_path = artifact_dir / "tiny_fit_v15_split_manifest.json"
    if not split_manifest_path.exists():
        # V14b 审核 §2.1 的教训：不再用「最后一行当验证占位」的含糊说明。
        # train-only 模式下没有验证集，这里如实声明 0 行 val，而不是留一个占位行。
        coverage = config.get("coverage", {})
        split_manifest_path.write_text(json.dumps({
            "schema": "v15_tiny_fit_split_manifest_1",
            "task": "T15-05",
            "runId": "v15_20260925_core",
            "purpose": "128 状态记忆/可拟合性诊断（diagnostic=true）：全部 128 行进入优化。",
            "trainerMode": "train-only",
            "datasetPath": config.get("dataSource", {}).get("inputRowsPath"),
            "datasetSha256": config.get("dataSource", {}).get("inputRowsSha256"),
            "rows": coverage.get("trainStates"),
            "trainRows": coverage.get("trainStates"),
            "valRows": 0,
            "valPlaceholderRows": 0,
            "valSizeNote": "本轮使用训练器的显式 --train-only 模式：不切验证集、不设占位行，"
                           "best 选择被训练器禁用；能力读数以 final 权重在 128 个状态上的重评为准。",
            "trainRootFamilies": coverage.get("rootFamilies"),
        }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    split_manifest = json.loads(split_manifest_path.read_text(encoding="utf-8"))

    ledger_path = run_dir / f"{stem}.optimizer_update_ledger.jsonl"
    ledger_updates = 0
    ledger_first: Dict[str, Any] | None = None
    ledger_last: Dict[str, Any] | None = None
    if ledger_path.exists():
        with ledger_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                entry = json.loads(line)
                if ledger_updates == 0:
                    ledger_first = entry
                ledger_last = entry
                ledger_updates += 1

    # 逐状态一致：TS shared policy 的选择 vs Python 前向的 argmax。
    ts_hits = {case["sampleId"] for case in ts_reeval["cases"] if case.get("hit")}
    ts_choices = {case["sampleId"]: case.get("chosenActionCode") for case in ts_reeval["cases"]}
    py_hits = {case["sampleId"] for case in py_final["cases"] if case["hit"]}
    py_choices = {case["sampleId"]: case.get("predictedActionCode") for case in py_final["cases"]}
    agreement_ids = set(ts_choices) & set(py_choices)
    choice_disagreements = [sid for sid in sorted(agreement_ids) if ts_choices[sid] != py_choices[sid]]
    hit_set_differences = sorted(ts_hits ^ py_hits)

    history = metrics.get("history") or []
    curve = [{"epoch": entry["epoch"], "updatesCumulative": entry["updatesCumulative"],
              "trainLoss": entry["train_loss"], "trainAcc": entry["train_acc"]}
             for entry in history if entry["epoch"] % 100 == 0 or entry["epoch"] == 1]

    report = {
        "schema": "v15_tiny_fit_consumption_1",
        "task": "T15-05",
        "runId": "v15_20260925_core",
        "purpose": "任务书 §6：一次 seed 42、真正 128 个训练状态的 train-only 回归的消费与结果证据。",
        "label": args.label or stem,
        "configSummary": {
            "trainer": "python/train_spatial_resnet.py",
            "mode": "train-only（128 行全部进入优化；无验证集；best 选择被禁用）",
            "stages": [
                {"name": "stage1_controlled_pause", "targetUpdates": 8000,
                 "commandFile": "tiny_fit/train_command_stage1.txt",
                 "logFile": "tiny_fit/train_stage1.log",
                 "metrics": "tiny_fit/tiny_s42_metrics_stage8000.json",
                 "finalModel": "tiny_fit/tiny_s42_final_stage8000.json"},
                {"name": "stage2_resume_to_budget", "targetUpdates": 16000,
                 "commandFile": "tiny_fit/train_command_stage2.txt",
                 "logFile": "tiny_fit/train_stage2.log",
                 "metrics": "tiny_fit/tiny_s42_metrics.json",
                 "finalModel": "tiny_fit/tiny_s42_final.json"},
            ],
            "v14ReferenceConfig": config.get("v14ReferenceConfig"),
            "v15RunConfig": config.get("v15RunConfig"),
            "dataSource": config.get("dataSource"),
            "coverage": config.get("coverage"),
            "splitManifest": split_manifest,
        },
        "measuredConsumption": {
            "updates": consumed.get("updates"),
            "totalExposures": consumed.get("totalExposures"),
            "batchSize": consumed.get("batchSize"),
            "plannedTrainRows": consumed.get("plannedTrainRows"),
            "optimizedUniqueSamples": consumed.get("optimizedUniqueSamples"),
            "plannedButNeverOptimized": consumed.get("plannedButNeverOptimized"),
            "uniquePolicyInputKeys": consumed.get("uniquePolicyInputKeys"),
            "uniqueSourceStateKeys": consumed.get("uniqueSourceStateKeys"),
            "uniqueRootFamilies": consumed.get("uniqueRootFamilies"),
            "policyMaskedExposures": consumed.get("policyMaskedExposures"),
            "valueSupervisedExposures": consumed.get("valueSupervisedExposures"),
            "stopReason": consumed.get("stopReason"),
            "diagnosticMode": consumed.get("diagnosticMode"),
            "lifecycle": consumed.get("lifecycle"),
            "lrSchedule": consumed.get("lrSchedule"),
            "artifactSha256": {
                "consumed": sha256_file(run_dir / "tiny_s42.consumed.json"),
                "metrics": sha256_file(run_dir / "tiny_s42_metrics.json"),
                "finalModel": sha256_file(run_dir / "tiny_s42_final.json"),
                "state": sha256_file(run_dir / "tiny_s42.state.pt"),
                "stage1Ledger": sha256_file(ledger_path),
                "stage8000Metrics": sha256_file(stage8000_metrics_path),
            },
        },
        "updateLedger": {
            "stage1LedgerPath": str(ledger_path).replace("\\", "/"),
            "ledgerEntries": ledger_updates,
            "firstEntry": ledger_first,
            "lastEntry": ledger_last,
            "ledgerComplete": ledger_updates == (consumed.get("updates") or 0),
            "ledgerGap": {
                "missingRange": [8000, 15999],
                "reason": "训练器把 ledger 命名为 <out-model>.optimizer_update_ledger.jsonl 并拒绝覆盖已存在文件；"
                          "同一条逻辑运行的 resume 只能改 --out-model（identity 不含 out-model），"
                          "于是第二次运行在收尾写 ledger 时抛 FileExistsError。"
                          "该次运行的权重/state/consumed/metrics 都在抛错之前已经落盘，只有逐 update 的 ledger 缺失。",
                "impact": "总更新数与曝光数仍由 consumed.json 的实测累计值给出（16000 / 256000）；"
                          "逐 update 台账只覆盖前 8000 步。",
                "minimalRepro": "见 task_status.blockedOn[1]",
            },
        },
        "learningCurve": curve,
        "stage8000": {
            "finalUpdates": (stage8000_metrics or {}).get("history", [{}])[-1].get("updatesCumulative")
            if stage8000_metrics else None,
            "trainLoss": (stage8000_metrics or {}).get("history", [{}])[-1].get("train_loss")
            if stage8000_metrics else None,
            "trainAcc": (stage8000_metrics or {}).get("history", [{}])[-1].get("train_acc")
            if stage8000_metrics else None,
        },
        "results": {
            "pythonFinalEval": {
                "path": "tiny_fit_v15_final.json",
                "top1Correct": py_final["top1Correct"],
                "trainCrossEntropy": py_final["trainCrossEntropy"],
                "acceptance": py_final["acceptance"],
                "failureCount": py_final["failureCount"],
                "failuresWithIdenticalFeatures": py_final["aliasExplanation"]["failuresWithIdenticalFeatures"],
            },
            "tsSharedPolicyReeval": {
                "path": "tiny_fit_v15_ts_reeval.json",
                "top1Correct": ts_reeval["top1Correct"],
                "top1Accuracy": ts_reeval["top1Accuracy"],
                "predictorSchemaId": ts_reeval["predictorSchemaId"],
                "semanticsVariant": ts_reeval["semanticsVariant"],
                "engineSetMismatches": ts_reeval["engineSetMismatches"],
                "sharedPolicyErrors": ts_reeval["sharedPolicyErrors"],
                "acceptance": ts_reeval["acceptance"],
            },
            "tsPythonPerStateAgreement": {
                "statesCompared": len(agreement_ids),
                "choiceDisagreements": len(choice_disagreements),
                "choiceDisagreementSampleIds": choice_disagreements[:10],
                "hitSetDifferences": hit_set_differences,
                "identicalHitSets": len(hit_set_differences) == 0 and len(choice_disagreements) == 0,
            },
        },
    }

    Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "out": args.out,
        "updates": report["measuredConsumption"]["updates"],
        "exposures": report["measuredConsumption"]["totalExposures"],
        "uniqueSamples": report["measuredConsumption"]["optimizedUniqueSamples"],
        "pythonTop1": py_final["top1Correct"],
        "pythonCE": py_final["trainCrossEntropy"],
        "tsTop1": ts_reeval["top1Correct"],
        "tsPythonChoiceDisagreements": len(choice_disagreements),
        "identicalHitSets": report["results"]["tsPythonPerStateAgreement"]["identicalHitSets"],
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
