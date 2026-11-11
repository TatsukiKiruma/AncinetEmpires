import json,gzip,torch
from reference import ROOT,w,forward,VW
with gzip.open(ROOT/'probe-encoded.jsonl.gz','rt',encoding='utf-8') as stream: rows=[json.loads(next(stream)),json.loads(next(stream))]
checks=[]
for count in [8,5]:
    w.grad=None;loss=0;weight=0
    for i in range(count):
        x=rows[i%2];logits,_=forward(x);loss+=(torch.logsumexp(logits,0)-logits[x['target']])*x['weight'];weight+=x['weight']
    loss.backward();gradient=w.grad.detach().tolist();assert all(g==0 for g in gradient[VW:])
    checks.append(dict(rows=count,loss=loss.item(),weight=weight,gradient=gradient))
(ROOT/'reference-batch-gradient.json').write_text(json.dumps(checks),encoding='utf-8')
print('只读batch8/末批5梯度参照完成；未执行优化器更新')
