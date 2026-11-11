"""阶段5.4完整验收与正式晋升；未通过的门禁和历史失败均如实保存。"""
import json
import shutil
from collections import Counter
from audit_phase54 import AUDIT, collect, panels
from run_league import DIR, ROOT, read, save, sha, wins, verify_runtime_contract
from promote_phase54 import promote, REQUIRED_GATES


def preservation():
    baseline = read(AUDIT / 'historical-manifest.json'); changed = []; missing = []
    protocol = read(AUDIT / 'protocol.json')
    if protocol.get('previousEvidenceManifest'):
        baseline['files'].update(read(DIR / protocol['previousEvidenceManifest'])['files'])
    authorization = protocol.get('authorizedExternalEntrypointChanges'); exceptions = {}
    if authorization:
        assert sha(DIR / authorization['path']) == authorization['sha256'], '外部入口授权身份不符'
        receipt = read(DIR / authorization['path'])
        assert receipt['authorizedByHuman'] is True and receipt['userReply'], '外部入口变化须有用户明确授权'
        for record in receipt['records']:
            name = record['path']
            assert baseline['protected'][name] == record['originalSha256'] and record['originalReconstructedExactly'] is True
            exceptions[name] = record['observedSha256']
    # 本轮明确更新的框架及工作文档；模型、对局、训练收据和旧归档均不得改写。
    mutable = {'RUNTIME_REVISION.json','league-state.json','gate-summary.json','REPORT.md','BATTLES.md','dual-v2-champion.json','dual-v2-champion.bin','run_league.py','exclusions.ts','isolation_phase52.ts','battle.ts','engineering_gen4_phase53.ts','evaluation-exclusions.txt.gz','evaluation-exclusion-receipt.json','phase53-audit/evaluation-archives.json','src/ai_runtime/dual_v2/neural_horizon.test.ts','src/ai_runtime/dual_v2/stage54.test.ts','src/ai_runtime/dual_v2/retaliation_fairness.test.ts','src/ai_runtime/dual_v2/turn_search_ai.ts'}
    for name,identity in baseline['files'].items():
        path = ROOT / name
        if not path.exists(): missing.append(name); continue
        relative = path.relative_to(DIR).as_posix() if path.is_relative_to(DIR) else name
        # 只允许阶段根目录的当前辅助程序更新，旧归档内同名源码仍逐文件核验。
        if relative in mutable or '/' not in relative and relative.endswith('phase54.py'): continue
        if name in exceptions and sha(path) == exceptions[name]: continue
        if sha(path) != identity['sha256']: changed.append(name)
    original_protected = {name:sha(ROOT / name) == digest for name,digest in baseline['protected'].items()}
    protected = {name:sha(ROOT / name) == exceptions.get(name,digest) for name,digest in baseline['protected'].items()}
    result = dict(passed=not changed and not missing,files=len(baseline['files']),changed=changed,missing=missing,protected=protected,protectedPassed=all(protected.values()),originalProtected=original_protected,originalProtectedPassed=all(original_protected.values()),authorizedExternalBaselines=exceptions,authorization=authorization,scope='保留开工原始SHA与外部变化；有用户明确授权的入口按确认后外部基线核验，本任务继续不编辑GUI')
    save(AUDIT / 'preservation.json',result)
    return result


def pure_receipt():
    plan = read(DIR / 'generations/gen_03/arena/plan.json'); totals = Counter(); groups = {}; strict = True; actions = 0
    model_sha = sha(DIR / 'generations/gen_03/model.bin')
    for slot in plan['slots']:
        if slot['mode'] != 'pure': continue
        directory = DIR / 'generations/gen_03/arena/battles' / slot['id']
        result = read(directory / 'result.json'); receipt = read(AUDIT / 'pure-strict' / (slot['id']+'.json'))
        strict &= receipt['passed'] and receipt['actions'] == result['actions'] and receipt['logSha256'] == sha(directory / 'actions.jsonl.gz') and result['modelSha256'] == model_sha
        groups.setdefault(slot['panel'],Counter())[result['classification']] += 1; totals[result['classification']] += 1; actions += receipt['actions']
    output = dict(passed=strict and sum(totals.values()) == 56,groups=groups,outcomes=totals,actions=actions,modelSha256=model_sha,scope='原第3代纯策略56槽，当前权威引擎strict全量重放；权重、先验、编码及校准SHA不变')
    save(AUDIT / 'pure-reuse.json',output)
    return output


def main():
    verify_runtime_contract()
    champion = collect('champion-search-arena'); candidate = collect('candidate-search-arena'); engineering = collect('engineering60',engineering=True)
    assert champion['complete'] and candidate['complete'] and engineering['complete'], '完整验收结束前不得最终判定'
    pure = pure_receipt(); champion_pure = read(DIR / 'champion-pure-arena/arena-summary.json')
    baseline_counts, candidate_counts, pure_counts = panels(champion), panels(candidate), panels(pure)
    pure_wins, search_wins = sum(pure_counts.values()),sum(candidate_counts.values())
    comparison = {p:dict(championSearch=baseline_counts[p],candidatePure=pure_counts[p],candidateSearch=candidate_counts[p]) for p in pure_counts}
    counts = Counter()
    for summary in [champion,candidate,engineering]: counts.update(summary['counts'])
    stress = read(AUDIT / 'stress.json'); numeric = read(AUDIT / 'numeric-reuse.json'); selection = read(AUDIT / 'selection.json'); isolation = read(AUDIT / 'post-evaluation-isolation.json')
    preserved = preservation(); protocol = read(AUDIT / 'protocol.json'); freeze = read(AUDIT / 'runtime-freeze.json')
    queues = [s['queueLatency']['max'] or 0 for s in [champion,candidate,engineering]] + [stress['queueMax']]
    queue_max = max(queues); all_complete = counts['retaliationAttempts'] > 0 and counts['retaliationAttempts'] == counts['retaliationComplete'] and stress['allComplete']
    failures = [failure for s in [champion,candidate,engineering] for failure in s['failures']]
    old = read(AUDIT / 'v4-conclusion/gate-summary.json')
    previous = read(DIR / protocol['previousPhaseSummary']) if protocol.get('previousPhaseSummary') else read(DIR / protocol['previousPhaseRun'] / 'gate-summary.json') if protocol.get('previousPhaseRun') else None
    engineering_passed = engineering['completed'] == 60 and not engineering['failures'] and engineering['counts']['strictFailures'] == 0 and engineering['counts']['retaliationAttempts'] == engineering['counts']['retaliationComplete'] and (engineering['queueLatency']['max'] or 0) < .5
    checks = read(AUDIT / 'verification.json')
    order = read(AUDIT / 'retaliation-order-equivalence.json')
    algorithm = dict(exactRetaliationOrdering=True,executeEvaluatedFullQueue=True,rootNeuralRecruitmentPreference=True,unconstrainedNeuralPrimary=True,enemyPolicyIndependent=True,exactSparseCounterProjection=True,exactReverseGoalPaths=True)
    gates = dict(
        pure41Plus=pure_wins >= 41,
        pureRetainsGen3=all(pure_counts[p] >= minimum for p,minimum in protocol['targets']['purePanels'].items()),
        pureImprovesChampion=pure_wins > sum(wins(champion_pure,'pure',p) for p in pure_counts),
        pureNoRegression=all(pure_counts[p] >= wins(champion_pure,'pure',p) for p in pure_counts),
        searchNoRegression=all(candidate_counts[p] >= baseline_counts[p] for p in pure_counts),
        searchMatchesEveryPurePanel=all(candidate_counts[p] >= pure_counts[p] for p in pure_counts),
        search42Plus=search_wins >= 42,
        search43Plus=search_wins >= protocol['targets']['searchWins'],
        queueBelow1ms=all(s['queueLatency']['count'] > 0 for s in [champion,candidate,engineering]) and queue_max < 1,
        queueBelowPoint5ms=all(s['queueLatency']['count'] > 0 for s in [champion,candidate,engineering]) and queue_max < .5,
        retaliationComplete100=all_complete,
        engineering60=engineering_passed,
        zeroDecisionTimeouts=counts['modelTimeouts'] == 0,
        zeroOpponentTimeouts=counts['opponentTimeouts'] == 0,
        zeroErrorsOrWallStops=not failures,
        value16Slices=numeric['passed'] and numeric['valueSlices'] == 16,
        triRuntime89=numeric['passed'] and numeric['states'] == 89 and numeric['modelSha256'] == protocol['candidateSha256'],
        allAttemptsStrict=counts['strictFailures'] == counts['identityFailures'] == 0 and pure['passed'] and old['gates']['allAttemptsStrict'] and all(p['strict'] for p in stress['probes']) and (previous is None or previous['gates']['allAttemptsStrict']),
        devPolicyAudit=selection['passed'] and selection['modelSha256'] == protocol['candidateSha256'] and not selection['usesBattleResults'],
        preserved=preserved['passed'],
        protectedEntrypointsUnchanged=preserved['protectedPassed'],
        sameExecutionContract=all(s['executionContract'] == protocol['executionContract'] for s in [champion,candidate,engineering]),
        runtimeIdentity=all(sha(ROOT / p) == digest for p,digest in {**freeze['runtime'],**freeze['harness']}.items()) and freeze['protocolSha256'] == sha(AUDIT / 'protocol.json') and freeze.get('previousEvidenceManifestSha256') == sha(DIR / protocol['previousEvidenceManifest']) and freeze.get('previousPhaseSummarySha256') == sha(DIR / protocol['previousPhaseSummary']),
        complete112Search=champion['completed'] == candidate['completed'] == 56,
        trainingEvaluationIsolation=isolation['passed'],
        comboRegressions=read(AUDIT / 'combo.json')['passed'],
        publicChecks=all(checks['checks'].values()),
        deepSearchContract=protocol.get('searchOptions') == dict(budgetMs=880,maxNodes=260,maxRetaliationUnits=5,retaliationHardLimitMs=950,tierOneFraction=.42,multiplayerTotalChains=8,mandatoryCorePerEnemy=2,duelFinalists=4,multiplayerFinalists=3) and protocol.get('candidateAdmissionMinWindowMs') == 220 and protocol.get('extensionReservePerRemainingEnemyMs') == 70 and protocol['executionContract'].get('yieldBeforeDecision') is True,
        exactRetaliationOrder=order['passed'] and order['states'] >= 350 and order['initialStates'] == 60 and all(sha(ROOT / p) == digest for p,digest in order['runtime'].items()),
        evaluatedQueueAndNeuralRecruitment=protocol.get('algorithmContract') == algorithm and '--retain-maps-for-n-gc=100000' in protocol['executionContract']['nodeArgs'],
    )
    assert REQUIRED_GATES.issubset(gates)
    worst = max([s['worstQueue'] for s in [champion,candidate,engineering] if s['worstQueue']],key=lambda r:r['ms'])
    snapshot = dict(phase='5.4',generation=3,gates=gates,pureWins=pure_wins,searchWins=search_wins,panelComparison=comparison,counts=dict(counts),queueMax=queue_max,worstQueueDecision=worst,retaliationIncomplete=[p for s in [champion,candidate,engineering] for p in s['incomplete']],errorsOrWallStops=failures,modelSha256=protocol['candidateSha256'],protocolSha256=sha(AUDIT / 'protocol.json'),runtime=protocol['runtimeRevision'],executionContract=protocol['executionContract'],historicalFailuresRetained=True,numericEvidence=numeric,scope='v5双方112搜索槽、60初态工程复测及压力前态；第3代原56纯策略按SHA与strict复用；全部属于开发验收，未做独立盲测')
    save(AUDIT / 'engineering60/engineering-summary.json',dict(passed=engineering_passed,**engineering))
    save(AUDIT / 'promotion-gates.json',snapshot)
    promotion = promote(3); snapshot.update(promoted=promotion['promoted'],championGeneration=read(DIR / 'league-state.json')['championGeneration'])
    snapshot['gates'] = {**gates,'promotion':promotion['promoted']}
    save(DIR / 'gate-summary.json',snapshot); save(AUDIT / 'gate-summary.json',snapshot)
    failed = [name for name,value in snapshot['gates'].items() if not value]
    table = ['|模型|策略|面板|槽数|自然胜|自然负|自然平|动作截断|决策超时|墙钟截断|错误|','|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for label,mode,summary in [('第0代','搜索',champion),('第3代','纯策略',pure),('第3代','搜索',candidate)]:
        for panel in ['fixed','expanded','3ffa','4ffa','2v2']:
            group = summary['groups'][panel]
            values = [label,mode,panel,sum(group.values()),*[group.get(k,0) for k in ['natural_win','natural_loss','natural_draw','action_truncation','decision_timeout','wall_truncation','error']]]
            table.append('|'+'|'.join(map(str,values))+'|')
    battles = '# 阶段5.4完整战报\n\n'+'\n'.join(table)+'\n\n截断不计胜。搜索为冻结v5下的全新112槽；第3代纯策略为原56槽SHA核验及当前引擎strict复放。工程60局不计质量胜率。旧v4r4/v4r5战报和门禁保存在phase54-audit/v4-conclusion，旧逐局日志按historical-manifest.json原位封存。\n'
    (DIR / 'BATTLES.md').write_text(battles,encoding='utf-8')
    proof_root = AUDIT.relative_to(DIR).as_posix()
    report = f'''# 阶段5.4搜索修复与完整验收

第3代纯策略{pure_wins}/56，v5搜索{search_wins}/56；晋升={promotion['promoted']}，当前冠军第{snapshot['championGeneration']}代。失败项：{', '.join(failed) or '无'}。逐面板自然胜见[BATTLES.md](BATTLES.md)，机器门禁见[gate-summary.json](gate-summary.json)。

候选权重SHA为`{protocol['candidateSha256']}`。本轮直接使用已通过开发审计的第3代，不训练、不插值、不按新对局反选权重。原纯策略56槽已在当前权威引擎逐动作strict复放，网络、编码、先验、校准SHA保持；89状态三端及16切片按明确的SHA依赖证明复用，没有冒称本轮新跑Chrome。

普通单位避险仅在总分和斩将、斩杀、占城、占村均不退化时否决基准；指挥官保护保持。潜在致死威胁按联盟取前三击后取敌对联盟最大值，各敌方顺位暴露取最大值，普通暴露权重0.25。反扑单位链只展开top-1，默认单敌方最多五链、多人总计八链，给后续敌方预留各两条核心链。核心链预算不足严格判未完成；延伸链在25ms边界自适应收口并完整静态覆盖，收口次数单列为{counts['adaptiveClosures']}。累计真实/核心链为{counts['expandedChains']}/{counts['coreChains']}。主预算880ms、一级占42%、260节点、反扑根硬上限950ms；双人/多人决赛圈最多四/三案，按剩余时间均分。正常反扑仍借用220ms窗口，人为过期预算仍失败。队列哈希惰性生成，布尔合法性查询冷缓存使用定向权威动作集合。

见证地图改用完整字段比较，避免逐格JSON字符串。Node固定`{' '.join(protocol['executionContract']['nodeArgs'])}`、双lane。每局开局和根搜索动作及见证落盘后显式回收，每次决策计时前归还事件循环；这些边界在getAction计时外、整局墙钟内。计时区仍保留真实GC与调度耗时，不扣除尖峰。历史GC、JIT及布局保留诊断均已封存：布局保留12局对照的队列最大由1.3211降至0.4636ms，但两组动作/状态/RNG轨迹并非全部相同，不能用小样本诊断替代正式验收或声称普遍消除毛刺。本轮双方正式面板及60初态工程复测队列最大{queue_max:.6f}ms；反扑{counts['retaliationComplete']}/{counts['retaliationAttempts']}；模型/对手决策超时{counts['modelTimeouts']}/{counts['opponentTimeouts']}。挑战案不足220ms真实窗口不入场，共跳过{counts['budgetSkippedCandidates']}案；延伸链额外为后续每敌方保留70ms核心时间。最慢队列、全部未完成反扑与异常均完整记录，当前没有充分证据把全部尖峰归因为Minor GC。

本修订反扑首动作按直接收益与严格上界剪枝，{order['states']}个工程训练状态逐动作、直接收益及完整prior与旧全量排序等价。胜出方案完整队列执行，后续单位的战果不能只在评分中兑现。启发式挑战招募沿用根神经策略的每城堡兵种优先序，保留所有部署落点，当前不可负担时按序退选；完整神经基准与敌方反扑保持各自原选择。模型、编码、战术先验和校准不变。

本轮候选逐面板胜场为固定{candidate_counts['fixed']}、扩展{candidate_counts['expanded']}、多人{candidate_counts['multiplayer']}；对应同运行时冠军为{baseline_counts['fixed']}/{baseline_counts['expanded']}/{baseline_counts['multiplayer']}，自身纯策略为{pure_counts['fixed']}/{pure_counts['expanded']}/{pure_counts['multiplayer']}。R2候选为17/16/9、总42胜，旧完整证据保留。此轮合并了反扑提速、完整队列、招募偏好和V8参数改动，不能把热点提速或排序等价证明当作棋力提升证明，也不能从合并结果单独归因某一改动。晋升判定以逐面板战绩及全部工程门禁合取为准。

公共验证、阶段类型与Python合同检查见{proof_root}/verification.json。原APK资源缺失跳过仍单列。旧模型、训练数据、全部历史对局和失败证据保留，保护入口确认后基线检查={preserved['protectedPassed']}，开工原始SHA不变={preserved['originalProtectedPassed']}。并行新增APK困难版入口由用户明确授权保留，授权及前后SHA单独登记，本任务未修改GUI。R2完整60+112搜索42/56、队列2.2697ms、反扑65048/65051未晋升，证据不可变封存。更早失败亦保留，不用新结论覆盖。

本轮全部属于开发面板，没有操作手机、修改GUI入口、部署或进行独立最终盲测。证据新增上限预登记2GB，系统空闲下限12GiB。

用户明确要求完成当前整轮后停下并报告；本轮完成60初态工程、双方112搜索槽及收尾审计后停止，不自动启动下一轮、额外诊断对局、训练或新候选。
'''
    (DIR / 'REPORT.md').write_text(report,encoding='utf-8')
    path = ROOT / 'ai_training/status/CURRENT.md'; text = path.read_text('utf-8'); marker = '<!-- dual-stream-v2-phase54 -->'
    status = f"{marker}\n## 2026-10-22 阶段5.4\n\n第3代纯策略{pure_wins}/56，v5搜索{search_wins}/56；晋升={promotion['promoted']}，冠军第{snapshot['championGeneration']}代。失败项：{', '.join(failed) or '无'}。v5双方112搜索槽、60初态工程复测及纯策略56槽strict复核完成。见[报告](../dual_stream_v2_phase5_20261020/REPORT.md)与[战报](../dual_stream_v2_phase5_20261020/BATTLES.md)。本任务未修改GUI；并行困难版入口按用户确认的外部基线单独取证保护。\n<!-- end-dual-stream-v2-phase54 -->\n\n"
    if marker not in text: path.write_text(text.replace('# 当前接手状态','# 当前接手状态\n\n'+status,1),encoding='utf-8')
    else:
        start = text.index(marker); end = text.index('<!-- end-dual-stream-v2-phase54 -->',start)+len('<!-- end-dual-stream-v2-phase54 -->')
        path.write_text(text[:start]+status.rstrip()+text[end:],encoding='utf-8')
    assert preservation()['passed']
    save(AUDIT / 'status.json',dict(stage='promoted' if promotion['promoted'] else 'quality_unmet',promoted=promotion['promoted'],failedGates=failed,pureWins=pure_wins,searchWins=search_wins))
    print(json.dumps(dict(promoted=promotion['promoted'],pureWins=pure_wins,searchWins=search_wins,panelComparison=comparison,queueMax=queue_max,retaliationComplete=counts['retaliationComplete'],retaliationAttempts=counts['retaliationAttempts'],failedGates=failed),ensure_ascii=False))


if __name__ == '__main__': main()
