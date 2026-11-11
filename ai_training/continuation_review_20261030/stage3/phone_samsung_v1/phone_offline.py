"""手机固定1299态开发诊断，一次前向记录三档先验，不包含封存测试。"""
from collections import defaultdict
import json
from pathlib import Path
import time
import torch
from batch_model import collate,forward_batch
from data import groups
from phone_core import WORK,OUT,read,sha,atomic,resource,resource_bad

def summarize(rows):
    parents=defaultdict(list)
    for r in rows:parents[r['parentId']].append(r)
    keys=['policyNll','top1','valueCe','brier','valueConfidence','valueCorrect']
    means=[{k:sum(r[k] for r in a)/len(a) for k in keys} for a in parents.values()]
    selected=[r for r in rows if r['candidates']>1]
    return dict(samples=len(rows),parents=len(parents),parentEqual={k:sum(r[k] for r in means)/max(1,len(means)) for k in keys},
        effectivePolicySamples=len(selected),effectivePolicyNll=sum(r['policyNll'] for r in selected)/max(1,len(selected)))

def evaluate(model,prefix,u,stopping=lambda:False):
    destination=OUT/f'offline-{u:06d}'
    if (destination/'RESULT.json').exists():
        result=read(destination/'RESULT.json')
        if result['modelSha256']!=sha(Path(prefix).with_suffix('.bin')):raise ValueError('已保存开发诊断对应模型不符')
        return result
    if destination.exists():
        destination.rename(destination.with_name(destination.name+'-incomplete-'+str(time.time_ns())))
    destination.mkdir()
    records=[];started=time.monotonic();model.eval()
    with torch.inference_mode(),(destination/'samples.jsonl').open('x',encoding='utf-8') as log:
        for chunk in read(WORK/'dev-cache/COMPLETE.json')['chunks']:
            if sha(chunk['file'])!=chunk['sha256']:raise ValueError('开发张量摘要变化')
            rows=torch.load(chunk['file'],map_location='cpu',weights_only=False)
            for batch in groups(rows,8):
                if stopping() or (WORK/'STOP').exists():raise InterruptedError('用户暂停开发诊断')
                while resource_bad(resource()):
                    if stopping() or (WORK/'STOP').exists():raise InterruptedError('用户暂停开发诊断等待')
                    atomic(destination/'RESOURCE_WAIT.json',resource());time.sleep(20)
                x=collate(batch);out=forward_batch(model,x)
                for i,row in enumerate(batch):
                    source=row['source'];assert source['split'] in ['train','dev']
                    n=len(row['pointers']);target=int(row['policyTarget']);vtarget=x['valueTarget'][i]
                    probs=out['valueProbs'][i]
                    base=dict(source,candidates=n,valueCe=float(-(vtarget*out['valueLogits'][i].log_softmax(-1)).sum()),
                        brier=float((probs-vtarget).square().sum()),valueConfidence=float(probs.max()),valueCorrect=float(vtarget[probs.argmax()]))
                    for scale in [1.,.3,0.]:
                        policy=out['logits'][i,:n]+scale*torch.tensor(source['prior'])
                        record=dict(base,priorScale=scale,policyNll=float(-policy.log_softmax(-1)[target]),top1=int(int(policy.argmax())==target))
                        records.append(record);log.write(json.dumps(record,ensure_ascii=False)+'\n')
    assert len(records)==1299*3
    buckets=defaultdict(list)
    for r in records:
        base=f'{r["priorScale"]}/{r["corpus"]}/{r["split"]}'
        for key in [base,f'{base}/players/{r["players"]}',f'{base}/category/{r["category"]}',
            f'{base}/source/{r["source"]}',f'{base}/terrain/{r["terrainTrust"]}',
            f'{base}/cell/{r["players"]}/{r["category"]}/{r["source"]}/{r["terrainTrust"]}']:
            buckets[key].append(r)
    result=dict(update=u,samples=1299,model=str(prefix),modelSha256=sha(Path(prefix).with_suffix('.bin')),
        device='三星ARM64 CPU',torch=torch.__version__,forwardReusedAcrossPriorScales=True,sealed=False,
        seconds=time.monotonic()-started,buckets={k:summarize(v) for k,v in buckets.items()})
    atomic(destination/'RESULT.json',result);model.train();return result
