"""父局留出集曲线：教师策略交叉熵、价值损失及相对K1的KL。"""
from collections import defaultdict
from statistics import mean
from fp32_forward import forward, torch
from common import move
from ragged_batch import collate
from train_metrics import brier_ce, subset

def validation(model, anchor, rows):
    buckets = defaultdict(lambda: defaultdict(list))
    with torch.inference_mode():
        for begin in range(0,len(rows),10):
            batch = rows[begin:begin+10]; x = move(collate(batch),'cuda')
            out = forward(model,x); ref = forward(anchor,x)
            brier,ce = brier_ce(out,x)
            for i,r in enumerate(batch):
                b = buckets[r['source']['parentId']]
                if bool(r['valueMask']): b['value_loss'].append(float((brier+ce)[i]))
                if r['source']['teacherValid']:
                    mask=torch.tensor(r['source']['teacherMask'],dtype=torch.bool,device='cuda')
                    target=torch.tensor(r['source']['teacherProb'],device='cuda')[mask];target=target/target.sum()
                    logp=out['logits'][i,:len(mask)][mask].log_softmax(-1)
                    b['policy_loss'].append(float(-(target*logp).sum()))
                    b['teacher_kl'].append(float(subset(out['logits'][i],r)))
                n=len(r['pointers'])
                if n:
                    p=ref['logits'][i,:n].log_softmax(-1);q=out['logits'][i,:n].log_softmax(-1)
                    b['kl_to_k1'].append(float((p.exp()*(p-q)).sum()))
    return {key:mean(mean(v[key]) for v in buckets.values() if v[key]) for key in ('policy_loss','value_loss','teacher_kl','kl_to_k1')}
