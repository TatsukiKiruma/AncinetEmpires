"""手机实际前反向及完整断点恢复工程自检，工程权重禁止晋升。"""
import copy
import json
import random
import struct
import subprocess
import time
import torch
from phone_core import WORK,read,sha,atomic,validate,instantiate,Encoder,snapshot,tensor_digest,update
from sampler_mobile import MobileSampler
from data import decode,exact
from batch_model import collate,forward_batch
from math_core import gradients,reference_gradients

def main():
    entered=time.monotonic();contract=validate();config=read(WORK/'SCIENCE_CONFIG.json')
    folder=WORK/'engineering';folder.mkdir(exist_ok=False)
    saved=torch.load(WORK/'initial-checkpoint.pt',map_location='cpu',weights_only=False)
    model,optimizer,scheduler,receipt=instantiate(saved,config)
    sampler=MobileSampler(WORK);sampler.load_state_dict(saved['sampler'])
    requests=sampler.effective_batch()
    assert requests==read(WORK/'PROBE_REQUESTS.json')
    frames=folder/'phone.frames'
    with frames.open('wb') as out,(folder/'raw-encoder.stderr.log').open('wb') as err:
        code=subprocess.run([str(WORK/'node/bin/node'),'--openssl-legacy-provider',str(WORK/'encoder.bundle.mjs')],input=(json.dumps(requests)+'\n').encode(),
            stdout=out,stderr=err,cwd=WORK,timeout=300).returncode
    assert code==0
    reference=read(WORK/'PROBE_REFERENCE.json')
    assert sha(frames)==reference['framesSha256'],'主机与手机的权威编码字节不一致'
    rows=[]
    with frames.open('rb') as source:
        for _ in requests:
            ms,bs=struct.unpack('<II',exact(source,8));meta=json.loads(exact(source,ms));rows.extend(decode(meta,exact(source,bs)))
    for row in rows:
        if len(row['pointers'])==1:row['policyMask']=torch.tensor(False)
    errors={k:0. for k in ['logits','valueLogits','valueProbs']}
    with torch.no_grad():
        for i,row in enumerate(rows[:len(reference['outputs'])]):
            out=forward_batch(model,collate([row]))
            for key in errors:
                expected=torch.tensor(reference['outputs'][i][key])
                errors[key]=max(errors[key],float((out[key][0]-expected).abs().max()))
    assert max(errors.values())<5e-4,errors
    coeff=[0. if i%4==0 else .73 for i in range(32)]
    gradients(model,rows,torch.device('cpu'),coeff,8)
    a=torch.cat([p.grad.flatten().clone() for p in model.parameters()])
    gradients(model,rows,torch.device('cpu'),coeff,32)
    b=torch.cat([p.grad.flatten().clone() for p in model.parameters()])
    relative=float((a-b).double().norm()/b.double().norm())
    reference_gradients(model,rows,torch.device('cpu'),coeff,32)
    original=torch.cat([p.grad.flatten().clone() for p in model.parameters()])
    original_relative=float((a-original).double().norm()/original.double().norm())
    assert relative<1e-4 and original_relative<1e-4,(relative,original_relative)
    dropout=random.Random(0);dropout.setstate(saved['dropoutRng'])
    tick=time.monotonic();update(model,optimizer,scheduler,rows,torch.device('cpu'),dropout,2762,config)
    seconds=time.monotonic()-tick
    state=snapshot(model,optimizer,scheduler,sampler,dropout,2762,config,contract,[])
    state['engineeringOnly']=True;state['promotable']=False
    torch.save(state,folder/'checkpoint.pt')
    next_requests=sampler.effective_batch();encoder=Encoder(folder)
    try:next_rows=encoder.rows(next_requests)
    finally:encoder.close()
    first=update(model,optimizer,scheduler,next_rows,torch.device('cpu'),dropout,2763,config)
    expected_model=copy.deepcopy(model.state_dict());expected_optimizer=copy.deepcopy(optimizer.state_dict())
    restored=torch.load(folder/'checkpoint.pt',map_location='cpu',weights_only=False)
    model,optimizer,scheduler,_=instantiate(restored,config)
    sampler.load_state_dict(restored['sampler']);dropout.setstate(restored['dropoutRng'])
    assert sampler.effective_batch()==next_requests
    second=update(model,optimizer,scheduler,next_rows,torch.device('cpu'),dropout,2763,config)
    difference=max(float((p-expected_model[k]).abs().max()) for k,p in model.state_dict().items())
    assert difference<2e-6 and first['priorDropped']==second['priorDropped']
    result=dict(passed=True,sourceCheckpointSha256=sha(WORK/'initial-checkpoint.pt'),restore=receipt,
        hostPhoneEncoderBytesExact=True,hostPhoneForwardMaxErrors=errors,
        microVsFullRelativeL2=relative,originalNetworkRelativeL2=original_relative,
        nextUpdateResumeMaxParameterError=difference,modelBitwiseResume=tensor_digest(model.state_dict())==tensor_digest(expected_model),
        optimizerBitwiseResume=tensor_digest(optimizer.state_dict())==tensor_digest(expected_optimizer),
        engineeringUpdates=3,engineeringPromotable=False,formalUpdates=0,
        singleMeasuredUpdateSeconds=seconds,seconds=time.monotonic()-entered,sealedAccess=0)
    atomic(WORK/'PROBE_PASSED.json',result)
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':main()
