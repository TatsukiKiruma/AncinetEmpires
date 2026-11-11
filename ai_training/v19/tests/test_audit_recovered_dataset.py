"""历史恢复数据审计器的独立夹具测试。"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "tools" / "audit_recovered_dataset.py"
SPEC = importlib.util.spec_from_file_location("audit_recovered_dataset", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class AuditRecoveredDatasetTest(unittest.TestCase):
    def test_five_shards_and_semantic_initial_duplicates(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            selection_path = root / "selection.json"
            selection = {
                "results": [
                    {"file": f"source-{index // 10}.jsonl", "lineIndex": index}
                    for index in range(50)
                ]
            }
            selection_path.write_text(json.dumps(selection), encoding="utf-8")
            common_identity = "a" * 64
            for shard in range(5):
                shard_dir = root / f"recovered_s{shard}"
                shard_dir.mkdir()
                episode_rows = []
                for position in range(shard, 50, 5):
                    item = selection["results"][position]
                    episode_rows.append({
                        "file": item["file"], "lineIndex": item["lineIndex"],
                        "scenarioId": "场景甲", "seed": position, "playerCount": 2,
                        "sourceRecordSha256": f"{position:064x}",
                        "replayVerified": True, "outcome": "PASS", "rows": 0,
                    })
                episodes_path = shard_dir / "episodes.jsonl"
                episodes_path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in episode_rows), encoding="utf-8")
                source = selection["results"][shard]
                row = {
                    "encoderSchemaId": MODULE.SCHEMA_ID,
                    "candidateOrderingId": MODULE.ORDERING_ID,
                    "inputIdentityId": MODULE.IDENTITY_ID,
                    "spatialTensor": [0.0] * 13600,
                    "globalFeatures": [0.0] * 20,
                    "candidateActions": [{"actionCode": "end_turn", "semantics": [0.0] * 53}],
                    "orderedActionCodes": ["end_turn"],
                    "targetActionIndex": 0,
                    "policyLossMask": True,
                    "valueLossMask": False,
                    "valueTarget": None,
                    "inputIdentity": common_identity,
                    "teacher": {
                        "targetActionCode": "end_turn", "actionCodes": ["end_turn"],
                        "rawScores": [2.0 if shard == 4 else 1.0], "seed": shard,
                    },
                    "sampleId": f"sample-{shard}",
                    "stateJson": {"players": [{}, {}], "metadata": {"apkMapName": "(2) Duel.aem"}},
                    "provenance": {
                        "sourceFile": source["file"], "sourceLineIndex": source["lineIndex"],
                        "stepIndex": 0, "familyId": f"seed-family-{shard}",
                        "mainMapTwoPlayer": False, "eligibleForCurrentOpeningDataset": False,
                    },
                }
                rows_path = shard_dir / "rows.jsonl"
                rows_path.write_text(json.dumps(row, ensure_ascii=False) + "\n", encoding="utf-8")
                manifest = {
                    "shard": shard, "shards": 5, "selectedEpisodes": 10, "attemptedEpisodes": 10,
                    "pass": 10, "fail": 0, "timeout": 0, "rowCount": 1,
                    "selectionPath": str(selection_path), "selectionSha256": sha256(selection_path),
                    "sourceDigests": {"engine": {"digest": "b" * 64}},
                    "sources": {f"source-{index}.jsonl": "c" * 64 for index in range(5)},
                    "negativeControls": [{"mutation": "hash", "passed": True}],
                    "artifactHashes": {"episodes.jsonl": sha256(episodes_path), "rows.jsonl": sha256(rows_path)},
                }
                (shard_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

            report = MODULE.audit(root)
            self.assertEqual(report["status"], "PASS")
            self.assertTrue(report["checks"]["selectionUniqueCoverage50"])
            self.assertEqual(report["episodes"]["replayVerified"], 50)
            self.assertEqual(report["rows"]["exactDuplicateRows"], 4)
            self.assertEqual(report["rows"]["semanticInitialFamilies"]["repeatedFamilyCount"], 1)
            self.assertEqual(report["rows"]["mainFiveMapsTwoPlayer"]["rowCount"], 5)
            self.assertEqual(report["rows"]["mainFiveMapsTwoPlayer"]["provenanceMismatchCount"], 5)
            self.assertEqual(report["rows"]["hardTargetConflictInputCount"], 0)
            self.assertEqual(report["rows"]["teacherMetadataOrScoresVariationInputCount"], 1)
            self.assertEqual(report["rows"]["teacherConflictIdentityCount"], 1)

            # 把原始最后一条改成 TIMEOUT，再用身份完全相同的单条重试补齐。
            shard_dir = root / "recovered_s4"
            episode_path = shard_dir / "episodes.jsonl"
            original_episodes = [json.loads(line) for line in episode_path.read_text(encoding="utf-8").splitlines()]
            timed_out = original_episodes[-1]
            timed_out.update({"replayVerified": False, "outcome": "TIMEOUT"})
            episode_path.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in original_episodes), encoding="utf-8")
            shard_manifest_path = shard_dir / "manifest.json"
            shard_manifest = json.loads(shard_manifest_path.read_text(encoding="utf-8"))
            shard_manifest.update({"pass": 9, "timeout": 1})
            shard_manifest["artifactHashes"]["episodes.jsonl"] = sha256(episode_path)
            shard_manifest_path.write_text(json.dumps(shard_manifest), encoding="utf-8")

            retry_dir = root / "recovered_retry"
            retry_dir.mkdir()
            retry_selection_path = root / "retry_selection.json"
            retry_selection_path.write_text(json.dumps({"results": [selection["results"][49]]}), encoding="utf-8")
            retried = dict(timed_out)
            retried.update({"replayVerified": True, "outcome": "PASS"})
            retry_episode_path = retry_dir / "episodes.jsonl"
            retry_episode_path.write_text(json.dumps(retried, ensure_ascii=False) + "\n", encoding="utf-8")
            retry_row = json.loads((root / "recovered_s4" / "rows.jsonl").read_text(encoding="utf-8"))
            retry_row["sampleId"] = "retry-sample"
            retry_row["inputIdentity"] = "d" * 64
            retry_row["provenance"].update({
                "sourceFile": retried["file"], "sourceLineIndex": retried["lineIndex"],
                "familyId": "retry-family",
            })
            retry_row_path = retry_dir / "rows.jsonl"
            retry_row_path.write_text(json.dumps(retry_row, ensure_ascii=False) + "\n", encoding="utf-8")
            retry_manifest = {
                "shard": 0, "shards": 1, "selectedEpisodes": 1, "attemptedEpisodes": 1,
                "pass": 1, "fail": 0, "timeout": 0, "rowCount": 1,
                "selectionPath": str(retry_selection_path), "selectionSha256": sha256(retry_selection_path),
                "sourceDigests": {"engine": {"digest": "b" * 64}},
                "sources": {retried["file"]: "c" * 64},
                "negativeControls": [{"mutation": "hash", "passed": True}],
                "artifactHashes": {"episodes.jsonl": sha256(retry_episode_path), "rows.jsonl": sha256(retry_row_path)},
                "recoverySourceSha256": "与首轮不同是允许的",
            }
            (retry_dir / "manifest.json").write_text(json.dumps(retry_manifest), encoding="utf-8")

            retried_report = MODULE.audit(root, retry_dir)
            self.assertEqual(retried_report["status"], "PASS")
            self.assertEqual(retried_report["episodes"]["passWithEncoding"], 49)
            self.assertEqual(retried_report["episodes"]["outcomes"]["TIMEOUT"], 1)
            self.assertEqual(retried_report["effectiveRecovery"]["passWithEncoding"], 50)
            self.assertEqual(retried_report["effectiveRecovery"]["timeout"], 0)
            self.assertTrue(retried_report["valid"]["dataIntegrity"])
            self.assertTrue(retried_report["valid"]["recoveryCompleteness"])


if __name__ == "__main__":
    unittest.main()
