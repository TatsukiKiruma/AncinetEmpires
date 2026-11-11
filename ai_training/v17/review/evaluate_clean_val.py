"""固定冠军 final 的离线重验：重复加权原验证、唯一输入、未见输入分别计数。"""
from pathlib import Path
from collections import defaultdict
import json
import sys
import torch

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'python'))
from verify_parity import load_spatial_model_from_json, pool_coords_batch
torch.set_num_threads(2)
RUN=ROOT/'v16/out/v16_20260926_core'
HERE=Path(__file__).parent
train_keys={json.loads(line)['key'] for line in (HERE/'train_input_index.jsonl').open(encoding='utf-8')}
val_index=[json.loads(line) for line in (HERE/'val_input_index.jsonl').open(encoding='utf-8')]
checkpoint=RUN/'experiments/P1/s2026/P1_final.json'
model=load_spatial_model_from_json(str(checkpoint));model.eval()
stats=defaultdict(lambda:{'rows':0,'correct':0})
seen=set()
with torch.inference_mode(), (RUN/'T16-04/dataset_v16_val.jsonl').open(encoding='utf-8') as handle:
    for i,line in enumerate(handle):
        r=json.loads(line); key=val_index[i]['key']; assert r['sampleId']==val_index[i]['sampleId']
        z=model.forward_trunk(torch.tensor(r['spatialTensor'],dtype=torch.float32).reshape(1,26,20,20))
        c=r['candidateActions']; glob=torch.tensor(r['globalFeatures'],dtype=torch.float32)
        feat=torch.cat([*[pool_coords_batch(z[0],[a.get(k) for a in c]) for k in ['actorCoord','landingCoord','targetCoord']],
                        torch.tensor([a['semantics'] for a in c],dtype=torch.float32),glob.unsqueeze(0).expand(len(c),-1)],dim=1)
        if model.global_policy_pool: feat=torch.cat([feat,z.mean(dim=(2,3)).expand(len(c),-1)],dim=1)
        pred=model.forward_action_logits(feat.unsqueeze(0)).argmax().item()
        correct=int(c[pred]['actionCode']==r['l1ActionCode'])
        buckets=['all_rows','seen_train_rows' if key in train_keys else 'unseen_train_rows']
        if key not in seen: buckets+=['unique_inputs','unique_seen' if key in train_keys else 'unique_unseen']
        for b in buckets: stats[b]['rows']+=1;stats[b]['correct']+=correct
        seen.add(key)
for s in stats.values():s['accuracy']=s['correct']/s['rows']
result={'checkpoint':str(checkpoint.relative_to(ROOT)),'target':'L1','stats':dict(stats),
        'scope':'Python正式模型及公共坐标池化；固定final不是历史best-val；未见子集仍来自已用于开发的验证轨迹，不能冒充全新测试集。'}
(HERE/'clean_val.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=True))
