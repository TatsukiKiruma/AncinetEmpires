"""V19/T19-00.1：冻结 V19 的真实起点身份（复用审核证据，不重做全部历史审计）。

设计原则：
- **复用而不是另造一套**。源码分组沿用 `v17/out/v17_20260926_r2/identity/source_manifest.json`
  的冻结清单，逐文件比对当前工作树；再与 V18 的冻结清单比对，判断 V18 之后是否漂移。
- 只记录**已存在的**审核证据（V18 复核报告、audit_v18.json、rules_and_encoding_probe.json），
  不重新定义冠军、规则或初态。
- 只写 `v19/out/<runId>/identity/manifest.json`，不覆盖 V14–V18 任何产物。

用法（仓库根目录）：
    python v19/tools/freeze_v19_identity.py --run-id run_20260928_v19_01
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
V18_RUN = ROOT / "v18" / "out" / "run_20260927_v18_01"

# V19 新增/修改的身份组：这些文件会改变「表示 / 训练 / 评测」语义，必须单独冻结。
V19_GROUPS = {
    "trainer": [
        "v17/tools/train_v17.py",
        "python/spatial_resnet_model.py",
    ],
    "representation": [
        "src/game/ai/spatial_tensor_encoder.ts",
        "src/game/ai/spatial_conv_net.ts",
        "src/game/ai/shared_spatial_policy.ts",
    ],
    "eval_contract": [
        "v16/tools/eval_v16_protocol.ts",
        "v14/tools/eval_v14_match.ts",
    ],
}

# V19 本轮新建文件（记录其摘要，便于第三方核对「改了什么」）。
V19_NEW_FILES = [
    "v19/tools/freeze_v19_identity.py",
    "v19/scripts/t19_00_checkpoint_hook_smoke.ps1",
    "v19/scripts/run_panel_sharded_v19.ps1",
]

# T19-00 要复核的既有候选（V18 U/K 的 best，选于 510 更新）。
REEVAL_TARGETS = [
    {
        "key": "T18_04_w1_U_best",
        "path": "v18/out/run_20260927_v18_01/experiments/T18_04_w1_U/U_best.json",
        "origin": "V18/T18-04 U 臂 best（epoch2，约 510 更新）",
    },
    {
        "key": "T18_04_w1_K_best",
        "path": "v18/out/run_20260927_v18_01/experiments/T18_04_w1_K/K_best.json",
        "origin": "V18/T18-04 K 臂 best（epoch2，约 510 更新）",
    },
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
    parser.add_argument("--run-id", default="run_20260928_v19_01")
    args = parser.parse_args()

    identity_dir = ROOT / "v19" / "out" / args.run_id / "identity"
    identity_dir.mkdir(parents=True, exist_ok=True)

    # 1) 与 V17 冻结清单逐文件比对（引擎/策略/H0/runner 四组）。
    v17_manifest = json.loads((V17_RUN / "identity" / "source_manifest.json").read_text(encoding="utf-8"))
    vs_v17: dict[str, dict] = {}
    unchanged_since_v17 = True
    for group_name, group in v17_manifest["groups"].items():
        current = hash_group(list(group["files"].keys()))
        mismatches = sorted(
            rel for rel, sha in group["files"].items() if current["files"].get(rel) != sha
        )
        vs_v17[group_name] = {
            "reference": "v17_source_manifest_1",
            "v17Digest": group["digest"],
            "currentDigest": current["digest"],
            "sameAsV17": current["digest"] == group["digest"],
            "mismatches": mismatches,
            "fileCount": len(group["files"]),
            "missing": current["missing"],
        }
        if current["digest"] != group["digest"]:
            unchanged_since_v17 = False

    # 2) 与 V18 冻结清单比对（V18 之后是否漂移）。
    v18_manifest_path = V18_RUN / "identity" / "manifest.json"
    vs_v18: dict[str, object] = {"reference": None}
    if v18_manifest_path.is_file():
        v18_manifest = json.loads(v18_manifest_path.read_text(encoding="utf-8"))
        per_group: dict[str, dict] = {}
        unchanged_since_v18 = True
        for group_name, entry in v18_manifest["frozenSourceComparison"]["perGroup"].items():
            current = hash_group(list(entry.get("mismatches", [])) or [])
            # 直接按 V17 清单里的文件列表重算，与 V18 记录的 v18Digest 对比。
            v17_group_files = list(v17_manifest["groups"][group_name]["files"].keys())
            cur = hash_group(v17_group_files)
            same = cur["digest"] == entry.get("v18Digest")
            per_group[group_name] = {
                "v18Digest": entry.get("v18Digest"),
                "currentDigest": cur["digest"],
                "sameAsV18": same,
            }
            if not same:
                unchanged_since_v18 = False
        vs_v18 = {
            "reference": "v18/out/run_20260927_v18_01/identity/manifest.json",
            "unchangedSinceV18": unchanged_since_v18,
            "perGroup": per_group,
        }

    # 3) V19 新增组与本轮新文件。
    v19_groups = {name: hash_group(files) for name, files in V19_GROUPS.items()}
    v19_new_files = hash_group(V19_NEW_FILES)

    # 4) 冠军身份：直接引用审核产物与文件本身。
    champion_rel = "v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json"
    champion_path = ROOT / champion_rel
    champion_sha = sha256_file(champion_path)
    audit_champion_sha = "b705b52a25a8954c3c71417997f552db1a0faa792269f667db76e83236e06899"

    # 5) 界面内置权重 → 与冠军是否同文件（T19-08 验收要用真实 SHA 核对）。
    bundled_dir = ROOT / "src" / "game" / "ai" / "models"
    bundled: dict[str, dict] = {}
    if bundled_dir.is_dir():
        for path in sorted(bundled_dir.glob("*.json")):
            sha = sha256_file(path)
            bundled[path.name] = {"sha256": sha, "sameFileAsChampion": sha == champion_sha}

    # 6) 补评目标身份。
    reeval = []
    for target in REEVAL_TARGETS:
        p = ROOT / target["path"]
        reeval.append({
            **target,
            "exists": p.is_file(),
            "sha256": sha256_file(p) if p.is_file() else None,
        })

    # 7) T19-00 两项工程修复的自证产物。
    hook_verification = ROOT / "v19" / "out" / args.run_id / "hook_smoke" / "hook_verification.json"
    t19_00 = {
        "checkpointHook": {
            "file": "v17/tools/train_v17.py",
            "sha256": sha256_file(ROOT / "v17" / "tools" / "train_v17.py"),
            "evidence": str(hook_verification.relative_to(ROOT)).replace("\\", "/")
            if hook_verification.is_file() else None,
            "evidencePresent": hook_verification.is_file(),
        },
        "schemaFixture": {
            "file": "src/game/ai/spatial_conv_net.ts",
            "sha256": sha256_file(ROOT / "src" / "game" / "ai" / "spatial_conv_net.ts"),
            "fix": "createInitializedSpatialResNet 现在声明 encoderSchemaId 并按 schema 推导形状；"
                   "不取消 schema 校验，历史权重仍由 loadSpatialResNetFromJson 显式兼容。",
        },
    }

    report = {
        "schema": "v19_identity_freeze_1",
        "runId": args.run_id,
        "frozenAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "repoRoot": str(ROOT).replace("\\", "/"),
        "workspaceNote": "工作树含 V14–V18 前序 agent 未提交修改；本轮不 reset/clean、不覆盖其产物，"
                         "只新增 v19/ 下文件并做 T19-00 明确授权的两处修复。",
        "git": {
            "head": git("rev-parse", "HEAD"),
            "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
            "statusShort": git("status", "--short").splitlines(),
        },
        "environment": {
            "python": sys.version,
            "platform": platform.platform(),
            "logicalProcessors": os.environ.get("NUMBER_OF_PROCESSORS"),
            "note": "CPU-only torch；本机无 CUDA，全部训练/采集按 CPU 预算估算。",
        },
        "frozenSourceComparison": {
            "infraUnchangedSinceV17": unchanged_since_v17,
            "vsV17": vs_v17,
            "vsV18": vs_v18,
            "consequence": (
                "引擎/策略/H0/runner 四组摘要与 V17 完全一致 ⇒ 规则、初态、合法性过滤、"
                "推理入口与 H0 未变，旧 DEV20 与冠军 SHA 可作为当前基线引用。"
                if unchanged_since_v17
                else "存在摘要变化 ⇒ 上一条结论不成立，必须重跑受影响的基线面板。"
            ),
        },
        "v19Groups": v19_groups,
        "v19NewFiles": v19_new_files,
        "champion": {
            "path": champion_rel,
            "sha256": champion_sha,
            "auditDeclaredSha256": audit_champion_sha,
            "shaMatchesAudit": champion_sha == audit_champion_sha,
            "dev20": {"wins": 5, "games": 20, "source": "v18/V18_REVIEW_AND_RULES.md §1"},
            "status": "当前冠军；未被 V18 替换",
        },
        "reevaluationTargets": reeval,
        "t19_00": t19_00,
        "frozenContracts": {
            "rules": "原规则不变；不改收入时序、不改合法动作过滤、不改评测 caps（12000 原子动作 / 900 秒）。",
            "fiveMaps": ["(2) Duel.aem", "(2) Icy Paths.aem", "(2) Liberty Port.aem",
                         "(2) Mourningstar.aem", "(2) Crossed swords.aem"],
            "initializationPolicyId": "sd-first-turn-start-v1",
            "encoderSchemaId": "spatial26_global20_actionSemantics53_v15",
            "candidateOrderingId": "actionCode-codepoint-asc-v1",
            "filterId": "filter-surrender-v1",
            "rngContractId": "heuristic-seatstream-v1",
            "capsId": "v16-student-caps-12k-900s-v2",
            "dev20SeedFormula": "2609260100 + 10*mapIndex + s, s=0,1",
            "confirm20SeedFormula": "2609260300 + 10*mapIndex + s, s=0,1",
            "recheck40SeedFormula": "2610030000 + 100*wave + 10*mapIndex + s, s=0..3",
            "fresh40SeedFormula": "V19 新增命名空间；具体公式在 T19-03/04 冻结后写入，"
                                  "必须与训练、DEV20、RECHECK40 命名空间分离",
        },
        "uiPolicyMapping": {
            "bundledModels": bundled,
            "championIsBundledByDefault": any(v["sameFileAsChampion"] for v in bundled.values()),
            "finding": "界面默认加载 src/game/ai/models/ 下的内置权重，与实验冠军 P1:s2026 不是同一个文件；"
                       "T19-08 必须显式核对 UI 推理路径与 arena 权重一致。",
        },
        "notDone": [
            "T19-00.2 U_best/K_best 的 DEV20 补评在补评任务启动时仍未回填胜场。",
            "T19-01/02 的新 schema 与训练环境尚未实现。",
            "总目标（同一纯网络五图 20 局至少 18 次自然胜利）未达成。",
        ],
        "statusVocabulary": {
            "STAGE_COMPLETE": "某一阶段（例如 T19-00）交付完成，不等于棋力提升或总目标完成",
            "RECIPE_STOPPED": "某配方经连续复核无改善，按计划停用并保留最好模型",
            "BUDGET_EXHAUSTED": "预算用完但总目标未达成，必须同时写 OBJECTIVE_NOT_MET",
            "OBJECTIVE_COMPLETE": "仅当 CONFIRM20 达到 18 次自然胜利且逐局证据齐全时使用",
        },
    }

    out_path = identity_dir / "manifest.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "written": str(out_path.relative_to(ROOT)).replace("\\", "/"),
        "infraUnchangedSinceV17": unchanged_since_v17,
        "unchangedSinceV18": vs_v18.get("unchangedSinceV18"),
        "championShaMatchesAudit": report["champion"]["shaMatchesAudit"],
        "championIsBundledByDefault": report["uiPolicyMapping"]["championIsBundledByDefault"],
        "hookEvidencePresent": t19_00["checkpointHook"]["evidencePresent"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
