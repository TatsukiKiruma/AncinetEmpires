"""固定表征的联合语义拟合；检查点、原始来源与内存缓存摘要完整绑定。"""
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
from data import DIR, ROOT, load_model
from phase52_io import save
from prior_distillation import freeze_policy_only, assert_frozen_equal
from semantic_cache import collect
from semantic_joint_loss import adjusted_scores, loss


def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    torch.set_num_threads(4); torch.set_num_interop_threads(1); torch.use_deterministic_algorithms(True)
    random.seed(20261021); np.random.seed(20261021); torch.manual_seed(20261021)
    folder = DIR / 'generations/gen_03'; original_folder = folder / 'training-attempt01-prior-aware'
    protocol = json.loads((folder / 'semantic-repair-protocol.json').read_text('utf-8'))
    assert protocol['generation'] == protocol['stopAfterGeneration'] == 3 and sha(DIR / (protocol['warmModel'] + '.bin')) == protocol['warmSha256']
    identity = json.loads((original_folder / 'training-input-identity.json').read_text('utf-8'))
    assert all(sha(DIR / name) == digest for name, digest in identity['dataIdentity'].items())
    sources = [DIR / n for n in ['semantic_repair.py', 'semantic_cache.py', 'semantic_joint_loss.py', 'prior_distillation.py', 'phase52_io.py', 'data.py', 'stream.ts', 'league_stream.ts']]
    sources += list((DIR.parent / 'dual_stream_v2_phase2_20261020').glob('*.py'))
    sources += [DIR.parent / 'dual_stream_v2_phase3_20261020/batch_model.py']
    fingerprint = dict(protocolSha256=sha(folder / 'semantic-repair-protocol.json'), sourceIdentity={p.relative_to(ROOT).as_posix(): sha(p) for p in sources}, dataIdentity=identity['dataIdentity'], warmSha256=protocol['warmSha256'], constraintIdsSha256=sha(folder / 'semantic-constraint-training-ids.json.gz'))
    for p in sources:
        dest = folder / 'semantic-source-snapshot' / p.relative_to(ROOT); dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists(): assert sha(dest) == sha(p)
        else: shutil.copyfile(p, dest)
    os.environ['LEAGUE_GENERATION'] = '3'
    os.environ['LEAGUE_MODEL'] = str(DIR / protocol['warmModel']); model = load_model('model').eval()
    os.environ['LEAGUE_MODEL'] = str(DIR / protocol['championModel']); champion = load_model('model').eval()
    for p in [*model.parameters(), *champion.parameters()]: p.requires_grad_(False)
    bias = torch.tensor(json.loads((DIR / 'generations/gen_00/head-calibration.json').read_text('utf-8'))['headBias'], dtype=torch.float64)
    cache, receipt = collect(model, champion, bias, protocol, folder / 'semantic-constraint-training-ids.json.gz')
    save(folder / 'semantic-cache-receipt.json', receipt); fingerprint['cacheSha256'] = receipt['samplesSha256']
    weight = torch.zeros(15, 128, requires_grad=True); offset = torch.zeros(15, requires_grad=True)
    optimizer = torch.optim.AdamW([weight, offset], lr=protocol['lr'], weight_decay=protocol['weightDecay'])
    cursor = dict(epoch=0, batch=0, updates=0, samples=0, baseSamples=0, expertSamples=0, constraintSamples=0)
    checkpoint = folder / 'semantic-checkpoint.pt'; started = time.perf_counter()
    if checkpoint.exists():
        ck = torch.load(checkpoint, weights_only=False); assert ck['identity'] == fingerprint
        with torch.no_grad(): weight.copy_(ck['weight']); offset.copy_(ck['offset'])
        optimizer.load_state_dict(ck['optimizer']); cursor = ck['cursor']
    def persist():
        temporary = checkpoint.with_suffix('.pt.tmp'); torch.save(dict(weight=weight.detach(), offset=offset.detach(), optimizer=optimizer.state_dict(), cursor=cursor.copy(), identity=fingerprint), temporary); temporary.replace(checkpoint)
        save(folder / 'semantic-training-progress.json', cursor)
    entries = [(kind, i) for kind, values in cache.items() for _ in range(protocol['constraintRepeats'] if kind == 'constraint' else 1) for i in range(len(values))]
    total = protocol['epochs'] * len(entries)
    for epoch in range(cursor['epoch'], protocol['epochs']):
        sequence = entries.copy(); random.Random(20261021 + epoch).shuffle(sequence); first = cursor['batch']
        for index, (kind, i) in enumerate(sequence):
            if index < first: continue
            c = cache[kind][i]; score = adjusted_scores(c, weight, offset)
            objective = loss(kind, score, c, protocol) + protocol['deltaL2'] * (weight.square().sum() + offset.square().sum())
            fraction = cursor['updates'] / max(1, total-1); lr = protocol['minLr'] + (protocol['lr']-protocol['minLr']) * .5 * (1+math.cos(math.pi*fraction))
            optimizer.param_groups[0]['lr'] = lr
            optimizer.zero_grad(set_to_none=True); objective.backward(); norm = torch.nn.utils.clip_grad_norm_([weight, offset], protocol['gradientClip'])
            assert torch.isfinite(norm); optimizer.step()
            cursor.update(epoch=epoch, batch=index+1, updates=cursor['updates']+1, samples=cursor['samples']+len(c['target'])); cursor[kind+'Samples'] += len(c['target'])
            if cursor['updates'] % 1000 == 0:
                persist(); print(json.dumps(dict(stage='semantic_joint', **cursor, source=kind, loss=float(objective.detach()), lr=lr, seconds=round(time.perf_counter()-started, 1))), flush=True)
        cursor.update(epoch=epoch+1, batch=0); persist()
    with torch.no_grad(): model.what_entity.weight[:15].add_(weight); model.what_entity.bias[:15].add_(offset)
    freeze_policy_only(model); assert_frozen_equal(model, champion); model.export(folder / 'model')
    result = dict(completed=True, **cursor, protocol=protocol, identity=fingerprint, cacheReceipt=receipt, modelSha256=sha(folder / 'model.bin'), maxValueLogitsDifference=0., frozenParametersByteEqual=True, lastLearningRate=lr, devUsedForOptimization=False, battleUsedForOptimization=False, seconds=time.perf_counter()-started)
    save(folder / 'semantic-training-complete.json', result)
    identity['semanticJointRepair'] = result
    identity['auxiliaryWaitConstraint'] = dict(selectedIdsPath='generations/gen_03/semantic-constraint-training-ids.json.gz', selectedIdsSha256=fingerprint['constraintIdsSha256'], scanSplit='train', role='119个第一版训练违例，未继承第二/三版权重', sourceModel=protocol['warmModel'])
    save(folder / 'training-input-identity.json', identity)
    old = json.loads((original_folder / 'training-complete.json').read_text('utf-8'))
    old.update(updates=old['updates']+cursor['updates'], supervisedUpdates=old['updates'], supervisedSamples=old['samples'], semanticJointRepair=result, modelSha256=result['modelSha256'], lastLearningRate=lr, stagedTraining=True)
    save(folder / 'training-complete.json', old)
    shutil.copytree(original_folder / 'training-source-snapshot', folder / 'training-source-snapshot', dirs_exist_ok=True)
    shutil.copyfile(original_folder / 'training-source-snapshot.json', folder / 'training-source-snapshot.json')
    print(json.dumps(dict(completed=True, updates=cursor['updates'], modelSha256=result['modelSha256'])), flush=True)


if __name__ == '__main__': main()
