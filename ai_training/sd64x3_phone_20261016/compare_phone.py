import json,gzip,pathlib,sys,numpy as np
ROOT=pathlib.Path(__file__).resolve().parent
def lines(n):
    with gzip.open(ROOT/n,'rt',encoding='utf-8') as stream:return [json.loads(line) for line in stream]
prefix=sys.argv[1] if len(sys.argv)>1 else 'phone'
assert prefix in ['phone','host']
expected=lines('reference.jsonl.gz');actual=lines(prefix+'-reference.jsonl.gz')
assert len(expected)==len(actual)==128
logit_error=value_error=0.;candidates=0
for a,b in zip(actual,expected,strict=True):
    assert a['best']==b['best'] and a['relSha256']==b['relSha256']
    assert len(a['logits'])==len(b['logits'])
    logit_error=max(logit_error,max(abs(x-y) for x,y in zip(a['logits'],b['logits'],strict=True)))
    value_error=max(value_error,abs(a['value']-b['value']));candidates+=len(a['logits'])
gradient=json.loads((ROOT/(prefix+'-gradient.json')).read_text(encoding='utf-8'))
reference=json.loads((ROOT/'reference-report.json').read_text(encoding='utf-8'))
ge=float(np.max(np.abs(np.asarray(gradient['gradient'])-np.asarray(json.loads((ROOT/'reference-gradient.json').read_text(encoding='utf-8'))))))
assert logit_error<1e-8 and value_error<1e-8 and ge<1e-8 and abs(gradient['loss']-reference['loss'])<1e-8
result=dict(passed=True,rows=128,candidates=candidates,logitsMaxError=logit_error,valueMaxError=value_error,gradientMaxError=ge,allSpatialFloat32HashesEqual=True,stableArgmaxAllEqual=True,optimizerUpdates=0)
(ROOT/(prefix+'-parity.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
