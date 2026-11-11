"""仅在一次性封存令牌持有者的进程树中读取重编码数据。"""
from collections import defaultdict
import hashlib
import json
import os
from pathlib import Path
from statistics import mean
import sys

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage7_20261108_v1')
os.environ['MIOPEN_USER_DB_PATH'] = str(DATA / 'miopen-fp32-db')
os.environ['MIOPEN_CUSTOM_CACHE_DIR'] = str(DATA / 'cache')
from fp32_forward import forward, torch
from common import load_model, move
from ragged_batch import collate
from train_data import Dataset


def main():
    prefix, expected, db, identity, token_file, report = sys.argv[1:]
    token = json.loads(Path(token_file).read_text(encoding='utf-8'))
    gate_hash = hashlib.sha256((HERE / 'PHASE_D_DECISION.json').read_bytes()).hexdigest()
    assert token['attempts'] == 1 and token['sealedAccess'] == 1 and token['gateSha256'] == gate_hash and token['modelSha256'] == expected
    assert identity.split('/')[0] == gate_hash
    assert hashlib.sha256(Path(prefix + '.bin').read_bytes()).hexdigest() == expected
    assert Path(db).resolve().parent == (DATA / 'sealed-offline').resolve()
    torch.set_num_threads(2)
    model = load_model(prefix).accurate_reductions(False).cuda().eval()
    dataset = Dataset(db, identity)
    parents = defaultdict(list)
    bins = [[] for _ in range(10)]
    policy = []
    coverage = defaultdict(int)
    with torch.inference_mode():
        for (key,) in dataset.db.execute("SELECT id FROM chunks WHERE split='test' AND kind='sealed-offline' ORDER BY id"):
            rows = dataset.rows(key)
            x = move(collate(rows), 'cuda'); out = forward(model, x)
            probs = out['valueProbs'].cpu().tolist()
            brier = (out['valueProbs'] - x['valueTarget']).square().sum(-1).cpu().tolist()
            ce = (-(x['valueTarget'] * out['valueLogits'].log_softmax(-1)).sum(-1)).cpu().tolist()
            for i, row in enumerate(rows):
                s = row['source']
                assert s['split'] == 'test' and row['valueMask'].item()
                parents[s['parentId']].append((brier[i], ce[i]))
                coverage[f"{s['players']}P/{s['category']}"] += 1
                for p, t, active in zip(probs[i], row['valueTarget'].tolist(), row['active'].tolist()):
                    if active:
                        bins[min(9, max(0, int(p * 10)))].append(p - t)
                if row['policyMask'].item():
                    n = len(row['pointers'])
                    policy.append(float(-out['logits'][i, :n].log_softmax(-1)[int(row['policyTarget'].item())]))
    assert len(parents) == 329
    samples = sum(map(len, parents.values()))
    result = dict(passed=True, parents=len(parents), samples=samples,
                  brier=mean(mean(r[0] for r in p) for p in parents.values()), ce=mean(mean(r[1] for r in p) for p in parents.values()),
                  slotECE=sum(abs(sum(b)) for b in bins) / sum(map(len, bins)),
                  policyNll=mean(policy) if policy else None, legalPolicyLabels=len(policy), illegalOrUnavailablePolicyLabels=samples-len(policy),
                  coverage=dict(coverage), engineSha256=token['engineSha256'], modelSha256=expected, sealedAccess=1)
    with Path(report).open('x', encoding='utf-8') as out:
        json.dump(result, out, ensure_ascii=False, indent=2, allow_nan=False)


if __name__ == '__main__':
    main()
