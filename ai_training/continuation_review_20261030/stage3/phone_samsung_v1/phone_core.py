"""手机本地身份、完整恢复、原子持久化、权威编码及资源保护。"""
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import pickle
import queue
import random
import struct
import subprocess
import threading
import time
import uuid
import numpy as np
import torch
from model import DualStreamModel
from data import decode,exact
from math_core import update

WORK=Path(os.environ.get('OMNI_WORK','/work'))
OUT=WORK/'training'

def read(path):return json.loads(Path(path).read_text('utf-8'))
def sha(path):
    with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def sync_directory(path):
    descriptor=os.open(str(path),os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(descriptor)
    finally:os.close(descriptor)
def atomic(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    pending=path.with_name('.'+path.name+'.'+uuid.uuid4().hex+'.pending')
    with pending.open('w',encoding='utf-8') as f:
        json.dump(value,f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
    os.replace(pending,path)
    sync_directory(path.parent)

def tensor_digest(mapping):
    digest=hashlib.sha256()
    for name,value in sorted(mapping.items()):
        digest.update(str(name).encode())
        if isinstance(value,torch.Tensor):
            digest.update(str(value.dtype).encode());digest.update(str(tuple(value.shape)).encode())
            digest.update(value.detach().cpu().contiguous().numpy().tobytes())
        elif isinstance(value,dict):digest.update(tensor_digest(value).encode())
        else:digest.update(pickle.dumps(value,protocol=4))
    return digest.hexdigest()

def validate():
    manifest=read(WORK/'MOBILE_CONTRACT.json')
    for name,digest in manifest['files'].items():
        if sha(WORK/name)!=digest:raise ValueError('手机冻结文件身份变化：'+name)
    verification=read(WORK/'INPUTS_VERIFIED.json')
    if not verification['passed'] or verification['payloadManifestSha256']!=manifest['payloadManifestSha256']:
        raise ValueError('手机完整输入尚未通过校验')
    return sha(WORK/'MOBILE_CONTRACT.json')

def rng_state():
    return dict(python=random.getstate(),numpy=np.random.get_state(),torch=torch.get_rng_state(),gpu=None)

def restore_rng(value):
    random.setstate(value['python']);np.random.set_state(value['numpy']);torch.set_rng_state(value['torch'].cpu())

def instantiate(saved,config):
    torch.set_num_threads(read(WORK/'PHONE_RUNTIME.json')['cpuThreads'])
    torch.use_deterministic_algorithms(True)
    model=DualStreamModel(seed=config['seed']).accurate_reductions(False)
    assert sum(p.numel() for p in model.parameters() if p.requires_grad)==1966910
    model.load_state_dict(saved['model'],strict=True)
    optimizer=torch.optim.AdamW(model.parameters(),lr=config['peakLearningRate'],weight_decay=config['weightDecay'],betas=(.9,.999),eps=1e-8,foreach=False,fused=False)
    def factor(step):
        u=min(config['updates'],step+1)
        if u<=config['warmupUpdates']:return u/config['warmupUpdates']
        t=(u-config['warmupUpdates'])/(config['updates']-config['warmupUpdates'])
        end=config['endLearningRate']/config['peakLearningRate']
        return end+(1-end)*.5*(1+math.cos(math.pi*t))
    scheduler=torch.optim.lr_scheduler.LambdaLR(optimizer,factor)
    optimizer.load_state_dict(saved['optimizer']);scheduler.load_state_dict(saved['scheduler'])
    assert tensor_digest(model.state_dict())==tensor_digest(saved['model'])
    restored=optimizer.state_dict()
    assert tensor_digest(restored['state'])==tensor_digest(saved['optimizer']['state'])
    assert sum(v['exp_avg'].numel() for v in optimizer.state.values())==1966910
    for actual,expected in zip(restored['param_groups'],saved['optimizer']['param_groups']):
        for key in ['lr','betas','eps','weight_decay','params']:
            assert actual[key]==expected[key],key
    restore_rng(saved['rng'])
    assert torch.equal(torch.get_rng_state(),saved['rng']['torch'].cpu())
    return model,optimizer,scheduler,dict(modelExact=True,adamWMomentsAndStepsExact=True,
        fullOptimizerDigestExact=tensor_digest(restored)==tensor_digest(saved['optimizer']),
        cpuRngBytesExact=True,inheritedGpuRngPreservedAsProvenance=True,torch=torch.__version__,numpy=np.__version__)

class Encoder:
    def __init__(self,folder):
        self.log=(Path(folder)/'encoder.stderr.log').open('ab')
        self.process=subprocess.Popen([str(WORK/'node/bin/node'),'--openssl-legacy-provider',str(WORK/'encoder.bundle.mjs')],cwd=WORK,
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.log,start_new_session=True)
        self.failed=False

    def rows(self,requests,timeout=300.):
        result=queue.Queue(maxsize=1)
        def receive():
            try:
                self.process.stdin.write((json.dumps(requests)+'\n').encode());self.process.stdin.flush()
                rows=[]
                for _ in requests:
                    ms,bs=struct.unpack('<II',exact(self.process.stdout,8))
                    if not 0<ms<2**24 or not 0<bs<2**29:raise ValueError('编码长度不合法')
                    meta=json.loads(exact(self.process.stdout,ms));rows.extend(decode(meta,exact(self.process.stdout,bs)))
                for row in rows:
                    row['source']['candidateCount']=len(row['pointers'])
                    if len(row['pointers'])==1:row['policyMask']=torch.tensor(False)
                result.put((True,rows))
            except BaseException as error:result.put((False,error))
        worker=threading.Thread(target=receive,daemon=True);worker.start()
        try:okay,value=result.get(timeout=timeout)
        except queue.Empty as error:
            self.failed=True;self.process.kill();self.process.wait(timeout=5)
            raise TimeoutError('手机本地编码超时，禁止跳过该批') from error
        if not okay:self.failed=True;raise value
        return value

    def close(self):
        if self.process.poll() is None:
            try:self.process.stdin.close();self.process.wait(timeout=3)
            except (subprocess.TimeoutExpired,BrokenPipeError,OSError):self.process.kill();self.process.wait(timeout=5)
        self.log.close()

def resource():
    base=Path('/sys/class/power_supply/battery')
    temperature=float((base/'temp').read_text().strip())/10
    battery=float((base/'capacity').read_text().strip())
    fs=os.statvfs(WORK)
    if not 0<temperature<100 or not 0<=battery<=100:raise ValueError('资源传感器读数无效')
    return dict(valid=True,epoch=time.time(),temperatureC=temperature,batteryPercent=battery,
        chargingStatus=(base/'status').read_text().strip(),freeBytes=fs.f_bavail*fs.f_frsize)

def resource_bad(value,paused=False):
    runtime=read(WORK/'PHONE_RUNTIME.json')
    if paused:return not(value['temperatureC']<=runtime['temperatureResumeC'] and value['batteryPercent']>=runtime['batteryResume'] and value['freeBytes']>=runtime['freeSpaceResumeBytes'])
    return value['temperatureC']>=runtime['temperaturePauseC'] or value['batteryPercent']<runtime['batteryPause'] or value['freeBytes']<runtime['freeSpacePauseBytes']

def snapshot(model,optimizer,scheduler,sampler,dropout,u,config,contract,diagnostics):
    assert sampler.cursor==u*32
    return dict(model=copy.deepcopy(model.state_dict()),optimizer=copy.deepcopy(optimizer.state_dict()),
        scheduler=copy.deepcopy(scheduler.state_dict()),sampler=copy.deepcopy(sampler.state_dict()),
        dropoutRng=dropout.getstate(),rng=rng_state(),updates=u,global_step=241899+u,cumulativeSamples=1935189+u*32,
        config=config,contractSha256=contract,baseCheckpointSha256='338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b',
        inheritedGpuRngSourceSha256=read(WORK/'PHONE_RUNTIME.json')['originalCheckpointSha256'],
        engineeringOnly=False,pendingAccumulatedGradients=False,recoveryAllowed=True,diagnostics=copy.deepcopy(diagnostics),
        runtime=dict(device='cpu',torch=torch.__version__,numpy=np.__version__,threads=torch.get_num_threads()))

class Checkpoints:
    def __init__(self):
        self.generation=0
        self.parent_sha=read(WORK/'PHONE_RUNTIME.json')['originalCheckpointSha256']
        if (OUT/'LATEST.json').exists():
            previous=read(OUT/'LATEST.json');self.generation=previous.get('generation',0);self.parent_sha=previous['sha256']
    def save(self,state,reason,permanent=False):
        self.generation+=1
        name=f'checkpoint-{state["updates"]:06d}-{uuid.uuid4().hex}.pt' if permanent else f'recovery-{self.generation%2}.pt'
        path=OUT/name;pending=path.with_name('.'+path.name+'.pending')
        value=dict(state,reason=reason,generation=self.generation,parentCheckpointSha256=self.parent_sha)
        with pending.open('wb') as stream:torch.save(value,stream);stream.flush();os.fsync(stream.fileno())
        os.replace(pending,path)
        sync_directory(path.parent)
        pointer=dict(file=name,sha256=sha(path),updates=state['updates'],samples=state['sampler']['cursor'],
            generation=self.generation,reason=reason,permanent=permanent,wallEpoch=time.time())
        atomic(OUT/'LATEST.json',pointer)
        self.parent_sha=pointer['sha256']
        with (OUT/'CHECKPOINT_JOURNAL.jsonl').open('a',encoding='utf-8') as log:log.write(json.dumps(pointer)+'\n');log.flush();os.fsync(log.fileno())
        return pointer
