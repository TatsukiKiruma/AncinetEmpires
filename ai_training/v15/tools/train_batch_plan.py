"""V15/T15-03：确定性 batch plan 生成器（可注入 sampler 计划）。

协议要求（V15_EXPERIMENT_PROTOCOL §3.1/§3.2）：
  - 曝光必须由冻结的计划保证，不能靠「复制 JSONL 长度」近似；
  - D 组每个 batch=32 由「16 个共同旧池序列 + 16 个本组池序列」组成；
  - 每个唯一 key 在预算内的循环曝光次数相差不超过 1。

本工具产出的 `v15_batch_plan_1` 文件被 `python/train_spatial_resnet.py --batch-plan`
消费：训练器按 plan 逐 update 取数，并把它写进消费台账与恢复身份。

用法示例见 `v15/out/v15_20260925_core/T15-03/cli_reference.md`。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence

PLAN_SCHEMA = "v15_batch_plan_1"


def sha256_file(path: str | os.PathLike[str]) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def resolve_train_rows(dataset_path: str, split_manifest_path: str) -> Dict[str, Any]:
    """按 split manifest 解析 train 分区的全量数据集行号（与训练器同规则）。"""
    with open(split_manifest_path, "r", encoding="utf-8") as fh:
        manifest = json.load(fh)
    train_roots = set(manifest.get("trainRootFamilies", []))
    test_roots = set(manifest.get("testRootFamilies", []))
    rows: List[int] = []
    sample_ids: List[str] = []
    with open(dataset_path, "r", encoding="utf-8") as fh:
        for idx, line in enumerate(fh):
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            root = row.get("rootFamilyId")
            if root in test_roots:
                continue
            if root in train_roots:
                rows.append(idx)
                sample_ids.append(str(row.get("sampleId")))
    return {
        "datasetPath": os.path.abspath(dataset_path),
        "datasetSha256": sha256_file(dataset_path),
        "splitManifestPath": os.path.abspath(split_manifest_path),
        "splitManifestSha256": sha256_file(split_manifest_path),
        "trainRows": rows,
        "trainSampleIds": sample_ids,
    }


def parse_pool_spec(spec: str, resolved: Dict[str, Any] | None,
                    index_files: Dict[str, List[int]] | None = None) -> List[int]:
    """pool 规格：
    train                —— manifest 的 train 分区全部行
    train:first=N        —— train 分区前 N 行
    train:offset=X:count=Y
    file:PATH            —— 外部 JSON 文件里的行号列表（E 组冻结池用）
    """
    if spec == "train":
        if resolved is None:
            raise ValueError("pool=train 需要同时给出 --dataset 与 --split-manifest")
        return list(resolved["trainRows"])
    if spec.startswith("train:"):
        if resolved is None:
            raise ValueError("pool=train:* 需要同时给出 --dataset 与 --split-manifest")
        base = list(resolved["trainRows"])
        opts = dict(kv.split("=", 1) for kv in spec[len("train:"):].split(":") if "=" in kv)
        if "first" in opts:
            return base[: int(opts["first"])]
        offset = int(opts.get("offset", 0))
        count = int(opts.get("count", len(base) - offset))
        return base[offset:offset + count]
    if spec.startswith("file:"):
        path = spec[len("file:"):]
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            data = data.get("datasetRows") or data.get("rows") or []
        return [int(x) for x in data]
    raise ValueError(f"无法识别的 pool 规格：{spec!r}")


def build_batch_plan(
    *,
    sources: Sequence[Dict[str, Any]],
    batch_size: int,
    total_updates: int,
    updates_per_epoch: int,
    sample_ids_by_row: Dict[int, str] | None = None,
    seed: int = 0,
    note: str = "",
) -> Dict[str, Any]:
    """按「每个来源独立循环游标」生成确定性计划。

    来源 s 在第 u 次更新取 rows_s[(u*q_s + j) % len(rows_s)]（j=0..q_s-1），
    因此每个 key 的曝光次数在预算内相差不超过 1。
    """
    if sum(int(s["quota"]) for s in sources) != batch_size:
        raise ValueError("各来源配额之和必须等于 batchSize")
    for s in sources:
        if not s["rows"]:
            raise ValueError(f"来源 {s['name']!r} 的池为空")
    updates: List[Dict[str, Any]] = []
    cursors = {str(s["name"]): 0 for s in sources}
    for u in range(total_updates):
        items: List[Dict[str, Any]] = []
        for s in sources:
            name = str(s["name"])
            quota = int(s["quota"])
            rows = s["rows"]
            for j in range(quota):
                pos = (cursors[name] + j) % len(rows)
                row_index = int(rows[pos])
                item = {"source": name, "datasetRow": row_index}
                if sample_ids_by_row is not None and row_index in sample_ids_by_row:
                    item["sampleId"] = sample_ids_by_row[row_index]
                items.append(item)
            cursors[name] += quota
        updates.append({"updateIndex": u, "items": items})
    coverage: Dict[str, Any] = {}
    for s in sources:
        name = str(s["name"])
        exposures = int(s["quota"]) * total_updates
        pool = len(s["rows"])
        counts = {}
        for u in range(total_updates):
            for j in range(int(s["quota"])):
                row_index = int(s["rows"][(u * int(s["quota"]) + j) % pool])
                counts[row_index] = counts.get(row_index, 0) + 1
        coverage[name] = {
            "poolSize": pool,
            "quotaPerUpdate": int(s["quota"]),
            "plannedExposures": exposures,
            "uniqueRows": len(counts),
            "minExposuresPerRow": min(counts.values()) if counts else 0,
            "maxExposuresPerRow": max(counts.values()) if counts else 0,
            "everyRowCovered": len(counts) == pool,
        }
    return {
        "schema": PLAN_SCHEMA,
        "createdBy": "v15/tools/train_batch_plan.py",
        "note": note,
        "seed": int(seed),
        "batchSize": int(batch_size),
        "totalUpdates": int(total_updates),
        "updatesPerEpoch": int(updates_per_epoch),
        "sources": [
            {"name": str(s["name"]), "quota": int(s["quota"]),
             "poolSize": len(s["rows"]), "poolSpec": s.get("poolSpec"),
             "cycleRule": "cyclic_round_robin_independent_cursor"}
            for s in sources
        ],
        "coverage": coverage,
        "updates": updates,
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="生成确定性 v15_batch_plan_1")
    parser.add_argument("--out", required=True, help="输出 plan 路径")
    parser.add_argument("--dataset", default=None, help="数据集（pool=train 时需要）")
    parser.add_argument("--split-manifest", default=None, help="split manifest（pool=train 时需要）")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--total-updates", type=int, required=True)
    parser.add_argument("--updates-per-epoch", type=int, default=250,
                        help="每个 epoch 的更新数；同时决定验证/保存频率（协议：每 250 更新验证）")
    parser.add_argument("--source", action="append", default=[],
                        help="name=NAME,quota=Q,pool=SPEC（可重复）")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--note", default="")
    parser.add_argument("--refuse-overwrite", action="store_true", default=True)
    args = parser.parse_args(argv)

    resolved = None
    if args.dataset and args.split_manifest:
        resolved = resolve_train_rows(args.dataset, args.split_manifest)
    sample_ids_by_row = None
    if resolved is not None:
        sample_ids_by_row = {row: sid for row, sid in
                             zip(resolved["trainRows"], resolved["trainSampleIds"])}

    sources = []
    for raw in args.source:
        fields = dict(kv.split("=", 1) for kv in raw.split(",") if "=" in kv)
        for required in ("name", "quota", "pool"):
            if required not in fields:
                raise SystemExit(f"--source 缺少 {required}：{raw!r}")
        rows = parse_pool_spec(fields["pool"], resolved)
        sources.append({"name": fields["name"], "quota": int(fields["quota"]),
                        "rows": rows, "poolSpec": fields["pool"]})
    if not sources:
        raise SystemExit("至少需要一个 --source")

    plan = build_batch_plan(sources=sources, batch_size=args.batch_size,
                            total_updates=args.total_updates,
                            updates_per_epoch=args.updates_per_epoch,
                            sample_ids_by_row=sample_ids_by_row,
                            seed=args.seed, note=args.note)
    if resolved is not None:
        plan["dataset"] = {
            "path": resolved["datasetPath"], "sha256": resolved["datasetSha256"],
            "splitManifestPath": resolved["splitManifestPath"],
            "splitManifestSha256": resolved["splitManifestSha256"],
            "trainRowCount": len(resolved["trainRows"]),
        }
    out_path = Path(args.out)
    if out_path.exists() and args.refuse_overwrite:
        raise SystemExit(f"拒绝覆盖已存在的 plan：{out_path}")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(plan, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"[BatchPlan] -> {out_path} sha256={sha256_file(out_path)}")
    for name, cov in plan["coverage"].items():
        print(f"  source={name} quota={cov['quotaPerUpdate']} pool={cov['poolSize']} "
              f"plannedExposures={cov['plannedExposures']} uniqueRows={cov['uniqueRows']} "
              f"exposureRange=[{cov['minExposuresPerRow']},{cov['maxExposuresPerRow']}] "
              f"allCovered={cov['everyRowCovered']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
