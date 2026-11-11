"""按固定配额训练两个候选；检查点包含优化器和随机状态。"""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import random
import sys
import time

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage7_20261108_v1')
os.environ['MIOPEN_USER_DB_PATH'] = str(DATA / 'miopen-fp32-db')
os.environ['MIOPEN_CUSTOM_CACHE_DIR'] = str(DATA / 'cache')
from fp32_forward import forward, torch
from common import load_model, move
from ragged_batch import collate
from policy_training import POLICY
from train_data import Dataset
from train_metrics import brier_ce, metrics, subset

VALUE = {'value1', 'value_norm', 'value2', 'army_scale'}
TOP = {'entity_proj', 'entity_norm', 'global_proj', 'global_norm'}
H1 = 'D:/AncientEmpiresData/continuation_stage5_20261104_v1/heads-v1/H1/final'
H1_SHA = '3bedc848d9adccc2df67ffb22950d7a020ca4d3106c174e9974a17fc7647eccf'
UPDATES = 4000


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def dump(file, value):
    tmp = file.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    tmp.replace(file)


def torch_save(file, value):
    tmp = file.with_suffix('.tmp')
    torch.save(value, tmp)
    tmp.replace(file)


def optimizer_for(model, kind):
    head, trunk = [], []
    for name, parameter in model.named_parameters():
        prefix = name.split('.')[0]
        if kind == 'K1':
            parameter.requires_grad_(prefix in VALUE | TOP)
            if parameter.requires_grad:
                head.append(parameter)
        elif prefix in VALUE | POLICY:
            head.append(parameter)
        else:
            trunk.append(parameter)
    if not head or kind == 'K2' and not trunk:
        raise ValueError('候选训练参数分组为空')
    groups = [{'params': head, 'lr': 3e-5}]
    if trunk:
        groups.append({'params': trunk, 'lr': 3e-6})
    return torch.optim.AdamW(groups)


def train(generation, kind, deadline):
    torch.set_num_threads(2)
    assert kind in ('K1', 'K2') and generation in (1, 2)
    assert json.loads((HERE / 'STAGE7_BASELINE_DEV54.json').read_text(encoding='utf-8'))['passed']
    assert digest(H1 + '.bin') == H1_SHA
    root = DATA / 'league' / f'gen{generation}'
    folder = root / kind
    folder.mkdir(exist_ok=True)
    ready = folder / 'TRAIN.json'
    manifest = json.loads((root / 'DATASET.json').read_text(encoding='utf-8'))
    assert manifest['generation'] == generation and manifest['sealedAccess'] == 0
    source = {str(p.relative_to(HERE)): digest(p) for p in (HERE / name for name in
              ('train_candidate.py', 'train_data.py', 'train_metrics.py', 'fp32_forward.py'))}
    identity = hashlib.sha256(json.dumps([manifest['identity'], source, H1_SHA, kind, UPDATES], sort_keys=True).encode()).hexdigest()
    if ready.exists():
        result = json.loads(ready.read_text(encoding='utf-8'))
        assert result['identity'] == identity and digest(folder / 'final.bin') == result['sha256']
        return result
    dataset = Dataset(manifest['pathDb'], manifest['identity'])
    dev = dataset.dev()
    rng = random.Random(2026110800 + generation)
    model = load_model(H1).accurate_reductions(False).cuda().eval()
    base = load_model(H1).accurate_reductions(False).cuda().eval()
    for p in base.parameters():
        p.requires_grad_(False)
    optimizer = optimizer_for(model, kind)
    statefile = folder / 'TRAIN_CHECKPOINT.pt'
    if statefile.exists():
        ckpt = torch.load(statefile, weights_only=False, map_location='cpu')
        assert ckpt['identity'] == identity
        model.load_state_dict(ckpt['model']); optimizer.load_state_dict(ckpt['optimizer'])
        rng.setstate(ckpt['rng']); start = ckpt['updates']
    else:
        start = 0
    def checkpoint(update):
        torch_save(statefile, dict(identity=identity, model=model.state_dict(), optimizer=optimizer.state_dict(), rng=rng.getstate(), updates=update))
        dump(folder / 'PROGRESS.json', dict(generation=generation, candidate=kind, updates=update, target=UPDATES, sealedAccess=0))

    for update in range(start, UPDATES):
        if time.time() * 1000 >= deadline or (HERE / 'STOP').exists():
            checkpoint(update)
            return {'complete': False, 'updates': update, 'wallLimit': time.time() * 1000 >= deadline, 'sealedAccess': 0}
        rows = dataset.sample(rng)
        x = move(collate(rows), 'cuda')
        optimizer.zero_grad(set_to_none=True)
        out = forward(model, x)
        brier, ce = brier_ce(out, x)
        vw = x['valueMask'].float()
        value = ((brier + ce) * vw).sum() / vw.sum().clamp_min(1)
        tkl = torch.stack([subset(out['logits'][i], r) for i, r in enumerate(rows) if r['source']['teacherValid']]).mean()
        loss = value + (0.1 if kind == 'K1' else 1.) * tkl
        if kind == 'K2':
            indices = [i for i, r in enumerate(rows) if r['source']['category'] in ('stage5', 'stage6')]
            assert len(indices) == 12
            historical = [rows[i] for i in indices]
            with torch.no_grad():
                ref = forward(base, move(collate(historical), 'cuda'))['logits']
            divergence = []
            for j, i in enumerate(indices):
                n = len(rows[i]['pointers'])
                if n:
                    p = ref[j, :n].log_softmax(-1)
                    q = out['logits'][i, :n].log_softmax(-1)
                    divergence.append((p.exp() * (p - q)).sum())
            if not divergence:
                raise ValueError('回放缺少 C1 锚定候选')
            loss = loss + .1 * torch.stack(divergence).mean()
        if not torch.isfinite(loss).item():
            raise ValueError('训练损失含非有限数')
        loss.backward()
        torch.nn.utils.clip_grad_norm_((p for p in model.parameters() if p.requires_grad), 1., error_if_nonfinite=True)
        optimizer.step()
        if (update + 1) % 100 == 0 or update + 1 == UPDATES:
            checkpoint(update + 1)
            print(json.dumps(dict(generation=generation, candidate=kind, updates=update + 1, loss=float(loss.detach())), ensure_ascii=False), flush=True)

    before, after = metrics(base, dev), metrics(model, dev)
    passed = after['brier'] <= before['brier'] + .003 and after['ece'] <= before['ece'] + .003 and after['subsetKL'] < before['subsetKL']
    model.export(folder / 'final')
    result = dict(complete=True, offlinePassed=passed, baseline=before, candidate=after, generation=generation, kind=kind,
                  identity=identity, updates=UPDATES, prefix=str(folder / 'final'), sha256=digest(folder / 'final.bin'),
                  seed=2026110800 + generation, replayFraction=.4, learningRate=3e-5, trunkLearningRate=3e-6 if kind == 'K2' else None, sealedAccess=0)
    dump(ready, result)
    return result


if __name__ == '__main__':
    kernel = ctypes.windll.kernel32
    if not kernel.SetThreadExecutionState(0x80000001):
        raise RuntimeError('训练防休眠锁获取失败')
    try:
        result = train(int(sys.argv[1]), sys.argv[2], int(sys.argv[3]))
        print(json.dumps(result, ensure_ascii=False), flush=True)
    finally:
        kernel.SetThreadExecutionState(0x80000000)
