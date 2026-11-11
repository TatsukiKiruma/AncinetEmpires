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
OW = PB + H
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
    hidden = torch.relu(inputs @ weights[PW:PB].reshape(D, H) + weights[PB:OW])
    logits = hidden @ weights[OW:OB] + weights[OB]
    value = torch.tanh(ctx @ weights[VW:VW+K] + weights[VW+K])
    return logits, value


def best(values):
    result = 0
    for i in range(1, len(values)):
        if values[i] > values[result] + 1e-10:
            result = i
    return result


def prepare():
    encoding_count = 0
    with gzip.open(ROOT / 'witnesses.jsonl.gz', 'rt', encoding='utf-8') as f:
        witnesses = [json.loads(line) for line in f]
    with gzip.open(ROOT / 'encoded.jsonl.gz', 'rt', encoding='utf-8') as f:
        data = [json.loads(line) for line in f]
    with (ROOT / 'trial.bin').open('wb') as out, gzip.open(ROOT / 'reference.jsonl.gz', 'wt', encoding='utf-8') as refs:
        put_int = lambda v: out.write(struct.pack('>i', v))
        def sparse(row):
            put_int(len(row))
            for i, v in row:
                out.write(struct.pack('>if', i, v))
        for v in [0x53445631, F, C, H, len(initial)]:
            put_int(v)
        out.write(np.asarray(initial, dtype='>f8').tobytes())
        put_int(len(data))
        for row, witness in zip(data, witnesses, strict=True):
            packet = witness['packet']
            assert [encode_record(t, s['token']['keys']) for t in packet['tokens']] == row['tokens']
            assert [encode_record(c, s['candidate']['keys']) for c in packet['candidates']] == row['candidates']
            assert packet['codes'] == sorted(packet['codes']) and len(set(packet['codes'])) == len(packet['codes'])
            assert row['refs'] == packet['refs'] and row['groups'] == packet['groups']
            encoding_count += 1
            put_int(len(row['tokens']))
            for group, token in zip(row['groups'], row['tokens']):
                put_int(group); sparse(token)
            put_int(len(row['candidates']))
            for references, candidate in zip(row['refs'], row['candidates']):
                for v in references:
                    put_int(v)
                sparse(candidate)
            put_int(row['target']); out.write(struct.pack('>d', row['weight']))
            with torch.no_grad():
                logits, value = forward(row)
            z = logits.tolist()
            refs.write(json.dumps(dict(logits=z, value=value.item(), best=best(z)), separators=(',', ':')) + '\n')
            if encoding_count % 400 == 0:
                print(json.dumps(dict(referenceRows=encoding_count)), flush=True)
    x = data[0]
    logits, _ = forward(x)
    loss = torch.logsumexp(logits, 0) - logits[x['target']]
    loss = loss * x['weight']
    loss.backward()
    gradient = w.grad.detach().numpy()
    np.save(ROOT / 'reference-gradient.npy', gradient)
    selected = sorted(set(np.argsort(np.abs(gradient))[-20:].tolist() + np.linspace(0, len(initial)-1, 20, dtype=int).tolist()))
    errors = []
    for i in selected:
        wi = w.detach().clone()
        eps = 1e-6
        wi[i] += eps
        zp, _ = forward(x, wi)
        lp = (torch.logsumexp(zp, 0) - zp[x['target']]) * x['weight']
        wi[i] -= 2 * eps
        zm, _ = forward(x, wi)
        lm = (torch.logsumexp(zm, 0) - zm[x['target']]) * x['weight']
        errors.append(abs(((lp-lm)/(2*eps)).item() - gradient[i]))
    assert max(errors) < 1e-7
    assert np.all(gradient[VW:] == 0)
    report = dict(encodingRows=encoding_count, torchVersion=torch.__version__, float='float64 computation / float32 inputs', tolerance=1e-8, argmaxTieTolerance=1e-10, finiteDifferenceParameters=len(selected), finiteDifferenceMaxError=max(errors), loss=loss.item(), valueGradientZero=True, trialBinSha256=hashlib.sha256((ROOT/'trial.bin').read_bytes()).hexdigest())
    (ROOT/'reference-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    prepare()
