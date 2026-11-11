import pathlib,json,hashlib,math,collections
ROOT=pathlib.Path(__file__).resolve().parent
REPO=ROOT.parent.parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def read(n):return json.loads((ROOT/n).read_text(encoding='utf-8'))


def main():
    selection=read('selection.json');audit=read('data-audit.json');schema=read('schema.json')
    assert len(selection['parents'])==900 and len({p['parentId'] for p in selection['parents']})==900
    assert selection['splits']['train']['parents']==720 and selection['splits']['validation']['parents']==180
    assert selection['splits']['train']['atoms']==249317 and selection['splits']['validation']['atoms']==63096
    assert schema['hidden']==32 and schema['baseCandidateCount']==77 and len(schema['candidate']['keys'])==109
    assert len(read('initial.json'))==20646 and audit['allSelectedQualifiedAtomsEncoded'] and audit['passed']
    assert audit['overlaps']['train']['rows']==249317 and audit['overlaps']['validation']['rows']==63096
    kinds={p['planKind'] for p in selection['parents']}
    assert len(kinds)==7 and {p['planKind'] for p in selection['parents'] if p['split']=='validation'}==kinds
    source=REPO/'ai_training/data_acceptance_20261016/phone/release-2026-10-15T21-05-00-859Z/release-index.jsonl'
    original=collections.defaultdict(set)
    for line in source.read_text(encoding='utf-8').splitlines():
        e=json.loads(line);original[e['parentId']].add(e['segmentId'])
    files=[]
    for p in selection['parents']:
        assert {e['segmentId'] for e in p['segments']}==original[p['parentId']]
        for e in p['segments']:
            assert e['actualBucket']['configuredPlayerCount']==2 and e['actualBucket']['configMode']=='SD'
            if not e['policyLabelEligible'] or not e['admittedAtoms']:continue
            name='segments/'+e['segmentId']+'.dict.gz'
            files.append(dict(path=name,sha256=sha(ROOT/name),rows=e['admittedAtoms'],weight=e['admittedMacros'],split=p['split'],parent=p['parentId']))
    assert len(files)==900
    orders=[]
    for epoch in range(1,4):
        train=[f['path'] for f in files if f['split']=='train']
        train.sort(key=lambda n:hashlib.sha256(f'sd32:90061016:{epoch}:{n}'.encode()).hexdigest())
        orders.append(train)
    config=dict(files=files,orders=orders,learningRate=.005,batch=8,parents=900,trainParents=720,validationParents=180,trainDevice='phone',fullTrainingAuthorized=False,maximumEpochs=3,patience=2,minDelta=1e-5,dropLast=False,initialSeed=90061016)
    (ROOT/'config.json').write_text(json.dumps(config,separators=(',',':')),encoding='utf-8')
    checks=['phone-parity.json','host-parity.json','browser-parity.json','reference-report.json','format-parity.json','batch-parity.json']
    for name in checks:assert read(name)['passed'],name
    assert (ROOT/'typecheck.log').read_text(encoding='utf-8-sig').strip()==''
    result=dict(passed=True,parents=900,trainParents=720,validationParents=180,rows=312413,planKinds=sorted(kinds),continuationGroupsIntact=True,trainUpdatesPerEpoch=31165,lastBatch=5,fullTrainingAuthorized=False)
    (ROOT/'contract-tests.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    # 手机闸门只绑定手机实际读取的文件，电脑验收与源码另用主机闸门绑定。
    bindings={name:sha(ROOT/name) for name in ['schema.json','initial.json','config.json','kernel.go','main.go','spatial.go','stream.go']}
    bindings['trainer']=sha(ROOT/'trainer-arm64')
    phone_gate=dict(passed=True,trainDevice='phone',parents=900,fullTrainingAuthorized=False,bindings=bindings)
    (ROOT/'GATE.json').write_text(json.dumps(phone_gate,indent=2),encoding='utf-8')
    own=list(ROOT.glob('*.ts'))+list(ROOT.glob('*.go'))+list(ROOT.glob('*.py'))+list(ROOT.glob('*.mjs'))
    own += [ROOT/n for n in ['PLAN.md','schema.json','initial.json','config.json','GATE.json','selection.json','data-audit.json','probe-manifest.json','contract-tests.json','trainer-arm64','evaluate-windows.exe']+checks]
    dependencies=[REPO/'src/ai_runtime/sd_v1/observation.ts',REPO/'src/game/engine.ts',REPO/'src/game/rules.ts',REPO/'src/game/env.ts',REPO/'src/game/terrain.ts',REPO/'src/game/apk_terrain.ts',REPO/'ai_training/data_acceptance_20261016/phone/compact_reader.ts']
    host_gate=dict(passed=True,trainDevice='phone',fullTrainingAuthorized=False,checks={n:read(n) for n in checks},bindings={str(p.relative_to(REPO)).replace('\\','/'):sha(p) for p in sorted(set(own+dependencies))})
    (ROOT/'HOST_GATE.json').write_text(json.dumps(host_gate,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'payload-sha256.txt').write_text('\n'.join(f"{f['sha256']}  {f['path']}" for f in files)+'\n',encoding='ascii',newline='\n')
    print(json.dumps(dict(passed=True,parents=900,rows=312413,encodedBytes=sum((ROOT/f['path']).stat().st_size for f in files),phoneGateSha256=sha(ROOT/'GATE.json'))))


if __name__=='__main__':main()
