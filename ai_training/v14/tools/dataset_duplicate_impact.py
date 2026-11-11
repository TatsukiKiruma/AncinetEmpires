"""V14/T14-02 补项：离线指标上的**重复样本**影响量化（任务书 0.1 与 T14-00 步骤 6 要求）。

背景（本轮实测）：
`v14/out/v14_20260924_t14/T14-02/dataset_v14.jsonl` 有 9547 行、9103 个不同的
「空间张量 + 全局特征」状态编码。按 root 家族切分保证了 lineage 不交叉，
但不同独立随机流的对局会**独立复现同一个局面**（实测：150 组完全相同
（状态 + 候选 + 目标动作）的行跨越了 train/val/test 分区）。
任务书要求：跨分区完全相同的状态必须查重、标记，并排除会抬高离线成绩的重复评估。

本脚本做三件事：
1. 统计：重复组、跨分区重复组、各分区行数与去重后行数；
2. 影响：用给定检查点在**全部行**上算 top-1/CE，再在**按状态编码去重**的子集上重算，
   给出差值；
3. 台账：把跨分区重复的状态写成清单，供后续实验排除或加权。

用法：
    py v14/tools/dataset_duplicate_impact.py --dataset <dataset.jsonl> \
        --checkpoint <model.json> --out-dir <dir> [--splits <split_manifest.json>]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "python"))


def _bits(values) -> bytes:
    out = bytearray()
    for value in values:
        number = float(value)
        out += struct.pack("<I", 0x7FC00000) if number != number else struct.pack("<f", number)
    return bytes(out)


def state_key(row: Dict[str, Any]) -> str:
    digest = hashlib.sha256()
    digest.update(_bits(row["spatialTensor"]))
    digest.update(_bits(row["globalFeatures"]))
    return digest.hexdigest()


def sample_key(row: Dict[str, Any]) -> str:
    """完全相同任务的身份：状态 + 候选 + 目标动作。"""
    digest = hashlib.sha256()
    digest.update(state_key(row).encode("ascii"))
    for index, candidate in enumerate(row["candidateActions"]):
        digest.update(json.dumps([
            candidate.get("actorCoord"), candidate.get("landingCoord"), candidate.get("targetCoord"),
        ], sort_keys=True).encode("utf-8"))
        digest.update(_bits(candidate.get("semantics", [])))
        digest.update(str(row["candidateActionCodes"][index]).encode("utf-8"))
    digest.update(str(row["targetActionCode"]).encode("utf-8"))
    return digest.hexdigest()


def load_rows(path: Path) -> List[Dict[str, Any]]:
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def evaluate(rows: List[Dict[str, Any]], checkpoint: Path) -> Dict[str, Any]:
    import numpy as np
    import torch

    import train_spatial_resnet as trainer
    from spatial_resnet_model import SpatialResNet, load_model_from_ts_json

    sem_dims = {len(c.get("semantics", [])) for row in rows for c in row["candidateActions"]}
    channels = {len(row["spatialTensor"]) // 400 for row in rows}
    globals_dim = {len(row["globalFeatures"]) for row in rows}
    if len(sem_dims) != 1 or len(channels) != 1 or len(globals_dim) != 1:
        raise SystemExit(f"维度不唯一：sem={sem_dims} channels={channels} globals={globals_dim}")
    sem_dim = sem_dims.pop()
    spatial_channels = channels.pop()
    glob_dim = globals_dim.pop()

    model = SpatialResNet(
        spatial_channels=spatial_channels, trunk_channels=32, global_dim=glob_dim,
        action_semantic_dim=sem_dim, version="spatial-resnet-v2", num_blocks=2,
    )
    load_model_from_ts_json(model, str(checkpoint))
    model.eval()
    ce = torch.nn.CrossEntropyLoss()

    by_partition: Dict[str, List[int]] = defaultdict(lambda: [0, 0])
    losses = []
    with torch.no_grad():
        for row in rows:
            spatial = torch.tensor(row["spatialTensor"], dtype=torch.float32).reshape(1, spatial_channels, 20, 20)
            glob = torch.tensor(row["globalFeatures"], dtype=torch.float32).unsqueeze(0)
            z = model.forward_trunk(spatial)[0]
            candidates = row["candidateActions"]

            def pool(coords):
                out = []
                for coord in coords:
                    if not coord or coord.get("x", -1) < 0 or coord.get("y", -1) < 0:
                        out.append(torch.zeros(32, dtype=torch.float32))
                    else:
                        out.append(z[:, coord["y"], coord["x"]])
                return torch.stack(out)

            v_act = pool([c.get("actorCoord") for c in candidates])
            v_land = pool([c.get("landingCoord") for c in candidates])
            v_tgt = pool([c.get("targetCoord") for c in candidates])
            sem = np.stack([
                list(c.get("semantics", []))[:sem_dim] + [0.0] * max(0, sem_dim - len(c.get("semantics", [])))
                for c in candidates
            ]).astype("float32")
            feats = torch.cat([
                v_act, v_land, v_tgt, torch.from_numpy(sem),
                glob[0].unsqueeze(0).expand(len(candidates), -1),
            ], dim=-1).unsqueeze(0)
            logits = model.forward_action_logits(feats)[0]
            target = int(row["targetActionIndex"])
            loss = float(ce(logits.unsqueeze(0), torch.tensor([target])).item())
            losses.append(loss)
            partition = str(row.get("partition") or "unknown")
            by_partition[partition][1] += 1
            if int(torch.argmax(logits).item()) == target:
                by_partition[partition][0] += 1

    total = len(rows)
    correct = sum(v[0] for v in by_partition.values())
    return {
        "states": total,
        "top1": correct / total if total else None,
        "meanCrossEntropy": sum(losses) / len(losses) if losses else None,
        "byPartition": {
            key: {"states": value[1], "top1": (value[0] / value[1]) if value[1] else None}
            for key, value in sorted(by_partition.items())
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V14/T14-02 重复样本影响量化")
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--checkpoint", default=None)
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    dataset = Path(args.dataset)
    rows = load_rows(dataset)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    by_state: Dict[str, List[int]] = defaultdict(list)
    by_sample: Dict[str, List[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        by_state[state_key(row)].append(index)
        by_sample[sample_key(row)].append(index)

    state_dupes = {key: value for key, value in by_state.items() if len(value) > 1}
    sample_dupes = {key: value for key, value in by_sample.items() if len(value) > 1}
    cross_partition = []
    for key, indices in sample_dupes.items():
        partitions = {str(rows[i].get("partition")) for i in indices}
        if len(partitions) > 1:
            cross_partition.append({
                "sampleKey": key[:16],
                "partitions": sorted(partitions),
                "sampleIds": [rows[i]["sampleId"] for i in indices],
                "rootFamilyIds": [rows[i].get("rootFamilyId") for i in indices],
                "targetActionCode": rows[indices[0]].get("targetActionCode"),
            })

    the_partition_counts = Counter(str(row.get("partition")) for row in rows)
    dedup_indices = [indices[0] for indices in by_sample.values()]
    dedup_counts = Counter(str(rows[i].get("partition")) for i in dedup_indices)

    report: Dict[str, Any] = {
        "schema": "v14_dataset_duplicate_impact_1",
        "task": "T14-02",
        "dataset": str(dataset).replace("\\", "/"),
        "rows": len(rows),
        "distinctStateEncodings": len(by_state),
        "distinctSampleTasks": len(by_sample),
        "duplicateStateGroups": len(state_dupes),
        "duplicateSampleGroups": len(sample_dupes),
        "rowsInDuplicateSampleGroups": sum(len(v) for v in sample_dupes.values()),
        "crossPartitionDuplicateGroups": len(cross_partition),
        "partitionRows": dict(the_partition_counts),
        "partitionRowsAfterDedup": dict(dedup_counts),
        "crossPartitionExamples": cross_partition[:20],
    }

    if args.checkpoint:
        checkpoint = Path(args.checkpoint)
        # 中文：每个状态只前向一次，按「行属于哪些口径」累加正确数 ——
        # 全量 9547 行 × 5 个口径如果各跑一次要十几分钟，这里一次前向覆盖全部口径。
        train_keys = {sample_key(row) for row in rows if str(row.get("partition")) == "train"}
        dedup_index_set = set(dedup_indices)

        def evaluate_once() -> Dict[str, Any]:
            import numpy as np
            import torch

            import train_spatial_resnet as trainer  # noqa: F401
            from spatial_resnet_model import SpatialResNet, load_model_from_ts_json

            sem_dims = {len(c.get("semantics", [])) for row in rows for c in row["candidateActions"]}
            channels = {len(row["spatialTensor"]) // 400 for row in rows}
            globals_dim = {len(row["globalFeatures"]) for row in rows}
            if len(sem_dims) != 1 or len(channels) != 1 or len(globals_dim) != 1:
                raise SystemExit(f"维度不唯一：sem={sem_dims} channels={channels} globals={globals_dim}")
            sem_dim = sem_dims.pop()
            spatial_channels = channels.pop()
            glob_dim = globals_dim.pop()
            model = SpatialResNet(
                spatial_channels=spatial_channels, trunk_channels=32, global_dim=glob_dim,
                action_semantic_dim=sem_dim, version="spatial-resnet-v2", num_blocks=2,
            )
            load_model_from_ts_json(model, str(checkpoint))
            model.eval()
            ce = torch.nn.CrossEntropyLoss()

            # 口径定义
            buckets: Dict[str, List[int]] = {
                "full": [0, 0],
                "dedup": [0, 0],
                "train": [0, 0],
                "val": [0, 0],
                "test": [0, 0],
                "valNoTrainDup": [0, 0],
                "testNoTrainDup": [0, 0],
            }
            loss_sum = 0.0
            with torch.no_grad():
                for index, row in enumerate(rows):
                    spatial = torch.tensor(row["spatialTensor"], dtype=torch.float32).reshape(
                        1, spatial_channels, 20, 20)
                    glob = torch.tensor(row["globalFeatures"], dtype=torch.float32).unsqueeze(0)
                    z = model.forward_trunk(spatial)[0]
                    candidates = row["candidateActions"]

                    def pool(coords):
                        out = []
                        for coord in coords:
                            if not coord or coord.get("x", -1) < 0 or coord.get("y", -1) < 0:
                                out.append(torch.zeros(32, dtype=torch.float32))
                            else:
                                out.append(z[:, coord["y"], coord["x"]])
                        return torch.stack(out)

                    v_act = pool([c.get("actorCoord") for c in candidates])
                    v_land = pool([c.get("landingCoord") for c in candidates])
                    v_tgt = pool([c.get("targetCoord") for c in candidates])
                    sem = np.stack([
                        list(c.get("semantics", []))[:sem_dim]
                        + [0.0] * max(0, sem_dim - len(c.get("semantics", [])))
                        for c in candidates
                    ]).astype("float32")
                    feats = torch.cat([
                        v_act, v_land, v_tgt, torch.from_numpy(sem),
                        glob[0].unsqueeze(0).expand(len(candidates), -1),
                    ], dim=-1).unsqueeze(0)
                    logits = model.forward_action_logits(feats)[0]
                    target = int(row["targetActionIndex"])
                    loss_sum += float(ce(logits.unsqueeze(0), torch.tensor([target])).item())
                    hit = 1 if int(torch.argmax(logits).item()) == target else 0
                    partition = str(row.get("partition"))
                    key = sample_key(row)
                    leak = key in train_keys

                    def add(bucket: str) -> None:
                        buckets[bucket][0] += hit
                        buckets[bucket][1] += 1

                    add("full")
                    if index in dedup_index_set:
                        add("dedup")
                    if partition in ("train", "val", "test"):
                        add(partition)
                    if partition == "val" and not leak:
                        add("valNoTrainDup")
                    if partition == "test" and not leak:
                        add("testNoTrainDup")

            def ratio(bucket: str):
                correct, total = buckets[bucket]
                return (correct / total) if total else None

            return {
                "top1Full": ratio("full"),
                "top1Dedup": ratio("dedup"),
                "meanCrossEntropy": loss_sum / len(rows) if rows else None,
                "byPartition": {
                    name: {"states": buckets[name][1], "top1": ratio(name)}
                    for name in ("train", "val", "test", "valNoTrainDup", "testNoTrainDup")
                },
            }

        single = evaluate_once()
        report["evaluation"] = single
        report["dedupDelta"] = {
            "top1Full": single["top1Full"],
            "top1Dedup": single["top1Dedup"],
            "delta": (single["top1Full"] or 0.0) - (single["top1Dedup"] or 0.0),
        }
        report["partitionLeakageImpact"] = single["byPartition"]

    (out_dir / "dataset_duplicate_impact.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    print(f"[T14-02] rows={report['rows']} distinctTasks={report['distinctSampleTasks']} "
          f"跨分区重复组={report['crossPartitionDuplicateGroups']}")
    print(f"[T14-02] partitionRows={report['partitionRows']} afterDedup={report['partitionRowsAfterDedup']}")
    if "dedupDelta" in report:
        print(f"[T14-02] top1 full={report['dedupDelta']['top1Full']:.4f} "
              f"dedup={report['dedupDelta']['top1Dedup']:.4f} delta={report['dedupDelta']['delta']:.4f}")
    print(f"[T14-02] -> {out_dir / 'dataset_duplicate_impact.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
