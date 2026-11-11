"""阶段三共用恢复、身份和进程接口；复用权威编码与完整网络。"""
import copy
import hashlib
import importlib
import json
import math
import os
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
STAGE1 = HERE.parent / 'stage1'
ROOT = HERE.parents[2]
BASE_DATA = Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1')
DATA = BASE_DATA / 'run-v2-batch8'
for name, folder in [('MIOPEN_USER_DB_PATH', 'miopen-db'), ('MIOPEN_CUSTOM_CACHE_DIR', 'miopen-cache')]:
    os.environ.setdefault(name, str(BASE_DATA / folder))
sys.path.insert(0, str(STAGE1))
legacy = importlib.import_module('runtime')
sys.path.remove(str(STAGE1))
sys.path.insert(0, str(HERE.parent / 'stage2/runner_v4_sync1'))
control = importlib.import_module('io_control')
sys.path.remove(str(HERE.parent / 'stage2/runner_v4_sync1'))
torch = legacy.torch
from ragged_batch import collate as ragged_collate, forward_batch as ragged_forward


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


def save(path, value):
    control.json_save(path, value, control.ArmBudget(60), shutdown=True)


def validate():
    contract = read(HERE / 'SCIENCE_CONTRACT.json')
    for file, digest in contract['files'].items():
        if legacy.sha(ROOT / file) != digest:
            raise ValueError('阶段三冻结依赖身份变化：' + file)
    if legacy.sha(legacy.BASE) != legacy.BASE_SHA:
        raise ValueError('原2414检查点身份变化')
    return legacy.sha(HERE / 'SCIENCE_CONTRACT.json')


class Encoder(legacy.Encoder):
    def __init__(self, log, sealed=False):
        import subprocess
        validate()
        if sealed and not (HERE / 'FINAL_CANDIDATE_LOCK.json').exists():
            raise ValueError('候选锁定前禁止封存测试访问')
        self.log = Path(log).open('ab')
        command = ['node', '--import', 'tsx', str(HERE / 'encode_server.ts')]
        if sealed:
            command.append('--sealed')
        self.process = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=self.log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        self.failed = False

    def rows(self, requests, timeout=120.):
        rows = super().rows(requests, timeout)
        for row in rows:
            row['source']['candidateCount'] = len(row['pointers'])
            if len(row['pointers']) == 1:
                row['policyMask'] = torch.tensor(False)
        return rows


class EncoderPool:
    def __init__(self,log):
        from concurrent.futures import ThreadPoolExecutor
        self.pool=ThreadPoolExecutor(max_workers=4,thread_name_prefix='stage3-independent-encoder')
        path=Path(log)
        self.encoders=[Encoder(path.with_name(path.stem+f'-{i}'+path.suffix)) for i in range(4)]

    def rows(self,requests,timeout=120.):
        if len(requests)!=32:
            raise ValueError('并行编码池只接收完整32样本')
        jobs=[self.pool.submit(encoder.rows,requests[i*8:(i+1)*8],timeout) for i,encoder in enumerate(self.encoders)]
        return [row for job in jobs for row in job.result(timeout=timeout)]

    def close(self):
        # 结束时未消费预取不计暴露；先回收所有编码子进程，再等待只读线程退出。
        for encoder in self.encoders:
            encoder.failed=True
            legacy.stop_process_tree(encoder.process)
        self.pool.shutdown(wait=True,cancel_futures=True)
        for encoder in self.encoders:
            encoder.close()


def fresh(device, config):
    model, optimizer, _, inherited, receipt = legacy.fresh(device, config['peakLearningRate'], config['updates'], config['warmupUpdates'])
    def factor(step):
        u = min(config['updates'], step + 1)
        if u <= config['warmupUpdates']:
            return u / config['warmupUpdates']
        t = (u - config['warmupUpdates']) / (config['updates'] - config['warmupUpdates'])
        end = config['endLearningRate'] / config['peakLearningRate']
        return end + (1 - end) * .5 * (1 + math.cos(math.pi * t))
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, factor)
    receipt['newStageSchedule'] = {k: config[k] for k in ['peakLearningRate', 'endLearningRate', 'updates', 'warmupUpdates']}
    return model, optimizer, scheduler, inherited, receipt


def prior_scale(update, total=100000):
    return .30 + .70 * .5 * (1 + math.cos(math.pi * (update - 1) / (total - 1)))


def objective(out, x, rows, pden, vden, coefficients):
    prior = torch.zeros_like(out['logits'])
    for i, row in enumerate(rows):
        prior[i, :len(row['pointers'])] = torch.as_tensor(row['source']['prior'], device=prior.device) * coefficients[i]
    pm = torch.tensor([bool(r['policyMask']) and len(r['pointers']) > 1 for r in rows], device=prior.device)
    policy = (torch.nn.functional.cross_entropy(out['logits'] + prior, x['target'], reduction='none') * x['weight'] * pm).sum() / max(pden, 1)
    ce = -(x['valueTarget'] * out['valueLogits'].log_softmax(-1)).sum(-1)
    brier = (out['valueProbs'] - x['valueTarget']).square().sum(-1)
    return policy + ((ce + brier) * x['weight'] * x['valueMask']).sum() / max(vden, 1)


def reference_gradients(model, rows, device, coefficients, microbatch=8):
    model.zero_grad(set_to_none=True)
    pden = sum(float(r['weight']) * (bool(r['policyMask']) and len(r['pointers']) > 1) for r in rows)
    vden = sum(float(r['weight']) * bool(r['valueMask']) for r in rows)
    total, forwards = 0., 0
    for offset in range(0, len(rows), microbatch):
        # 地图不能补零改变全局池化含义；逻辑微批内按原尺寸分组。
        by_shape = {}
        for i in range(offset, min(offset + microbatch, len(rows))):
            by_shape.setdefault(tuple(rows[i]['spatial'].shape), []).append(i)
        for indices in by_shape.values():
            batch = [rows[i] for i in indices]
            x = legacy.move(legacy.collate(batch), device)
            value = objective(legacy.forward_batch(model, x), x, batch, pden, vden, [coefficients[i] for i in indices])
            if not torch.isfinite(value):
                raise ValueError('训练损失非有限')
            value.backward()
            total += float(value.detach())
            forwards += 1
    if any(p.grad is None or not torch.isfinite(p.grad).all() for p in model.parameters()):
        raise ValueError('梯度缺失或非有限')
    return dict(loss=total, policyDenominator=pden, valueDenominator=vden, physicalForwards=forwards,
                forcedPolicyMasked=sum(len(r['pointers']) == 1 for r in rows))


def gradients(model,rows,device,coefficients,microbatch=8):
    model.zero_grad(set_to_none=True)
    pden=sum(float(r['weight'])*(bool(r['policyMask']) and len(r['pointers'])>1) for r in rows)
    vden=sum(float(r['weight'])*bool(r['valueMask']) for r in rows)
    total,forwards=0.,0
    for offset in range(0,len(rows),microbatch):
        batch=rows[offset:offset+microbatch]
        x=legacy.move(ragged_collate(batch),device)
        value=objective(ragged_forward(model,x),x,batch,pden,vden,coefficients[offset:offset+microbatch])
        if not torch.isfinite(value):
            raise ValueError('异尺寸整微批损失非有限')
        value.backward();total+=float(value.detach());forwards+=1
    if any(p.grad is None or not torch.isfinite(p.grad).all() for p in model.parameters()):
        raise ValueError('异尺寸整微批梯度缺失或非有限')
    return dict(loss=total,policyDenominator=pden,valueDenominator=vden,physicalForwards=forwards,
        forcedPolicyMasked=sum(len(r['pointers'])==1 for r in rows))


def update(model, optimizer, scheduler, rows, device, dropout_rng, u, config):
    model.train()
    scale = prior_scale(u, config['updates'])
    coefficients = [0. if dropout_rng.random() < .25 else scale for _ in rows]
    metrics = gradients(model, rows, device, coefficients)
    norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1., error_if_nonfinite=True, foreach=False)
    lr = optimizer.param_groups[0]['lr']
    optimizer.step()
    scheduler.step()
    legacy.synchronize(device)
    return dict(metrics, gradientNorm=float(norm), clipped=float(norm) > 1, learningRateUsed=lr,
                priorScale=scale, priorDropped=sum(c == 0 for c in coefficients))
