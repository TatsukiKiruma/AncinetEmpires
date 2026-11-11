"""从旧持久日志恢复基础/专家各自更新预算，不把样本权重当梯度贡献证明。"""
import json
from bootstrap import HERE, OLD, digest


def main():
    log = OLD / 'gen1-distill.log'
    records = []
    for line in log.read_text('utf-8').splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and row.get('phase') == 1 and 'batch' in row and 'updates' in row:
            records.append(row)
    complete = json.loads((OLD / 'generations/gen_01/training-complete.json').read_text('utf-8'))
    assert records and complete['completed']
    base_updates = records[-1]['updates'] - records[-1]['batch']
    expert_updates = complete['updates'] - base_updates
    base_samples = sum(h['processedThisSegment'] for h in complete['history'] if h['phase'] == 'base')
    expert_samples = sum(h['processedThisSegment'] for h in complete['history'] if h['phase'] == 'expert')
    report = dict(baseUpdates=base_updates, expertUpdates=expert_updates, baseSamples=base_samples, expertSamples=expert_samples, baseMeanBatch=base_samples / base_updates, expertMeanBatch=expert_samples / expert_updates, expertSampleShare=expert_samples / (base_samples + expert_samples), expertUpdateShare=expert_updates / complete['updates'], logSha256=digest(log), lastPhaseOneRecord=records[-1], causalConclusion='专家分桶小批次改变更新次数与末段训练顺序；这说明更新预算不等于样本占比，不能单独证明遗忘因果，也不能推导实际梯度份额。')
    (HERE / 'update-budget-diagnosis.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
