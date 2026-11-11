"""只有完整且身份匹配的阶段5.4全部门禁通过，才替换本地联赛冠军。"""
import shutil
from run_league import DIR, ROOT, read, save, sha, verify_runtime_contract
from phase54_paths import audit_directory

REQUIRED_GATES = {
    'pure41Plus','pureRetainsGen3','pureImprovesChampion','pureNoRegression',
    'searchNoRegression','searchMatchesEveryPurePanel','search42Plus','search43Plus',
    'queueBelowPoint5ms','queueBelow1ms','retaliationComplete100','engineering60',
    'zeroDecisionTimeouts','zeroOpponentTimeouts','zeroErrorsOrWallStops',
    'value16Slices','triRuntime89','allAttemptsStrict','devPolicyAudit',
    'preserved','protectedEntrypointsUnchanged','sameExecutionContract','runtimeIdentity',
    'complete112Search','trainingEvaluationIsolation','comboRegressions','publicChecks',
    'deepSearchContract','exactRetaliationOrder','evaluatedQueueAndNeuralRecruitment',
}


def promote(generation=3):
    audit = audit_directory(DIR); protocol = read(audit / 'protocol.json'); summary = read(audit / 'promotion-gates.json')
    assert generation == protocol['candidateGeneration'] == summary['generation']
    verify_runtime_contract()
    freeze = read(audit / 'runtime-freeze.json')
    assert all(sha(ROOT / p) == h for p,h in {**freeze['runtime'],**freeze['harness']}.items())
    model = DIR / (protocol['candidateModel']+'.bin')
    assert summary['protocolSha256'] == sha(audit / 'protocol.json') and summary['modelSha256'] == protocol['candidateSha256'] == sha(model)
    assert REQUIRED_GATES.issubset(summary['gates']), '晋升门禁缺项，拒绝宽松替换冠军'
    qualified = all(value is True for value in summary['gates'].values())
    state = read(DIR / 'league-state.json')
    record = dict(phase='5.4',runtimeRevision=protocol['runtimeRevision'],generation=generation,comparedChampionGeneration=0,promoted=qualified,gates=summary['gates'],gateSummarySha256=sha(audit / 'promotion-gates.json'),modelSha256=sha(model),pureWins=summary['pureWins'],searchWins=summary['searchWins'])
    save(audit / 'promotion.json',record)
    if qualified:
        # 晋升仅更新本地模型注册和冠军副本；应用入口由后续部署任务处理。
        state.update(championGeneration=generation,championModelPath=protocol['candidateModel'],championSha256=sha(model),championCalibrationPath=f'generations/gen_{generation:02d}',championSearchArena=(audit / 'candidate-search-arena').relative_to(DIR).as_posix(),championRuntimeRevision=protocol['runtimeRevision'])
        entry = dict(generation=generation,modelPath=protocol['candidateModel'],sha256=sha(model),calibrationPath=f'generations/gen_{generation:02d}',runtimeRevision=protocol['runtimeRevision'])
        if not any(e.get('sha256') == entry['sha256'] and e.get('runtimeRevision') == entry['runtimeRevision'] for e in state['hallOfFame']): state['hallOfFame'].append(entry)
        for suffix in ['json','bin']:
            destination = DIR / ('dual-v2-champion.'+suffix)
            temporary = destination.with_suffix(destination.suffix+'.phase54.tmp')
            # 通过新文件原子替换，避免历史模型可能存在的硬链接被原位覆盖。
            shutil.copyfile(DIR / (protocol['candidateModel']+'.'+suffix),temporary)
            temporary.replace(destination)
        state['promotionHistory'].append(record)
        save(DIR / 'league-state.json',state)
        assert sha(DIR / 'dual-v2-champion.bin') == sha(model)
    return record
