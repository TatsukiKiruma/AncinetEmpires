"""困难AI专项Policy/Value联合精调，按父局开发分数选择轮次，保留全部检查点。"""
import copy
import gzip
import hashlib
import io
import json
import random
import struct
import time
import sys
from pathlib import Path
import numpy as np
import torch
from torch.nn import functional as F
DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(DIR.parent / 'dual_stream_v2_phase5_20261020'))
from data import decode, collate, forward_batch, load_model
SETTINGS = json.loads((DIR / 'protocol.json').read_text('utf-8-sig'))['training']

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def frames(split):
    stream = io.BytesIO(gzip.decompress((DIR / 'corpus' / (split + '.frames.gz')).read_bytes()))
    samples = []
    while header := stream.read(8):
        ms, ps = struct.unpack('<II', header)
        samples.extend(decode(json.loads(stream.read(ms)), stream.read(ps)))
    return samples

def grouped(samples, batch_size, seed=0):
    groups = {}
    for s in samples:
        groups.setdefault(tuple(s['spatial'].shape), []).append(s)
    result = []
    for entries in groups.values():
        entries = entries.copy(); random.Random(seed).shuffle(entries)
        result.extend(entries[i:i+batch_size] for i in range(0, len(entries), batch_size))
    random.Random(seed).shuffle(result)
    return result

def adjusted(out, x, samples, bias):
    scores = out['logits'] + bias[x['ptr'][:,:,2]]
    priors = torch.zeros_like(scores)
    for i,s in enumerate(samples): priors[i,:len(s['pointers'])] = torch.tensor(s['source']['prior']).clamp(-40,120)
    return scores + priors

def metrics(model, samples, bias):
    ce = brier = hits = count = policy_count = 0.
    model.eval()
    with torch.no_grad():
        for rows in grouped(samples, SETTINGS['batchSize']):
            x = collate(rows); out = forward_batch(model, x); score = adjusted(out, x, rows, bias)
            valid = torch.tensor([s['source']['prior'][int(x['target'][i])] > -100000 for i,s in enumerate(rows)])
            ce += float((F.cross_entropy(score, x['target'], reduction='none')*valid).sum())
            policy_count += int(valid.sum())
            brier += float((out['valueProbs'] - x['valueTarget']).square().sum())
            hits += int(((score.argmax(-1) == x['target']) & valid).sum()); count += len(rows)
    return dict(count=count, policyCount=policy_count, ce=ce/max(1,policy_count), brier=brier/count, top1=hits/max(1,policy_count), objective=ce/max(1,policy_count)+SETTINGS['valueWeight']*brier/count)

def main():
    # 等待本轮运行时复核产物，确保训练和最终比较使用同一冻结实现。
    while not (DIR/'runtime-review-complete.json').exists(): time.sleep(1)
    torch.set_num_threads(4); torch.set_num_interop_threads(1)
    torch.manual_seed(SETTINGS['seed']); np.random.seed(SETTINGS['seed']); random.seed(SETTINGS['seed']); torch.use_deterministic_algorithms(True)
    output = DIR / 'gen_05'; output.mkdir(exist_ok=True)
    assert not (output / 'model.bin').exists(), '不能覆盖已有gen_05'
    files = list(DIR.glob('*.py')) + list(DIR.glob('*.ts')) + [DIR/'protocol.json', DIR/'corpus/manifest.json']
    files += list((ROOT_RUNTIME := DIR.parents[1]/'src/ai_runtime/dual_v2').glob('*.ts'))
    files += list((DIR.parent/'dual_stream_v2_phase2_20261020').glob('*.py')) + [DIR.parent/'dual_stream_v2_phase3_20261020/batch_model.py', DIR.parent/'dual_stream_v2_phase5_20261020/data.py', DIR.parent/'dual_stream_v2_phase1_20261020/tensor_bridge.ts']
    identity = [dict(path=str(f.relative_to(DIR.parents[1])),sha256=hashlib.sha256(f.read_bytes()).hexdigest()) for f in files]
    save(output/'source-identity.json',identity)
    warm_path = DIR.parent / 'dual_stream_v2_phase5_20261020/generations/gen_03/model'
    warm = load_model(str(warm_path)).eval(); reference = copy.deepcopy(warm).eval()
    for p in reference.parameters(): p.requires_grad_(False)
    train = frames('train'); dev = frames('dev'); assert train and dev
    bias = torch.tensor(json.loads((warm_path.parent / 'head-calibration.json').read_text('utf-8'))['headBias'])
    optimizer = torch.optim.AdamW(warm.parameters(), lr=SETTINGS['learningRate'], weight_decay=.0001)
    baseline = metrics(warm, dev, bias); records = []; best = None; updates = 0; grad_names = set()
    for epoch in range(SETTINGS['epochs']):
        warm.train(); total = 0.
        for rows in grouped(train, SETTINGS['batchSize'], SETTINGS['seed']+epoch):
            x = collate(rows); out = forward_batch(warm, x); score = adjusted(out, x, rows, bias)
            with torch.no_grad(): teacher = forward_batch(reference, x)
            ce = F.cross_entropy(score, x['target'], reduction='none')
            valid = torch.tensor([s['source']['prior'][int(x['target'][i])] > -100000 for i,s in enumerate(rows)])
            weights = x['quality'] * valid
            policy = (ce*weights).sum()/weights.sum().clamp_min(1)
            kl = F.kl_div(out['logits'].log_softmax(-1),teacher['logits'].softmax(-1),reduction='batchmean')
            value = -(x['valueTarget'] * out['valueLogits'].log_softmax(-1)).sum(-1).mean() + (out['valueProbs']-x['valueTarget']).square().mean()
            objective = policy + SETTINGS['policyKlWeight']*kl + SETTINGS['valueWeight']*value
            optimizer.zero_grad(set_to_none=True); objective.backward()
            grad_names.update(n for n,p in warm.named_parameters() if p.grad is not None and bool((p.grad != 0).any()))
            assert torch.isfinite(torch.nn.utils.clip_grad_norm_(warm.parameters(),1.))
            optimizer.step(); updates += 1; total += float(objective.detach())
            if updates % 100 == 0: print(json.dumps(dict(stage='train',epoch=epoch+1,updates=updates,loss=float(objective.detach()))),flush=True)
        stats = metrics(warm, dev, bias); record = dict(epoch=epoch+1,updates=updates,trainLoss=total/len(grouped(train,SETTINGS['batchSize'])),dev=stats)
        prefix = output / ('epoch_'+str(epoch+1)); warm.export(prefix)
        torch.save(dict(model=warm.state_dict(),optimizer=optimizer.state_dict(),epoch=epoch+1,updates=updates,seed=SETTINGS['seed']),prefix.with_suffix('.pt'))
        records.append(record); print(json.dumps(record),flush=True)
        if best is None or stats['objective'] < best['dev']['objective']: best = record.copy(); best['prefix'] = prefix.name
    for suffix in ['json','bin']:
        (output / ('model.'+suffix)).write_bytes((output / (best['prefix']+'.'+suffix)).read_bytes())
    (output / 'head-calibration.json').write_bytes((warm_path.parent / 'head-calibration.json').read_bytes())
    # 本轮价值头已联合训练，直接使用新价值输出，避免旧外置拟合覆盖学习结果。
    save(output / 'value-config.json',dict(buckets=[dict(temperature=1,army=0,income=0)]*9))
    save(output / 'training.json',dict(settings=SETTINGS,baseline=baseline,epochs=records,selected=best,trainSamples=len(train),devSamples=len(dev),updates=updates,nonzeroGradientTensors=sorted(grad_names),sourceIdentity=identity,modelSha256=hashlib.sha256((output/'model.bin').read_bytes()).hexdigest(),data=json.loads((DIR/'corpus/manifest.json').read_text('utf-8')),note='已消费困难AI开发数据，不称独立测试。'))
    model = load_model(str(output/'model')).eval().accurate_reductions()
    stream = io.BytesIO(gzip.decompress((DIR/'corpus/dev.frames.gz').read_bytes())); parity = []
    for _ in range(24):
        header = stream.read(8)
        if not header: break
        ms,ps = struct.unpack('<II',header); meta = json.loads(stream.read(ms)); raw = stream.read(ps); sample = decode(meta,raw)[0]
        with torch.no_grad(): out = model(sample)
        parity.append({k:out[k].tolist() for k in ['logits','actorPrior','valueLogits','valueProbs']})
    save(output/'python-parity-output.json',parity)
    print(json.dumps(dict(completed=True,selected=best['epoch'],updates=updates,parity=len(parity))),flush=True)

if __name__ == '__main__': main()
