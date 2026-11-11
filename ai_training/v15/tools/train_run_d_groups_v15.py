"""V15/T15-08：D0/D1/D2 九次受控训练的执行驱动（owner C）。

设计要点（对应协议 §3.2 与任务书 §9.2）：

1. **同 seed 三组从同一初始权重字节开始**：都用 `T15-06/c2_s<seed>/c2_s<seed>_final.json`，
   驱动脚本在启动前记录该文件的 sha256 并写进每次运行的 `run_identity.json`。
2. **统一重建 optimizer/scheduler**：`--init-checkpoint` 是 weights-only warm-start，
   不复用 C2 的动量（C2 的 `.state.pt` 只在需要精确续跑时才用，本实验不用）。
3. **预算固定**：1,500 更新、batch 32 → 48,000 曝光；LR 1e-4 → 1e-5 的 update 余弦；weightDecay=1e-4。
4. **必须显式声明 V15 schema**：否则导出权重会被标成 v14，TS 端 fail-fast 拒绝加载
   （本会话实测过的真实缺陷）。
5. **失败不掩盖**：任何一次运行非零退出即记录 stderr/stdout 尾部并继续下一组，
   最后以非零退出码汇总；已成功的组不会被重跑（幂等）。
6. **已验证的前置缺陷修复**：`PlanBatchSampler` 现在把 plan 的绝对行号映射成 Subset 位置。
   没有这个映射时 D1/D2 会抛 `IndexError: list index out of range`（D0 因为池在文件前缀内而侥幸成功）。

用法：

    python v15/tools/train_run_d_groups_v15.py --run-id v15_20260925_core
    python v15/tools/train_run_d_groups_v15.py --run-id v15_20260925_core --arms D1,D2 --seeds 42
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_PYTHON = r"C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe"
ENCODER_SCHEMA = "spatial26_global20_actionSemantics53_v15"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def planned_row_positions(run_dir: Path, plan: dict, train_indices: set[int]) -> dict:
    """复算 plan 的行号 -> train 位置映射，并给出恒等性判定。

    用途：把「plan 引用了哪些行、这些行是否恰好是文件前缀」写进运行身份，
    让第三方能独立核对 D1/D2 的映射是否真的非恒等。
    """
    rows = sorted({int(it["datasetRow"]) for e in plan["updates"] for it in e["items"]})
    ordered_train = sorted(train_indices)
    position = {row: pos for pos, row in enumerate(ordered_train)}
    identity = all(row == pos for row, pos in position.items())
    return {
        "distinctRowsReferenced": len(rows),
        "minRow": rows[0] if rows else None,
        "maxRow": rows[-1] if rows else None,
        "trainRowCount": len(ordered_train),
        "rowToPositionIsIdentity": identity,
        "note": "恒等=False 表示 train 不是文件前缀，必须做行号->位置映射（V15/T15-08 修复）。",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--arms", default="D0,D1,D2")
    parser.add_argument("--seeds", default="42,1337,2026")
    parser.add_argument("--python", default=os.environ.get("V15_PYTHON") or DEFAULT_PYTHON)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--lr-min", type=float, default=1e-5)
    parser.add_argument("--updates", type=int, default=1500)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--updates-per-epoch", type=int, default=250)
    parser.add_argument("--epochs", type=int, default=6)
    parser.add_argument("--force", action="store_true",
                        help="允许覆盖本轮已经成功产出的同名产物（默认拒绝，防止覆盖证据）")
    args = parser.parse_args()

    run_dir = REPO / "v15" / "out" / args.run_id
    d_dir = run_dir / "T15-08"
    c2_dir = run_dir / "T15-06"
    if not d_dir.exists():
        print(f"缺少 D 组目录：{d_dir}", file=sys.stderr)
        return 2

    arms = [a.strip() for a in args.arms.split(",") if a.strip()]
    seeds = [int(s) for s in args.seeds.split(",") if s.strip()]

    results = []
    for seed in seeds:
        c2_final = c2_dir / f"c2_s{seed}" / f"c2_s{seed}_final.json"
        if not c2_final.exists():
            results.append({"arm": None, "seed": seed, "status": "MISSING_C2_FINAL",
                            "path": str(c2_final)})
            continue
        init_sha = sha256_file(c2_final)
        for arm in arms:
            arm_l = arm.lower()
            plan = d_dir / f"plan_{arm_l}.json"
            if arm_l == "d0":
                # D0 是「只重复旧训练池」的控制组：它的数据集与 split 就是 C2 用的那一份
                # （`plan_d0.json` 里内嵌的 dataset 字段也指向它）。D 组目录下**没有**
                # 独立的 dataset_d0_train.jsonl / split_manifest_d0.json —— 这是设计如此，
                # 因为 D0 与 C2 必须吃同一份旧池，单独复制一份反而会引入身份分叉。
                dataset = c2_dir / "dataset_v15_clean.jsonl"
                manifest = c2_dir / "split_manifest_v15_clean.json"
            else:
                dataset = d_dir / f"dataset_{arm_l}_train.jsonl"
                manifest = d_dir / f"split_manifest_{arm_l}.json"
            missing = [str(p) for p in (plan, dataset, manifest) if not p.exists()]
            if missing:
                results.append({"arm": arm, "seed": seed, "status": "MISSING_INPUT", "missing": missing})
                continue

            out_dir = d_dir / f"{arm_l}_s{seed}"
            out_dir.mkdir(parents=True, exist_ok=True)
            best = out_dir / f"{arm_l}_s{seed}_best.json"
            final = out_dir / f"{arm_l}_s{seed}_final.json"
            state = out_dir / f"{arm_l}_s{seed}.state.pt"
            metrics = out_dir / f"{arm_l}_s{seed}_metrics.json"
            opt = out_dir / f"{arm_l}_s{seed}_optimized.json"
            log = out_dir / "train.log"

            if final.exists() and metrics.exists() and not args.force:
                results.append({"arm": arm, "seed": seed, "status": "ALREADY_DONE",
                                "finalSha256": sha256_file(final)})
                print(f"[skip] {arm} seed={seed} 已完成：{final.name}")
                continue

            cmd = [
                args.python, str(REPO / "python" / "train_spatial_resnet.py"),
                "--dataset", str(dataset), "--split-manifest", str(manifest),
                "--batch-plan", str(plan), "--init-checkpoint", str(c2_final),
                "--model-version", "spatial-resnet-v2", "--num-blocks", "2",
                "--batch-size", str(args.batch_size), "--epochs", str(args.epochs),
                "--global-update-limit", str(args.updates),
                "--lr-schedule", "cosine-to-min", "--lr-schedule-unit", "update",
                "--lr-total-updates", str(args.updates),
                "--lr", repr(args.lr), "--lr-min", repr(args.lr_min),
                "--weight-decay", "0.0001", "--value-weight", "0.0",
                "--seed", str(seed), "--split-seed", str(seed),
                "--data-order-seed", "314159",
                "--encoder-schema-id", ENCODER_SCHEMA,
                "--save-at-updates", f"500,{args.updates}",
                "--out-model", str(best), "--out-final-model", str(final),
                "--out-state", str(state), "--out-metrics", str(metrics),
                "--optimized-manifest", str(opt),
            ]

            plan_data = json.loads(plan.read_text(encoding="utf-8"))
            manifest_data = json.loads(manifest.read_text(encoding="utf-8"))
            train_rows = set()
            for key in ("trainRowIndices", "train_rows", "trainRowIds"):
                if key in manifest_data:
                    train_rows = set(int(v) for v in manifest_data[key])
                    break
            if not train_rows:
                # manifest 只给家族时，按数据集行的 partition 字段反推 train 行号。
                with dataset.open("r", encoding="utf-8") as handle:
                    for idx, line in enumerate(handle):
                        if not line.strip():
                            continue
                        if json.loads(line).get("partition") == "train":
                            train_rows.add(idx)

            identity = {
                "schema": "v15_d_group_run_identity_1",
                "arm": arm,
                "seed": seed,
                "initCheckpoint": str(c2_final.relative_to(REPO)).replace(os.sep, "/"),
                "initCheckpointSha256": init_sha,
                "dataset": str(dataset.relative_to(REPO)).replace(os.sep, "/"),
                "datasetSha256": sha256_file(dataset),
                "splitManifest": str(manifest.relative_to(REPO)).replace(os.sep, "/"),
                "splitManifestSha256": sha256_file(manifest),
                "batchPlan": str(plan.relative_to(REPO)).replace(os.sep, "/"),
                "batchPlanSha256": sha256_file(plan),
                "encoderSchemaId": ENCODER_SCHEMA,
                "updates": args.updates,
                "batchSize": args.batch_size,
                "plannedExposures": args.updates * args.batch_size,
                "lrMax": args.lr,
                "lrMin": args.lr_min,
                "lrSchedule": "cosine, unit=update",
                "weightDecay": 1e-4,
                "optimizerRebuilt": True,
                "warmStartIsWeightsOnly": True,
                "planRowMapping": planned_row_positions(d_dir, plan_data, train_rows),
                "sources": {s["name"]: s["quota"] for s in plan_data["sources"]},
                "command": " ".join(cmd),
            }
            (out_dir / "run_identity.json").write_text(
                json.dumps(identity, ensure_ascii=False, indent=1), encoding="utf-8")
            (out_dir / "train_command.txt").write_text(" ".join(cmd), encoding="utf-8")

            print(f"[run] {arm} seed={seed} init={init_sha[:12]} "
                  f"mappingIdentity={identity['planRowMapping']['rowToPositionIsIdentity']}")
            started = time.time()
            # 训练器输出含中文与不可解码字节；用 errors="replace" 并显式 utf-8，
            # 否则在 GBK 默认 locale 下 `subprocess` 的读取线程会抛 UnicodeDecodeError
            # （实测：进程本身成功，但驱动侧拿不到 stdout/stderr）。
            proc = subprocess.run(cmd, cwd=str(REPO), capture_output=True, text=True,
                                  encoding="utf-8", errors="replace",
                                  timeout=7200, env={**os.environ, "PYTHONIOENCODING": "utf-8"})
            wall = time.time() - started
            log.write_text((proc.stdout or "") + "\n--- STDERR ---\n" + (proc.stderr or ""),
                           encoding="utf-8")
            entry = {
                "arm": arm, "seed": seed,
                "status": "OK" if proc.returncode == 0 and final.exists() else "FAILED",
                "returncode": proc.returncode,
                "wallMs": int(wall * 1000),
                "initCheckpointSha256": init_sha,
                "finalSha256": sha256_file(final) if final.exists() else None,
                "plannedExposures": args.updates * args.batch_size,
                "rowToPositionIsIdentity": identity["planRowMapping"]["rowToPositionIsIdentity"],
                "stdoutTail": "\n".join((proc.stdout or "").splitlines()[-6:]),
                "stderrTail": "\n".join((proc.stderr or "").splitlines()[-6:]),
            }
            results.append(entry)
            print(f"[done] {arm} seed={seed} status={entry['status']} wall={wall:.0f}s "
                  f"final={entry['finalSha256'][:12] if entry['finalSha256'] else None}")

    summary_path = d_dir / "d_group_run_summary.json"
    existing = []
    if summary_path.exists():
        try:
            existing = json.loads(summary_path.read_text(encoding="utf-8")).get("runs", [])
        except Exception:
            existing = []
    merged: dict[tuple, dict] = {}
    for e in existing + results:
        if e.get("arm") and e.get("seed") is not None:
            merged[(e["arm"], e["seed"])] = e
    payload = {
        "schema": "v15_d_group_run_summary_1",
        "task": "T15-08",
        "runId": args.run_id,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "planned": {"arms": arms, "seeds": seeds,
                    "runs": len(arms) * len(seeds),
                    "updatesPerRun": args.updates,
                    "exposuresPerRun": args.updates * args.batch_size},
        "runs": [merged[k] for k in sorted(merged)],
    }
    summary_path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    ok = [r for r in results if r.get("status") in ("OK", "ALREADY_DONE")]
    bad = [r for r in results if r.get("status") not in ("OK", "ALREADY_DONE")]
    print(f"[T15-08] 本轮完成 {len(ok)} 组，失败/缺失 {len(bad)} 组")
    for r in bad:
        print(f"  BAD {r.get('arm')} seed={r.get('seed')} status={r.get('status')}")
    return 0 if not bad else 1


if __name__ == "__main__":
    raise SystemExit(main())
