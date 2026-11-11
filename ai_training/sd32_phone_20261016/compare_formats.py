import json,gzip,pathlib
ROOT=pathlib.Path(__file__).resolve().parent
def read(n):return json.loads((ROOT/n).read_text(encoding='utf-8'))
with gzip.open(ROOT/'reference.jsonl.gz','rt',encoding='utf-8') as f: refs=[json.loads(next(f)),json.loads(next(f))]
with gzip.open(ROOT/'probe-base.jsonl.gz','rt',encoding='utf-8') as f: rows=[json.loads(next(f)),json.loads(next(f))]
batch=read('reference-batch-gradient.json'); formats={}; batches={}
for prefix in ['phone','host']:
    error=0.
    for i,a in enumerate(read(prefix+'-format-check.json')):
        b=refs[i%2];r=rows[i%2]
        assert a['best']==b['best'] and a['relSha256']==b['relSha256'] and a['target']==r['target'] and a['weight']==r['weight']
        assert len(a['logits'])==len(b['logits'])
        error=max(error,max(abs(x-y) for x,y in zip(a['logits'],b['logits'],strict=True)))
    assert len(read(prefix+'-format-check.json'))==3 and error<1e-8
    formats[prefix]=dict(rows=3,maxError=error)
    errors=[]
    for a,b in zip(read(prefix+'-batch-gradient.json'),batch,strict=True):
        assert a['rows']==b['rows'] and a['weight']==b['weight'] and abs(a['loss']-b['loss'])<1e-8
        ge=max(abs(x-y) for x,y in zip(a['gradient'],b['gradient'],strict=True));assert ge<1e-8
        errors.append(dict(rows=a['rows'],gradientMaxError=ge))
    batches[prefix]=errors
for name,checks in [('format-parity.json',formats),('batch-parity.json',batches)]:
    result=dict(passed=True,checks=checks,optimizerUpdates=0)
    (ROOT/name).write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
