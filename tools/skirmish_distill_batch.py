#!/usr/bin/env python3
"""按场景分片导出 skirmish 蒸馏 features。

这个脚本只负责调度现有 TypeScript 蒸馏导出器，避免在 Python 中重新实现游戏规则、
候选动作生成或 heuristic 评分逻辑。每个场景成功后会写入 .done.json，方便中断后续跑。
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="按场景分片导出 skirmish 蒸馏 features")
    parser.add_argument("--input", required=True, help="baseline episode JSONL")
    parser.add_argument("--out", required=True, help="合并后的 distill feature JSONL")
    parser.add_argument("--feature-dim", type=int, default=4096)
    parser.add_argument("--feature-extractor", default="hashed-action-v2")
    parser.add_argument("--max-candidates", type=int, default=64)
    parser.add_argument("--exclude-scenario", action="append", default=[])
    parser.add_argument("--include-timeout", action="store_true")
    parser.add_argument("--include-stopped", action="store_true")
    parser.add_argument("--parts-dir", default=None, help="分片输出目录，默认 <out>.parts")
    parser.add_argument("--force", action="store_true", help="重新生成已完成分片")
    return parser.parse_args()


def safe_name(value: str) -> str:
    safe = []
    for char in value:
        if char.isalnum() or char in ("-", "_"):
            safe.append(char)
        else:
            safe.append("_")
    return "".join(safe).strip("_") or "scenario"


def read_scenarios(input_file: Path, excluded: set[str], include_timeout: bool, include_stopped: bool) -> list[str]:
    scenarios: dict[str, int] = {}
    with input_file.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            line = line.strip()
            if not line:
                continue
            episode = json.loads(line)
            scenario_id = episode.get("scenario", {}).get("id")
            if not scenario_id:
                raise ValueError(f"第 {line_no} 行缺少 scenario.id")
            if scenario_id in excluded:
                continue
            summary = episode.get("summary", {})
            if not include_timeout and summary.get("timeout"):
                continue
            if not include_stopped and summary.get("stoppedByMaxSteps"):
                continue
            if summary.get("illegalActionCount", 0):
                continue
            scenarios[scenario_id] = scenarios.get(scenario_id, 0) + 1
    return sorted(scenarios)


def npm_command() -> str:
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if not npm:
        raise RuntimeError("未找到 npm，请确认 Node.js/npm 已安装并在 PATH 中")
    return npm


def run_export(args: argparse.Namespace, scenario_id: str, part_file: Path) -> None:
    command = [
        npm_command(),
        "run",
        "export:skirmish:distill",
        "--",
        "--input",
        str(Path(args.input).resolve()),
        "--out",
        str(part_file.resolve()),
        "--feature-dim",
        str(args.feature_dim),
        "--feature-extractor",
        args.feature_extractor,
        "--max-candidates",
        str(args.max_candidates),
        "--scenario",
        scenario_id,
    ]
    if args.include_timeout:
        command.append("--include-timeout")
    if args.include_stopped:
        command.append("--include-stopped")

    env = os.environ.copy()
    env.setdefault("FORCE_COLOR", "0")
    process = subprocess.Popen(
        command,
        cwd=Path.cwd(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    assert process.stdout is not None
    for line in process.stdout:
        print(line, end="", flush=True)
    return_code = process.wait()
    if return_code != 0:
        raise RuntimeError(f"场景导出失败：{scenario_id}，退出码 {return_code}")


def summarize_jsonl(path: Path) -> dict[str, Any]:
    samples = 0
    candidates = 0
    teacher_matches = 0
    scenarios: dict[str, dict[str, int]] = {}
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            sample = json.loads(line)
            samples += 1
            sample_candidates = sample.get("candidates", [])
            candidates += len(sample_candidates)
            label_action = sample.get("label", {}).get("actionCode")
            teacher_top = next((item for item in sample_candidates if item.get("teacherRank") == 0), None)
            if teacher_top and teacher_top.get("actionCode") == label_action:
                teacher_matches += 1
            scenario_id = sample.get("scenario", {}).get("id", "unknown")
            bucket = scenarios.setdefault(scenario_id, {"samples": 0, "candidates": 0})
            bucket["samples"] += 1
            bucket["candidates"] += len(sample_candidates)
    return {
        "samples": samples,
        "candidates": candidates,
        "averageCandidates": candidates / samples if samples else 0,
        "teacherLabelAgreement": teacher_matches / samples if samples else 0,
        "scenarios": scenarios,
    }


def write_done(done_file: Path, scenario_id: str, part_file: Path) -> None:
    summary = summarize_jsonl(part_file)
    payload = {
        "scenarioId": scenario_id,
        "partFile": str(part_file.resolve()),
        **summary,
    }
    done_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def concat_parts(part_files: list[Path], out_file: Path) -> None:
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with out_file.open("w", encoding="utf-8", newline="\n") as output:
        for part_file in part_files:
            with part_file.open("r", encoding="utf-8") as source:
                shutil.copyfileobj(source, output)


def main() -> int:
    args = parse_args()
    input_file = Path(args.input).resolve()
    out_file = Path(args.out).resolve()
    parts_dir = Path(args.parts_dir).resolve() if args.parts_dir else out_file.with_suffix(out_file.suffix + ".parts")
    parts_dir.mkdir(parents=True, exist_ok=True)

    excluded = set(args.exclude_scenario)
    scenarios = read_scenarios(input_file, excluded, args.include_timeout, args.include_stopped)
    if not scenarios:
        raise RuntimeError("没有可导出的场景，请检查过滤条件")

    print(f"准备导出 {len(scenarios)} 个场景，分片目录：{parts_dir}", flush=True)
    completed_parts: list[Path] = []
    for index, scenario_id in enumerate(scenarios, 1):
        stem = f"{index:02d}-{safe_name(scenario_id)}"
        part_file = parts_dir / f"{stem}.jsonl"
        done_file = parts_dir / f"{stem}.done.json"
        if not args.force and done_file.exists() and part_file.exists() and part_file.stat().st_size > 0:
            print(f"[{index}/{len(scenarios)}] 跳过已完成场景：{scenario_id}", flush=True)
            completed_parts.append(part_file)
            continue
        print(f"[{index}/{len(scenarios)}] 导出场景：{scenario_id}", flush=True)
        run_export(args, scenario_id, part_file)
        write_done(done_file, scenario_id, part_file)
        completed_parts.append(part_file)

    print(f"合并 {len(completed_parts)} 个分片到：{out_file}", flush=True)
    concat_parts(completed_parts, out_file)
    summary = summarize_jsonl(out_file)
    manifest = {
        "input": str(input_file),
        "out": str(out_file),
        "partsDir": str(parts_dir),
        "featureDim": args.feature_dim,
        "featureExtractor": args.feature_extractor,
        "maxCandidates": args.max_candidates,
        "excludedScenarios": sorted(excluded),
        **summary,
    }
    manifest_file = out_file.with_suffix(out_file.suffix + ".manifest.json")
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("已中断，可重新运行同一命令续跑。", file=sys.stderr)
        raise SystemExit(130)
