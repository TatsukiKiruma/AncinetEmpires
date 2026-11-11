"""V17/T17-05：把「输入池」与 B100 教师标签合并成 B0/B1/B2 可用的单一输入池。

设计要点（任务书 §7、细则 D1/D2）：

* B0 与 B1 **必须共享完全相同的输入行与行顺序**，只换 policy 标签来源；因此本脚本输出
  一行同时带 `l1ActionCode`（B0 用）与 `teacherActionCode`（B1 用），再由
  `v17/tools/make_train_variant_v17.ts` 生成两个只差标签列的变体。
* 连接键是**网络输入身份** `actualInputKey`（v17-netinput-v1），不是 sampleId：
  教师标签正是在同一身份上查询得到的。缺失时退回 `stateHash` 并显式标注。
* 同一输入出现多个不同教师动作 → 记冲突（`teacherConflict=true`）并保留全部计数，
  **不**挑"看起来更好学"的那个。B100-Q 在同一 queryKey 下应当是确定的，冲突本身就是证据。
* 输入级去重（首次出现者胜），重复行与冲突行都写证据文件。

用法（真实命令）：
  & 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe' `
    v17/tools/merge_v17_pool.py `
    --dataset v17/out/v17_20260926_r2/data/legacy_train_dedup.jsonl `
    --dataset v17/out/v17_20260926_r2/data/new_train/dataset_v17_newtrain.jsonl `
    --labels  v17/out/v17_20260926_r2/teacher/labels/b100q-newtrain `
    --out     v17/out/v17_20260926_r2/data/pool_v17_train.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

# 中文：Windows 控制台默认 GBK，报告里的中文/箭头会在 print 时炸掉，看起来像"脚本失败"
# 其实文件已经写好了。这里显式切 UTF-8，避免假失败。
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def rows(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", action="append", required=True, help="可重复；编码后的数据集文件")
    parser.add_argument("--labels", action="append", default=[], help="可重复；B100 标签目录或 labels*.jsonl")
    parser.add_argument("--out", required=True)
    parser.add_argument("--report", default=None)
    parser.add_argument("--max-rows", type=int, default=None, help="诊断用")
    args = parser.parse_args()

    out_path = (REPO / args.out) if not Path(args.out).is_absolute() else Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # ---------------- 读教师标签 ----------------
    label_files: list[Path] = []
    for spec in args.labels:
        p = (REPO / spec) if not Path(spec).is_absolute() else Path(spec)
        if p.is_dir():
            label_files.extend(sorted(x for x in p.glob("*.jsonl")))
        elif p.exists():
            label_files.append(p)
    by_key: dict[str, Counter] = defaultdict(Counter)
    by_state: dict[str, Counter] = defaultdict(Counter)
    label_meta: dict[str, dict] = {}
    unclean_labels = 0
    illegal_labels = 0
    label_rows = 0
    for lf in label_files:
        for rec in rows(lf):
            code = rec.get("teacherActionCode")
            if not code:
                continue
            label_rows += 1
            key = rec.get("queryKey")
            if key:
                by_key[key][code] += 1
                label_meta.setdefault(key, rec)
            state = rec.get("stateHash")
            if state:
                by_state[state][code] += 1
                label_meta.setdefault(f"state:{state}", rec)
            if rec.get("cleanForPolicy") is not True:
                unclean_labels += 1
            if rec.get("teacherActionInAllowed") is not True:
                illegal_labels += 1

    # ---------------- 合并数据集 ----------------
    seen: dict[str, str] = {}
    kept = 0
    dup_rows = 0
    cross_file_dups = 0
    conflicts = 0
    joined_by_key = 0
    joined_by_state = 0
    unjoined = 0
    teacher_conflict_rows = 0
    stats = {
        "bySource": Counter(),
        "byMap": Counter(),
        "bySeat": Counter(),
        "byPhase": Counter(),
        "byOutcome": Counter(),
        "byValueTarget": Counter(),
        "teacherActionTypes": Counter(),
        "queryKeyKinds": Counter(),
        "l1Available": 0,
        "teacherAvailable": 0,
        "bothAvailable": 0,
    }
    conflict_examples: list[dict] = []
    started = time.time()

    with out_path.open("w", encoding="utf-8") as out:
        dup_handle = (out_path.parent / f"{out_path.stem}.duplicates.jsonl").open("w", encoding="utf-8")
        conf_handle = (out_path.parent / f"{out_path.stem}.teacher_conflicts.jsonl").open("w", encoding="utf-8")
        for dataset_index, dataset in enumerate(args.dataset):
            path = (REPO / dataset) if not Path(dataset).is_absolute() else Path(dataset)
            if not path.exists():
                raise SystemExit(f"数据集不存在：{path}")
            for index, row in enumerate(rows(path)):
                if args.max_rows is not None and index >= args.max_rows:
                    break
                key = row.get("actualInputKey")
                state = row.get("stateHash")
                if not key:
                    # 老文件没有 actualInputKey 时不允许猜；如实跳过并计数。
                    cross_file_dups += 1
                    continue
                if key in seen:
                    dup_rows += 1
                    dup_handle.write(json.dumps({
                        "actualInputKey": key, "sampleId": row.get("sampleId"),
                        "duplicateOf": seen[key], "duplicateDataset": dataset,
                    }, ensure_ascii=False) + "\n")
                    continue
                seen[key] = str(row.get("sampleId"))
                kept += 1

                # --- 教师标签 ---
                counter = by_key.get(key)
                join_kind = "policy-input-key"
                if not counter and state:
                    counter = by_state.get(state)
                    join_kind = "state-hash"
                teacher_code = None
                if counter:
                    if join_kind == "policy-input-key":
                        joined_by_key += 1
                    else:
                        joined_by_state += 1
                    teacher_code = counter.most_common(1)[0][0]
                    if len(counter) > 1:
                        conflicts += 1
                        teacher_conflict_rows += 1
                        conf_handle.write(json.dumps({
                            "actualInputKey": key, "stateHash": state,
                            "teacherActions": dict(counter), "chosen": teacher_code,
                            "note": "同输入不同教师动作；不挑选更容易学的标签，全部保留在证据里。",
                        }, ensure_ascii=False) + "\n")
                        if len(conflict_examples) < 10:
                            conflict_examples.append({"actualInputKey": key, "teacherActions": dict(counter)})
                    meta = label_meta.get(key) or label_meta.get(f"state:{state}") or {}
                else:
                    unjoined += 1
                    meta = {}

                out_row = dict(row)
                out_row["poolJoinKind"] = join_kind if counter else None
                out_row["teacherActionCode"] = teacher_code
                out_row["teacherActionInAllowed"] = meta.get("teacherActionInAllowed") if teacher_code else None
                out_row["teacherCleanForPolicy"] = meta.get("cleanForPolicy") if teacher_code else None
                out_row["teacherId"] = meta.get("teacherId") if teacher_code else None
                out_row["teacherVersion"] = meta.get("teacherVersion") if teacher_code else None
                out_row["labelEvidenceKind"] = "B100_FINAL_ACTION_HARD" if teacher_code else None
                out_row["teacherConflict"] = bool(counter and len(counter) > 1)
                out_row["poolSources"] = [dataset]
                out.write(json.dumps(out_row, ensure_ascii=False) + "\n")

                stats["bySource"][str(row.get("sourcePolicy"))] += 1
                stats["byMap"][str(row.get("mapName"))] += 1
                stats["bySeat"][str(row.get("subjectPlayerId"))] += 1
                stats["byPhase"][str(row.get("phaseBucket"))] += 1
                stats["byOutcome"][str(row.get("outcomeSource"))] += 1
                stats["byValueTarget"][str(row.get("valueTarget"))] += 1
                if row.get("l1ActionCode"):
                    stats["l1Available"] += 1
                if teacher_code:
                    stats["teacherAvailable"] += 1
                    stats["teacherActionTypes"][str(teacher_code).split(":")[0]] += 1
                    stats["queryKeyKinds"][join_kind] += 1
                    if row.get("l1ActionCode"):
                        stats["bothAvailable"] += 1
        dup_handle.close()
        conf_handle.close()

    report = {
        "schema": "v17_pool_merge_report_1",
        "datasets": list(args.dataset),
        "labelFiles": [str(p).replace("\\", "/") for p in label_files],
        "labelRowsRead": label_rows,
        "out": str(out_path).replace("\\", "/"),
        "keptUniqueInputs": kept,
        "duplicateRowsDropped": dup_rows,
        "rowsWithoutActualInputKey": cross_file_dups,
        "join": {
            "joinedByPolicyInputKey": joined_by_key,
            "joinedByStateHash": joined_by_state,
            "unjoined": unjoined,
            "coverage": round((kept - unjoined) / kept, 4) if kept else None,
        },
        "teacherConflicts": {
            "uniqueInputsWithConflictingTeacherAction": conflicts,
            "rows": teacher_conflict_rows,
            "examples": conflict_examples,
            "policy": "冲突不解决：不挑更容易学的标签；B1 训练用该输入时仍带 teacherConflict 标记，供后续损失合同处理。",
        },
        "teacherLabelHealth": {
            "labelsNotCleanForPolicy": unclean_labels,
            "labelsIllegalAction": illegal_labels,
        },
        "stats": {k: (dict(v) if isinstance(v, Counter) else v) for k, v in stats.items()},
        "wallSeconds": round(time.time() - started, 1),
        "discipline": [
            "连接键是网络输入身份 actualInputKey；stateHash 只作退路并标注。",
            "输入级去重，重复行与冲突行写证据文件。",
            "教师标签缺失 ⇒ teacherActionCode=null，绝不回填 L1。",
        ],
    }
    rep_path = Path(args.report) if args.report else out_path.with_suffix(".report.json")
    rep_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "stats"}, ensure_ascii=False, indent=2))
    print("[stats]", json.dumps({k: (dict(v) if isinstance(v, Counter) else v) for k, v in stats.items()}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
