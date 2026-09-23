"""V11 T11-03 regression tests: real optimizer consumption and loss interface.

Runs the real trainer (``python/train_spatial_resnet.py``) as a subprocess on a
tiny synthetic dataset and inspects the artifacts it writes. Nothing here
re-implements training maths; the assertions are about what the trainer *reports*
and *refuses*, which is exactly what the V10 pipeline got wrong.

Run with a torch-enabled interpreter:

    py -3.12 -m unittest discover -s python/tests -v
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

# Scratch space must live inside the repository workspace: the confined
# execution environment denies writes to the system temp directory, and
# `tempfile.mkdtemp` creates a directory it refuses to write into.
SCRATCH_ROOT = Path(os.environ.get("V11_TEST_SCRATCH", REPO_ROOT / "_work" / "v11_tmp"))

CANDIDATE_INTERPRETERS = [
    os.environ.get("V11_PYTHON"),
    "py -3.12",
    sys.executable,
    "python",
]


def _torch_python() -> str | None:
    for candidate in CANDIDATE_INTERPRETERS:
        if not candidate:
            continue
        parts = candidate.split()
        try:
            proc = subprocess.run(
                [*parts, "-c", "import torch, numpy; print(torch.__version__)"],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=180,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if proc.returncode == 0:
            return candidate
    return None


TORCH_PYTHON = _torch_python()


def synthetic_sample(index: int, root: str, value_target, *, policy_mask=True, sample_id=None) -> dict:
    """One minimal but schema-complete spatial training row."""
    return {
        "sampleId": sample_id or f"s{index}",
        "rootFamilyId": root,
        "episodeId": f"ep_{root}",
        "stateHash": f"hash_{index}",
        "encoderSchema": "spatial-v2/24x20x20+g20",
        # 24 channels x 20 x 20 flattened.
        "spatialTensor": [0.0] * (24 * 20 * 20),
        "globalFeatures": [0.0] * 20,
        "candidateActions": [
            {
                "actorCoord": {"x": 1, "y": 1},
                "landingCoord": {"x": 2, "y": 1},
                "targetCoord": None,
                "semantics": [0.1] * 32,
            },
            {
                "actorCoord": {"x": 3, "y": 3},
                "landingCoord": None,
                "targetCoord": {"x": 4, "y": 3},
                "semantics": [0.2] * 32,
            },
        ],
        "targetActionIndex": index % 2,
        "valueTarget": value_target,
        "policyLossMask": policy_mask,
        "valueLossMask": value_target is not None,
        "terminationReason": "NATURAL_WIN" if value_target is not None else "TRUNCATION_STEP_LIMIT",
    }


@unittest.skipIf(TORCH_PYTHON is None, "no torch-enabled interpreter available")
class OptimizerConsumptionTests(unittest.TestCase):
    def setUp(self) -> None:
        SCRATCH_ROOT.mkdir(parents=True, exist_ok=True)
        self.tmp = SCRATCH_ROOT / f"v11_t11_03_{uuid.uuid4().hex[:12]}"
        self.tmp.mkdir(parents=True, exist_ok=False)
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    # -- helpers ---------------------------------------------------------
    def write_dataset(self, rows, name="dataset.jsonl") -> Path:
        path = self.tmp / name
        with path.open("w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row) + "\n")
        return path

    def write_split(self, train_roots, val_roots, test_roots=(), name="split.json") -> Path:
        path = self.tmp / name
        path.write_text(json.dumps({
            "trainRootFamilies": list(train_roots),
            "valRootFamilies": list(val_roots),
            "testRootFamilies": list(test_roots),
        }), encoding="utf-8")
        return path

    def make_episode(self, n_train: int, value_of=None, train_root: str = "rootA", policy_mask_of=None):
        """A pool with `n_train` train rows plus one validation row.

        The validation row is mandatory: V11 refuses to invent a validation
        partition by carving rows out of train.
        """
        rows = []
        for i in range(n_train):
            vt = value_of(i) if value_of else (1.0 if i % 2 == 0 else None)
            pm = policy_mask_of(i) if policy_mask_of else True
            rows.append(synthetic_sample(i, train_root, vt, policy_mask=pm))
        rows.append(synthetic_sample(9000, "rootVAL", 1.0))
        dataset = self.write_dataset(rows)
        split = self.write_split([train_root], ["rootVAL"])
        return dataset, split, rows

    def run_trainer(self, dataset: Path, split: Path | None = None, extra=None) -> subprocess.CompletedProcess:
        out_model = self.tmp / "model.json"
        cmd = [
            *TORCH_PYTHON.split(), str(TRAINER),
            "--dataset", str(dataset),
            "--epochs", "1",
            "--batch-size", "2",
            "--out-model", str(out_model),
            "--planned-manifest", str(self.tmp / "planned.json"),
            "--optimized-manifest", str(self.tmp / "optimized.json"),
        ]
        if split is not None:
            cmd += ["--split-manifest", str(split)]
        if extra:
            cmd += list(extra)
        return subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=900)

    def load_optimized(self) -> dict:
        return json.loads((self.tmp / "optimized.json").read_text(encoding="utf-8"))

    def load_planned(self) -> dict:
        return json.loads((self.tmp / "planned.json").read_text(encoding="utf-8"))

    # -- tests -----------------------------------------------------------
    def test_planned_manifest_is_labelled_as_a_plan_not_consumption(self):
        dataset, split, rows = self.make_episode(8)
        proc = self.run_trainer(dataset, split, ["--global-update-limit", "2"])
        self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])

        planned = self.load_planned()
        self.assertFalse(planned["measured"])
        self.assertIn("does NOT prove", planned["warning"])
        self.assertEqual(planned["train_sample_count"], len(rows) - 1)

    def test_planned_ids_differ_from_optimized_ids_when_the_limit_truncates(self):
        """The F05 defect: the plan claimed full consumption that never happened."""
        dataset, split, _rows = self.make_episode(40)
        proc = self.run_trainer(dataset, split, ["--global-update-limit", "3"])
        self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])

        optimized = self.load_optimized()
        self.assertTrue(optimized["measured"])
        self.assertEqual(optimized["updates"], 3)
        self.assertEqual(optimized["totalExposures"], 6)  # 3 updates x batch 2
        self.assertEqual(optimized["plannedTrainRows"], 40)
        self.assertLess(optimized["optimizedUniqueSamples"], 40)
        self.assertGreater(optimized["plannedButNeverOptimized"], 0)
        self.assertNotEqual(
            set(optimized["optimizedSampleIds"]),
            set(self.load_planned()["train_sample_ids"]),
        )

    def test_global_update_limit_is_not_reset_every_epoch(self):
        dataset, split, _rows = self.make_episode(40, value_of=lambda i: 1.0)
        proc = self.run_trainer(dataset, split, ["--epochs", "4", "--global-update-limit", "3"])
        self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])
        self.assertEqual(self.load_optimized()["updates"], 3, "global limit must apply across the whole run")

    def test_last_optimized_batch_loss_is_not_dropped(self):
        """The F05b defect: `break` before accumulating dropped the last batch."""
        dataset, split, _rows = self.make_episode(40, value_of=lambda i: 1.0)
        proc = self.run_trainer(dataset, split, ["--epochs", "1", "--max-steps", "2"])
        self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])
        metrics_file = (self.tmp / "model.json").with_name("model_metrics.json")
        metrics = json.loads(metrics_file.read_text(encoding="utf-8"))
        history = metrics["history"]
        self.assertEqual(len(history), 1)
        self.assertGreater(history[0]["train_loss"], 0.0)
        self.assertEqual(self.load_optimized()["updates"], 2)

    def test_unknown_root_is_rejected_instead_of_defaulting_into_train(self):
        rows = [synthetic_sample(0, "rootA", 1.0), synthetic_sample(1, "rootMYSTERY", 1.0)]
        dataset = self.write_dataset(rows)
        split = self.write_split(["rootA"], [])
        proc = self.run_trainer(dataset, split)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("rootMYSTERY", proc.stderr)
        self.assertIn("Refusing to default unknown roots", proc.stderr)

    def test_empty_validation_partition_is_rejected(self):
        rows = [synthetic_sample(i, "rootA", 1.0) for i in range(6)]
        dataset = self.write_dataset(rows)
        split = self.write_split(["rootA"], [])
        proc = self.run_trainer(dataset, split)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("0 validation samples", proc.stderr)

    def test_duplicate_sample_id_with_conflicting_state_hash_is_rejected(self):
        rows = [
            synthetic_sample(0, "rootA", 1.0, sample_id="dup"),
            synthetic_sample(1, "rootA", 1.0, sample_id="dup"),
            synthetic_sample(9000, "rootVAL", 1.0),
        ]
        rows[1]["stateHash"] = "different_hash"
        dataset = self.write_dataset(rows)
        split = self.write_split(["rootA"], ["rootVAL"])
        proc = self.run_trainer(dataset, split)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("duplicate sampleId", proc.stderr)

    def test_policy_mask_blocks_gradient_contribution_but_keeps_the_row_counted(self):
        """A truncated episode keeps a policy label; a maskless bad row must not."""
        dataset, split, _rows = self.make_episode(
            8,
            value_of=lambda i: 1.0 if i % 2 == 0 else None,
            policy_mask_of=lambda i: i % 2 == 0,
        )
        proc = self.run_trainer(dataset, split, ["--epochs", "1", "--max-steps", "2"])
        self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])
        optimized = self.load_optimized()
        self.assertGreater(optimized["policyMaskedExposures"], 0, "masked rows must be reported, not silently dropped")
        self.assertEqual(optimized["valueMaskedExposures"], 0)
        self.assertGreater(optimized["valueSupervisedExposures"], 0)
        self.assertLess(optimized["valueSupervisedExposures"], optimized["totalExposures"])

    def test_update_ledger_is_recomputable(self):
        dataset, split, _rows = self.make_episode(12)
        proc = self.run_trainer(dataset, split, ["--global-update-limit", "4"])
        self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])

        ledger_path = self.tmp / "optimizer_update_ledger.jsonl"
        self.assertTrue(ledger_path.exists())
        entries = [json.loads(line) for line in ledger_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        optimized = self.load_optimized()
        self.assertEqual(len(entries), optimized["updates"])
        self.assertEqual(sum(e["batchSize"] for e in entries), optimized["totalExposures"])
        self.assertEqual(
            len({sid for e in entries for sid in e["sampleIds"]}),
            optimized["optimizedUniqueSamples"],
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
