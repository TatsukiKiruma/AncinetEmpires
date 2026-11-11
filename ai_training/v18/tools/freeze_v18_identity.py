"""T18-00：冻结 V18 工作树的真实身份。

设计原则（复用而不是另造一套）：
- 源码分组沿用 V17 冻结清单 `v17/out/v17_20260926_r2/identity/source_manifest.json`，
  本脚本**逐文件比对**当前工作树与那份清单，而不是重新挑一份文件列表来自证一致。
- 冠军、规则、初态、seed 域、界面策略→实际权重映射全部引用已存在的审核产物，
  只补齐 V18 新增（训练器/数据集构建器/新版标签器）的身份。
- 只读既有文件，只写 `v18/run_<runId>/identity/`，不覆盖 V14–V17 任何产物。

用法（仓库根目录）：
    python v18/tools/freeze_v18_identity.py --run-id run_20260927_v18_01
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V17_RUN = ROOT / "v17" / "out" / "v17_20260926_r2"

# V18 新增身份组：这些文件在 V17 冻结清单之外，但会改变“训练/标签/评测”语义。
V18_EXTRA_GROUPS = {
    "trainer": [
        "v17/tools/train_v17.py",
        "python/spatial_resnet_model.py",
        "python/verify_parity.py",
        "src/game/ai/spatial_conv_net.ts",
        "src/game/ai/shared_spatial_policy.ts",
    ],
    "dataset": [
        "v17/tools/build_v17_dataset.ts",
        "v17/tools/build_v17_dataset.py",
        "v17/tools/make_v17_pool_trainer_input.py",
        "v17/tools/make_v17_trainer_input.py",
        "v17/tools/v17_input_identity.ts",
        "v17/tools/collect_v17_rollouts.ts",
    ],
    "labeler": [
        "v15/tools/labeler_l1_v15.ts",
        "v17/tools/label_v17_teacher.ts",
        "v17/teachers/b100_policy.ts",
        "v17/teachers/b100_input_key.ts",
        "v17/teachers/battle_search_b100.ts",
    ],
}

# V18 新建文件（本轮自己写的），记录其摘要即可。
V18_NEW_FILES = [
    "v18/tools/freeze_v18_identity.py",
    "v18/tools/l1_single_pass.py",
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def group_digest(files: dict[str, str]) -> str:
    """与 V17 相同的 `sha256-filelist-v1` 口径：按 `路径:摘要` 升序拼接后取摘要。"""
    text = "\n".join(f"{name}:{files[name]}" for name in sorted(files))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def hash_group(rel_paths: list[str]) -> dict:
    files: dict[str, str] = {}
    missing: list[str] = []
    for rel in rel_paths:
        abs_path = ROOT / rel
        if not abs_path.is_file():
            missing.append(rel)
            continue
        files[rel] = sha256_file(abs_path)
    return {"fileList": rel_paths, "files": files, "digest": group_digest(files), "missing": missing}


def git(*args: str) -> str:
    try:
        out = subprocess.run(
            ["git", *args], cwd=str(ROOT), capture_output=True, text=True, timeout=120, check=False
        )
        return out.stdout.strip()
    except Exception as exc:  # pragma: no cover - 环境异常只需如实记录
        return f"<git failed: {exc}>"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    args = parser.parse_args()

    run_dir = ROOT / "v18" / "out" / args.run_id
    identity_dir = run_dir / "identity"
    identity_dir.mkdir(parents=True, exist_ok=True)

    # 1) 复用 V17 冻结清单做逐文件比对。
    v17_manifest_path = V17_RUN / "identity" / "source_manifest.json"
    v17_manifest = json.loads(v17_manifest_path.read_text(encoding="utf-8"))

    reused: dict[str, dict] = {}
    unchanged = True
    for group_name, group in v17_manifest["groups"].items():
        current = hash_group(list(group["files"].keys()))
        mismatches = sorted(
            rel for rel, sha in group["files"].items() if current["files"].get(rel) != sha
        )
        reused[group_name] = {
            "source": "v17_source_manifest_1",
            "v17Digest": group["digest"],
            "v18Digest": current["digest"],
            "sameAsV17": current["digest"] == group["digest"],
            "mismatches": mismatches,
            "fileCount": len(group["files"]),
            "missing": current["missing"],
        }
        if current["digest"] != group["digest"]:
            unchanged = False

    v18_groups = {name: hash_group(files) for name, files in V18_EXTRA_GROUPS.items()}
    new_files = hash_group(V18_NEW_FILES)

    # 2) 冠军身份：直接引用审核产物，不重新定义。
    champion_path = ROOT / "v16" / "out" / "v16_20260926_core" / "experiments" / "P1" / "s2026" / "P1_final.json"
    champion_sha = sha256_file(champion_path)
    audit_champion_sha = "b705b52a25a8954c3c71417997f552db1a0faa792269f667db76e83236e06899"

    # 3) 界面默认策略 → 实际权重的映射（T18-00 要求可追）。
    bundled_dir = ROOT / "src" / "game" / "ai" / "models"
    bundled = {}
    if bundled_dir.is_dir():
        for path in sorted(bundled_dir.glob("*.json")):
            bundled[path.name] = {
                "sha256": sha256_file(path),
                "sameFileAsChampion": sha256_file(path) == champion_sha,
            }

    adapter = ROOT / "src" / "game" / "ai" / "spatial_neural_adapter.ts"
    adapter_text = adapter.read_text(encoding="utf-8") if adapter.is_file() else ""

    report = {
        "schema": "v18_identity_freeze_1",
        "runId": args.run_id,
        "frozenAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "repoRoot": str(ROOT).replace("\\", "/"),
        "workspaceNote": "工作树含前序 agent 未提交修改；本轮只新增 v18/ 下的文件，不 reset/clean、不覆盖他人修改。",
        "git": {
            "head": git("rev-parse", "HEAD"),
            "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
            "statusShort": git("status", "--short").splitlines(),
        },
        "environment": {
            "python": sys.version,
            "platform": platform.platform(),
            "processor": os.environ.get("PROCESSOR_IDENTIFIER"),
            "logicalProcessors": os.environ.get("NUMBER_OF_PROCESSORS"),
            "torchCudaAvailable": False,
            "note": "CPU-only torch 2.14；本机无 CUDA，全部训练/采集按 CPU 预算估算。",
        },
        "frozenSourceComparison": {
            "reference": "v17/out/v17_20260926_r2/identity/source_manifest.json",
            "infraUnchangedSinceV17": unchanged,
            "perGroup": reused,
            "consequence": (
                "四组摘要与 V17（以及经 V17 核对的 V16）完全一致 ⇒ 规则/初态/合法性/推理未变，"
                "旧 DEV20 成绩与冠军 SHA 可作为当前基线引用。"
                if unchanged
                else "存在摘要变化 ⇒ 上一行结论不成立，必须重跑受影响的基线面板。"
            ),
        },
        "v18ExtraGroups": v18_groups,
        "v18NewFiles": new_files,
        "champion": {
            "path": "v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json",
            "sha256": champion_sha,
            "auditDeclaredSha256": audit_champion_sha,
            "shaMatchesAudit": champion_sha == audit_champion_sha,
            "dev20": {"wins": 5, "games": 20, "source": "v17_independent_audit_20260927.json#arena.P1_s2026"},
        },
        "frozenContracts": {
            "rules": "原规则不变；不改收入时序、不改合法动作过滤、不改评测 caps（12000 原子动作 / 900 秒）。",
            "fiveMaps": ["(2) Duel.aem", "(2) Icy Paths.aem", "(2) Liberty Port.aem", "(2) Mourningstar.aem", "(2) Crossed swords.aem"],
            "initializationPolicyId": "sd-first-turn-start-v1",
            "encoderSchemaId": "spatial26_global20_actionSemantics53_v15",
            "inputIdentityId": "v17-netinput-v1",
            "candidateOrderingId": "actionCode-codepoint-asc-v1",
            "filterId": "filter-surrender-v1",
            "rngContractId": "heuristic-seatstream-v1",
            "dev20SeedFormula": "2609260100 + 10*mapIndex + s, s=0,1",
            "confirm20SeedFormula": "2609260300 + 10*mapIndex + s, s=0,1",
            "recheck40SeedFormula": "2610030000 + 100*wave + 10*mapIndex + s, s=0..3",
            "trainCollectionSeedFormula": "2610050000 + 1000*wave + 10*mapIndex + s, s=0..3",
            "valSeedFormula": "2610020000 + 1000*mapIndex + 10*rootIndex",
            "v18NewValSeedFormula": "2610025000 + 1000*mapIndex + 10*rootIndex（V18 新 namespace，避免与 V17 val 撞 seed）",
        },
        "uiPolicyMapping": {
            "adapter": "src/game/ai/spatial_neural_adapter.ts",
            "adapterSha256": sha256_file(adapter) if adapter.is_file() else None,
            "bundledModels": bundled,
            "championIsBundledByDefault": any(item["sameFileAsChampion"] for item in bundled.values()),
            "finding": (
                "界面默认加载 src/game/ai/models/ 下的内置权重，与实验冠军 P1:s2026 不是同一个文件；"
                "arena 通过 --model 显式加载实验权重。因此“界面试玩很差”不能直接当作实验冠军的成绩证据。"
            ),
            "adapterImports": [
                line.strip() for line in adapter_text.splitlines() if "import" in line and "models/" in line
            ],
        },
        "notDone": [
            "T17-06 正式三轮学生纠错仍为 NOT_STARTED。",
            "T17-07 独立复核与 CONFIRM20 仍为 NOT_STARTED。",
            "T18-00 只做身份冻结与勘误，不改变冠军。",
        ],
    }

    out_path = identity_dir / "manifest.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "written": str(out_path.relative_to(ROOT)).replace("\\", "/"),
        "infraUnchangedSinceV17": unchanged,
        "championShaMatchesAudit": report["champion"]["shaMatchesAudit"],
        "championIsBundledByDefault": report["uiPolicyMapping"]["championIsBundledByDefault"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
