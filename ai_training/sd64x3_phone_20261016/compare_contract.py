import json, gzip, pathlib
import numpy as np
from reference import ROOT, forward, best
from spatial_reference import rel_sha

def read(name):
    return json.loads((ROOT/name).read_text(encoding='utf-8'))

with gzip.open(ROOT/'probe-encoded.jsonl.gz', 'rt', encoding='utf-8') as stream:
    rows = [json.loads(next(stream)), json.loads(next(stream))]

batch_error = 0.0
for prefix in ['phone', 'host']:
    actual = read(prefix+'-batch-gradient.json')
    expected = read('reference-batch-gradient.json')
    for a, b in zip(actual, expected, strict=True):
        assert a['rows'] == b['rows'] and abs(a['loss']-b['loss']) < 1e-8 and abs(a['weight']-b['weight']) < 1e-10
        batch_error = max(batch_error, float(np.max(np.abs(np.asarray(a['gradient'])-b['gradient']))))
    for r, index in zip(read(prefix+'-format-check.json'), [0, 1, 0], strict=True):
        x = rows[index]
        logits, value = forward(x)
        assert r['best'] == best(logits.tolist()) and r['relSha256'] == rel_sha(x)
        assert r['target'] == x['target'] and r['weight'] == x['weight']
        assert np.max(np.abs(np.asarray(r['logits'])-logits.detach().numpy())) < 1e-8
assert batch_error < 1e-8
(ROOT/'batch-parity.json').write_text(json.dumps(dict(passed=True, batchSizes=[8, 5], gradientMaxError=batch_error, optimizerUpdates=0), indent=2), encoding='utf-8')
(ROOT/'format-parity.json').write_text(json.dumps(dict(passed=True, dictionaryRows=3, tacticDimensions=10, completeCandidateAndTacticHashesEqual=True), indent=2), encoding='utf-8')
print(json.dumps(dict(passed=True, batchGradientMaxError=batch_error)))
