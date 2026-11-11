import gzip, json, pathlib, struct, hashlib
import numpy as np

ROOT = pathlib.Path(__file__).parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
references = [json.loads(line) for line in gzip.open(ROOT/'reference.jsonl.gz', 'rt')]
reference_gradient = np.load(ROOT/'reference-gradient.npy')
checks = {}
for device in ['pc', 'phone']:
    payload = (ROOT/f'{device}-verify-0.bin').read_bytes()
    offset = 0
    errors, values = [], []
    def read(fmt):
        global offset
        result = struct.unpack_from(fmt, payload, offset)
        offset += struct.calcsize(fmt)
        return result[0] if len(result) == 1 else result
    for expected in references:
        n = read('>i')
        assert n == len(expected['logits'])
        logits = np.asarray(read('>'+'d'*n)).reshape(-1)
        value = read('>d')
        best = read('>i')
        assert best == expected['best']
        errors.append(float(np.max(np.abs(logits - expected['logits']))))
        values.append(abs(value - expected['value']))
    loss = read('>d')
    gradient = np.asarray(read('>'+'d'*len(reference_gradient)))
    gradient_error = float(np.max(np.abs(gradient-reference_gradient)))
    assert offset == len(payload)
    ref_report = json.loads((ROOT/'reference-report.json').read_text())
    assert abs(loss-ref_report['loss']) < 1e-8
    assert max(errors) < 1e-8 and max(values) < 1e-8 and gradient_error < 1e-8
    checks[device] = dict(rows=len(references), candidates=sum(len(r['logits']) for r in references), logitsMaxError=max(errors), valueMaxError=max(values), gradientMaxError=gradient_error, stableArgmaxAllEqual=True)
for name in ['node-parity.json', 'browser-parity.json']:
    result = json.loads((ROOT/name).read_text(encoding='utf-8'))
    assert result['rows'] == 2400 and result['stableArgmaxAllEqual']
    if name.startswith('browser'):
        assert result['browserPassed']
    checks[name] = result
source_paths = [p for p in ROOT.rglob('*') if p.suffix in ['.py', '.ts', '.mjs', '.java']]
source_paths += list((ROOT.parents[1]/'src/ai_runtime/sd_v1').glob('*.ts'))
source_paths += [p for p in (ROOT.parents[1]/'src/game').rglob('*.ts') if not p.name.endswith('.test.ts')]
identity = {str(p.resolve()): sha(p) for p in source_paths}
bindings = {name: sha(ROOT/name) for name in ['trial.bin.gz', 'schema.json', 'initial.json', 'trainer.dex', 'dataset-manifest.json', 'reference-report.json', 'node-parity.json', 'browser-parity.json', 'pc-verify-0.bin', 'phone-verify-0.bin']}
result = dict(passed=True, scope='2400条训练内试训样本；非全量模型适配或独立棋力验收', trialGzipSha256=bindings['trial.bin.gz'], tolerance=1e-8, checks=checks, artifactBindings=bindings, sourceBindings=identity, optimizer=dict(type='SGD', batch=8, steps=300, learningRate=0.02, gradientNormClip=1, valueHeadFrozen=True, order='serialized-source-order', seed=61016))
(ROOT/'GATE.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(passed=True, checks=checks), ensure_ascii=True))
