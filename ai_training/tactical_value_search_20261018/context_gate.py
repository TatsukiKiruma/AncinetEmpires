"""原始稀疏/真实无损缓存的价值独立上下文与完整策略前向一致。"""
from train import *
model=read(HERE/'initial.json');s=model['schema'];p=make_policy(s,model['weights']);raw=read(HERE/'inputs.json');packed=[];sources=[]
for path in sorted((HERE/'packed').glob('*.receipt.json')):
    receipt=read(path)
    if not receipt['valueRows']:continue
    sources.append(receipt['packedSha256'])
    for row in base.rows_for([receipt]):
        if row.get('valueMask'):packed.append(row)
        if len(packed)>=32:break
    if len(packed)>=32:break
assert packed
maximum=0.
with torch.no_grad():
    for rows in [raw,packed]:
        _,_,full=p(collate(rows,s));fast=contexts(p,token_batch(rows,s));maximum=max(maximum,float((full-fast).abs().max()))
assert maximum<1e-12
save('value-context-gate.json',dict(passed=True,maxError=maximum,rawRows=len(raw),packedRows=len(packed),sourcePackedSha256=sources));print('价值上下文门禁',maximum)
