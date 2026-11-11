"""单线程离线前向诊断，不更新参数、不生成新对局或训练回执。"""
import collections
import importlib.util
import json
import math
from pathlib import Path
import statistics
import struct
import sys
import torch
from torch.nn import functional as F

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT/'execution_v5'))
spec=importlib.util.spec_from_file_location('frozen_training_audit',ROOT/'execution_v5/train.py')
training=importlib.util.module_from_spec(spec)
spec.loader.exec_module(training)
torch.set_num_threads(1)
torch.set_num_interop_threads(1)
torch.use_deterministic_algorithms(True)
records=json.loads((HERE/'probes-v2.json').read_text(encoding='utf-8'))['records']
samples=[]
with (HERE/'probes-v2.frames').open('rb') as f:
    while header:=f.read(8):
        ms,ps=struct.unpack('<II',header)
        samples.extend(training.decode(json.loads(f.read(ms)),f.read(ps)))
assert len(samples)==len(records)
output=dict(qualification='120个确定性诊断前态，来自24局已消费的训练或开发轨迹；不是新独立实战验证。',models={})


def mean(rows,key):
    return statistics.fmean(r[key] for r in rows) if rows else None


for name in ('pretrain_full','v5_gen_01','v5_gen_02'):
    model=training.load_initial(ROOT/f'training/{name}/model')
    model.eval()
    rows=[]
    with torch.no_grad():
        for s,record in zip(samples,records):
            x=training.collate([s]);out=training.forward_batch(model,x)
            score=out['logits'][0]+torch.tensor(s['source']['prior'])
            target=x['target'][0]
            ce=F.cross_entropy(score[None],target[None]).item()
            ce_no_prior=F.cross_entropy(out['logits'],target[None]).item()
            entropy=None
            if st:=s['source'].get('searchTarget'):
                indices=torch.tensor([r['index'] for r in st]);p=torch.tensor([r['score'] for r in st]).div(.5).softmax(0)
                entropy=-(p*p.log()).sum().item()
                ce=-(p*score[indices].log_softmax(0)).sum().item()
                ce_no_prior=-(p*out['logits'][0,indices].log_softmax(0)).sum().item()
            value_nll=-(x['valueTarget'][0]*out['valueLogits'][0].log_softmax(-1)).sum().item()
            brier=(out['valueProbs'][0]-x['valueTarget'][0]).square().sum().item()
            probs=out['valueProbs'][0];vp=(probs*x['valueTarget'][0]).sum().item()
            # 本探针均为双人无联盟；逐条校验标签与行动方视角一致。
            if record['valueMask']:
                assert abs(sum(record['target'])-1)<1e-6
                assert bool(record['target'][0]>.5)==record['winning']
            logits=out['logits'][0].detach().tolist()
            rows.append(dict(**record,policyCE=ce,policyCEWithoutPrior=ce_no_prior,targetEntropy=entropy,
                top1Correct=int(score.argmax().item()==target.item()),top1Action=record['actionCodes'][score.argmax().item()],
                policyLogitSpan=max(logits)-min(logits),valueNLL=value_nll,brier=brier,
                winnerProbability=vp,currentProbability=probs[0].item(),
                valueCorrect=int(probs.argmax().item()==x['valueTarget'][0].argmax().item()),
                valueSaturated=int(max(probs).item()>.999),
                valueLogitSpan=(out['valueLogits'][0,x['active'][0]].max()-out['valueLogits'][0,x['active'][0]].min()).item()))
    groups={}
    for group in sorted(set(r['group'] for r in rows)):
        a=[r for r in rows if r['group']==group];v=[r for r in a if r['valueMask']];p=[r for r in a if r['policyMask']]
        groups[group]=dict(n=len(a),policyN=len(p),valueN=len(v),policyCE=mean(p,'policyCE'),
            policyCEWithoutPrior=mean(p,'policyCEWithoutPrior'),policyTop1=mean(p,'top1Correct'),
            policyLogitSpan=mean(a,'policyLogitSpan'),priorSpan=statistics.fmean(r['priorMax']-r['priorMin'] for r in a),
            valueNLL=mean(v,'valueNLL'),brier=mean(v,'brier'),valueAccuracy=mean(v,'valueCorrect'),
            winnerProbability=mean(v,'winnerProbability'),valueSaturated=mean(v,'valueSaturated'),valueLogitSpan=mean(a,'valueLogitSpan'))
    output['models'][name]=dict(groups=groups,rows=rows)
    print(json.dumps(dict(model=name,groups=groups),ensure_ascii=False),flush=True)
(HERE/'model-probes.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
