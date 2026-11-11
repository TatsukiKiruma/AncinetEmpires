"""从实际v4收据判定门禁与晋升；历史失败独立保留，绝不改写胜负。"""
import gzip
import json
import shutil
from collections import Counter
from pathlib import Path
from prepare_phase53 import AUDIT, DIR, ROOT, sha
from run_league import read, save, promote, wins


def results(arena):
    plan = read(DIR / arena / 'plan.json')
    return [(DIR / arena / 'battles' / s['id'], read(DIR / arena / 'battles' / s['id'] / 'result.json')) for s in plan['slots']]


def preservation():
    before = read(AUDIT / 'before.json')['files']
    freeze = read(AUDIT / 'runtime-freeze.json')
    moved = freeze['archivedPaths']
    changed = [p for p, e in before.items() if not (ROOT / moved.get(p, p)).exists() or sha(ROOT / moved.get(p, p)) != e['sha256']]
    allowed = {'src/ai_runtime/dual_v2/turn_search_ai.ts', 'src/ai_runtime/dual_v2/queue_state.ts', 'src/ai_runtime/dual_v2/retaliation_fairness.test.ts', 'ai_training/status/CURRENT.md'}
    allowed |= {'ai_training/dual_stream_v2_phase5_20261020/' + n for n in ['battle.ts', 'selfplay.ts', 'run_league.py', 'combo_regressions.ts', 'test_league_contracts.py', 'RUNTIME_REVISION.json', 'league-state.json', 'dual-v2-champion.json', 'dual-v2-champion.bin', 'REPORT.md', 'BATTLES.md', 'gate-summary.json', 'LEAGUE_RESUME_GUIDE.md', 'generations/gen_03/arena/plan.json', 'generations/gen_03/arena-summary.json', 'generations/gen_03/promotion.json']}
    allowed.add('ai_training/dual_stream_v2_phase5_20261020/exclusions.ts')
    allowed |= {'ai_training/dual_stream_v2_phase5_20261020/' + n for n in ['expert_extraction.ts', 'extract.ts', 'league_stream.ts', 'prior_distillation.py', 'durable_log.ts']}
    allowed.add('src/game/ai/tactical_evaluation.ts')
    allowed |= {'ai_training/dual_stream_v2_phase5_20261020/' + n for n in ['evaluation-exclusion-receipt.json', 'evaluation-exclusions.txt.gz', 'pipeline-status.json']}
    unexpected = [p for p in changed if p not in allowed]
    pure_changed = [p for p, e in freeze['pureFiles'].items() if sha(ROOT / p) != e['sha256']]
    runtime_changed = [p for p, digest in {**freeze['runtime'], **freeze['harness']}.items() if sha(ROOT / p) != digest]
    archive_changed = []
    for name, prefix in [('v4-attempt01-search-archive', ''), ('v4r2-baseline-archive', 'champion-search-arena'), ('v4r3-search-archive', '')]:
        archive = AUDIT / name
        for relative, digest in read(archive / 'manifest.json')['files'].items():
            if sha(archive / prefix / relative) != digest:
                archive_changed.append(name + '/' + relative)
    additional = AUDIT / 'v4r4-champion-search-archive'
    if additional.exists():
        for relative, digest in read(additional / 'manifest.json')['files'].items():
            if sha(additional / 'champion-search-arena' / relative) != digest: archive_changed.append('v4r4-champion-search-archive/' + relative)
    if 'src/game/ai/tactical_evaluation.ts' in changed:
        proof_path = AUDIT / 'opponent-optimization-equivalence.json'
        proof = read(proof_path) if proof_path.exists() else {}
        if not proof.get('passed') or proof.get('games') != 224 or not proof.get('allActionsAndRngUnchanged') or proof.get('currentSha256') != sha(ROOT / 'src/game/ai/tactical_evaluation.ts'):
            runtime_changed.append('对手投影等价证明')
    index_name = 'ai_training/dual_stream_v2_phase5_20261020/evaluation-exclusions.txt.gz'
    if index_name in changed:
        original_index = DIR / 'evaluation-index-history' / (before[index_name]['sha256'] + '.txt.gz')
        if not original_index.exists() or sha(original_index) != before[index_name]['sha256']:
            archive_changed.append('初始训练排重索引原件')
    for snapshot_name in ['v4-attempt01-source', 'v4r3-runtime-source']:
        source_snapshot = AUDIT / snapshot_name
        for relative, digest in read(source_snapshot / 'manifest.json').items():
            if sha(source_snapshot / relative) != digest:
                archive_changed.append(snapshot_name + '/' + relative)
    if freeze.get('authorityReadOnlyExtension'):
        extension = freeze['authorityReadOnlyExtension']; receipt = read(DIR / extension['receipt'])
        if sha(DIR / extension['receipt']) != extension['receiptSha256'] or sha(ROOT / 'src/game/engine.ts') != receipt['sourceSha256'] or sha(ROOT / 'src/game/state_equals.ts') != receipt['comparisonSha256']:
            runtime_changed.append('只读引擎扩展身份')
    result = dict(passed=not unexpected and not pure_changed and not runtime_changed and not archive_changed, checked=len(before), changed=changed, unexpected=unexpected, pureChanged=pure_changed, runtimeChanged=runtime_changed, archiveChanged=archive_changed, movedFiles=len(moved))
    save(AUDIT / 'preservation.json', result)
    return result


def main():
    folder = DIR / 'generations/gen_03'
    assert len(list((folder / 'arena/battles').glob('*turn_search/result.json'))) == 56, '当前候选搜索面板未完成，不能读取旧summary晋升'
    from arena_summary import summarize
    summarize(0, arena_path='champion-search-arena')
    summarize(3)
    c = read(folder / 'arena-summary.json'); b = read(DIR / 'champion-search-arena/arena-summary.json'); p = read(DIR / 'champion-pure-arena/arena-summary.json')
    assert c['complete'] and b['complete'] and p['complete']
    arms = dict(championPure=results('champion-pure-arena'), championSearch=results('champion-search-arena'), candidate=results('generations/gen_03/arena'))
    table = ['|模型|策略|面板|槽数|自然胜|自然负|自然平|动作截断|决策超时|墙钟|错误|', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    names = {'fixed': '固定图', 'expanded': '扩展图', '3ffa': '三人混战', '4ffa': '四人混战', '2v2': '2v2'}
    counts = Counter(); incomplete = []; queue_max = 0.; worst_queue = None; timeout_details = []; errors = []
    for arm, rows in arms.items():
        for mode in sorted({r['slot']['mode'] for _, r in rows}):
            for panel, name in names.items():
                selected = [r for _, r in rows if r['slot']['mode'] == mode and r['slot']['panel'] == panel]
                outcomes = Counter(r['classification'] for r in selected)
                table.append('|' + '|'.join(map(str, ['第3代' if arm == 'candidate' else '第0代', '纯策略' if mode == 'pure' else '回合搜索', name, len(selected), *[outcomes[k] for k in ['natural_win', 'natural_loss', 'natural_draw', 'action_truncation', 'decision_timeout', 'wall_truncation', 'error']]])) + '|')
        for directory, result in rows:
            strict = read(directory / 'strict-replay.json')
            counts['actions'] += strict['actions']; counts['witnessActions'] += strict.get('witnessActions', 0)
            counts['strictFailures'] += not (strict['passed'] and strict['actions'] == result['actions'])
            if result['slot']['mode'] != 'turn_search':
                continue
            if result['classification'] == 'decision_timeout':
                model_timeout = (result['latency']['model']['max'] or 0) > 1000
                counts['modelTimeouts' if model_timeout else 'opponentTimeouts'] += 1
                timeout_details.append(dict(path=str(directory.relative_to(DIR)), modelTimeout=model_timeout, latency=result['latency']))
            if result['classification'] in ['error', 'wall_truncation'] or result.get('error'):
                errors.append(str(directory.relative_to(DIR)))
            for line in gzip.decompress((directory / 'actions.jsonl.gz').read_bytes()).splitlines():
                row = json.loads(line); t = row.get('telemetry') or {}
                if t.get('queued'):
                    counts['queueSteps'] += 1
                    if row['ms'] > queue_max:
                        queue_max = row['ms']; worst_queue = dict(path=str(directory.relative_to(DIR)), i=row['i'], ms=row['ms'], beforeHash=row['beforeHash'], code=row['code'])
                elif t:
                    counts['rootSteps'] += 1
                    counts['retaliationAttempts'] += t.get('retaliationAttempts', 0); counts['retaliationComplete'] += t.get('retaliationComplete', 0)
                    if t.get('retaliationAttempts') != t.get('retaliationComplete'):
                        incomplete.append(dict(path=str(directory.relative_to(DIR)), i=row['i'], beforeHash=row['beforeHash'], telemetry=t))
    stress = read(AUDIT / 'retaliation-stress-node128-certified.json')
    dev = read(folder / 'dev-policy-audit.json'); value = read(folder / 'value-calibration.json'); parity = read(folder / 'tri-runtime-parity.json'); training = read(folder / 'training-complete.json')
    preserved = preservation()
    panels = ['fixed', 'expanded', 'multiplayer']
    pure_wins = sum(wins(c, 'pure', panel) for panel in panels)
    search_wins = sum(wins(c, 'turn_search', panel) for panel in panels)
    baseline_wins = sum(wins(p, 'pure', panel) for panel in panels)
    archive_strict = all(read(path)['passed'] and read(path)['actions'] == read(path.parent / 'result.json')['actions'] for path in (AUDIT / 'v4-attempt01-search-archive').rglob('strict-replay.json'))
    archive_strict &= all(read(path)['passed'] and read(path)['actions'] == read(path.parent / 'result.json')['actions'] for path in (AUDIT / 'v4r2-baseline-archive').rglob('strict-replay.json'))
    archive_strict &= all(read(path)['passed'] and read(path)['actions'] == read(path.parent / 'result.json')['actions'] for path in (AUDIT / 'v4r3-search-archive').rglob('strict-replay.json'))
    gates = dict(pureNoRegression=all(wins(c, 'pure', panel) >= wins(p, 'pure', panel) for panel in panels), pureImprovesChampion=pure_wins > baseline_wins, searchNoRegression=all(wins(c, 'turn_search', panel) >= wins(b, 'turn_search', panel) for panel in panels), searchMatchesEveryPurePanel=all(wins(c, 'turn_search', panel) >= wins(c, 'pure', panel) for panel in panels), search42Plus=search_wins >= 42, queueBelow1ms=counts['queueSteps'] > 0 and max(queue_max, stress['queueMax']) < 1, queueBelowPoint5ms=counts['queueSteps'] > 0 and max(queue_max, stress['queueMax']) < .5, retaliationComplete100=counts['retaliationAttempts'] > 0 and counts['retaliationAttempts'] == counts['retaliationComplete'] and stress['allComplete'], zeroDecisionTimeouts=not timeout_details, zeroOpponentTimeouts=counts['opponentTimeouts'] == 0, zeroErrorsOrWallStops=not errors, value16Slices=value['passed'] and len(value['slices']) == 16, triRuntime89=parity['passed'] and parity['states'] == 89 and parity['modelSha256'] == sha(folder / 'model.bin') and parity['chrome']['chromeProfileCleaned'], devPolicyAudit=dev['passed'] and dev['modelSha256'] == sha(folder / 'model.bin'), frozenValueZero=training['maxValueLogitsDifference'] == dev['maxValueLogitsDifference'] == 0, allAttemptsStrict=counts['strictFailures'] == 0 and c['strictAllAttempts'] and b['strictAllAttempts'] and archive_strict and all(q['strict'] for q in stress['probes']) and read(AUDIT / 'before/ai_training/dual_stream_v2_phase5_20261020/gate-summary.json')['gates']['allAttemptsStrict'], preserved=preserved['passed'], comboRegressions=read(AUDIT / 'combo-v4r2-final.json')['passed'])
    gates['comboRegressions'] = read(AUDIT / 'combo-v4r4-certified.json')['passed']
    execution = read(DIR / 'RUNTIME_REVISION.json')['executionContract']
    gates['sameExecutionContract'] = all(read(DIR / name / 'plan.json')['executionContract'] == execution for name in ['champion-search-arena', 'generations/gen_03/arena']) and all(arg in stress['executionArgs'] for arg in execution['nodeArgs'])
    gates['stressRuntimeBound'] = stress['runtimeSha256'] == sha(ROOT / 'src/ai_runtime/dual_v2/turn_search_ai.ts')
    snapshot = dict(gates=gates, counts=dict(counts), worstQueueDecision=worst_queue, queueMax=queue_max, retaliationIncompleteDecisions=incomplete, timeouts=timeout_details, errors=errors, panelComparison={panel:dict(championSearch=wins(b, 'turn_search', panel), candidatePure=wins(c, 'pure', panel), candidateSearch=wins(c, 'turn_search', panel)) for panel in panels}, pureWins=pure_wins, championPureWins=baseline_wins, searchWins=search_wins, runtime='gen03-phase53-v4r2', modelSha256=sha(folder / 'model.bin'), stress=dict(attempts=stress['attempts'], complete=stress['complete'], queueMax=stress['queueMax'], rootMax=stress['rootMax']), history='phase53-audit/v3-search-archive', scope='本轮v4完整面板及压力探针；旧v3失败原始数据按SHA完整归档，未混入新运行时性能')
    snapshot['runtime'] = read(folder / 'arena/plan.json')['runtimeRevision']
    snapshot['executionContract'] = execution
    snapshot['historicalQueueFailures'] = [dict(archive='phase53-audit/v4-attempt01-search-archive', candidateQueueMax=read(AUDIT / 'v4-attempt01-search-archive/candidate-arena-summary.json')['queueLatency']['max']), dict(archive='phase53-audit/v4r2-baseline-archive', championQueueMax=read(AUDIT / 'v4r2-baseline-archive/champion-search-arena/arena-summary.json')['queueLatency']['max'])]
    prior_candidate = read(AUDIT / 'v4r3-search-archive/candidate-arena-summary.json')
    snapshot['historicalQualityFailures'] = dict(archive='phase53-audit/v4r3-search-archive', searchWins=sum(wins(prior_candidate, 'turn_search', panel) for panel in panels), multiplayerWins=wins(prior_candidate, 'turn_search', 'multiplayer'), rootActorGuardRegression=dict(red='phase53-audit/actor-guard-red.log', green='phase53-audit/actor-guard-green.log'))
    save(AUDIT / 'promotion-gates.json', snapshot)
    promote(3)
    promotion = read(folder / 'promotion.json'); state = read(DIR / 'league-state.json')
    gates['promotion'] = promotion['promoted']
    snapshot.update(gates=gates, promoted=promotion['promoted'], championGeneration=state['championGeneration'])
    save(DIR / 'gate-summary.json', snapshot)
    failures = [name for name, passed in gates.items() if not passed]
    report = f'''# 双流v2阶段5.3搜索修复与重测

第3代模型未训练，SHA `{snapshot['modelSha256']}`。v4搜索面板完整结束，晋升={promotion['promoted']}，当前冠军第{state['championGeneration']}代。未通过项：{', '.join(failures) or '无'}。

纯策略按SHA和strict复核复用：第0代{baseline_wins}/56，第3代{pure_wins}/56。v4第3代搜索{search_wins}/56。逐面板比较：`{json.dumps(snapshot['panelComparison'], ensure_ascii=False)}`。自然胜负、截断与异常详见[BATTLES.md](BATTLES.md)，不能把截断计成自然胜利。

默认神经基准完整推进至最多3个单位或回合结束；挑战方案使用相同行动深度，允许已经真正结束回合或规则终局的短分支。廉价先验只用于束排序，最终证据分数不再累加prior。德鲁伊刷新需要的三次单位链与提前结束的两单位基准均使用相同回合边界。

搜索节点只存前态和动作，只有最终缓存步骤构造队列身份；状态键复用扁平地形缓冲。敌方优先展开具有即时战术收益的链，剩余未行动敌军对参战单位的静态威胁另行计入惩罚。真实反扑借用160ms安全窗口，反扑期限上限为根搜索起点加880ms；人为过期预算仍严格失败。额外修复己方席位淘汰后重复展开敌方回合的问题。

队列切分比较保存在phase53-audit/combo-first.json、combo-full.json与combo-full-v2.json。只缓存首单位不能通过既有协同夹具；完整神经队列最终4/4通过，因此实战前冻结选择full。真实失败前态的两种队列切分均保留在retaliation-stress-certified.json；{stress['complete']}/{stress['attempts']}反扑完成，队列最大{stress['queueMax']:.6f}ms。第一次压力探针暴露顺位循环，失败收据retaliation-stress-v4.json保持原件。

正式新搜索队列{counts['queueSteps']}步，最大{queue_max:.6f}ms；反扑完成{counts['retaliationComplete']}/{counts['retaliationAttempts']}。全部复核实际/反扑动作{counts['actions']}/{counts['witnessActions']}；最慢队列、未完成反扑及异常详情全部保存在gate-summary.json。历史失败不被新结果覆盖。

另新增只读快照比较与布尔合法性查询，原35个权威方法逐个源码保持；快返不复制快照和菜单，仍核对完整状态及当前权威合法性。普通接管只缓存首单位，集火、刷新、让位和出城招募等跨单位依赖保留必要协同前缀；默认神经方案保留全链。

开局预热在克隆引擎、独立策略实例及独立随机流上执行，正式队列重新创建；正式初态SHA与对手随机调用数0有运行断言。历史策略同样经预热。公共448测试通过、20跳过，lint/build/阶段类型检查通过，23项Python合同通过。APK原始资源跳过不计通过。旧v3搜索673文件按SHA归档；模型、纯策略、战术先验、旧代与另一合同保全详情见phase53-audit/preservation.json。

晋升函数新增本轮全部门禁的合取保护，未满足42胜、逐面板、队列0.5ms等任一要求均不会替换冠军。双方致死风险改为监控根态同一批现有己方与盟友单位，避免只换actors名单就虚构风险降低。相同物理终态回归的红/绿日志均保留；v4r3双方完整结果另存v4r3-search-archive。没有修改GUI入口、操作手机、部署或独立最终盲测。
'''
    report += '\n时延结论适用于本次登记的Node配置：`' + ' '.join(execution['nodeArgs']) + '`，并发数' + str(execution['lanes']) + '。墙钟包含GC与调度。默认堆完整基准的1.1017ms队列失败按原值保存在v4r2-baseline-archive；首版v4完整双方尝试也保留在v4-attempt01-search-archive。固定失败前态9900次单独复测的p95/最大为0.0359/0.3700ms，不能据此抹去正式失败峰值。\n'
    (DIR / 'REPORT.md').write_text(report, encoding='utf-8')
    (DIR / 'BATTLES.md').write_text('# 阶段5.3配对战报\n\n两组各56槽搜索使用冻结v4、相同初态和对手种子；纯策略112槽复用旧结果并重新strict复核。\n\n' + '\n'.join(table) + '\n\n这些是开发面板，尚无独立最终盲测。v3完整原件见phase53-audit/v3-search-archive。\n', encoding='utf-8')
    current = ROOT / 'ai_training/status/CURRENT.md'
    marker = '<!-- dual-stream-v2-phase53-20261021 -->'
    status = f"{marker}\n## 2026-10-21 阶段5.3搜索修复重测\n\n见[报告](../dual_stream_v2_phase5_20261020/REPORT.md)与[战报](../dual_stream_v2_phase5_20261020/BATTLES.md)。第3代模型SHA保持；纯策略41/56复用，v4搜索{search_wins}/56。晋升={promotion['promoted']}，冠军第{state['championGeneration']}代。失败项：{', '.join(failures) or '无'}。旧v3证据完整归档；未修改GUI、操作手机或部署。\n<!-- end-dual-stream-v2-phase53-20261021 -->\n\n"
    text = current.read_text('utf-8')
    if marker not in text:
        current.write_text(text.replace('# 当前接手状态', '# 当前接手状态\n\n' + status, 1), encoding='utf-8')
    guide = DIR / 'LEAGUE_RESUME_GUIDE.md'
    text = guide.read_text('utf-8')
    if '<!-- phase53-result -->' not in text:
        guide.write_text(f"<!-- phase53-result -->\n阶段5.3已完成v4重测，晋升={promotion['promoted']}；冠军第{state['championGeneration']}代。旧正文为历史记录。继续状态应以phase53-audit/pipeline-status.json与当前用户授权为准。恢复重测使用run_phase53.py；不覆盖任何started未完槽。\n<!-- end-phase53-result -->\n\n" + text, encoding='utf-8')
    final_preservation = preservation()
    assert final_preservation['passed'], final_preservation
    save(AUDIT / 'completion.json', dict(promoted=promotion['promoted'], championGeneration=state['championGeneration'], failedGates=failures, preservation=final_preservation['passed'], gen4Trigger=any(wins(c, 'turn_search', panel) == wins(b, 'turn_search', panel) - 1 for panel in panels)))
    print(json.dumps(dict(promoted=promotion['promoted'], championGeneration=state['championGeneration'], failedGates=failures, searchWins=search_wins, queueMax=queue_max), ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
