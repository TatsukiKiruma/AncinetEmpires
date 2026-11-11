"""仅在内存暂存冻结实体向量，不持久化任何稠密特征或重新实现规则。"""
import hashlib
import json
import time
import torch
from data import batches, collate, forward_batch
from prior_distillation import inference_scores


def collect(model, champion, bias, protocol, selected):
    cache = {}; capture = {}; digest = hashlib.sha256(); counts = {}; started = time.perf_counter()
    hook = model.what_entity.register_forward_pre_hook(lambda module, args: capture.__setitem__('features', args[0].detach()))
    streams = dict(base=lambda: batches('train', 0, env=dict(LEAGUE_BASE_RATE=str(protocol['baseRate']))), expert=lambda: batches('train', 0, stream='dual_stream_v2_phase5_20261020/league_stream.ts'), constraint=lambda: batches('train', 0, env=dict(LEAGUE_SELECTED_IDS=str(selected), LEAGUE_CONSTRAINT_ONLY='1')))
    try:
        with torch.no_grad():
            for kind, stream in streams.items():
                entries = []; seen = skipped_prior = skipped_wait = memory = 0
                for samples in stream():
                    x = collate(samples); out = forward_batch(model, x); features = capture.pop('features').clone()
                    reference = forward_batch(champion, x); assert torch.equal(out['valueLogits'], reference['valueLogits'])
                    score = inference_scores(out, x, samples, bias); teacher = inference_scores(reference, x, samples, bias).softmax(-1)
                    actor = x['ptr'][:, :, 0].clone(); head = x['ptr'][:, :, 2].clone(); mask = x['actionMask'].clone()
                    waste = torch.zeros_like(mask); other = mask & (head != 4) & (head != 13); hard = torch.ones(len(samples))
                    for i, sample in enumerate(samples):
                        source = sample['source']; digest.update((kind + ':' + source['id'] + '\n').encode())
                        if kind == 'expert': assert source['correction'] is True
                        n = len(sample['pointers'])
                        for j in range(n): waste[i, j] = int(head[i, j]) == 4 and int(actor[i, j]) in source.get('wasteActors', [])
                        prior_forbidden = source['prior'][int(x['target'][i])] <= -100000
                        contradictory_wait = bool(waste[i, x['target'][i]])
                        hard[i] = float(not prior_forbidden and not contradictory_wait)
                        skipped_prior += int(prior_forbidden); skipped_wait += int(contradictory_wait)
                    item = dict(features=features, score=score.clone(), teacher=teacher.clone(), actor=actor, head=head, mask=mask, waste=waste, other=other, hardMask=hard, target=x['target'].clone(), weights=(x['weight'] * x['quality']).clone(), preferred=torch.tensor([s['source'].get('purePreferredIndex', 0) for s in samples]), semantic=torch.tensor([s['source'].get('semanticWeight', 0.) for s in samples]))
                    entries.append(item); seen += len(samples); memory += sum(t.numel() * t.element_size() for t in item.values())
                    if seen % 4096 < len(samples): print(json.dumps(dict(stage='frozen_train_cache', source=kind, samples=seen, skippedForbiddenLabels=skipped_prior, contradictoryWaitLabels=skipped_wait, cacheBytes=memory, seconds=round(time.perf_counter()-started, 1))), flush=True)
                cache[kind] = entries; counts[kind] = dict(samples=seen, batches=len(entries), skippedForbiddenLabels=skipped_prior, contradictoryWaitLabels=skipped_wait, cacheBytes=memory)
    finally: hook.remove()
    assert {k: c['samples'] for k, c in counts.items()} == dict(base=19127, expert=8520, constraint=119)
    return cache, dict(sources=counts, samplesSha256=digest.hexdigest(), denseFeatureFiles=0, maxValueLogitsDifference=0., approximatePolicyCache='语义增量加到已计算完整分数，仅优化近似；导出后必须实际全网重验')
