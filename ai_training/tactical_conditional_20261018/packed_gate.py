"""原JSON与无损缓存两条独立collate路径必须逐张量完全相等。"""
import gzip
import json
import pickle
import torch
from train import HERE,Policy,collate,read,save

schema=read(HERE/'schema.json');initial=read(HERE/'initial.json')
parents=read(HERE/'selection.json')['parents']
raw_rows=[];packed_rows=[]
for parent in parents[::10]:
    ident=parent['parentId']
    with gzip.open(HERE/f'data-v3/{ident}.jsonl.gz','rt',encoding='utf-8') as stream:original=[json.loads(line) for line in stream]
    with (HERE/f'packed/{ident}.pkl').open('rb') as stream:packed=pickle.load(stream)
    assert len(original)==len(packed['rows'])
    for index in sorted(set([0,len(original)//2,len(original)-1])):
        p=packed['rows'][index];p['_token_table']=packed['tokenTable']
        assert original[index]['codes']==p['codes'] and original[index]['target']==p['target'] and original[index]['weight']==p['weight']
        raw_rows.append(original[index]);packed_rows.append(p)
model=Policy(schema,initial)
maximum=0.
for offset in range(0,len(raw_rows),8):
    a=collate(raw_rows[offset:offset+8],schema);b=collate(packed_rows[offset:offset+8],schema)
    for key in ('tokens','candidates','groups','refs','mask','token_mask','target_group','recruit_mask','target','weight'):
        assert torch.equal(a[key],b[key]),key
    with torch.no_grad():
        x,v,_=model(a);y,w,_=model(b)
        maximum=max(maximum,float((x[a['mask']]-y[b['mask']]).abs().max()),float((v-w).abs().max()))
assert maximum==0
save('packed-gate.json',dict(passed=True,rows=len(raw_rows),allTensorsBitwiseEqual=True,maximumForwardError=maximum,optimizerUpdates=0))
print(json.dumps(read(HERE/'packed-gate.json')))
