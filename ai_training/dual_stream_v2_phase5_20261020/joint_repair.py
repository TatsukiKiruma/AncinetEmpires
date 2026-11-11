"""第三次同代训练，所有优化样本来自原训练池，检查点严格绑定完整身份。"""
import gzip
import hashlib
import json
import math
import os
import random
import shutil
import time
from pathlib import Path
import numpy as np
import torch
from data import DIR, ROOT, batches, collate, forward_batch, load_model
from phase52_io import save
from prior_distillation import freeze_policy_only, assert_frozen_equal
from joint_policy_loss import joint_loss


def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def interleave(streams, estimates):
    used = {key: 0 for key in streams}; live = set(streams)
    try:
        while live:
            key = min(live, key=lambda k: (used[k] / estimates[k], k))
            try: samples = next(streams[key])
            except StopIteration:
                live.remove(key); continue
            used[key] += len(samples)
            yield key, samples
    finally:
        for stream in streams.values(): stream.close()


def main():
    torch.set_num_threads(4); torch.set_num_interop_threads(1); torch.use_deterministic_algorithms(True)
    random.seed(20261021); np.random.seed(20261021); torch.manual_seed(20261021)
    folder = DIR / 'generations/gen_03'; previous = folder / 'training-attempt02-wait-linear'
    protocol = json.loads((folder / 'joint-repair-protocol.json').read_text('utf-8'))
    assert protocol['generation'] == 3 and protocol['stopAfterGeneration'] == 3
    assert sha(DIR / (protocol['warmModel'] + '.bin')) == protocol['warmSha256']
    original = json.loads((previous / 'training-input-identity.json').read_text('utf-8'))
    assert all(sha(DIR / name) == digest for name, digest in original['dataIdentity'].items())
    selected = previous / 'wait-constraint-training-ids.json.gz'
    constraints = [r for r in json.loads(gzip.decompress(selected.read_bytes())) if r['constraint']]
    assert len(constraints) == 119
    source_paths = [DIR / name for name in ['joint_repair.py', 'joint_policy_loss.py', 'prior_distillation.py', 'phase52_io.py', 'data.py', 'stream.ts', 'league_stream.ts', 'mixed_stream.py']]
    source_paths += [DIR.parent / 'dual_stream_v2_phase3_20261020/batch_model.py']
    sources = {p.relative_to(ROOT).as_posix(): sha(p) for p in source_paths}
    fingerprint = dict(protocolSha256=sha(folder / 'joint-repair-protocol.json'), warmSha256=protocol['warmSha256'], selectedIdsSha256=sha(selected), sourceIdentity=sources, dataIdentity=original['dataIdentity'])
    for p in source_paths:
        dest = folder / 'joint-source-snapshot' / p.relative_to(ROOT); dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists(): assert sha(dest) == sources[p.relative_to(ROOT).as_posix()]
        else: shutil.copyfile(p, dest)
    os.environ['LEAGUE_GENERATION'] = '3'
    os.environ['LEAGUE_MODEL'] = str(DIR / protocol['warmModel']); model = load_model('model').eval()
    os.environ['LEAGUE_MODEL'] = str(DIR / protocol['championModel']); teacher = load_model('model').eval()
    for parameter in teacher.parameters(): parameter.requires_grad_(False)
    trainable = freeze_policy_only(model); assert_frozen_equal(model, teacher)
    optimizer = torch.optim.AdamW(trainable, lr=protocol['lr'], weight_decay=protocol['weightDecay'])
    bias = torch.tensor(json.loads((DIR / 'generations/gen_00/head-calibration.json').read_text('utf-8'))['headBias'], dtype=torch.float64)
    cursor = dict(epoch=0, batch=0, updates=0, samples=0, baseSamples=0, expertSamples=0, constraintSamples=0)
    checkpoint = folder / 'joint-checkpoint.pt'; started = time.perf_counter()
    if checkpoint.exists():
        ck = torch.load(checkpoint, weights_only=False); assert ck['identity'] == fingerprint
        model.load_state_dict(ck['model']); optimizer.load_state_dict(ck['optimizer']); cursor = ck['cursor']
        torch.set_rng_state(ck['torchRng']); np.random.set_state(ck['numpyRng']); random.setstate(ck['pythonRng'])
    def persist():
        temporary = checkpoint.with_suffix('.pt.tmp')
        torch.save(dict(model=model.state_dict(), optimizer=optimizer.state_dict(), cursor=cursor.copy(), identity=fingerprint, torchRng=torch.get_rng_state(), numpyRng=np.random.get_state(), pythonRng=random.getstate()), temporary); temporary.replace(checkpoint)
        save(folder / 'joint-training-progress.json', cursor)
    def constraint_stream(epoch):
        for _ in range(protocol['constraintRepeats']):
            yield from batches('train', epoch, env=dict(LEAGUE_SELECTED_IDS=str(selected), LEAGUE_CONSTRAINT_ONLY='1'))
    estimates = dict(base=19127, expert=8520, constraint=len(constraints) * protocol['constraintRepeats'])
    total = protocol['epochs'] * sum(estimates.values())
    for epoch in range(cursor['epoch'], protocol['epochs']):
        first = cursor['batch']
        streams = dict(base=batches('train', epoch, env=dict(LEAGUE_BASE_RATE=str(protocol['baseRate']))), expert=batches('train', epoch, stream='dual_stream_v2_phase5_20261020/league_stream.ts'), constraint=constraint_stream(epoch))
        for index, (kind, samples) in enumerate(interleave(streams, estimates)):
            if index < first: continue
            x = collate(samples); out = forward_batch(model, x)
            with torch.no_grad(): reference = forward_batch(teacher, x)
            assert torch.equal(out['valueLogits'], reference['valueLogits'])
            loss = joint_loss(kind, out, reference, x, samples, bias)
            fraction = min(1., cursor['samples'] / total)
            lr = protocol['minLr'] + (protocol['lr'] - protocol['minLr']) * .5 * (1 + math.cos(math.pi * fraction))
            optimizer.param_groups[0]['lr'] = lr
            optimizer.zero_grad(set_to_none=True); loss.backward(); norm = torch.nn.utils.clip_grad_norm_(trainable, protocol['gradientClip'])
            assert torch.isfinite(norm); optimizer.step(); assert_frozen_equal(model, teacher)
            cursor.update(epoch=epoch, batch=index + 1, updates=cursor['updates'] + 1, samples=cursor['samples'] + len(samples))
            cursor[kind + 'Samples'] += len(samples)
            if cursor['updates'] % 50 == 0:
                persist(); print(json.dumps(dict(**cursor, source=kind, loss=float(loss.detach()), lr=lr, maxValueLogitsDifference=0., seconds=round(time.perf_counter()-started, 1))), flush=True)
        cursor.update(epoch=epoch + 1, batch=0); persist()
    assert all(cursor[k + 'Samples'] == v * protocol['epochs'] for k, v in estimates.items())
    model.export(folder / 'model')
    result = dict(completed=True, **cursor, modelSha256=sha(folder / 'model.bin'), identity=fingerprint, protocol=protocol, maxValueLogitsDifference=0., frozenParametersByteEqual=True, devUsedForOptimization=False, battleUsedForOptimization=False, seconds=time.perf_counter()-started)
    save(folder / 'joint-training-complete.json', result)
    identity = original.copy()
    identity['auxiliaryWaitConstraint'] = {**original['auxiliaryWaitConstraint'], 'selectedIdsPath': str(selected.relative_to(DIR)).replace('\\', '/')}
    identity['jointPolicyRepair'] = result
    save(folder / 'training-input-identity.json', identity)
    old = json.loads((previous / 'training-complete.json').read_text('utf-8'))
    old.update(modelSha256=result['modelSha256'], updates=old['updates'] + cursor['updates'], jointPolicyRepair=result, lastLearningRate=lr)
    save(folder / 'training-complete.json', old)
    # 分阶段来源保留原件，单行审计只证明第二阶段，不能用于约束本阶段所有策略头。
    shutil.copytree(previous / 'training-source-snapshot', folder / 'training-source-snapshot', dirs_exist_ok=True)
    shutil.copyfile(previous / 'training-source-snapshot.json', folder / 'training-source-snapshot.json')
    shutil.copyfile(previous / 'wait-row-byte-audit.json', folder / 'wait-row-byte-audit.json')
    print(json.dumps(dict(completed=True, **cursor, modelSha256=result['modelSha256'])), flush=True)


if __name__ == '__main__': main()
