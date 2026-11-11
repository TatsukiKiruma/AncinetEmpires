"""第3代继承冠军校准，并在冻结开发集和训练纠错集上做真实解码前检。"""
import json
import math
import os
import shutil
import hashlib
from collections import Counter
import torch
from data import DIR, batches, collate, forward_batch, load_model
from prior_distillation import freeze_policy_only, assert_frozen_equal, inference_scores, POLICY_PREFIXES
from phase52_io import save


def decode(scores, pointers):
    # 保持actor:head组插入顺序及严格大于的并列规则，与decodeTacticalGroups一致。
    groups = {}; values = scores.tolist()
    for i, pointer in enumerate(pointers.tolist()):
        key = (pointer[0], pointer[2])
        if key not in groups or values[i] > values[groups[key]]:
            groups[key] = i
    return max(groups.values(), key=values.__getitem__)


def main(gen):
    assert gen == 3
    torch.set_num_threads(4)
    folder = DIR / 'generations/gen_03'; parent = DIR / 'generations/gen_00'
    os.environ['LEAGUE_GENERATION'] = '3'
    os.environ['LEAGUE_MODEL'] = str(folder / 'model'); student = load_model('model').eval()
    os.environ['LEAGUE_MODEL'] = str(parent / 'model'); champion = load_model('model').eval()
    freeze_policy_only(student); assert_frozen_equal(student, champion)
    parent_meta = {e['name']: e for e in json.loads((parent / 'model.json').read_text('utf-8'))['tensors']}
    student_meta = {e['name']: e for e in json.loads((folder / 'model.json').read_text('utf-8'))['tensors']}
    parent_bytes, student_bytes = (parent / 'model.bin').read_bytes(), (folder / 'model.bin').read_bytes()
    frozen_binary = {}
    for name, old in parent_meta.items():
        if name.startswith(POLICY_PREFIXES): continue
        new = student_meta[name]
        old_raw = parent_bytes[old['offset'] * 4:(old['offset'] + old['length']) * 4]
        new_raw = student_bytes[new['offset'] * 4:(new['offset'] + new['length']) * 4]
        assert old['shape'] == new['shape'] and old_raw == new_raw, f'冻结张量导出字节漂移:{name}'
        frozen_binary[name] = hashlib.sha256(new_raw).hexdigest()
    assert 'headBias' in frozen_binary and 'army_scale' in frozen_binary
    bias = torch.tensor(json.loads((parent / 'head-calibration.json').read_text('utf-8'))['headBias'], dtype=torch.float64)
    counts = [Counter(), Counter()]; hits = [0, 0]; waits = [0, 0]; total = 0; max_value_diff = 0.
    with torch.no_grad():
        for samples in batches('dev'):
            x = collate(samples)
            outputs = [forward_batch(champion, x), forward_batch(student, x)]
            max_value_diff = max(max_value_diff, float((outputs[0]['valueLogits'] - outputs[1]['valueLogits']).abs().max()))
            assert max_value_diff == 0.
            for model_index, out in enumerate(outputs):
                scores = inference_scores(out, x, samples, bias)
                for i, sample in enumerate(samples):
                    ni = len(sample['pointers']); j = decode(scores[i, :ni], x['ptr'][i, :ni])
                    head = int(x['ptr'][i, j, 2]); target_head = int(x['ptr'][i, x['target'][i], 2])
                    counts[model_index][head] += 1; hits[model_index] += int(head == target_head)
                    actor = int(sample['pointers'][j, 0])
                    waits[model_index] += int(head == 4 and actor in sample['source']['wasteActors'])
            total += len(samples)
            if total % 2048 < len(samples): print(json.dumps(dict(stage='dev', count=total)), flush=True)
    assert total == 34763
    expert_hits = [0, 0]; expert_total = 0; gained = lost = hard_total = 0
    with torch.no_grad():
        for samples in batches('train', 0, stream='dual_stream_v2_phase5_20261020/league_stream.ts'):
            x = collate(samples); predictions = []
            for model in [champion, student]:
                scores = inference_scores(forward_batch(model, x), x, samples, bias)
                predictions.append([decode(scores[i, :len(s['pointers'])], x['ptr'][i, :len(s['pointers'])]) for i, s in enumerate(samples)])
            for i, sample in enumerate(samples):
                target = int(x['target'][i]); old = predictions[0][i] == target; new = predictions[1][i] == target
                expert_hits[0] += int(old); expert_hits[1] += int(new); expert_total += 1
                gained += int(new and not old); lost += int(old and not new)
                hard_total += int(sample['source']['semanticWeight'] > 0)
    discordant = gained + lost
    # 二项分布单侧精确McNemar，递推避免大组合数溢出。
    pvalue = sum(math.exp(math.lgamma(discordant + 1) - math.lgamma(k + 1) - math.lgamma(discordant - k + 1) - discordant * math.log(2)) for k in range(gained, discordant + 1)) if discordant else 1.
    before, after = hits[0] / total, hits[1] / total
    ratios = {str(h): counts[1][h] / counts[0][h] if counts[0][h] else None for h in [1, 2, 7, 5, 11]}
    gain = (expert_hits[1] - expert_hits[0]) / max(1, expert_total)
    gates = dict(headTop1=after >= before - .002, waitWithAnyUnmovedOpportunity=waits[1] <= 2,
                 protectedHeadCounts=all(r is not None and .8 <= r <= 1.2 for r in ratios.values()),
                 correctionImproves=expert_total > 0 and gain >= .02 and pvalue < .05, valueLogitsExactlyEqual=max_value_diff == 0.)
    audit = dict(passed=all(gates.values()), gates=gates, devCount=total, champion=dict(headTop1=before, counts=dict(counts[0]), waitWithAnyUnmovedOpportunity=waits[0]), student=dict(headTop1=after, counts=dict(counts[1]), waitWithAnyUnmovedOpportunity=waits[1]), protectedHeadRatios=ratios, expert=dict(count=expert_total, hardLabelCount=hard_total, championHits=expert_hits[0], studentHits=expert_hits[1], gain=gain, gained=gained, lost=lost, exactOneSidedMcNemar=pvalue, scope='训练纠错集上的拟合提升，不宣称独立泛化'), maxValueLogitsDifference=max_value_diff, metricContract='decodeTacticalGroups-actor-head-stable-v1', battleSelection=False)
    audit['sourceIdentity'] = {name: hashlib.sha256((DIR / name).read_bytes()).hexdigest() for name in ['calibrate_frozen.py', 'prior_distillation.py', 'phase52_io.py', 'data.py', 'stream.ts', 'league_stream.ts']}
    snapshot = folder / 'calibration-source-snapshot'; snapshot.mkdir(exist_ok=True)
    for name, digest in audit['sourceIdentity'].items():
        shutil.copyfile(DIR / name, snapshot / name)
        assert hashlib.sha256((snapshot / name).read_bytes()).hexdigest() == digest
    audit['modelSha256'] = hashlib.sha256((folder / 'model.bin').read_bytes()).hexdigest()
    audit['parentSha256'] = hashlib.sha256((parent / 'model.bin').read_bytes()).hexdigest()
    audit['frozenBinaryAudit'] = dict(allByteIdentical=True, tensors=frozen_binary)
    audit['actionHeadContract'] = dict(attack=1, capture=2, wait=4, recruit_to_castle=5, heal=7, post_attack_move=11)
    audit['devStream'] = json.loads((folder / 'stream-receipts/dev-full-epoch0.json').read_text('utf-8'))
    save(folder / 'dev-policy-audit.json', audit)
    for name in ['value-config.json', 'head-calibration.json']:
        shutil.copyfile(parent / name, folder / name)
    value = json.loads((parent / 'value-calibration.json').read_text('utf-8'))
    value.update(inheritedFrom='generations/gen_00', frozenParametersByteEqual=True, maxValueLogitsDifference=max_value_diff, externalParentModelRequired=False)
    save(folder / 'value-calibration.json', value)
    print(json.dumps(audit), flush=True)


if __name__ == '__main__': main(3)
