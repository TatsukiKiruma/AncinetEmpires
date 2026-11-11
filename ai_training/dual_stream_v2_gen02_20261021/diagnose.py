"""只读取训练/固定开发证据，统计源权重、轨迹相关性与价值漂移。"""
import gzip
import json
from collections import Counter, defaultdict
import torch
from bootstrap import HERE, OLD, digest


def rows(p):
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        for line in f:
            yield json.loads(line)


def main():
    stats = defaultdict(Counter)
    root = dict(count=0, terminal=0, squaredTerminalError=0., queuedRootMasks=0)
    for slot in json.loads((OLD / 'generations/gen_01/league-plan.json').read_text('utf-8'))['slots']:
        p = OLD / 'generations/gen_01/games' / slot['id'] / 'samples.jsonl.gz'
        previous = None
        for row in rows(p):
            stage = 'opening' if row['state']['turn'] <= 5 else 'middle' if row['state']['turn'] <= 15 else 'late'
            key = f"{row['configuredPlayers']}p/{stage}"
            stats['expertCounts'][key] += 1
            stats['expertWeighted'][key] += row['quality']
            stats['expertActions'][row['targetCode'].split(':')[0]] += 1
            stats['expertKinds']['correction' if row['correction'] else 'winning'] += 1
            stats['expertKinds']['adjacentSameParent'] += int(previous == row['parentId'])
            previous = row['parentId']
            if row['rootMask']:
                root['count'] += 1
                if row['terminalMask']:
                    groups = defaultdict(float)
                    for alliance, target in zip(row['alliances'], row['terminalTarget']):
                        if alliance is not None:
                            groups[alliance] += target
                    target = groups[row['selfAlliance']] - max([v for k, v in groups.items() if k != row['selfAlliance']] or [0.])
                    root['squaredTerminalError'] += (row['rootValue'] - target) ** 2
                    root['terminal'] += 1
    for lane in range(5):
        for row in rows(HERE.parent / f'dual_stream_v2_phase3_20261020/corpus/train-{lane}.jsonl.gz'):
            if row['kind'] == 'map':
                continue
            # 与旧训练相同的稳定SHA抽样；排重后的精确19127以旧流收据为准。
            import hashlib
            if int(hashlib.sha256(row['label']['currentBeforeHash'].encode()).hexdigest()[:8], 16) / 2**32 >= 20000 / 141381:
                continue
            stage = 'opening' if row['state']['turn'] <= 5 else 'middle' if row['state']['turn'] <= 15 else 'late'
            stats['basePreExclusionCounts'][f"{row['configuredPlayers']}p/{stage}"] += 1
            stats['basePreExclusionActions'][row['label']['targetCode'].split(':')[0]] += 1
    dev = {}
    for generation in [0, 1]:
        folder = OLD / f'generations/gen_{generation:02d}'
        with gzip.open(folder / 'dev-calibration.pt.gz', 'rb') as f:
            d = torch.load(f, weights_only=False)
        bias = torch.tensor(json.loads((folder / 'head-calibration.json').read_text('utf-8'))['headBias'])
        raw = d['valueLogits'].softmax(-1)
        slices = {}
        for players in [2, 3, 4]:
            for phase in ['all', 'opening', 'middle', 'late']:
                indices = [i for i, s in enumerate(d['sources']) if s['configuredPlayers'] == players and (phase == 'all' or ['opening', 'middle', 'late'][int(d['bucket'][i]) % 3] == phase)]
                ids = torch.tensor(indices)
                slices[f'{players}p/{phase}'] = dict(count=len(ids), rawBrier=float((raw[ids] - d['target'][ids]).square().mean()))
        dev[str(generation)] = dict(headTop1=float(((d['maximum'] + bias).argmax(-1) == d['targetHead']).float().mean()), rawValueSlices=slices, calibratedValuePassed=json.loads((folder / 'value-calibration.json').read_text('utf-8'))['passed'])
    root['terminalMse'] = root['squaredTerminalError'] / max(1, root['terminal'])
    report = dict(distributions={k: dict(v) for k, v in stats.items()}, rootSupervision=root, fixedDev=dev, intermediateBaseCheckpointAvailable=False, causalConclusion='完整基础阶段的独立权重未保存，不能把最终漂移归因为遗忘；顺序相关和教师未获资格构成风险证据。', oldSourceSha256=digest(OLD / 'distill.py'), proposedRetention='冻结共享编码器与价值头，只更新策略指针头；跨源交错、跨局洗牌，基础样本以冠军KL约束；根标量仅审计，不进入冻结价值优化。旧不对称专家只作诊断，不进入第2代。')
    (HERE / 'diagnosis.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(experts=sum(stats['expertCounts'].values()), weighted=sum(stats['expertWeighted'].values()), root=root, dev={k: {kk: vv for kk, vv in v.items() if kk != 'rawValueSlices'} for k, v in dev.items()})))


if __name__ == '__main__':
    main()
