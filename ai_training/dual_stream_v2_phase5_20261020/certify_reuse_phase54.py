"""冻结第3代权重与数值管线不变时，明确绑定原有89状态三端和16切片证据。"""
from run_league import DIR, ROOT, read, save, sha

audit = DIR / 'phase54-audit'; candidate = DIR / 'generations/gen_03'
revision = read(audit / 'v4-conclusion/RUNTIME_REVISION.json')
excluded = {'turn_search_ai.ts','takeover_guard.ts','queue_state.ts','queue_dependencies.ts'}
sources = {name:digest for name,digest in revision['v4RuntimeSha256'].items() if name.rsplit('/',1)[-1] not in excluded}
assert all(sha(ROOT / name) == digest for name,digest in sources.items()), '数值或纯策略管线变化，不可复用旧收据'
manifest = read(audit / 'historical-manifest.json')['files']
artifacts = {}
for name in ['model.json','model.bin','head-calibration.json','value-config.json','value-calibration.json','tri-runtime-parity.json','model-node-parity.json','model-browser-parity.json','dev-policy-audit.json']:
    path = candidate / name; relative = path.relative_to(ROOT).as_posix()
    assert sha(path) == manifest[relative]['sha256']
    artifacts[name] = sha(path)
parity = read(candidate / 'tri-runtime-parity.json'); value = read(candidate / 'value-calibration.json')
assert parity['passed'] and parity['states'] == 89 and parity['modelSha256'] == sha(candidate / 'model.bin') and parity['chrome']['chromeProfileCleaned']
assert value['passed'] and len(value['slices']) == 16
save(audit / 'numeric-reuse.json',dict(passed=True,modelSha256=sha(candidate / 'model.bin'),states=89,valueSlices=16,artifacts=artifacts,unchangedNumericalSources=sources,authorityEquivalence='phase54-audit/read-only-engine-equivalence.json',newChromeRun=False,scope='仅复用已验证且SHA不变的网络、编码、战术先验、校准与规则数值证据；搜索行为由v5全量重测'))
print('第3代89状态三端与16切片收据身份复核通过；本轮未新跑Chrome')
