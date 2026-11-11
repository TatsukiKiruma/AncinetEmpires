"""预登记监督蒸馏与联合语义网格；只用固定开发集选一个候选。"""
import copy
import json
import math
import os
import random
import shutil
import time
import numpy as np
import torch
from torch.nn import functional as F
from data import DIR, batches, collate, forward_batch
from run_league import read, save, sha
from prior_distillation import freeze_policy_only, assert_frozen_equal, inference_scores, policy_loss
from mixed_stream import interleave_batches
from semantic_joint_loss import adjusted_scores, loss
from gen4_semantic_cache import collect
from gen4_train_inputs import inputs, checkpoint, save_ids
from gen4_policy_audit import model_at, dev_audit, expert_audit, dev_gates, frozen_binary_audit


def seed():
    random.seed(20261025); np.random.seed(20261025); torch.manual_seed(20261025)


def supervised(folder, protocol, warm, bias, identity):
    target = folder / 'supervised/model'; complete = folder / 'supervised/complete.json'
    if complete.exists():
        receipt = read(complete); assert receipt['identity'] == identity and receipt['modelSha256'] == sha(target.with_suffix('.bin'))
        return model_at(target), receipt
    settings = protocol['supervised']; model = copy.deepcopy(warm).eval(); parameters = freeze_policy_only(model)
    optimizer = torch.optim.AdamW(parameters,lr=settings['lr'],weight_decay=settings['weightDecay'])
    path = folder / 'supervised/checkpoint.pt'; path.parent.mkdir(parents=True,exist_ok=True)
    cursor = dict(epoch=0,batch=0,updates=0,samples=0,baseSamples=0,expertSamples=0); seen_ids = dict(base=set(),expert=set())
    if path.exists():
        ck = torch.load(path,weights_only=False); assert ck['identity'] == identity
        model.load_state_dict(ck['model']); optimizer.load_state_dict(ck['optimizer']); cursor = ck['cursor']
        torch.set_rng_state(ck['torchRng']); np.random.set_state(ck['numpyRng']); random.setstate(ck['pythonRng'])
    estimated = read(folder / 'extraction-summary.json')['corrections']; total = 20000+estimated; started = time.perf_counter()
    def persist():
        checkpoint(path,dict(model=model.state_dict(),optimizer=optimizer.state_dict(),cursor=cursor.copy(),identity=identity,torchRng=torch.get_rng_state(),numpyRng=np.random.get_state(),pythonRng=random.getstate()))
        save(folder / 'supervised/progress.json',cursor)
    base = batches('train',0,env=dict(LEAGUE_BASE_RATE=str(protocol['baseRate'])))
    expert = batches('train',0,stream='dual_stream_v2_phase5_20261020/league_stream.ts',env=dict(LEAGUE_EXPERT_MIN_GENERATION='4'))
    first = cursor['batch']
    for index,(kind,samples) in enumerate(interleave_batches(base,expert,20000,estimated)):
        for sample in samples: seen_ids[kind].add(sample['source']['id'])
        if index < first: continue
        x = collate(samples); output = forward_batch(model,x)
        with torch.no_grad(): reference = forward_batch(warm,x)
        assert torch.equal(output['valueLogits'],reference['valueLogits'])
        if kind == 'expert': objective = policy_loss(kind,output,reference,x,samples,bias)
        else:
            score = inference_scores(output,x,samples,bias); teacher = inference_scores(reference,x,samples,bias)
            kl = F.kl_div(score.log_softmax(-1),teacher.softmax(-1),reduction='none').sum(-1)
            hard = torch.tensor([s['source']['prior'][int(x['target'][i])] > -100000 and not (int(x['ptr'][i,x['target'][i],2]) == 4 and int(x['ptr'][i,x['target'][i],0]) in s['source']['wasteActors']) for i,s in enumerate(samples)])
            ce = F.cross_entropy(score,x['target'],reduction='none'); weights = x['weight']*x['quality']
            objective = ((settings['baseKl']*kl+settings['baseActionCe']*ce*hard)*weights).sum()/weights.sum().clamp_min(1e-12)
        fraction = min(1.,cursor['samples']/max(1,total)); lr = settings['minLr']+(settings['lr']-settings['minLr'])*.5*(1+math.cos(math.pi*fraction))
        optimizer.param_groups[0]['lr'] = lr; optimizer.zero_grad(set_to_none=True); objective.backward()
        norm = torch.nn.utils.clip_grad_norm_(parameters,settings['gradientClip']); assert torch.isfinite(norm); optimizer.step(); assert_frozen_equal(model,warm)
        cursor.update(batch=index+1,updates=cursor['updates']+1,samples=cursor['samples']+len(samples)); cursor[kind+'Samples'] += len(samples)
        if cursor['updates'] % 50 == 0:
            persist(); print(json.dumps(dict(stage='gen4_supervised',**cursor,loss=float(objective.detach()),seconds=time.perf_counter()-started)),flush=True)
    cursor.update(epoch=1); persist(); model.export(target)
    ids = save_ids(folder / 'supervised/consumed-ids.json.gz',seen_ids)
    assert cursor['baseSamples'] == len(seen_ids['base']) and cursor['expertSamples'] == len(seen_ids['expert'])
    receipt = dict(completed=True,**cursor,identity=identity,consumedIds=ids,modelSha256=sha(target.with_suffix('.bin')),maxValueLogitsDifference=0.,lastLearningRate=optimizer.param_groups[0]['lr'])
    save(complete,receipt); return model,receipt


def semantic_candidate(base, warm, bias, cache, receipt, grid, protocol, folder, identity, warm_dev, champion_dev, values):
    target = folder / 'grid' / grid['id']; target.mkdir(parents=True,exist_ok=True)
    completed = target / 'audit.json'
    if completed.exists():
        audit = read(completed); assert audit['identity'] == identity and audit['modelSha256'] == sha(target / 'model.bin')
        return audit
    seed(); settings = {**protocol['semantic'],**grid}; weight = torch.zeros(15,128,requires_grad=True); offset = torch.zeros(15,requires_grad=True)
    optimizer = torch.optim.AdamW([weight,offset],lr=settings['lr'],weight_decay=settings['weightDecay'])
    cursor = dict(epoch=0,batch=0,updates=0,samples=0,baseSamples=0,expertSamples=0,constraintSamples=0); path = target / 'checkpoint.pt'
    fingerprint = dict(identity=identity,grid=grid,cacheSha256=receipt['samplesSha256'])
    if path.exists():
        ck = torch.load(path,weights_only=False); assert ck['identity'] == fingerprint
        with torch.no_grad(): weight.copy_(ck['weight']); offset.copy_(ck['offset'])
        optimizer.load_state_dict(ck['optimizer']); cursor = ck['cursor']
    def persist():
        checkpoint(path,dict(weight=weight.detach(),offset=offset.detach(),optimizer=optimizer.state_dict(),cursor=cursor.copy(),identity=fingerprint))
        save(target / 'progress.json',cursor)
    entries = [(kind,i) for kind,items in cache.items() for _ in range(settings['constraintRepeats'] if kind == 'constraint' else 1) for i in range(len(items))]
    total = settings['epochs']*len(entries)
    for epoch in range(cursor['epoch'],settings['epochs']):
        sequence = entries.copy(); random.Random(20261025+epoch).shuffle(sequence); first = cursor['batch']
        for index,(kind,i) in enumerate(sequence):
            if index < first: continue
            item = cache[kind][i]; score = adjusted_scores(item,weight,offset)
            objective = loss(kind,score,item,settings)+settings['deltaL2']*(weight.square().sum()+offset.square().sum())
            fraction = cursor['updates']/max(1,total-1); lr = settings['minLr']+(settings['lr']-settings['minLr'])*.5*(1+math.cos(math.pi*fraction))
            optimizer.param_groups[0]['lr'] = lr; optimizer.zero_grad(set_to_none=True); objective.backward()
            norm = torch.nn.utils.clip_grad_norm_([weight,offset],settings['gradientClip']); assert torch.isfinite(norm); optimizer.step()
            cursor.update(epoch=epoch,batch=index+1,updates=cursor['updates']+1,samples=cursor['samples']+len(item['target'])); cursor[kind+'Samples'] += len(item['target'])
            if cursor['updates'] % 1000 == 0: persist(); print(json.dumps(dict(stage='gen4_semantic',candidate=grid['id'],**cursor,loss=float(objective.detach()))),flush=True)
        cursor.update(epoch=epoch+1,batch=0); persist()
    model = copy.deepcopy(base).eval()
    with torch.no_grad(): model.what_entity.weight[:15].add_(weight); model.what_entity.bias[:15].add_(offset)
    freeze_policy_only(model); assert_frozen_equal(model,warm); model.export(target / 'model')
    stats,_ = dev_audit(model,bias,values); gates,ratios,warm_ratios = dev_gates(stats,warm_dev,champion_dev,protocol)
    expert = expert_audit(model,warm,bias); gates['correctionImproves'] = expert['count'] > 0 and expert['gain'] >= protocol['devGates']['correctionGainMin'] and expert['exactOneSidedMcNemar'] < protocol['devGates']['exactMcNemarMax']
    frozen = frozen_binary_audit(target / 'model',DIR / protocol['warmModel']); gates['frozenBinary'] = frozen['allByteIdentical']
    audit = dict(passed=all(gates.values()),gates=gates,student=stats,warm=warm_dev,champion=champion_dev,expert=expert,protectedHeadRatios=ratios,protectedWarmRatios=warm_ratios,frozenBinaryAudit=frozen,grid=grid,training=cursor,identity=identity,modelSha256=sha(target / 'model.bin'),maxValueLogitsDifference=stats['maxValueLogitsDifference'],selectionUsesBattle=False)
    save(completed,audit); print(json.dumps(dict(stage='candidate_audited',candidate=grid['id'],passed=audit['passed'],gates=gates,headTop1=stats['headTop1'],wait=stats['waitWithAnyUnmovedOpportunity'])),flush=True)
    return audit


def main():
    torch.set_num_threads(4); torch.set_num_interop_threads(1); torch.use_deterministic_algorithms(True); seed()
    os.environ.update(LEAGUE_GENERATION='4',LEAGUE_EXPERT_MIN_GENERATION='4')
    folder = DIR / 'generations/gen_04'; protocol = read(DIR / 'phase53-audit/gen4-protocol.json')
    assert sha(DIR / (protocol['warmModel']+'.bin')) == protocol['warmSha256']; identity = inputs(protocol,folder)
    warm = model_at(protocol['warmModel']); bias = torch.tensor(read(DIR / 'generations/gen_03/head-calibration.json')['headBias'],dtype=torch.float64)
    for p in warm.parameters(): p.requires_grad_(False)
    base,training = supervised(folder,protocol,warm,bias,identity)
    for p in base.parameters(): p.requires_grad_(False)
    cache,ids,receipt = collect(base,warm,bias,protocol); consumed = save_ids(folder / 'semantic-consumed-ids.json.gz',ids); save(folder / 'semantic-cache-receipt.json',receipt)
    assert consumed['counts']['base'] == training['baseSamples'] and consumed['counts']['expert'] == training['expertSamples']
    warm_dev,values = dev_audit(warm,bias); champion_dev = read(DIR / 'generations/gen_03/dev-policy-audit.json')['champion']
    previous = read(DIR / 'generations/gen_03/dev-policy-audit.json')['student']; assert warm_dev['headTop1'] == previous['headTop1'] and {str(k):v for k,v in warm_dev['counts'].items()} == previous['counts']
    audits = [semantic_candidate(base,warm,bias,cache,receipt,grid,protocol,folder,identity,warm_dev,champion_dev,values) for grid in protocol['semanticGrid']]
    eligible = sorted([a for a in audits if a['passed']],key=lambda a:(-a['student']['headTop1'],a['student']['waitWithAnyUnmovedOpportunity'],a['grid']['id']))
    selection = dict(passed=bool(eligible),protocolSha256=identity['protocolSha256'],ranking=[dict(id=a['grid']['id'],passed=a['passed'],headTop1=a['student']['headTop1'],wait=a['student']['waitWithAnyUnmovedOpportunity']) for a in audits],selected=eligible[0]['grid']['id'] if eligible else None,criterion=protocol['selection'],usesBattleResults=False)
    save(folder / 'grid-selection.json',selection)
    assert eligible, '预登记网格无候选通过全部开发门禁，保留8份权重，禁止启动实战或按战果改选'
    selected = eligible[0]; source = folder / 'grid' / selected['grid']['id']
    for suffix in ['bin','json']:
        target = folder / ('model.'+suffix)
        if target.exists(): assert sha(target) == sha(source / ('model.'+suffix))
        else: shutil.copyfile(source / ('model.'+suffix),target)
    audit = {**selected,'modelSha256':sha(folder / 'model.bin'),'selectedCandidate':selected['grid']['id'],'devCount':selected['student']['count']}
    save(folder / 'dev-policy-audit.json',audit)
    for name in ['value-config.json','head-calibration.json']: shutil.copyfile(DIR / 'generations/gen_03' / name,folder / name)
    value = read(DIR / 'generations/gen_03/value-calibration.json'); value.update(inheritedFrom='generations/gen_03',frozenParametersByteEqual=True,maxValueLogitsDifference=0.,inheritanceEvidence='dev-policy-audit.json:frozenBinaryAudit和完整34763状态零漂移')
    save(folder / 'value-calibration.json',value)
    save(folder / 'training-complete.json',dict(completed=True,generation=4,supervised=training,semantic=selected['training'],consumedIds=consumed,cacheReceipt=receipt,modelSha256=audit['modelSha256'],maxValueLogitsDifference=0.,frozenParametersByteEqual=True,selection=selection,usesBattleResultsForHyperparameters=False))
    print(json.dumps(dict(completed=True,selected=selected['grid']['id'],modelSha256=audit['modelSha256'])),flush=True)


if __name__ == '__main__': main()
