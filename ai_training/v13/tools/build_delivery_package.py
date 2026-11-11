#!/usr/bin/env python3
"""V13/T13-05 + T13-10: assemble the checkpoint matrix and rebuild the delivery package.

Reads every `eval_paired_v3` result under the run directory, emits
`existing_checkpoint_matrix.jsonl` (one record per candidate, per plan), copies the
taskbook-named artifacts into their required locations, and builds the T13-10 package tree.

Nothing is overwritten: every write is either a new file or a copy into a new path.

Usage:
    py v13/tools/build_delivery_package.py --run-id v13_20260924_t13
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", default="v13_20260924_t13")
    args = ap.parse_args()

    run_dir = REPO_ROOT / "v13" / "out" / args.run_id
    if not run_dir.exists():
        raise SystemExit(f"run dir not found: {run_dir}")

    # ---------------------------------------------------------------- T13-05 matrix
    # Scan ONLY the directories where an evaluation actually ran. Scanning the whole run
    # tree would count the T13-10 package copies and the fault-injection calibration as
    # further measurements, inflating the matrix - which is the same class of error as
    # counting a replayed mirror as an independent observation.
    SCAN = ["T13-05", "T13-07"]
    records = []
    for sub in SCAN:
        for path in sorted((run_dir / sub).rglob("*.json")):
            try:
                payload = load(path)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            if not isinstance(payload, dict) or payload.get("schema") != "v13_paired_seat_eval_3":
                continue
            rows = payload.get("rows", [])
            if not rows:
                # The fault-injection calibration has no seat rows; it is a protocol test, not a
                # candidate measurement, so it must not appear in the matrix.
                continue
            name = path.name.lower()
            if "smoke" in name or "fault" in name or "selftest" in name:
                continue
            natural = [r for r in rows
                       if isinstance(r.get("candidate", {}).get("outcomeKind"), str)
                       and r["candidate"]["outcomeKind"].startswith("NATURAL")]
            cand_wins = sum(1 for r in natural if r["candidate"]["outcomeKind"] == "NATURAL_WIN")
            mirror_wins = sum(1 for r in rows if isinstance(r.get("mirrorView"), dict) and r["mirrorView"].get("won"))
            records.append({
                "candidate": payload.get("candidate"),
                "checkpointSha256": payload.get("checkpointSha256"),
                "candidateIsModel": payload.get("candidateIsModel"),
                "scenario": payload.get("protocol", {}).get("scenarioId"),
                "seeds": payload.get("protocol", {}).get("seeds"),
                "seats": payload.get("protocol", {}).get("seats"),
                "plannedSeatArms": payload.get("accounting", {}).get("plannedSeatArms"),
                "executedSeatArms": len(rows),
                "naturalSeatArms": len(natural),
                "undecidedSeatArms": len(rows) - len(natural),
                "errorSeatArms": payload.get("accounting", {}).get("errorSeatArms"),
                "candidateNaturalWins": cand_wins,
                "mirrorSeatWins": mirror_wins,
                "deltaOverNaturalArms": payload.get("overall", {}).get("deltaOverNaturalGames"),
                "independentMirrorGames": payload.get("accounting", {}).get("independentMirrorGames"),
                "selfTest": payload.get("selfTest"),
                "faultInjection": payload.get("faultInjection"),
                "sourceFile": str(path.relative_to(run_dir)),
                "metricClass": "DEVELOPMENT_READING",
                "notes": None,
            })

    # mark the byte-identical pair explicitly rather than leaving it to a reader
    by_sha: dict[str, list[str]] = {}
    for r in records:
        if r["checkpointSha256"]:
            by_sha.setdefault(r["checkpointSha256"], []).append(str(r["candidate"]))
    for sha, paths in by_sha.items():
        if len(paths) > 1:
            for r in records:
                if r["checkpointSha256"] == sha:
                    r["notes"] = ("byte-identical checkpoint also evaluated as: "
                                  + ", ".join(p for p in paths if p != r["candidate"]))

    matrix = run_dir / "T13-05" / "existing_checkpoint_matrix.jsonl"
    matrix.parent.mkdir(parents=True, exist_ok=True)
    with matrix.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # ------------------------------------------------------- T13-10 package skeleton
    pkg = run_dir / "T13-10"
    subdirs = ["protocol_and_splits", "tests", "data_manifests", "training_runs",
               "match_results", "failure_replays"]
    for d in subdirs:
        (pkg / d).mkdir(parents=True, exist_ok=True)

    copies: list[tuple[Path, Path]] = []
    # top-level taskbook files
    copies += [(run_dir / "final_summary.md", pkg / "final_summary.md"),
               (run_dir / "task_status.json", pkg / "task_status.json"),
               (run_dir / "promotion_decision.json", pkg / "promotion_decision.json"),
               (run_dir / "reproduction_commands.md", pkg / "reproduction_commands.md"),
               (run_dir / "T13-00" / "source_snapshot.json", pkg / "source_snapshot.json"),
               (run_dir / "T13-00" / "artifact_identity.json", pkg / "artifact_identity.json"),
               (run_dir / "T13-00" / "claim_ledger.json", pkg / "claim_ledger.json")]
    # splits and protocol
    copies += [(run_dir / "T13-07" / "data_v3_b0" / "split_manifest.json",
                pkg / "protocol_and_splits" / "b0_v30_split_manifest.json"),
               (run_dir / "T13-07" / "data_v3_b0_v31" / "split_manifest.json",
                pkg / "protocol_and_splits" / "b0_v31_split_manifest.json"),
               (run_dir / "T13-02" / "eval_protocol_v3.json",
                pkg / "protocol_and_splits" / "eval_protocol_v3.json"),
               (run_dir / "T13-06" / "teacher_kernel_contract.json",
                pkg / "protocol_and_splits" / "teacher_kernel_contract.json")]
    # tests
    copies += [(run_dir / "T13-01" / "trainer_regression.json", pkg / "tests" / "trainer_regression.json"),
               (run_dir / "T13-02" / "eval_selftest.json", pkg / "tests" / "eval_selftest.json"),
               (run_dir / "T13-02" / "checkpoint_identity_selftest.json",
                pkg / "tests" / "checkpoint_identity_selftest.json"),
               (run_dir / "T13-06" / "teacher_invariance_tests.json",
                pkg / "tests" / "teacher_invariance_tests.json"),
               (run_dir / "T13-06" / "teacher_tactical_suite.json",
                pkg / "tests" / "teacher_tactical_suite.json"),
               (run_dir / "T13-04" / "python_ts_parity.json", pkg / "tests" / "python_ts_parity.json"),
               (run_dir / "T13-04" / "encoding_collision_cases.json",
                pkg / "tests" / "encoding_collision_cases.json")]
    # data manifests
    copies += [(run_dir / "T13-03" / "dataset_v3_manifest.json", pkg / "data_manifests" / "dataset_v3_manifest.json"),
               (run_dir / "T13-03" / "teacher_mix_audit.json", pkg / "data_manifests" / "teacher_mix_audit.json"),
               (run_dir / "T13-03" / "outcome_repair_report.json", pkg / "data_manifests" / "outcome_repair_report.json"),
               (run_dir / "T13-03" / "lineage_split_check.json", pkg / "data_manifests" / "lineage_split_check.json"),
               (run_dir / "T13-07" / "data_v3_b0" / "dataset_v3_subset_manifest.json",
                pkg / "data_manifests" / "b0_v30_dataset_manifest.json"),
               (run_dir / "T13-07" / "data_v3_b0_v31" / "dataset_v31_subset_manifest.json",
                pkg / "data_manifests" / "b0_v31_dataset_manifest.json"),
               (run_dir / "T13-04" / "candidate_contract.json", pkg / "data_manifests" / "candidate_contract.json"),
               (run_dir / "T13-04" / "candidate_coverage.json", pkg / "data_manifests" / "candidate_coverage.json"),
               (run_dir / "T13-04" / "tiny_fit_metrics.json", pkg / "data_manifests" / "tiny_fit_metrics.json")]
    # training runs
    for s in ("42", "1337", "2026"):
        for src, dst in (("metrics.json", f"b0_v30_s{s}_metrics.json"),
                         ("optimized.json", f"b0_v30_s{s}_optimized.json"),
                         ("optimizer_update_ledger.jsonl", f"b0_v30_s{s}_ledger.jsonl")):
            copies.append((run_dir / "T13-07" / "runs" / f"s{s}" / src, pkg / "training_runs" / dst))
        for src, dst in (("metrics.json", f"b0_v31_s{s}_metrics.json"),
                         ("optimized.json", f"b0_v31_s{s}_optimized.json")):
            copies.append((run_dir / "T13-07" / "data_v3_b0_v31" / "runs" / f"s{s}" / src,
                           pkg / "training_runs" / dst))
    copies += [(run_dir / "T13-07" / "pilot_training_report.md", pkg / "training_runs" / "pilot_training_report.md"),
               (run_dir / "T13-07" / "pilot_training_report_v31.md", pkg / "training_runs" / "pilot_training_report_v31.md")]
    # match results
    copies += [(matrix, pkg / "match_results" / "existing_checkpoint_matrix.jsonl"),
               (run_dir / "T13-05" / "existing_checkpoint_summary.md",
                pkg / "match_results" / "existing_checkpoint_summary.md"),
               (run_dir / "T13-06" / "eval_search_teacher.json",
                pkg / "match_results" / "eval_search_teacher.json")]
    for f in sorted((run_dir / "T13-07").glob("eval_b0*_midway.json")):
        copies.append((f, pkg / "match_results" / f.name))
    for f in sorted((run_dir / "T13-07" / "data_v3_b0_v31").glob("eval_b0v31_*.json")):
        copies.append((f, pkg / "match_results" / f.name))
    # failure replays
    copies += [(run_dir / "T13-06" / "teacher_qualification.md",
                pkg / "failure_replays" / "teacher_qualification.md"),
               (run_dir / "T13-06" / "tactical_soundness_report.md",
                pkg / "failure_replays" / "tactical_soundness_report.md"),
               (run_dir / "T13-06" / "teacher_signal_probe.json",
                pkg / "failure_replays" / "teacher_signal_probe.json"),
               (run_dir / "T13-06" / "teacher_leaf_gain.json",
                pkg / "failure_replays" / "teacher_leaf_gain.json"),
               (run_dir / "T13-06" / "teacher_agreement.json",
                pkg / "failure_replays" / "teacher_agreement.json"),
               (run_dir / "T13-06" / "tactical_c4.json",
                pkg / "failure_replays" / "tactical_c4.json"),
               (run_dir / "T13-06" / "tactical_c16.json",
                pkg / "failure_replays" / "tactical_c16.json"),
               (run_dir / "T13-06" / "tactical_c32.json",
                pkg / "failure_replays" / "tactical_c32.json"),
               (run_dir / "T13-02" / "fault_stepcap_duel.json",
                pkg / "failure_replays" / "fault_stepcap_duel.json"),
               (run_dir / "T13-03" / "T13-03_report.md",
                pkg / "failure_replays" / "T13-03_report.md"),
               (run_dir / "T13-01" / "trainer_fix_notes.md",
                pkg / "failure_replays" / "trainer_fix_notes.md")]

    copied, missing = [], []
    for src, dst in copies:
        if src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
            copied.append({"from": str(src.relative_to(run_dir)), "to": str(dst.relative_to(pkg)),
                           "sha256": sha256_file(dst), "bytes": dst.stat().st_size})
        else:
            missing.append(str(src.relative_to(run_dir)))

    # ------------------------------------------------------------- package manifest
    manifest = {
        "schema": "v13_delivery_package_1",
        "runId": args.run_id,
        "builtBy": "v13/tools/build_delivery_package.py",
        "structure": {
            "final_summary.md": "round-by-round summary and the seven taskbook questions",
            "task_status.json": "authoritative per-task status",
            "source_snapshot.json": "HEAD, dirty diff, environment",
            "artifact_identity.json": "real SHA-256 for every artifact",
            "protocol_and_splits/": "evaluation protocol, teacher kernel contract, frozen splits",
            "tests/": "regression and self-test evidence",
            "data_manifests/": "dataset identity, provenance, candidate contract, parity",
            "training_runs/": "B0 metrics, consumption ledgers, reports (v3.0 and v3.1)",
            "match_results/": "checkpoint matrix, paired results, search-teacher evaluation",
            "failure_replays/": "the negative results and the evidence that locates them",
        },
        "copied": copied,
        "missingSources": missing,
        "matrixRecords": len(records),
        "counts": {d: sum(1 for _ in (pkg / d).rglob("*") if _.is_file()) for d in subdirs},
    }
    (pkg / "package_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"[pkg] matrix records = {len(records)} -> {matrix.relative_to(run_dir)}")
    print(f"[pkg] copied {len(copied)} files into {pkg.relative_to(run_dir)}")
    if missing:
        print(f"[pkg] MISSING sources ({len(missing)}):")
        for m in missing:
            print(f"        {m}")
    print(f"[pkg] per-subdir file counts: {manifest['counts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
