"""独立复算 V18 产物；只向 v19/review 写入结果，不修改历史数据。"""
from collections import Counter, defaultdict
from pathlib import Path
import hashlib
import json
import math
import struct

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / 'v18/out/run_20260927_v18_01'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def rows(path):
    with path.open(encoding='utf-8') as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def float32_input_key(row):
    """按实际推理浮点精度重算，不把 JSON 双精度尾数差当新输入。"""
    digest = hashlib.sha256()
    for values in (row['spatialTensor'], row['globalFeatures']):
        digest.update(struct.pack('<I', len(values)))
        digest.update(struct.pack(f'<{len(values)}f', *values))
    candidates = []
    for candidate in row['candidateActions']:
        item = hashlib.sha256()
        for field in ('actorCoord', 'landingCoord', 'targetCoord'):
            point = candidate.get(field)
            item.update(struct.pack('<2i', point['x'], point['y']) if point else struct.pack('<2i', -1, -1))
        values = candidate['semantics']
        item.update(struct.pack(f'<{len(values)}f', *values))
        candidates.append(item.digest())
    # 与现有身份合同一样，保留候选多重性而忽略候选排列。
    digest.update(struct.pack('<I', len(candidates)))
    for candidate in sorted(candidates):
        digest.update(candidate)
    return digest.hexdigest()


def main():
    report = {'scope': '当前工作树和既有逐局/训练记录；未重训、未重跑完整对局'}
    groups = read(ROOT / 'v17/out/v17_20260926_r2/identity/source_manifest.json')['groups']
    report['sources'] = {name: {'files': len(group['files']), 'changed': [p for p, h in group['files'].items() if not (ROOT / p).exists() or sha(ROOT / p) != h]} for name, group in groups.items()}
    arena = {}
    for summary in sorted((RUN / 'arena/dev').glob('*.summary.v18.json')):
        name = summary.name.removesuffix('.summary.v18.json')
        games = [r for p in sorted(summary.parent.glob(name + '.m*.games.jsonl')) for r in rows(p) if r.get('arm') == 'CANDIDATE']
        win = lambda g: g['outcomeKind'] == 'NATURAL_WIN' and g['winnerAllianceId'] == g['candidateAllianceId']
        arena[name] = {
            'games': len(games), 'wins': sum(map(win, games)),
            'uniqueGameIds': len({g['gameId'] for g in games}),
            'outcomes': dict(Counter(g['outcomeKind'] for g in games)),
            'byMap': {m: sum(win(g) for g in games if g['mapName'] == m) for m in sorted({g['mapName'] for g in games})},
            'fallbacks': sum(bool(g.get('fallbackUsed')) for g in games),
            'errors': sum(bool(g.get('error')) for g in games),
            'sumWallHours': sum(g['wallMs'] for g in games) / 3600000,
            'sumTransitions': sum(g['engineTransitions'] for g in games),
            'truncatedLowSubjectDecisionRows': [{'map': g['mapName'], 'seat': g['candidateSeat'], 'steps': g['steps'], 'subjectDecisions': g['candidateDecisions']} for g in games if not g['outcomeKind'].startswith('NATURAL') and g['candidateDecisions'] < g['steps'] * 0.1],
            'checkpointSha256': sorted({g['checkpointSha256'] for g in games}),
        }
    report['arena'] = arena
    report['training'] = {}
    for p in sorted((RUN / 'experiments').glob('*/metrics.json')):
        m = read(p)
        ledger = list(p.parent.glob('*.optimizer_update_ledger.jsonl'))
        report['training'][p.parent.name] = {
            'updatesReported': m.get('optimizerUpdates'),
            'ledgerRows': {x.name: sum(1 for _ in rows(x)) for x in ledger},
            'valueWeight': m['value_weight'], 'lossMode': m['loss_mode'],
            'trainSamples': m['train_samples'], 'valSamples': m['val_samples'],
            'bestEpoch': m['best_epoch'], 'bestValAccuracy': m['best_val_acc'],
            'finalTrainAccuracy': m['history'][-1]['train_acc'], 'finalValAccuracy': m['history'][-1]['val_acc'],
            'checkpointFiles': sorted(x.name for x in p.parent.glob('*.json') if x.name.startswith(('A_', 'B_', 'U_', 'K_'))),
            'exposures': m['history'][-1].get('exposuresCumulative'),
        }
    labels = {}
    for p in (RUN / 'labels').glob('l1_v18.train.*.jsonl'):
        for r in rows(p):
            labels[r['stateKey']] = r
    pool = ROOT / 'v17/out/v17_20260926_r2/experiments/_data/B0_trainval.jsonl'
    old_inputs = {r['actualInputKey'] for r in rows(pool) if r.get('split') == 'train'}
    parts = defaultdict(lambda: {'rows': 0, 'keys': set(), 'families': set(), 'phases': Counter(), 'labelMatched': 0, 'labelChanged': 0, 'sources': Counter(), 'recomputedKeys': set()})
    for r in rows(RUN / 'data/t18_04/T18_04_wave1_trainval.jsonl'):
        p = parts[r['_t18_04_partition']]
        p['rows'] += 1
        key = r.get('actualInputKey') or r.get('policyInputKey')
        p['keys'].add(key)
        # 不只依赖旧文件中的输入键；独立核对原始张量、全局量与候选输入。
        p['recomputedKeys'].add(float32_input_key(r))
        p['families'].add(r.get('trueFamilyId'))
        p['phases'][r.get('phaseBucket')] += 1
        p['sources'][str(r.get('targetSource'))] += 1
        label = labels.get(f"{r['stateHash']}|{r['subjectPlayerId']}")
        if label:
            p['labelMatched'] += 1
            p['labelChanged'] += r['candidateActions'][r['targetActionIndex']]['actionCode'] != label.get('targetActionCode')
    trainkeys = parts['targeted']['keys'] | parts['replay']['keys']
    report['wave1Data'] = {
        'parts': {k: {**{f: v for f, v in p.items() if f not in ('keys', 'families', 'recomputedKeys')}, 'uniqueInputs': len(p['keys']), 'recomputedUniqueInputs': len(p['recomputedKeys']), 'families': len(p['families']), 'newVsB0': len(p['keys'] - old_inputs)} for k, p in parts.items()},
        'uniqueTrainInputs': len(trainkeys), 'targetedReplayInputOverlap': len(parts['targeted']['keys'] & parts['replay']['keys']),
        'trainValInputOverlap': len(trainkeys & parts['val_unseen']['keys']),
        'newTrainInputsVsB0': len(trainkeys - old_inputs),
    }
    panels = {}
    for name in ('S3balanced', 'S3replication', 'S5balancedTeacher'):
        d = read(RUN / f'counterfactual/fullgame_ab.{name}.json')
        windows = d['windowDetails']
        families = defaultdict(list)
        for w in windows:
            aa = {x['seed']: x for x in w['perPolicy']['student']}
            bb = {x['seed']: x for x in w['perPolicy']['h0']}
            for seed in aa.keys() & bb.keys():
                if aa[seed]['naturalTerminal'] and bb[seed]['naturalTerminal']:
                    assert aa[seed]['subjectOutcome'] in ('WIN', 'LOSS', 'DRAW')
                    assert bb[seed]['subjectOutcome'] in ('WIN', 'LOSS', 'DRAW')
                    families[w['rootFamilyId']].append(int(bb[seed]['subjectOutcome'] == 'WIN') - int(aa[seed]['subjectOutcome'] == 'WIN'))
        # 按家族聚合，不把同局的多个窗口和多个续弈种子当独立初局。
        effects = [sum(v) / len(v) for v in families.values() if v]
        nonzero = [v for v in effects if v]
        n = len(nonzero)
        positive = sum(v > 0 for v in nonzero)
        assert sum(x > 0 for v in families.values() for x in v) == d['pairedComparison']['student_vs_h0']['bWins']
        assert sum(x < 0 for v in families.values() for x in v) == d['pairedComparison']['student_vs_h0']['aWins']
        p_sign = min(1, 2 * sum(math.comb(n, k) for k in range(min(positive, n-positive)+1)) / 2**n) if n else 1
        panels[name] = {
            'windows': len(windows), 'families': len({w['rootFamilyId'] for w in windows}),
            'gameIds': [w['gameId'] for w in windows], 'familyIds': sorted({w['rootFamilyId'] for w in windows}),
            'aggregate': d['aggregate'], 'paired': d['pairedComparison'],
            'familySignsH0StudentTie': [positive, n-positive, len(effects)-n], 'familySignTestTwoSided': p_sign,
            'familyMeanEffects': dict(zip(families, effects)),
        }
    report['continuationPanels'] = panels
    names = list(panels)
    report['continuationOverlap'] = {f'{a}__{b}': {'sameWindows': len(set(panels[a]['gameIds']) & set(panels[b]['gameIds'])), 'sameFamilies': len(set(panels[a]['familyIds']) & set(panels[b]['familyIds']))} for i, a in enumerate(names) for b in names[i+1:]}
    champion = ROOT / 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json'
    report['uiIdentity'] = {'championSha': sha(champion), 'bundled': {p.name: sha(p) for p in (ROOT / 'src/game/ai/models').glob('spatial*checkpoint.json')}}
    out = Path(__file__).with_name('audit_v18.json')
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'continuationPanels'}, ensure_ascii=False, indent=2))
    print(json.dumps({'continuationPanels': {k: {f: v for f, v in x.items() if f not in ('gameIds', 'familyIds', 'familyMeanEffects')} for k, x in panels.items()}}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
