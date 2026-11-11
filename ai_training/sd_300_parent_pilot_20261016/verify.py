import pathlib, json, gzip, hashlib, struct, shutil, math
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def compress():
    source = ROOT / 'trial.bin'
    with source.open('rb') as src, (ROOT / 'trial.bin.gz').open('wb') as raw:
        with gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as dest:
            shutil.copyfileobj(src, dest)
    assert hashlib.sha256(gzip.decompress((ROOT/'trial.bin.gz').read_bytes())).hexdigest() == sha(source)


def verify():
    with gzip.open(ROOT/'reference.jsonl.gz', 'rt') as f:
        refs = [json.loads(line) for line in f]
    with (ROOT/'pc-verify.bin').open('rb') as f:
        error, verror, candidates = 0., 0., 0
        for ref in refs:
            n = struct.unpack('>i', f.read(4))[0]
            assert n == len(ref['logits'])
            logits = np.frombuffer(f.read(8*n), dtype='>f8')
            value, best = struct.unpack('>di', f.read(12))
            assert best == ref['best']
            error = max(error, float(np.max(np.abs(logits-ref['logits']))))
            verror = max(verror, abs(value-ref['value']))
            candidates += n
        loss = struct.unpack('>d', f.read(8))[0]
        gradient = np.frombuffer(f.read(), dtype='>f8').astype(np.float64)
    reference = json.loads((ROOT/'reference-report.json').read_text(encoding='utf-8-sig'))
    ge = float(np.max(np.abs(gradient-np.load(ROOT/'reference-gradient.npy'))))
    assert error < 1e-8 and verror < 1e-8 and ge < 1e-8 and abs(loss-reference['loss']) < 1e-8
    report = dict(passed=True, rows=len(refs), candidates=candidates, logitsMaxError=error, valueMaxError=verror, gradientMaxError=ge, valueGradientZero=reference['valueGradientZero'])
    (ROOT/'pc-parity.json').write_text(json.dumps(report, indent=2))
    npgradient = np.load(ROOT/'reference-gradient.npy').tolist()
    (ROOT/'gradient.json').write_text(json.dumps(npgradient))
    print(json.dumps(report))


def gate():
    checks = {n: json.loads((ROOT/n).read_text(encoding='utf-8-sig')) for n in ['data-audit.json', 'reference-report.json', 'pc-parity.json', 'node-parity.json', 'browser-parity.json', 'node-gradient.json']}
    assert checks['data-audit.json']['passed'] and checks['data-audit.json']['allSelectedQualifiedAtomsEncoded']
    assert checks['browser-parity.json']['browserPassed'] and checks['pc-parity.json']['passed']
    for name in ['node-parity.json', 'browser-parity.json']:
        assert checks[name]['stableArgmaxAllEqual'] and checks[name]['logitsMaxError'] < 1e-8
    selection = json.loads((ROOT/'selection.json').read_text(encoding='utf-8-sig'))
    for epoch in range(11):
        names = [e['segmentId'] for p in selection['parents'] if p['split']=='train' for e in p['segments'] if e['policyLabelEligible'] and e['admittedAtoms']]
        names.sort(key=lambda n: hashlib.sha256(f'order:30061016:{epoch}:{n}'.encode()).hexdigest())
        (ROOT/f'train-order-{epoch}.txt').write_text('\n'.join(names)+'\n')
    names = sorted(e['segmentId'] for p in selection['parents'] if p['split']=='validation' for e in p['segments'] if e['policyLabelEligible'] and e['admittedAtoms'])
    (ROOT/'validation-order.txt').write_text('\n'.join(names)+'\n')
    files = list(ROOT.glob('*.ts')) + list(ROOT.glob('*.py')) + list(ROOT.glob('*.mjs')) + list(ROOT.glob('*.java')) + list(ROOT.glob('classes/*.class')) + list(ROOT.glob('segments/*.gz')) + list(ROOT.glob('*order*.txt'))
    files += [ROOT/n for n in ['schema.json', 'initial.json', 'selection.json', 'model-header.bin', 'witnesses.jsonl.gz', 'encoded.jsonl.gz', 'trial.bin.gz', 'PLAN.md', 'contract-tests.json', 'typecheck.log', 'overlap-detail.json', 'schema-review.json'] + list(checks)]
    # 绑定只读权威依赖与试训输入合同，避免另一会话的冻结模型行为被本轮修改。
    repo = ROOT.parent.parent
    deps = [repo/'src/ai_runtime/sd_v1/observation.ts', repo/'src/ai_runtime/sd_v1/model.ts', repo/'ai_training/data_acceptance_20261016/phone/compact_reader.ts', repo/'src/game/engine.ts', repo/'src/game/rules.ts', repo/'src/game/env.ts']
    result = dict(passed=True, phase='300父局训练/开发验证，禁止据此全量训练', fullTrainingAuthorized=False, initialSeed=30061016, batch=8, learningRate=.02, clipNorm=1, maximumEpochs=10, earlyStoppingPatience=2, minDelta=1e-5, dropLast=False, valueHeadFrozen=True, checks=checks, bindings={str(p.relative_to(repo)).replace('\\','/'):sha(p) for p in sorted(set(files+deps))})
    (ROOT/'GATE.json').write_text(json.dumps(result, ensure_ascii=False, indent=2),encoding='utf-8')
    print(json.dumps(dict(passed=True, boundFiles=len(result['bindings']), sha256=sha(ROOT/'GATE.json'))))


if __name__ == '__main__':
    import sys
    {'compress':compress, 'verify':verify, 'gate':gate}[sys.argv[1]]()
