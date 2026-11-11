#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""V15/T15-08-C + T15-09B：开发面板对局驱动（owner C 的批处理包装器）。

职责边界（不越权、不发明数值）：
  - 只**调用** A 冻结的 `v15/tools/arena_run_v15.ts`，不修改它、不重写 caps/roots/统计口径。
  - 本文件只解决两件工程问题：
      1. Node 的 `child_process.spawn*` 在本机沙箱被拒（EPERM），TS 工具内部不能串行调度；
         Python/PowerShell 可以 spawn，因此批处理放在这里。
      2. 把 240 个候选臂 + 8 个镜像实体拆成可恢复的任务队列，多进程并行（每个任务一个 node 进程），
         失败重试有限次，并把每个任务的 stdout/stderr 落盘，便于失败后精确续跑。

镜像与候选分开跑的原因（协议 §5.1 / 口径要求）：
  - 镜像实体是 H0 全座位对局，同一 root 只跑一次，按座位展开成多行，**不随模型重复**。
    因此镜像统一写 `dev_h0.games.jsonl`，而不是写进每个模型的文件（否则会被重复计成
    12×8=96 个"镜像实体"，违反"不要把座位视角/多模型记成新增独立样本"）。
  - 候选臂按模型写各自的 `dev_<modelKey>.games.jsonl`，由 `arena_run_v15.ts` 增量续写。

用法：
  python v15/tools/run_d_arena.py \
      --run-root v15/out/v15_20260925_core --panel dev \
      --models "c2:42=v15/out/v15_20260925_core/T15-06/c2_s42/c2_s42_final.json" \
      --workers 3 [--blocks dev:duel:b0,...] [--no-mirrors] [--skip-completed] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RUN_TOOL = REPO / 'v12' / 'tools' / 'run-tool.mjs'
ARENA_TOOL = 'v15/tools/arena_run_v15.ts'
NODE = 'node'

_print_lock = threading.Lock()


def log(msg: str) -> None:
    with _print_lock:
        print(f'[{time.strftime("%H:%M:%S")}] {msg}', flush=True)


def load_blocks(run_root: Path, panel: str) -> list[dict]:
    """从 T15-09/arena_manifest.json（A 冻结）读出 block 列表，不自行派生 roots。"""
    manifest = run_root / 'T15-09' / 'arena_manifest.json'
    data = json.loads(manifest.read_text(encoding='utf-8'))
    roots = data['roots']
    if panel != 'dev':
        raise SystemExit('本驱动只实现 dev 面板（preflight 由 T15-09A 校准脚本负责）。')
    return roots['devPanel']


def parse_models(spec: str) -> list[tuple[str, Path]]:
    out: list[tuple[str, Path]] = []
    for item in spec.split(','):
        item = item.strip()
        if not item:
            continue
        if '=' not in item:
            raise SystemExit(f'--models 项必须是 key=path 形式：{item}')
        key, path = item.split('=', 1)
        p = (REPO / path).resolve() if not os.path.isabs(path) else Path(path)
        if not p.exists():
            raise SystemExit(f'权重不存在：{p}')
        out.append((key.strip(), p))
    return out


def read_game_ids(path: Path) -> set[str]:
    ids: set[str] = set()
    if not path.exists():
        return ids
    for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        gid = row.get('gameId') or (row.get('cacheIdentity') or {}).get('gameId')
        if gid:
            ids.add(gid)
    return ids


def game_id_prefix(run_id: str, panel: str, block_id: str, model_id_frag: str, arm: str) -> str:
    return f'{run_id}|{panel}|{block_id}|{model_id_frag}|{arm}|'


def run_task(cmd: list[str], log_path: Path, retries: int) -> tuple[int, float]:
    """跑一个 node 任务；stdout/stderr 重定向到文件（不用管道，避免沙箱命名管道限制）。"""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    attempt = 0
    started = time.time()
    while True:
        attempt += 1
        mode = 'w' if attempt == 1 else 'a'
        with open(log_path, mode, encoding='utf-8') as fh:
            if attempt > 1:
                fh.write(f'\n=== 第 {attempt} 次重试 ===\n')
            proc = subprocess.run(cmd, cwd=str(REPO), stdout=fh, stderr=subprocess.STDOUT, shell=False)
        if proc.returncode == 0:
            return 0, time.time() - started
        if attempt > retries:
            return proc.returncode, time.time() - started
        log(f'任务返回 {proc.returncode}，{(log_path.name)} 重试 {attempt}/{retries}')
        time.sleep(5)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-root', default='v15/out/v15_20260925_core')
    ap.add_argument('--panel', default='dev')
    ap.add_argument('--models', default='', help='逗号分隔的 key=path；key 形如 c2:42 / d1:1337')
    ap.add_argument('--blocks', default='', help='逗号分隔的 blockId；默认全部')
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--retries', type=int, default=1)
    ap.add_argument('--no-mirrors', action='store_true')
    ap.add_argument('--skip-completed', action='store_true', help='按 gameId 前缀跳过已完成任务')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    run_root = (REPO / args.run_root).resolve()
    run_id = json.loads((run_root / 'T15-00' / 'protocol.json').read_text(encoding='utf-8'))['runId']
    blocks = load_blocks(run_root, args.panel)
    if args.blocks:
        want = {b.strip() for b in args.blocks.split(',') if b.strip()}
        blocks = [b for b in blocks if b['blockId'] in want]
        missing = want - {b['blockId'] for b in blocks}
        if missing:
            raise SystemExit(f'未知 block：{sorted(missing)}')
    models = parse_models(args.models) if args.models else []
    match_dir = run_root / 'T15-09' / 'matches'
    log_dir = run_root / 'T15-09' / 'logs'
    log_dir.mkdir(parents=True, exist_ok=True)

    tasks: list[dict] = []
    if not args.no_mirrors:
        mirror_out = match_dir / f'{args.panel}_h0.games.jsonl'
        done = read_game_ids(mirror_out) if args.skip_completed else set()
        for b in blocks:
            prefix = game_id_prefix(run_id, args.panel, b['blockId'], 'heuristic:mirror:v1', 'MIRROR')
            if any(g.startswith(prefix) for g in done):
                continue
            tasks.append({
                'kind': 'mirror', 'block': b, 'out': mirror_out,
                'cmd': [NODE, '--openssl-legacy-provider', str(RUN_TOOL.relative_to(REPO)), ARENA_TOOL,
                        '--run-root', str(run_root.relative_to(REPO)).replace('\\', '/'),
                        '--panel', args.panel, '--block', b['blockId'], '--arms', 'mirror',
                        '--out', str(mirror_out.relative_to(REPO)).replace('\\', '/')],
                'log': log_dir / f"mirror_{args.panel}_{b['blockId'].replace(':', '_')}.log",
            })
    for key, path in models:
        out = match_dir / f"{args.panel}_{key.replace(':', '_')}.games.jsonl"
        done = read_game_ids(out) if args.skip_completed else set()
        frag = f'spatial_candidate:{key}:'
        for b in blocks:
            prefix = game_id_prefix(run_id, args.panel, b['blockId'], frag, 'CANDIDATE')
            if any(g.startswith(prefix) for g in done):
                continue
            tasks.append({
                'kind': 'candidate', 'block': b, 'out': out, 'model': key,
                'cmd': [NODE, '--openssl-legacy-provider', str(RUN_TOOL.relative_to(REPO)), ARENA_TOOL,
                        '--run-root', str(run_root.relative_to(REPO)).replace('\\', '/'),
                        '--panel', args.panel, '--block', b['blockId'],
                        '--model', str(path.relative_to(REPO)).replace('\\', '/'),
                        '--model-key', key, '--arms', 'candidate',
                        '--out', str(out.relative_to(REPO)).replace('\\', '/')],
                'log': log_dir / f"cand_{args.panel}_{key.replace(':', '_')}_{b['blockId'].replace(':', '_')}.log",
            })

    log(f'计划 {len(tasks)} 个任务（{len(models)} 个模型 × {len(blocks)} block + 镜像），workers={args.workers}')
    for t in tasks:
        log(f"  [{t['kind']:9s}] {t['block']['blockId']:16s} {t.get('model', 'h0'):10s} → {t['out'].name}")
    if args.dry_run:
        return 0

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(run_task, t['cmd'], t['log'], args.retries): t for t in tasks}
        for fut in futures:
            t = futures[fut]
            try:
                rc, secs = fut.result()
            except Exception as exc:  # noqa: BLE001
                rc, secs = -1, 0.0
                log(f'异常 {t["log"].name}: {exc}')
            results.append({'blockId': t['block']['blockId'], 'kind': t['kind'],
                            'model': t.get('model'), 'rc': rc, 'seconds': round(secs, 1),
                            'log': str(t['log'].relative_to(REPO)).replace('\\', '/')})
            log(f"完成 rc={rc} {secs:6.1f}s [{t['kind']}] {t['block']['blockId']} {t.get('model', 'h0')}")

    summary = {
        'schema': 'v15_arena_driver_run_1',
        'runId': run_id, 'panel': args.panel, 'workers': args.workers,
        'tasks': len(results), 'failed': sum(1 for r in results if r['rc'] != 0),
        'totalSeconds': round(sum(r['seconds'] for r in results), 1),
        'results': sorted(results, key=lambda r: (r['model'] or '', r['blockId'])),
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%S'),
    }
    stamp = time.strftime('%H%M%S')
    out = log_dir / f"driver_summary_{args.panel}_{stamp}.json"
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    log(f'驱动汇总 → {out}（失败 {summary["failed"]}/{summary["tasks"]}）')
    return 0 if summary['failed'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
