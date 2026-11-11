"""整改证据与旧版保留的静态闭环；不重新计算GPU或实战。"""
import json
from contracts import HERE, ROOT, validate, file_sha

load = lambda p: json.loads(p.read_text('utf-8-sig'))
v1 = HERE / 'revisions/review1/v1'
snapshot = load(v1 / 'SNAPSHOT.json')
assert file_sha(v1 / 'EVIDENCE_MANIFEST.json') == snapshot['evidenceSha256']
old_sources = load(v1 / 'SOURCE_MANIFEST.json')['sources']
assert all(file_sha(v1 / 'source-root' / r['path']) == r['sha256'] for r in old_sources)
original = load(v1 / 'EVIDENCE_MANIFEST.json')['files']
protected = [r for r in original if r['path'].startswith(('arena-baseline-r2/', 'offline-baseline/')) or r['path'] in ['PARTITIONS.json', 'OFFLINE_PANEL.json', 'ARENA_PANEL.json', 'SEALED_FINAL_PANEL.json', 'ARENA_ANALYSIS.json']]
assert all(file_sha(HERE / r['path']) == r['sha256'] for r in protected)
identity, _ = validate(load(HERE / 'STAGE2_CONFIG.json'))
arms = []
for path in sorted((HERE / 'stage2-configs').glob('*.json')):
    actual, _ = validate(load(path))
    assert actual == identity
    arms.append(path.name)
assert len(arms) == 3
cases = load(HERE / 'REVIEW_LIGHT_CASES.json')['cases']
assert cases['R1/resume_budget']['additionalModelInitializations'] == cases['R1/resume_budget']['additionalSyntheticUpdates'] == 0
assert cases['R1/encoder_timeout']['savedCursor'] == 8
assert cases['R1/half_batch']['savedCursor'] == cases['R1/half_batch']['savedModel'] == 0
assert not cases['R1/half_batch']['recoveryAllowed']
assert cases['R1/real_process_timeout']['childReaped'] and cases['R1/real_encoder_timeout']['childReaped']
assert cases['R3/incomplete_natural']['fullPanelScoreChange'] is None and not cases['R3/incomplete_natural']['promotionReviewEligible']
entries = load(HERE / 'REVIEW_ENTRY_CHECKS.json')
assert len(entries['checks']) == 6 and all(r['passed'] for r in entries['checks'])
assert entries['scienceContractSha256'] == identity['scienceContractSha256']
assert load(HERE / 'REVIEW_ARENA_CONTRACTS.json')['stableArgmaxEquivalenceCases'] == 6
comparison = load(HERE / 'COMPARE_V2_CLI_SELF_CHECK.json')
assert comparison['completeNaturalPanel'] and all(v['scoreChange'] == 0 for v in comparison['results'].values())
assert comparison['newGames'] == 0
test_log = (HERE / 'review-fixes-tests-final.log').read_text('utf-8')
assert 'Ran 19 tests' in test_log and test_log.rstrip().endswith('OK')
assert not (HERE / 'check-review-tsc.log').read_text('utf-8').strip()
result = dict(passed=True, respondsTo='reviews/stage1-review-1.json', R1=True, R2=True, R3=True, originalSourceSnapshotsVerified=len(old_sources), originalEvidenceSha256=snapshot['evidenceSha256'], originalProtectedArtifactsVerified=len(protected), frozenInputsAnd40GamesUnchanged=True, unitTests=19, tsInferenceEquivalenceFixtures=6, realEntryPreflightCases=6, stage2ArmPreflights=arms, executionIdentity=identity, additionalRealGpuForwardCalls=0, additionalCurrentModelOptimizerUpdates=0, additionalGames=0, cumulativeTemporaryCurrentModelUpdates=8, cumulativeDevelopmentGames=40, formalStage2Started=False)
(HERE / 'REMEDIATION_VALIDATION.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps(result, ensure_ascii=False))
