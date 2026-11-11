"""同一代的训练集待机校正：只调整what_entity待机行，禁止使用开发标签优化。"""
import gzip
import hashlib
import json
import math
import os
import shutil
import time
from pathlib import Path
import torch
from data import DIR, ROOT, batches, collate, forward_batch, load_model
from phase52_io import save
from prior_distillation import inference_scores, freeze_policy_only, assert_frozen_equal
from wait_constraint import sparse_anchor_part, opportunity_margin


def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def decode(scores, pointers):
    values = scores.tolist(); groups = {}
    for i, p in enumerate(pointers.tolist()):
        key = (p[0], p[2])
        if key not in groups or values[i] > values[groups[key]]: groups[key] = i
    return max(groups.values(), key=values.__getitem__)


def main():
    torch.set_num_threads(4); torch.set_num_interop_threads(1); torch.use_deterministic_algorithms(True)
    folder = DIR / 'generations/gen_03'; archive = folder / 'training-attempt01-prior-aware'
    protocol = json.loads((folder / 'wait-repair-protocol.json').read_text('utf-8'))
    assert protocol['generation'] == 3 and sha(DIR / (protocol['warmModel'] + '.bin')) == protocol['warmSha256']
    source_paths = [Path(__file__), DIR / 'wait_constraint.py', DIR / 'data.py', DIR / 'prior_distillation.py', DIR / 'phase52_io.py', DIR / 'stream.ts', DIR.parent / 'dual_stream_v2_phase3_20261020/batch_model.py']
    sources = {p.relative_to(ROOT).as_posix(): sha(p) for p in source_paths}
    original_identity = json.loads((archive / 'training-input-identity.json').read_text('utf-8'))
    corpus_identity = {name: digest for name, digest in original_identity['dataIdentity'].items() if '/corpus/train-' in name}
    assert corpus_identity and all(sha(DIR / name) == digest for name, digest in corpus_identity.items())
    os.environ['LEAGUE_GENERATION'] = '3'
    os.environ.pop('LEAGUE_BASE_RATE', None)
    os.environ['LEAGUE_MODEL'] = str(DIR / protocol['warmModel']); model = load_model('model').eval()
    os.environ['LEAGUE_MODEL'] = str(DIR / protocol['parentModel']); champion = load_model('model').eval()
    for p in [*model.parameters(), *champion.parameters()]: p.requires_grad_(False)
    bias = torch.tensor(json.loads((DIR / 'generations/gen_00/head-calibration.json').read_text('utf-8'))['headBias'], dtype=torch.float64)
    capture = {}
    hook = model.what_entity.register_forward_pre_hook(lambda module, args: capture.__setitem__('ent', args[0].detach()))
    feature_rows = []; index_rows = []; score_rows = []; probability_rows = []; lse_rows = []; weight_rows = []
    constraint_features = []; constraint_scores = []; alternatives = []; selected_ids = {}
    seen = 0; anchor_count = 0; constraint_states = 0; started = time.perf_counter()
    with torch.no_grad():
        for samples in batches('train', 0):
            x = collate(samples); out = forward_batch(model, x); score = inference_scores(out, x, samples, bias); ent = capture['ent']
            anchors = []
            for i, sample in enumerate(samples):
                source = sample['source']; n = len(sample['pointers']); ptr = x['ptr'][i, :n]; s = score[i, :n]
                wait = (ptr[:, 2] == 4).nonzero().flatten()
                chosen = decode(s, ptr); actor = int(sample['pointers'][chosen, 0])
                violation = int(ptr[chosen, 2]) == 4 and actor in source['wasteActors']
                anchor = int(hashlib.sha256(source['id'].encode()).hexdigest()[:8], 16) / 4294967296 < protocol['anchorRate'] and len(wait) > 0
                if anchor: anchors.append((i, sample, wait))
                if violation:
                    eligible = [j for j in wait.tolist() if int(sample['pointers'][j, 0]) in source['wasteActors']]
                    ids = torch.tensor(eligible, dtype=torch.long)
                    actors = ptr[ids, 0]
                    features = torch.cat([ent[i, actors].clone(), torch.ones(len(ids), 1)], -1)
                    alternative = s.masked_fill((ptr[:, 2] == 4) | (ptr[:, 2] == 13), -1e9).max()
                    assert float(alternative) > -1e8
                    constraint_features.append(features); constraint_scores.append(s[ids].clone()); alternatives.append(alternative.repeat(len(ids)))
                    constraint_states += 1
                if anchor or violation:
                    selected_ids[source['id']] = dict(id=source['id'], parent=source['parent'], anchor=anchor, constraint=violation)
            if anchors:
                ref_samples = [item[1] for item in anchors]; ref_x = collate(ref_samples)
                ref = inference_scores(forward_batch(champion, ref_x), ref_x, ref_samples, bias)
                for k, (i, sample, wait) in enumerate(anchors):
                    n = len(sample['pointers']); ptr = x['ptr'][i, :n]; s = score[i, :n]
                    features = torch.cat([ent[i, ptr[wait, 0]].clone(), torch.ones(len(wait), 1)], -1)
                    feature_rows.append(features); index_rows.append(torch.full((len(wait),), anchor_count, dtype=torch.long))
                    score_rows.append(s[wait].clone()); probability_rows.append(ref[k, :n].softmax(-1)[wait].clone())
                    lse_rows.append(s.masked_fill(ptr[:, 2] == 4, -1e9).logsumexp(-1))
                    weight_rows.append(float(sample['weight']) * sample['source'].get('quality', 1.))
                    anchor_count += 1
            seen += len(samples)
            if seen % 4096 < len(samples): print(json.dumps(dict(stage='train_mining', seen=seen, anchors=anchor_count, constraintStates=constraint_states, seconds=time.perf_counter() - started)), flush=True)
    hook.remove()
    assert constraint_states > 0 and anchor_count > 0
    features, sample_index = torch.cat(feature_rows), torch.cat(index_rows)
    wait_scores, teacher_wait = torch.cat(score_rows), torch.cat(probability_rows)
    nonwait_lse, weights = torch.stack(lse_rows), torch.tensor(weight_rows, dtype=torch.float64)
    cf, cs, alt = torch.cat(constraint_features), torch.cat(constraint_scores), torch.cat(alternatives)
    del feature_rows, index_rows, score_rows, probability_rows, constraint_features, constraint_scores, alternatives, capture
    selected = list(selected_ids.values()); packed = gzip.compress(json.dumps(selected, ensure_ascii=False).encode(), mtime=0)
    target = folder / 'wait-constraint-training-ids.json.gz'; temporary = target.with_suffix('.gz.tmp'); temporary.write_bytes(packed); temporary.replace(target)
    fingerprint = dict(sourceIdentity=sources, corpusIdentity=corpus_identity, protocolSha256=sha(folder / 'wait-repair-protocol.json'), selectedIdsSha256=sha(target), exclusionsSha256=sha(DIR / 'evaluation-exclusions.txt.gz'), warmSha256=protocol['warmSha256'], championSha256=sha(DIR / (protocol['parentModel'] + '.bin')), externalBiasSha256=sha(DIR / 'generations/gen_00/head-calibration.json'))
    delta = torch.zeros(129, requires_grad=True)
    optimizer = torch.optim.Adam([delta], lr=protocol['lr']); first = 0
    checkpoint = folder / 'wait-constraint-checkpoint.pt'
    if checkpoint.exists():
        ck = torch.load(checkpoint, weights_only=False); assert ck['identity'] == fingerprint
        with torch.no_grad(): delta.copy_(ck['delta'])
        optimizer.load_state_dict(ck['optimizer']); first = ck['step']
    with torch.no_grad(): anchor_start = sparse_anchor_part(torch.zeros_like(delta), features, sample_index, wait_scores, teacher_wait, nonwait_lse, weights)
    def persist(step):
        temporary = checkpoint.with_suffix('.pt.tmp'); torch.save(dict(delta=delta.detach(), optimizer=optimizer.state_dict(), step=step, identity=fingerprint), temporary); temporary.replace(checkpoint)
    for step in range(first, protocol['steps']):
        fraction = step / max(1, protocol['steps'] - 1)
        lr = protocol['minLr'] + (protocol['lr'] - protocol['minLr']) * .5 * (1 + math.cos(math.pi * fraction))
        optimizer.param_groups[0]['lr'] = lr
        anchor = sparse_anchor_part(delta, features, sample_index, wait_scores, teacher_wait, nonwait_lse, weights) - anchor_start
        margin, gaps = opportunity_margin(delta, cf, cs, alt, protocol['margin'])
        loss = anchor + protocol['hingeWeight'] * margin + protocol['l2'] * delta.square().sum()
        optimizer.zero_grad(set_to_none=True); loss.backward(); norm = torch.nn.utils.clip_grad_norm_([delta], protocol['gradientClip'])
        assert torch.isfinite(norm); optimizer.step()
        if (step + 1) % 50 == 0:
            persist(step + 1)
            print(json.dumps(dict(stage='wait_constraint', step=step + 1, loss=float(loss.detach()), anchorDelta=float(anchor.detach()), margin=float(margin.detach()), trainBadPairs=int((gaps >= 0).sum()), lr=lr)), flush=True)
    with torch.no_grad():
        model.what_entity.weight[4].add_(delta[:128]); model.what_entity.bias[4].add_(delta[128])
    freeze_policy_only(model); assert_frozen_equal(model, champion); model.export(folder / 'model')
    old = json.loads((archive / 'training-complete.json').read_text('utf-8'))
    result = dict(completed=True, scannedTrainSamples=seen, anchorSamples=anchor_count, constraintStates=constraint_states, constraintPairs=len(cs), steps=protocol['steps'], finalTrainBadPairs=int((gaps >= 0).sum()), delta=delta.detach().tolist(), identity=fingerprint, devUsedForOptimization=False, frozenValueAndBackbone=True, parameterRows=protocol['permittedParameterRows'], modelSha256=sha(folder / 'model.bin'))
    save(folder / 'wait-constraint-training.json', result)
    identity = json.loads((archive / 'training-input-identity.json').read_text('utf-8'))
    identity['auxiliaryWaitConstraint'] = {**fingerprint, 'selectedIdsPath': 'generations/gen_03/wait-constraint-training-ids.json.gz', 'sourceModel': protocol['warmModel'], 'scanSplit': 'train'}
    save(folder / 'training-input-identity.json', identity)
    shutil.copytree(archive / 'training-source-snapshot', folder / 'training-source-snapshot', dirs_exist_ok=True)
    for p in source_paths:
        dest = folder / 'wait-constraint-source-snapshot' / p.relative_to(ROOT); dest.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(p, dest)
    save(folder / 'training-source-snapshot.json', identity['sourceIdentity'])
    old.update(modelSha256=result['modelSha256'], updates=old['updates'] + protocol['steps'], supervisedUpdates=old['updates'], supervisedSamples=old['samples'], auxiliaryWaitConstraint=result, lastLearningRate=protocol['minLr'], stagedTraining=True)
    save(folder / 'training-complete.json', old)
    print(json.dumps(dict(completed=True, auxiliary=result)), flush=True)


if __name__ == '__main__': main()
