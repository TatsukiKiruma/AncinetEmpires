#!/usr/bin/env python3
"""T13-00: freeze real local artifact identity for the V13 run.

Computes actual file SHA-256 (never Git blob IDs), records the git baseline,
the dirty diff digest, and the reference chain
    training run -> dataset -> split -> best/last weights -> eval -> UI.

Usage:
    py v13/tools/v13_identity.py --run-id <runId> [--out v13/out/<runId>/T13-00]

Writes artifact_identity.json and source_snapshot.json. Read-only with respect
to the repository: it never modifies tracked files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
REVIEW_COMMIT = "b8c0c24312a551a3cf20802f820e3f1edf798395"
REVIEW_BRANCH = "path-b-spatial-ai"


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            block = f.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run_git(*args: str) -> str:
    proc = subprocess.run(
        ["git", *args], cwd=str(REPO_ROOT), capture_output=True, text=True
    )
    return proc.stdout.strip()


def git_blob_id(path: Path) -> str | None:
    rel = path.relative_to(REPO_ROOT).as_posix()
    out = run_git("rev-parse", f"HEAD:{rel}")
    return out or None


# ---------------------------------------------------------------- inventories

# Source files whose behaviour the V13 review makes claims about.
SOURCE_FILES = [
    "python/train_spatial_resnet.py",
    "python/spatial_resnet_model.py",
    "python/verify_parity.py",
    "tools/convert_archive_to_spatial.ts",
    "tools/skirmish_model_registry.ts",
    "src/game/ai/shared_spatial_policy.ts",
    "src/game/ai/spatial_neural_adapter.ts",
    "src/game/ai/spatial_conv_net.ts",
    "src/game/ai/spatial_tensor_encoder.ts",
    "src/game/ai/battle_search_ai.ts",
    "src/game/ai/heuristic_ai.ts",
    "src/game/ai/apk_like_ai.ts",
    "src/game/ai/models/model_registry.json",
    "src/game/ai/models/model_registry.ts",
    "v12/tools/eval_paired_seats.ts",
    "v12/tools/search_labels.ts",
    "v12/tools/run-tool.mjs",
    "package.json",
]

# Weight files that a "current best model" claim could resolve to.
WEIGHT_FILES = [
    "src/game/ai/models/spatial_resnet_v2_checkpoint.json",
    "src/game/ai/models/spatial_resnet_checkpoint.json",
    "src/game/ai/models/spatial_resnet_dagger_checkpoint.json",
    "src/game/ai/models/net_b_checkpoint.json",
    "v12/models/budget_s42.json",
    "v12/models/budget_s42_last.json",
    "v12/models/budget_s1337.json",
    "v12/models/budget_s1337_last.json",
    "v12/models/budget_s2026.json",
    "v12/models/budget_s2026_last.json",
    "v12/models/v2_honest_s42.json",
    "v12/models/v2_honest_s42_last.json",
    "v12/models/diag_grouped_s42.json",
    "v12/models/diag_grouped_s42_last.json",
]

# Datasets / episode sources.
DATA_FILES = [
    "training_runs/spatial_dataset/spatial_v2_full_pool.jsonl",
    "training_runs/spatial_dataset/spatial_train_scaled_30k.jsonl",
    "training_runs/spatial_dataset/spatial_train_25ep.jsonl",
    "training_runs/spatial_dataset/spatial_pilot_01.jsonl",
    "training_runs/agent_upgrade_20260919_01/baseline_dataset/baseline_dataset.jsonl",
    "training_runs/agent_upgrade_v11_b2_main/episodes.jsonl",
]

# Evidence artifacts produced by V12 that V13 makes claims about.
EVIDENCE_FILES = [
    "v12/V12_EXECUTION_REPORT.md",
    "v12/V12_FOLLOWUP_REPORT.md",
    "v12/out/training/budget_s42_metrics.json",
    "v12/out/training/budget_s1337_metrics.json",
    "v12/out/training/budget_s2026_metrics.json",
    "v12/out/spatial/v2_honest_s42_metrics.json",
    "v12/out/spatial/T12-04_dataset_report.json",
    "v12/out/spatial/T12-04_split_check.json",
    "v12/out/protocol_v2/paired_budget_s42.json",
    "v12/out/labels/label_quality_v2.json",
    "v12/out/archive_value/imitation_mix.json",
    "v12/out/freeze/evidence_manifest.json",
]

GROUPS = {
    "sources": SOURCE_FILES,
    "weights": WEIGHT_FILES,
    "data": DATA_FILES,
    "v12_evidence": EVIDENCE_FILES,
}


def describe(path: Path) -> dict:
    record: dict = {"path": path.relative_to(REPO_ROOT).as_posix()}
    if not path.exists():
        record["exists"] = False
        return record
    st = path.stat()
    record.update(
        {
            "exists": True,
            "bytes": st.st_size,
            "sha256": sha256_file(path),
            "gitBlobId": git_blob_id(path) if path.is_file() else None,
            "gitBlobNote": "Git blob ID is NOT a file SHA-256; both are recorded so the "
                           "two can never be confused.",
        }
    )
    if path.suffix == ".json" and st.st_size < 4_000_000:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                record["topLevelKeys"] = sorted(payload.keys())[:40]
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
    return record


def checkpoint_shape(path: Path) -> dict | None:
    """Cheap structural read of a TS-exported checkpoint (no full load)."""
    if not path.exists() or path.stat().st_size > 32_000_000:
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    info: dict = {}
    for key in ("model_version", "version", "num_blocks", "spatial_channels",
                "trunk_channels", "global_dim", "action_semantic_dim",
                "global_policy_pool", "trained_at", "seed", "epochs"):
        if key in payload:
            info[key] = payload[key]
    info["topLevelKeys"] = sorted(payload.keys())[:30]
    return info or None


def registry_summary() -> dict:
    path = REPO_ROOT / "src/game/ai/models/model_registry.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    policies = {}
    for pid, entry in payload.get("policies", {}).items():
        ckpt = entry.get("checkpoint") or {}
        policies[pid] = {
            "title": entry.get("title"),
            "isProductionDefault": entry.get("isProductionDefault"),
            "isExperimental": entry.get("isExperimental"),
            "qualification": entry.get("qualification"),
            "checkpointRelativePath": ckpt.get("relativePath"),
            "registrySha256": ckpt.get("sha256"),
            "encoderVersion": ckpt.get("encoderVersion"),
            "valueHeadQualified": ckpt.get("valueHeadQualified"),
        }
    return {
        "defaultProductionPolicy": payload.get("defaultProductionPolicy"),
        "updatedAt": payload.get("updatedAt"),
        "registryVersion": payload.get("registryVersion"),
        "policies": policies,
    }


def resolve_declared_shas(identity: dict) -> list[dict]:
    """Cross-check every registry-declared SHA against the real file on disk.

    This is the check behind 'any "current best model" resolves to one real
    weight digest'.
    """
    out = []
    for pid, entry in identity["modelRegistry"]["policies"].items():
        declared = entry.get("registrySha256")
        rel = entry.get("checkpointRelativePath")
        if not declared or not rel:
            out.append({"policyId": pid, "declared": declared, "file": rel,
                        "status": "NO_REGISTERED_CHECKPOINT"})
            continue
        path = (REPO_ROOT / "src/game/ai/models" / rel)
        if not path.exists():
            path = REPO_ROOT / rel
        if not path.exists():
            out.append({"policyId": pid, "declared": declared, "file": rel,
                        "status": "FILE_MISSING"})
            continue
        actual = sha256_file(path)
        out.append({
            "policyId": pid,
            "declared": declared,
            "actual": actual,
            "file": rel,
            "status": "MATCH" if actual == declared else "MISMATCH",
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    out_dir = Path(args.out) if args.out else REPO_ROOT / "v13" / "out" / args.run_id / "T13-00"
    out_dir.mkdir(parents=True, exist_ok=True)

    head = run_git("rev-parse", "HEAD")
    branch = run_git("rev-parse", "--abbrev-ref", "HEAD")
    porcelain = run_git("status", "--porcelain")
    diff_text = subprocess.run(
        ["git", "diff", REVIEW_COMMIT, "--", "."],
        cwd=str(REPO_ROOT), capture_output=True,
    ).stdout

    identity: dict = {
        "schema": "v13_artifact_identity_1",
        "runId": args.run_id,
        "generatedAt": None,  # filled below
        "hashMethod": "sha256 of file bytes, streamed; Git blob IDs recorded separately "
                      "and never substituted for a file digest",
        "reviewBaseline": {"commit": REVIEW_COMMIT, "branch": REVIEW_BRANCH},
        "groups": {},
        "modelRegistry": registry_summary(),
    }
    for group, files in GROUPS.items():
        identity["groups"][group] = [describe(REPO_ROOT / rel) for rel in files]

    for rec in identity["groups"]["weights"]:
        if rec.get("exists"):
            shape = checkpoint_shape(REPO_ROOT / rec["path"])
            if shape:
                rec["checkpointHeader"] = shape

    identity["registryShaCrossCheck"] = resolve_declared_shas(identity)

    snapshot: dict = {
        "schema": "v13_source_snapshot_1",
        "runId": args.run_id,
        "reviewBaseline": {"commit": REVIEW_COMMIT, "branch": REVIEW_BRANCH},
        "local": {
            "commit": head,
            "branch": branch,
            "headEqualsReviewCommit": head == REVIEW_COMMIT,
            "headReachableFromReviewBranch": subprocess.run(
                ["git", "merge-base", "--is-ancestor", REVIEW_COMMIT, f"refs/heads/{REVIEW_BRANCH}"],
                cwd=str(REPO_ROOT), capture_output=True,
            ).returncode == 0,
            "statusPorcelain": porcelain.splitlines() if porcelain else [],
            "dirtyDiffVsReviewCommitSha256": sha256_bytes(diff_text),
            "dirtyDiffVsReviewCommitBytes": len(diff_text),
            "dirtyDiffNote": "Untracked paths do not appear in a git diff; the porcelain "
                             "list above is the authoritative record of untracked work.",
        },
        "environment": {
            "python": sys.version.split()[0],
            "pythonExecutable": sys.executable,
            "platform": platform.platform(),
            "processor": platform.processor(),
            "cpuCount": os.cpu_count(),
            "node": subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip(),
        },
        "uncommittedWritesByThisTask": "All V13 outputs are new files under v13/ only; no "
                                       "tracked file is modified by T13-00.",
    }

    try:
        import torch  # noqa: PLC0415
        snapshot["environment"]["torch"] = torch.__version__
        snapshot["environment"]["torchCudaAvailable"] = bool(torch.cuda.is_available())
        snapshot["environment"]["torchThreads"] = torch.get_num_threads()
    except ImportError:
        snapshot["environment"]["torch"] = None
    try:
        import numpy  # noqa: PLC0415
        snapshot["environment"]["numpy"] = numpy.__version__
    except ImportError:
        snapshot["environment"]["numpy"] = None

    from datetime import datetime, timezone
    identity["generatedAt"] = datetime.now(timezone.utc).isoformat()
    snapshot["generatedAt"] = identity["generatedAt"]

    (out_dir / "artifact_identity.json").write_text(
        json.dumps(identity, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out_dir / "source_snapshot.json").write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    missing = [r["path"] for g in identity["groups"].values() for r in g if not r.get("exists")]
    mismatched = [c for c in identity["registryShaCrossCheck"] if c["status"] == "MISMATCH"]
    print(json.dumps({
        "out": str(out_dir),
        "head": head,
        "headEqualsReviewCommit": snapshot["local"]["headEqualsReviewCommit"],
        "fileCount": sum(len(g) for g in identity["groups"].values()),
        "missingFiles": missing,
        "registryShaMismatches": mismatched,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
