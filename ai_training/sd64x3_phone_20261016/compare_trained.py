import gzip, json, numpy as np, hashlib
from reference import ROOT

def rows(name):
    with gzip.open(ROOT/name,'rt',encoding='utf-8') as stream: return [json.loads(s) for s in stream]

expected = rows('trained-reference.jsonl.gz')
checks = []
for prefix in ['trained-phone','trained-host']:
    actual = rows(prefix+'-reference.jsonl.gz')
    assert len(actual) == len(expected) == 128
    error = value_error = 0.0
    for a,b in zip(actual,expected,strict=True):
        assert a['best'] == b['best'] and len(a['logits']) == len(b['logits'])
        error = max(error,float(np.max(np.abs(np.asarray(a['logits'])-b['logits']))))
        value_error = max(value_error,abs(a['value']-b['value']))
    assert error < 1e-8 and value_error < 1e-8
    checks.append(dict(prefix=prefix,logitsMaxError=error,valueMaxError=value_error,stableArgmaxAllEqual=True))
candidate = json.loads((ROOT/'candidate.json').read_text(encoding='utf-8'))
initial = json.loads((ROOT/'initial.json').read_text(encoding='utf-8'))
assert candidate['weights'][-261:] == initial[-261:]
result = dict(passed=True,rows=128,checks=checks,valueHeadUnchanged=True,optimizerUpdates=0,candidateSha256=hashlib.sha256((ROOT/'candidate.json').read_bytes()).hexdigest())
(ROOT/'trained-device-parity.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
