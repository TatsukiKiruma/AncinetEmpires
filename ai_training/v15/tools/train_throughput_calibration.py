"""V15/T15-03：真实吞吐量与墙钟预算校准。

协议 §3.3 要求「前 100 更新校准速度/内存；输出总预算预计墙钟，不根据准确率修改主预算」。
本工具用**真实数据集**（默认 T14-02 的 6400 train / 1600 val）跑 100 次更新，记录：

  - 每更新耗时（来自训练器台账里每次 optimizer.step 的实测 durationMs）
  - 进程墙钟（含数据加载与导出）
  - 峰值 RSS（父进程用 psutil 轮询子进程）
  - 据此外推 22,500 次更新的预计墙钟

主预算数值由协议规定，本工具只做测量与外推，不改协议。
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Sequence

REPO_ROOT = Path(__file__).resolve().parents[2]
TRAINER = REPO_ROOT / "python" / "train_spatial_resnet.py"
DEFAULT_PYTHON = r"C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe"
PROTOCOL_TOTAL_UPDATES = 22500  # 3*3000 + 3*3*1500（V15_EXPERIMENT_PROTOCOL §3.3）
PROTOCOL_RUN_COUNT = 12         # 3 个 C2 + 9 个 D 组运行，每个运行都要重新加载数据


def sha256_file(path: str | os.PathLike[str]) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def read_ledger(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def run_calibration(*, dataset: str, split_manifest: str, work_dir: Path, python: str,
                    updates: int = 100, batch_size: int = 32, lr_total_updates: int = 3000,
                    lr: float = 1e-3, lr_min: float = 1e-5, num_blocks: int = 2,
                    torch_threads: int | None = None, epochs: int = 1) -> Dict[str, Any]:
    work_dir.mkdir(parents=True, exist_ok=True)
    out_model = work_dir / "calib_model.json"
    metrics_path = work_dir / "calib_metrics.json"
    opt_path = work_dir / "calib_opt.json"
    state_path = work_dir / "calib.state.pt"
    cmd = [
        python, str(TRAINER),
        "--dataset", dataset,
        "--split-manifest", split_manifest,
        "--epochs", str(epochs),
        "--batch-size", str(batch_size),
        "--num-blocks", str(num_blocks),
        "--lr", str(lr), "--lr-min", str(lr_min),
        "--lr-schedule", "cosine-to-min",
        "--lr-schedule-unit", "update",
        "--lr-total-updates", str(lr_total_updates),
        "--global-update-limit", str(updates),
        "--out-model", str(out_model),
        "--out-metrics", str(metrics_path),
        "--optimized-manifest", str(opt_path),
        "--out-state", str(state_path),
    ]
    env = dict(os.environ)
    env.pop("PYTHONIOENCODING", None)
    if torch_threads is not None:
        env["OMP_NUM_THREADS"] = str(torch_threads)
        env["MKL_NUM_THREADS"] = str(torch_threads)
    try:
        import psutil
    except ImportError:  # pragma: no cover
        psutil = None

    started = time.time()
    proc = subprocess.Popen(cmd, cwd=str(REPO_ROOT), stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, env=env)
    peak_rss = 0
    peak_vms = 0
    samples = 0
    child = None
    if psutil is not None:
        try:
            child = psutil.Process(proc.pid)
        except Exception:  # pragma: no cover
            child = None
    while proc.poll() is None:
        if child is not None:
            try:
                info = child.memory_info()
                peak_rss = max(peak_rss, info.rss)
                peak_vms = max(peak_vms, info.vms)
                samples += 1
            except Exception:  # pragma: no cover - 子进程退出瞬间
                pass
        time.sleep(0.25)
    stdout, stderr = proc.communicate()
    process_wall_ms = int((time.time() - started) * 1000)
    if proc.returncode != 0:
        raise RuntimeError(
            f"校准训练退出 {proc.returncode}\nstdout:\n{stdout[-3000:]}\nstderr:\n{stderr[-3000:]}")

    ledger = read_ledger(out_model.with_name(out_model.stem + ".optimizer_update_ledger.jsonl"))
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    durations = [float(e.get("durationMs", 0.0)) for e in ledger]
    if not durations:
        raise RuntimeError("台账里没有 per-update durationMs，无法计算吞吐")
    updates_timed = len(durations)
    wall_ms = sum(durations)
    ms_per_update = wall_ms / updates_timed
    # 去掉前 10 次更新（warmup：线程池/内存分配/首轮 cache）后的稳态值，作为外推主依据。
    steady = durations[10:] or durations
    ms_per_update_steady = sum(steady) / len(steady)
    torch_threads_reported = None
    for line in stdout.splitlines():
        if "CPU Threads:" in line:
            try:
                torch_threads_reported = int(line.split("CPU Threads:")[1].strip().rstrip(")"))
            except ValueError:
                pass
    projection_ms = ms_per_update_steady * PROTOCOL_TOTAL_UPDATES
    return {
        "schema": "v15_throughput_calibration_1",
        "taskId": "T15-03",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "command": " ".join(cmd),
        "trainerPath": str(TRAINER),
        "trainerSha256": sha256_file(TRAINER),
        "dataset": str(Path(dataset).resolve()),
        "splitManifest": str(Path(split_manifest).resolve()),
        "datasetSha256": sha256_file(dataset),
        "splitManifestSha256": sha256_file(split_manifest),
        "updatesTimed": updates_timed,
        "wallMs": int(round(wall_ms)),
        "msPerUpdate": ms_per_update,
        "msPerUpdateSteadyState": ms_per_update_steady,
        "firstUpdateMs": durations[0],
        "lastUpdateMs": durations[-1],
        "minUpdateMs": min(durations),
        "maxUpdateMs": max(durations),
        "processWallMs": process_wall_ms,
        "setupAndLoadMs": max(0, process_wall_ms - int(round(wall_ms))),
        "projectedMsFor22500Updates": projection_ms,
        "projectedHoursFor22500Updates": projection_ms / 3_600_000.0,
        "projectedHoursFor22500UpdatesUsingMeanOfAllTimed": (ms_per_update * PROTOCOL_TOTAL_UPDATES) / 3_600_000.0,
        "projectionBasis": "msPerUpdateSteadyState（剔除前 10 次 warmup）",
        "protocolRunCount": PROTOCOL_RUN_COUNT,
        "setupAndLoadMsPerRun": max(0, process_wall_ms - int(round(wall_ms))),
        "projectedSetupMsForProtocolRuns": max(0, process_wall_ms - int(round(wall_ms))) * PROTOCOL_RUN_COUNT,
        "projectedEndToEndMsForProtocolRuns": (projection_ms
                                              + max(0, process_wall_ms - int(round(wall_ms))) * PROTOCOL_RUN_COUNT),
        "projectedEndToEndHoursForProtocolRuns": (projection_ms + max(
            0, process_wall_ms - int(round(wall_ms))) * PROTOCOL_RUN_COUNT) / 3_600_000.0,
        "projectionCaveats": [
            "只计训练与每次运行的固定开销；未计每 250 更新一次的验证（1600 行前向，量级 ~1 s/次）。",
            "未计权重导出与 state 保存（每次运行一次，量级 <1 s）。",
            "正式数据换成 T15-04 冻结池后候选数与行宽可能变化，需重测。",
        ],
        "torchThreads": torch_threads_reported,
        "torchThreadsEnvOverride": torch_threads,
        "device": "cpu",
        "cudaAvailable": False,
        "peakRssBytes": peak_rss or None,
        "peakRssGiB": (peak_rss / (1024 ** 3)) if peak_rss else None,
        "memorySamples": samples,
        "batchSize": batch_size,
        "lrTotalUpdatesForSchedule": lr_total_updates,
        "stopReason": metrics["lifecycle"]["stopReason"],
        "finalSelectedAtUpdate": metrics["artifacts"]["final"]["selectedAtUpdate"],
        "measuredExposures": json.loads(opt_path.read_text(encoding="utf-8"))["totalExposures"],
        "protocolTotalUpdates": PROTOCOL_TOTAL_UPDATES,
        "stdoutTail": "\n".join(stdout.splitlines()[-8:]),
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="T15-03 真实吞吐量校准（100 更新）")
    parser.add_argument("--dataset",
                        default=str(REPO_ROOT / "v14/out/v14_20260924_t14/T14-02/dataset_v14.jsonl"))
    parser.add_argument("--split-manifest",
                        default=str(REPO_ROOT / "v14/out/v14_20260924_t14/T14-02/split_manifest.json"))
    parser.add_argument("--work-dir", required=True)
    parser.add_argument("--out", required=True, help="throughput_calibration.json 输出路径")
    parser.add_argument("--python", default=os.environ.get("V15_PYTHON", DEFAULT_PYTHON))
    parser.add_argument("--updates", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--torch-threads", type=int, default=None,
                        help="设置 OMP/MKL 线程数；默认沿用 torch 默认（本机 8）")
    args = parser.parse_args(argv)
    result = run_calibration(dataset=args.dataset, split_manifest=args.split_manifest,
                             work_dir=Path(args.work_dir), python=args.python,
                             updates=args.updates, batch_size=args.batch_size,
                             torch_threads=args.torch_threads)
    out_path = Path(args.out)
    if out_path.exists():
        raise SystemExit(f"拒绝覆盖已存在的产物：{out_path}")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[T15-03] -> {out_path}")
    print(f"  updatesTimed={result['updatesTimed']} wallMs={result['wallMs']} "
          f"msPerUpdate={result['msPerUpdate']:.2f} "
          f"steady={result['msPerUpdateSteadyState']:.2f}")
    print(f"  22500 updates ≈ {result['projectedHoursFor22500Updates']:.2f} h "
          f"(steady) / {result['projectedHoursFor22500UpdatesUsingMeanOfAllTimed']:.2f} h (mean)")
    print(f"  peakRss={result['peakRssGiB']} GiB torchThreads={result['torchThreads']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
