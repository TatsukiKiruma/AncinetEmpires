"""固定已取回分支、三个开发候选和后继验收日程，不访问封存原态。"""
import json
from pathlib import Path
from context import HERE, S3, ROOT, BASE, DATA, core, read, sha, save_new, now


def main():
    original_contract = core.validate()
    assert not DATA.exists(), '版本化验收目录已存在，禁止覆盖'
    for path in [S3/'FINAL_CANDIDATE_LOCK.json', S3/'TEST_INITIAL_MANIFEST.json',
                 BASE/'FINAL_TEST_ATTEMPT.json', BASE/'run-v2-batch8/FINAL_TEST_ATTEMPT.json']:
        assert not path.exists(), '最终验收已开始或已锁定：' + str(path)
    pointer = read(S3/'macbook_air_v1/RETURN_LATEST.json')
    returned = Path(pointer['local'])
    assert sha(pointer['receipt']) == pointer['receiptSha256']
    receipt = read(pointer['receipt'])
    assert receipt['passed'] and receipt['updates'] == 100000 and not receipt['stage3FinalAcceptanceComplete']
    source = returned/'mac-snapshot/work/training'
    diagnostics = read(source/'DIAGNOSTICS.json')
    available = {row['update']: row for row in diagnostics}
    config = read(S3/'CONFIG.json')
    points = list(config['candidateUpdates'])
    feasible = [row for row in diagnostics if not row['degraded']]
    additional = min(feasible or diagnostics, key=lambda row: (row['newDev']['policyNll'], row['newDev']['brier']))['update']
    if additional not in points:
        points.append(additional)
    assert points == [40000, 100000, 80000] and len(points) <= 3
    models = {}
    for update in points:
        diagnostic = available[update]
        checkpoint = dict(diagnostic['checkpoint'])
        checkpoint['file'] = str(source/Path(checkpoint['file']).name)
        prefix = source/Path(diagnostic['prefix']).name
        assert sha(checkpoint['file']) == checkpoint['sha256']
        offline = source/('offline-' + str(update).zfill(6))/'RESULT.json'
        result = read(offline)
        assert result['samples'] == 1299 and not result.get('sealed', False)
        assert result['modelSha256'] == sha(prefix.with_suffix('.bin'))
        models[str(update)] = dict(update=update, prefix=str(prefix), checkpoint=checkpoint, offline=str(offline),
                                  identities={str(file): sha(file) for file in [Path(checkpoint['file']), prefix.with_suffix('.bin'), prefix.with_suffix('.json'), offline]})
    candidates = dict(schema='stage3-mac-return-candidates-v1', created=now(), updates=points,
                      models=models, additionalOfflineBest=additional, priorScales=[.3,1.], maxDistinctWeights=3,
                      method='预定40k/100k，加最多一个未退化且new/dev NLL最优点；Brier破同分',
                      selection='优先完整自然覆盖，再按2P/3P/4P等权归一排名、独胜、新dev NLL、旧dev Brier、更新号、先验排序',
                      sealedAccessed=False, sourceReturnReceipt=pointer['receipt'], sourceReturnReceiptSha256=pointer['receiptSha256'])
    save_new(S3/'DEV_CANDIDATES.json', candidates)
    DATA.mkdir(parents=True, exist_ok=False)
    baseline = BASE/'run-v2-batch8/dev-baseline'
    for file, record in read(S3/'BASELINE_REUSE.json')['files'].items():
        assert sha(file) == sha(record['source']) == record['sha256']
    baseline_identity = {str(baseline/name): sha(baseline/name) for name in ['SUMMARY.json','RESULTS.json']}
    assert read(baseline/'SUMMARY.json')['attempted'] == 54
    assert read(baseline/'SUMMARY.json')['panelSha256'] == sha(S3/'OMNI_ARENA_DEV_PANEL.json')
    base_prefix=ROOT/'ai_training/phone_2m_continue414_20261027/completion/job/output/final'
    assert read(baseline/'SUMMARY.json')['modelSha256'] == sha(base_prefix.with_suffix('.bin'))
    plan = dict(schema='stage3-post-mac-acceptance-v1', created=now(), data=str(DATA), sourceReturn=str(returned),
                originalScienceContractSha256=original_contract,
                sourceReturnReceiptSha256=pointer['receiptSha256'], sourceTraining=str(source),
                baselineDev=str(baseline/'SUMMARY.json'), baselineDevIdentities=baseline_identity,
                baselinePrefix=str(ROOT/'ai_training/phone_2m_continue414_20261027/completion/job/output/final'),
                fixedCandidateUpdates=points, fixedPriorScales=[.3,1.], developmentJobs=6,
                developmentConcurrency=3, finalPairedConcurrency=2,
                historicalGames=40, sealedOfflineParents=329, sealedArenaPerModel=54,
                singleSealedAttempt=True, rawTestAccessBeforeLock=0, testForwardsBeforeLock=0,
                publicSourceEdits=False, trainingUpdatesAuthorized=0, stage4=False, uiDeployment=False)
    plan['sourceMacContractSha256'] = sha(returned/'mac-snapshot/work/MAC_CONTRACT.json')
    save_new(HERE/'PLAN.json', plan)
    save_new(DATA/'PLAN.json', plan)
    historical = read(S3/'HISTORICAL_PRESERVATION.json')['files']
    changed = [file for file,digest in historical.items() if sha(ROOT/file) != digest]
    assert not changed, changed
    save_new(DATA/'HISTORICAL_PRESERVATION_BEFORE.json',dict(files=len(historical),changed=changed,passed=True))
    paths = list(HERE.glob('*.py')) + list(HERE.glob('*.ts')) + [HERE/'PLAN.json', S3/'DEV_CANDIDATES.json']
    contract = dict(schema='stage3-post-mac-acceptance-contract-v1', created=now(),
                    files={str(file.relative_to(ROOT)).replace('\\','/'):sha(file) for file in sorted(paths)},
                    originalScienceContractSha256=original_contract,
                    noNewTraining=True, uniqueSealedAttempt=True,
                    unchangedRulesAndInference=True, baselineDevIdentities=baseline_identity)
    save_new(HERE/'ACCEPTANCE_CONTRACT.json',contract)
    print(json.dumps(dict(prepared=True,updates=points,additionalOfflineBest=additional,data=str(DATA),contractSha256=sha(HERE/'ACCEPTANCE_CONTRACT.json'))))


if __name__ == '__main__':
    main()
