import pathlib, json, statistics, hashlib
import numpy as np
import torch
import gzip
from reference import forward, ROOT, VW


def main():
    initial = np.asarray(json.loads((ROOT/'initial.json').read_text()), dtype=np.float64)
    results, weights = {}, {}
    max_weight_error = 0
    for device in ['pc', 'phone']:
        runs = [json.loads((ROOT/f'{device}-train-{i}.json').read_text(encoding='utf-8')) for i in range(3)]
        values = [np.frombuffer((ROOT/f'{device}-train-{i}.bin').read_bytes(), dtype='>f8').astype(np.float64) for i in range(3)]
        assert all(len(v) == len(initial) and np.all(np.isfinite(v)) for v in values)
        assert all(np.array_equal(v[VW:], initial[VW:]) for v in values)
        assert all(np.any(v[:VW] != initial[:VW]) for v in values)
        assert all(r['metrics']['steps'] == 300 and r['metrics']['rows'] == 2400 for r in runs)
        assert all(r['metrics']['lossAfter'] < r['metrics']['lossBefore'] for r in runs)
        for v in values:
            max_weight_error = max(max_weight_error, float(np.max(np.abs(v-values[0]))))
        seconds = [r['metrics']['trainingSeconds'] for r in runs]
        end_to_end = [r['metrics']['endToEndSeconds'] for r in runs]
        results[device] = dict(trainingSeconds=seconds, medianTrainingSeconds=statistics.median(seconds), medianEndToEndSeconds=statistics.median(end_to_end), runs=runs)
        weights[device] = values[0]
    cross_error = float(np.max(np.abs(weights['pc'] - weights['phone'])))
    assert max_weight_error < 1e-8 and cross_error < 1e-8
    ratio = results['phone']['medianTrainingSeconds']/results['pc']['medianTrainingSeconds']
    schema = json.loads((ROOT/'schema.json').read_text())
    candidate = dict(schema=schema, weights=weights['pc'].tolist(), policyOnly=True, valueHeadFrozen=True, independentStrengthEvaluated=False, promoted=False, gateSha256=hashlib.sha256((ROOT/'GATE.json').read_bytes()).hexdigest())
    (ROOT/'candidate.json').write_text(json.dumps(candidate, separators=(',', ':')))
    with gzip.open(ROOT/'encoded.jsonl.gz', 'rt') as f:
        data = [json.loads(line) for line in f]
    tensor = torch.from_numpy(weights['pc'])
    from reference import best
    with gzip.open(ROOT/'trained-reference.jsonl.gz', 'wt') as refs, torch.no_grad():
        for row in data:
            logits, value = forward(row, tensor)
            z = logits.tolist()
            refs.write(json.dumps(dict(logits=z, value=value.item(), best=best(z)), separators=(',', ':'))+'\n')
    phone_snapshots = [s for run in results['phone']['runs'] for s in [run['before'], *run['samples'], run['after']]]
    resources = dict(maxBatteryCelsius=max(s['batteryCelsius'] for s in phone_snapshots), minAvailableMemoryBytes=min(s['memAvailableBytes'] for s in phone_snapshots), minPhoneFreeBytes=min(s['dataAvailableBytes'] for s in phone_snapshots), captureApkObserved=any(s['captureApkPids'] for s in phone_snapshots), fridaProcessObservations=sorted(set(p for s in phone_snapshots for p in s['relevantProcesses'] if 'frida' in p)))
    result = dict(results=results, phoneToPcTrainingTimeRatio=ratio, withinDeviceWeightMaxError=max_weight_error, crossDeviceWeightMaxError=cross_error, valueHeadBytesUnchanged=True, changedPolicyParameters=int(np.count_nonzero(weights['pc'][:VW]-initial[:VW])), resources=resources, limitations=['训练内诊断，不是独立棋力评测', '小型3566参数模型；单核后台配置；HotSpot与ART运行时不同，不代表设备满性能', '全部合格数据仍归train，本轮仅消费2400条，尚未全量适配验收', 'value头冻结但共享编码参数更新；value输出未接受训练或结果校准'])
    (ROOT/'trial-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(pcMedian=results['pc']['medianTrainingSeconds'], phoneMedian=results['phone']['medianTrainingSeconds'], ratio=ratio, weightMaxError=cross_error, resources=resources), ensure_ascii=True))


if __name__ == '__main__':
    main()
