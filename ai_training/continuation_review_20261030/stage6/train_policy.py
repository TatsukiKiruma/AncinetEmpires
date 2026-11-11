"""冻结Stage3主干与H1价值头，按固定D1/D2协议完成策略蒸馏。"""
import base64
import gzip
import io
import json
import math
import os
from pathlib import Path
import random
import sys

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage6_20261106_v1')
OLD = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')
os.environ['MIOPEN_USER_DB_PATH'] = str(DATA / 'miopen-db')
os.environ['MIOPEN_CUSTOM_CACHE_DIR'] = str(DATA / 'miopen-cache')
sys.path.insert(0, str(HERE.parents[1] / 'gpu'))
sys.path.insert(0, str(HERE.parent / 'stage3'))
import torch
from common import load_model, move, sha
from data import decode
from accurate_batch import collate, forward_batch
from policy_training import POLICY, freeze, frozen_digest, subset_kl, anchor_loss, verify_gradients
from write_budget import reserve

PREFIX = OLD / 'heads-v1/H1/final'
CHECKPOINT = Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1/best/checkpoint.pt')

def save(file, value, binary=False):
    if binary:
        stream = io.BytesIO(); torch.save(value, stream); payload = stream.getvalue()
    else:
        payload = json.dumps(value, ensure_ascii=False, indent=2).encode('utf-8')
    reserve(len(payload)); file.parent.mkdir(parents=True, exist_ok=True)
    with file.open('xb') as stream:
        stream.write(payload)

def read(file):
    return json.loads(Path(file).read_text(encoding='utf-8-sig'))

def encoded(file):
    content = json.loads(gzip.decompress(Path(file).read_bytes()))
    return decode(content['metadata'], base64.b64decode(content['bytes'])), content

def anchors(split):
    manifest = read(HERE / f'ANCHOR_LABELS_{split}.json')
    result = []
    for entry in manifest['labels']:
        if sha(entry['file']) != entry['sha256']:
            raise ValueError('锚点缓存摘要变化')
        rows, _ = encoded(entry['file'])
        for row, label in zip(rows, entry['targets']):
            if row['source']['split'] != split:
                raise ValueError('锚点跨分区')
            row['policyTarget'] = torch.tensor([label['target']])
            row['policyMask'] = torch.tensor([True])
            result.append(row)
    if len(result) != manifest['samples'] or split == 'train' and len(result) != 10800:
        raise ValueError('锚点样本数不符')
    return result

def distillation():
    manifest = read(HERE / 'DISTILL_DATA_MANIFEST.json')
    if not manifest['complete'] or len(manifest['receipts']) != 3240:
        raise ValueError('教师采集未完成')
    result = {'train': [], 'dev': []}
    for receipt in manifest['receipts']:
        if sha(receipt['file']) != receipt['sha256']:
            raise ValueError('教师产物摘要变化')
        rows, data = encoded(receipt['file'])
        row, teacher = rows[0], data['teacher']
        mask = torch.tensor([v and not teacher['vetoMask'][i] for i, v in enumerate(teacher['evaluatedMask'])])
        valid = teacher['available'] and int(mask.sum()) >= 2
        if valid != receipt['valid']:
            raise ValueError('有效教师标签判定不符')
        if not valid:
            continue
        order = row['sourceIndices'].long()
        row['teacherMask'] = mask[order]
        row['teacherProb'] = torch.tensor(teacher['probabilities'])[order]
        result[row['source']['split']].append(row)
    for split, rows in result.items():
        if any(not any(r['source']['players'] == n for r in rows) for n in (2, 3, 4)):
            raise ValueError('有效教师缺少人数层：' + split)
    return result, manifest

def initialized():
    model = load_model().accurate_reductions(True)
    model.load_state_dict(torch.load(CHECKPOINT, map_location='cpu', weights_only=False)['model'])
    model.load_state_dict(torch.load(OLD / 'heads-v1/H1/value-6000.pt', map_location='cpu', weights_only=False)['value'], strict=False)
    reference = load_model(PREFIX)
    if any(not torch.equal(value, reference.state_dict()[name]) for name, value in model.state_dict().items()):
        raise ValueError('Stage3主干加H1价值头与锁定二进制不一致')
    if sum(p.numel() for p in model.parameters()) != 1966910:
        raise ValueError('完整模型参数数量不符')
    freeze(model)
    return model.cuda()

def batch(rows):
    return move(collate(rows), 'cuda')

def evaluate(model, teacher, dev):
    losses, hits, nlls = [], [], []
    with torch.no_grad():
        for start in range(0, len(teacher), 8):
            rows = teacher[start:start+8]
            logits = forward_batch(model, batch(rows))['logits']
            for i, row in enumerate(rows):
                mask = row['teacherMask'].cuda()
                predicted = logits[i, :len(mask)][mask]
                target = row['teacherProb'].cuda()[mask]; target /= target.sum()
                losses.append(float((target * (target.clamp_min(1e-30).log() - predicted.log_softmax(-1))).sum()))
                hits.append(float(predicted.argmax() == target.argmax()))
        for start in range(0, len(dev), 8):
            rows = dev[start:start+8]; x = batch(rows)
            logits = forward_batch(model, x)['logits']
            nlls.extend((-logits.log_softmax(-1)[torch.arange(len(rows), device='cuda'), x['target']]).cpu().tolist())
    return {'subsetKL': sum(losses)/len(losses), 'teacherTop1': sum(hits)/len(hits), 'stage1DevNll': sum(nlls)/len(nlls), 'teacherSamples': len(losses), 'stage1DevSamples': len(nlls)}

def isolation(anchor):
    model = initialized(); params = freeze(model)
    optimizer = torch.optim.AdamW(params, lr=3e-5)
    rows = []
    for i in range(64):
        pool = [r for r in anchor if r['source']['players'] == 2 + i % 3]
        rows.append(pool[i // 3])
    identity = frozen_digest(model)
    outputs = []
    for start in range(0, 64, 8):
        with torch.no_grad():
            out = forward_batch(model, batch(rows[start:start+8]))
        outputs.append({k: out[k].clone() for k in ('valueProbs', 'valueLogits')})
    x = batch(rows[:8]); optimizer.zero_grad(set_to_none=True)
    logits = forward_batch(model, x)['logits']
    torch.nn.functional.cross_entropy(logits, x['target']).backward()
    verify_gradients(model); optimizer.step()
    maximum = {key: 0. for key in ('valueProbs', 'valueLogits')}
    with torch.no_grad():
        for i, start in enumerate(range(0, 64, 8)):
            out = forward_batch(model, batch(rows[start:start+8]))
            for key in maximum:
                maximum[key] = max(maximum[key], float((out[key] - outputs[i][key]).abs().max()))
    if frozen_digest(model) != identity or any(maximum.values()):
        raise ValueError('策略隔离检查失败')
    save(HERE / 'POLICY_HEAD_ISOLATION_CHECK.json', {'passed': True, 'samples': 64, 'maxAbs': maximum, 'frozenSha256': identity, 'nonPolicyGradientsZero': True, 'trainableParameters': sum(p.numel() for p in params), 'policyModules': sorted(POLICY), 'sealedAccess': 0})
    return rows

def main():
    torch.set_num_threads(2); random.seed(20261106); torch.manual_seed(20261106)
    if not read(HERE / 'DISTILL_BOUNDARY_AUDIT.json')['passed']:
        raise ValueError('蒸馏分区隔离审计未通过')
    for entry in read(HERE / 'PREFLIGHT_CORRECTED.json')['checks'].values():
        if 'path' in entry and sha(entry['path']) != entry['actual']:
            raise ValueError('训练前模型身份发生变化')
    teacher, manifest = distillation()
    anchor, dev = anchors('train'), anchors('dev')
    probe_rows = isolation(anchor)
    base = initialized()
    for p in base.parameters(): p.requires_grad_(False)
    baseline = evaluate(base, teacher['dev'], dev)
    save(HERE / 'TRAINING_PLAN.json', {'updates': 4000, 'batch': {'distill': 8, 'anchor': 8}, 'warmup': 200, 'seed': 20261106, 'baseline': baseline, 'selection': 'subsetKL/初始KL + stage1DevNll/初始NLL + 1-teacherTop1，最小者晋级，同分保留较早检查点', 'teacherManifestSha256': sha(HERE / 'DISTILL_DATA_MANIFEST.json'), 'sealedAccess': 0})
    reports, parity = {}, {}
    for name, peak, alpha, beta in [('D1', 3e-5, .50, .20), ('D2', 5e-5, .35, .10)]:
        model = initialized(); params = freeze(model); identity = frozen_digest(model)
        optimizer = torch.optim.AdamW(params, lr=peak)
        folder = DATA / name; folder.mkdir(exist_ok=False)
        rng = random.Random(20261106); best, best_state, curve = None, None, []
        for update in range(1, 4001):
            chosen = rng.choices(teacher['train'], k=8); anch = rng.choices(anchor, k=8)
            x, a = batch(chosen), batch(anch)
            rate = peak * (update / 200 if update <= 200 else .5 * (1 + math.cos(math.pi * (update-200)/3800)))
            optimizer.param_groups[0]['lr'] = rate
            optimizer.zero_grad(set_to_none=True)
            sub = subset_kl(forward_batch(model, x)['logits'], chosen)
            current = forward_batch(model, a)['logits']
            with torch.no_grad(): initial = forward_batch(base, a)['logits']
            ce, trust = anchor_loss(current, initial, a['target'])
            loss = (1-alpha)*sub + alpha*ce + beta*trust
            if not torch.isfinite(loss): raise ValueError('蒸馏损失非有限')
            loss.backward(); verify_gradients(model)
            torch.nn.utils.clip_grad_norm_(params, 1., error_if_nonfinite=True); optimizer.step()
            if update % 250 == 0:
                if frozen_digest(model) != identity: raise ValueError('冻结参数变化')
                metrics = evaluate(model, teacher['dev'], dev)
                score = metrics['subsetKL']/max(baseline['subsetKL'], 1e-9) + metrics['stage1DevNll']/max(baseline['stage1DevNll'], 1e-9) + 1-metrics['teacherTop1']
                record = {'update': update, 'lr': rate, 'loss': float(loss.detach()), 'score': score, **metrics}
                curve.append(record)
                state = {k: v.detach().cpu().clone() for k,v in model.state_dict().items() if k.split('.')[0] in POLICY}
                save(folder / f'policy-{update:04d}.pt', {'policy': state, 'record': record, 'frozenSha256': identity, 'optimizer': optimizer.state_dict()}, True)
                if best is None or score < best['score']: best, best_state = record, state
                print(json.dumps({'candidate': name, **record}), flush=True)
        model.load_state_dict(best_state, strict=False)
        reserve(9_000_000); model.export(folder / 'final')
        exported = load_model(folder / 'final').accurate_reductions(True).cuda().eval()
        maximum = 0.
        with torch.no_grad():
            for start in range(0,64,8):
                x = batch(probe_rows[start:start+8])
                maximum = max(maximum, float((forward_batch(base,x)['valueProbs'] - forward_batch(exported,x)['valueProbs']).abs().max()))
        if maximum != 0.: raise ValueError('导出价值发生漂移')
        parity[name] = {'maxAbs': maximum, 'samples': 64, 'binSha256': sha(folder/'final.bin')}
        reports[name] = {'best': best, 'curve': curve, 'updates': 4000, 'alpha': alpha, 'beta': beta, 'peakLr': peak, 'frozenSha256': identity}
        save(folder/'REPORT.json', reports[name])
    save(HERE/'EXPORTED_VALUE_PARITY.json', {'passed': True, 'baselineSha256': sha(PREFIX.with_suffix('.bin')), 'candidates': parity})
    save(HERE/'OFFLINE_DISTILLATION_REPORT.json', {'complete': True, 'baseline': baseline, 'candidates': reports, 'validTrain': len(teacher['train']), 'validDev': len(teacher['dev']), 'sealedAccess': 0})

if __name__ == '__main__':
    main()
