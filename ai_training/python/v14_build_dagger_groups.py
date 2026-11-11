"""V14/T14-08：构造 D0/D1/D2 三组的受控训练数据。

对照要求（任务书 11.1）：相同初始化、同一旧池、同一新数据数量、同样更新数与数据顺序策略。

- D0 replay：仅旧数据（T14-02 的 C1 训练集）再训练；
- D1 fresh-offline：新采教师访问状态（T14-08 的 heuristic 轨迹）+ 旧池，1:1；
- D2 student-states：学生访问状态由教师重标 + 旧池，1:1。

三组使用同一验证集（T14-02 split 的 val root 家族），同一初始化检查点（C1 seed 42 best），
同一更新预算与同一 data-order seed。

用法：
    py python/v14_build_dagger_groups.py --run-id v14_20260924_t14
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def read_rows(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def write_rows(path: Path, rows) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
            count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="v14_20260924_t14")
    parser.add_argument("--new-rows", type=int, default=0,
                        help="每组新数据行数的目标值；0 表示与旧池 1:1 匹配")
    args = parser.parse_args()

    run = REPO_ROOT / "v14" / "out" / args.run_id
    c1_dataset = run / "T14-02" / "dataset_v14.jsonl"
    split_manifest = json.loads((run / "T14-02" / "split_manifest.json").read_text(encoding="utf-8"))
    train_roots = set(split_manifest["trainRootFamilies"])
    val_roots = set(split_manifest["valRootFamilies"])

    old_rows = [r for r in read_rows(c1_dataset) if r.get("rootFamilyId") in train_roots]
    old_val_rows = [r for r in read_rows(c1_dataset) if r.get("rootFamilyId") in val_roots]
    print(f"[T14-08] 旧池：train={len(old_rows)} val={len(old_val_rows)}")

    groups = {}
    # D0：只有旧池。
    groups["D0"] = {"new": [], "old": old_rows, "source": None}

    for group, source in (("D1", run / "T14-08" / "dagger_D1.jsonl"),
                          ("D2", run / "T14-08" / "dagger_D2.jsonl")):
        if not source.exists():
            print(f"[T14-08] 缺少 {source}；跳过 {group}")
            continue
        new_rows = list(read_rows(source))
        target_new = args.new_rows if args.new_rows > 0 else len(old_rows)
        if len(new_rows) < target_new:
            # 重复采样到目标规模（记录实际使用量，不假装有更多独立数据）。
            repeats = (target_new + len(new_rows) - 1) // len(new_rows)
            new_used = (new_rows * repeats)[:target_new]
        else:
            new_used = new_rows[:target_new]
        groups[group] = {"new": new_used, "old": old_rows, "source": str(source).replace("\\", "/")}
        print(f"[T14-08] {group}: 新数据 {len(new_rows)} 行（使用 {len(new_used)} 行，"
              f"独立状态 {len({r['sourceStateKey'] for r in new_rows})}）")

    summary = {}
    for group, payload in groups.items():
        out_path = run / "T14-08" / f"group_{group}.jsonl"
        rows = list(payload["old"]) + list(payload["new"])
        # 验证集固定使用 T14-02 的 val 行（旧池同源），保证三组同一验证集。
        count = write_rows(out_path, rows + list(old_val_rows))
        new_roots = sorted({r["rootFamilyId"] for r in payload["new"]})
        manifest = {
            "schema": "v14_dagger_split_manifest_1",
            "task": "T14-08",
            "group": group,
            "dataset": str(out_path).replace("\\", "/"),
            "datasetSha256": sha256_file(out_path),
            "trainRootFamilies": sorted(train_roots | set(new_roots)),
            "valRootFamilies": sorted(val_roots),
            "testRootFamilies": [],
            "oldRows": len(payload["old"]),
            "newRows": len(payload["new"]),
            "newDistinctStates": len({r["sourceStateKey"] for r in payload["new"]}),
            "newRootFamilies": new_roots,
            "newSource": payload["source"],
            "valRows": len(old_val_rows),
            "note": "旧:新 = 1:1；验证集与 C1 相同（同一 val root 家族），因此三组可比。",
        }
        (run / "T14-08" / f"group_{group}_split_manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
        )
        summary[group] = manifest
        print(f"[T14-08] {group}: 写出 {count} 行 -> {out_path.name}（new={len(payload['new'])}, old={len(payload['old'])}, val={len(old_val_rows)}）")

    (run / "T14-08" / "dagger_groups_summary.json").write_text(
        json.dumps({
            "schema": "v14_dagger_groups_1",
            "task": "T14-08",
            "runId": args.run_id,
            "controlledFactors": [
                "同一初始化检查点（C1 seed 42 best）",
                "同一旧池与同一验证集",
                "同一新数据行数（1:1 混合）",
                "同一更新预算与 data-order seed",
            ],
            "notControlled": [
                "唯一新状态数：D1 只有 1070 个唯一状态（重复采样到 6400 行，约 5.98 倍），"
                "D2 有 4787 个唯一状态（重复约 1.34 倍）。因此 D1 与 D2 的差异不能单独归因于"
                "「教师访问状态 vs 学生访问状态」；两者之间还差着 3.5 倍的唯一状态数。",
            ],
            "groups": summary,
        }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
