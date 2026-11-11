"""正式训练前的十万抽样、全批梯度等价、掩码和真实恢复自检。"""
import copy
import json
import random
import time
import uuid
from core import HERE, STAGE1, DATA, legacy, torch, EncoderPool as Encoder, read, save, validate, fresh, gradients, reference_gradients, update, objective, prior_scale
from sampler import OmniSampler


def main():
    started=time.perf_counter()
    validate()
    config=read(HERE/'CONFIG.json')
    manifest=read(STAGE1/'PARTITIONS.json')
    group={p['parentId']:p['isolationGroupId'] for p in manifest['parents']}
    sampler=OmniSampler(manifest)
    for _ in range(12500):
        rows=sampler.batch(8)
        assert len({group[r['parentId']] for r in rows})==8
    counters=sampler.state_dict()['exposures']
    assert {k:counters[k] for k in ['players/2','players/3','players/4','corpus/old','corpus/new']}=={
        'players/2':34000,'players/3':33000,'players/4':33000,'corpus/old':17000,'corpus/new':83000}
    sampler.batch(8)
    saved=copy.deepcopy(sampler.state_dict())
    expected=[sampler.batch(8) for _ in range(20)]
    restored=OmniSampler(manifest); restored.load_state_dict(saved)
    assert [restored.batch(8) for _ in range(20)]==expected
    sampling=dict(samples=100000,strictQuotaPassed=True,resumeExact=True,distinctGroupsPerMicrobatch=True,
        exposure={k:v for k,v in counters.items() if not k.startswith(('parent/','group/'))},
        parentsExposed=sum(k.startswith('parent/') for k in counters),
        maxParentExposure=max(v for k,v in counters.items() if k.startswith('parent/')),
        trainingTestParentsAccessed=0,trainingTestForward=0)
    save(HERE/'SAMPLING_VERIFIED.json',sampling)
    torch.set_num_threads(2)
    device=legacy.device_for('cuda:0')
    sampler=OmniSampler(manifest)
    encoder=Encoder(DATA/'verify-encoder.stderr.log')
    try:
        rows=encoder.rows(sampler.effective_batch(),timeout=120)
    finally:
        encoder.close()
    model,optimizer,scheduler,inherited,receipt=fresh(device,config)
    coeff=[0. if i%4==0 else .73 for i in range(32)]
    gradients(model,rows,device,coeff,8)
    a=torch.cat([p.grad.detach().flatten().cpu() for p in model.parameters()])
    gradients(model,rows,device,coeff,32)
    b=torch.cat([p.grad.detach().flatten().cpu() for p in model.parameters()])
    relative=float((a-b).double().norm()/b.double().norm())
    assert relative<1e-4,relative
    reference_gradients(model,rows,device,coeff,32)
    original=torch.cat([p.grad.detach().flatten().cpu() for p in model.parameters()])
    original_relative=float((a-original).double().norm()/original.double().norm())
    assert original_relative<1e-4,original_relative
    # 单候选仍保留价值梯度，策略logits没有损失梯度。
    row=copy.deepcopy(rows[0]); row['pointers']=row['pointers'][:1]; row['source']['prior']=[100.]
    x=legacy.move(legacy.collate([row]),device); x['target'].zero_(); row['policyTarget']=torch.tensor(0)
    logits=torch.zeros((1,1),device=device,requires_grad=True)
    values=torch.zeros((1,6),device=device,requires_grad=True)
    objective(dict(logits=logits,valueLogits=values,valueProbs=values.softmax(-1)),x,[row],0,1,[1.]).backward()
    assert float(logits.grad.abs().sum())==0 and float(values.grad.abs().sum())>0
    # 保存真实完整2M/AdamW/RNG/游标，再验证下一次训练更新的精确恢复。
    rng=random.Random(config['seed']+300)
    update(model,optimizer,scheduler,rows,device,rng,1,config)
    barrier=dict(model=copy.deepcopy(model.state_dict()),optimizer=copy.deepcopy(optimizer.state_dict()),
        scheduler=copy.deepcopy(scheduler.state_dict()),rng=legacy.rng_state(),dropout=rng.getstate(),sampler=sampler.state_dict())
    engineering_file=DATA/('engineering-checkpoint-'+uuid.uuid4().hex+'.pt')
    torch.save(barrier,engineering_file)
    metrics_a=update(model,optimizer,scheduler,rows,device,rng,2,config)
    expected_model=copy.deepcopy(model.state_dict()); expected_optimizer=copy.deepcopy(optimizer.state_dict())
    loaded=torch.load(engineering_file,map_location='cpu',weights_only=False)
    model.load_state_dict(loaded['model']); optimizer.load_state_dict(loaded['optimizer']); scheduler.load_state_dict(loaded['scheduler'])
    legacy.restore_rng(loaded['rng']); rng.setstate(loaded['dropout'])
    metrics_b=update(model,optimizer,scheduler,rows,device,rng,2,config)
    max_error=max(float((p.cpu()-expected_model[k].cpu()).abs().max()) for k,p in model.state_dict().items())
    assert max_error<2e-6,max_error
    assert metrics_a['priorDropped']==metrics_b['priorDropped']
    assert prior_scale(1,config['updates'])==1. and abs(prior_scale(config['updates'],config['updates'])-.3)<1e-12
    save(HERE/'NUMERICAL_VERIFIED.json',dict(passed=True,relativeL2=relative,originalNetworkGradientRelativeL2=original_relative,tolerance=1e-4,
        parameters=sum(p.numel() for p in model.parameters()),restore=receipt,
        fullOptimizerRestoreMaxParameterError=max_error,
        modelBitwiseResume=legacy.tensor_digest(model.state_dict())==legacy.tensor_digest(expected_model),
        optimizerBitwiseResume=legacy.tensor_digest(optimizer.state_dict())==legacy.tensor_digest(expected_optimizer),
        engineeringUpdates=3,engineeringPromotable=False,engineeringCheckpoint=str(engineering_file),singleCandidatePolicyGradientZero=True,
        singleCandidateValueGradientRetained=True,dropoutRngExact=True,
        shapeGroups={str(tuple(r['spatial'].shape)):sum(tuple(a['spatial'].shape)==tuple(r['spatial'].shape) for a in rows) for r in rows},
        seconds=time.perf_counter()-started))
    print(json.dumps(dict(passed=True,relativeL2=relative,resumeMaxError=max_error,seconds=time.perf_counter()-started)))


if __name__=='__main__':
    main()
