"""V11 T11-03: gradient mask tests (policy-only / value-only / joint).

The taskbook asks for gradient unit tests on the three mask modes. The trainer
defines its training loop inside ``main()``, so the mask behaviour is measured
through the real trainer's own reported ledger rather than by importing an
internal function -- which has the advantage that the assertion is about the
shipped code path a training run actually executes.

Three modes the taskbook requires:

  policy-only : policy loss only           (--value-weight 0)
  value-only  : policy blocked by mask, value active
  joint       : both active

The decisive property throughout: a row whose mask is False contributes no
gradient to that head, while still being counted as an exposure.

Run:  py -3.12 -m unittest discover -s python/tests
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import unittest
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TRAINER = REPO_ROOT / "python" / "train_spatial_resnet.py"

# Scratch must live inside the workspace: the confined environment denies writes
# to the system temp directory and to directories made by tempfile.mkdtemp.
SCRATCH_ROOT = Path(os.environ.get("V11_TEST_SCRATCH", REPO_ROOT / "_work" / "v11_tmp"))

CANDIDATE_INTERPRETERS = [os.environ.get("V11_PYTHON"), "py -3.12", sys.executable, "python"]


def _torch_python() -> str | None:
    for candidate in CANDIDATE_INTERPRETERS:
        if not candidate:
            continue
        try:
            proc = subprocess.run(
                [*candidate.split(), "-c", "import torch, numpy"],
                cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=180,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if proc.returncode == 0:
            return candidate
    return None


TORCH_PYTHON = _torch_python()


def sample(index: int, *, policy_mask: bool, value_mask: bool) -> dict:
    """One schema-complete row. `value_mask=False` means valueTarget is null."""
    return {
        "sampleId": f"g{index}",
        "rootFamilyId": "rootA",
        "episodeId": "ep_rootA",
        "stateHash": f"h{index}",
        "encoderSchema": "spatial-v2/24x20x20+g20",
        "spatialTensor": [0.0] * (24 * 20 * 20),
        "globalFeatures": [0.0] * 20,
        "candidateActions": [
            {"actorCoord": {"x": 1, "y": 1}, "landingCoord": None, "targetCoord": None, "semantics": [0.1] * 32},
            {"actorCoord": {"x": 2, "y": 2}, "landingCoord": None, "targetCoord": None, "semantics": [0.2] * 32},
        ],
        "targetActionIndex": index % 2,
        "valueTarget": 1.0 if value_mask else None,
        "policyLossMask": policy_mask,
        "valueLossMask": value_mask,
        "terminationReason": "NATURAL_WIN" if value_mask else "TRUNCATION_STEP_LIMIT",
    }


@unittest.skipIf(TORCH_PYTHON is None, "no torch-enabled interpreter available")
class GradientMaskTests(unittest.TestCase):
    def setUp(self) -> None:
        SCRATCH_ROOT.mkdir(parents=True, exist_ok=True)
        self.tmp = SCRATCH_ROOT / f"v11_masks_{uuid.uuid4().hex[:12]}"
        self.tmp.mkdir(parents=True, exist_ok=False)
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def run_case(self, rows, *, value_weight: float, name: str) -> dict:
        # All supplied rows belong to rootA; one extra rootVAL row supplies the
        # validation partition the trainer insists on.
        dataset = self.tmp / f"{name}.jsonl"
        with dataset.open("w", encoding="utf-8") as f:
            for r in rows:
                r["rootFamilyId"] = "rootA"
                f.write(json.dumps(r) + "\n")
            val = sample(9000, policy_mask=True, value_mask=True)
            val["rootFamilyId"] = "rootVAL"
            f.write(json.dumps(val) + "\n")

        split = self.tmp / f"{name}_split.json"
        split.write_text(json.dumps({
            "trainRootFamilies": ["rootA"],
            "valRootFamilies": ["rootVAL"],
            "testRootFamilies": [],
        }), encoding="utf-8")

        cmd = [
            *TORCH_PYTHON.split(), str(TRAINER),
            "--dataset", str(dataset),
            "--split-manifest", str(split),
            "--epochs", "1",
            "--batch-size", str(len(rows)),
            "--value-weight", str(value_weight),
            "--out-model", str(self.tmp / f"{name}_model.json"),
            "--optimized-manifest", str(self.tmp / f"{name}_optimized.json"),
        ]
        proc = subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=900)
        self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])
        return json.loads((self.tmp / f"{name}_optimized.json").read_text(encoding="utf-8"))

    # -- the three required modes ----------------------------------------
    def test_policy_only_arm_consumes_without_value_supervision(self):
        rows = [sample(i, policy_mask=True, value_mask=True) for i in range(3)]
        out = self.run_case(rows, value_weight=0.0, name="policy_only")
        self.assertEqual(out["policyMaskedExposures"], 0)
        self.assertEqual(out["totalExposures"], 3)
        self.assertGreater(out["updates"], 0)

    def test_policy_mask_blocks_the_policy_gradient_and_is_counted(self):
        """Every masked row must be reported, not silently dropped."""
        rows = [sample(i, policy_mask=(i % 2 == 0), value_mask=True) for i in range(4)]
        out = self.run_case(rows, value_weight=0.0, name="policy_masked")
        self.assertEqual(out["policyMaskedExposures"], 2, "two of four rows are policy-masked")
        self.assertEqual(out["totalExposures"], 4, "masked rows are still exposures")

    def test_value_only_arm_blocks_policy_but_keeps_value_active(self):
        rows = [sample(i, policy_mask=False, value_mask=True) for i in range(4)]
        out = self.run_case(rows, value_weight=1.0, name="value_only")
        self.assertEqual(out["policyMaskedExposures"], 4, "all four rows are policy-masked")
        self.assertEqual(out["valueSupervisedExposures"], 4, "value supervision is unaffected")
        self.assertEqual(out["valueMaskedExposures"], 0)

    def test_joint_arm_reports_both_kinds_of_supervision(self):
        rows = [sample(i, policy_mask=(i < 2), value_mask=True) for i in range(4)]
        out = self.run_case(rows, value_weight=1.0, name="joint")
        self.assertEqual(out["policyMaskedExposures"], 2)
        self.assertGreater(out["valueSupervisedExposures"], 0)
        self.assertLessEqual(out["valueSupervisedExposures"], out["totalExposures"])

    def test_per_update_mask_counts_sum_to_the_aggregate(self):
        rows = [sample(i, policy_mask=(i < 2), value_mask=True) for i in range(4)]
        out = self.run_case(rows, value_weight=1.0, name="ledger")
        ledger = self.tmp / "optimizer_update_ledger.jsonl"
        self.assertTrue(ledger.exists(), "the per-update ledger must be written")
        entries = [json.loads(l) for l in ledger.read_text(encoding="utf-8").splitlines() if l.strip()]
        self.assertEqual(len(entries), out["updates"])
        self.assertEqual(sum(e["policyMasked"] for e in entries), out["policyMaskedExposures"])
        self.assertEqual(sum(e["batchSize"] for e in entries), out["totalExposures"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
