"""只求离线诊断梯度，不调用优化器，不更新或导出模型。"""
import importlib.util
import json
import math
from pathlib import Path
import statistics
import struct
import torch
from torch.nn import functional as F

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
spec=importlib.util.spec_from_file_location('frozen_training_gradient_audit',ROOT/'execution_v5/train.py')
t=importlib.util.module_from_spec(spec)
spec.loader.exec_module(t)
torch.set_num_threads(1)
torch.set_num_interop_threads(1)
records=json.loads((HERE/'probes-v2.json').read_text(encoding='utf-8'))['records']
samples=[]
with (HERE/'probes-v2.frames').open('rb') as f:
    while header:=f.read(8):
        ms,ps=struct.unpack('<II',header)
        samples.extend(t.decode(json.loads(f.read(ms)),f.read(ps)))
chosen=[]
for group in sorted(set(r['group'] for r in records if not r['group'].startswith('development'))):
    for winning in (False,True):
        choices=[i for i,r in enumerate(records) if r['group']==group and r['policyMask'] and r['valueMask'] and r['winning']==winning and r['step']>0]
        if choices:chosen.append(choices[len(choices)//2])
result={}
for name in ('pretrain_full','v5_gen_01','v5_gen_02'):
    model=t.load_initial(ROOT/f'training/{name}/model')
    model.eval()
    parameters=list(model.parameters())
    rows=[]
    for i in chosen:
        s=samples[i];x=t.collate([s]);o=t.forward_batch(model,x)
        score=o['logits'][0]+torch.tensor(s['source']['prior'])
        ce=F.cross_entropy(score[None],x['target'])
        if target:=s['source'].get('searchTarget'):
            indices=torch.tensor([q['index'] for q in target]);p=torch.tensor([q['score'] for q in target]).div(.5).softmax(0)
            ce=-(p*score[indices].log_softmax(0)).sum()
        policy=ce*x['weight'][0]*x['quality'][0]*s['source']['parentPolicyScale']
        value=(-(x['valueTarget']*o['valueLogits'].log_softmax(-1)).sum()+(o['valueProbs']-x['valueTarget']).square().sum())*s['source']['parentValueScale']
        pg=torch.autograd.grad(policy,parameters,retain_graph=True,allow_unused=True)
        vg=torch.autograd.grad(value,parameters,allow_unused=True)
        pnorm=math.sqrt(sum(float(g.square().sum()) for g in pg if g is not None))
        vnorm=math.sqrt(sum(float(g.square().sum()) for g in vg if g is not None))
        dot=sum(float(a.mul(b).sum()) for a,b in zip(pg,vg) if a is not None and b is not None)
        rows.append(dict(id=records[i]['id'],group=records[i]['group'],source=records[i]['source'],winning=records[i]['winning'],policyLoss=policy.item(),valueLoss=value.item(),policyGradientNorm=pnorm,valueGradientNorm=vnorm,cosine=dot/max(1e-30,pnorm*vnorm)))
    result[name]=dict(n=len(rows),policyGradientMedian=statistics.median(r['policyGradientNorm'] for r in rows),valueGradientMedian=statistics.median(r['valueGradientNorm'] for r in rows),conflicting=sum(r['cosine']<0 for r in rows),rows=rows)
    print(json.dumps(dict(model=name,**{k:v for k,v in result[name].items() if k!='rows'})),flush=True)
(HERE/'gradient-probes.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
