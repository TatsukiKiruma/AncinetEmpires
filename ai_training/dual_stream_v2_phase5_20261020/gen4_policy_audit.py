"""第4代开发集真实全网审计与冻结张量核对，不读取实战结果选模型。"""
import hashlib
import json
import math
import os
from collections import Counter
import torch
from data import DIR, batches, collate, forward_batch, load_model
from calibrate_frozen import decode
from prior_distillation import inference_scores, POLICY_PREFIXES
from gen4_dev_gates import dev_gates


def model_at(prefix):
    previous = os.environ.get('LEAGUE_MODEL')
    os.environ['LEAGUE_MODEL'] = str(prefix)
    try:
        return load_model('model').eval()
    finally:
        if previous is None:
            os.environ.pop('LEAGUE_MODEL', None)
        else:
            os.environ['LEAGUE_MODEL'] = previous


def dev_audit(model, bias, reference_values=None):
    counts = Counter(); hits = waits = total = 0
    values = []; digest = hashlib.sha256(); max_value_diff = 0.
    with torch.no_grad():
        for index, samples in enumerate(batches('dev')):
            x = collate(samples); output = forward_batch(model, x)
            if reference_values is None:
                values.append(output['valueLogits'].clone())
            else:
                difference = float((output['valueLogits'] - reference_values[index]).abs().max())
                max_value_diff = max(max_value_diff, difference)
                assert difference == 0., '完整开发集价值logits必须严格零漂移'
            scores = inference_scores(output, x, samples, bias)
            for i, sample in enumerate(samples):
                n = len(sample['pointers']); chosen = decode(scores[i, :n], x['ptr'][i, :n])
                head = int(x['ptr'][i, chosen, 2]); actor = int(x['ptr'][i, chosen, 0])
                target_head = int(x['ptr'][i, x['target'][i], 2])
                counts[head] += 1; hits += head == target_head
                waits += head == 4 and actor in sample['source']['wasteActors']
                digest.update((sample['source']['id'] + '\n').encode())
            total += len(samples)
            if total % 8192 < len(samples):
                print(json.dumps(dict(stage='gen4_dev_audit', count=total)), flush=True)
    assert total == 34763
    return dict(count=total, headTop1=hits/total, counts=dict(counts), waitWithAnyUnmovedOpportunity=waits, maxValueLogitsDifference=max_value_diff, samplesSha256=digest.hexdigest()), values


def expert_audit(model, reference, bias):
    hits = [0, 0]; gained = lost = total = 0
    with torch.no_grad():
        for samples in batches('train', 0, stream='dual_stream_v2_phase5_20261020/league_stream.ts', env=dict(LEAGUE_EXPERT_MIN_GENERATION='4')):
            x = collate(samples); predictions = []
            for candidate in [reference, model]:
                scores = inference_scores(forward_batch(candidate, x), x, samples, bias)
                predictions.append([decode(scores[i, :len(s['pointers'])], x['ptr'][i, :len(s['pointers'])]) for i, s in enumerate(samples)])
            for i, sample in enumerate(samples):
                old, new = predictions[0][i] == int(x['target'][i]), predictions[1][i] == int(x['target'][i])
                hits[0] += old; hits[1] += new; gained += new and not old; lost += old and not new; total += 1
    discordant = gained + lost
    pvalue = sum(math.exp(math.lgamma(discordant+1)-math.lgamma(k+1)-math.lgamma(discordant-k+1)-discordant*math.log(2)) for k in range(gained, discordant+1)) if discordant else 1.
    return dict(count=total, parentHits=hits[0], studentHits=hits[1], gain=(hits[1]-hits[0])/max(1,total), gained=gained, lost=lost, exactOneSidedMcNemar=pvalue, scope='新训练纠错集拟合证据，非独立泛化')


def frozen_binary_audit(prefix, warm_prefix):
    meta = json.loads((DIR / (str(prefix)+'.json')).read_text('utf-8'))
    old = json.loads((DIR / (str(warm_prefix)+'.json')).read_text('utf-8'))
    data = (DIR / (str(prefix)+'.bin')).read_bytes(); before = (DIR / (str(warm_prefix)+'.bin')).read_bytes()
    entries = {e['name']:e for e in meta['tensors']}; hashes = {}
    for previous in old['tensors']:
        name = previous['name']
        if name.startswith(POLICY_PREFIXES):
            continue
        current = entries[name]
        first = before[previous['offset']*4:(previous['offset']+previous['length'])*4]
        second = data[current['offset']*4:(current['offset']+current['length'])*4]
        assert previous['shape'] == current['shape'] and first == second, '冻结二进制张量变化:'+name
        hashes[name] = hashlib.sha256(second).hexdigest()
    return dict(allByteIdentical=True, tensors=hashes)
