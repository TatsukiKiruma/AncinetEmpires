"""汇总已保存预测的分层差异；不增加前向，不访问最终测试。"""
import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
STAGE1 = HERE.parent / 'stage1'
sys.path.insert(0, str(STAGE1))
from offline import summarize
from contracts import file_sha

METRICS = ['policyNll', 'top1', 'valueCe', 'brier', 'valueConfidence', 'valueCorrect']


def read_rows(path):
    rows = [json.loads(line) for line in path.read_text('utf-8').splitlines() if line]
    assert len(rows) == 1299 and all(r['split'] in ['train', 'dev'] for r in rows)
    return rows


def strata(rows):
    buckets = defaultdict(list)
    for row in rows:
        prefix = row['corpus'] + '/' + row['split']
        keys = [prefix, f'{prefix}/{row["players"]}p', f'{prefix}/category/{row["category"]}',
                f'{prefix}/source/{row["source"]}', f'{prefix}/terrain/{row["terrainTrust"]}',
                f'{prefix}/{row["players"]}p/{row["category"]}/{row["source"]}']
        if row['candidates'] > 1:
            keys.append('nontrivial/' + prefix)
        for key in keys:
            buckets[key].append(row)
    return {key: summarize(value) for key, value in buckets.items()}


def identity(row):
    return tuple(row[k] for k in ['parentId', 'macro', 'subAction', 'before', 'code', 'candidates'])


def compare(root):
    baseline_rows = read_rows(STAGE1 / 'offline-baseline/samples.jsonl')
    baseline_identity = sorted(identity(r) for r in baseline_rows)
    baseline = strata(baseline_rows)
    reports = []
    for arm in ['lr-1e-4', 'lr-5e-5', 'lr-2.4495e-4']:
        folder = root / arm
        if not folder.exists():
            continue
        for snapshot in sorted(folder.glob('dev-*')):
            if not snapshot.is_dir() or not (snapshot / 'RESULT.json').exists():
                continue
            report = json.loads((snapshot / 'RESULT.json').read_text('utf-8'))
            assert not report['finalTestEvaluated'] and report['samples'] == 1299
            rows = read_rows(snapshot / 'samples.jsonl')
            assert sorted(identity(r) for r in rows) == baseline_identity
            candidate = strata(rows)
            comparisons = {}
            for key, value in candidate.items():
                base = baseline[key]
                assert value['samples'] == base['samples'] and value['parents'] == base['parents']
                b, c = base['parentEqual'], value['parentEqual']
                comparisons[key] = dict(samples=value['samples'], parents=value['parents'], baseline=b,
                                        candidate=c, delta={k: c[k] - b[k] for k in METRICS},
                                        relativeNllChange=c['policyNll'] / b['policyNll'] - 1 if b['policyNll'] else None,
                                        baselineEce=base['eceSampleWeighted'], candidateEce=value['eceSampleWeighted'])
            reports.append(dict(arm=arm, snapshot=snapshot.name, modelSha256=report['modelSha256'],
                                resultSha256=file_sha(snapshot / 'RESULT.json'), comparisons=comparisons))
    return dict(schema='continuation-stage2-offline-comparison-v1', snapshots=reports,
                additionalForwardCalls=0, finalTestEvaluated=False,
                caveat='固定少量独立宏首态、父局等权；不代表完整多人实战或未知地图泛化。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = compare(args.root)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), 'utf-8')
    with args.out.with_suffix('.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['学习率臂', '快照', '分层', '父局', '样本', '基线NLL', '候选NLL', 'NLL相对变化', '基线Brier', '候选Brier', 'Brier变化'])
        for snapshot in result['snapshots']:
            for key, item in snapshot['comparisons'].items():
                writer.writerow([snapshot['arm'], snapshot['snapshot'], key, item['parents'], item['samples'],
                                 item['baseline']['policyNll'], item['candidate']['policyNll'], item['relativeNllChange'],
                                 item['baseline']['brier'], item['candidate']['brier'], item['delta']['brier']])
    print(json.dumps(dict(snapshots=len(result['snapshots']), additionalForwardCalls=0, finalTestEvaluated=False)))
