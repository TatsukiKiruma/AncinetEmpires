"""固定实体表征仅存RAM；从实际训练池挖掘待机约束，不读取开发标签。"""
import hashlib
import json
import torch
from data import batches, collate, forward_batch
from prior_distillation import inference_scores
from calibrate_frozen import decode


def collect(model, warm, bias, protocol):
    cache = dict(base=[], expert=[], constraint=[]); capture = {}; ids = dict(base=set(), expert=set(), constraint=set()); counts = {}; digest = hashlib.sha256()
    hook = model.what_entity.register_forward_pre_hook(lambda module,args:capture.__setitem__('features', args[0].detach()))
    streams = dict(base=lambda:batches('train',0,env=dict(LEAGUE_BASE_RATE=str(protocol['baseRate']))), expert=lambda:batches('train',0,stream='dual_stream_v2_phase5_20261020/league_stream.ts',env=dict(LEAGUE_EXPERT_MIN_GENERATION='4')))
    try:
        with torch.no_grad():
            for kind, stream in streams.items():
                seen = memory = skipped = 0
                for samples in stream():
                    x = collate(samples); output = forward_batch(model,x); features = capture.pop('features').clone()
                    reference = forward_batch(warm,x); assert torch.equal(output['valueLogits'],reference['valueLogits'])
                    score = inference_scores(output,x,samples,bias); teacher = inference_scores(reference,x,samples,bias).softmax(-1)
                    actor = x['ptr'][:,:,0].clone(); head = x['ptr'][:,:,2].clone(); mask = x['actionMask'].clone(); waste = torch.zeros_like(mask); hard = torch.ones(len(samples)); constraints = []
                    for i,sample in enumerate(samples):
                        source = sample['source']; ids[kind].add(source['id']); digest.update((kind+':'+source['id']+'\n').encode())
                        if kind == 'expert': assert source['correction'] is True
                        for j in range(len(sample['pointers'])): waste[i,j] = int(head[i,j]) == 4 and int(actor[i,j]) in source.get('wasteActors',[])
                        hard[i] = float(source['prior'][int(x['target'][i])] > -100000 and not bool(waste[i,x['target'][i]])); skipped += int(not hard[i])
                        chosen = decode(score[i,:len(sample['pointers'])],x['ptr'][i,:len(sample['pointers'])])
                        if kind == 'base' and waste[i,chosen]: constraints.append(i); ids['constraint'].add(source['id'])
                    item = dict(features=features, score=score.clone(), teacher=teacher.clone(), actor=actor, head=head, mask=mask, waste=waste, other=mask & (head != 4) & (head != 13), hardMask=hard, target=x['target'].clone(), weights=(x['weight']*x['quality']).clone(), preferred=torch.tensor([s['source'].get('purePreferredIndex',0) for s in samples]), semantic=torch.tensor([s['source'].get('semanticWeight',0.) for s in samples]))
                    cache[kind].append(item); seen += len(samples); memory += sum(t.numel()*t.element_size() for t in item.values())
                    if constraints:
                        selected = torch.tensor(constraints); cache['constraint'].append({k:v[selected].clone() for k,v in item.items()})
                    if seen % 4096 < len(samples): print(json.dumps(dict(stage='gen4_ram_cache',source=kind,samples=seen,cacheBytes=memory,skippedHardLabels=skipped)),flush=True)
                counts[kind] = dict(samples=seen,batches=len(cache[kind]),cacheBytes=memory,skippedHardLabels=skipped)
    finally: hook.remove()
    counts['constraint'] = dict(samples=len(ids['constraint']),batches=len(cache['constraint']),source='监督阶段模型在基础训练子集上实际误选待机的状态')
    assert all(counts[k]['samples'] == len(ids[k]) and counts[k]['samples'] > 0 for k in ['base','expert'])
    return cache,ids,dict(sources=counts,samplesSha256=digest.hexdigest(),denseFeatureFiles=0,approximation='固定实体增量；每个候选导出后真实全网开发集重验')
