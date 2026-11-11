"""只读验证84更新安全点的模型、AdamW、日程、RNG和预取游标桥接。"""
import copy
import json
import random
from core import HERE,STAGE1,BASE_DATA,DATA,legacy,torch,read,save,validate,prior_scale
from sampler import OmniSampler

validate()
bridge=read(HERE/'PERFORMANCE_REVISION.json')
assert legacy.sha(bridge['checkpoint']['file'])==bridge['checkpoint']['sha256']
state=torch.load(bridge['checkpoint']['file'],map_location='cpu',weights_only=False)
config=read(HERE/'CONFIG.json')
assert state['config']==config
assert state['contractSha256']==bridge['oldContractSha256']
assert state['updates']==84 and state['sampler']['cursor']==2688
assert state['scheduler']['last_epoch']==84
assert abs(state['optimizer']['param_groups'][0]['lr']-8.5e-6)<1e-16
result=read(BASE_DATA/'training/RESULT.json')
assert legacy.tensor_digest(state['model'])==result['modelDigest']
assert legacy.tensor_digest(state['optimizer'])==result['optimizerDigest']
old_ledger=read(BASE_DATA/'training/ARM_BUDGET.json')
new_ledger=read(DATA/'training/ARM_BUDGET.json')
assert old_ledger==new_ledger and old_ledger['status']=='explicit_stop'
manifest=read(STAGE1/'PARTITIONS.json')
sampler=OmniSampler(manifest);sampler.load_state_dict(state['sampler'])
preview=copy.copy(sampler);preview.rng=random.Random(0);preview.load_state_dict(sampler.state_dict())
expected=preview.effective_batch()
assert sampler.cursor==2688
assert sampler.effective_batch()==expected
assert sampler.state_dict()==preview.state_dict()
save(HERE/'BRIDGE_VERIFIED.json',dict(passed=True,updates=84,samples=2688,
    modelAndAdamWDigestsExact=True,scheduleTotalUpdates=100000,nextLearningRate=8.5e-6,
    nextPriorScale=prior_scale(85),nextRequests=expected,
    previewDoesNotAdvanceCommittedCursor=True,committedResumeExact=True,
    inheritedArmId=new_ledger['armId'],inheritedChargedSeconds=new_ledger['consumedWallSeconds'],
    originalCheckpointSha256=bridge['checkpoint']['sha256'],sealedAccess=0,optimizerUpdates=0))
print(json.dumps(dict(passed=True,updates=84,schedule=100000,chargedSeconds=new_ledger['consumedWallSeconds'])))
