"""按原始结果生成对战表、全部尝试门禁与保全清单，失败如实保留。"""
import gzip
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]


def read(p): return json.loads(Path(p).read_text('utf-8'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p, x): Path(p).write_text(json.dumps(x, ensure_ascii=False, indent=2), encoding='utf-8')


def result_rows(folder):
    return [(f, read(f)) for f in Path(folder).glob('battles/*/result.json')]


def grouped(rows):
    groups = defaultdict(Counter)
    for _, r in rows:
        groups[r['slot']['panel']][r['classification']] += 1
    return {p: dict(c) for p, c in groups.items()}


def wins(groups, panel):
    return sum(groups.get(p, {}).get('natural_win', 0) for p in (['3ffa', '4ffa', '2v2'] if panel == 'multiplayer' else [panel]))


def main():
    report_date = datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d')
    state = read(DIR / 'league-state.json'); champion = state['championGeneration']; latest = state['currentGeneration']
    arms = {}; provenance = []
    raw = result_rows(DIR.parent / 'dual_stream_v2_phase4_20261020')
    # 阶段4轨迹在battles/中，纯策略与搜索各56槽。
    for name in ['dual_v2_stage4_pure', 'dual_v2_stage4_turn_search']:
        arms[name] = grouped([(f, r) for f, r in raw if r['slot']['model'] == name])
    h = read(DIR.parent / 'dual_stream_v2_phase3_20261020/historical-baseline-identities.json')
    stage3_plan = read(DIR.parent / 'dual_stream_v2_phase3_20261020/battle-plan.json')
    for model in ['stage3_hierarchical', 'stage4_pure']:
        rows = []
        for e in h['entries']:
            if e['model'] != model: continue
            f = ROOT / e['resultPath']; assert sha(f) == e['resultSha256']; r = read(f)
            # 已有80份收据均核验同初态、同seed；沿用冻结面板字段。
            matches = [s for s in stage3_plan['slots'] if all(s[k] == r['slot'][k] for k in ['opponent', 'mapIndex', 'seat', 'opponentSeed'])]
            assert len(matches) == 1, '历史结果无法唯一映射到冻结面板'
            r = {**r, 'slot': {**r['slot'], 'panel': matches[0]['panel']}}
            rows.append((f, r)); provenance.append(dict(model=model, path=str(f.relative_to(ROOT)), sha256=sha(f), inherited=True))
        rows += [(f, r) for f, r in result_rows(DIR / 'historical-arena') if r['slot']['model'] == model]
        arms[model] = grouped(rows)
    arms['dual_v2_gen0_turn_search'] = grouped(result_rows(DIR / 'generations/gen_00/arena'))
    arms['dual_v2_gen0_pure'] = grouped(result_rows(DIR / 'champion-pure-arena'))
    arms['dual_v2_gen0_turn_search_当前运行时'] = grouped(result_rows(DIR / 'champion-search-arena'))
    for mode in ['pure', 'turn_search']:
        rows = [(f, r) for f, r in result_rows(DIR / f'generations/gen_{champion:02d}/arena') if r['slot']['mode'] == mode]
        if champion == 0 and mode == 'pure': rows = result_rows(DIR / 'champion-pure-arena')
        if champion == 0 and mode == 'turn_search': rows = result_rows(DIR / 'champion-search-arena')
        arms['dual_v2_champion_' + mode] = grouped(rows)
    if latest != champion:
        for mode in ['pure', 'turn_search']:
            arms[f'dual_v2_gen{latest}_{mode}_未晋升'] = grouped([(f, r) for f, r in result_rows(DIR / f'generations/gen_{latest:02d}/arena') if r['slot']['mode'] == mode])
    all_results = list(DIR.glob('**/result.json'))
    attempts = []; strict_all = True; model_ms = []; search_ms = []; root_ms = []; queue_ms = []; timeouts = []; walls = []; unknown_stops = []; retaliation = Counter()
    current_ms = []; current_roots = []; current_queues = []; current_retaliation = Counter(); current_timeouts = []; current_walls = []
    for f in all_results:
        r = read(f)
        if 'slot' not in r: continue
        device_diagnostic = f.relative_to(DIR).parts[0].startswith('device-comparison-10')
        receipt_path = f.parent / 'strict-replay.json'; receipt = read(receipt_path) if receipt_path.exists() else dict(passed=False)
        ok = receipt.get('passed', False) and receipt.get('actions') == r['actions']
        if receipt.get('logSha256'): ok &= receipt['logSha256'] == sha(f.parent / 'actions.jsonl.gz')
        strict_all &= ok
        attempts.append(dict(path=str(f.parent.relative_to(DIR)), actions=r['actions'], witnessActions=receipt.get('witnessActions', 0), passed=ok, classification=r['classification']))
        if r['classification'] == 'decision_timeout': timeouts.append(str(f.parent.relative_to(DIR)))
        if r['classification'] == 'wall_truncation': walls.append(str(f.parent.relative_to(DIR)))
        if r['classification'] == 'interrupted': unknown_stops.append(str(f.parent.relative_to(DIR)))
        mode = r['slot'].get('mode')
        current_runtime = mode == 'turn_search' and not device_diagnostic and not f.is_relative_to(DIR / 'generations/gen_00/arena')
        if mode == 'turn_search' and not device_diagnostic:
            breakdown = read(f.parent / 'latency-breakdown.json') if (f.parent / 'latency-breakdown.json').exists() else dict(modelTimes=r['latencySamples']['model'], rootTimes=r.get('rootTimes', []), queueTimes=r.get('queueTimes', []))
            search_ms.extend(breakdown['modelTimes']); root_ms.extend(breakdown['rootTimes']); queue_ms.extend(breakdown['queueTimes'])
            if current_runtime:
                current_ms.extend(breakdown['modelTimes']); current_roots.extend(breakdown['rootTimes']); current_queues.extend(breakdown['queueTimes'])
                if r['classification'] == 'decision_timeout': current_timeouts.append(str(f.parent.relative_to(DIR)))
                if r['classification'] == 'wall_truncation': current_walls.append(str(f.parent.relative_to(DIR)))
        if not device_diagnostic: model_ms.extend(r['latencySamples']['model'])
        action_path = f.parent / 'actions.jsonl.gz'
        if action_path.exists() and not device_diagnostic:
            for line in gzip.decompress(action_path.read_bytes()).splitlines():
                t = json.loads(line).get('telemetry')
                if t and not t.get('queued'):
                    retaliation['attempts'] += t.get('retaliationAttempts', 0); retaliation['complete'] += t.get('retaliationComplete', 0)
                    if current_runtime:
                        current_retaliation['attempts'] += t.get('retaliationAttempts', 0); current_retaliation['complete'] += t.get('retaliationComplete', 0)
    for f in DIR.glob('generations/gen_*/games/*/result.json'):
        r = read(f); receipt = read(f.parent / 'strict-replay.json'); ok = receipt['passed'] and receipt['actions'] == r['actions']; strict_all &= ok
        attempts.append(dict(path=str(f.parent.relative_to(DIR)), actions=r['actions'], witnessActions=receipt['witnessActions'], passed=ok, classification=r['classification']))
        if r['classification'] == 'decision_timeout': timeouts.append(str(f.parent.relative_to(DIR)))
        if r['classification'] == 'wall_truncation': walls.append(str(f.parent.relative_to(DIR)))
        if r['classification'] == 'decision_timeout': current_timeouts.append(str(f.parent.relative_to(DIR)))
        if r['classification'] == 'wall_truncation': current_walls.append(str(f.parent.relative_to(DIR)))
        if (f.parent / 'latency-breakdown.json').exists():
            breakdown = read(f.parent / 'latency-breakdown.json'); search_ms.extend(breakdown['modelTimes']); root_ms.extend(breakdown['rootTimes']); queue_ms.extend(breakdown['queueTimes'])
            current_ms.extend(breakdown['modelTimes']); current_roots.extend(breakdown['rootTimes']); current_queues.extend(breakdown['queueTimes'])
        for line in gzip.decompress((f.parent / 'actions.jsonl.gz').read_bytes()).splitlines():
            row = json.loads(line); t = row.get('telemetry')
            if t and not t.get('queued'):
                retaliation['attempts'] += t.get('retaliationAttempts', 0); retaliation['complete'] += t.get('retaliationComplete', 0)
                current_retaliation['attempts'] += t.get('retaliationAttempts', 0); current_retaliation['complete'] += t.get('retaliationComplete', 0)
    # 用户主动停止的已审计前缀单独计数，不能冒充一个完整验收槽。
    for f in DIR.glob('**/actions.jsonl.gz'):
        if (f.parent / 'result.json').exists() or not (f.parent / 'strict-replay.json').exists(): continue
        receipt = read(f.parent / 'strict-replay.json')
        ok = receipt.get('passed', False)
        if receipt.get('actualLog', {}).get('sha256'): ok &= receipt['actualLog']['sha256'] == sha(f)
        strict_all &= ok
        attempts.append(dict(path=str(f.parent.relative_to(DIR)), actions=receipt.get('actions', 0), witnessActions=receipt.get('witnessActions', 0), passed=ok, classification=receipt.get('classification', 'audited_prefix'), completeGame=False))
        if (f.parent / 'USER_STOP_STRICT.json').exists():
            breakdown = read(f.parent / 'latency-breakdown.json')
            search_ms.extend(breakdown['modelTimes']); root_ms.extend(breakdown['rootTimes']); queue_ms.extend(breakdown['queueTimes'])
            current_ms.extend(breakdown['modelTimes']); current_roots.extend(breakdown['rootTimes']); current_queues.extend(breakdown['queueTimes'])
            for line in gzip.decompress(f.read_bytes()).splitlines():
                t = json.loads(line).get('telemetry')
                if t and not t.get('queued'):
                    for bucket in [retaliation, current_retaliation]:
                        bucket['attempts'] += t.get('retaliationAttempts', 0); bucket['complete'] += t.get('retaliationComplete', 0)
    # 日志存在但没有任何strict收据时，全部尝试门禁必须失败。
    uncovered = [str(f.parent.relative_to(DIR)) for f in DIR.glob('**/actions.jsonl.gz') if not (f.parent / 'strict-replay.json').exists()]
    strict_all &= not uncovered
    def q(x):
        a = sorted(x)
        return dict(count=len(a), p50=a[max(0, int(len(a) * .5 + .999999) - 1)] if a else None, p95=a[max(0, int(len(a) * .95 + .999999) - 1)] if a else None, max=max(a) if a else None)
    before = read(DIR / 'preservation-before.json'); changes = []
    for k, v in {**before['history'], **before['protected']}.items():
        if not (ROOT / k).exists() or sha(ROOT / k) != v: changes.append(k)
    history_changes = [k for k in changes if k in before['history']]
    protected_changes = [k for k in changes if k in before['protected']]
    authority = read(DIR / 'index-authority-attestation.json')['coreFilesUnchangedFromPhase1']
    authority_changes = [k for k, digest in authority.items() if sha(ROOT / k) != digest]
    save(DIR / 'preservation-after.json', dict(passed=not changes, historicalPassed=not history_changes, protectedEntrypointShaUnchanged=not protected_changes, checkedHistorical=len(before['history']), checkedProtected=len(before['protected']), changes=changes, historyChanges=history_changes, protectedChanges=protected_changes, protectedFilesWrittenByThisTask=False, handling='入口的工作区变化保留原样，不回滚或篡改开工SHA快照'))
    calibration = read(DIR / state['championCalibrationPath'] / 'value-calibration.json')
    parity = read(DIR / state['championCalibrationPath'] / 'tri-runtime-parity.json')
    latest_folder = DIR / f'generations/gen_{latest:02d}'
    latest_calibration = read(latest_folder / 'value-calibration.json')
    latest_failed_slices = [name for name, metrics in latest_calibration['slices'].items() if not metrics['allBaselinesExceeded']]
    latest_parity = read(latest_folder / 'tri-runtime-parity.json')
    extraction = read(latest_folder / 'extraction-summary.json')
    training = read(latest_folder / 'training-complete.json')
    candidate_pure = grouped([(f, r) for f, r in result_rows(latest_folder / 'arena') if r['slot']['mode'] == 'pure'])
    candidate_search = grouped([(f, r) for f, r in result_rows(latest_folder / 'arena') if r['slot']['mode'] == 'turn_search'])
    pure = arms['dual_v2_champion_pure']; search = arms['dual_v2_champion_turn_search']
    panels = ['fixed', 'expanded', 'multiplayer']; baseline_names = ['stage3_hierarchical', 'stage4_pure', 'dual_v2_stage4_pure', 'dual_v2_stage4_turn_search']
    victory = {p: wins(search, p) > wins(pure, p) and all(wins(search, p) > wins(arms[b], p) for b in baseline_names) for p in panels}
    historical_multiplayer_comparable = all(sum(arms[b].get(p, {}).get('error', 0) for p in ['3ffa', '4ffa', '2v2']) == 0 for b in ['stage3_hierarchical', 'stage4_pure'])
    victory['multiplayer'] = victory['multiplayer'] and historical_multiplayer_comparable
    complete_arms = {name: sum(sum(c.values()) for c in groups.values()) == 56 for name, groups in arms.items()}
    pure_before = sum(wins(arms['dual_v2_gen0_pure'], p) for p in panels)
    pure_after = sum(wins(candidate_pure, p) for p in panels)
    gates = dict(gen01Completed=latest >= 1 and read(latest_folder / 'arena-summary.json')['complete'], complete56Arms=all(complete_arms.values()), strictAllAttempts=bool(strict_all), valueBaselines=calibration['passed'] and len(calibration['slices']) == 16 and latest_calibration['passed'] and len(latest_calibration['slices']) == 16, triRuntimeParity=parity['passed'] and latest_parity['passed'], searchP95=bool(search_ms) and q(search_ms)['p95'] <= 1000 and q(root_ms)['p95'] <= 1000, queueStepsBelow1ms=bool(queue_ms) and max(queue_ms) < 1, zeroDecisionTimeouts=not timeouts, zeroWallTruncations=not walls, pureImproves=sum(wins(pure, p) for p in panels) > 20, distillationImprovesPure=champion >= 1 and pure_after > pure_before, searchImprovesAllPanels=all(victory.values()), historicalPreservation=not history_changes, protectedEntrypointShaUnchanged=not protected_changes)
    public = read(DIR / 'public-checks.json') if (DIR / 'public-checks.json').exists() else dict(passed=False)
    test_log = (DIR / public.get('pcResume', {}).get('testLog', 'final-test.log')).read_text('utf-8', errors='replace')
    test_counts = re.search(r'Tests\s+(\d+) passed(?:\s*\|\s*(\d+) skipped)?', test_log)
    public_test_note = f"公共测试{test_counts[1]}项通过、{test_counts[2] or '0'}项跳过。" if test_counts else '公共测试数量详见final-test.log。'
    isolation = read(DIR / 'post-evaluation-isolation.json') if (DIR / 'post-evaluation-isolation.json').exists() else dict(passed=False)
    gates['postEvaluationBeforeHashIsolation'] = isolation['passed']
    gates['publicChecks'] = public['passed']; bytes_used = sum(p.stat().st_size for p in DIR.rglob('*') if p.is_file()); gates['disk'] = bytes_used <= 300_000_000
    gates['retaliationComplete100'] = retaliation['attempts'] > 0 and retaliation['complete'] == retaliation['attempts']
    gates['authorityCoreShaUnchanged'] = not authority_changes
    gates['zeroUnknownStops'] = not unknown_stops
    gates['historicalMultiplayerComparable'] = historical_multiplayer_comparable
    gates['zeroExecutionErrors'] = all(not read(f).get('error') for f in all_results if 'slot' in read(f))
    missing_latency = [str(f.parent.relative_to(DIR)) for f in all_results if ('slot' not in read(f) or read(f)['slot'].get('mode') == 'turn_search') and not (f.parent / 'latency-breakdown.json').exists()]
    gates['latencyBreakdownsComplete'] = not missing_latency
    current_runtime_stats = dict(searchLatency=q(current_ms), rootLatency=q(current_roots), queueLatency=q(current_queues), retaliation=dict(current_retaliation), decisionTimeouts=current_timeouts, wallTruncations=current_walls, scope='仅第0代v1搜索补测、第1代搜索面板与60局教师采样；纯策略候选、原v0及旧schema历史模型另计')
    summary = dict(passed=all(gates.values()), gates=gates, championGeneration=champion, latestCompletedGeneration=latest, latestValueCalibration=dict(passed=latest_calibration['passed'], failedSlices=latest_failed_slices), arms=arms, completeArms=complete_arms, victoryByPanel=victory, sameRuntimePureComparison=dict(baselineWins=pure_before, candidateWins=pure_after, candidatePromoted=champion == latest, improves=pure_after > pure_before), expertExtraction=extraction, training=dict(updates=training['updates'], samples=training['samples']), strictAttempts=attempts, uncoveredLogs=uncovered, actualActions=sum(a['actions'] for a in attempts), witnessActions=sum(a['witnessActions'] for a in attempts), timeoutAttempts=timeouts, wallAttempts=walls, unknownStopAttempts=unknown_stops, searchLatency=q(search_ms), rootLatency=q(root_ms), queueLatency=q(queue_ms), retaliation=dict(retaliation), directoryBytesBeforeReports=bytes_used, independentEvaluation=False)
    summary['currentRuntime'] = current_runtime_stats
    summary['missingLatencyBreakdowns'] = missing_latency
    device_receipt = DIR / 'device-comparison-10-run02/summary.json'
    if device_receipt.exists():
        summary['priorDeviceDiagnostic'] = dict(path='device-comparison-10-run02/REPORT.md', inherited=True, includedInLeagueLatency=False, phoneTestingResumed=False)
    save(DIR / 'gate-summary.json', summary); save(DIR / 'baseline-provenance.json', provenance)
    lines = ['# 阶段5同场配对实战', '', '自然胜负、动作截断、双方决策超时、错误与墙钟截断分开计数。全部是已消费开发面板。', '', '|策略|固定20胜/负/截断/决策超时/墙钟/错误|扩展20胜/负/截断/决策超时/墙钟/错误|多人16胜/负/截断/决策超时/墙钟/错误|自然胜总计|', '|---|---|---|---|---:|']
    for name, groups in arms.items():
        cells = []
        for panel in panels:
            c = Counter()
            for p in (['3ffa', '4ffa', '2v2'] if panel == 'multiplayer' else [panel]): c.update(groups.get(p, {}))
            cells.append('/'.join(str(c[k]) for k in ['natural_win', 'natural_loss', 'action_truncation', 'decision_timeout', 'wall_truncation', 'error']))
        lines.append('|' + name + '|' + '|'.join(cells) + '|' + str(sum(wins(groups, p) for p in panels)) + '|')
    lines += ['', f'当前冠军为第 {champion} 代，最新完成候选为第 {latest} 代。未晋升候选的表格单独列出。', '', '各 3FFA/4FFA/2v2 子面板、逐局路径、完整门禁及延迟见 gate-summary.json 与各代 arena-summary.json。原历史双人基线40槽继承原身份收据，多人32槽由本阶段补测；历史原始时延预算与本阶段门槛不混为同一性能证明。', '', '两个旧历史模型的冻结schema会拒绝多人淘汰后的isAlive=false。该类错误按错误保留，不放宽schema或改编码，也不把错误造成的0胜当作公平胜率超越证据。', '', f'全尝试 strict={bool(strict_all)}；实际动作 {summary["actualActions"]}，反扑动作 {summary["witnessActions"]}。决策超时尝试 {len(timeouts)}，墙钟截断 {len(walls)}；不剔除失败尝试。']
    lines += ['', f'第0代纯策略在当前先验下为{pure_before}/56胜，第{latest}代候选纯策略为{pure_after}/56胜。只有这组同运行时对比才用于判断蒸馏提升；阶段4原始纯策略20胜到第0代的提升包含先验修订。第0代搜索同时列出最初v0与当前v1两组，晋升只对比v1。']
    (DIR / 'BATTLES.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    failed = [k for k, v in gates.items() if not v]
    save(DIR / 'TASK_STATE.json', dict(status='completed' if not failed else 'completed_quality_unmet', targetGeneration=latest, championGeneration=champion, gen01Complete=latest >= 1, failedGates=failed, strictAllAttempts=bool(strict_all), guiIntegration=False, phoneTesting=False, pcResumeCompleted=True))
    latest_value_note = f'第{latest}代价值校准通过全部16切片。' if latest_calibration['passed'] else f'第{latest}代8个预登记价值目标全部未达16切片；已选目标通过{16 - len(latest_failed_slices)}/16，失败切片：{", ".join(latest_failed_slices)}。无合格目标时按预定训练NLL选取回退候选，未根据对战结果改校准。'
    report = f'''# 双流 v2 阶段5报告

完成日期：{report_date}（北京时间）。

本阶段执行到第 {latest} 代；当前冠军第 {champion} 代。完整验收通过={all(gates.values())}，未通过项：{', '.join(failed) or '无'}。没有接入GUI或应用AI入口。

当前冠军纯策略{sum(wins(pure, p) for p in panels)}/56胜，搜索{sum(wins(search, p) for p in panels)}/56胜；第{latest}代候选纯策略{pure_after}/56胜，搜索{sum(wins(candidate_search, p) for p in panels)}/56胜。纯策略同运行时训练前{pure_before}胜、训练后{pure_after}胜；不能用相较阶段4原始20胜的差异替代蒸馏有效性判断。

实战见 [BATTLES.md](BATTLES.md)，逐项机器证据见 [gate-summary.json](gate-summary.json)。固定初态与随机种子继承阶段3/4，开发面板不称独立泛化。失败候选保留，晋升与最终全面超越验收分开。

## 修复与数值

招募以留存军力抵消金币转换成本并奖励外移部署；默认连动通过实质战术增益才允许接管，安全守卫允许否决危险方案；敌方反扑不调用网络。多人目标加入指挥官、残血军与弱方城堡。新价值层按训练集拟合军力、建筑收入、指挥官、可行动单位与凸组合；第0代8个预登记目标中有1个通过全部16切片。原89状态第0代PyTorch/Node/真实Chrome的网络及组合最大误差0、argmax一致，临时Profile清理通过。各候选结果在同代数值收据中保留。

{latest_value_note}该代89状态三端检查={latest_parity['passed']}；价值质量与数值一致性是两项独立结论。

第0代实战发现一次模型1032ms根步、两次早期对手超时、队列GC尾部及少量反扑未完成，原失败尝试保留。第1代据此增加200ms执行余量、预算不足时完成静态顺位覆盖、队列改用定向合法动作查询，并排除免费召唤物的付费产能奖励；依据是运行时故障而非战绩调参。第0代进程始终使用其已加载版本，完整源码快照保存在generations/gen_00/runtime-snapshot，修订见RUNTIME_REVISION.json。因此两代搜索对比同时包含运行时修订和蒸馏；纯策略动作先验保持相同，纯策略对比不受搜索预算修订影响。

另外补测当前v1运行时第0代搜索56槽，保存在champion-search-arena；当前先验第0代纯策略56槽保存在champion-pure-arena。最新候选晋升需在同运行时的固定、扩展、多人三个纯策略和搜索面板均不退化。纯策略训练前{pure_before}/56胜，训练后候选{pure_after}/56胜，不能把相比阶段4的20胜全部归因于蒸馏。

第0代当前搜索教师的双人胜场为25/40，纯策略为27/40；它并非所有场景都更强的专家。本轮需要按完整面板检验蒸馏收益，优化器更新次数和开发集动作头命中率不能替代实战结果。

## 联赛与恢复

每代60局、24/21/15混合采样，种子、训练前缀和初态规则SHA提前预留。全部实际动作及反扑独立strict核验；纠错样本2.5倍，其余获胜轨迹1.25倍。真实终局六槽价值与根搜索联盟标量分别监督，截断不伪造自然赢家。基础池约2万条稳定SHA抽样，结合最近三代专家池，AdamW余弦退火热启动更新；完整检查点包含优化器、随机状态、批次游标和输入身份。具体训练局数、样本和更新以各代extraction-summary.json/training-complete.json为准。

首轮联赛计划被固定开发集前检在任何采样动作之前拒绝，保存在planning-attempt01-dev-isolation；首批60个种子与前缀废弃不重用，第1代实际使用后续60个种子，游标推进至120。当前排重同时覆盖冻结开发集和历史/当前评测的完整前态及权威规则态。

首轮3538次更新使用了过宽的方案级接管标签，尚未正式验收即发现问题。该轮权重、优化器、原始标签等127项产物按SHA归档至generations/gen_01/training-attempt01-plan-level，未采用为冠军。随后保持60局实际轨迹不变，从冠军重新热启动：逐状态用真实纯策略复算首选，包含队列动作；只对实际改写赋2.5倍权重。修正后提取{extraction['eligible']}样本，其中{extraction['corrections']}个纠错、{extraction['correctedQueuedActions']}个队列纠错；{extraction['unchangedPlanOverrides']}次未改写当前动作的接管不视为纠错，默认首选抽查{extraction['defaultChecks']}次无差异。最终训练{training['updates']}次更新、处理{training['samples']}样本。独立合法三步回归同时验证权重1.25/2.5/1.25与队列不复用根价值。

一行续跑见 [LEAGUE_RESUME_GUIDE.md](LEAGUE_RESUME_GUIDE.md)。不读取实战胜负调超参数，不在价值门禁失败时伪装合格，也不保证有限资源下无限物理存储。

追加评测后的完整前/后态SHA隔离核对={isolation['passed']}，详细样本数与重合项见post-evaluation-isolation.json；它不替代训练前的历史、开发集及规则等价态排重。

后续建代计划的排重扫描补入已有设备专项轨迹，届时通过权威引擎恢复并加入完整SHA与规则等价态。本轮没有重写第1代冻结输入索引；未来替换索引前按内容SHA保全旧压缩文件，并按含临时文件的峰值占用检查295MB门禁。空间不足拒绝、旧字节保全、原子替换、重复调用及错误历史副本拒绝的回归通过，见evaluation-index-regression.json。

## 性能与证据边界

本阶段电脑联赛、正式搜索与教师采样整体p95={q(search_ms)['p95']}ms，根p95={q(root_ms)['p95']}ms，队列最大={q(queue_ms)['max']}ms。既有设备专项诊断不混入这组时延。计时为AI.getAction，不包含证据压缩和磁盘同步。决策超时={len(timeouts)}，墙钟截断={len(walls)}，失败尝试完整保留。阶段4旧失败日志仅可恢复前缀，未知尾部不补造；本阶段全尝试strict={bool(strict_all)}。

当前v1搜索及教师采样单独统计（不含纯策略候选）：整体p95={q(current_ms)['p95']}ms，根p95={q(current_roots)['p95']}ms，队列最大={q(current_queues)['max']}ms；反扑完成{current_retaliation['complete']}/{current_retaliation['attempts']}，决策超时{len(current_timeouts)}、墙钟截断{len(current_walls)}。这组统计不替代包含全部纯策略、原v0和旧历史尝试的验收。

日志每行独立gzip成员并fsync，超过3MB和未close恢复追加回归通过；完局后无损合并压缩。阶段1～4的{len(before['history'])}份实存文件SHA保持={not history_changes}；5个受保护入口SHA全保持={not protected_changes}，变化项为{', '.join(protected_changes) or '无'}。本任务未写这些入口，发现工作区变化后保留当前内容，不回滚或篡改开工快照；因此不能声称入口SHA全部未变。目录报告前占用{bytes_used / 1e6:.2f}MB。公共检查见public-checks.json。没有部署或修改权威规则。

用户此前要求的手机与电脑各10槽专项诊断已完成，证据保存在device-comparison-10-run02；首轮Chrome87接口兼容失败为零动作错误，原件保留。最新指令取消后续手机测试，本次只在电脑补齐第1代验收，没有再次连接或操作手机。专项诊断不取代112槽正式面板，其动作同样纳入strict与训练隔离核验。

联赛因用户停止曾在扩展槽留下23实际动作、28反扑动作；原始字节与strict收据保留在generations/gen_01/arena/attempts/user-stop-20261020。恢复后同槽从原始初态和种子重新开始，不把中断前缀计为完整槽。恢复命令见resume_arena.py，既有训练、校准及模型没有重算。

{public_test_note}跳过项不计为通过，本轮没有重验APK原始解包资源。

历史多人补测的一次空见证日志封口异常遮蔽了最初停止原因，已保留0字节原件、恢复1460个已持久动作并通过strict；原attempt仍标为interrupted/原因未知。同槽后续正式结果另存，未用重跑覆盖原证据。两个旧模型的冻结schema不能处理部分多人淘汰状态，错误单列；不能据此宣称公平超越历史多人棋力。
'''
    (DIR / 'REPORT.md').write_text(report, encoding='utf-8')
    status = ROOT / 'ai_training/status/CURRENT.md'; content = status.read_text('utf-8')
    section = f'''<!-- dual-stream-v2-phase5-20261020 -->
## {report_date} 双流v2阶段5执行至第{latest}代（{'全部门禁通过' if all(gates.values()) else '质量门禁未全通过'}）

见[REPORT.md](../dual_stream_v2_phase5_20261020/REPORT.md)、[BATTLES.md](../dual_stream_v2_phase5_20261020/BATTLES.md)、[续跑说明](../dual_stream_v2_phase5_20261020/LEAGUE_RESUME_GUIDE.md)。当前冠军第{champion}代；未通过项：{', '.join(failed) or '无'}。全尝试strict={bool(strict_all)}，实际/反扑动作{summary['actualActions']}/{summary['witnessActions']}；冠军价值16切片={calibration['passed']}，最新候选={latest_calibration['passed']}。阶段1～4 SHA保持={not history_changes}，受保护入口SHA全保持={not protected_changes}；本任务未写GUI入口，保留工作区其它变化。结果如实保留，不把流程结束当作棋力通过。

冠军纯策略/搜索自然胜场{sum(wins(pure, p) for p in panels)}/{sum(wins(search, p) for p in panels)}，候选纯策略/搜索{pure_after}/{sum(wins(candidate_search, p) for p in panels)}（各56槽）。

按最新用户要求只在电脑补齐剩余正式验收，本次没有连接或操作手机。此前设备专项10槽记录保留，不重复运行，也不混入联赛时延；后续手机测试已取消。
<!-- end-dual-stream-v2-phase5-20261020 -->'''
    content = re.sub(r'<!-- dual-stream-v2-phase5-20261020 -->.*?<!-- end-dual-stream-v2-phase5-20261020 -->', lambda _: section, content, flags=re.S); status.write_text(content, encoding='utf-8')
    manifest = {str(p.relative_to(DIR)).replace('\\', '/'): dict(bytes=p.stat().st_size, sha256=sha(p)) for p in DIR.rglob('*') if p.is_file() and p != DIR / 'DELIVERY_MANIFEST.json'}
    runtime_sources = {str(p.relative_to(ROOT)).replace('\\', '/'): sha(p) for p in (ROOT / 'src/ai_runtime/dual_v2').glob('*.ts')}
    save(DIR / 'DELIVERY_MANIFEST.json', dict(files=manifest, fileCount=len(manifest), bytes=sum(x['bytes'] for x in manifest.values()), publicRuntimeSha256=runtime_sources, currentStatusSha256=sha(status), preservedHistorical=not history_changes, protectedEntrypointShaUnchanged=not protected_changes, phase='dual-stream-v2-phase5', championSha256=state['championSha256']))
    print(json.dumps(dict(passed=all(gates.values()), failed=failed, champion=champion, latest=latest), ensure_ascii=False))


if __name__ == '__main__': main()
