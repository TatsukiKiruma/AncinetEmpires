import pathlib, json, hashlib, collections, shutil
ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parent.parent
OLD = ROOT.parent/'sd32_phone_20261016'
def read(name): return json.loads((ROOT/name).read_text(encoding='utf-8'))
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

old_manifest=json.loads((OLD/'DELIVERY_MANIFEST.json').read_text(encoding='utf-8'))
old_bindings={a['path']:a['sha256'] for a in old_manifest['artifacts']}
for name in ['selection.json','config.json','schema.json','data-audit.json']:assert sha(OLD/name)==old_bindings[name],name
selection = read('selection.json')
assert sha(ROOT/'selection.json') == sha(OLD/'selection.json')
assert len(selection['parents']) == 900 and len({p['parentId'] for p in selection['parents']}) == 900
assert selection['splits']['train']['parents'] == 720 and selection['splits']['validation']['parents'] == 180
assert len(read('initial.json')) == 64582 and read('schema.json')['policyHiddenLayers'] == [64, 64, 64]
assert read('preregistration.json')['initialSha256'] == sha(ROOT/'initial.json')
kinds = {p['planKind'] for p in selection['parents']}
assert {p['planKind'] for p in selection['parents'] if p['split']=='train'} == kinds
assert len(kinds) == 7 and {p['planKind'] for p in selection['parents'] if p['split']=='validation'} == kinds
files = json.loads((OLD/'config.json').read_text(encoding='utf-8'))['files']
old_by_segment = {pathlib.Path(f['path']).name.replace('.dict.gz',''): f for f in files}
receipts = []
for parent in selection['parents']:
    for entry in parent['segments']:
        assert entry['actualBucket']['configuredPlayerCount'] == 2 and entry['actualBucket']['configMode'] == 'SD'
        if not entry['policyLabelEligible'] or not entry['admittedAtoms']: continue
        name = entry['segmentId']
        receipt = read('tactics/'+name+'.tac.gz.json')
        base = old_by_segment[name]
        assert base['parent']==parent['parentId'] and base['split']==parent['split']
        assert receipt['parent'] == parent['parentId'] and receipt['split'] == parent['split']
        assert receipt['rows'] == entry['admittedAtoms'] == base['rows'] and abs(receipt['weight']-entry['admittedMacros']) < 1e-7
        assert receipt['sourceSha256'] == entry['shardSha256'] and receipt['sha256'] == sha(ROOT/'tactics'/f'{name}.tac.gz')
        assert base['sha256'] == sha(OLD/base['path'])
        base['tacticSha256'] = receipt['sha256']; receipts.append(receipt)
assert len(receipts) == len(files) == 900
assert sum(f['rows'] for f in files if f['split']=='train') == 249317
assert sum(f['rows'] for f in files if f['split']=='validation') == 63096
orders = [sorted([f['path'] for f in files if f['split']=='train'], key=lambda n: hashlib.sha256(f'64x3:64390016:{epoch}:{n}'.encode()).hexdigest()) for epoch in range(1,4)]
config = dict(files=files, orders=orders, learningRate=.005, batch=8, parents=900, trainParents=720, validationParents=180, trainDevice='phone', fullTrainingAuthorized=False, maximumEpochs=3, patience=2, minDelta=1e-5, dropLast=False, initialSeed=64390016)
(ROOT/'config.json').write_text(json.dumps(config,separators=(',',':')),encoding='utf-8')
audit = dict(passed=True, allSelectedQualifiedAtomsEncoded=True, rows=312413, candidates=sum(r['candidates'] for r in receipts), baseShardsReadOnly=True, receipts=receipts, selectionSha256=sha(ROOT/'selection.json'), schemaSha256=sha(ROOT/'schema.json'), oldOverlapAuditSha256=sha(OLD/'data-audit.json'), independentEvaluation=False, planKinds=sorted(kinds))
(ROOT/'data-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
checks = ['phone-parity.json','host-parity.json','browser-parity.json','reference-report.json','format-parity.json','batch-parity.json','contract-probe.json','cost-contract.json','host-early-training-rejection.json','stream-integration-check.json']
for name in checks: assert read(name)['passed'], name
for name,h in read('cost-contract.json')['bindings'].items():assert sha(ROOT/name)==h,name
for name,h in read('contract-probe.json')['bindings'].items():assert sha(REPO/name)==h,name
for name,h in read('conversion-source-bindings.json')['bindings'].items():assert sha(REPO/name)==h,name
assert not (ROOT/'typecheck.log').read_text(encoding='utf-8-sig').strip()
assert shutil.disk_usage(ROOT).free >= 12*1024**3
assert sum(f.stat().st_size for f in ROOT.rglob('*') if f.is_file()) < 512*1024**2
bindings = {name:sha(ROOT/name) for name in ['schema.json','initial.json','config.json','kernel.go','main.go','spatial.go','stream.go','lock.go']}
bindings['trainer'] = sha(ROOT/'trainer-arm64')
(ROOT/'GATE.json').write_text(json.dumps(dict(passed=True,trainDevice='phone',parents=900,fullTrainingAuthorized=False,bindings=bindings),indent=2),encoding='utf-8')
sources = list(ROOT.glob('*.ts'))+list(ROOT.glob('*.go'))+list(ROOT.glob('*.py'))+list(ROOT.glob('*.mjs'))+list((REPO/'src/game').rglob('*.ts'))+list((REPO/'src/ai_runtime/sd_v1').glob('*.ts'))
sources += [ROOT/n for n in ['PLAN.md','preregistration.json','schema.json','initial.json','config.json','GATE.json','selection.json','data-audit.json','probe-manifest.json','inventory.json','preservation-baseline.json','conversion-source-bindings.json','trainer-arm64','evaluate-windows.exe']+checks]
host = dict(passed=True,trainDevice='phone',fullTrainingAuthorized=False,bindings={str(p.relative_to(REPO)).replace('\\','/'):sha(p) for p in sorted(set(sources))})
(ROOT/'HOST_GATE.json').write_text(json.dumps(host,indent=2),encoding='utf-8')
print(json.dumps(dict(passed=True,parents=900,rows=312413,parameters=64582,tacticBytes=sum(r['bytes'] for r in receipts))))
