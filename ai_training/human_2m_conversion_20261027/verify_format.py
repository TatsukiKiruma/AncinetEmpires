"""只做张量读取及冻结2M模型前向检查，不构建优化器或执行游戏。"""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import torch
from reader import read_frames

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[1]
REFERENCE=ROOT/'ai_training/phone_2m_continue1000_20261025'
sys.path.insert(0,str(REFERENCE))
from model import DualStreamModel
from batch_model import collate, forward_batch

torch.set_num_threads(2)
checkpoint=REFERENCE/'completion/job/output/checkpoint-0.pt'
expected='258feaa0505ba88a1fc950542bdee61a6f97678b2429b52634fccb6b90d523cb'
assert hashlib.sha256(checkpoint.read_bytes()).hexdigest()==expected
saved=torch.load(checkpoint,map_location='cpu',weights_only=False)
model=DualStreamModel(seed=20261024).accurate_reductions(False)
model.load_state_dict(saved['model']);model.eval()
assert sum(p.numel() for p in model.parameters())==1966910
rows=0;samples={};distribution={}
for name,purpose in [('train-admitted.frames.gz','train'),('inspection.frames.gz','inspect')]:
    file=OUT/name
    if not file.exists():continue
    count=0
    for row in read_frames(file,purpose):
        for k,v in row.items():
            if isinstance(v,torch.Tensor) and v.is_floating_point():assert torch.isfinite(v).all(),k
        assert len(row['source']['prior'])==len(row['pointers'])
        key=(purpose,row['source']['parentId'])
        if key not in samples and (purpose=='train' or sum(k[0]=='inspect' for k in samples)<16):samples[key]=row
        count+=1
    distribution[name]=count;rows+=count
checks=[]
with torch.inference_mode():
    for key,row in samples.items():
        a=model(row);b=forward_batch(model,collate([row]))
        logits_error=float((a['logits']-b['logits'][0]).abs().max())
        value_error=float((a['valueProbs']-b['valueProbs'][0]).abs().max())
        assert torch.isfinite(b['logits']).all() and torch.isfinite(b['valueProbs']).all()
        assert torch.allclose(a['logits'],b['logits'][0],atol=5e-4,rtol=5e-5)
        assert value_error<5e-5
        checks.append({'purpose':key[0],'sourceId':key[1],'candidates':len(row['pointers']),'entities':len(row['entities']),
          'logitsMaxAbsDifference':logits_error,'valueMaxAbsDifference':value_error})
assert all(p.grad is None for p in model.parameters())
isolation_checks={}
for filename,purpose in [('inspection.frames.gz','train'),('train-admitted.frames.gz','dev')]:
    try:
        next(read_frames(OUT/filename,purpose))
    except ValueError:
        isolation_checks[filename+'->'+purpose]=True
    else:
        raise AssertionError('读取器未拒绝用途不匹配的样本')
result={'passed':True,'frameRowsRead':rows,'files':distribution,'forwardComparisons':checks,
 'isolationChecks':isolation_checks,
 'checkpointSha256':expected,'parameters':1966910,'optimizerCreated':False,'optimizerUpdates':0,
 'gameActionsExecuted':0,'newReplayValidation':False,'qualification':'格式、数值和同冻结模型单样本/批前向检查，不是重放验收或棋力评估。'}
(OUT/'FORMAT_VERIFICATION.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'passed':True,'rows':rows,'forwardSamples':len(checks)}))
