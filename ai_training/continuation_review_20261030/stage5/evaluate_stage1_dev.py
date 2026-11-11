"""只读历史冻结离线缓存，评估完整old/dev与new/dev，不使用新抽样替代原面板。"""
import collections
import hashlib
import json
from pathlib import Path
import torch
from isolation import load_model, PREFIX

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')
CACHE = Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1/run-v2-batch8/dev-cache/COMPLETE.json')


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    torch.set_num_threads(2)
    prefixes = [PREFIX, str(DATA / 'heads-v1/H1/final'), str(DATA / 'heads-v1/H2/final')]
    models = [load_model(p).accurate_reductions(True).cuda().eval() for p in prefixes]
    cache = json.loads(CACHE.read_text())
    records, maximum = [], [0., 0.]
    with torch.inference_mode():
        for chunk in cache['chunks']:
            file = Path(chunk['file'])
            if digest(file) != chunk['sha256']:
                raise ValueError('历史缓存摘要变化')
            for row in torch.load(file, map_location='cpu', weights_only=False):
                source = row['source']
                if source['split'] != 'dev':
                    continue
                x = {k: v.cuda() if isinstance(v, torch.Tensor) else v for k, v in row.items()}
                outputs = [model(x) for model in models]
                values = []
                for i, out in enumerate(outputs):
                    prior_scale = 1. if source['corpus'] == 'old' else .3
                    logits = out['logits'] + prior_scale * torch.tensor(source['prior'], device='cuda')
                    values.append({'brier': float(((out['valueProbs'] - x['valueTarget']) ** 2).sum()),
                                   'ce': float(-(x['valueTarget'] * out['valueLogits'].log_softmax(-1)).sum()),
                                   'policyNll': float(-logits.log_softmax(-1)[int(row['policyTarget'])])})
                    if i:
                        maximum[i-1] = max(maximum[i-1], float((outputs[0]['logits'] - out['logits']).abs().max()))
                records.append({'parentId': source['parentId'], 'corpus': source['corpus'], 'players': source['players'], 'values': values})
    summary = {}
    for corpus in ('old', 'new'):
        parents = collections.defaultdict(list)
        for record in records:
            if record['corpus'] == corpus:
                parents[record['parentId']].append(record)
        if not parents:
            raise ValueError('原开发面板缺少数据来源')
        summary[corpus] = {'parents': len(parents), 'samples': sum(map(len, parents.values())), 'models': {}}
        for index, name in enumerate(('Omni-Base', 'H1', 'H2')):
            summary[corpus]['models'][name] = {key: sum(sum(r['values'][index][key] for r in rows) / len(rows) for rows in parents.values()) / len(parents) for key in ('brier', 'ce', 'policyNll')}
    result = {'cacheManifestSha256': digest(CACHE), 'models': {name: digest(Path(p).with_suffix('.bin')) for name, p in zip(('Omni-Base', 'H1', 'H2'), prefixes)}, 'summary': summary, 'maxPolicyLogitDiff': maximum, 'sealedAccess': 0}
    with (HERE / 'STAGE1_DEV_H1_H2.json').open('x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
