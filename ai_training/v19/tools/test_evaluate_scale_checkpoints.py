"""evaluate_scale_checkpoints 的小型端到端契约测试。"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import torch

import evaluate_scale_checkpoints as evaluator
from spatial_resnet_model import SpatialResNet, export_model_to_ts_json


class ScaleCheckpointEvaluationTest(unittest.TestCase):
    def _row(self, family: str, source: str, identity: str, target: int = 0) -> dict:
        candidate = {
            "action": {"type": "end_turn"},
            "actorCoord": {"x": 0, "y": 0},
            "landingCoord": {"x": 1, "y": 0},
            "targetCoord": None,
            "semantics": [0.0] * 53,
        }
        return {
            "sampleId": identity,
            "encoderSchemaId": evaluator.EXPECTED_ENCODER_SCHEMA,
            "spatialTensor": [0.0] * (34 * 20 * 20),
            "globalFeatures": [0.0] * 20,
            "candidateActions": [candidate, dict(candidate)],
            "targetActionIndex": target,
            "policyLossMask": True,
            "valueLossMask": False,
            "valueTarget": None,
            "rootFamilyId": family,
            "inputIdentity": identity,
            "validationSource": source,
            "stateJson": {"metadata": {"apkMapName": "测试地图.aem"}},
        }

    def test_correction_and_regression_counts(self) -> None:
        reference = [
            {"input": "a", "prediction": 1, "correct": 0},
            {"input": "b", "prediction": 0, "correct": 1},
            {"input": "c", "prediction": 1, "correct": 0},
            {"input": "d", "prediction": 0, "correct": 1},
        ]
        current = [
            {"input": "a", "prediction": 0, "correct": 1},
            {"input": "b", "prediction": 1, "correct": 0},
            {"input": "c", "prediction": 2, "correct": 0},
            {"input": "d", "prediction": 0, "correct": 1},
        ]
        self.assertEqual(evaluator._comparison(reference, current), {
            "sameArgmax": 1,
            "changedArgmax": 3,
            "teacherCorrected": 1,
            "teacherRegressed": 1,
            "bothWrongChanged": 1,
        })

    def test_two_validation_sources_run_end_to_end(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dataset = root / "dataset.jsonl"
            split = root / "split.json"
            report = root / "report.json"
            checkpoint = root / "checkpoint.json"
            output = root / "evaluation.json"
            rows = [
                self._row("historical-family", "historical_curriculum_holdout", "historical-input"),
                self._row("current-family", "current_regression", "current-input", target=1),
            ]
            dataset.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
            split.write_text(json.dumps({
                "trainRootFamilies": [],
                "valRootFamilies": ["historical-family", "current-family"],
                "testRootFamilies": [],
            }), encoding="utf-8")
            report.write_text(json.dumps({"artifacts": {
                "dataset.jsonl": evaluator.sha256_file(dataset),
                "split.json": evaluator.sha256_file(split),
            }}), encoding="utf-8")
            model = SpatialResNet(spatial_channels=34, global_dim=20, action_semantic_dim=53,
                                  version="spatial-resnet-v2", num_blocks=2)
            export_model_to_ts_json(model, str(checkpoint), evaluator.EXPECTED_ENCODER_SCHEMA)

            result = evaluator.run(dataset, split, [checkpoint], output, batch_size=2,
                                   diagnostics=True)

            sources = result["checkpoints"][0]["validationBySource"]
            self.assertEqual(set(sources), set(evaluator.SOURCE_NAMES.values()))
            self.assertEqual(sources["historical"]["rows"], 1)
            self.assertEqual(
                sources["previously_consumed_current_rules_regression_only"]["families"], 1
            )
            self.assertEqual(result["metricSemantics"]["value"], "未评估")
            diagnostics = result["checkpoints"][0]["diagnostics"]
            historical = diagnostics["bySource"]["historical"]
            self.assertEqual(historical["byTeacherActionType"]["end_turn"]["rows"], 1)
            self.assertEqual(historical["byMap"]["测试地图.aem"]["rows"], 1)
            self.assertIsNone(diagnostics["comparisonToReference"])

    def test_invalid_target_throws(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dataset = root / "dataset.jsonl"
            split = root / "split.json"
            checkpoint = root / "checkpoint.json"
            dataset.write_text(json.dumps(
                self._row("historical-family", "historical_holdout", "bad-input", target=2)
            ) + "\n", encoding="utf-8")
            split.write_text(json.dumps({
                "trainRootFamilies": [], "valRootFamilies": ["historical-family"],
                "testRootFamilies": [],
            }), encoding="utf-8")
            model = SpatialResNet(spatial_channels=34, global_dim=20, action_semantic_dim=53,
                                  version="spatial-resnet-v2", num_blocks=2)
            export_model_to_ts_json(model, str(checkpoint), evaluator.EXPECTED_ENCODER_SCHEMA)
            with self.assertRaisesRegex(ValueError, "targetActionIndex"):
                evaluator.run(dataset, split, [checkpoint], root / "out.json", batch_size=1)


if __name__ == "__main__":
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    unittest.main()
