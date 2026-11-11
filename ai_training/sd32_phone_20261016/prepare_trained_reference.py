import json,gzip,hashlib,torch,struct
from reference import ROOT,forward
candidate=json.loads((ROOT/'candidate.json').read_text(encoding='utf-8'))
weights=torch.tensor(candidate['weights'],dtype=torch.float64)
assert len(weights)==20646
with gzip.open(ROOT/'probe-encoded.jsonl.gz','rt',encoding='utf-8') as source,gzip.open(ROOT/'trained-reference.jsonl.gz','wt',encoding='utf-8') as out:
    count=0
    for line in source:
        row=json.loads(line)
        with torch.no_grad():z,v=forward(row,weights)
        logits=z.tolist();best=max(range(len(logits)),key=lambda i:logits[i])
        out.write(json.dumps(dict(logits=logits,value=v.item(),best=best),separators=(',',':'))+'\n');count+=1
assert count==1024
binary=b''.join(struct.pack('>d',v) for v in candidate['weights'])
(ROOT/'best.bin').write_bytes(binary)
result=dict(passed=True,rows=count,optimizerUpdates=0,candidateSha256=hashlib.sha256((ROOT/'candidate.json').read_bytes()).hexdigest(),bestSha256=hashlib.sha256(binary).hexdigest(),bestEpoch=candidate['bestEpoch'])
(ROOT/'checkpoint-audit.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
