"""V15/T15-05：TS/Python 一致性验收的回归测试。

分两类断言：
1. **现场重算**（不依赖大产物）：Python 端 V15 编码适配器必须在 T15-02 的 18 个受控夹具上
   与独立记录的 `encodedCounterByVariant.v15` 完全一致。这保证"Python 侧用的是 V15 语义"
   不是口头声明。
2. **产物断言**（读取 T15-05 已生成的 JSON）：把预登记容差、tie-break 裁决、
   重排不变性与空合法集契约固定成回归。产物不存在时 skip（并给出原因），不伪装通过。

运行：
    cd <repo root>
    python -m pytest python/tests/test_v15_parity.py -q
或：
    python -m unittest python.tests.test_v15_parity -v
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))
sys.path.insert(0, str(REPO_ROOT / "v15" / "tools"))

T15_05 = REPO_ROOT / "v15" / "out" / "v15_20260925_core" / "T15-05"
T15_02 = REPO_ROOT / "v15" / "out" / "v15_20260925_core" / "T15-02"

# 预登记容差（任务书 §6）：不随结果放宽。
INPUT_MAX_ABS_DIFF = 1e-6
FORWARD_ATOL = 1e-4
FORWARD_RTOL = 1e-4
GRADIENT_ATOL = 1e-5


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


class PythonEncoderV15SemanticsTests(unittest.TestCase):
    """现场重算：Python 端 V15 反击语义必须与 T15-02 的独立记录一致。"""

    @classmethod
    def setUpClass(cls):
        import parity_python_encode_v15 as pyenc

        cls.pyenc = pyenc
        cls.tables_path = T15_05 / "states" / "terrain_tables_v15.json"
        cls.golden_inputs = T15_02 / "golden_inputs.jsonl"
        cls.golden_outputs = T15_02 / "golden_outputs.jsonl"

    def test_golden_fixtures_present(self):
        self.assertTrue(self.tables_path.exists(), f"缺少 {self.tables_path}")
        self.assertTrue(self.golden_inputs.exists(), f"缺少 {self.golden_inputs}")
        self.assertTrue(self.golden_outputs.exists(), f"缺少 {self.golden_outputs}")

    def test_python_v15_counter_matches_t15_02(self):
        tables = self.pyenc.load_tables(self.tables_path)
        report = self.pyenc.validate_against_golden(
            self.golden_inputs, self.golden_outputs, tables)
        self.assertGreater(report["casesCompared"], 0)
        self.assertEqual(report["mismatches"], 0,
                         msg=f"不匹配案例：{[c for c in report['cases'] if not c.get('matchV15')]}")
        self.assertTrue(report["passed"])


class ForwardParityArtifactTests(unittest.TestCase):
    """产物断言：TS ↔ Python 前向/编码逐数值一致。"""

    def _report(self, name: str):
        path = T15_05 / name
        if not path.exists():
            self.skipTest(f"缺少产物 {path}（未运行 T15-05 前向流水线）")
        return load_json(path)

    def test_synthetic_checkpoint_parity(self):
        report = self._report("forward_parity.json")
        summary = report["summary"]
        self.assertLessEqual(summary["maxInputFloat32AbsDiff"], INPUT_MAX_ABS_DIFF)
        self.assertLessEqual(summary["maxLogitToleranceRatio"], 1.0)
        self.assertLessEqual(summary["maxTrunkZToleranceRatio"], 1.0)
        self.assertEqual(summary["actionMismatches"], 0)
        self.assertEqual(summary["nonFiniteReadouts"], 0)
        self.assertEqual(summary["topGapRuleViolations"], 0)
        self.assertGreaterEqual(summary["casesCompared"], 128)
        self.assertTrue(summary["passed"])

    def test_trained_checkpoint_parity(self):
        report = self._report("forward_parity_tiny_s42_final.json")
        summary = report["summary"]
        self.assertLessEqual(summary["maxInputFloat32AbsDiff"], INPUT_MAX_ABS_DIFF)
        self.assertLessEqual(summary["maxLogitToleranceRatio"], 1.0)
        self.assertLessEqual(summary["maxTrunkZToleranceRatio"], 1.0)
        self.assertEqual(summary["actionMismatches"], 0)
        self.assertTrue(summary["passed"])

    def test_tolerances_are_the_pre_registered_ones(self):
        report = self._report("forward_parity.json")
        tolerances = report["tolerances"]
        self.assertEqual(tolerances["inputFloat32MaxAbsDiff"], INPUT_MAX_ABS_DIFF)
        self.assertEqual(tolerances["forwardAtol"], FORWARD_ATOL)
        self.assertEqual(tolerances["forwardRtol"], FORWARD_RTOL)
        self.assertEqual(tolerances["gradientAtol"], GRADIENT_ATOL)


class TieBreakArtifactTests(unittest.TestCase):
    def test_tie_break_verdict(self):
        path = T15_05 / "tie_break.json"
        if not path.exists():
            self.skipTest(f"缺少产物 {path}")
        report = load_json(path)
        verdict = report["verdict"]
        self.assertTrue(verdict["syntheticTieRuleConsistentAcrossLanguages"])
        self.assertTrue(verdict["forcedTieRuleConsistentAcrossLanguages"])
        self.assertTrue(verdict["legacyRulePreserved"])
        self.assertTrue(verdict["emptySetTypedRejectionObserved"])
        self.assertTrue(verdict["passed"])
        # 旧 schema 的 tie-break 必须是历史版本，不能换成新规则。
        self.assertEqual(report["legacySchemaRetention"]["semanticsVariant"], "v13_legacy")


class PermutationArtifactTests(unittest.TestCase):
    def test_permutation_gradients_within_tolerance(self):
        path = T15_05 / "permutation_update.json"
        if not path.exists():
            self.skipTest(f"缺少产物 {path}")
        report = load_json(path)
        fp32 = report["float32"]
        self.assertLessEqual(fp32["maxLogitDiff"], 1e-6)
        self.assertLessEqual(fp32["maxGradDiff"], GRADIENT_ATOL)
        self.assertLessEqual(fp32["maxLossDiff"], 1e-5)
        self.assertEqual(fp32["targetMappingErrors"], 0)
        self.assertGreaterEqual(fp32["statesCompared"], 128)

    def test_single_adamw_step_gate_stays_failed_in_float32(self):
        """预登记门槛不放宽：fp32 单步 AdamW 差值仍记录为未达标。"""
        path = T15_05 / "permutation_update.json"
        if not path.exists():
            self.skipTest(f"缺少产物 {path}")
        report = load_json(path)
        fp32 = report["float32"]
        self.assertFalse(fp32["passed"])
        self.assertGreater(fp32["maxUpdateDiffAfterOneAdamWStep"], GRADIENT_ATOL)
        # 事后诊断必须给出根因分层证据：所有越界元素的梯度都在噪声底下。
        diagnostics = fp32["postHocDiagnostics"]
        self.assertLessEqual(diagnostics["maxUpdateDiffAmongWellDeterminedGradients"], GRADIENT_ATOL)
        self.assertEqual(diagnostics["elementsExceedingUpdateAtol"],
                         diagnostics["elementsExceedingUpdateAtolWithGradientBelowFloor"])
        # float64 对照必须塌缩到容差内，证明差异来自 fp32 舍入。
        control = report["float64Control"]
        self.assertLessEqual(control["maxUpdateDiffAfterOneAdamWStep"], GRADIENT_ATOL)
        self.assertTrue(control["passed"])


class TinyFitArtifactTests(unittest.TestCase):
    def test_ts_reeval_uses_v15_schema(self):
        path = T15_05 / "tiny_fit_v15_ts_reeval.json"
        if not path.exists():
            self.skipTest(f"缺少产物 {path}")
        report = load_json(path)
        self.assertEqual(report["predictorSchemaId"], "spatial26_global20_actionSemantics53_v15")
        self.assertEqual(report["semanticsVariant"], "v15_current")
        self.assertEqual(report["engineSetMismatches"], 0)
        self.assertEqual(report["sharedPolicyErrors"], 0)

    def test_ts_and_python_agree_per_state(self):
        path = T15_05 / "tiny_fit_v15_consumption.json"
        if not path.exists():
            self.skipTest(f"缺少产物 {path}")
        report = load_json(path)
        agreement = report["results"]["tsPythonPerStateAgreement"]
        self.assertEqual(agreement["choiceDisagreements"], 0)
        self.assertTrue(agreement["identicalHitSets"])

    def test_failed_states_are_located(self):
        """未达标时必须给出具体失败状态，而不是只报一个数字。"""
        path = T15_05 / "tiny_fit_v15_final.json"
        if not path.exists():
            self.skipTest(f"缺少产物 {path}")
        report = load_json(path)
        self.assertEqual(report["failures"].__len__(), report["failureCount"])
        for failure in report["failures"]:
            self.assertIn("targetActionCode", failure)
            self.assertIn("predictedActionCode", failure)
            self.assertIn("crossEntropy", failure)


if __name__ == "__main__":
    unittest.main(verbosity=2)
