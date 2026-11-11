"""V15/T15-03 训练生命周期回归执行器（六条针对性回归）。

设计原则：
  - 每条回归都用**真实训练器**（`python/train_spatial_resnet.py` 子进程）跑小型真实模型 +
    小型真实 schema 数据，不重写训练数学；
  - 只记录**原始读数**（台账、metrics、state、SHA、耗时），判定逻辑放在 pytest 里，
    避免「自证」；
  - 所有命令原样记录，便于复核。

产出（写入 --out-dir）：
  trainer_lifecycle_results.json / resume_equivalence.json /
  sampler_contract.json / lr_trace.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Sequence

REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import train_batch_plan as tbp  # noqa: E402
import train_fixtures as tf  # noqa: E402

TRAINER = REPO_ROOT / "python" / "train_spatial_resnet.py"
DEFAULT_PYTHON = r"C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe"
# 预登记容差：CPU 固定环境下要求逐字节相同；容差只用于「字节不同但数值等价」的兜底判定。
PREREGISTERED_WEIGHT_TOLERANCE = {
    "rule": "CPU + torch 固定线程、相同初始状态下，恢复运行的 final 必须与连续运行逐字节相同；"
            "若字节不同则要求所有浮点权重最大绝对差 <= 1e-9。",
    "maxAbsDiff": 1e-9,
    "byteIdenticalRequired": True,
}
RUN_TIMEOUT_SEC = int(os.environ.get("V15_T1503_RUN_TIMEOUT", "1800"))


def sha256_file(path: str | os.PathLike[str]) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def read_json(path: str | os.PathLike[str]) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def read_ledger(path: str | os.PathLike[str]) -> List[Dict[str, Any]]:
    p = Path(path)
    if not p.exists():
        return []
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


def max_abs_diff(path_a: str | os.PathLike[str], path_b: str | os.PathLike[str]) -> Dict[str, Any]:
    """比较两个导出检查点的全部浮点权重。"""
    a = read_json(path_a)
    b = read_json(path_b)
    worst = 0.0
    counted = 0
    problems: List[str] = []

    def walk(x: Any, y: Any, where: str) -> None:
        nonlocal worst, counted
        if isinstance(x, list) and isinstance(y, list):
            if len(x) != len(y):
                problems.append(f"{where}: 长度 {len(x)} vs {len(y)}")
                return
            for i, (xi, yi) in enumerate(zip(x, y)):
                walk(xi, yi, f"{where}[{i}]")
        elif isinstance(x, dict) and isinstance(y, dict):
            if set(x) != set(y):
                problems.append(f"{where}: 键集合不同")
                return
            for k in x:
                walk(x[k], y[k], f"{where}.{k}")
        elif isinstance(x, str) or isinstance(y, str):
            if x != y:
                problems.append(f"{where}: {x!r} != {y!r}")
        elif isinstance(x, (int, float)) and isinstance(y, (int, float)):
            counted += 1
            worst = max(worst, abs(float(x) - float(y)))
        else:
            problems.append(f"{where}: 类型 {type(x).__name__} vs {type(y).__name__}")

    walk(a, b, "$")
    return {"maxAbsDiff": worst, "floatCount": counted, "problems": problems}


def run_trainer(args: Sequence[str], *, python: str, timeout: int = RUN_TIMEOUT_SEC,
                cwd: Path = REPO_ROOT, env_extra: Dict[str, str] | None = None) -> Dict[str, Any]:
    cmd = [python, str(TRAINER), *[str(a) for a in args]]
    env = dict(os.environ)
    env.pop("PYTHONIOENCODING", None)  # 与既有测试一致：跟随 locale，避免父进程解码失败
    if env_extra:
        env.update(env_extra)
    started = time.time()
    proc = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True,
                          timeout=timeout, env=env)
    return {
        "command": " ".join(cmd),
        "returncode": proc.returncode,
        "wallMs": int((time.time() - started) * 1000),
        "stdoutTail": "\n".join(proc.stdout.splitlines()[-12:]),
        "stderrTail": "\n".join(proc.stderr.splitlines()[-12:]),
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


def update_cosine(u: int, lr_max: float, lr_min: float, total: int) -> float:
    """协议 §3.1 公式的独立实现（用于和训练器台账对照）。"""
    if total == 1:
        return lr_max
    uu = min(max(u, 0), total - 1)
    return lr_min + (lr_max - lr_min) * (1.0 + math.cos(math.pi * uu / (total - 1))) / 2.0


class RegressionRun:
    def __init__(self, work_dir: Path, python: str) -> None:
        self.work = work_dir
        self.python = python
        self.work.mkdir(parents=True, exist_ok=True)
        self.fixture_dir = self.work / "fixtures"
        self.fixture_dir.mkdir(parents=True, exist_ok=True)
        self.cases: Dict[str, Dict[str, Any]] = {}
        self.commands: List[str] = []

    # ------------------------------------------------------------------ 工具
    def run(self, args: Sequence[str], *, expect_ok: bool = True, **kw) -> Dict[str, Any]:
        result = run_trainer(args, python=self.python, **kw)
        self.commands.append(result["command"])
        if expect_ok and result["returncode"] != 0:
            raise RuntimeError(
                f"训练器意外失败（returncode={result['returncode']}）：{result['command']}\n"
                f"stdout:\n{result['stdout'][-2000:]}\nstderr:\n{result['stderr'][-2000:]}"
            )
        return result

    def out(self, case: str, name: str) -> Path:
        d = self.work / "runs" / case
        d.mkdir(parents=True, exist_ok=True)
        return d / name

    # ------------------------------------------------------- 夹具：16+4 小数据
    def small_fixture(self) -> Dict[str, Any]:
        info = tf.build_split_dataset(self.fixture_dir, train_rows=16, val_rows=4)
        info["datasetSha256"] = sha256_file(info["datasetPath"])
        info["manifestSha256"] = sha256_file(info["manifestPath"])
        return info

    def train_only_fixture(self, rows: int = 128) -> Dict[str, Any]:
        info = tf.build_train_only_dataset(self.fixture_dir, rows=rows)
        info["datasetSha256"] = sha256_file(info["datasetPath"])
        return info

    def small_plan(self, fixture: Dict[str, Any], *, updates: int = 8,
                   updates_per_epoch: int = 4) -> Dict[str, Any]:
        resolved = tbp.resolve_train_rows(fixture["datasetPath"], fixture["manifestPath"])
        ids = {row: sid for row, sid in zip(resolved["trainRows"], resolved["trainSampleIds"])}
        plan = tbp.build_batch_plan(
            sources=[
                {"name": "commonPool", "quota": 2, "poolSpec": "train:first=8",
                 "rows": resolved["trainRows"][:8]},
                {"name": "extraPool", "quota": 2, "poolSpec": "train:offset=8:count=8",
                 "rows": resolved["trainRows"][8:16]},
            ],
            batch_size=4, total_updates=updates, updates_per_epoch=updates_per_epoch,
            sample_ids_by_row=ids, seed=314159,
            note="T15-03 回归用小型 2+2 配额 plan",
        )
        plan["dataset"] = {"path": resolved["datasetPath"], "sha256": resolved["datasetSha256"],
                           "splitManifestPath": resolved["splitManifestPath"],
                           "splitManifestSha256": resolved["splitManifestSha256"],
                           "trainRowCount": len(resolved["trainRows"])}
        path = self.fixture_dir / f"plan_{updates}u_{updates_per_epoch}e.json"
        path.write_text(json.dumps(plan, indent=1, ensure_ascii=False), encoding="utf-8")
        return {"plan": plan, "path": str(path), "sha256": sha256_file(path)}

    # =============================================================== 回归 1
    def case1_budget_three_updates_of_four_batches(self) -> Dict[str, Any]:
        """epoch 有 4 个 batch、总预算 3：正好 3 次更新，无第 4 步，无伪零 epoch。"""
        fx = self.small_fixture()
        model = self.out("case1", "m.json")
        metrics = self.out("case1", "m.metrics.json")
        opt = self.out("case1", "m.opt.json")
        state = self.out("case1", "m.state.pt")
        run = self.run([
            "--dataset", fx["datasetPath"], "--split-manifest", fx["manifestPath"],
            "--epochs", "3", "--batch-size", "4", "--global-update-limit", "3",
            "--out-model", model, "--out-metrics", metrics,
            "--optimized-manifest", opt, "--out-state", state,
        ])
        ledger = read_ledger(model.with_name(model.stem + ".optimizer_update_ledger.jsonl"))
        m = read_json(metrics)
        o = read_json(opt)
        # 独立参照：只跑 3 次更新（一个 epoch、max-steps=3），其 final 就是「第 3 次更新后的权重」。
        ref_model = self.out("case1", "ref3.json")
        ref_metrics = self.out("case1", "ref3.metrics.json")
        ref_run = self.run([
            "--dataset", fx["datasetPath"], "--split-manifest", fx["manifestPath"],
            "--epochs", "1", "--batch-size", "4", "--max-steps", "3",
            "--out-model", ref_model, "--out-metrics", ref_metrics,
            "--optimized-manifest", self.out("case1", "ref3.opt.json"),
            "--out-state", self.out("case1", "ref3.state.pt"),
        ])
        ref_ledger = read_ledger(ref_model.with_name(ref_model.stem + ".optimizer_update_ledger.jsonl"))
        final_path = model.with_name(model.stem + "_last.json")
        diff = max_abs_diff(final_path, ref_model)
        return {
            "caseId": "R1_budget_3_of_4_batches",
            "title": "epoch 有 4 个 batch、总预算 3：正好 3 次更新、无第 4 步、无伪零 epoch、final 对应第三次更新",
            "commands": [run["command"], ref_run["command"]],
            "fixture": fx,
            "readings": {
                "plannedBatchesPerEpoch": 4,
                "globalUpdateLimit": 3,
                "ledgerEntries": len(ledger),
                "ledgerUpdateIndices": [e["updateIndex"] for e in ledger],
                "ledgerEpochs": [e["epoch"] for e in ledger],
                "metricsOptimizerUpdates": m["optimizerUpdates"],
                "consumptionUpdates": o["updates"],
                "consumptionExposures": o["totalExposures"],
                "metricsHistoryLength": len(m["history"]),
                "historyEpochs": [h["epoch"] for h in m["history"]],
                "historyUpdatesInEpoch": [h["updatesInEpoch"] for h in m["history"]],
                "historyTrainAcc": [h["train_acc"] for h in m["history"]],
                "zeroConsumptionEpochs": m["lifecycle"]["zeroConsumptionEpochs"],
                "stopReason": m["lifecycle"]["stopReason"],
                "epochsRecorded": m["lifecycle"]["epochsRecorded"],
                "finalSelectedAtUpdate": m["artifacts"]["final"]["selectedAtUpdate"],
                "stateUpdates": m["artifacts"]["state"]["updates"],
                "finalSha256": sha256_file(final_path),
                "referenceRunUpdates": read_json(ref_metrics)["optimizerUpdates"],
                "referenceLedgerEntries": len(ref_ledger),
                "finalVsReferenceThirdUpdate": diff,
                "finalMatchesThirdUpdate": (not diff["problems"] and diff["maxAbsDiff"] == 0.0),
                "fourthStepAbsent": len(ledger) == 3 and m["optimizerUpdates"] == 3,
                "oldBehaviourNote": "V14b 审核 §3 [P2]：旧控制流会在第 2、3 个 epoch 继续验证并推进 "
                                    "scheduler，产生 train_acc=0 的伪零 epoch。",
            },
        }

    # =============================================================== 回归 2
    def case2_budget_alignment(self) -> Dict[str, Any]:
        """总预算刚好一整个 epoch、跨 epoch、在中途停下。"""
        fx = self.small_fixture()
        variants = [
            ("exact_one_epoch", 4, 3),
            ("crosses_epoch_boundary", 6, 3),
            ("stops_mid_epoch", 2, 3),
        ]
        readings = []
        for name, limit, epochs in variants:
            model = self.out("case2", f"{name}.json")
            metrics = self.out("case2", f"{name}.metrics.json")
            opt = self.out("case2", f"{name}.opt.json")
            run = self.run([
                "--dataset", fx["datasetPath"], "--split-manifest", fx["manifestPath"],
                "--epochs", str(epochs), "--batch-size", "4",
                "--global-update-limit", str(limit),
                "--out-model", model, "--out-metrics", metrics,
                "--optimized-manifest", opt, "--out-state", self.out("case2", f"{name}.state.pt"),
            ])
            ledger = read_ledger(model.with_name(model.stem + ".optimizer_update_ledger.jsonl"))
            m = read_json(metrics)
            o = read_json(opt)
            readings.append({
                "variant": name,
                "command": run["command"],
                "globalUpdateLimit": limit,
                "epochsRequested": epochs,
                "updates": m["optimizerUpdates"],
                "exposures": o["totalExposures"],
                "ledgerEntries": len(ledger),
                "epochsRecorded": m["lifecycle"]["epochsRecorded"],
                "updatesPerEpoch": [h["updatesInEpoch"] for h in m["history"]],
                "lrPerUpdate": [e["lr"] for e in ledger],
                "exposuresPerUpdate": [e["batchSize"] for e in ledger],
                "stopReason": m["lifecycle"]["stopReason"],
                "zeroConsumptionEpochs": m["lifecycle"]["zeroConsumptionEpochs"],
                "exposuresRecomputedFromLedger": sum(e["batchSize"] for e in ledger),
                "updatesRecomputedFromLedger": len(ledger),
                "plannedUpdatesMatch": m["optimizerUpdates"] == limit,
                "plannedExposuresMatch": sum(e["batchSize"] for e in ledger) == limit * 4,
            })
        return {
            "caseId": "R2_budget_alignment",
            "title": "总预算刚好一整个 epoch / 跨 epoch / 中途停下：更新、曝光、LR 与计划相符",
            "commands": [r["command"] for r in readings],
            "fixture": fx,
            "readings": {"variants": readings},
        }

    # =============================================================== 回归 3
    def _resume_pair(self, tag: str, common: Sequence[str], *, budget: int,
                     pause_at: int, extra_resume: Sequence[str] = ()) -> Dict[str, Any]:
        cont_model = self.out(tag, "cont.json")
        pause_model = self.out(tag, "pause.json")
        pause_state = self.out(tag, "pause.state.pt")
        res_model = self.out(tag, "resumed.json")
        cont_run = self.run([*common, "--out-model", cont_model,
                             "--out-metrics", self.out(tag, "cont.metrics.json"),
                             "--optimized-manifest", self.out(tag, "cont.opt.json"),
                             "--out-state", self.out(tag, "cont.state.pt")])
        pause_run = self.run([*common, "--pause-after-updates", str(pause_at),
                              "--out-model", pause_model,
                              "--out-metrics", self.out(tag, "pause.metrics.json"),
                              "--optimized-manifest", self.out(tag, "pause.opt.json"),
                              "--out-state", pause_state])
        resume_run = self.run([*common, *extra_resume, "--resume-state", pause_state,
                               "--out-model", res_model,
                               "--out-metrics", self.out(tag, "resumed.metrics.json"),
                               "--optimized-manifest", self.out(tag, "resumed.opt.json"),
                               "--out-state", self.out(tag, "resumed.state.pt")])
        cont_ledger = read_ledger(cont_model.with_name(cont_model.stem + ".optimizer_update_ledger.jsonl"))
        pause_ledger = read_ledger(pause_model.with_name(pause_model.stem + ".optimizer_update_ledger.jsonl"))
        res_ledger = read_ledger(res_model.with_name(res_model.stem + ".optimizer_update_ledger.jsonl"))
        combined = pause_ledger + res_ledger
        cont_final = cont_model.with_name(cont_model.stem + "_last.json")
        res_final = res_model.with_name(res_model.stem + "_last.json")
        diff = max_abs_diff(cont_final, res_final)
        cont_metrics = read_json(self.out(tag, "cont.metrics.json"))
        res_metrics = read_json(self.out(tag, "resumed.metrics.json"))
        cont_opt = read_json(self.out(tag, "cont.opt.json"))
        res_opt = read_json(self.out(tag, "resumed.opt.json"))
        return {
            "tag": tag,
            "commands": [cont_run["command"], pause_run["command"], resume_run["command"]],
            "budget": budget,
            "pauseAt": pause_at,
            "continuousUpdates": cont_metrics["optimizerUpdates"],
            "pauseUpdates": read_json(self.out(tag, "pause.metrics.json"))["optimizerUpdates"],
            "resumedCumulativeUpdates": res_metrics["optimizerUpdates"],
            "resumedAdditionalUpdates": res_metrics["optimizerUpdates"] - read_json(
                self.out(tag, "pause.metrics.json"))["optimizerUpdates"],
            "pauseStopReason": read_json(self.out(tag, "pause.metrics.json"))["lifecycle"]["stopReason"],
            "continuousSampleSequence": [e["sampleIds"] for e in cont_ledger],
            "combinedSampleSequence": [e["sampleIds"] for e in combined],
            "samplingSequenceIdentical": ([e["sampleIds"] for e in cont_ledger]
                                          == [e["sampleIds"] for e in combined]),
            "continuousLrSequence": [e["lr"] for e in cont_ledger],
            "combinedLrSequence": [e["lr"] for e in combined],
            "lrSequenceIdentical": ([e["lr"] for e in cont_ledger]
                                    == [e["lr"] for e in combined]),
            "continuousExposures": cont_opt["totalExposures"],
            "resumedCumulativeExposures": res_opt["totalExposures"],
            "exposuresIdentical": cont_opt["totalExposures"] == res_opt["totalExposures"],
            "continuousUniqueSamples": cont_opt["optimizedUniqueSamples"],
            "resumedCumulativeUniqueSamples": res_opt["optimizedUniqueSamples"],
            "continuousFinalSha256": sha256_file(cont_final),
            "resumedFinalSha256": sha256_file(res_final),
            "weightsByteIdentical": sha256_file(cont_final) == sha256_file(res_final),
            "weightsDiff": diff,
            "tolerance": PREREGISTERED_WEIGHT_TOLERANCE,
            "resumedEpochsRecorded": res_metrics["lifecycle"]["epochsRecorded"],
            "resumedLedgerStartUpdateIndex": res_opt["ledgerStartUpdateIndex"],
        }

    def case3_resume_equivalence(self) -> Dict[str, Any]:
        """连续 8 步 vs 第 3 步保存后恢复至 8 步（plan 模式与 shuffle 模式各一份）。"""
        fx = self.small_fixture()
        plan_info = self.small_plan(fx, updates=8, updates_per_epoch=4)
        plan_common = [
            "--dataset", fx["datasetPath"], "--split-manifest", fx["manifestPath"],
            "--batch-plan", plan_info["path"], "--epochs", "2", "--batch-size", "4",
            "--lr", "1e-3", "--lr-min", "1e-5", "--lr-schedule", "cosine-to-min",
            "--lr-schedule-unit", "update",
        ]
        plan_pair = self._resume_pair("case3_plan", plan_common, budget=8, pause_at=3,
                                      extra_resume=["--lr-total-updates", "8"])
        shuffle_common = [
            "--dataset", fx["datasetPath"], "--split-manifest", fx["manifestPath"],
            "--epochs", "3", "--batch-size", "4", "--global-update-limit", "8",
        ]
        shuffle_pair = self._resume_pair("case3_shuffle", shuffle_common, budget=8, pause_at=3)
        return {
            "caseId": "R3_resume_equivalence",
            "title": "相同初始状态连续跑 8 步 vs 第 3 步保存后恢复至 8 步：采样序列、LR、消费一致；权重按预登记容差比较",
            "fixture": fx,
            "plan": {"path": plan_info["path"], "sha256": plan_info["sha256"],
                     "quota": {s["name"]: s["quota"] for s in plan_info["plan"]["sources"]},
                     "totalUpdates": plan_info["plan"]["totalUpdates"]},
            "readings": {"planMode": plan_pair, "shuffleMode": shuffle_pair},
        }

    # =============================================================== 回归 4
    def case4_idempotent_finish_and_refusals(self) -> Dict[str, Any]:
        """已完成预算后恢复：0 次额外更新、幂等收尾；改变 schema/data hash 的恢复被拒绝。"""
        fx = self.small_fixture()
        common = ["--dataset", fx["datasetPath"], "--split-manifest", fx["manifestPath"],
                  "--epochs", "3", "--batch-size", "4", "--global-update-limit", "8"]
        done_model = self.out("case4", "done.json")
        done_state = self.out("case4", "done.state.pt")
        self.run([*common, "--out-model", done_model,
                  "--out-metrics", self.out("case4", "done.metrics.json"),
                  "--optimized-manifest", self.out("case4", "done.opt.json"),
                  "--out-state", done_state])
        done_metrics = read_json(self.out("case4", "done.metrics.json"))
        # 幂等恢复
        again_model = self.out("case4", "again.json")
        again_run = self.run([*common, "--resume-state", done_state, "--out-model", again_model,
                              "--out-metrics", self.out("case4", "again.metrics.json"),
                              "--optimized-manifest", self.out("case4", "again.opt.json"),
                              "--out-state", self.out("case4", "again.state.pt")])
        again_metrics = read_json(self.out("case4", "again.metrics.json"))
        again_ledger = read_ledger(again_model.with_name(again_model.stem
                                                         + ".optimizer_update_ledger.jsonl"))
        done_final = done_model.with_name(done_model.stem + "_last.json")
        again_final = again_model.with_name(again_model.stem + "_last.json")
        # 拒绝 1：数据集内容变化（data hash 变化）
        tampered = self.fixture_dir / "tampered_dataset.jsonl"
        shutil.copyfile(fx["datasetPath"], tampered)
        with tampered.open("a", encoding="utf-8") as fh:
            fh.write(" ")
        refuse_data = self.run([
            "--dataset", tampered, "--split-manifest", fx["manifestPath"],
            "--epochs", "3", "--batch-size", "4", "--global-update-limit", "8",
            "--resume-state", done_state, "--out-model", self.out("case4", "refuse_data.json"),
            "--out-metrics", self.out("case4", "refuse_data.metrics.json"),
            "--optimized-manifest", self.out("case4", "refuse_data.opt.json"),
            "--out-state", self.out("case4", "refuse_data.state.pt"),
        ], expect_ok=False)
        # 拒绝 2：schema 身份变化
        refuse_schema = self.run([
            *common, "--encoder-schema-id", "spatial26_global20_actionSemantics53_TAMPERED",
            "--resume-state", done_state, "--out-model", self.out("case4", "refuse_schema.json"),
            "--out-metrics", self.out("case4", "refuse_schema.metrics.json"),
            "--optimized-manifest", self.out("case4", "refuse_schema.opt.json"),
            "--out-state", self.out("case4", "refuse_schema.state.pt"),
        ], expect_ok=False)
        # 拒绝 3：旧 v13 state（缺必要字段）
        import torch  # 本机 torch 可用；仅用于构造旧 state 夹具
        legacy_state = self.out("case4", "legacy_v13.state.pt")
        src_state = torch.load(str(done_state), map_location="cpu", weights_only=False)
        torch.save({
            "schema": "v13_train_state_1",
            "epoch": src_state["epoch"],
            "model": src_state["model"],
            "optimizer": src_state["optimizer"],
            "scheduler": src_state["scheduler"],
            "torch_rng": src_state["rng"]["torch"],
            "best_val_acc": -1.0, "best_epoch": 0,
            "updates": src_state["updates"],
        }, str(legacy_state))
        refuse_legacy = self.run([
            *common, "--resume-state", legacy_state,
            "--out-model", self.out("case4", "refuse_legacy.json"),
            "--out-metrics", self.out("case4", "refuse_legacy.metrics.json"),
            "--optimized-manifest", self.out("case4", "refuse_legacy.opt.json"),
            "--out-state", self.out("case4", "refuse_legacy.state.pt"),
        ], expect_ok=False)
        return {
            "caseId": "R4_idempotent_finish_and_refusals",
            "title": "已完成预算后恢复：0 次额外更新、幂等收尾；改变 schema/data hash 与旧 state 的恢复被拒绝",
            "commands": [again_run["command"], refuse_data["command"],
                         refuse_schema["command"], refuse_legacy["command"]],
            "fixture": fx,
            "readings": {
                "preResumeUpdates": done_metrics["optimizerUpdates"],
                "postResumeUpdates": again_metrics["optimizerUpdates"],
                "additionalUpdates": again_metrics["optimizerUpdates"] - done_metrics["optimizerUpdates"],
                "postResumeLedgerEntries": len(again_ledger),
                "postResumeEpochsRecorded": again_metrics["lifecycle"]["epochsRecorded"],
                "budgetAlreadyReachedOnResume": again_metrics["lifecycle"]["budgetAlreadyReachedOnResume"],
                "postResumeStopReason": again_metrics["lifecycle"]["stopReason"],
                "finalShaBefore": sha256_file(done_final),
                "finalShaAfter": sha256_file(again_final),
                "finalUnchanged": sha256_file(done_final) == sha256_file(again_final),
                "refuseChangedDataHash": {
                    "returncode": refuse_data["returncode"],
                    "refused": refuse_data["returncode"] != 0,
                    "message": refuse_data["stderrTail"],
                    "mentionsDatasetSha": "datasetSha256" in (refuse_data["stdout"] + refuse_data["stderr"]),
                    "metricsWritten": self.out("case4", "refuse_data.metrics.json").exists(),
                },
                "refuseChangedSchemaId": {
                    "returncode": refuse_schema["returncode"],
                    "refused": refuse_schema["returncode"] != 0,
                    "message": refuse_schema["stderrTail"],
                    "mentionsEncoderSchema": "encoderSchemaId" in (refuse_schema["stdout"]
                                                                   + refuse_schema["stderr"]),
                    "metricsWritten": self.out("case4", "refuse_schema.metrics.json").exists(),
                },
                "refuseLegacyState": {
                    "returncode": refuse_legacy["returncode"],
                    "refused": refuse_legacy["returncode"] != 0,
                    "message": refuse_legacy["stderrTail"],
                    "mentionsMissingFields": "缺少精确恢复所需字段"
                                             in (refuse_legacy["stdout"] + refuse_legacy["stderr"]),
                    "metricsWritten": self.out("case4", "refuse_legacy.metrics.json").exists(),
                },
            },
        }

    # =============================================================== 回归 5
    def case5_nonfinite_reporting(self) -> Dict[str, Any]:
        """人为注入非有限输入 / loss：报告真实错误，不与零消费混淆。"""
        rows_in = [tf.make_row(i, root="FIXTURE_NF", sample_id=f"nf_{i}",
                               non_finite_spatial=(i == 2)) for i in range(8)]
        ds_in = tf.write_dataset(self.fixture_dir / "nonfinite_input.jsonl", rows_in)
        rows_loss = [tf.make_row(i, root="FIXTURE_NL", sample_id=f"nl_{i}",
                                 teacher_q_nan=(i == 1)) for i in range(8)]
        ds_loss = tf.write_dataset(self.fixture_dir / "nonfinite_loss.jsonl", rows_loss)

        def one(tag: str, dataset: Path, extra: Sequence[str]) -> Dict[str, Any]:
            run = self.run([
                "--dataset", dataset, "--train-only", "--epochs", "1", "--batch-size", "4",
                *extra,
                "--out-model", self.out("case5", f"{tag}.json"),
                "--out-metrics", self.out("case5", f"{tag}.metrics.json"),
                "--optimized-manifest", self.out("case5", f"{tag}.opt.json"),
                "--out-state", self.out("case5", f"{tag}.state.pt"),
            ], expect_ok=False)
            failure_path = self.out("case5", f"{tag}_failure.json")
            failure = read_json(failure_path) if failure_path.exists() else None
            metrics_path = self.out("case5", f"{tag}.metrics.json")
            return {
                "tag": tag,
                "command": run["command"],
                "returncode": run["returncode"],
                "failedLoudly": run["returncode"] != 0,
                "failureRecordPath": str(failure_path) if failure else None,
                "failureRecordWritten": failure is not None,
                "failure": (None if failure is None else {
                    "errorType": failure["errorType"],
                    "errorMessage": failure["errorMessage"],
                    "stopReason": failure["stopReason"],
                    "updatesMeasuredAtFailure": failure["updatesMeasuredAtFailure"],
                    "preservedStateUpdates": failure["preservedStateUpdates"],
                    "preservedStatePath": failure["preservedStatePath"],
                }),
                "successMetricsWritten": metrics_path.exists(),
                "reportedAsZeroConsumption": bool(
                    metrics_path.exists()
                    and read_json(metrics_path).get("lifecycle", {}).get("stopReason")
                    in ("ZERO_CONSUMPTION_EPOCH", "GLOBAL_UPDATE_LIMIT")),
                "messageMatches": ("non-finite input" in (run["stdout"] + run["stderr"])
                                   if tag == "nonfinite_input"
                                   else "Non-finite loss encountered" in (run["stdout"] + run["stderr"])),
            }
        input_case = one("nonfinite_input", ds_in, [])
        loss_case = one("nonfinite_loss", ds_loss, ["--loss-mode", "soft"])
        return {
            "caseId": "R5_nonfinite_reporting",
            "title": "人为注入非有限输入或 loss 时报告真实错误，不与零消费混淆",
            "commands": [input_case["command"], loss_case["command"]],
            "readings": {"nonFiniteInput": input_case, "nonFiniteLoss": loss_case},
        }

    # =============================================================== 回归 6
    def case6_lr_trace(self) -> Dict[str, Any]:
        """每步 LR 与协议公式一致；默认 epoch 语义保持不变。"""
        fx = self.small_fixture()
        plan_info = self.small_plan(fx, updates=8, updates_per_epoch=4)
        lr_max, lr_min, total = 1e-3, 1e-5, 8
        update_model = self.out("case6", "update.json")
        update_run = self.run([
            "--dataset", fx["datasetPath"], "--split-manifest", fx["manifestPath"],
            "--batch-plan", plan_info["path"], "--epochs", "2", "--batch-size", "4",
            "--lr", str(lr_max), "--lr-min", str(lr_min),
            "--lr-schedule", "cosine-to-min", "--lr-schedule-unit", "update",
            "--lr-total-updates", str(total),
            "--out-model", update_model,
            "--out-metrics", self.out("case6", "update.metrics.json"),
            "--optimized-manifest", self.out("case6", "update.opt.json"),
            "--out-state", self.out("case6", "update.state.pt"),
        ])
        update_ledger = read_ledger(update_model.with_name(
            update_model.stem + ".optimizer_update_ledger.jsonl"))
        formula = [update_cosine(u, lr_max, lr_min, total) for u in range(total)]
        observed = [e["lr"] for e in update_ledger]
        # U=1：使用 lrMax
        single_model = self.out("case6", "single.json")
        single_run = self.run([
            "--dataset", fx["datasetPath"], "--split-manifest", fx["manifestPath"],
            "--epochs", "1", "--batch-size", "4", "--global-update-limit", "1",
            "--lr", str(lr_max), "--lr-min", str(lr_min),
            "--lr-schedule", "cosine-to-min", "--lr-schedule-unit", "update",
            "--lr-total-updates", "1",
            "--out-model", single_model,
            "--out-metrics", self.out("case6", "single.metrics.json"),
            "--optimized-manifest", self.out("case6", "single.opt.json"),
            "--out-state", self.out("case6", "single.state.pt"),
        ])
        single_ledger = read_ledger(single_model.with_name(
            single_model.stem + ".optimizer_update_ledger.jsonl"))
        # 默认（epoch 单位）语义：T_max=epochs 的 CosineAnnealingLR，每完成一个 epoch 推进一次。
        epoch_model = self.out("case6", "epoch_unit.json")
        epoch_run = self.run([
            "--dataset", fx["datasetPath"], "--split-manifest", fx["manifestPath"],
            "--epochs", "3", "--batch-size", "4", "--global-update-limit", "8",
            "--lr", "1e-3", "--lr-schedule", "cosine",
            "--out-model", epoch_model,
            "--out-metrics", self.out("case6", "epoch_unit.metrics.json"),
            "--optimized-manifest", self.out("case6", "epoch_unit.opt.json"),
            "--out-state", self.out("case6", "epoch_unit.state.pt"),
        ])
        epoch_ledger = read_ledger(epoch_model.with_name(
            epoch_model.stem + ".optimizer_update_ledger.jsonl"))
        # epoch 单位的期望 LR 直接由本机 torch 的 CosineAnnealingLR 给出，而不是手写闭式公式。
        #
        # 为什么：PyTorch 的 CosineAnnealingLR 在版本间改变了分母（历史闭式写作
        # `(1+cos(pi*t/(T_max-1)))/2`，2.14 实测为 `(1+cos(pi*t/T_max))/2`）。
        # 用独立重建的 scheduler 取值可以同时验证「训练器确实按 epoch 推进 scheduler」
        # 和「取值与本机 torch 语义一致」，而不会把 torch 的实现细节变化误判成回归。
        import torch  # noqa: PLC0415  本机 torch 可用；仅用于重建 LR 参考值
        from torch import optim  # noqa: PLC0415
        _probe_model = torch.nn.Linear(2, 2)
        _probe_opt = optim.AdamW(_probe_model.parameters(), lr=1e-3)
        _probe_sched = optim.lr_scheduler.CosineAnnealingLR(_probe_opt, T_max=3, eta_min=1e-5)
        legacy_expected = [_probe_opt.param_groups[0]["lr"]]
        _probe_sched.step()
        legacy_expected.append(_probe_opt.param_groups[0]["lr"])
        return {
            "caseId": "R6_lr_trace",
            "title": "每步 LR 与协议公式一致（update 单位），默认 epoch 单位语义不变",
            "commands": [update_run["command"], single_run["command"], epoch_run["command"]],
            "readings": {
                "updateUnit": {
                    "lrMax": lr_max, "lrMin": lr_min, "totalUpdates": total,
                    "observedLr": observed,
                    "formulaLr": formula,
                    "maxAbsDiff": max((abs(a - b) for a, b in zip(observed, formula)), default=None),
                    "matchesFormula": all(abs(a - b) < 1e-15 for a, b in zip(observed, formula)),
                    "ledgerLrCount": len(observed),
                    "metricsLrAtFirstUpdate": read_json(
                        self.out("case6", "update.metrics.json"))["lrSchedule"]["lrAtFirstUpdate"],
                    "metricsLrAtLastUpdate": read_json(
                        self.out("case6", "update.metrics.json"))["lrSchedule"]["lrAtLastUpdate"],
                },
                "singleUpdateU1": {
                    "observedLr": [e["lr"] for e in single_ledger],
                    "expectedLrMax": lr_max,
                    "matches": all(abs(e["lr"] - lr_max) < 1e-15 for e in single_ledger),
                },
                "defaultEpochUnit": {
                    "observedLr": [e["lr"] for e in epoch_ledger],
                    "expectedEpochScheduleLr": [legacy_expected[0]] * 4 + [legacy_expected[1]] * 4,
                    "matchesLegacyEpochSemantics": all(
                        abs(e["lr"] - exp) < 1e-15 for e, exp in
                        zip(epoch_ledger, [legacy_expected[0]] * 4 + [legacy_expected[1]] * 4)),
                    "differsFromUpdateFormula": [e["lr"] for e in epoch_ledger] != formula,
                    "note": "默认 --lr-schedule-unit epoch 未改变：T_max=epochs 的 CosineAnnealingLR，"
                            "只在 epoch 跑完时推进。",
                },
            },
        }

    # =============================================================== 采样合同
    def case7_sampler_contract(self, real_dataset: str, real_manifest: str) -> Dict[str, Any]:
        """可注入确定性 sampler：每步 16+16 来源配额 + 台账复算。"""
        resolved = tbp.resolve_train_rows(real_dataset, real_manifest)
        ids = {row: sid for row, sid in zip(resolved["trainRows"], resolved["trainSampleIds"])}
        half = len(resolved["trainRows"]) // 2
        plan = tbp.build_batch_plan(
            sources=[
                {"name": "oldCommon", "quota": 16, "poolSpec": "train:first=half",
                 "rows": resolved["trainRows"][:half]},
                {"name": "newPool", "quota": 16, "poolSpec": "train:offset=half",
                 "rows": resolved["trainRows"][half:]},
            ],
            batch_size=32, total_updates=100, updates_per_epoch=50,
            sample_ids_by_row=ids, seed=314159,
            note="T15-03 sampler 合同：真实数据集 train 分区，每步 16+16",
        )
        plan["dataset"] = {"path": resolved["datasetPath"], "sha256": resolved["datasetSha256"],
                           "splitManifestPath": resolved["splitManifestPath"],
                           "splitManifestSha256": resolved["splitManifestSha256"],
                           "trainRowCount": len(resolved["trainRows"])}
        plan_path = self.fixture_dir / "sampler_contract_plan.json"
        plan_path.write_text(json.dumps(plan, indent=1, ensure_ascii=False), encoding="utf-8")
        per_update_quota_ok = all(
            len(e["items"]) == 32
            and sum(1 for i in e["items"] if i["source"] == "oldCommon") == 16
            and sum(1 for i in e["items"] if i["source"] == "newPool") == 16
            for e in plan["updates"])
        # 计划覆盖率：预算内每个 key 至少消费一次、循环曝光次数相差 <= 1
        coverage = plan["coverage"]
        # 真实消费对照：小型 plan 训练，核对台账 sampleIds 与 plan 完全一致
        fx = self.small_fixture()
        small_plan = self.small_plan(fx, updates=8, updates_per_epoch=4)
        model = self.out("case7", "consumed.json")
        self.run([
            "--dataset", fx["datasetPath"], "--split-manifest", fx["manifestPath"],
            "--batch-plan", small_plan["path"], "--epochs", "2", "--batch-size", "4",
            "--out-model", model,
            "--out-metrics", self.out("case7", "consumed.metrics.json"),
            "--optimized-manifest", self.out("case7", "consumed.opt.json"),
            "--out-state", self.out("case7", "consumed.state.pt"),
        ])
        ledger = read_ledger(model.with_name(model.stem + ".optimizer_update_ledger.jsonl"))
        opt = read_json(self.out("case7", "consumed.opt.json"))
        plan_ids = [[i.get("sampleId") for i in e["items"]] for e in small_plan["plan"]["updates"]]
        ledger_ids = [e["sampleIds"] for e in ledger]
        per_update_sources = [e.get("sources") for e in ledger]
        return {
            "caseId": "R7_sampler_contract",
            "title": "可注入确定性 batch/sampler 计划与消费台账：每步 16+16 来源配额，曝光可复算",
            "readings": {
                "realPlan": {
                    "path": str(plan_path),
                    "sha256": sha256_file(plan_path),
                    "datasetSha256": resolved["datasetSha256"],
                    "trainRows": len(resolved["trainRows"]),
                    "batchSize": 32,
                    "totalUpdates": 100,
                    "updatesPerEpoch": 50,
                    "quota": {s["name"]: s["quota"] for s in plan["sources"]},
                    "perUpdateQuotaExact16Plus16": per_update_quota_ok,
                    "coverage": coverage,
                    "everyRowCovered": all(c["everyRowCovered"] for c in coverage.values()),
                    # V15/T15-03：覆盖率是「预算 vs 池大小」的算术结果，不是配置好坏。
                    # 每个来源的循环游标在预算内访问 min(poolSize, quotaPerUpdate*totalUpdates)
                    # 个不同 key，因此池大于预算时报 false 是**预期**读数，必须如实记录，
                    # 不能为了让断言变绿而缩小池或复制行。
                    "coverageIsBudgetLimited": all(
                        c["plannedExposures"] < c["poolSize"] for c in coverage.values()),
                    "expectedUniqueRowsPerSource": {
                        name: min(c["poolSize"], c["plannedExposures"])
                        for name, c in coverage.items()
                    },
                    "maxExposureSpread": max(
                        (c["maxExposuresPerRow"] - c["minExposuresPerRow"]
                         for c in coverage.values()), default=None),
                },
                "consumedFixturePlan": {
                    "planSha256": small_plan["sha256"],
                    "planItems": plan_ids,
                    "ledgerSampleIds": ledger_ids,
                    "ledgerMatchesPlanExactly": ledger_ids == plan_ids,
                    "ledgerSourcesPerUpdate": per_update_sources,
                    "updates": opt["updates"],
                    "totalExposures": opt["totalExposures"],
                    "exposuresRecomputedFromLedger": sum(e["batchSize"] for e in ledger),
                    "exposuresBySource": opt["exposuresBySource"],
                    "uniquePolicyInputKeys": opt["uniquePolicyInputKeys"],
                    "uniqueSourceStateKeys": opt["uniqueSourceStateKeys"],
                    "uniqueRootFamilies": opt["uniqueRootFamilies"],
                    "plannedUpdates": opt.get("plannedUpdates"),
                    "plannedButNeverUpdated": opt.get("plannedButNeverUpdated"),
                },
            },
        }

    # =============================================================== 前后对照
    def case8_before_after_p2(self) -> Dict[str, Any]:
        """P2 控制流的前后对照：用 HEAD 版训练器与修复版跑同一输入。

        这是「同一输入、同一预算」的直接读数，而不是引用旧报告。
        """
        # HEAD 版训练器只支持 24 通道 / 32 维语义，因此这里用 24 通道夹具。
        rows = []
        for i in range(16):
            rows.append(tf.make_row(i, root="FIXTURE_ROOT_TRAIN", sample_id=f"fix24_tr_{i:04d}",
                                    channels=24, semantic_dim=32, partition="train"))
        for i in range(4):
            rows.append(tf.make_row(1000 + i, root="FIXTURE_ROOT_VAL", sample_id=f"fix24_va_{i:04d}",
                                    channels=24, semantic_dim=32, partition="val"))
        ds24 = tf.write_dataset(self.fixture_dir / "fixture24_dataset.jsonl", rows)
        manifest24 = self.fixture_dir / "fixture24_split_manifest.json"
        manifest24.write_text(json.dumps({
            "schema": "v15_fixture_split_manifest_1",
            "trainRootFamilies": ["FIXTURE_ROOT_TRAIN"],
            "valRootFamilies": ["FIXTURE_ROOT_VAL"],
            "testRootFamilies": [],
        }, indent=2), encoding="utf-8")
        fx24 = {"datasetPath": str(ds24), "manifestPath": str(manifest24)}
        head_trainer = self.work / "trainer_head.py"
        head_src = subprocess.run(["git", "show", "HEAD:python/train_spatial_resnet.py"],
                                  cwd=str(REPO_ROOT), capture_output=True, text=True)
        readings: Dict[str, Any] = {"available": False}
        if head_src.returncode == 0:
            head_trainer.write_text(head_src.stdout, encoding="utf-8")
            common = ["--dataset", str(ds24), "--split-manifest", fx24["manifestPath"],
                      "--epochs", "3", "--batch-size", "4", "--global-update-limit", "3"]
            head_model = self.out("case8", "head.json")
            head_env = dict(os.environ)
            head_env.pop("PYTHONIOENCODING", None)
            # HEAD 版脚本被复制到工作目录，需要显式给出 python/ 以便 import spatial_resnet_model
            head_env["PYTHONPATH"] = str(REPO_ROOT / "python") + os.pathsep + head_env.get("PYTHONPATH", "")
            head_proc = subprocess.run(
                [self.python, str(head_trainer), *common,
                 "--out-model", str(head_model),
                 "--out-metrics", str(self.out("case8", "head.metrics.json")),
                 "--optimized-manifest", str(self.out("case8", "head.opt.json")),
                 "--out-state", str(self.out("case8", "head.state.pt"))],
                cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=RUN_TIMEOUT_SEC,
                env=head_env)
            new_model = self.out("case8", "new.json")
            new_run = self.run([*common, "--out-model", new_model,
                                "--out-metrics", self.out("case8", "new.metrics.json"),
                                "--optimized-manifest", self.out("case8", "new.opt.json"),
                                "--out-state", self.out("case8", "new.state.pt")])
            if head_proc.returncode == 0:
                head_metrics = read_json(self.out("case8", "head.metrics.json"))
                new_metrics = read_json(self.out("case8", "new.metrics.json"))
                readings = {
                    "available": True,
                    "headTrainerSha256": sha256_file(head_trainer),
                    "headCommand": " ".join([self.python, str(head_trainer), *common]),
                    "newCommand": new_run["command"],
                    "head": {
                        "updates": head_metrics["optimizerUpdates"],
                        "historyLength": len(head_metrics["history"]),
                        "historyEpochs": [h["epoch"] for h in head_metrics["history"]],
                        "historyTrainLoss": [h["train_loss"] for h in head_metrics["history"]],
                        "historyTrainAcc": [h["train_acc"] for h in head_metrics["history"]],
                        "earlyStopFlags": [h.get("earlyStop") for h in head_metrics["history"]],
                        "fakeZeroEpochs": sum(1 for h in head_metrics["history"]
                                              if h["train_loss"] == 0.0 and h["train_acc"] == 0.0),
                    },
                    "new": {
                        "updates": new_metrics["optimizerUpdates"],
                        "historyLength": len(new_metrics["history"]),
                        "historyEpochs": [h["epoch"] for h in new_metrics["history"]],
                        "historyTrainLoss": [h["train_loss"] for h in new_metrics["history"]],
                        "historyTrainAcc": [h["train_acc"] for h in new_metrics["history"]],
                        "stopReason": new_metrics["lifecycle"]["stopReason"],
                        "zeroConsumptionEpochs": new_metrics["lifecycle"]["zeroConsumptionEpochs"],
                        "fakeZeroEpochs": sum(1 for h in new_metrics["history"]
                                              if h["train_loss"] == 0.0 and h["train_acc"] == 0.0),
                    },
                }
            else:
                readings = {"available": False,
                            "reason": f"HEAD 版训练器在夹具上退出 {head_proc.returncode}",
                            "stderrTail": "\n".join(head_proc.stderr.splitlines()[-6:])}
        else:
            readings = {"available": False, "reason": "git show HEAD 失败（可能不是 git 仓库）"}
        return {
            "caseId": "R8_before_after_P2",
            "title": "P2 控制流前后对照：同一输入、同一预算下旧/新训练器的 epoch 记录",
            "readings": readings,
        }


def run_all(*, work_dir: Path, out_dir: Path, python: str,
            real_dataset: str, real_manifest: str) -> Dict[str, Any]:
    r = RegressionRun(work_dir, python)
    started = time.time()
    results: Dict[str, Any] = {
        "schema": "v15_trainer_lifecycle_regression_1",
        "taskId": "T15-03",
        "owner": "C",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "python": python,
        "trainer": {"path": str(TRAINER), "sha256": sha256_file(TRAINER)},
        "preregisteredTolerance": PREREGISTERED_WEIGHT_TOLERANCE,
        "cases": {},
    }
    for name, fn in [
        ("R1_budget_3_of_4_batches", r.case1_budget_three_updates_of_four_batches),
        ("R2_budget_alignment", r.case2_budget_alignment),
        ("R3_resume_equivalence", r.case3_resume_equivalence),
        ("R4_idempotent_finish_and_refusals", r.case4_idempotent_finish_and_refusals),
        ("R5_nonfinite_reporting", r.case5_nonfinite_reporting),
        ("R6_lr_trace", r.case6_lr_trace),
        ("R7_sampler_contract", lambda: r.case7_sampler_contract(real_dataset, real_manifest)),
        ("R8_before_after_P2", r.case8_before_after_p2),
    ]:
        print(f"[T15-03] 运行 {name} ...", flush=True)
        t0 = time.time()
        try:
            results["cases"][name] = fn()
            results["cases"][name]["status"] = "OK"
        except Exception as exc:  # noqa: BLE001 - 记录失败而不是吞掉
            import traceback
            results["cases"][name] = {"status": "ERROR", "errorType": type(exc).__name__,
                                      "errorMessage": str(exc),
                                      "traceback": traceback.format_exc()}
        results["cases"][name]["elapsedMs"] = int((time.time() - t0) * 1000)
        print(f"[T15-03] {name} 完成，{results['cases'][name]['elapsedMs']} ms，"
              f"status={results['cases'][name]['status']}", flush=True)
    results["wallMs"] = int((time.time() - started) * 1000)
    results["commands"] = r.commands

    out_dir.mkdir(parents=True, exist_ok=True)

    def write(name: str, payload: Any) -> None:
        path = out_dir / name
        if path.exists():
            raise FileExistsError(f"拒绝覆盖已存在的产物：{path}")
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[T15-03] -> {path}")

    write("trainer_lifecycle_results.json", {
        k: v for k, v in results.items()
        if k in ("schema", "taskId", "owner", "generatedAt", "python", "trainer",
                 "preregisteredTolerance", "wallMs", "commands")
    } | {"cases": {k: results["cases"][k] for k in
                   ("R1_budget_3_of_4_batches", "R2_budget_alignment",
                    "R5_nonfinite_reporting", "R8_before_after_P2")}})
    write("resume_equivalence.json", {
        "schema": "v15_resume_equivalence_1", "taskId": "T15-03",
        "generatedAt": results["generatedAt"],
        "preregisteredTolerance": PREREGISTERED_WEIGHT_TOLERANCE,
        "cases": {k: results["cases"][k] for k in
                  ("R3_resume_equivalence", "R4_idempotent_finish_and_refusals")},
    })
    write("sampler_contract.json", {
        "schema": "v15_sampler_contract_1", "taskId": "T15-03",
        "generatedAt": results["generatedAt"],
        "cases": {"R7_sampler_contract": results["cases"]["R7_sampler_contract"]},
    })
    write("lr_trace.json", {
        "schema": "v15_lr_trace_1", "taskId": "T15-03",
        "generatedAt": results["generatedAt"],
        "formula": "lr(u) = lrMin + (lrMax-lrMin)*(1+cos(pi*u/(U-1)))/2, u=0..U-1; U=1 -> lrMax",
        "cases": {"R6_lr_trace": results["cases"]["R6_lr_trace"]},
    })
    return results


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="T15-03 六条训练生命周期回归")
    parser.add_argument("--work-dir", required=True, help="夹具与运行产物的临时目录")
    parser.add_argument("--out-dir", required=True, help="证据 JSON 输出目录")
    parser.add_argument("--python", default=os.environ.get("V15_PYTHON", DEFAULT_PYTHON))
    parser.add_argument("--real-dataset",
                        default=str(REPO_ROOT / "v14/out/v14_20260924_t14/T14-02/dataset_v14.jsonl"))
    parser.add_argument("--real-manifest",
                        default=str(REPO_ROOT / "v14/out/v14_20260924_t14/T14-02/split_manifest.json"))
    args = parser.parse_args(argv)
    results = run_all(work_dir=Path(args.work_dir), out_dir=Path(args.out_dir),
                      python=args.python, real_dataset=args.real_dataset,
                      real_manifest=args.real_manifest)
    bad = [k for k, v in results["cases"].items() if v.get("status") != "OK"]
    print(f"[T15-03] 全部用例完成；异常用例：{bad or '无'}；总耗时 {results['wallMs']} ms")
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
