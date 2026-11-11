"""V15/T15-05：为「真正 128 个训练状态」train-only 诊断准备固定可恢复任务。

任务书 §6「小样本诊断的复用与触发」要求本轮做**一次** seed 42、真正 128 个训练状态的
train-only 回归，并写清数据来源。本脚本把来源固定成可复算的两步：

1. 从 `v15/out/v15_20260925_core/T15-04/dataset_v15.jsonl`（T15-04 冻结数据，V15 schema
   + L1 标签）取 128 行满足以下条件的 train 行：
   - `partition == 'train'`；
   - `policyInputKey` 在本 128 行内唯一（同一输入配不同标签会使「128/128」在原理上不可达，
     与网络可拟合性无关，必须显式排除并记录被跳过的行）；
   - `policyLossMask is True`。
   取样按 **rootFamilyId 轮转**（首次出现顺序，每族取第 k 行），而不是直接取文件前 128 行 ——
   冻结数据按归档行序排列，前 128 行会全部落在同一个 root 家族里，会使诊断退化成单局面记忆，
   无法与 V14「128 状态 / 41 家族」的读数对照。轮转规则完全确定、可复算。
   选中的 128 行按**原始字节**（逐行文本）写入 `tiny_fit_v15_input.jsonl`，不做任何重编码。

2. 从原始快照归档 `v14/out/v14_20260924_t14/T14-02/raw/decisions.jsonl` 按
   `sourceRowIndex` 取回每行的**完整 state 快照**，写入 `tiny_fit_v15_states.jsonl`，
   供 TS 侧经真实 `predictSpatialAction`（shared policy）重评使用。
   同时核对归档 stateHash（decisions 行的 `stateHash`）与数据集行的 `archivedStateHash`。

设计约束（V15b 审核教训）：
- 不用「最后一行当验证占位」；诊断模式由训练器 `--train-only` 明确承担，128 行全部进入优化。
- 本脚本只做数据搬运与身份核对，不重新编码、不重打标签；因此 V15 输入语义完全继承 T15-04。

用法：
    python v15/tools/tiny_fit_v15_prepare.py --out-dir v15/out/v15_20260925_core/T15-05/tiny_fit
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parents[2]

DATASET_PATH = REPO_ROOT / "v15" / "out" / "v15_20260925_core" / "T15-04" / "dataset_v15.jsonl"
DECISIONS_PATH = REPO_ROOT / "v14" / "out" / "v14_20260924_t14" / "T14-02" / "raw" / "decisions.jsonl"
V14_ACCEPTANCE = REPO_ROOT / "v14" / "out" / "v14_20260925_t14b" / "T14-04" / "tiny_fit_acceptance.json"
V14_SPLIT_MANIFEST = REPO_ROOT / "v14" / "out" / "v14_20260925_t14b" / "T14-04" / "tiny_fit_split_manifest.json"

TARGET_STATES = 128


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def select_dataset_rows(path: Path, target: int) -> (List[Dict[str, Any]], List[Dict[str, Any]]):
    """跨 rootFamilyId 轮转取样；返回 (选中行, 跳过行)。

    逐行读取，保留原始文本以便字节级复制。轮转规则：
    - 第一遍按文件顺序把每个 rootFamilyId 的行收进各自的桶；
    - 第 k 轮从每个家族（首次出现顺序）取它的第 k 行；
    - 期间跳过 policyLossMask=False 与 policyInputKey 重复的行，并记录原因。
    """
    per_family: Dict[str, List[Dict[str, Any]]] = {}
    family_order: List[str] = []
    skipped: List[Dict[str, Any]] = []
    line_index = 0
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            dataset_line_index = line_index
            line_index += 1
            row = json.loads(line)
            if row.get("partition") != "train":
                continue
            if row.get("policyLossMask") is not True:
                skipped.append({"datasetLineIndex": dataset_line_index, "reason": "POLICY_LOSS_MASK_FALSE"})
                continue
            # 注意：**不能**把数据集文件里的物理行号当成归档行号。
            # T15-04 只写入通过校验的行（9547 → 9103），因此 `sourceRowIndex`
            # （decisions.jsonl 的行号）严格大于等于文件物理行号。用错会导致取回
            # 另一条快照而 rootFamilyId/stateHash 张冠李戴（本脚本首版即踩过）。
            archive_row_index = row.get("sourceRowIndex")
            if not isinstance(archive_row_index, int):
                skipped.append({"datasetLineIndex": dataset_line_index, "reason": "MISSING_SOURCE_ROW_INDEX"})
                continue
            family = str(row.get("rootFamilyId"))
            if family not in per_family:
                per_family[family] = []
                family_order.append(family)
            per_family[family].append({
                "datasetLineIndex": dataset_line_index,
                "archiveRowIndex": archive_row_index,
                "rawLine": line if line.endswith("\n") else line + "\n",
                "row": row,
            })

    selected: List[Dict[str, Any]] = []
    seen_keys: Dict[str, int] = {}
    round_index = 0
    while len(selected) < target:
        progressed = False
        for family in family_order:
            bucket = per_family[family]
            if round_index >= len(bucket):
                continue
            progressed = True
            entry = bucket[round_index]
            key = entry["row"].get("policyInputKey")
            if key in seen_keys:
                skipped.append({
                    "datasetLineIndex": entry["datasetLineIndex"],
                    "archiveRowIndex": entry["archiveRowIndex"],
                    "reason": "DUPLICATE_POLICY_INPUT_KEY",
                    "policyInputKey": key,
                    "firstSeenDatasetLineIndex": seen_keys[key],
                })
                continue
            seen_keys[key] = entry["datasetLineIndex"]
            selected.append(entry)
            if len(selected) >= target:
                break
        if not progressed:
            break
        round_index += 1
    return selected, skipped


def fetch_states(archive_row_indices: List[int]) -> Dict[int, Dict[str, Any]]:
    """按**归档行号**从 decisions.jsonl 取回完整 state 快照（只保留需要的行）。"""
    wanted = set(archive_row_indices)
    out: Dict[int, Dict[str, Any]] = {}
    index = 0
    with DECISIONS_PATH.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            if index in wanted:
                record = json.loads(line)
                out[index] = {
                    "state": record["state"],
                    "archivedStateHash": record.get("stateHash"),
                    "rootFamilyId": record.get("rootFamilyId"),
                    "partition": record.get("partition"),
                    "stepIndex": record.get("stepIndex"),
                    "legalActionCodes": record.get("legalActionCodes"),
                    "policyAllowedActionCodes": record.get("policyAllowedActionCodes"),
                    "labelActionCode": record.get("labelActionCode"),
                }
                if len(out) == len(wanted):
                    break
            index += 1
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--target-states", type=int, default=TARGET_STATES)
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for required in (DATASET_PATH, DECISIONS_PATH):
        if not required.exists():
            print(f"[T15-05] 缺少必需输入：{required}", file=sys.stderr)
            return 2

    selected, skipped = select_dataset_rows(DATASET_PATH, args.target_states)
    if len(selected) != args.target_states:
        print(f"[T15-05] 只选到 {len(selected)}/{args.target_states} 行 train 唯一输入", file=sys.stderr)
        return 3

    input_path = out_dir / "tiny_fit_v15_input.jsonl"
    # V15/T15-05 发现的接口缺口（不修改公共实现，只在本脚本内做显式字段适配）：
    # T15-04 的 dataset_v15.jsonl 把候选语义写在 `semantics_padded`，
    # 而 T15-03 的训练器 SpatialDataset 只读 `candidateActions[].semantics`
    # （python/train_spatial_resnet.py:272/281），于是语义维度被推断成 0 并直接报错：
    #   ValueError: 数据集动作语义维度 0 不在 spatial-resnet-v2 支持的 [32, 53] 内
    # 这里把每个候选的 `semantics_padded` **逐元素复制**到 `semantics`（数值完全不变，
    # 仍保留 `semantics_padded` 以便追溯），其余字段不重新计算。
    alias_added = 0
    alias_mismatch = 0
    with input_path.open("w", encoding="utf-8", newline="\n") as handle:
        for entry in selected:
            row = entry["row"]
            for candidate in row.get("candidateActions", []):
                if "semantics" in candidate:
                    if list(candidate["semantics"]) != list(candidate.get("semantics_padded") or []):
                        alias_mismatch += 1
                    continue
                candidate["semantics"] = list(candidate.get("semantics_padded") or [])
                alias_added += 1
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    indices = [entry["archiveRowIndex"] for entry in selected]
    states = fetch_states(indices)
    missing = [i for i in indices if i not in states]
    if missing:
        print(f"[T15-05] 归档中缺少 {len(missing)} 行的 state 快照：{missing[:5]}", file=sys.stderr)
        return 4

    states_path = out_dir / "tiny_fit_v15_states.jsonl"
    hash_mismatch: List[Dict[str, Any]] = []
    action_type_counts: Dict[str, int] = {}
    family_set = set()
    candidate_counts: List[int] = []
    with states_path.open("w", encoding="utf-8", newline="\n") as handle:
        for entry in selected:
            row = entry["row"]
            index = entry["archiveRowIndex"]
            archived = states[index]
            if archived["archivedStateHash"] != row.get("archivedStateHash"):
                hash_mismatch.append({
                    "datasetLineIndex": entry["datasetLineIndex"],
                    "archiveRowIndex": index,
                    "datasetArchivedStateHash": row.get("archivedStateHash"),
                    "decisionsStateHash": archived["archivedStateHash"],
                })
            if archived["rootFamilyId"] != row.get("rootFamilyId"):
                hash_mismatch.append({
                    "datasetLineIndex": entry["datasetLineIndex"],
                    "archiveRowIndex": index,
                    "kind": "ROOT_FAMILY_MISMATCH",
                    "datasetRootFamilyId": row.get("rootFamilyId"),
                    "decisionsRootFamilyId": archived["rootFamilyId"],
                })
            action_type = str(row.get("targetActionCode", "")).split(":")[0]
            action_type_counts[action_type] = action_type_counts.get(action_type, 0) + 1
            family_set.add(row.get("rootFamilyId"))
            candidate_counts.append(len(row.get("candidateActionCodes") or []))
            handle.write(json.dumps({
                "sampleId": row.get("sampleId"),
                "datasetLineIndex": entry["datasetLineIndex"],
                "sourceRowIndex": index,
                "rootFamilyId": row.get("rootFamilyId"),
                "partition": row.get("partition"),
                "actingPlayerId": row.get("actingPlayerId"),
                "subjectAllianceId": row.get("subjectAllianceId"),
                "playerCount": row.get("playerCount"),
                "mapName": row.get("mapName"),
                "encoderSchemaId": row.get("encoderSchemaId"),
                "stateHash": row.get("stateHash"),
                "archivedStateHash": archived["archivedStateHash"],
                "policyInputKey": row.get("policyInputKey"),
                "candidateActionCodes": row.get("candidateActionCodes"),
                "engineLegalActionCodes": row.get("engineLegalActionCodes"),
                "policyAllowedActionCodes": row.get("policyAllowedActionCodes"),
                "targetActionCode": row.get("targetActionCode"),
                "targetActionIndex": row.get("targetActionIndex"),
                "state": archived["state"],
            }, ensure_ascii=False) + "\n")

    config = {
        "schema": "v15_tiny_fit_config_1",
        "task": "T15-05",
        "runId": "v15_20260925_core",
        "purpose": "任务书 §6：一次 seed 42、真正 128 个训练状态的 train-only 回归（≥127/128 且训练 CE<0.05）。",
        "diagnostic": True,
        "dataSource": {
            "chosen": "dataset_v15.jsonl（T15-04 冻结 V15 schema + L1 标签数据）前 128 行满足条件的 train 行",
            "datasetPath": str(DATASET_PATH.relative_to(REPO_ROOT)).replace("\\", "/"),
            "datasetSha256": sha256_file(DATASET_PATH),
            "selectionRule": "按 rootFamilyId 轮转（首次出现顺序，每轮取各族第 k 行）取 128 行 partition=train、"
                             "policyLossMask=true、policyInputKey 互不重复的行；"
                             "按原始字节复制，不重编码、不重打标签。",
            "stateArchive": str(DECISIONS_PATH.relative_to(REPO_ROOT)).replace("\\", "/"),
            "stateArchiveSha256": sha256_file(DECISIONS_PATH),
            "inputRowsPath": "tiny_fit_v15_input.jsonl",
            "inputRowsSha256": sha256_file(input_path),
            "fieldAliasAdaptation": {
                "reason": "训练器只读 candidateActions[].semantics，而 T15-04 数据集写的是 semantics_padded",
                "action": "为每个候选复制 semantics_padded → semantics（逐元素相同，数值不变）",
                "aliasAdded": alias_added,
                "aliasPreExistingMismatch": alias_mismatch,
                "publicDefect": "接口缺口记在 task_status.blockedOn（T15-06/正式训练同样会命中）",
            },
            "stateSnapshotsPath": "tiny_fit_v15_states.jsonl",
            "stateSnapshotsSha256": sha256_file(states_path),
            "skippedBeforeFullSelection": skipped,
            "archivedStateHashMismatches": hash_mismatch,
        },
        "v14ReferenceConfig": {},
        "v15RunConfig": {
            "trainer": "python/train_spatial_resnet.py",
            "mode": "--train-only（全部 128 行进入优化，无验证集，best 选择被禁用）",
            "modelSeed": 42,
            "dataOrderSeed": 314159,
            "batchSize": 16,
            "lr": 0.001,
            "lrSchedule": "constant",
            "weightDecay": 0.0,
            "valueWeight": 0.0,
            "numBlocks": 2,
            "trunkChannels": 32,
            "globalPolicyPool": False,
            "encoderSchemaId": "spatial26_global20_actionSemantics53_v15",
            "plannedUpdatesFirstStage": 8000,
            "plannedUpdatesMaxStage": 16000,
            "note": "仅作新 schema/数据与正常退出所需的适配；tiny 设置不得移植到正式训练。",
        },
        "coverage": {
            "trainStates": len(selected),
            "uniquePolicyInputKeys": len({entry["row"]["policyInputKey"] for entry in selected}),
            "uniqueRootFamilies": len(family_set),
            "rootFamilies": sorted(family_set),
            "targetActionTypeCounts": dict(sorted(action_type_counts.items())),
            "candidateCountMin": min(candidate_counts),
            "candidateCountMax": max(candidate_counts),
        },
    }

    if V14_ACCEPTANCE.exists():
        acceptance = json.loads(V14_ACCEPTANCE.read_text(encoding="utf-8"))
        config["v14ReferenceConfig"] = {
            "sourcePath": str(V14_ACCEPTANCE.relative_to(REPO_ROOT)).replace("\\", "/"),
            "sourceSha256": sha256_file(V14_ACCEPTANCE),
            "config": acceptance.get("config"),
            "acceptanceTarget": acceptance.get("acceptanceTarget"),
            "acceptanceRule": acceptance.get("acceptanceRule"),
            "dataOrderSeed": acceptance.get("dataOrderSeed"),
            "stageBCommand": next(
                (r["train"]["command"] for r in acceptance.get("runs", []) if r.get("modelSeed") == 42),
                None,
            ),
        }
    if V14_SPLIT_MANIFEST.exists():
        config["v14ReferenceConfig"]["splitManifest"] = {
            "sourcePath": str(V14_SPLIT_MANIFEST.relative_to(REPO_ROOT)).replace("\\", "/"),
            "sourceSha256": sha256_file(V14_SPLIT_MANIFEST),
            "rows": json.loads(V14_SPLIT_MANIFEST.read_text(encoding="utf-8")).get("rows"),
            "valPlaceholderRows": json.loads(V14_SPLIT_MANIFEST.read_text(encoding="utf-8")).get("valPlaceholderRows"),
        }

    config_path = out_dir / "tiny_fit_v15_config.json"
    config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "inputPath": str(input_path),
        "statesPath": str(states_path),
        "configPath": str(config_path),
        "trainStates": len(selected),
        "uniqueKeys": config["coverage"]["uniquePolicyInputKeys"],
        "uniqueFamilies": config["coverage"]["uniqueRootFamilies"],
        "skipped": len(skipped),
        "archivedStateHashMismatches": len(hash_mismatch),
        "targetActionTypeCounts": config["coverage"]["targetActionTypeCounts"],
        "candidateCountRange": [config["coverage"]["candidateCountMin"], config["coverage"]["candidateCountMax"]],
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
