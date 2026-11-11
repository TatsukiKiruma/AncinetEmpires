"""第4代全部质量、工程、隔离门禁合取晋升；原始失败永久保留。"""
import gzip
import json
from collections import Counter
from run_league import DIR, ROOT, read, save, sha, promote, wins
from finish_phase53 import preservation, results


def main():
    folder = DIR / 'generations/gen_04'; current = read(folder / 'arena-summary.json')
    baseline = read(DIR / 'champion-search-arena/arena-summary.json'); pure0 = read(DIR / 'champion-pure-arena/arena-summary.json'); warm = read(DIR / 'generations/gen_03/arena-summary.json')
    panels = ['fixed','expanded','multiplayer']; counts = Counter(); worst = None; queue_max = 0.; incomplete = []; failures = []; table = []
    arms = dict(championPure=results('champion-pure-arena'),championSearch=results('champion-search-arena'),candidate=results('generations/gen_04/arena'))
    plan = read(folder / 'league-plan.json'); sampling = [(folder / 'games' / s['id'],read(folder / 'games' / s['id'] / 'result.json')) for s in plan['slots']]
    # 旧60局训练数据保持原件；新的相同初态工程复测独立计时，旧失败单列且继续纳入strict。
    original_sampling = sampling
    engineering_base = DIR / 'phase53-audit/gen4-engineering-replay'
    sampling = [(engineering_base / 'games' / s['id'],read(engineering_base / 'games' / s['id'] / 'result.json')) for s in plan['slots']]
    original_strict = all(read(d / 'strict-replay.json')['passed'] and read(d / 'strict-replay.json')['actions'] == r['actions'] for d,r in original_sampling)
    rows = [(arm,directory,result) for arm,values in arms.items() for directory,result in values] + [('selfplay',d,r) for d,r in sampling]
    for arm,directory,result in rows:
        strict = read(directory / 'strict-replay.json'); counts['strictFailures'] += not (strict['passed'] and strict['actions'] == result['actions'])
        counts['actualActions'] += strict['actions']; counts['witnessActions'] += strict.get('witnessActions',0)
        if result.get('error') or result['classification'] in ['error','wall_truncation']: failures.append(directory.relative_to(DIR).as_posix())
        if result['classification'] == 'decision_timeout':
            failed = result.get('failedDecision')
            is_model = failed['teacher'] if failed else (result['latency']['model']['max'] or 0) > 1000
            counts['modelTimeouts' if is_model else 'opponentTimeouts'] += 1
        for line in gzip.decompress((directory / 'actions.jsonl.gz').read_bytes()).splitlines():
            row = json.loads(line); telemetry = row.get('telemetry') or {}
            if telemetry.get('queued'):
                counts['queueSteps'] += 1
                if row['ms'] > queue_max:
                    queue_max = row['ms']; worst = dict(path=directory.relative_to(DIR).as_posix(),i=row['i'],ms=row['ms'],code=row['code'],beforeHash=row['beforeHash'])
            elif telemetry:
                counts['rootSteps'] += 1; counts['retaliationAttempts'] += telemetry.get('retaliationAttempts',0); counts['retaliationComplete'] += telemetry.get('retaliationComplete',0)
                if telemetry.get('retaliationAttempts',0) != telemetry.get('retaliationComplete',0): incomplete.append(dict(path=directory.relative_to(DIR).as_posix(),i=row['i'],telemetry=telemetry))
    stress = read(DIR / 'phase53-audit/retaliation-stress-node128-certified.json'); dev = read(folder / 'dev-policy-audit.json'); training = read(folder / 'training-complete.json'); value = read(folder / 'value-calibration.json'); parity = read(folder / 'tri-runtime-parity.json'); extraction = read(folder / 'extraction-summary.json'); isolation = read(folder / 'post-evaluation-isolation.json'); selected = read(folder / 'grid-selection.json')
    preserved = preservation(); prior = read(DIR / 'phase53-audit/gen3-v4r4-conclusion/gate-summary.json')
    comparison = {p:dict(championSearch=wins(baseline,'turn_search',p),warmPure=wins(warm,'pure',p),candidatePure=wins(current,'pure',p),candidateSearch=wins(current,'turn_search',p)) for p in panels}
    pure_wins = sum(wins(current,'pure',p) for p in panels); search_wins = sum(wins(current,'turn_search',p) for p in panels)
    execution = read(DIR / 'RUNTIME_REVISION.json')['executionContract']; model_sha = sha(folder / 'model.bin')
    same_execution = read(folder / 'arena/plan.json')['executionContract'] == plan['executionContract'] == read(DIR / 'champion-search-arena/plan.json')['executionContract'] == execution
    gates = dict(complete112=current['complete'] and current['completedSlots'] == 112,pureNoRegression=all(wins(current,'pure',p) >= wins(pure0,'pure',p) for p in panels),pureRetainsGen3=all(wins(current,'pure',p) >= wins(warm,'pure',p) for p in panels),pureImprovesChampion=pure_wins > sum(wins(pure0,'pure',p) for p in panels),searchNoRegression=all(wins(current,'turn_search',p) >= wins(baseline,'turn_search',p) for p in panels),searchMatchesEveryPurePanel=all(wins(current,'turn_search',p) >= wins(current,'pure',p) for p in panels),search42Plus=search_wins >= 42,queueBelow1ms=counts['queueSteps'] > 0 and max(queue_max,stress['queueMax']) < 1,queueBelowPoint5ms=counts['queueSteps'] > 0 and max(queue_max,stress['queueMax']) < .5,retaliationComplete100=counts['retaliationAttempts'] > 0 and counts['retaliationComplete'] == counts['retaliationAttempts'] and stress['allComplete'],zeroDecisionTimeouts=counts['modelTimeouts'] == 0,zeroOpponentTimeouts=counts['opponentTimeouts'] == 0,zeroErrorsOrWallStops=not failures,value16Slices=value['passed'] and len(value['slices']) == 16 and dev['frozenBinaryAudit']['allByteIdentical'] and dev['maxValueLogitsDifference'] == 0,triRuntime89=parity['passed'] and parity['states'] == 89 and parity['modelSha256'] == model_sha and parity['chrome']['chromeProfileCleaned'],devPolicyAudit=dev['passed'] and dev['modelSha256'] == model_sha,frozenValueZero=training['maxValueLogitsDifference'] == dev['maxValueLogitsDifference'] == 0,allAttemptsStrict=counts['strictFailures'] == 0 and current['strictAllAttempts'] and baseline['strictAllAttempts'] and prior['gates']['allAttemptsStrict'] and all(p['strict'] for p in stress['probes']),samples60=extraction['games'] == len(sampling) == 60 and extraction['strictAllAttempts'] and extraction['corrections'] > 0,trainingEvaluationIsolation=isolation['passed'],gridPreRegistered=selected['passed'] and not selected['usesBattleResults'] and len(selected['ranking']) == 8 and selected['protocolSha256'] == sha(DIR / 'phase53-audit/gen4-protocol.json'),preserved=preserved['passed'],comboRegressions=read(DIR / 'phase53-audit/combo-v4r4-certified.json')['passed'],sameExecutionContract=same_execution,stressRuntimeBound=stress['runtimeSha256'] == sha(ROOT / 'src/ai_runtime/dual_v2/turn_search_ai.ts'))
    snapshot = dict(generation=4,gates=gates,counts=dict(counts),queueMax=queue_max,worstQueueDecision=worst,retaliationIncomplete=incomplete,errorsOrWallStops=failures,panelComparison=comparison,pureWins=pure_wins,searchWins=search_wins,modelSha256=model_sha,runtime=read(folder / 'arena/plan.json')['runtimeRevision'],executionContract=execution,scope='当前冠军和第4代正式面板，加本代60局采样及冻结压力探针；原第3代失败单列保全',historicalGeneration3=prior,historicalFailuresRetained=True,selection=selected)
    opponent = read(DIR / 'phase53-audit/opponent-optimization-ready.json')
    proof = read(DIR / opponent['profile']['receipt'])
    gates['opponentProjectionEquivalent'] = proof['passed'] and proof['games'] == 224 and proof['allActionsAndRngUnchanged'] and proof['currentSha256'] == sha(ROOT / 'src/game/ai/tactical_evaluation.ts') and sha(DIR / opponent['profile']['receipt']) == opponent['profile']['receiptSha256']
    gates['engineering60'] = read(engineering_base / 'engineering-summary.json')['passed']
    gates['allAttemptsStrict'] = gates['allAttemptsStrict'] and original_strict
    snapshot['scope'] = '相同优化后运行配置的冠军与第4代正式面板、相同60初态独立工程复测及压力探针；原训练60局和原失败单独保全，不用于虚构独立质量胜率'
    snapshot['originalSampling'] = dict(games=60,strict=original_strict,classifications=dict(Counter(r['classification'] for _,r in original_sampling)),timeout=[dict(path=d.relative_to(DIR).as_posix(),failedDecision=r.get('failedDecision')) for d,r in original_sampling if r['classification'] == 'decision_timeout'],queueDiagnostic='phase53-audit/gen4-queue-gc-current.json',unchangedTrainingInputs=True)
    snapshot['opponentOptimization'] = opponent
    extension = read(DIR / 'phase53-audit/gen4-resource-extension.json')
    gates['retentionBudgetRecorded'] = extension['originalProtocolSha256'] == sha(DIR / 'phase53-audit/gen4-protocol.json') and extension['evidenceCapBytes'] == 1350000000 and extension['minimumFreeBytes'] == 12*1024**3 and extension['qualityAndTimingThresholdsUnchanged']
    snapshot['resourceExtension'] = extension
    save(folder / 'promotion-gates.json',snapshot); save(DIR / 'phase53-audit/promotion-gates.json',snapshot)
    promote(4); promotion = read(folder / 'promotion.json'); snapshot.update(promoted=promotion['promoted'],championGeneration=read(DIR / 'league-state.json')['championGeneration']); snapshot['gates']['promotion'] = promotion['promoted']; save(DIR / 'gate-summary.json',snapshot)
    failed = [name for name,passed in snapshot['gates'].items() if not passed]
    table = ['|模型|策略|面板|槽数|自然胜|自然负|自然平|动作截断|决策超时|墙钟|错误|','|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for label,summary,modes in [('第0代',pure0,['pure']),('第0代',baseline,['turn_search']),('第3代',warm,['pure','turn_search']),('第4代',current,['pure','turn_search'])]:
        for mode in modes:
            for panel in ['fixed','expanded','3ffa','4ffa','2v2']:
                group = summary['groups'][mode+'/'+panel]; outcome = group['outcomes']; table.append('|'+ '|'.join(map(str,[label,mode,panel,group['slots'],*[outcome.get(k,0) for k in ['natural_win','natural_loss','natural_draw','action_truncation','decision_timeout','wall_truncation','error']]]))+'|')
    (DIR / 'BATTLES.md').write_text('# 阶段5.3完整战报\n\n'+ '\n'.join(table)+'\n\n截断不计胜。第0/3代纯策略原件按SHA复用；第4代112槽是新评测。第3代搜索行为旧v4r4结果；第0代当前搜索和第4代为完成对手等价提速后的v4r5，不能把第3代旧搜索行当成v4r5重测。同运行时第0/3代的v4r4配对结论与完整战报保存在phase53-audit/gen3-v4r4-conclusion。全部为开发面板，独立盲测和GUI部署尚未进行。第3代失败门禁见phase53-audit/gen3-v4r4-conclusion。\n',encoding='utf-8')
    previous_report = (DIR / 'phase53-audit/gen3-v4r4-conclusion/REPORT.md').read_text('utf-8')
    report = f'''# 阶段5.3第4代自动续跑结果

第4代纯策略{pure_wins}/56，搜索{search_wins}/56。晋升={promotion['promoted']}，当前冠军第{snapshot['championGeneration']}代。未通过项：{', '.join(failed) or '无'}。逐面板自然胜：`{json.dumps(comparison,ensure_ascii=False)}`。完整自然胜负和截断见[BATTLES.md](BATTLES.md)。

第3代固定图17胜比同运行时冠军18胜少1，触发用户的自动第4代授权。第3代权重SHA仍为{sha(DIR / 'generations/gen_03/model.bin')}，完整搜索39胜与0.9452ms失败峰值未被删改。原结论、门禁与战报按SHA存于phase53-audit/gen3-v4r4-conclusion。

第4代从第3代副本热启动，以冠军第0代固定v4r4搜索采样60局，纠错标签逐状态相对第3代纯策略核验。仅用本代真实原子纠错与永久排重后的基础池训练，wait/end不作专家硬标签。先验禁止或机会待机冲突的基础标签跳过硬监督，保留参考KL。

先完成一次策略头监督蒸馏，再运行预登记8组联合语义网格。全部8组权重、检查点和开发审计均保留；选中`{selected['selected']}`，只按固定开发集动作头准确率、无谓待机数与候选ID排序，未按实战换模型。骨干、价值、内置headBias与校准配置保持冻结；34763个开发状态价值logits严格零漂移，非策略导出张量逐字节相同。价值16切片依据冻结证明继承，新权重的89状态Python/Node/真实Chrome三端一致性重新实跑。

新运行配置下相同60初态的工程复测及双方正式面板队列最大{queue_max:.6f}ms，反扑{counts['retaliationComplete']}/{counts['retaliationAttempts']}完成，模型/对手决策超时{counts['modelTimeouts']}/{counts['opponentTimeouts']}。这些统计包含GC和调度。冻结压力探针队列最大{stress['queueMax']:.6f}ms。逐步最慢收据和未完成明细均保存在gate-summary.json。Node参数固定`{' '.join(execution['nodeArgs'])}`，双lane并行，外部1000ms门槛未放宽。

启发式对手逐格威胁评估原先反复JSON复制整张地图，CPU采样显示约九成开销在此。现在同一评分器复用一次原样JSON投影并在每次计算后恢复位置及虚拟单位；全部224槽187276个动作、69595个对手决策的动作、完整状态与随机游标均保持。旧冠军搜索完整归档，再在优化后的相同运行配置重测56槽；原60局训练数据保持不动，另对相同60初态进行不训练、不计质量胜率的工程复测。原训练采样的0.807ms队列失败与1050.334ms对手超时均原样保留。

实际消费基础/专家/训练待机约束ID完整落盘并核对新增及全部历史评测完整SHA和权威等价态，隔离通过={isolation['passed']}。全部实际动作和反扑见证strict复核；不将forced等同strict。训练证据原预登记1.2GB保持；因对手瓶颈修复后追加56槽基准、60初态工程复测和95.7MB旧索引保全，另登记1.35GB证据保留扩展，仍保留12GiB系统空闲守卫，未放宽质量或时延门禁。

公共450项测试通过、20项因既有原始APK等依赖缺失跳过，lint/build通过；阶段TS与26项Python合同通过。GUI入口、手机、独立最终盲测与部署均未操作。

按用户最新要求，本轮训练、既定评测与门禁判定至此结束，无论是否晋升均停止，不追加训练、不重开网格、不启动下一代。

以下为完整保留的第3代修复结论：

'''+previous_report
    (DIR / 'REPORT.md').write_text(report,encoding='utf-8')
    path = ROOT / 'ai_training/status/CURRENT.md'; text = path.read_text('utf-8'); marker = '<!-- dual-stream-v2-phase53-gen4 -->'
    status = f"{marker}\n## 2026-10-21 阶段5.3第4代\n\n第4代纯策略{pure_wins}/56、搜索{search_wins}/56；晋升={promotion['promoted']}，冠军第{snapshot['championGeneration']}代。失败项：{', '.join(failed) or '无'}。60局、8组预登记开发网格、112新评测完整保留。见[报告](../dual_stream_v2_phase5_20261020/REPORT.md)及[战报](../dual_stream_v2_phase5_20261020/BATTLES.md)。未进行GUI部署或独立盲测。\n<!-- end-dual-stream-v2-phase53-gen4 -->\n\n"
    if marker not in text:
        text = text.replace('## 2026-10-21 阶段5.3自动第4代进行中','## 2026-10-21 阶段5.3自动第4代过程记录')
        path.write_text(text.replace('# 当前接手状态','# 当前接手状态\n\n'+status,1),encoding='utf-8')
    guide = DIR / 'LEAGUE_RESUME_GUIDE.md'; old_guide = guide.read_text('utf-8')
    guide_marker = '<!-- phase53-gen4-result -->'
    if guide_marker not in old_guide:
        guide.write_text(f"{guide_marker}\n第4代正式面板已完成，晋升={promotion['promoted']}，冠军第{snapshot['championGeneration']}代。失败项：{', '.join(failed) or '无'}。最终事实见gate-summary.json与phase53-audit/gen4-status.json。按用户最新要求，无论是否晋升，本轮至此结束，不追加训练、不重开网格、不启动下一代。下方仅为过程记录，GUI与独立盲测等待用户后续指令。\n<!-- end-phase53-gen4-result -->\n\n"+old_guide,encoding='utf-8')
    final = preservation(); assert final['passed'],final
    save(DIR / 'phase53-audit/gen4-status.json',dict(stage='promoted' if promotion['promoted'] else 'failed_gates',promoted=promotion['promoted'],championGeneration=snapshot['championGeneration'],failedGates=failed,modelSha256=model_sha,roundComplete=True,stopAfterRound=True))
    save(DIR / 'pipeline-status.json',dict(stage='phase53_target_promoted' if promotion['promoted'] else 'phase53_failed_gates',targetGeneration=4,promoted=promotion['promoted'],championGeneration=snapshot['championGeneration'],failedGates=failed,modelSha256=model_sha,roundComplete=True,stopAfterRound=True))
    print(json.dumps(dict(promoted=promotion['promoted'],championGeneration=snapshot['championGeneration'],pureWins=pure_wins,searchWins=search_wins,failedGates=failed),ensure_ascii=False),flush=True)


if __name__ == '__main__': main()
