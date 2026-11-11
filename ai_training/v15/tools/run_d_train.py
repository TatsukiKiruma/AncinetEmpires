#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""V15/T15-08-C：九个 D 模型（D0/D1/D2 × 三 seed）训练驱动 + 消费核验。

严格照协议 §3.2 / 任务书 §9.2：
  - 同 seed 三组从**同一字节文件**的 C2 final warm-start（本脚本先核 SHA 再开跑）；
  - `--init-checkpoint` 是 weights-only warm-start，optimizer/scheduler 统一重建（不使用 C2 动量）；
  - 1,500 更新 / 48,000 曝光；LR 1e-4→1e-5 按 update 余弦；weightDecay=1e-4；每 250 更新验证；
  - 每组每 update 32 = 16 共同旧池 + 16 本组来源（由 plan_d*.json 冻结，不由本脚本决定）；
  - 不因 D0 较弱提前截停控制组；失败即报错，不伪造完成。

输出（每组）：`train_command.txt`、`run_identity.json`、`train.log`、best/last/final/state/metrics/optimized。
全部结束后写 `T15-08/consumption_report.json`：逐组更新/曝光/来源拆分、前 16 位一致性、LR 端点。

用法：
  python v15/tools/run_d_train.py --run-root v15/out/v15_20260925_core --seeds 42
  python v15/tools/run_d_train.py --run-root v15/out/v15_20260925_core --seeds 1337,2026
  python v15/tools/run_d_train.py --run-root v15/out/v15_20260925_core --verify-only
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PY = r'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe'
TRAINER = 'python/train_spatial_resnet.py'
SCHEMA = 'spatial26_global20_actionSemantics53_v15'
GROUPS = ('d0', 'd1', 'd2')


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as fh:
        for block in iter(lambda: fh.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def group_paths(run_root: Path, group: str) -> dict:
    task = run_root / 'T15-08'
    if group == 'd0':
        dataset = run_root / 'T15-06' / 'dataset_v15_clean.jsonl'
        manifest = run_root / 'T15-06' / 'split_manifest_v15_clean.json'
    else:
        dataset = task / f'dataset_{group}_train.jsonl'
        manifest = task / f'split_manifest_{group}.json'
    return {'dataset': dataset, 'manifest': manifest, 'plan': task / f'plan_{group}.json'}


def build_command(run_root: Path, group: str, seed: int, outdir: Path, init: Path) -> list[str]:
    p = group_paths(run_root, group)
    name = f'{group}_s{seed}'
    return [
        PY, TRAINER,
        '--dataset', str(p['dataset']).replace('\\', '/'),
        '--split-manifest', str(p['manifest']).replace('\\', '/'),
        '--batch-plan', str(p['plan']).replace('\\', '/'),
        '--model-version', 'spatial-resnet-v2', '--num-blocks', '2', '--batch-size', '32',
        '--epochs', '6', '--global-update-limit', '1500',
        '--lr-schedule', 'cosine-to-min', '--lr-schedule-unit', 'update', '--lr-total-updates', '1500',
        '--lr', '0.0001', '--lr-min', '0.00001', '--weight-decay', '0.0001', '--value-weight', '0.0',
        '--seed', str(seed), '--split-seed', str(seed), '--data-order-seed', '314159',
        '--encoder-schema-id', SCHEMA,
        '--save-at-updates', '500,1500',
        '--init-checkpoint', str(init).replace('\\', '/'),
        '--out-model', str(outdir / f'{name}_best.json').replace('\\', '/'),
        '--out-last-model', str(outdir / f'{name}_last.json').replace('\\', '/'),
        '--out-final-model', str(outdir / f'{name}_final.json').replace('\\', '/'),
        '--out-state', str(outdir / f'{name}.state.pt').replace('\\', '/'),
        '--out-metrics', str(outdir / f'{name}_metrics.json').replace('\\', '/'),
        '--optimized-manifest', str(outdir / f'{name}_optimized.json').replace('\\', '/'),
    ]


def train_one(run_root: Path, group: str, seed: int, init: Path) -> dict:
    task = run_root / 'T15-08'
    outdir = task / f'{group}_s{seed}'
    outdir.mkdir(parents=True, exist_ok=True)
    name = f'{group}_s{seed}'
    final = outdir / f'{name}_final.json'
    cmd = build_command(run_root, group, seed, outdir, init)
    (outdir / 'train_command.txt').write_text(' '.join(cmd) + '\n', encoding='utf-8')
    identity = {
        'schema': 'v15_dagger_run_identity_1',
        'group': group.upper(), 'seed': seed, 'name': name,
        'initCheckpoint': str(init).replace('\\', '/'), 'initCheckpointSha256': sha256_file(init),
        'plan': str(group_paths(run_root, group)['plan']).replace('\\', '/'),
        'planSha256': sha256_file(group_paths(run_root, group)['plan']),
        'dataset': str(group_paths(run_root, group)['dataset']).replace('\\', '/'),
        'datasetSha256': sha256_file(group_paths(run_root, group)['dataset']),
        'splitManifest': str(group_paths(run_root, group)['manifest']).replace('\\', '/'),
        'splitManifestSha256': sha256_file(group_paths(run_root, group)['manifest']),
        'encoderSchemaId': SCHEMA, 'batchSize': 32, 'totalUpdates': 1500, 'expectedExposures': 48000,
        'lrMax': 1e-4, 'lrMin': 1e-5, 'lrScheduleUnit': 'update', 'weightDecay': 1e-4,
        'command': ' '.join(cmd), 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%S'),
    }
    (outdir / 'run_identity.json').write_text(json.dumps(identity, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    if final.exists():
        print(f'[train] {name} 已有 final，跳过（如需重跑请另换实验 ID/目录）')
        return {'name': name, 'skipped': True, 'initSha256': identity['initCheckpointSha256']}
    print(f'[train] {name} 启动：init={init.name} sha256={identity["initCheckpointSha256"][:12]}…')
    t0 = time.time()
    with (outdir / 'train.log').open('w', encoding='utf-8') as log:
        proc = subprocess.run(cmd, cwd=str(REPO), stdout=log, stderr=subprocess.STDOUT, shell=False)
    secs = time.time() - t0
    status = 'OK' if proc.returncode == 0 and final.exists() else 'FAILED'
    print(f'[train] {name} rc={proc.returncode} {secs:.0f}s → {status}')
    identity['finishedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S')
    identity['seconds'] = round(secs, 1)
    identity['returncode'] = proc.returncode
    identity['status'] = status
    (outdir / 'run_identity.json').write_text(json.dumps(identity, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return {'name': name, 'rc': proc.returncode, 'seconds': round(secs, 1), 'status': status,
            'initSha256': identity['initCheckpointSha256']}


def read_ledger(path: Path) -> list[dict]:
    rows = []
    if not path.exists():
        return rows
    with path.open('r', encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def verify(run_root: Path) -> dict:
    task = run_root / 'T15-08'
    report: dict = {'schema': 'v15_dagger_consumption_report_1', 'groups': {}, 'checks': {}}
    ledgers: dict[str, list[dict]] = {}
    for group in GROUPS:
        for seed in (42, 1337, 2026):
            name = f'{group}_s{seed}'
            outdir = task / f'{name}'
            metrics_path = outdir / f'{name}_metrics.json'
            ledger_path = outdir / f'{name}_best.optimizer_update_ledger.jsonl'
            entry: dict = {'name': name, 'metrics': None, 'ledger': None}
            if metrics_path.exists():
                m = json.loads(metrics_path.read_text(encoding='utf-8'))
                lc = m.get('lifecycle', {})
                entry['metrics'] = {
                    'stopReason': lc.get('stopReason'), 'updatesCompleted': lc.get('updatesCompleted'),
                    'exposuresMeasured': lc.get('exposuresMeasured'),
                    'zeroConsumptionEpochs': lc.get('zeroConsumptionEpochs'),
                    'epochsRecorded': lc.get('epochsRecorded'),
                    'bestValAcc': m.get('best_val_acc'), 'bestSelectedAtUpdate': (m.get('artifacts', {}).get('best') or {}).get('selectedAtUpdate'),
                    'finalSelectedAtUpdate': (m.get('artifacts', {}).get('final') or {}).get('selectedAtUpdate'),
                    'finalSha256': (m.get('artifacts', {}).get('final') or {}).get('sha256'),
                    'initCheckpoint': m.get('initCheckpoint'), 'initCheckpointSha256': m.get('initCheckpointSha256'),
                    'datasetSha256': m.get('datasetSha256'), 'batchPlanSha256': (m.get('batchPlan') or {}).get('sha256'),
                    'encoderSchemaId': m.get('encoder_schema_id'),
                    'valAccHistory': [h.get('val_acc') for h in (m.get('history') or [])],
                }
            led = read_ledger(ledger_path)
            if led:
                src_counts: dict[str, int] = {}
                for row in led:
                    for k, v in (row.get('sources') or {}).items():
                        src_counts[k] = src_counts.get(k, 0) + int(v)
                ledgers[name] = led
                entry['ledger'] = {
                    'updates': len(led),
                    'exposures': sum(int(r.get('batchSize', 0)) for r in led),
                    'sourceExposures': src_counts,
                    'lrFirst': led[0].get('lr'), 'lrLast': led[-1].get('lr'),
                    'lrMonotoneNonIncreasing': all(led[i]['lr'] >= led[i + 1]['lr'] - 1e-12 for i in range(len(led) - 1)),
                    'maxAbsLrDelta': max(abs(led[i]['lr'] - led[i + 1]['lr']) for i in range(len(led) - 1)),
                    'policyMasked': sum(int(r.get('policyMasked', 0)) for r in led),
                    'valueMasked': sum(int(r.get('valueMasked', 0)) for r in led),
                }
            report['groups'][name] = entry

    # 同 seed 三组初始化字节 SHA 必须完全相同
    init_ok = {}
    for seed in (42, 1337, 2026):
        shas = {g: report['groups'][f'{g}_s{seed}']['metrics']['initCheckpointSha256']
                for g in GROUPS if report['groups'][f'{g}_s{seed}']['metrics']}
        init_ok[str(seed)] = {'shas': shas, 'identical': len(set(shas.values())) == 1 and len(shas) == 3}
    report['checks']['initShaIdenticalPerSeed'] = init_ok

    # 前 16 位一致性（逐 update 比较三组 ledger 的 sampleIds[:16]）
    shared = {}
    for seed in (42, 1337, 2026):
        names = [f'{g}_s{seed}' for g in GROUPS]
        if not all(n in ledgers for n in names):
            shared[str(seed)] = {'status': 'INCOMPLETE', 'groupsPresent': [n for n in names if n in ledgers]}
            continue
        mismatch = 0
        first_mismatch = None
        n_cmp = min(len(ledgers[n]) for n in names)
        for i in range(n_cmp):
            heads = [tuple(ledgers[n][i]['sampleIds'][:16]) for n in names]
            if not (heads[0] == heads[1] == heads[2]):
                mismatch += 1
                if first_mismatch is None:
                    first_mismatch = i
        shared[str(seed)] = {'status': 'OK' if mismatch == 0 else 'MISMATCH',
                             'updatesCompared': n_cmp, 'mismatchedUpdates': mismatch,
                             'firstMismatchIndex': first_mismatch,
                             'firstThreeSharedSampleIds': list(ledgers[names[0]][0]['sampleIds'][:3])}
    report['checks']['sharedFirst16SampleIds'] = shared

    total_updates = sum(e['ledger']['updates'] for e in report['groups'].values() if e['ledger'])
    total_exposures = sum(e['ledger']['exposures'] for e in report['groups'].values() if e['ledger'])
    report['totals'] = {'runs': sum(1 for e in report['groups'].values() if e['ledger']),
                        'updates': total_updates, 'exposures': total_exposures,
                        'plannedRuns': 9, 'plannedUpdates': 13500, 'plannedExposures': 432000}
    out = task / 'consumption_report.json'
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'[verify] → {out}（runs={report["totals"]["runs"]}/9 updates={total_updates} exposures={total_exposures}）')
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-root', default='v15/out/v15_20260925_core')
    ap.add_argument('--seeds', default='42')
    ap.add_argument('--verify-only', action='store_true')
    args = ap.parse_args()
    run_root = (REPO / args.run_root).resolve()

    if not args.verify_only:
        missing = [str(group_paths(run_root, g)['plan']) for g in GROUPS if not group_paths(run_root, g)['plan'].exists()]
        if missing:
            raise SystemExit(f'缺少 plan（先跑 v15/tools/train_d_plan.py）：{missing}')
        seeds = [int(s) for s in args.seeds.split(',') if s.strip()]
        inits = {}
        for seed in seeds:
            init = run_root / 'T15-06' / f'c2_s{seed}' / f'c2_s{seed}_final.json'
            if not init.exists():
                raise SystemExit(f'缺少 C2 final 初始化权重：{init}')
            inits[seed] = init
            print(f'[train] seed {seed} 初始化 {init.name} sha256={sha256_file(init)[:12]}…（三组必须同一字节文件）')
        results = []
        for seed in seeds:                      # 先按 seed 完成三组，再进下一个 seed
            for group in GROUPS:
                results.append(train_one(run_root, group, seed, inits[seed]))
        failed = [r for r in results if r.get('status') == 'FAILED' or r.get('rc') not in (0, None)]
        if failed:
            print(f'[train] 失败 {len(failed)} 组：{failed}')
    report = verify(run_root)
    return 0 if report['totals']['runs'] > 0 else 1


if __name__ == '__main__':
    sys.exit(main())
