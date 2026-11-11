"""独立TS前向、padded/unpadded、有限差分及稳定argmax门禁。"""
import json
import copy
import hashlib
import math
import sys
import torch
from train import HERE, Policy, collate, objective, stable_best, choose, read, save

name = sys.argv[1] if len(sys.argv)>1 else 'initial'
model_file = read(HERE/f'model-{name}.json')
schema = model_file['schema']
model = Policy(schema,model_file['weights'],schema.get('featureMode')=='legacy')
inputs = read(HERE/'parity-inputs.json')
reference = read(HERE/f'ts-parity-{name}.json')['out']
max_logit,max_value,padded_error = 0.,0.,0.
argmax_passed = True
decoder_passed = True
torch_outputs = []
with torch.no_grad():
    padded,values,_ = model(collate(inputs,schema))
    for i,row in enumerate(inputs):
        n = len(row['codes'])
        logits,value,_ = model(collate([row],schema))
        z = logits[0,:n].tolist()
        max_logit = max(max_logit,max(abs(a-b) for a,b in zip(z,reference[i]['logits'])))
        max_value = max(max_value,abs(float(value[0])-reference[i]['value']))
        padded_error = max(padded_error,float((padded[i,:n]-logits[0,:n]).abs().max()),abs(float(values[i])-float(value[0])))
        argmax_passed &= stable_best(z) == reference[i]['best']
        decoded={d:choose(z,row['actionGroups'],d) for d in ('direct','group_mass','group_max')}
        decoder_passed &= decoded==reference[i]['decoded']
        torch_outputs.append(dict(logits=z,value=float(value[0]),best=stable_best(z),decoded=decoded))
assert max_logit < 1e-8 and max_value < 1e-8 and padded_error < 1e-8 and argmax_passed and decoder_passed
finite_difference = None
if name == 'initial':
    gradient_rows = copy.deepcopy(inputs[:3])
    for row in gradient_rows:
        row['target'] = next(i for i,key in enumerate(row['actionGroups']) if row['actionGroups'].count(key)>1)
    batch = collate(gradient_rows,schema)
    logits,_,_ = model(batch)
    loss,_ = objective(logits,batch,.5)
    loss.backward()
    gradient = model.policy.grad.clone()
    maximum = 0.
    # 每层选择非零梯度坐标，避免仅检验无效稀疏参数。
    o = model.o
    indexes = []
    for a,b in [(0,o['pw']),(o['pw'],o['w2']),(o['w2'],o['w3']),(o['w3'],o['ow']),(o['ow'],o['vw'])]:
        indexes.extend((torch.topk(gradient[a:b].abs(),4).indices+a).tolist())
    for index in torch.argsort(gradient.abs(),descending=True).tolist():
        if index not in indexes: indexes.append(index)
        if len(indexes)==32: break
    for index in indexes:
        with torch.no_grad():
            original = float(model.policy[index]); eps = 1e-6
            model.policy[index] = original+eps
            plus = float(objective(model(batch)[0],batch,.5)[0])
            model.policy[index] = original-eps
            minus = float(objective(model(batch)[0],batch,.5)[0])
            model.policy[index] = original
        maximum = max(maximum,abs((plus-minus)/(2*eps)-float(gradient[index])))
    assert maximum < 1e-6
    finite_difference = dict(coordinates=len(indexes),maxAbsoluteError=maximum,allPolicyBlocksCovered=True,nontrivialConditionalGroups=True)
save(f'numeric-gate-{name}.json',dict(passed=True,probes=len(inputs),maximumLogitError=max_logit,maximumValueError=max_value,paddedError=padded_error,stableArgmax=argmax_passed,decoderParity=decoder_passed,finiteDifference=finite_difference,optimizerUpdates=0,
    modelFileSha256=hashlib.sha256((HERE/f'model-{name}.json').read_bytes()).hexdigest(),inputFileSha256=hashlib.sha256((HERE/'parity-inputs.json').read_bytes()).hexdigest()))
save(f'python-parity-{name}.json',dict(out=torch_outputs))
print(json.dumps(read(HERE/f'numeric-gate-{name}.json')))
