"""固定候选的唯一离线封存复核；CPU单线程，不与实战竞争GPU。"""
import collections
import json
from pathlib import Path
import torch
from isolation import load_model, PREFIX
from sealed_guard import validate_gate, sha

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')


def ece(points):
    bins = [[] for _ in range(10)]
    for probability, target in points:
        bins[min(9, int(probability * 10))].append((probability, target))
    rows = [{'bin': i, 'count': len(b), 'confidence': sum(x for x, _ in b) / len(b), 'frequency': sum(y for _, y in b) / len(b)} for i, b in enumerate(bins) if b]
    return {'ece': sum(r['count'] * abs(r['confidence'] - r['frequency']) for r in rows) / max(1, len(points)), 'bins': rows}


def summarize(rows):
    parents = collections.defaultdict(list)
    for r in rows: parents[r['parentId']].append(r)
    return {'parents': len(parents), 'samples': len(rows), 'parentEqual': {k: sum(sum(r[k] for r in group) / len(group) for group in parents.values()) / len(parents) for k in ('brier', 'ce', 'policyNll')},
            'slotReliability': ece([p for r in rows for p in r['slotPoints']]), 'allianceReliability': ece([p for r in rows for p in r['alliancePoints']])}


def main():
    proof = validate_gate(); token = json.loads((HERE / 'FINAL_TEST_ATTEMPT.json').read_text())
    assert token['gateSha256'] == proof['gateSha256'] and token['modelSha256'] == proof['modelSha256']
    cache = Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1/sealed-cache/COMPLETE.json')
    manifest = json.loads(cache.read_text()); assert manifest['parents'] == 329 and manifest['sealed']
    alliances = json.loads((HERE / 'SEALED_ALLIANCES.json').read_text())
    assert alliances['partitionsSha256'] == manifest['partitionsSha256']
    prefixes = {'2414': str(HERE.parents[1] / 'phone_2m_continue414_20261027/completion/job/output/final'), 'Stage3': PREFIX, 'Stage5': str(DATA / 'heads-v1/H1/final')}
    with (HERE / 'SEALED_OFFLINE_ATTEMPT.json').open('x', encoding='utf-8') as stream:
        json.dump({'attempts': 1, 'cacheSha256': sha(cache), 'models': {k: sha(Path(v).with_suffix('.bin')) for k, v in prefixes.items()}}, stream)
    torch.set_num_threads(1)
    models = {k: load_model(v).accurate_reductions(True).eval() for k, v in prefixes.items()}
    records = {k: [] for k in models}; policy_error = 0.
    with torch.inference_mode():
        for chunk in manifest['chunks']:
            file = Path(chunk['file']); assert sha(file) == chunk['sha256']
            for row in torch.load(file, map_location='cpu', weights_only=False):
                s = row['source']; assert s['split'] == 'test'
                outputs = {k: m(row) for k, m in models.items()}
                policy_error = max(policy_error, float((outputs['Stage3']['logits'] - outputs['Stage5']['logits']).abs().max()))
                for name, out in outputs.items():
                    p = out['valueProbs'].double(); target = row['valueTarget'].double(); active = row['active'].bool()
                    groups = collections.defaultdict(list)
                    for slot, player in enumerate(s['playerOrder']['playerIds']):
                        if player is not None and active[slot]: groups[alliances['alliances'][s['parentId']][str(player)]].append(slot)
                    alliance_points = [(float(p[slots].sum()), float(target[slots].sum())) for slots in groups.values()]
                    logits = out['logits'].double() + torch.tensor(s['prior'], dtype=torch.float64)
                    records[name].append({'parentId': s['parentId'], 'players': s['players'], 'phase': s['phase'], 'brier': float(((p - target) ** 2).sum()), 'ce': float(-(target * out['valueLogits'].double().log_softmax(-1)).sum()), 'policyNll': float(-logits.log_softmax(-1)[int(row['policyTarget'])]), 'slotPoints': [(float(p[i]), float(target[i])) for i in range(6) if active[i]], 'alliancePoints': alliance_points})
    report = {'models': {}, 'policyMaxAbsDiffStage3Stage5': policy_error, 'sealedAccess': 1, 'eceDefinition': '10个等宽置信度桶；槽及联盟事件按样本计权，Brier/CE/NLL按父局等权', 'stage4ValueHead': 'Stage4复用Stage3同一价值模型，离线值相同'}
    for name, rows in records.items():
        assert len({r['parentId'] for r in rows}) == 329 and len(rows) == manifest['samples']
        buckets = collections.defaultdict(list)
        for r in rows: buckets[f"{r['players']}P/{r['phase']}"].append(r)
        report['models'][name] = {'overall': summarize(rows), 'buckets': {k: summarize(v) for k, v in buckets.items()}}
    assert policy_error == 0
    with (HERE / 'SEALED_OFFLINE_REPORT.json').open('x', encoding='utf-8') as stream: json.dump(report, stream, ensure_ascii=False, indent=2)
    print(json.dumps({name: r['overall']['parentEqual'] for name, r in report['models'].items()}), flush=True)


if __name__ == '__main__':
    main()
