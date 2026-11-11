"""coverage 长预算驱动的纯函数合同测试。"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("run_coverage_fit_budget.py")
SPEC = importlib.util.spec_from_file_location("run_coverage_fit_budget", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CoverageFitBudgetTest(unittest.TestCase):
    def test_plan_has_16_exposures_and_old_prefix(self) -> None:
        rows = [(index, f"s{index}") for index in range(5295)]
        long_plan = MODULE.make_fit_plan(rows)
        old_plan = MODULE.base.make_plan(rows)
        self.assertEqual(long_plan["totalUpdates"], 2648)
        self.assertEqual(len(long_plan["updates"]), 2648)
        self.assertEqual(long_plan["updates"][:662], old_plan["updates"])
        MODULE.assert_prefix_identical(long_plan, old_plan)

    def test_prefix_mismatch_is_rejected(self) -> None:
        rows = [(index, f"s{index}") for index in range(5295)]
        long_plan = MODULE.make_fit_plan(rows)
        old_plan = MODULE.base.make_plan(rows)
        old_plan["updates"][0]["items"][0]["sampleId"] = "changed"
        with self.assertRaisesRegex(ValueError, "前662"):
            MODULE.assert_prefix_identical(long_plan, old_plan)

    def test_command_keeps_old_lr_horizon_without_resume(self) -> None:
        command = MODULE.build_command(
            Path("dataset.jsonl"), Path("split.json"), Path("plan.json"), Path("out")
        )
        def value(flag: str) -> str:
            return command[command.index(flag) + 1]

        self.assertEqual(value("--global-update-limit"), "2648")
        self.assertEqual(value("--lr-total-updates"), "662")
        self.assertEqual(value("--save-at-updates"), "662,1324,2648")
        self.assertEqual(value("--trainable-parts"), "trunk,policy")
        self.assertNotIn("--resume-state", command)


if __name__ == "__main__":
    unittest.main()
