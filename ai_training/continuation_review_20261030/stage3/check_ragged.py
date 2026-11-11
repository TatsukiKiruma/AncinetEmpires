"""异尺寸真实微批与原始网络梯度对照及吞吐；此入口不执行优化更新。"""
import json
import time
from core import HERE,STAGE1,DATA,legacy,torch,Encoder,read,save,fresh,reference_gradients as gradients,objective
from sampler import OmniSampler
import ragged_batch

torch.set_num_threads(2)
device=legacy.device_for('cuda:0')
config=read(HERE/'CONFIG.json')
manifest=read(STAGE1/'PARTITIONS.json')
encoder=Encoder(DATA/'ragged-encoder.stderr.log')
try:
    rows=encoder.rows(OmniSampler(manifest).effective_batch())
finally:
    encoder.close()
model,*_=fresh(device,config)
coeff=[0. if i%4==0 else .73 for i in range(32)]
native=[];max_errors={'logits':0.,'valueLogits':0.,'valueProbs':0.}
with torch.no_grad():
    for row in rows:
        native.append({k:v.cpu() for k,v in legacy.forward_batch(model,legacy.move(legacy.collate([row]),device)).items() if k in max_errors})
    for offset in range(0,32,8):
        out=ragged_batch.forward_batch(model,legacy.move(ragged_batch.collate(rows[offset:offset+8]),device))
        for i,row in enumerate(rows[offset:offset+8]):
            for k in max_errors:
                actual=out[k][i,:len(row['pointers'])].cpu() if k=='logits' else out[k][i].cpu()
                expected=native[offset+i][k][0]
                max_errors[k]=max(max_errors[k],float((actual-expected).abs().max()))
gradients(model,rows,device,coeff,32)
reference=torch.cat([p.grad.detach().flatten().cpu() for p in model.parameters()])
def ragged_gradient(micro):
    model.zero_grad(set_to_none=True)
    pden=sum(float(r['weight'])*bool(r['policyMask']) for r in rows)
    vden=sum(float(r['weight'])*bool(r['valueMask']) for r in rows)
    for offset in range(0,32,micro):
        batch=rows[offset:offset+micro]
        x=legacy.move(ragged_batch.collate(batch),device)
        objective(ragged_batch.forward_batch(model,x),x,batch,pden,vden,coeff[offset:offset+micro]).backward()
    legacy.synchronize(device)
    return torch.cat([p.grad.detach().flatten().cpu() for p in model.parameters()])
a=ragged_gradient(8)
b=ragged_gradient(32)
relative=float((a-reference).double().norm()/reference.double().norm())
micro_relative=float((a-b).double().norm()/b.double().norm())
assert relative<1e-4,(relative,max_errors)
assert micro_relative<1e-4,micro_relative
timings={}
for name,fn in [('native',lambda:gradients(model,rows,device,coeff,8)),('ragged8',lambda:ragged_gradient(8))]:
    seconds=[]
    for _ in range(3):
        t=time.perf_counter();fn();legacy.synchronize(device);seconds.append(time.perf_counter()-t)
    timings[name]=seconds
save(HERE/'RAGGED_VERIFIED.json',dict(passed=True,relativeGradientL2=relative,microVsFullRelativeL2=micro_relative,
    maxForwardErrors=max_errors,backwardSeconds=timings,optimizerUpdates=0,exactMapBoundarySemantics=True,
    cases=[dict(parentId=r['source']['parentId'],shape=list(r['spatial'].shape),candidates=len(r['pointers'])) for r in rows]))
print(json.dumps(dict(passed=True,relativeL2=relative,microL2=micro_relative,maxErrors=max_errors,timings=timings)))
