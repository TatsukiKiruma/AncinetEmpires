"""覆盖训练驱动的纯函数回归测试。"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock


MODULE_PATH = Path(__file__).with_name("run_coverage_training.py")
SPEC = importlib.util.spec_from_file_location("run_coverage_training", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

BUILDER_PATH = Path(__file__).with_name("build_coverage_pilot.py")
BUILDER_SPEC = importlib.util.spec_from_file_location("build_coverage_pilot", BUILDER_PATH)
assert BUILDER_SPEC and BUILDER_SPEC.loader
BUILDER = importlib.util.module_from_spec(BUILDER_SPEC)
import sys
sys.modules[BUILDER_SPEC.name] = BUILDER
BUILDER_SPEC.loader.exec_module(BUILDER)


class CoverageTrainingPlanTest(unittest.TestCase):
    def test_four_exposures_are_rounded_to_full_batches(self) -> None:
        rows = [(index, f"s{index}") for index in range(2001)]
        plan = MODULE.make_plan(rows)
        self.assertEqual(plan["totalUpdates"], 251)
        self.assertEqual(plan["updatesPerEpoch"], 64)
        self.assertEqual(sum(len(update["items"]) for update in plan["updates"]), 251 * 32)

    def test_plan_is_arm_and_output_independent(self) -> None:
        rows = [(index, f"s{index}") for index in range(73)]
        self.assertEqual(MODULE.make_plan(rows), MODULE.make_plan(rows))

    def test_fixed_250_checkpoint_is_added_only_when_reached(self) -> None:
        self.assertNotIn(250, MODULE.save_points(249))
        self.assertEqual(MODULE.save_points(251), [63, 126, 250, 251])

    def test_validate_inputs_accepts_real_coverage_builder_contract(self) -> None:
        """使用新 builder 的常量和写出函数构造最小合法产物。"""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            level = "one_third"
            level_dir = root / level
            level_dir.mkdir()
            dataset = level_dir / "dataset.jsonl"
            dataset.write_text(json.dumps({"fixture": True}) + "\n", encoding="utf-8")
            split = level_dir / "split.json"
            BUILDER.write_object(split, {
                "schema": BUILDER.SCHEMA,
                "level": level,
                "comparisonAxis": BUILDER.COMPARISON_AXIS,
                "trainRootFamilies": ["current:fixture"],
                "valRootFamilies": ["validation:fixture"],
            })
            report = level_dir / "report.json"
            BUILDER.write_object(report, {
                "schema": BUILDER.SCHEMA,
                "level": level,
                "comparisonAxis": BUILDER.COMPARISON_AXIS,
                "artifacts": {
                    "dataset.jsonl": BUILDER.file_sha256(dataset),
                    "split.json": BUILDER.file_sha256(split),
                },
            })
            manifest = root / "manifest.json"
            BUILDER.write_object(manifest, {
                "schema": BUILDER.SCHEMA,
                "comparisonAxis": BUILDER.COMPARISON_AXIS,
                "lossContractId": BUILDER.LOSS_CONTRACT_ID,
                "teacherScoreUsage": "forbidden; hard CE targets only",
                "levels": {level: {"reportSha256": BUILDER.file_sha256(report)}},
            })
            init = root / "init.json"
            trainer = root / "trainer.py"
            model = root / "model.py"
            init.write_text("init", encoding="utf-8")
            trainer.write_text("trainer", encoding="utf-8")
            model.write_text("model", encoding="utf-8")
            with mock.patch.multiple(
                MODULE,
                INIT=init,
                TRAINER=trainer,
                MODEL=model,
                INIT_SHA256=MODULE.file_sha256(init),
            ):
                actual = MODULE.validate_inputs(root, level)
            self.assertEqual(actual[:3], (dataset, split, report))
            self.assertEqual(actual[3]["comparisonAxis"], BUILDER.COMPARISON_AXIS)
            self.assertEqual(actual[4], BUILDER.file_sha256(manifest))


if __name__ == "__main__":
    unittest.main()
