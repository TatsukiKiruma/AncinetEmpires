"""诊断：训练数据动作类型分布 + 已训模型 train/val top1。用法：
python python/learn_duel_diag.py --model docs/training/battle_ai/models/learned_duel_v5.json
"""
import argparse
import json
import sys
from collections import Counter

import torch

sys.path.insert(0, 'python')
from learn_duel_train import load_labeled, split_games, eval_policy, MLP


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--files', default='')
    args = ap.parse_args()
    m = json.load(open(args.model, encoding='utf-8'))
    files = args.files.split(',') if args.files else [
        'training_runs/learn_duel/teacher59_lp.jsonl',
        'training_runs/learn_duel/mirror_01.labeled.jsonl',
    ]
    pol = load_labeled(files)
    tr, va = split_games(pol)
    use_tr = [s for s in tr if s.get('policy') in ('battle', 'dagger') and s.get('cands')]
    use_va = [s for s in va if s.get('policy') in ('battle', 'dagger') and s.get('cands')]

    def dist(samples):
        c = Counter()
        for s in samples:
            code = (s.get('codes') or ['?'])[0]
            c[code.split(':')[0]] += 1
        tot = sum(c.values())
        return {k: (v, round(v / tot, 3)) for k, v in c.most_common()}

    print('TRAIN teacher-choice dist:', dist(use_tr))
    print('VAL teacher-choice dist:', dist(use_va))
    print('n tr/va:', len(use_tr), len(use_va))

    hidden = m['hidden']
    act_dim = m.get('actDim', 45)
    depth = m.get('depth', len(m['policy']['layers']) - 1)
    dev = torch.device('cpu')
    pmodel = MLP(356 + act_dim, hidden, depth).float()
    for mod, saved in zip(pmodel.layers, m['policy']['layers']):
        mod.weight.data = torch.tensor(saved['w'])
        mod.bias.data = torch.tensor(saved['b'])
    mean = torch.tensor(m['policy']['scaler']['mean'])
    std = torch.tensor(m['policy']['scaler']['std'])
    print('train top1:', round(eval_policy(pmodel, use_tr, mean, std, dev), 4))
    print('val top1:', round(eval_policy(pmodel, use_va, mean, std, dev), 4))


if __name__ == '__main__':
    main()
