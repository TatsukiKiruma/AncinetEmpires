"""固定独立前态离线诊断；只允许训练诊断和开发分区。"""
import argparse
import json
import time
from collections import defaultdict
from pathlib import Path
import torch
from torch.nn import functional as F
from runtime import HERE, ROOT, Encoder, device_for, load_model, move, collate, forward_batch, groups, save, sha, identity
from contracts import validate
from budget import ArmBudget, BudgetExpired


def summarize(rows):
    parents = defaultdict(list)
    for row in rows:
        parents[row['parentId']].append(row)
    keys = ['policyNll', 'top1', 'valueCe', 'brier', 'valueConfidence', 'valueCorrect', 'uniformBrier']
    means = [{k: sum(r[k] for r in a) / len(a) for k in keys} for a in parents.values()]
    result = dict(samples=len(rows), parents=len(parents), sampleWeighted={k: sum(r[k] for r in rows) / max(1, len(rows)) for k in keys}, parentEqual={k: sum(r[k] for r in means) / max(1, len(means)) for k in keys})
    bins = []
    for i in range(10):
        selected = [r for r in rows if min(9, int(r['valueConfidence'] * 10)) == i]
        bins.append(dict(low=i / 10, high=(i + 1) / 10, samples=len(selected), confidence=sum(r['valueConfidence'] for r in selected) / max(1, len(selected)), correct=sum(r['valueCorrect'] for r in selected) / max(1, len(selected))))
    result['calibrationBins'] = bins
    result['eceSampleWeighted'] = sum(b['samples'] * abs(b['confidence'] - b['correct']) for b in bins) / max(1, len(rows))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, default=ROOT / 'ai_training/phone_2m_continue414_20261027/completion/job/output/final')
    parser.add_argument('--out', type=Path)
    parser.add_argument('--device', default='cuda:0')
    parser.add_argument('--config', type=Path, default=HERE / 'STAGE2_CONFIG.json')
    parser.add_argument('--preflight-only', action='store_true')
    parser.add_argument('--timeout-seconds', type=float, default=600.)
    args = parser.parse_args()
    entered = time.perf_counter()
    config = json.loads(args.config.read_text('utf-8'))
    execution, science = validate(config)
    if args.device != science['executionRuntime']['device']:
        raise ValueError('评估设备与固定科学合同不同')
    if args.preflight_only:
        print(json.dumps(execution))
        return
    if args.out is None:
        parser.error('离线评估必须指定新目录')
    budget = ArmBudget(min(args.timeout_seconds, config['diagnosticTimeoutSeconds']), started=entered)
    budget.require()
    args.out.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(2)
    device = device_for(args.device)
    model = load_model(args.model).to(device).eval()
    panel = json.loads((HERE / 'OFFLINE_PANEL.json').read_text('utf-8'))
    parents = {p['parentId']: p for p in json.loads((HERE / 'PARTITIONS.json').read_text('utf-8'))['parents']}
    if panel['finalTestEvaluated'] or any(r['split'] not in ['train', 'dev'] for r in panel['requests']):
        raise ValueError('禁止读取封存测试')
    budget.require()
    encoder = Encoder(args.out / 'encoder.stderr.log', config, execution)
    records = []
    started = time.perf_counter()
    try:
        with torch.inference_mode(), (args.out / 'samples.jsonl').open('w', encoding='utf-8') as log:
            for offset in range(0, len(panel['requests']), 8):
                rows = encoder.rows(panel['requests'][offset:offset + 8], timeout=budget.require(config['encodingRequestTimeoutSeconds']))
                for batch in groups(rows, 8):
                    budget.require()
                    x = move(collate(batch), device)
                    out = forward_batch(model, x)
                    for i, row in enumerate(batch):
                        source = row['source']
                        a = len(row['pointers'])
                        policy = out['logits'][i, :a] + torch.tensor(source['prior'], device=device)
                        target = int(row['policyTarget'])
                        probs = out['valueProbs'][i]
                        value_target = x['valueTarget'][i]
                        n = int(row['active'].sum())
                        uniform = row['active'].to(device).float() / n
                        record = dict(source, policyNll=float(-policy.log_softmax(-1)[target]), top1=int(int(policy.argmax()) == target), valueCe=float(-(value_target * out['valueLogits'][i].log_softmax(-1)).sum()), brier=float((probs - value_target).square().sum()), uniformBrier=float((uniform - value_target).square().sum()), valueConfidence=float(probs.max()), valueCorrect=float(value_target[probs.argmax()]), candidates=a)
                        trust = {r['confidence'] for r in parents[source['parentId']]['terrain']}
                        record['terrainTrust'] = next(k for k in ['unmapped', 'approximate', 'atlas', 'confirmed'] if k in trust)
                        if not all(torch.isfinite(torch.tensor(record[k])) for k in ['policyNll', 'valueCe', 'brier']):
                            raise ValueError('离线指标非有限')
                        records.append(record)
                        log.write(json.dumps(record, ensure_ascii=False) + '\n')
                if offset % 100 == 0:
                    save(args.out / 'PROGRESS.json', dict(samples=len(records), total=len(panel['requests']), seconds=time.perf_counter() - started))
        buckets = defaultdict(list)
        for r in records:
            for key in [f'{r["corpus"]}/{r["split"]}', f'{r["corpus"]}/{r["split"]}/{r["players"]}p/{r["category"]}/{r["source"]}', f'phase/{r["corpus"]}/{r["split"]}/{r["phase"]}', f'terrain/{r["corpus"]}/{r["split"]}/{r["terrainTrust"]}']:
                buckets[key].append(r)
        budget.require()
        save(args.out / 'RESULT.json', dict(model=str(args.model), modelSha256=sha(args.model.with_suffix('.bin')), panelSha256=sha(HERE / 'OFFLINE_PANEL.json'), partitionsSha256=sha(HERE / 'PARTITIONS.json'), executionIdentity=execution, environment=identity(device), samples=len(records), plannedSamples=len(panel['requests']), seconds=budget.elapsed(), buckets={k: summarize(v) for k, v in buckets.items()}, finalTestEvaluated=False, uncertainty='固定少量独立宏首态诊断，不代表完整轨迹或未知地图泛化；按父局相关性汇总'))
    except BudgetExpired as error:
        save(args.out / 'TIMEOUT.json', dict(error=str(error), completedSamples=len(records), seconds=budget.elapsed(), executionIdentity=execution, success=False))
        raise
    finally:
        encoder.close()


if __name__ == '__main__':
    main()
