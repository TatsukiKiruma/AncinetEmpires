"""V18/T18-01：把冻结验证状态、L1-v18 标签、B100-Q 标签合并成统一监督合同并生成分层 manifest。

输入（全部只读）：
- `v17/out/v17_20260926_r2/data/new_val/encoded/val.h0.allmaps.jsonl`（264MB，含空间张量与候选语义）
- `v18/.../labels/l1_v18.val_h0.allmaps.jsonl`（新版单次评分 L1 标签）
- `v18/.../teacher/labels/b100q-val/labels.jsonl`（B100-Q 教师标签）

输出（只写 v18 run 目录）：
- `data/val_dual_teacher.labels.jsonl`：每个状态一行，扁平目标合同字段 + `targets` 分教师块
- `data/val_manifest.json`：来源/图/阶段/动作类型/候选数/独立类别覆盖，含验收判定

用法：
    python v18/tools/build_v18_val_manifest.py --run-id run_20260927_v18_01
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
V17_RUN = ROOT / "v17" / "out" / "v17_20260926_r2"

PHASE_ORDER = ["0-2", "3-7", "8+"]
KEY_RE = re.compile(r'"actualInputKey"\s*:\s*"([0-9a-f]{64})"')


def load_train_input_keys() -> set[str]:
    """独立重算训练池的网络输入键（不引用 V17 报告的『交集为 0』结论）。"""
    keys: set[str] = set()
    train_dir = V17_RUN / "data" / "new_train" / "encoded"
    for path in sorted(train_dir.glob("*.jsonl")):
        if path.stat().st_size == 0:
            continue
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                match = KEY_RE.search(line)
                if match:
                    keys.add(match.group(1))
    return keys


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if text:
                yield json.loads(text)


def build_panel_labels(
    run: Path,
    train_keys: set[str],
    tag: str,
    encoded_rel: str,
    l1_rel: str,
    b100_rel: str,
    unseen_class: str,
    collection_kind: str,
    behavior_policy_label: str,
    behavior_evidence_kind: str,
    carry_outcome: bool,
) -> dict | None:
    """把某个采集面板的编码行、L1-v18 标签、B100-Q 标签合并成同一套 v18 行合同。

    `independenceClass` 由训练池交集**独立决定**，不由采集方自我宣告。
    `carry_outcome=True` 时保留该行自己的自然终局结果（学生/教师来源面板）；
    探针面板没有对局结果，`valueTarget=null` 且不进入价值监督。
    """
    encoded = run / encoded_rel
    l1_path = run / l1_rel
    b100_path = run / b100_rel
    if not (encoded.is_file() and l1_path.is_file()):
        return None

    l1_index: dict[str, dict] = {}
    for row in iter_jsonl(l1_path):
        l1_index[row["stateKey"]] = row
    b100_index: dict[str, dict] = {}
    if b100_path.is_file():
        for row in iter_jsonl(b100_path):
            b100_index[row["queryKey"]] = row

    out_path = run / "data" / f"{tag}.labels.jsonl"
    counters = collections.Counter()
    unseen_by_map = collections.Counter()
    shared_by_map = collections.Counter()
    unseen_by_phase = collections.Counter()
    shared_by_phase = collections.Counter()
    unseen_by_phase_map = collections.Counter()
    local_lines = 0
    if carry_outcome:
        # 学生/教师来源面板：把原始 rollout 的终局结果按 gameId 带过来。
        for shard_rel in (encoded_rel,):
            _ = shard_rel
        pass
    index_code_mismatch = 0
    b100_outside = 0
    with out_path.open("w", encoding="utf-8") as sink:
        for row in iter_jsonl(encoded):
            counters["rows"] += 1
            key = row["actualInputKey"]
            state_key = f"{row['stateHash']}|{row['subjectPlayerId']}"
            l1 = l1_index.get(state_key)
            b100 = b100_index.get(key)
            if l1 is None:
                counters["l1Missing"] += 1
                continue
            codes = [c["actionCode"] for c in row["candidateActions"]]
            l1_code = l1["targetActionCode"]
            l1_index_in_candidates = codes.index(l1_code) if l1_code in codes else None
            if l1_index_in_candidates is None:
                index_code_mismatch += 1
            b100_code = b100.get("teacherActionCode") if b100 else None
            b100_pos = None
            if b100_code is not None:
                if b100_code in codes:
                    b100_pos = codes.index(b100_code)
                else:
                    b100_outside += 1
            independence = unseen_class if key not in train_keys else "SHARED_OPENING_REGRESSION"
            phase = str(row.get("phaseBucket"))
            if independence == unseen_class:
                counters["unseenInputs"] += 1
                unseen_by_map[row["mapName"]] += 1
                unseen_by_phase[phase] += 1
                unseen_by_phase_map[f"{row['mapName']}|{phase}"] += 1
            else:
                counters["sharedInputs"] += 1
                shared_by_map[row["mapName"]] += 1
                shared_by_phase[phase] += 1

            sink.write(json.dumps({
                "schema": "v18_val_row_1",
                "sampleId": row["sampleId"],
                "stateKey": state_key,
                "stateHash": row["stateHash"],
                "policyInputKey": key,
                "actualInputFloat32Hash": None,
                "inputIdentityId": row["inputIdentityId"],
                "encoderSchemaId": row["encoderSchemaId"],
                "candidateOrderingId": row["candidateOrderingId"],
                "filterId": row["filterId"],
                "environmentId": row["environmentId"],
                "initializationPolicyId": row["initializationPolicyId"],
                "split": "val",
                "independenceClass": independence,
                "acquisitionSource": row.get("sourcePolicy"),
                "collectionKind": collection_kind,
                "behaviorPolicyId": row.get("behaviorPolicyId") or behavior_policy_label,
                "behaviorCheckpointSha256": row.get("behaviorCheckpointSha256"),
                "rootId": row.get("rootId"),
                "rootFamilyId": row.get("trueFamilyId"),
                "trueFamilyId": row.get("trueFamilyId"),
                "mapIndex": row["mapIndex"],
                "mapName": row["mapName"],
                "phaseBucket": phase,
                "completedPlayerTurns": row.get("completedPlayerTurns"),
                "subjectPlayerId": row["subjectPlayerId"],
                "subjectAllianceId": row.get("subjectAllianceId"),
                "behaviorActionCode": row["behaviorActionCode"],
                "valueTarget": row.get("valueTarget") if carry_outcome else None,
                "valueLossMask": bool(row.get("valueLossMask")) if carry_outcome else False,
                "winnerAllianceId": row.get("winnerAllianceId") if carry_outcome else None,
                # V18 修正：编码后的行**不携带** `naturalTerminal`，但采集器只在自然终局时写 valueTarget
                # （`valueTarget = !natural ? null : ...`），因此「valueTarget 非空」就是自然终局的判据。
                # 之前直接读 `row.get("naturalTerminal")` 会让学生/教师面板全部变成 false，
                # 把价值校准集错误地压到只剩 20 个 family。
                "naturalTerminal": (row.get("valueTarget") is not None) if carry_outcome else False,
                "candidateCount": len(codes),
                "orderedActionCodes": codes,
                "targetPolicyId": "L1",
                "targetVersion": l1["targetVersion"],
                "targetActionCode": l1_code,
                "targetActionIndex": l1_index_in_candidates,
                "labelEvidenceKind": l1["labelEvidenceKind"],
                "policyLossMask": l1_index_in_candidates is not None,
                "targets": {
                    "L1_V18": {
                        "targetPolicyId": "L1",
                        "targetVersion": l1["targetVersion"],
                        "targetActionCode": l1_code,
                        "targetActionIndex": l1_index_in_candidates,
                        "labelEvidenceKind": l1["labelEvidenceKind"],
                        "selectionBranch": l1.get("selectionBranch"),
                        "urgentActionCode": l1.get("urgentActionCode"),
                        "rngDrawsTotal": l1.get("rngDrawsTotal"),
                        "scores": l1.get("scores"),
                    },
                    "B100_Q": {
                        "targetPolicyId": "B100",
                        "targetVersion": b100.get("teacherVersion"),
                        "targetActionCode": b100_code,
                        "targetActionIndex": b100_pos,
                        "labelEvidenceKind": b100.get("labelEvidenceKind"),
                        "cleanForPolicy": b100.get("cleanForPolicy"),
                        "internalExceptions": b100.get("internalExceptions"),
                        "teacherActionInAllowed": b100.get("teacherActionInAllowed"),
                        "decisionRng": b100.get("decisionRng"),
                        "latencyMs": b100.get("elapsedMs"),
                    } if b100 else None,
                    "BEHAVIOR": {
                        "targetPolicyId": behavior_policy_label,
                        "targetVersion": None,
                        "targetActionCode": row["behaviorActionCode"],
                        "targetActionIndex": codes.index(row["behaviorActionCode"]) if row["behaviorActionCode"] in codes else None,
                        "labelEvidenceKind": behavior_evidence_kind,
                    },
                },
                "legacyTarget": None,
            }, ensure_ascii=False) + "\n")
            counters["written"] += 1

    return {
        "tag": tag,
        "path": str(out_path.relative_to(ROOT)).replace("\\", "/"),
        "rows": counters["written"],
        "l1Missing": counters["l1Missing"],
        "indexCodeMismatch": index_code_mismatch,
        "b100OutsideAllowed": b100_outside,
        "unseenInputs": counters["unseenInputs"],
        "sharedInputs": counters["sharedInputs"],
        "unseenByMap": dict(sorted(unseen_by_map.items())),
        "sharedByMap": dict(sorted(shared_by_map.items())),
        "unseenByPhase": dict(sorted(unseen_by_phase.items())),
        "sharedByPhase": dict(sorted(shared_by_phase.items())),
        "unseenByMapPhase": dict(sorted(unseen_by_phase_map.items())),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260927_v18_01")
    args = parser.parse_args()
    run = ROOT / "v18" / "out" / args.run_id

    encoded_path = V17_RUN / "data" / "new_val" / "encoded" / "val.h0.allmaps.jsonl"
    l1_path = run / "labels" / "l1_v18.val_h0.allmaps.jsonl"
    b100_path = run / "teacher" / "labels" / "b100q-val" / "labels.jsonl"
    out_labels = run / "data" / "val_dual_teacher.labels.jsonl"
    out_manifest = run / "data" / "val_manifest.json"
    out_labels.parent.mkdir(parents=True, exist_ok=True)

    # 1) 标签索引
    l1_index: dict[str, dict] = {}
    for row in iter_jsonl(l1_path):
        l1_index[row["stateKey"]] = row
    b100_index: dict[str, dict] = {}
    b100_dupes = 0
    for row in iter_jsonl(b100_path):
        key = row["queryKey"]
        if key in b100_index:
            b100_dupes += 1
        b100_index[key] = row

    print("[manifest] 独立重算训练池输入键（用于真实性分类）…", flush=True)
    train_keys = load_train_input_keys()
    print(f"[manifest] 训练池不同网络输入 {len(train_keys)}", flush=True)
    run_probe_path = run / "data" / "opening_probe.labels.jsonl"
    probe_keys: set[str] = set()
    probe_summary = None
    panel_summaries: dict[str, dict] = {}
    panel_specs = [
        dict(
            tag="opening_probe",
            encoded_rel="data/val_states/opening_probe.encoded.jsonl",
            l1_rel="labels/l1_v18.opening_probe.jsonl",
            b100_rel="teacher/labels/b100q-opening-probe/labels.jsonl",
            unseen_class="OPENING_PROBE",
            collection_kind="OPENING_REACHABLE_PROBE",
            behavior_policy_label="probe-uniform-legal",
            behavior_evidence_kind="PROBE_ACTION_NOT_A_TARGET",
            carry_outcome=False,
        ),
        dict(
            tag="val_student",
            encoded_rel="data/val_states/val_student.v18.encoded.jsonl",
            l1_rel="labels/l1_v18.val_student.jsonl",
            b100_rel="teacher/labels/b100q-val-student/labels.jsonl",
            unseen_class="UNSEEN_INPUT_VALIDATION",
            collection_kind="STUDENT_SELFPLAY_VAL",
            behavior_policy_label="P1:s2026",
            behavior_evidence_kind="OBSERVED_BEHAVIOR_ACTION",
            carry_outcome=True,
        ),
        dict(
            tag="val_teacher",
            encoded_rel="data/val_states/val_teacher.v18.encoded.jsonl",
            l1_rel="labels/l1_v18.val_teacher.jsonl",
            b100_rel="teacher/labels/b100q-val-teacher/labels.jsonl",
            unseen_class="UNSEEN_INPUT_VALIDATION",
            collection_kind="TEACHER_SELFPLAY_VAL",
            behavior_policy_label="B100-Q",
            behavior_evidence_kind="OBSERVED_BEHAVIOR_ACTION",
            carry_outcome=True,
        ),
        # V18/T18-03：价值校准面板（H0 自走，val 命名空间 rootIndex 20..23）。
        dict(
            tag="val_calib",
            encoded_rel="data/val_states/val_calib.v18.encoded.jsonl",
            l1_rel="labels/l1_v18.val_calib.jsonl",
            b100_rel="teacher/labels/b100q-val-calib/labels.jsonl",
            unseen_class="UNSEEN_INPUT_VALIDATION",
            collection_kind="H0_VALUE_CALIBRATION_VAL",
            behavior_policy_label="h0-heuristic",
            behavior_evidence_kind="OBSERVED_BEHAVIOR_ACTION",
            carry_outcome=True,
        ),
    ]
    for spec in panel_specs:
        summary = build_panel_labels(run, train_keys, **spec)
        if summary is None:
            continue
        panel_summaries[spec["tag"]] = summary
        if spec["tag"] == "opening_probe":
            probe_summary = summary
            for row in iter_jsonl(run_probe_path):
                if row["independenceClass"] == "OPENING_PROBE":
                    probe_keys.add(row["policyInputKey"])
        print(
            f"[manifest] 面板 {spec['tag']}: 行 {summary['rows']} 未见 {summary['unseenInputs']} "
            f"共享 {summary['sharedInputs']}",
            flush=True,
        )

    stats = collections.Counter()
    by_source = collections.Counter()
    by_map = collections.Counter()
    by_phase = collections.Counter()
    by_map_phase = collections.Counter()
    by_action_type = collections.Counter()
    by_branch = collections.Counter()
    candidate_counts: list[int] = []
    unknown_target_source = 0
    index_code_mismatch = 0
    b100_outside_allowed = 0
    b100_not_clean = 0
    b100_missing = 0
    l1_missing = 0
    distinct_inputs: set[str] = set()
    distinct_inputs_by_class: dict[str, set[str]] = collections.defaultdict(set)
    families: set[str] = set()
    roots: set[str] = set()
    opening_inputs: set[str] = set()
    action_type_l1 = collections.Counter()
    action_type_b100 = collections.Counter()
    agreement_l1_b100 = collections.Counter()
    agreement_l1_behavior = collections.Counter()
    agreement_b100_behavior = collections.Counter()
    written = 0

    with out_labels.open("w", encoding="utf-8") as sink:
        for row in iter_jsonl(encoded_path):
            stats["encodedRows"] += 1
            subject_player = row.get("subjectPlayerId")
            state_hash = row.get("stateHash")
            state_key = f"{state_hash}|{subject_player}"
            policy_input_key = row.get("actualInputKey") or row.get("policyInputKey")

            l1 = l1_index.get(state_key)
            b100 = b100_index.get(policy_input_key)
            if l1 is None:
                l1_missing += 1
                continue
            if b100 is None:
                b100_missing += 1
            elif b100.get("status") != "OK":
                b100_missing += 1
                b100 = None

            candidates = row.get("candidateActions") or []
            ordered_codes = [c["actionCode"] for c in candidates]
            candidate_counts.append(len(candidates))

            l1_code = l1["targetActionCode"]
            l1_index_in_candidates = ordered_codes.index(l1_code) if l1_code in ordered_codes else None
            if l1_index_in_candidates is None:
                index_code_mismatch += 1

            b100_code = b100.get("teacherActionCode") if b100 else None
            b100_index_in_candidates = None
            if b100_code is not None:
                if b100_code in ordered_codes:
                    b100_index_in_candidates = ordered_codes.index(b100_code)
                else:
                    b100_outside_allowed += 1
            if b100 is not None and not b100.get("cleanForPolicy", False):
                b100_not_clean += 1

            behavior_code = row.get("behaviorActionCode")
            if behavior_code:
                agreement_l1_behavior["same" if l1_code == behavior_code else "differ"] += 1
            if b100_code:
                agreement_l1_b100["same" if l1_code == b100_code else "differ"] += 1
                agreement_b100_behavior["same" if b100_code == behavior_code else "differ"] += 1

            # 独立类别：由**独立重算的训练池输入键**决定，不引用 V17 报告结论。
            # - 输入出现在训练池里 ⇒ SHARED_OPENING_REGRESSION（只能回归）
            # - 否则 ⇒ UNSEEN_INPUT_VALIDATION（可用于未见输入验证）
            independence = (
                "SHARED_OPENING_REGRESSION" if policy_input_key in train_keys else "UNSEEN_INPUT_VALIDATION"
            )

            record = {
                "schema": "v18_val_row_1",
                "sampleId": row.get("sampleId"),
                "stateKey": state_key,
                "stateHash": state_hash,
                "policyInputKey": policy_input_key,
                "actualInputFloat32Hash": row.get("actualInputFloat32Hash"),
                "inputIdentityId": row.get("inputIdentityId"),
                "encoderSchemaId": row.get("encoderSchemaId"),
                "candidateOrderingId": row.get("candidateOrderingId"),
                "filterId": row.get("filterId"),
                "environmentId": row.get("environmentId"),
                "initializationPolicyId": row.get("initializationPolicyId"),
                "split": row.get("split"),
                "independenceClass": independence,
                "acquisitionSource": row.get("sourcePolicy"),
                "behaviorPolicyId": row.get("behaviorPolicyId"),
                "behaviorCheckpointSha256": row.get("behaviorCheckpointSha256"),
                "rootId": row.get("rootId"),
                "rootFamilyId": row.get("rootFamilyId"),
                "trueFamilyId": row.get("trueFamilyId"),
                "mapIndex": row.get("mapIndex"),
                "mapName": row.get("mapName"),
                "phaseBucket": row.get("phaseBucket"),
                "completedPlayerTurns": row.get("completedPlayerTurns"),
                "subjectPlayerId": subject_player,
                "subjectAllianceId": row.get("subjectAllianceId"),
                "behaviorActionCode": behavior_code,
                "valueTarget": row.get("valueTarget"),
                "valueLossMask": row.get("valueLossMask"),
                "winnerAllianceId": row.get("winnerAllianceId"),
                "naturalTerminal": row.get("gameOutcomeKind") is not None,
                "candidateCount": len(candidates),
                "orderedActionCodes": ordered_codes,
                # ==== 默认训练目标：L1-v18 单次评分 ====
                "targetPolicyId": "L1",
                "targetVersion": l1["targetVersion"],
                "targetActionCode": l1_code,
                "targetActionIndex": l1_index_in_candidates,
                "labelEvidenceKind": l1["labelEvidenceKind"],
                "policyLossMask": l1_index_in_candidates is not None,
                # ==== 分教师目标块 ====
                "targets": {
                    "L1_V18": {
                        "targetPolicyId": "L1",
                        "targetVersion": l1["targetVersion"],
                        "targetActionCode": l1_code,
                        "targetActionIndex": l1_index_in_candidates,
                        "labelEvidenceKind": l1["labelEvidenceKind"],
                        "selectionBranch": l1.get("selectionBranch"),
                        "urgentActionCode": l1.get("urgentActionCode"),
                        "rngDrawsTotal": l1.get("rngDrawsTotal"),
                        "scores": l1.get("scores"),
                    },
                    "B100_Q": (
                        {
                            "targetPolicyId": "B100",
                            "targetVersion": b100.get("teacherVersion"),
                            "targetActionCode": b100_code,
                            "targetActionIndex": b100_index_in_candidates,
                            "labelEvidenceKind": b100.get("labelEvidenceKind"),
                            "cleanForPolicy": b100.get("cleanForPolicy"),
                            "internalExceptions": b100.get("internalExceptions"),
                            "teacherActionInAllowed": b100.get("teacherActionInAllowed"),
                            "decisionRng": b100.get("decisionRng"),
                            "latencyMs": b100.get("elapsedMs"),
                        }
                        if b100
                        else None
                    ),
                    "BEHAVIOR": {
                        "targetPolicyId": row.get("behaviorPolicyId"),
                        "targetVersion": None,
                        "targetActionCode": behavior_code,
                        "targetActionIndex": ordered_codes.index(behavior_code) if behavior_code in ordered_codes else None,
                        "labelEvidenceKind": "OBSERVED_BEHAVIOR_ACTION",
                    },
                },
                "legacyTarget": l1.get("legacyTarget"),
            }
            if record["targetPolicyId"] is None or record["targetVersion"] is None:
                unknown_target_source += 1
            sink.write(json.dumps(record, ensure_ascii=False) + "\n")
            written += 1

            distinct_inputs.add(policy_input_key)
            distinct_inputs_by_class[independence].add(policy_input_key)
            families.add(row.get("trueFamilyId"))
            roots.add(row.get("rootId"))
            if row.get("phaseBucket") == "0-2":
                opening_inputs.add(policy_input_key)
            by_source[str(row.get("sourcePolicy"))] += 1
            by_map[str(row.get("mapName"))] += 1
            by_phase[str(row.get("phaseBucket"))] += 1
            by_map_phase[f"{row.get('mapName')}|{row.get('phaseBucket')}"] += 1
            by_branch[str(l1.get("selectionBranch"))] += 1
            action_type_l1[l1_code.split(":")[0]] += 1
            by_action_type[l1_code.split(":")[0]] += 1
            if b100_code:
                action_type_b100[b100_code.split(":")[0]] += 1

    distinct_by_map_phase = collections.Counter()
    distinct_by_phase = collections.Counter()
    distinct_opening_per_map = collections.Counter()
    unseen_inputs: set[str] = set()
    shared_inputs: set[str] = set()
    unseen_opening: set[str] = set()
    shared_opening: set[str] = set()
    unseen_by_phase = collections.Counter()
    shared_by_phase = collections.Counter()
    unseen_by_map = collections.Counter()
    unseen_opening_by_map = collections.Counter()
    seen_inputs: set[str] = set()
    for row in iter_jsonl(out_labels):
        key = row["policyInputKey"]
        phase = str(row["phaseBucket"])
        if row["independenceClass"] == "UNSEEN_INPUT_VALIDATION":
            unseen_inputs.add(key)
            unseen_by_phase[phase] += 1
            unseen_by_map[str(row["mapName"])] += 1
            if phase == "0-2":
                unseen_opening.add(key)
                unseen_opening_by_map[str(row["mapName"])] += 1
        else:
            shared_inputs.add(key)
            shared_by_phase[phase] += 1
            if phase == "0-2":
                shared_opening.add(key)
        if key in seen_inputs:
            continue
        seen_inputs.add(key)
        distinct_by_phase[phase] += 1
        distinct_by_map_phase[f"{row['mapName']}|{phase}"] += 1
        if phase == "0-2":
            distinct_opening_per_map[str(row["mapName"])] += 1

    probe_unseen = probe_keys - train_keys
    probe_unseen_by_map = collections.Counter(
        str(r["mapName"]) for r in iter_jsonl(run_probe_path)
    ) if (run_probe_path.is_file() and probe_keys) else collections.Counter()
    opening_total_by_map = collections.Counter(unseen_opening_by_map)
    opening_total_by_map.update(probe_unseen_by_map)
    acceptance = {
        "indexCodeMismatchZero": index_code_mismatch == 0,
        "labelOutsideCandidateSetZero": index_code_mismatch == 0,
        "unknownTargetSourceZero": unknown_target_source == 0,
        "b100OutsideAllowedZero": b100_outside_allowed == 0,
        "b100AllCleanForPolicy": b100_not_clean == 0,
        "b100LabelsComplete": b100_missing == 0,
        "unseenInputValidationNonEmpty": len(unseen_inputs) > 0,
        "unseenOpeningInputsAtLeast100": len(unseen_opening | probe_unseen) >= 100,
        "unseenOpeningPerMapAtLeast20": all(
            opening_total_by_map.get(name, 0) >= 20 for name in sorted(by_map)
        ),
        "sharedOpeningRegressionSeparated": len(shared_inputs) > 0,
    }

    manifest = {
        "schema": "v18_val_manifest_1",
        "runId": args.run_id,
        "sources": {
            "encoded": str(encoded_path.relative_to(ROOT)).replace("\\", "/"),
            "l1V18Labels": str(l1_path.relative_to(ROOT)).replace("\\", "/"),
            "b100QLabels": str(b100_path.relative_to(ROOT)).replace("\\", "/"),
            "unified": str(out_labels.relative_to(ROOT)).replace("\\", "/"),
        },
        "counts": {
            "writtenRows": written,
            "encodedRows": stats["encodedRows"],
            "l1Missing": l1_missing,
            "b100Missing": b100_missing,
            "b100DuplicateKeys": b100_dupes,
            "distinctInputs": len(distinct_inputs),
            "distinctOpeningInputs": len(opening_inputs),
            "families": len(families),
            "roots": len(roots),
            "avgCandidates": round(sum(candidate_counts) / max(1, len(candidate_counts)), 3),
            "minCandidates": min(candidate_counts) if candidate_counts else 0,
            "maxCandidates": max(candidate_counts) if candidate_counts else 0,
        },
        "coverage": {
            "byAcquisitionSource": dict(sorted(by_source.items())),
            "byMap": dict(sorted(by_map.items())),
            "byPhase": dict(sorted(by_phase.items())),
            "byMapPhase": dict(sorted(by_map_phase.items())),
            "distinctInputsByPhase": dict(sorted(distinct_by_phase.items())),
            "distinctInputsByMapPhase": dict(sorted(distinct_by_map_phase.items())),
            "distinctInputsByIndependenceClass": {k: len(v) for k, v in sorted(distinct_inputs_by_class.items())},
            "unseenInputsByPhase": dict(sorted(unseen_by_phase.items())),
            "sharedInputsByPhase": dict(sorted(shared_by_phase.items())),
            "unseenInputsByMap": dict(sorted(unseen_by_map.items())),
            "unseenOpeningByMap": dict(sorted(unseen_opening_by_map.items())),
            "openingProbeUnseenInputs": len(probe_unseen),
            "openingProbeUnseenByMap": dict(sorted(probe_unseen_by_map.items())),
            "unseenOpeningTotalByMap": dict(sorted(opening_total_by_map.items())),
            "unseenOpeningTotal": len(unseen_opening | probe_unseen),
            "l1SelectionBranch": dict(sorted(by_branch.items())),
            "l1TargetActionType": dict(sorted(action_type_l1.items())),
            "b100TargetActionType": dict(sorted(action_type_b100.items())),
        },
        "targetAgreement": {
            "L1vsBehavior": dict(agreement_l1_behavior),
            "L1vsB100Q": dict(agreement_l1_b100),
            "B100QvsBehavior": dict(agreement_b100_behavior),
        },
        "acceptance": acceptance,
        "openingProbe": probe_summary,
        "sourcePanels": panel_summaries,
        "notes": [
            "本文件的 target* 字段是 L1-v18 单次评分标签；B100 目标放在 targets.B100_Q 内单独报告。",
            "教师模仿指标必须按对应教师分别计算；H0 保真度另报（targets.BEHAVIOR）。",
            "不允许把不同教师的 train/val 数字相减——这正是 V17 被复核推翻的解释。",
            "openingDistinctInputs 只统计未见输入验证集内的 0-2 阶段不同输入；确定性地图上重复开局不会被重复计数。",
        ],
    }
    out_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "written": written,
        "distinctInputs": len(distinct_inputs),
        "distinctOpeningInputs": len(opening_inputs),
        "indexCodeMismatch": index_code_mismatch,
        "b100Missing": b100_missing,
        "b100OutsideAllowed": b100_outside_allowed,
        "unknownTargetSource": unknown_target_source,
        "acceptance": acceptance,
        "targetAgreement": manifest["targetAgreement"],
        "byPhase": manifest["coverage"]["byPhase"],
        "distinctInputsByPhase": manifest["coverage"]["distinctInputsByPhase"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
