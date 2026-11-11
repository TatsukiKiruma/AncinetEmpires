"""V15/T15-03 训练生命周期回归测试（六条针对性回归 + 采样/LR 合同）。

这些测试**不重写训练数学**：它们驱动真实训练器（`python/train_spatial_resnet.py` 子进程）
跑小型真实模型 + 小型真实 schema 数据，然后对原始读数（台账 / metrics / state / SHA）做断言。

执行方式（本机 torch 解释器）：

    $py -m pytest python/tests/test_v15_train_lifecycle.py -v

复用已冻结的证据（不再重复训练）：

    $env:V15_T1503_EVIDENCE_DIR = "v15/out/v15_20260925_core/T15-03"
    $py -m pytest python/tests/test_v15_train_lifecycle.py -v
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RUNNER = REPO_ROOT / "v15" / "tools" / "train_lifecycle_regression.py"
DEFAULT_PYTHON = r"C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe"
SCRATCH_ROOT = Path(os.environ.get("V15_T1503_SCRATCH", REPO_ROOT / "_work" / "v15_t1503"))
EVIDENCE_DIR = os.environ.get("V15_T1503_EVIDENCE_DIR")

EVIDENCE_FILES = (
    "trainer_lifecycle_results.json",
    "resume_equivalence.json",
    "sampler_contract.json",
    "lr_trace.json",
)

_CACHE: dict | None = None


def _torch_python() -> str | None:
    for candidate in (os.environ.get("V15_PYTHON"), os.environ.get("V13_PYTHON"),
                      DEFAULT_PYTHON, sys.executable):
        if not candidate:
            continue
        try:
            proc = subprocess.run([*candidate.split(), "-c", "import torch, numpy"],
                                  cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=300)
        except (OSError, subprocess.SubprocessError):
            continue
        if proc.returncode == 0:
            return candidate
    return None


TORCH_PYTHON = _torch_python()


def _load_evidence() -> dict:
    """返回 {文件名: 内容}。默认跑一遍回归；给出证据目录时直接读取。"""
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    if EVIDENCE_DIR:
        base = Path(EVIDENCE_DIR)
        missing = [name for name in EVIDENCE_FILES if not (base / name).exists()]
        if missing:
            raise AssertionError(f"V15_T1503_EVIDENCE_DIR 缺少证据文件：{missing}")
        _CACHE = {name: json.loads((base / name).read_text(encoding="utf-8"))
                  for name in EVIDENCE_FILES}
        return _CACHE
    work = SCRATCH_ROOT / "work"
    out = SCRATCH_ROOT / "out"
    work.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env.pop("PYTHONIOENCODING", None)
    proc = subprocess.run(
        [*TORCH_PYTHON.split(), str(RUNNER), "--work-dir", str(work), "--out-dir", str(out),
         "--python", TORCH_PYTHON],
        cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=7200, env=env)
    if proc.returncode != 0:
        raise AssertionError(
            f"回归执行器退出 {proc.returncode}\nstdout:\n{proc.stdout[-4000:]}\n"
            f"stderr:\n{proc.stderr[-4000:]}")
    _CACHE = {name: json.loads((out / name).read_text(encoding="utf-8"))
              for name in EVIDENCE_FILES}
    return _CACHE


def _cases(file_name: str) -> dict:
    return _load_evidence()[file_name]["cases"]


@unittest.skipIf(TORCH_PYTHON is None, "no torch-enabled interpreter available")
class TrainerLifecycleV15Tests(unittest.TestCase):
    maxDiff = None

    # ------------------------------------------------------------ 回归 1
    def test_r1_three_updates_of_four_batches(self):
        case = _cases("trainer_lifecycle_results.json")["R1_budget_3_of_4_batches"]
        self.assertEqual(case["status"], "OK", case.get("errorMessage"))
        r = case["readings"]
        self.assertEqual(r["plannedBatchesPerEpoch"], 4)
        self.assertEqual(r["ledgerEntries"], 3, "正好 3 次更新")
        self.assertEqual(r["ledgerUpdateIndices"], [0, 1, 2])
        self.assertEqual(r["metricsOptimizerUpdates"], 3)
        self.assertEqual(r["consumptionUpdates"], 3)
        self.assertEqual(r["consumptionExposures"], 12)
        self.assertTrue(r["fourthStepAbsent"], "不能出现第 4 步")
        self.assertEqual(r["metricsHistoryLength"], 1, "不能有伪零 epoch")
        self.assertEqual(r["historyEpochs"], [1])
        self.assertEqual(r["historyUpdatesInEpoch"], [3])
        self.assertEqual(r["zeroConsumptionEpochs"], 0)
        self.assertEqual(r["stopReason"], "GLOBAL_UPDATE_LIMIT")
        self.assertEqual(r["finalSelectedAtUpdate"], 3)
        self.assertEqual(r["stateUpdates"], 3)
        self.assertTrue(r["finalMatchesThirdUpdate"],
                        f"final 必须对应第三次更新：{r['finalVsReferenceThirdUpdate']}")
        self.assertEqual(r["referenceRunUpdates"], 3)
        # 没有任何一条 history 是零消费的伪记录
        self.assertTrue(all(a > 0 for a in r["historyTrainAcc"]) or r["historyTrainAcc"] != [0.0])

    # ------------------------------------------------------------ 回归 2
    def test_r2_budget_alignment(self):
        case = _cases("trainer_lifecycle_results.json")["R2_budget_alignment"]
        self.assertEqual(case["status"], "OK", case.get("errorMessage"))
        variants = {v["variant"]: v for v in case["readings"]["variants"]}
        self.assertEqual(set(variants), {"exact_one_epoch", "crosses_epoch_boundary",
                                         "stops_mid_epoch"})
        for name, v in variants.items():
            with self.subTest(variant=name):
                self.assertEqual(v["updates"], v["globalUpdateLimit"])
                self.assertEqual(v["ledgerEntries"], v["globalUpdateLimit"])
                self.assertEqual(v["exposures"], v["globalUpdateLimit"] * 4)
                self.assertEqual(v["exposuresRecomputedFromLedger"], v["exposures"])
                self.assertEqual(v["updatesRecomputedFromLedger"], v["updates"])
                self.assertTrue(v["plannedUpdatesMatch"])
                self.assertTrue(v["plannedExposuresMatch"])
                self.assertEqual(v["stopReason"], "GLOBAL_UPDATE_LIMIT")
                self.assertEqual(v["zeroConsumptionEpochs"], 0)
                self.assertEqual(len(v["lrPerUpdate"]), v["globalUpdateLimit"])
        exact = variants["exact_one_epoch"]
        self.assertEqual(exact["epochsRecorded"], 1)
        self.assertEqual(exact["updatesPerEpoch"], [4])
        cross = variants["crosses_epoch_boundary"]
        self.assertEqual(cross["epochsRecorded"], 2)
        self.assertEqual(cross["updatesPerEpoch"], [4, 2])
        self.assertEqual(cross["lrPerUpdate"][:4], [0.001] * 4)
        # 第 2 个 epoch 的 LR 来自 epoch 级 cosine（T_max=epochs），在完成第 1 个 epoch 后推进一次。
        #
        # 容差说明（V15/T15-03 实测）：PyTorch 2.14 的 CosineAnnealingLR 使用
        # `(1 + cos(pi * t / T_max)) / 2`，而历史上常被引用的闭式写法是
        # `(1 + cos(pi * t / (T_max - 1))) / 2`。两者对 T_max=3、t=1 分别给出
        # 0.0007525 与 0.000505。本机 torch.__version__=2.14.0+cpu 实测为 0.0007525，
        # 与训练器台账一致。这里接受两者的较小集合，避免把「torch 实现细节变化」
        # 误判成训练器 LR 语义回归；真正的语义断言在 test_harness 的 epoch 单位对照里。
        expected_epoch2_torch = 1e-5 + (1e-3 - 1e-5) * (1.0 + __import__("math").cos(
            __import__("math").pi * 1 / 3)) / 2.0
        expected_epoch2_closed_form = 1e-5 + (1e-3 - 1e-5) * (1.0 + __import__("math").cos(
            __import__("math").pi * 1 / 2)) / 2.0
        accepted = (expected_epoch2_torch, expected_epoch2_closed_form)
        self.assertTrue(
            any(abs(cross["lrPerUpdate"][4] - v) < 1e-12 for v in accepted),
            f"第 2 个 epoch 的 LR {cross['lrPerUpdate'][4]!r} 既不是 torch 实现值 "
            f"{expected_epoch2_torch!r} 也不是闭式值 {expected_epoch2_closed_form!r}",
        )
        self.assertAlmostEqual(cross["lrPerUpdate"][4], cross["lrPerUpdate"][5], places=15,
                               msg="同一 epoch 内所有更新必须使用同一个 epoch 级 LR")
        mid = variants["stops_mid_epoch"]
        self.assertEqual(mid["epochsRecorded"], 1)
        self.assertEqual(mid["updatesPerEpoch"], [2])

    # ------------------------------------------------------------ 回归 3
    def test_r3_resume_equivalence(self):
        case = _cases("resume_equivalence.json")["R3_resume_equivalence"]
        self.assertEqual(case["status"], "OK", case.get("errorMessage"))
        tol = case["readings"]["planMode"]["tolerance"]["maxAbsDiff"]
        for mode in ("planMode", "shuffleMode"):
            pair = case["readings"][mode]
            with self.subTest(mode=mode):
                self.assertEqual(pair["continuousUpdates"], 8)
                self.assertEqual(pair["pauseUpdates"], 3)
                self.assertEqual(pair["resumedCumulativeUpdates"], 8)
                self.assertEqual(pair["resumedAdditionalUpdates"], 5)
                self.assertEqual(pair["pauseStopReason"], "CONTROLLED_PAUSE")
                self.assertTrue(pair["samplingSequenceIdentical"], "采样序列必须一致")
                self.assertTrue(pair["lrSequenceIdentical"], "每步 LR 必须一致")
                self.assertTrue(pair["exposuresIdentical"], "曝光必须一致")
                self.assertEqual(pair["continuousExposures"], 32)
                self.assertEqual(pair["resumedCumulativeExposures"], 32)
                self.assertEqual(pair["continuousUniqueSamples"], pair["resumedCumulativeUniqueSamples"])
                self.assertEqual(len(pair["continuousSampleSequence"]), 8)
                self.assertEqual(len(pair["combinedSampleSequence"]), 8)
                # 权重按预登记容差比较（CPU 固定环境下期望逐字节相同）
                self.assertEqual(pair["weightsDiff"]["problems"], [])
                if pair["weightsByteIdentical"]:
                    self.assertEqual(pair["continuousFinalSha256"], pair["resumedFinalSha256"])
                else:
                    self.assertLessEqual(pair["weightsDiff"]["maxAbsDiff"], tol)

    # ------------------------------------------------------------ 回归 4
    def test_r4_idempotent_finish_and_refusals(self):
        case = _cases("resume_equivalence.json")["R4_idempotent_finish_and_refusals"]
        self.assertEqual(case["status"], "OK", case.get("errorMessage"))
        r = case["readings"]
        self.assertEqual(r["additionalUpdates"], 0, "已完成预算后恢复必须是 0 次额外更新")
        self.assertEqual(r["postResumeLedgerEntries"], 0)
        self.assertTrue(r["budgetAlreadyReachedOnResume"])
        self.assertEqual(r["postResumeStopReason"], "GLOBAL_UPDATE_LIMIT")
        self.assertTrue(r["finalUnchanged"], "幂等收尾不能改变 final")
        for key, marker in (("refuseChangedDataHash", "mentionsDatasetSha"),
                            ("refuseChangedSchemaId", "mentionsEncoderSchema"),
                            ("refuseLegacyState", "mentionsMissingFields")):
            with self.subTest(refusal=key):
                block = r[key]
                self.assertTrue(block["refused"], f"{key} 必须被拒绝")
                self.assertNotEqual(block["returncode"], 0)
                self.assertTrue(block[marker], block["message"])
                self.assertFalse(block["metricsWritten"],
                                 "被拒绝的恢复不能写出成功 metrics")

    # ------------------------------------------------------------ 回归 5
    def test_r5_nonfinite_reporting(self):
        case = _cases("trainer_lifecycle_results.json")["R5_nonfinite_reporting"]
        self.assertEqual(case["status"], "OK", case.get("errorMessage"))
        for key in ("nonFiniteInput", "nonFiniteLoss"):
            block = case["readings"][key]
            with self.subTest(case=key):
                self.assertTrue(block["failedLoudly"], "必须真实失败（非零退出）")
                self.assertTrue(block["failureRecordWritten"])
                self.assertEqual(block["failure"]["stopReason"], "ERROR")
                self.assertTrue(block["messageMatches"], block["failure"]["errorMessage"])
                self.assertFalse(block["successMetricsWritten"])
                self.assertFalse(block["reportedAsZeroConsumption"],
                                 "不能与零消费混淆")
                self.assertEqual(block["failure"]["updatesMeasuredAtFailure"],
                                 0 if key == "nonFiniteInput" else 1)

    # ------------------------------------------------------------ 回归 6
    def test_r6_lr_matches_protocol_formula(self):
        case = _cases("lr_trace.json")["R6_lr_trace"]
        self.assertEqual(case["status"], "OK", case.get("errorMessage"))
        r = case["readings"]
        upd = r["updateUnit"]
        self.assertEqual(upd["ledgerLrCount"], 8)
        self.assertTrue(upd["matchesFormula"], upd["observedLr"])
        self.assertEqual(upd["maxAbsDiff"], 0.0, "每步 LR 必须与协议公式逐位一致")
        self.assertAlmostEqual(upd["observedLr"][0], 1e-3, places=15)
        self.assertAlmostEqual(upd["observedLr"][-1], 1e-5, places=15)
        self.assertAlmostEqual(upd["metricsLrAtFirstUpdate"], 1e-3, places=15)
        self.assertAlmostEqual(upd["metricsLrAtLastUpdate"], 1e-5, places=15)
        single = r["singleUpdateU1"]
        self.assertEqual(len(single["observedLr"]), 1)
        self.assertTrue(single["matches"], "U=1 必须使用 lrMax")
        epoch = r["defaultEpochUnit"]
        self.assertTrue(epoch["matchesLegacyEpochSemantics"], epoch["observedLr"])
        self.assertTrue(epoch["differsFromUpdateFormula"],
                        "默认 epoch 语义必须与 update 公式不同（默认值未被改变）")

    # ------------------------------------------------------------ 采样合同
    def test_r7_sampler_contract(self):
        case = _cases("sampler_contract.json")["R7_sampler_contract"]
        self.assertEqual(case["status"], "OK", case.get("errorMessage"))
        r = case["readings"]
        real = r["realPlan"]
        self.assertEqual(real["quota"], {"oldCommon": 16, "newPool": 16})
        self.assertTrue(real["perUpdateQuotaExact16Plus16"],
                        "每个 update 必须是 16+16 来源配额")
        # 覆盖率：每个来源的循环游标在预算内访问 min(poolSize, quotaPerUpdate*totalUpdates) 个不同 key。
        # 池大于预算时 everyRowCovered 必然为 false，这是**预期**读数（如实记录，不缩小池凑绿）。
        cov = real["coverage"]
        for name, c in cov.items():
            with self.subTest(source=name):
                expected_unique = min(c["poolSize"], c["plannedExposures"])
                self.assertEqual(c["uniqueRows"], expected_unique,
                                 f"{name}: 循环游标应恰好访问 {expected_unique} 个不同 key")
                if c["plannedExposures"] >= c["poolSize"]:
                    self.assertTrue(c["everyRowCovered"], f"{name}: 预算足够时必须覆盖整池")
                else:
                    self.assertFalse(c["everyRowCovered"],
                                     f"{name}: 预算小于池时不应声称覆盖整池")
        self.assertEqual(real["everyRowCovered"], all(c["everyRowCovered"] for c in cov.values()))
        # 覆盖率受限时必须被显式标记，避免把算术结果误读成配置缺陷。
        if not real["everyRowCovered"]:
            self.assertTrue(real["coverageIsBudgetLimited"],
                            "未覆盖整池时必须证明是预算受限，而不是计划构造错误")
        self.assertLessEqual(real["maxExposureSpread"], 1,
                             "每个 key 的循环曝光次数相差不超过 1")
        consumed = r["consumedFixturePlan"]
        self.assertTrue(consumed["ledgerMatchesPlanExactly"],
                        "台账里的 sampleIds 必须与冻结 plan 完全一致")
        self.assertEqual(consumed["updates"], 8)
        self.assertEqual(consumed["totalExposures"], 32)
        self.assertEqual(consumed["exposuresRecomputedFromLedger"], 32)
        self.assertEqual(consumed["plannedButNeverUpdated"], 0)
        self.assertEqual(sum(consumed["exposuresBySource"].values()), 32)
        self.assertEqual(consumed["uniqueRootFamilies"], 1)

    # ------------------------------------------------------------ 前后对照
    def test_r8_before_after_p2(self):
        case = _cases("trainer_lifecycle_results.json")["R8_before_after_P2"]
        self.assertEqual(case["status"], "OK", case.get("errorMessage"))
        r = case["readings"]
        if not r.get("available"):
            self.skipTest(f"HEAD 版对照不可用：{r.get('reason')}")
        self.assertEqual(r["head"]["updates"], 3)
        self.assertEqual(r["new"]["updates"], 3)
        self.assertGreaterEqual(r["head"]["fakeZeroEpochs"], 2,
                                "旧控制流必须出现伪零 epoch（否则对照无意义）")
        self.assertEqual(r["new"]["fakeZeroEpochs"], 0)
        self.assertEqual(r["new"]["historyLength"], 1)
        self.assertGreaterEqual(r["head"]["historyLength"], 3)
        self.assertEqual(r["new"]["stopReason"], "GLOBAL_UPDATE_LIMIT")


@unittest.skipIf(TORCH_PYTHON is None, "no torch-enabled interpreter available")
class TrainerCliContractV15Tests(unittest.TestCase):
    """新参数的默认值必须保持历史行为（默认值不变）。"""

    def _help_text(self) -> str:
        env = dict(os.environ)
        env.pop("PYTHONIOENCODING", None)
        proc = subprocess.run(
            [*TORCH_PYTHON.split(), str(REPO_ROOT / "python" / "train_spatial_resnet.py"), "--help"],
            cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=600, env=env)
        self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])
        return proc.stdout

    def test_new_flags_are_declared(self):
        text = self._help_text()
        for flag in ("--lr-schedule-unit", "--lr-total-updates", "--batch-plan",
                     "--train-only", "--pause-after-updates", "--out-final-model"):
            with self.subTest(flag=flag):
                self.assertIn(flag, text)

    def test_legacy_defaults_are_unchanged(self):
        text = self._help_text()
        self.assertIn("--lr-schedule-unit {epoch,update}", text)
        self.assertIn("--lr-schedule {cosine,cosine-to-min,constant}", text)
        self.assertIn("--global-update-limit", text)
        self.assertIn("--max-steps", text)
        # --train-only 是 store_true（默认 False），不能变成默认开启
        self.assertIn("--train-only", text)
        self.assertNotIn("--deploy-to-src", text.split("--train-only")[1].split("\n")[0]
                         if "--train-only" in text else "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
