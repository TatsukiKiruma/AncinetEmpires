import gzip, json, math, re, struct, pathlib, hashlib
import numpy as np
import torch

ROOT = pathlib.Path(__file__).parent
torch.set_num_threads(1)
torch.set_num_interop_threads(1)
s = json.loads((ROOT / 'schema.json').read_text(encoding='utf-8-sig'))
initial = json.loads((ROOT / 'initial.json').read_text(encoding='utf-8-sig'))
F, C, H = len(s['token']['keys']), len(s['candidate']['keys']), s['hidden']
K, D = 4 * H + 4, 7 * H + 4 + C
EB = F * H
PW, PB = EB + H, EB + H + D * H
W2 = PB + H
B2 = W2 + H * H
W3 = B2 + H
B3 = W3 + H * H
OW = B3 + H
OB, VW = OW + H, OW + H + 1
w = torch.tensor(initial, dtype=torch.float64, requires_grad=True)


def encode_record(record, keys):
    # 独立展开字段、类别、空值和存在位，未使用TS导出的稀疏值作为参照。
    values = {}
    for key in sorted(record):
        v = record[key]
        values[key + ':present'] = 1.0
        if v is None:
            values[key + ':null'] = 1.0
        elif isinstance(v, bool):
            values[key + '=' + str(v).lower()] = 1.0
        elif isinstance(v, (int, float)):
            divisor = 1024 if re.search('gold|income|Cost|prices|exp', key, re.I) else 32 if re.search(r'(?:^|\.)[xy]$|width|height', key) else 128
            values[key + ':number'] = float(np.float32(v / divisor))
        else:
            values[key + '=' + v] = 1.0
    index = {key: i for i, key in enumerate(keys)}
    return sorted([[index[key], value] for key, value in values.items()])


def tensors(x):
    a = np.zeros((len(x['tokens']), F), dtype=np.float64)
    b = np.zeros((len(x['candidates']), C), dtype=np.float64)
    for r, row in enumerate(x['tokens']):
        for i, v in row:
            a[r, i] = v
    for r, row in enumerate(x['candidates']):
        for i, v in row:
            b[r, i] = v
    return torch.from_numpy(a), torch.from_numpy(b)


def forward(x, weights=w):
    a, b = tensors(x)
    e = torch.relu(a @ weights[:EB].reshape(F, H) + weights[EB:PW])
    pieces, counts = [], []
    for g in range(4):
        indices = [i for i, group in enumerate(x['groups']) if group == g]
        counts.append(len(indices) / 1024)
        pieces.append(e[indices].mean(0) if indices else torch.zeros(H, dtype=torch.float64))
    ctx = torch.cat(pieces + [torch.tensor(counts, dtype=torch.float64)])
    gathered = torch.stack([torch.cat([e[i] if i >= 0 else torch.zeros(H, dtype=torch.float64) for i in refs]) for refs in x['refs']])
    inputs = torch.cat([ctx.expand(len(b), K), gathered, b], 1)
    hidden = torch.relu(inputs @ weights[PW:PB].reshape(D, H) + weights[PB:W2])
    hidden = torch.relu(hidden @ weights[W2:B2].reshape(H, H) + weights[B2:W3])
    hidden = torch.relu(hidden @ weights[W3:B3].reshape(H, H) + weights[B3:OW])
    logits = hidden @ weights[OW:OB] + weights[OB]
    value = torch.tanh(ctx @ weights[VW:VW+K] + weights[VW+K])
    return logits, value


def best(values):
    result = 0
    for i in range(1, len(values)):
        if values[i] > values[result] + 1e-10:
            result = i
    return result


