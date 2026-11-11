"""完整恢复、独立日程及有界编码客户端；供后续阶段复用。"""
import hashlib
import json
import math
import pickle
import random
import queue
import struct
import subprocess
import sys
import threading
from pathlib import Path
import numpy as np
import torch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
_prior_paths = sys.path[:]
sys.path.insert(0, str(ROOT / 'ai_training/gpu'))
from common import load_model, move, sha, save, device_for, synchronize, identity
from batch_model import collate, forward_batch
from data import decode, exact, groups
from objective import loss
sys.path[:] = _prior_paths
from sampling import Sampler
from budget import BudgetExpired, stop_process_tree
from contracts import validate

BASE = ROOT / 'ai_training/phone_2m_continue414_20261027/completion/job/output/checkpoint-1.pt'
BASE_SHA = '338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b'


def tensor_digest(mapping):
    digest = hashlib.sha256()
    for name, value in sorted(mapping.items()):
        digest.update(str(name).encode())
        if isinstance(value, torch.Tensor):
            digest.update(str(value.dtype).encode())
            digest.update(str(tuple(value.shape)).encode())
            digest.update(value.detach().cpu().contiguous().numpy().tobytes())
        elif isinstance(value, dict):
            digest.update(tensor_digest(value).encode())
        else:
            digest.update(pickle.dumps(value, protocol=4))
    return digest.hexdigest()


def rng_state():
    return dict(python=random.getstate(), numpy=np.random.get_state(), torch=torch.get_rng_state(), gpu=torch.cuda.get_rng_state_all() if torch.cuda.is_available() else None)


def restore_rng(value):
    random.setstate(value['python'])
    np.random.set_state(value['numpy'])
    torch.set_rng_state(value['torch'].cpu())
    if value.get('gpu') is not None:
        torch.cuda.set_rng_state_all([v.cpu() for v in value['gpu']])


def fresh(device, peak, updates, warmup=200):
    if sha(BASE) != BASE_SHA:
        raise ValueError('2414基线检查点身份变化')
    saved = torch.load(BASE, map_location='cpu', weights_only=False)
    if saved['global_step'] != 241899 or saved['cumulativeSamples'] != 1935189:
        raise ValueError('基线训练位置不符')
    model = load_model()
    model.load_state_dict(saved['model'], strict=True)
    if tensor_digest(model.state_dict()) != saved['digests']['model'] or tensor_digest(saved['optimizer']) != saved['digests']['optimizer']:
        raise ValueError('完整恢复摘要不符')
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=peak, weight_decay=1e-4, betas=(.9, .999), eps=1e-8, foreach=False, fused=False)
    optimizer.load_state_dict(saved['optimizer'])
    optimizer_restore_digest = tensor_digest(optimizer.state_dict())
    if optimizer_restore_digest != saved['digests']['optimizer']:
        raise ValueError('GPU AdamW恢复后的完整状态摘要不符')
    if sum(v['exp_avg'].numel() for v in optimizer.state.values()) != 1966910:
        raise ValueError('AdamW状态没有覆盖完整2M参数')
    for group in optimizer.param_groups:
        group['initial_lr'] = peak
        group['lr'] = peak
    warmup = min(warmup, max(1, updates // 10))
    def factor(step):
        if step < warmup:
            return (step + 1) / warmup
        return .1 + .9 * .5 * (1 + math.cos(math.pi * min(1., (step - warmup) / max(1, updates - warmup))))
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, factor)
    restore_rng(saved['rng'])
    receipt = dict(checkpointSha256=BASE_SHA, inheritedGlobalStep=saved['global_step'], inheritedCumulativeSamples=saved['cumulativeSamples'], inheritedModelDigest=saved['digests']['model'], inheritedOptimizerDigest=saved['digests']['optimizer'], optimizerRestoreDigest=optimizer_restore_digest, oldScheduler=saved['scheduler'], oldLearningRate=saved['optimizer']['param_groups'][0]['lr'], optimizerParameters=1966910, newStageSchedule=dict(peak=peak, updates=updates, warmup=warmup, endRatio=.1), workerRngRetainedAsProvenance=len(saved['workerRngStates']), bitwiseAcrossArmAndGpu=False)
    return model, optimizer, scheduler, saved, receipt


class Encoder:
    def __init__(self, log, config=None, expected_identity=None):
        config = config or json.loads((HERE / 'STAGE2_CONFIG.json').read_text('utf-8'))
        self.identity, _ = validate(config, expected_identity=expected_identity)
        self.log = Path(log).open('ab')
        self.process = subprocess.Popen(['node', '--import', 'tsx', str(HERE / 'encode_server.ts')], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), start_new_session=sys.platform != 'win32')
        self.failed = False

    def rows(self, requests, timeout=120.):
        if timeout <= 0:
            raise BudgetExpired('编码请求无剩余预算')
        if self.failed:
            raise RuntimeError('失败的编码服务禁止复用')
        completed = queue.Queue(maxsize=1)
        def read_request():
            try:
                self.process.stdin.write((json.dumps(requests) + '\n').encode())
                self.process.stdin.flush()
                rows = []
                for _ in requests:
                    ms, bs = struct.unpack('<II', exact(self.process.stdout, 8))
                    if not 0 < ms < 2**24 or not 0 < bs < 2**29:
                        raise ValueError('编码响应长度无效')
                    meta = json.loads(exact(self.process.stdout, ms))
                    rows.extend(decode(meta, exact(self.process.stdout, bs)))
                completed.put((True, rows))
            except BaseException as error:
                completed.put((False, error))
        worker = threading.Thread(target=read_request, daemon=True, name='bounded-encoder-request')
        worker.start()
        try:
            okay, result = completed.get(timeout=timeout)
        except queue.Empty as cause:
            self.failed = True
            stop_process_tree(self.process)
            worker.join(timeout=1)
            raise BudgetExpired('编码请求超过剩余预算内期限，已回收子进程') from cause
        if not okay:
            self.failed = True
            raise result
        return result

    def close(self):
        try:
            if self.process.poll() is None:
                try:
                    self.process.stdin.close()
                    self.process.wait(timeout=.2)
                except (subprocess.TimeoutExpired, BrokenPipeError, OSError):
                    stop_process_tree(self.process)
            if self.process.returncode and not self.failed:
                raise RuntimeError('编码进程失败：' + str(self.process.returncode))
        finally:
            self.log.close()


def update(model, optimizer, scheduler, rows, device, microbatch=1):
    model.train()
    optimizer.zero_grad(set_to_none=True)
    pden = sum(float(r['weight']) * bool(r['policyMask']) for r in rows)
    vden = sum(float(r['weight']) * bool(r['valueMask']) for r in rows)
    total = 0.
    lr = optimizer.param_groups[0]['lr']
    for batch in groups(rows, microbatch):
        x = move(collate(batch), device)
        value = loss(forward_batch(model, x), x, batch, pden, vden)
        if not torch.isfinite(value):
            raise ValueError('损失不是有限值')
        value.backward()
        total += float(value.detach())
    if any(p.grad is None or not torch.isfinite(p.grad).all() for p in model.parameters()):
        raise ValueError('梯度缺失或非有限')
    norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1., error_if_nonfinite=True, foreach=False)
    optimizer.step()
    scheduler.step()
    synchronize(device)
    return dict(loss=total, gradientNorm=float(norm), learningRateUsed=lr, nextLearningRate=optimizer.param_groups[0]['lr'])
