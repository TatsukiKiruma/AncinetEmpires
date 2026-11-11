"""V17/T17-05d：构造 B2 输入池——**总唯一输入数与 B0 相同，但成分偏向学生访问状态**。

任务书 D2 的三臂对照里，B2 要回答的问题是：
    「在策略分布偏移上纠错，是否比仅仅示范更有效？」
因此它必须与 B0 保持**相同的唯一输入数量**（12,021），只换成分。
本轮 B100 未取得资格，所以 B2 用 L1 标签（与 B0 同源），
把变量严格限制在"状态分布"这一个因素上。

选取方式（确定性、可复算）：
  * 先按 `actualInputKey` 对**学生来源**行去重，等步长抽取 `--student-target` 行；
  * 再从 H0 来源行去重、跳过已选 key，等步长抽取剩余名额；
  * 两份各按原文件顺序输出学生在前、H0 在后；采样器本来就会用 `--data-order-seed` 重排，
    所以写出顺序不构成偏置，但**必须固定**以便复现。

等步长（stride）而不是取前 N 行：避免把"某个分片先被编码"变成系统性偏置。

用法：
  & 'C:\\Users\\SHIINA\\AppData\\Local\\Programs\\Python\\Python312\\python.exe' `
    v17/tools/make_v17_b2_pool.py `
    --student-dataset v17/out/v17_20260926_r2/data/b2_student/encoded/student.b2.jsonl `
    --h0-dataset v17/out/v17_20260926_r2/data/new_train/dataset_v17_newtrain.jsonl `
    --out v17/out/v17_20260926_r2/data/pool_B2_train.jsonl `
    --report v17/out/v17_20260926_r2/data/pool_B2_train.report.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def resolve(spec: str) -> Path:
    p = Path(spec)
    return p if p.is_absolute() else (REPO / p)


def unique_rows(path: Path, want_sources: set[str] | None, exclude: set[str] | None = None):
    """按 actualInputKey 去重；保持文件顺序；可选按 sourcePolicy 过滤与排除已选 key。"""
    seen: set[str] = set()
    exclude = exclude or set()
    out = []
    for line in path.open(encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        key = row.get("actualInputKey")
        if not key or key in seen or key in exclude:
            continue
        if want_sources is not None and str(row.get("sourcePolicy")) not in want_sources:
            continue
        seen.add(key)
        out.append(row)
    return out


def stride_pick(rows: list[dict], n: int) -> list[dict]:
    """确定性等步长抽取 n 行（n >= len(rows) 时全取）。"""
    if n >= len(rows):
        return list(rows)
    if n <= 0:
        return []
    step = len(rows) / n
    picked = [rows[min(len(rows) - 1, int(i * step))] for i in range(n)]
    # 去重（step<1 时不会发生；步长法在 n<=len 时理论上不会重复，这里仍防御一次）
    seen: set[str] = set()
    deduped = []
    for row in picked:
        key = row["actualInputKey"]
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--student-dataset", required=True)
    ap.add_argument("--h0-dataset", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--report", required=True)
    ap.add_argument("--total", type=int, default=12021, help="与 B0 相同的总唯一输入数")
    ap.add_argument("--student-target", type=int, default=10000)
    args = ap.parse_args()

    started = time.time()
    student_path, h0_path = resolve(args.student_dataset), resolve(args.h0_dataset)
    for p in (student_path, h0_path):
        if not p.exists():
            raise SystemExit(f"缺少输入文件：{p}")

    # 中文：学生来源有三个：本轮新采的 b2 分片，以及 new_train 里本来就带的 P1:s2026 行
    # （roots 0..9）。两者都是"学生实际访问过的状态"，都要算进 B2 的学生池，
    # 否则会因为只用一个文件而低估学生态数量、凑不到与 B0 相同的总输入数。
    b2_all = unique_rows(student_path, None)
    student_rows = [r for r in b2_all if str(r.get("sourcePolicy")) != "h0"]
    seen_student = {r["actualInputKey"] for r in student_rows}

    train_all = unique_rows(h0_path, None, exclude=seen_student)
    student_rows += [r for r in train_all if str(r.get("sourcePolicy")) != "h0"]
    for r in student_rows:
        seen_student.add(r["actualInputKey"])
    h0_rows = [r for r in unique_rows(h0_path, None, exclude=seen_student)
               if str(r.get("sourcePolicy")) == "h0"]

    n_student = min(args.student_target, len(student_rows), args.total)
    picked_student = stride_pick(student_rows, n_student)
    n_h0 = max(0, args.total - len(picked_student))
    picked_h0 = stride_pick(h0_rows, n_h0)

    out_path = resolve(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    stats = {"student": Counter(), "h0": Counter()}
    with out_path.open("w", encoding="utf-8") as out:
        for tag, rows in (("student", picked_student), ("h0", picked_h0)):
            for row in rows:
                out.write(json.dumps(row, ensure_ascii=False) + "\n")
                stats[tag][f"map:{row.get('mapName')}"] += 1
                stats[tag][f"seat:{row.get('subjectPlayerId')}"] += 1
                stats[tag][f"phase:{row.get('phaseBucket')}"] += 1
                stats[tag]["rows"] += 1
                if row.get("l1ActionCode"):
                    stats[tag]["l1Labeled"] += 1
                if row.get("valueTarget") is not None:
                    stats[tag]["valueLabeled"] += 1

    report = {
        "schema": "v17_b2_pool_report_1",
        "purpose": "B2：与 B0 相同总唯一输入数，成分偏向学生访问状态（任务书 D2 第三臂）。",
        "inputs": {
            "studentDataset": str(student_path).replace("\\", "/"),
            "h0Dataset": str(h0_path).replace("\\", "/"),
        },
        "available": {"studentUnique": len(student_rows), "h0UniqueAfterExclusion": len(h0_rows)},
        "selected": dict(stats),
        "totalRows": len(picked_student) + len(picked_h0),
        "targetTotal": args.total,
        "composition": {
            "studentShare": round(len(picked_student) / max(1, len(picked_student) + len(picked_h0)), 4),
            "h0Share": round(len(picked_h0) / max(1, len(picked_student) + len(picked_h0)), 4),
            "note": "B0 的构成是 8,021 h0 + 4,000 student；B2 有意把比例倒过来。",
        },
        "selectionRule": "按 actualInputKey 去重后等步长抽取；非取前 N 行，避免分片顺序偏置。",
        "wallSeconds": round(time.time() - started, 1),
    }
    rep = resolve(args.report)
    rep.parent.mkdir(parents=True, exist_ok=True)
    rep.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())