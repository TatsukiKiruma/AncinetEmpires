"""蒸馏训练：策略头（listwise BC，学 teacher 选择）+ 价值头（结局回归）。
输入：learn_duel_relabel.py 产出的 .labeled.jsonl（state 356 维 + cands 45 维）。
输出：docs/training/battle_ai/models/learned_duel_<tag>.json（TS 可直接推理的 MLP 权重+标准化器）。
用法：
  python python/learn_duel_train.py --policy-in training_runs/learn_duel/teacher_lp.labeled.jsonl,training_runs/learn_duel/teacher_icm.labeled.jsonl --value-in training_runs/learn_duel/teacher_lp.labeled.jsonl,training_runs/learn_duel/teacher_icm.labeled.jsonl,training_runs/learn_duel/mirror_01.labeled.jsonl --out docs/training/battle_ai/models/learned_duel_v1.json --epochs-policy 30 --epochs-value 30
"""
import argparse
import json
import math
import os
import sys
from collections import defaultdict

import torch
import torch.nn as nn


STATE_DIM = 356
# ACT_DIM 由 --act-dim 指定：45=旧版（无关系事实），59=45+14关系事实。
# 混用维度会被 usable() 过滤掉。
ACT_DIM_DEFAULT = 59


class MLP(nn.Module):
    def __init__(self, in_dim, hidden, depth=2):
        super().__init__()
        self.layers = nn.ModuleList()
        self.layers.append(nn.Linear(in_dim, hidden))
        for _ in range(depth - 2):
            self.layers.append(nn.Linear(hidden, hidden))
        self.layers.append(nn.Linear(hidden, 1))
        self.depth = depth

    def forward(self, x):
        for layer in self.layers[:-1]:
            x = torch.relu(layer(x))
        return self.layers[-1](x).squeeze(-1)


def to_layer_json(model):
    layers = []
    for mod in model.layers:
        layers.append({
            'w': mod.weight.detach().cpu().tolist(),
            'b': mod.bias.detach().cpu().tolist(),
        })
    return layers


def load_labeled(paths):
    samples = []
    for p in paths:
        with open(p, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    samples.append(json.loads(line))
    return samples


def load_pairs(paths):
    pairs = []
    for p in paths:
        if not p:
            continue
        with open(p, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    o = json.loads(line)
                    if o.get('kind') == 'value_pair' and o.get('stateT') and o.get('stateS'):
                        pairs.append(o)
    return pairs


def group_key(s):
    return (s.get('map'), s.get('seed'))


def split_games(samples, holdout_frac=0.2, seed=7):
    games = defaultdict(list)
    for s in samples:
        games[group_key(s)].append(s)
    keys = sorted(games.keys(), key=str)
    rng = torch.Generator().manual_seed(seed)
    perm = torch.randperm(len(keys), generator=rng).tolist()
    n_hold = max(1, int(len(keys) * holdout_frac))
    hold = set(keys[i] for i in perm[:n_hold])
    tr, va = [], []
    for k, v in games.items():
        (va if k in hold else tr).extend(v)
    return tr, va


def scaler_fit(X):
    mean = X.mean(dim=0)
    std = X.std(dim=0)
    std[std < 1e-6] = 1.0
    return mean, std


def train_policy(train, val, epochs, lr, device, hidden, use_all, act_dim, depth):
    # 默认只用获胜对局的 teacher 决策；--policy-all 则用全部 teacher 决策（含失败对局，保证 Icy 等弱图有表示）
    def usable(s):
        if s.get('policy') not in ('battle', 'dagger', 'selfplay') or not s.get('cands'):
            return False
        if not s['cands'] or len(s['cands'][0]) != act_dim:
            return False
        return True if use_all else s.get('outcomeActing') == 1
    tr = [s for s in train if usable(s)]
    va = [s for s in val if usable(s)]
    print(f'[policy] train={len(tr)} val={len(va)} hidden={hidden} use_all={use_all}', flush=True)
    # standardize on concatenated train rows
    with torch.no_grad():
        all_rows = []
        for s in tr:
            st = torch.tensor(s['state'], dtype=torch.float64)
            for c in s['cands']:
                all_rows.append(torch.cat([st, torch.tensor(c, dtype=torch.float64)]))
        X = torch.stack(all_rows).float()
    mean, std = scaler_fit(X)
    Xs = (X - mean) / std

    model = MLP(STATE_DIM + act_dim, hidden, depth).to(device).float()
    opt = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    # build per-sample index ranges
    bounds = []
    off = 0
    for s in tr:
        n = len(s['cands'])
        bounds.append((off, off + n))
        off += n
    Xs = Xs.to(device)
    # 回合加权：开局（T1-T3）样本稀少却决定整局走向（T2 少招一兵 T9 就崩），学 4 遍；
    # T4-T6 学 2 遍。
    # 类型加权（cost-sensitive）：招募/攻击/capture 在标签中只占 10%/6%/3%，
    # 无加权时 net 学会 base rate（从不主动爆兵打架，mourning T5 坐拥350金零招募教训）；
    # wait/end 则因过产（55% vs teacher 32%）略微降权。
    TYPE_W = {
        'recruit_to_castle': 3.0, 'recruit_and_deploy': 3.0,
        'attack': 2.5, 'capture': 2.0, 'heal': 2.0, 'support': 2.0,
        'summon': 2.0, 'repair': 2.0, 'destroy_town': 2.0,
        'move': 1.0, 'post_attack_move': 1.0,
        'wait': 0.7, 'end_turn': 0.7,
    }

    def behind_w(s):
        # state 全局块：[4]=我方数/10 [5]=敌方数/10 [6]=我方军力/1000 [7]=敌方军力/1000
        # 落后局（军力<90% 或 数量落后2+）学 3 遍：学生 P0 0/10 的主因就是不会打逆风
        try:
            st = s['state']
            own_n, en_n = st[4] * 10, st[5] * 10
            own_a, en_a = st[6] * 1000, st[7] * 1000
            if own_a < en_a * 0.9 or en_n - own_n >= 2:
                return 3.0
        except Exception:
            pass
        return 1.0

    def outcome_w(s):
        # 回报加权（reward-weighted regression，RL 式信号）：
        # 胜局决策学 2 遍，负局只学 0.25 遍（保留 Icy 等弱图表示但不模仿失败）。
        # 自博弈样本对比更强（胜×3/负×0.1）：on-policy 的赢法大力强化，输法几乎不学。
        oc = s.get('outcomeActing')
        if s.get('policy') == 'selfplay':
            if oc == 1:
                return 3.0
            if oc == -1:
                return 0.1
            return 1.0
        if oc == 1:
            return 2.0
        if oc == -1:
            return 0.25
        return 1.0

    wts = torch.tensor([
        (4.0 if (s.get('turn') or 99) <= 3 else (2.0 if (s.get('turn') or 99) <= 6 else 1.0))
        * TYPE_W.get((s.get('codes') or ['?'])[0].split(':')[0], 1.0)
        * behind_w(s)
        * outcome_w(s)
        for s in tr
    ])
    for ep in range(1, epochs + 1):
        model.train()
        perm = torch.randperm(len(bounds))
        total_loss, total_n = 0.0, 0
        for bi in perm.tolist():
            a, b = bounds[bi]
            scores = model(Xs[a:b])
            loss = (torch.logsumexp(scores, dim=0) - scores[0]) * float(wts[bi])
            opt.zero_grad()
            loss.backward()
            opt.step()
            total_loss += loss.item()
            total_n += 1
        acc = eval_policy(model, va, mean, std, device)
        tracc = eval_policy(model, tr[:500], mean, std, device)
        print(f'[policy] epoch={ep} loss={total_loss / max(1, total_n):.4f} trainTop1sub={tracc:.4f} valTop1={acc:.4f}', flush=True)
    return model, mean, std


@torch.no_grad()
def eval_policy(model, va, mean, std, device):
    model.eval()
    correct, total = 0, 0
    for s in va:
        st = torch.tensor(s['state'], dtype=torch.float32)
        rows = torch.stack([torch.cat([st, torch.tensor(c, dtype=torch.float32)]) for c in s['cands']])
        rows = ((rows - mean) / std).to(device)
        scores = model(rows)
        if int(torch.argmax(scores).item()) == 0:
            correct += 1
        total += 1
    return correct / max(1, total)


PAIR_WEIGHT = 0.3


def train_value(train, val, epochs, lr, device, hidden_v, pairs_tr, pairs_va):
    # pairs: 同一学生态下 teacher 结果态 vs 学生结果态，学动作级排序（margin/BCE on logit 差）
    def usable(s):
        return s.get('outcomeActing') in (1, -1, 0) and s.get('state')
    tr = [s for s in train if usable(s)]
    va = [s for s in val if usable(s)]
    print(f'[value] train={len(tr)} val={len(va)}', flush=True)
    Xtr = torch.tensor([s['state'] for s in tr], dtype=torch.float32)
    ytr = torch.tensor([(s['outcomeActing'] + 1) / 2 for s in tr], dtype=torch.float32)
    Xva = torch.tensor([s['state'] for s in val], dtype=torch.float32)
    yva = torch.tensor([(s['outcomeActing'] + 1) / 2 for s in val], dtype=torch.float32)
    mean, std = scaler_fit(Xtr)
    Xtr = ((Xtr - mean) / std).to(device)
    Xva = ((Xva - mean) / std).to(device)
    ytr, yva = ytr.to(device), yva.to(device)
    model = MLP(STATE_DIM, hidden_v).to(device).float()
    opt = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    bce = nn.BCEWithLogitsLoss()
    bs = 256
    # pair 数据用同一标准化器
    PT = torch.tensor([p['stateT'] for p in pairs_tr], dtype=torch.float32) if pairs_tr else None
    PS = torch.tensor([p['stateS'] for p in pairs_tr], dtype=torch.float32) if pairs_tr else None
    PTE = torch.tensor([p['stateT'] for p in pairs_va], dtype=torch.float32) if pairs_va else None
    PSE = torch.tensor([p['stateS'] for p in pairs_va], dtype=torch.float32) if pairs_va else None
    if pairs_tr or pairs_va:
        print(f'[value] pairs train={len(pairs_tr)} val={len(pairs_va)} weight={PAIR_WEIGHT}', flush=True)
    for ep in range(1, epochs + 1):
        model.train()
        perm = torch.randperm(len(Xtr))
        tot = 0.0
        nb = 0
        for i in range(0, len(Xtr), bs):
            idx = perm[i:i + bs]
            loss = bce(model(Xtr[idx]), ytr[idx])
            # pairwise：teacher 结果态 logit 应高于学生结果态（降权保校准）
            if pairs_tr:
                pi = torch.randperm(len(pairs_tr))[:min(bs, len(pairs_tr))]
                zt = model(((PT[pi] - mean) / std).to(device))
                zs = model(((PS[pi] - mean) / std).to(device))
                loss = loss + PAIR_WEIGHT * bce(zt - zs, torch.ones_like(zt))
            opt.zero_grad()
            loss.backward()
            opt.step()
            tot += loss.item()
            nb += 1
        model.eval()
        with torch.no_grad():
            pv = torch.sigmoid(model(Xva))
            mse = ((pv - yva) ** 2).mean().item()
            xv = pv - pv.mean()
            yv = yva - yva.mean()
            pear = (xv * yv).mean().item() / max(1e-9, math.sqrt((xv ** 2).mean().item() * (yv ** 2).mean().item()))
            pair_acc = None
            if pairs_va:
                n_ev = min(2000, len(pairs_va))
                ev = torch.randperm(len(pairs_va))[:n_ev]
                zt = model(((PTE[ev] - mean) / std).to(device))
                zs = model(((PSE[ev] - mean) / std).to(device))
                pair_acc = (zt > zs).float().mean().item()
        msg = f'[value] epoch={ep} loss={tot / max(1, nb):.4f} valMSE={mse:.4f} valPearson={pear:.4f}'
        if pair_acc is not None:
            msg += f' valPairAcc={pair_acc:.4f}'
        print(msg, flush=True)
    return model, mean, std


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--policy-in', required=True)
    ap.add_argument('--value-in', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--epochs-policy', type=int, default=30)
    ap.add_argument('--epochs-value', type=int, default=30)
    ap.add_argument('--lr-policy', type=float, default=3e-3)
    ap.add_argument('--lr-value', type=float, default=1e-3)
    ap.add_argument('--hidden', type=int, default=256)
    ap.add_argument('--depth', type=int, default=2)
    ap.add_argument('--seat', default='all',
                    help='all=不分色；0=只用 playerId==0 的样本训 P0-net；1=只用 playerId==1 训 P1-net')
    ap.add_argument('--act-dim', type=int, default=ACT_DIM_DEFAULT)
    ap.add_argument('--tag', default='v2')
    ap.add_argument('--policy-all', action='store_true',
                    help='policy 用全部 teacher 决策（含失败对局），否则只用获胜对局')
    ap.add_argument('--pairs-in', default='',
                    help='value_pair jsonl，逗号分隔；为空则不做 pairwise')
    args = ap.parse_args()
    torch.manual_seed(11)
    torch.set_num_threads(max(1, (os.cpu_count() or 4) - 1))
    device = torch.device('cpu')

    pol_samples = load_labeled(args.policy_in.split(','))
    val_samples = load_labeled(args.value_in.split(','))
    if args.seat in ('0', '1'):
        seat = int(args.seat)
        pol_samples = [s for s in pol_samples if s.get('playerId') == seat]
        print(f'[seat] P{seat}-net policy samples={len(pol_samples)}', flush=True)
    ptr, pva = split_games(pol_samples)
    vtr, vva = split_games(val_samples)

    pmodel, pmean, pstd = train_policy(ptr, pva, args.epochs_policy, args.lr_policy, device, args.hidden, args.policy_all, args.act_dim, args.depth)
    pacc = eval_policy(pmodel, pva, pmean, pstd, device)
    all_pairs = load_pairs(args.pairs_in.split(',')) if args.pairs_in else []
    # pair 按对局分组做 holdout（与 split_games 同种子，保证诚实 valPairAcc）
    pgames: dict = defaultdict(list)
    for p in all_pairs:
        pgames[(p.get('map'), p.get('seed'))].append(p)
    pkeys = sorted(pgames.keys(), key=str)
    prng = torch.Generator().manual_seed(7)
    pperm = torch.randperm(len(pkeys), generator=prng).tolist() if pkeys else []
    p_hold = set(pkeys[i] for i in pperm[:max(1, int(len(pkeys) * 0.2))])
    pairs_tr = [p for k, v in pgames.items() if k not in p_hold for p in v]
    pairs_va = [p for k, v in pgames.items() if k in p_hold for p in v]
    vmodel, vmean, vstd = train_value(vtr, vva, args.epochs_value, args.lr_value, device, args.hidden, pairs_tr, pairs_va)

    payload = {
        'kind': 'learned_duel_mlp',
        'version': 1,
        'tag': args.tag,
        'stateDim': STATE_DIM,
        'actDim': args.act_dim,
        'hidden': args.hidden,
        'depth': args.depth,
        'policyAll': args.policy_all,
        'policy': {
            'input': f'concat(state356, action{args.act_dim})',
            'layers': to_layer_json(pmodel),
            'scaler': {'mean': pmean.tolist(), 'std': pstd.tolist()},
            'valTop1': pacc,
        },
        'value': {
            'input': 'state356',
            'output': 'P(side-to-act alliance wins) via sigmoid',
            'layers': to_layer_json(vmodel),
            'scaler': {'mean': vmean.tolist(), 'std': vstd.tolist()},
        },
        'training': {
            'policyFiles': args.policy_in.split(','),
            'valueFiles': args.value_in.split(','),
            'epochsPolicy': args.epochs_policy,
            'epochsValue': args.epochs_value,
        },
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(payload, f)
    print(f'SAVED {args.out} policyValTop1={pacc:.4f}', flush=True)


if __name__ == '__main__':
    main()
