import pathlib, json, hashlib, datetime, shutil

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parent.parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    selection = json.loads((ROOT/'selection.json').read_text(encoding='utf-8'))
    base = ROOT.parent/'data_acceptance_20261016'
    sealed = json.loads((base/'DELIVERY_MANIFEST.json').read_text(encoding='utf-8'))
    original = {a['path'].replace('\\','/'):a['sha256'] for a in sealed['artifacts']}
    names = set(b['path'] for b in selection['sourceBindings'])
    for parent in selection['parents']:
        for e in parent['segments']:
            names.update(['phone/'+e['receipt'], 'phone/'+e['candidateShard']])
            if e.get('valueEvidence'): names.add('phone/'+e['valueEvidence']['path'])
    checks = []
    for name in sorted(names):
        observed = sha(base/name)
        assert observed == original[name], name
        checks.append(dict(path=name,sha256=observed))
    assert sha(base/'DELIVERY_MANIFEST.json') == selection['sealedManifestSha256']
    old = ROOT.parent/'sd_adapter_trial_20261016'
    old_manifest = json.loads((old/'DELIVERY_MANIFEST.json').read_text(encoding='utf-8'))
    old_checks = []
    for artifact in old_manifest['artifacts']:
        name = artifact['path']; assert sha(old/name)==artifact['sha256'], name
        old_checks.append(dict(path=name,sha256=artifact['sha256']))
    gate = json.loads((ROOT/'GATE.json').read_text(encoding='utf-8'))
    assert all(sha(REPO/name)==h for name,h in gate['bindings'].items())
    preservation = dict(passed=True,selectedSealedSourceFiles=len(checks),oldTrialSealedFiles=len(old_checks),nativeSealSha256=selection['sealedManifestSha256'],gateSha256=sha(ROOT/'GATE.json'),selectedSources=checks,oldTrial=old_checks,scope='所选来源与封存入口、旧试训全交付清单和闸门依赖；不是对未选其余桶重新验收')
    (ROOT/'source-preservation.json').write_text(json.dumps(preservation,ensure_ascii=False,indent=2),encoding='utf-8')
    skip = {'chrome-profile','test-tmp','__pycache__'}
    artifacts = [dict(path=str(p.relative_to(ROOT)).replace('\\','/'),bytes=p.stat().st_size,sha256=sha(p)) for p in sorted(ROOT.rglob('*')) if p.is_file() and not skip.intersection(p.relative_to(ROOT).parts) and p.name!='DELIVERY_MANIFEST.json']
    result = dict(sealedAt=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),scope='仅300父局训练/开发验证；未启动全量训练，无独立棋力评测；不含Chrome/测试缓存和Python缓存',artifacts=artifacts,phaseBytes=sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file()),freeBytes=shutil.disk_usage(ROOT).free)
    assert result['phaseBytes']<512*1024**2 and result['freeBytes']>12*1024**3
    (ROOT/'DELIVERY_MANIFEST.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(passed=True,sealedFiles=len(artifacts),sourceFiles=len(checks),oldTrialFiles=len(old_checks),phaseMiB=result['phaseBytes']/1024**2,freeGiB=result['freeBytes']/1024**3)))


if __name__=='__main__':
    main()
