import pathlib, json, datetime, hashlib, time
ROOT=pathlib.Path(__file__).resolve().parent
REPO=ROOT.parent.parent
started=json.loads((ROOT/'conversion-processes.json').read_text())['started']
stamp=datetime.datetime.fromisoformat(started.replace('Z','+00:00')).timestamp()
paths=[p for p in (REPO/'src').rglob('*.ts') if not p.name.endswith('.test.ts')]
paths += [ROOT/'convert.ts',ROOT/'tactics.ts',ROOT.parent/'data_acceptance_20261016/phone/compact_reader.ts']
late=[str(p.relative_to(REPO)) for p in paths if p.stat().st_mtime>stamp+1]
assert not late, late
bindings={str(p.relative_to(REPO)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}
result=dict(passed=True,recordedAt=time.time(),conversionStartedAt=started,snapshotTakenAfterLaunch=True,allSourceModificationTimesBeforeLaunch=True,bindings=bindings)
(ROOT/'conversion-source-bindings.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(dict(passed=True,files=len(bindings),snapshotTakenAfterLaunch=True)))
