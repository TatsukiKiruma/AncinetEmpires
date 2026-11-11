"""执行已冻结的小档数据规模对照；不部署权重、不启动棋力评测。"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import random
import subprocess
import sys
import time


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--pilot', type=Path, required=True)
    parser.add_argument('--level', choices=['one_third', 'two_thirds', 'full'], required=True)
    parser.add_argument('--mode', choices=['fixed_updates', 'four_exposures'], required=True)
    parser.add_argument('--out-dir', type=Path, required=True)
    args = parser.parse_args()
    if args.out_dir.exists():
        raise FileExistsError('拒绝覆盖现有训练输出')
    dataset = args.pilot / args.level / 'dataset.jsonl'
    split = args.pilot / args.level / 'split.json'
    split_data = json.loads(split.read_text(encoding='utf-8'))
    train_families = set(split_data['trainRootFamilies'])
    rows = [json.loads(line) for line in dataset.read_text(encoding='utf-8').splitlines() if line.strip()]
    indices = [i for i, row in enumerate(rows) if row['rootFamilyId'] in train_families]
    if not indices:
        raise ValueError('训练分区为空')
    source_name = 'current_rules' if any(rows[i].get('provenance', {}).get('dataRole') == 'existing_current_rules_training_relabelled_h0' for i in indices) else 'historical_curriculum'
    updates = 128 if args.mode == 'fixed_updates' else math.ceil(len(indices) * 4 / 32)
    args.out_dir.mkdir(parents=True)
    rng = random.Random(26100334)
    stream = []
    while len(stream) < updates * 32:
        cycle = indices.copy()
        rng.shuffle(cycle)
        stream.extend(cycle)
    stream = stream[:updates * 32]
    plan = {
        'schema': 'v15_batch_plan_1', 'batchSize': 32, 'updatesPerEpoch': 32,
        'totalUpdates': updates, 'sources': [{'name': source_name, 'quota': 32}],
        'updates': [{'updateIndex': u, 'items': [
            {'datasetRow': i, 'sampleId': rows[i]['sampleId'], 'source': source_name}
            for i in stream[u * 32:(u + 1) * 32]]} for u in range(updates)],
    }
    plan_path = args.out_dir / 'batch_plan.json'
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
    init = Path('v19/out/run_20260929_v19_02/experiments/ppo_w1/s42/ppo_w1.json')
    expected_init_sha = '0089afe67e14462819bcc80601180e690327c40400b1aa9bd0bad03f19a30b47'
    if sha(init) != expected_init_sha:
        raise ValueError('初始模型身份变化')
    save_points = sorted({max(1, round(updates * fraction)) for fraction in (0.25, 0.5, 1.0)})
    command = [sys.executable, 'v17/tools/train_v17.py',
        '--dataset', str(dataset), '--split-manifest', str(split), '--batch-plan', str(plan_path),
        '--epochs', str(math.ceil(updates / 32)), '--global-update-limit', str(updates),
        '--batch-size', '32', '--lr', '0.0001', '--lr-min', '0.00001',
        '--lr-schedule', 'cosine-to-min', '--lr-schedule-unit', 'update', '--lr-total-updates', str(updates),
        '--save-at-updates', ','.join(map(str, save_points)), '--num-blocks', '2',
        '--spatial-channels', '34', '--encoder-schema-id', 'spatial34_global20_actionSemantics53_v19',
        '--model-version', 'spatial-resnet-v2', '--init-checkpoint', str(init),
        '--trainable-parts', 'trunk,policy', '--value-weight', '0',
        '--value-loss-normalize', 'valid-mask', '--loss-mode', 'ce',
        '--model-seed', '42', '--data-order-seed', '26100334',
        '--out-model', str(args.out_dir / 'best.json'),
        '--out-final-model', str(args.out_dir / 'final.json'),
        '--out-metrics', str(args.out_dir / 'metrics.json'),
        '--planned-manifest', str(args.out_dir / 'planned.json'),
        '--optimized-manifest', str(args.out_dir / 'optimized.json'),
    ]
    identity = {
        'kind': 'v19-data-scale-offline-pilot', 'mode': args.mode, 'level': args.level,
        'updates': updates, 'batchSize': 32, 'plannedExposures': len(stream),
        'plannedUniqueRows': len(set(stream)), 'availableTrainRows': len(indices),
        'nominalExposuresPerRow': len(stream) / len(indices),
        'initialModelSha256': expected_init_sha,
        'hypothesis': '固定架构与教师，比较增加独特训练输入的监督收益及当前规则回归变化',
        'trainingSource': source_name,
        'promotionAllowed': False, 'independentGameStrengthEvidence': False,
        'lossContractId': 'hard-ce-only-no-teacher-scores-v1', 'command': command,
        'sourceSha256': {str(p): sha(p) for p in [dataset, split, plan_path, init,
            Path('v17/tools/train_v17.py'), Path('python/spatial_resnet_model.py'), Path(__file__)]},
    }
    (args.out_dir / 'experiment_identity.json').write_text(json.dumps(identity, ensure_ascii=False, indent=2), encoding='utf-8')
    env = dict(os.environ, OMP_NUM_THREADS='2', MKL_NUM_THREADS='2', PYTHONIOENCODING='utf-8')
    started = time.monotonic()
    with (args.out_dir / 'train.log').open('w', encoding='utf-8') as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, env=env)
    outcome = {'returnCode': result.returncode, 'elapsedSeconds': time.monotonic() - started,
               'level': args.level, 'mode': args.mode}
    (args.out_dir / 'process_result.json').write_text(json.dumps(outcome, indent=2), encoding='utf-8')
    print(json.dumps(outcome))
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
