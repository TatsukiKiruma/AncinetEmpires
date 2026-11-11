#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""V15/T15-08-C：数据侧流水线（等采集完成 → 编码 → 过滤/匹配 → batch 计划）。

为什么需要它：Node 在本机沙箱不能 spawn（EPERM），所以"编码 → 匹配 → 计划"这三步必须由
Python 串起来；写成脚本而不是手敲命令，是为了让整条链**可复现、可续跑**，并把每步 stdout
落盘到 `T15-08/_logs/`。

步骤与产物：
  1. 等 `collect_<ARM>/collection_report.json`（说明该臂 16 个 root 全部完成）；
  2. `dataset_dagger_encode_v15.ts` → `dataset_<arm>_new_candidates.jsonl` + `.keys.jsonl`；
  3. `match_pools_dagger.py` → `dataset_d1_new.jsonl` / `dataset_d2_new.jsonl` / `matched_groups.json`
     / `new_pool_filter_report.json` / `d1_d2_shared_states.json`；
  4. `train_d_plan.py` → `dataset_d{1,2}_train.jsonl`、`split_manifest_d{1,2}.json`、`plan_d{0,1,2}.json`。

用法：
  python v15/tools/run_d_pipeline.py --run-root v15/out/v15_20260925_core --wait-for D2 --steps encode,match,plan
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PY = sys.executable
RUN_TOOL = 'v12/tools/run-tool.mjs'
ENCODER = 'v15/tools/dataset_dagger_encode_v15.ts'


def log(msg: str) -> None:
    print(f'[{time.strftime("%H:%M:%S")}] {msg}', flush=True)


def run(cmd: list[str], log_path: Path) -> int:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log(f'执行：{" ".join(cmd)}')
    with log_path.open('w', encoding='utf-8') as fh:
        proc = subprocess.run(cmd, cwd=str(REPO), stdout=fh, stderr=subprocess.STDOUT, shell=False)
    log(f'返回码 {proc.returncode}（日志 {log_path}）')
    return proc.returncode


def wait_for(run_root: Path, arm: str, timeout_s: int) -> bool:
    marker = run_root / 'T15-08' / f'collect_{arm}' / 'collection_report.json'
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        if marker.exists():
            log(f'{marker.name} 已出现（{arm} 采集完成）')
            return True
        time.sleep(20)
    log(f'等待 {arm} 采集超时（{timeout_s}s）')
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-root', default='v15/out/v15_20260925_core')
    ap.add_argument('--wait-for', default='')
    ap.add_argument('--timeout-s', type=int, default=1800)
    ap.add_argument('--steps', default='encode,match,plan')
    ap.add_argument('--arms', default='D1,D2')
    args = ap.parse_args()
    run_root = (REPO / args.run_root).resolve()
    logs = run_root / 'T15-08' / '_logs'
    task = run_root / 'T15-08'
    steps = [s.strip() for s in args.steps.split(',') if s.strip()]
    arms = [a.strip() for a in args.arms.split(',') if a.strip()]

    if args.wait_for:
        if not wait_for(run_root, args.wait_for, args.timeout_s):
            return 1

    if 'encode' in steps:
        for arm in arms:
            collect = task / f'collect_{arm}'
            outs = [task / f'dataset_{arm.lower()}_new_candidates.jsonl',
                    task / f'dataset_{arm.lower()}_new_candidates.keys.jsonl',
                    task / f'dataset_{arm.lower()}_encode_report.json']
            if all(p.exists() for p in outs):
                # 续跑安全：已完成的编码不重跑（编码器本身拒绝覆盖已有产物）。
                log(f'{arm}: 编码产物已存在，跳过（{outs[0].name}）')
                continue
            # 只用带 root_summary 的完整 root 文件（半截文件不能当输入；另建 hardlink 目录）。
            complete = task / f'collect_{arm}_complete'
            complete.mkdir(exist_ok=True)
            import os
            linked = skipped = 0
            for f in sorted(collect.glob('*.jsonl')):
                text_ok = False
                with f.open('r', encoding='utf-8', errors='replace') as fh:
                    for line in fh:
                        if '"kind":"root_summary"' in line or '"kind": "root_summary"' in line:
                            text_ok = True
                            break
                if not text_ok:
                    skipped += 1
                    continue
                target = complete / f.name
                if not target.exists():
                    try:
                        os.link(f, target)
                        linked += 1
                    except OSError:
                        import shutil
                        shutil.copyfile(f, target)
                        linked += 1
            log(f'{arm}: 完整 root 文件 {linked} 个，跳过无 root_summary 的 {skipped} 个')
            rc = run(['node', '--openssl-legacy-provider', RUN_TOOL, ENCODER,
                      '--run-id', run_root.name, '--arm', arm,
                      '--collect-dir', str(complete.relative_to(REPO)).replace('\\', '/')],
                     logs / f'encode_{arm}.out.log')
            if rc != 0:
                log(f'{arm} 编码失败，终止流水线')
                return rc

    if 'match' in steps:
        keys1 = task / 'dataset_d1_new_candidates.keys.jsonl'
        keys2 = task / 'dataset_d2_new_candidates.keys.jsonl'
        c1 = task / 'dataset_d1_new_candidates.jsonl'
        c2 = task / 'dataset_d2_new_candidates.jsonl'
        for p in (keys1, keys2, c1, c2):
            if not p.exists():
                log(f'缺少 {p}，终止流水线')
                return 1
        rc = run([PY, 'v15/tools/match_pools_dagger.py', '--run-root', str(run_root.relative_to(REPO)).replace('\\', '/'),
                  '--arm', f'D1={keys1.relative_to(REPO)}::{c1.relative_to(REPO)}'.replace('\\', '/'),
                  '--arm', f'D2={keys2.relative_to(REPO)}::{c2.relative_to(REPO)}'.replace('\\', '/')],
                 logs / 'match_pools.out.log')
        if rc != 0:
            log('匹配失败，终止流水线')
            return rc

    if 'plan' in steps:
        rc = run([PY, 'v15/tools/train_d_plan.py', '--run-root', str(run_root.relative_to(REPO)).replace('\\', '/')],
                 logs / 'train_d_plan.out.log')
        if rc != 0:
            log('计划生成失败')
            return rc

    log('流水线完成')
    return 0


if __name__ == '__main__':
    sys.exit(main())
