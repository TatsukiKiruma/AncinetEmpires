"""只在手机做运行时、完整模型前反向与累积归一化检查；优化器更新为零。"""
import gzip
import json
import math
from pathlib import Path
import platform
import struct
import time
import torch
from torch.nn import functional as F
from model import DualStreamModel
from batch_model import collate,forward_batch
from train_phone import samples,atomic,sha

if platform.machine()!='aarch64':raise RuntimeError('检查只允许手机ARM64')
torch.set_num_threads(4);torch.set_num_interop_threads(1);torch.manual_seed(20261024)
root=Path('/work');report=json.loads((root/'PROBE_DATASET.json').read_text());row=next(samples(report,0,set()))
model=DualStreamModel(seed=20261024).accurate_reductions(False)
count=sum(p.numel() for p in model.parameters());trainable=sum(p.numel() for p in model.parameters() if p.requires_grad)
assert count==trainable==1966910
start=time.monotonic();out=forward_batch(model,collate([row]));forward=time.monotonic()-start
prior=torch.tensor(row['source']['prior'])[None];target=row['policyTarget'].long()
loss=F.cross_entropy(out['logits']+prior,target)-(row['valueTarget']*out['valueLogits'].log_softmax(-1)).sum()+(out['valueProbs']-row['valueTarget']).square().sum()
assert torch.isfinite(loss) and all(torch.isfinite(v).all() for v in out.values())
start=time.monotonic();loss.backward();backward=time.monotonic()-start
assert all(torch.isfinite(p.grad).all() for p in model.parameters() if p.grad is not None)
# 不满batch且Policy/Value有效标签数不同，微批累积必须等于整批目标。
p=torch.tensor([.3,-.2],requires_grad=True);weights=torch.tensor([1.,2.,1.]);pm=torch.tensor([1.,0.,1.]);vm=torch.tensor([0.,1.,1.]);features=torch.tensor([[1.,2.],[3.,-1.],[.5,.7]])
pol=(features@p).square();val=(features@p-1).square();objective=(pol*weights*pm).sum()/(weights*pm).sum()+(val*weights*vm).sum()/(weights*vm).sum();objective.backward();reference=p.grad.clone();p.grad=None
for i in range(3):
    z=(features[i]@p);micro=z.square()*weights[i]*pm[i]/(weights*pm).sum()+(z-1).square()*weights[i]*vm[i]/(weights*vm).sum();micro.backward()
error=float((p.grad-reference).abs().max());assert error<2e-6
result={'passed':True,'parameters':count,'trainableParameters':trainable,'torch':torch.__version__,'machine':platform.machine(),'sampleShape':{k:list(row[k].shape) for k in ['spatial','entities','relations','players','pointers']},
        'allCandidatesPreserved':len(row['pointers']),'loss':float(loss.detach()),'finiteForwardAndGradients':True,'gradientAccumulationMaxError':error,'forwardSeconds':forward,'backwardSeconds':backward,'optimizerUpdates':0}
atomic(root/'PROBE_REPORT.json',result);print(json.dumps(result),flush=True)
