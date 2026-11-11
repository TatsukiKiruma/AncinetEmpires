"""Mac设备接口；科学目标及四个真实微批的更新函数直接复用冻结源。"""
import copy
import math
import random
import numpy as np
import torch
from model import DualStreamModel
from math_core import update as science_update
import mac_platform

def device():return torch.device(read(WORK/'MAC_RUNTIME.json')['device'])

def synchronize(target):
    if torch.device(target).type=='mps':torch.mps.synchronize()

def cpu_tree(value):
    if isinstance(value,torch.Tensor):return value.detach().cpu().clone()
    if isinstance(value,dict):return {key:cpu_tree(item) for key,item in value.items()}
    if isinstance(value,list):return [cpu_tree(item) for item in value]
    if isinstance(value,tuple):return tuple(cpu_tree(item) for item in value)
    return copy.deepcopy(value)

def validate():
    manifest=read(WORK/'MAC_CONTRACT.json')
    for name,digest in manifest['files'].items():
        if sha(WORK/name)!=digest:raise ValueError('Mac冻结文件身份变化：'+name)
    verification=read(WORK/'INPUTS_VERIFIED.json')
    if not verification['passed'] or verification['inputsIndexSha256']!=manifest['inputsIndexSha256']:
        raise ValueError('Mac完整输入尚未通过校验')
    return sha(WORK/'MAC_CONTRACT.json')

def rng_state(target):
    return dict(python=random.getstate(),numpy=np.random.get_state(),torch=torch.get_rng_state(),gpu=None,
        mps=torch.mps.get_rng_state().cpu() if torch.device(target).type=='mps' else None)

def restore_rng(value,target,seed):
    random.setstate(value['python']);np.random.set_state(value['numpy']);torch.set_rng_state(value['torch'].cpu())
    if torch.device(target).type=='mps':
        if value.get('mps') is not None:torch.mps.set_rng_state(value['mps'].cpu())
        else:torch.mps.manual_seed(seed)

def instantiate(saved,config,target=None):
    target=device() if target is None else torch.device(target)
    torch.set_num_threads(read(WORK/'MAC_RUNTIME.json')['cpuThreads'])
    torch.use_deterministic_algorithms(True)
    torch.set_float32_matmul_precision('highest')
    model=DualStreamModel(seed=config['seed']).accurate_reductions(False)
    assert sum(p.numel() for p in model.parameters() if p.requires_grad)==1966910
    model.load_state_dict(saved['model'],strict=True);model=model.to(target)
    optimizer=torch.optim.AdamW(model.parameters(),lr=config['peakLearningRate'],weight_decay=config['weightDecay'],betas=(.9,.999),eps=1e-8,foreach=False,fused=False)
    def factor(step):
        u=min(config['updates'],step+1)
        if u<=config['warmupUpdates']:return u/config['warmupUpdates']
        t=(u-config['warmupUpdates'])/(config['updates']-config['warmupUpdates'])
        end=config['endLearningRate']/config['peakLearningRate']
        return end+(1-end)*.5*(1+math.cos(math.pi*t))
    scheduler=torch.optim.lr_scheduler.LambdaLR(optimizer,factor)
    optimizer.load_state_dict(saved['optimizer']);scheduler.load_state_dict(saved['scheduler'])
    synchronize(target)
    assert tensor_digest(model.state_dict())==tensor_digest(saved['model'])
    restored=optimizer.state_dict()
    assert tensor_digest(restored['state'])==tensor_digest(saved['optimizer']['state'])
    assert sum(v['exp_avg'].numel() for v in optimizer.state.values())==1966910
    for actual,expected in zip(restored['param_groups'],saved['optimizer']['param_groups']):
        for key in ['lr','betas','eps','weight_decay','params']:assert actual[key]==expected[key],key
    restore_rng(saved['rng'],target,config['seed'])
    assert torch.equal(torch.get_rng_state(),saved['rng']['torch'].cpu())
    if saved['rng'].get('mps') is not None and target.type=='mps':assert torch.equal(torch.mps.get_rng_state(),saved['rng']['mps'])
    return model,optimizer,scheduler,dict(modelExact=True,adamWMomentsAndStepsExact=True,
        fullOptimizerDigestExact=tensor_digest(restored)==tensor_digest(saved['optimizer']),cpuRngBytesExact=True,
        mpsRngInherited=saved['rng'].get('mps') is not None,device=str(target),torch=torch.__version__,numpy=np.__version__)

def update(model,optimizer,scheduler,rows,target,dropout,u,config):
    result=science_update(model,optimizer,scheduler,rows,target,dropout,u,config)
    synchronize(target);return result

def resource():return mac_platform.resource(WORK)
def resource_bad(value,paused=False):return mac_platform.resource_bad(value,read(WORK/'MAC_RUNTIME.json'),paused)

def snapshot(model,optimizer,scheduler,sampler,dropout,u,config,contract,diagnostics):
    assert sampler.cursor==u*32
    target=next(model.parameters()).device;synchronize(target)
    return dict(model=cpu_tree(model.state_dict()),optimizer=cpu_tree(optimizer.state_dict()),
        scheduler=copy.deepcopy(scheduler.state_dict()),sampler=copy.deepcopy(sampler.state_dict()),
        dropoutRng=dropout.getstate(),rng=rng_state(target),updates=u,global_step=241899+u,cumulativeSamples=1935189+u*32,
        config=config,contractSha256=contract,baseCheckpointSha256='338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b',
        source4500CheckpointSha256=read(WORK/'MAC_RUNTIME.json')['originalCheckpointSha256'],
        branchId=read(WORK/'MAC_RUNTIME.json')['branchId'],engineeringOnly=False,pendingAccumulatedGradients=False,
        recoveryAllowed=True,diagnostics=copy.deepcopy(diagnostics),
        runtime=dict(device=str(target),torch=torch.__version__,numpy=np.__version__,threads=torch.get_num_threads()))
