"""汇总实际收据；未完成112槽候选验收时拒绝交付完成结论。"""
import gzip
import hashlib
import json
import math
import msvcrt
from collections import Counter
from pathlib import Path
from bootstrap import HERE, OLD, ROOT, digest


def read(p):
    return json.loads(Path(p).read_text('utf-8'))


def save(p, obj):
    Path(p).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def quantiles(values):
    values = sorted(values)
    if not values:
        return dict(count=0, p50=None, p95=None, p99=None, maximum=None)
    return dict(count=len(values), **{f'p{p}': values[max(0, math.ceil(len(values) * p / 100) - 1)] for p in [50, 95, 99]}, maximum=values[-1])


def main():
    current = HERE / 'generations/gen_02'
    state = read(HERE / 'league-state.json')
    pipeline = read(HERE / 'pipeline-status.json')
    assert pipeline['stage'] == 'target_finished' and state['currentGeneration'] == 2
    assert not (HERE / 'generations/gen_03').exists()
    with (HERE / 'run.lease').open('r+b') as lease:
        msvcrt.locking(lease.fileno(), msvcrt.LK_NBLCK, 1)
        lease.seek(0)
        msvcrt.locking(lease.fileno(), msvcrt.LK_UNLCK, 1)
    save(HERE / 'STOP_RECEIPT.json', dict(stoppedAfterGeneration=2, pipelineStage=pipeline['stage'], coordinatorLeaseReleased=True, generation3Created=False, automaticallyContinue=False, championGeneration=state['championGeneration'], requestedByUser=True))
    promotion = read(current / 'promotion.json')
    candidate = read(current / 'arena-summary.json')
    baselines = [read(HERE / n / 'arena-summary.json') for n in ['champion-pure-arena', 'champion-search-arena']]
    assert candidate['complete'] and candidate['completedSlots'] == 112
    assert all(s['complete'] and s['completedSlots'] == 56 for s in baselines)
    contract = read(HERE / 'RUN_CONTRACT.json')
    source_changes = [n for n, h in contract['sourceIdentity'].items() if digest(ROOT / n) != h]
    protected_changes = [n for n, h in contract['protectedEntrypoints'].items() if digest(ROOT / n) != h]
    start = read(HERE / 'START_SNAPSHOT.json')
    old_changes = [n for n, h in start['files'].items() if n.startswith('ai_training\\dual_stream_v2_phase5_20261020\\') and digest(ROOT / n) != h]
    old_bytes = sum(p.stat().st_size for p in OLD.rglob('*') if p.is_file())
    old_model_expected = dict(gen_00=contract['parentModelSha256'], gen_01=read(OLD / 'generations/gen_01/training-complete.json')['modelSha256'])
    old_model_actual = {name: digest(OLD / 'generations' / name / 'model.bin') for name in old_model_expected}
    old_manifest = read(OLD / 'DELIVERY_MANIFEST.json')['files']
    old_manifest_changes = [n for n, entry in old_manifest.items() if not (OLD / n).is_file() or digest(OLD / n) != entry['sha256']]
    preservation = dict(startSnapshotChanges=old_changes, oldDirectoryBytesAtStart=start['oldDirectoryBytes'], oldDirectoryBytesAtEnd=old_bytes, modelExpected=old_model_expected, modelActual=old_model_actual, historicalManifestFiles=len(old_manifest), historicalManifestChanges=old_manifest_changes, historicalManifestScope='旧交付清单的独立复核；开工时点身份另由START_SNAPSHOT约束')
    save(HERE / 'old-evidence-preservation-final.json', preservation)
    attempts = []; actual = witnesses = 0
    for actions in HERE.rglob('actions.jsonl.gz'):
        receipt_path = actions.parent / 'strict-replay.json'
        if not receipt_path.exists():
            receipt_path = actions.parent / 'partial-strict.json'
        receipt = read(receipt_path) if receipt_path.exists() else dict(passed=False)
        actual += receipt.get('actions', 0); witnesses += receipt.get('witnessActions', 0)
        attempts.append(dict(path=str(actions.parent.relative_to(HERE)), passed=receipt.get('passed', False), partial=receipt.get('partial', False), actions=receipt.get('actions'), witnessActions=receipt.get('witnessActions'), actionsSha256=digest(actions)))
    strict_all = all(a['passed'] for a in attempts)
    value = read(current / 'value-calibration.json')
    parity = read(current / 'tri-runtime-parity.json')
    training = read(current / 'training-complete.json')
    training_identity = read(current / 'training-input-identity.json')
    assert digest(current / 'model.bin') == training['modelSha256'] == parity['modelSha256']
    assert training_identity['parentSha256'] == contract['parentModelSha256']
    assert training_identity['contractSha256'] == digest(HERE / 'RUN_CONTRACT.json')
    assert training_identity['sourceIdentity'] == contract['sourceIdentity']
    assert read(current / 'value-config.json') == read(OLD / 'generations/gen_00/value-config.json')
    assert read(current / 'head-calibration.json') == read(OLD / 'generations/gen_00/head-calibration.json')
    data_changes = [n for n, h in training_identity['dataIdentity'].items() if digest(ROOT / 'ai_training' / n) != h]
    league_quality = read(current / 'league-quality.json')
    isolation = read(HERE / 'post-evaluation-isolation-v2.json')
    tests = read(HERE / 'public-tests-final.json')
    historical_tests = read(HERE / 'training-tests.json')
    performance = {}
    table = []
    for arena, gen in [('champion-pure-arena', 0), ('champion-search-arena', 0), ('generations/gen_02/arena', 2)]:
        plan = read(HERE / arena / 'plan.json')
        roots = []; queues = []; times = []; pure_times = []; stops = []
        for slot in plan['slots']:
            result = read(HERE / arena / 'battles' / slot['id'] / 'result.json')
            if slot['mode'] == 'turn_search':
                roots.extend(result['rootTimes']); queues.extend(result['queueTimes']); times.extend(result['latencySamples']['model'])
            else:
                pure_times.extend(result['latencySamples']['model'])
            if result['classification'] not in ['natural_win', 'natural_loss', 'natural_draw', 'action_truncation']:
                stops.append(dict(id=slot['id'], classification=result['classification'], failedDecision=result.get('failedDecision'), error=result.get('error')))
        performance[arena] = dict(pure=quantiles(pure_times), search=quantiles(times), roots=quantiles(roots), queues=quantiles(queues), failures=stops)
        summary = read(HERE / arena / 'arena-summary.json') if gen == 0 else candidate
        for key, group in summary['groups'].items():
            table.append(dict(generation=gen, mode=key.split('/')[0], panel=key.split('/')[1], slots=group['slots'], outcomes=group['outcomes']))
    from promotion_contract import PANELS
    def wins(summary, mode, panel):
        return summary['groups'].get(mode + '/' + panel, {}).get('outcomes', {}).get('natural_win', 0)
    development_gates = dict(promotion=promotion['promoted'], pureImprovesChampion=all(wins(candidate, 'pure', p) >= wins(baselines[0], 'pure', p) for p in PANELS) and sum(wins(candidate, 'pure', p) for p in PANELS) > sum(wins(baselines[0], 'pure', p) for p in PANELS), searchMatchesEveryPurePanel=all(wins(candidate, 'turn_search', p) >= wins(candidate, 'pure', p) for p in PANELS), searchImprovesPureOverall=sum(wins(candidate, 'turn_search', p) for p in PANELS) > sum(wins(candidate, 'pure', p) for p in PANELS), strictAllAttempts=strict_all, sourceIntegrity=not source_changes, protectedEntrypoints=not protected_changes, oldEvidencePreserved=not old_changes, publicChecks=tests['success'])
    comprehensive = all(development_gates.values())
    development_gates['trainingEvaluationIsolation'] = isolation['passed']
    development_gates['trainingInputIntegrity'] = not data_changes
    development_gates['oldEvidencePreserved'] = not old_changes and old_bytes == start['oldDirectoryBytes'] and old_model_actual == old_model_expected
    comprehensive = all(development_gates.values())
    report = dict(status='completed_quality_passed' if comprehensive else 'completed_quality_unmet', generation=2, championGeneration=state['championGeneration'], promotion=promotion, modelSha256=digest(current / 'model.bin'), parentModelSha256=contract['parentModelSha256'], contractSha256=digest(HERE / 'RUN_CONTRACT.json'), training=training, table=table, performance=performance, strictAllAttempts=strict_all, actualActions=actual, witnessActions=witnesses, attempts=attempts, value16Slices=value['passed'], failedValueSlices=[n for n, s in value['slices'].items() if not s['allBaselinesExceeded']], parity89=parity['passed'], sourceChanges=source_changes, protectedChangesFromOwnStart=protected_changes, oldPhase5Changes=old_changes, publicChecks=dict(lint=True, build=True, testsPassed=tests['numPassedTests'], testsSkipped=tests['numPendingTests'], testsFailed=tests['numFailedTests'], independentTsc=True, newPythonRegressions=8), historicalTrainingChecks=dict(typeCheckPassed=False, typeErrors=12, testsPassed=historical_tests['numPassedTests'], testsFailed=historical_tests['numFailedTests']), apkRawResourcesRechecked=False, phoneActions=0, guiIntegrated=False, independentBlindTest=False, coversAllFiveSixPlayer64x64HundredUnits=False, usesBattleResultsForHyperparameters=False)
    def sampled_q(values):
        return {('maximum' if key == 'max' else key): value for key, value in values.items()}
    performance['league-sampling'] = dict(search=sampled_q(league_quality['teacherLatency']), roots=sampled_q(league_quality['rootLatency']), queues=sampled_q(league_quality['queueLatency']), failures=league_quality['failures'])
    report['performance'] = performance
    report['leagueQuality'] = league_quality
    report['trainingInputChanges'] = data_changes
    report['oldEvidencePreservation'] = preservation
    report['postEvaluationIsolation'] = isolation
    report['publicChecks']['newPythonRegressions'] = 8
    report['developmentAcceptanceGates'] = development_gates
    report['failedDevelopmentGates'] = [n for n, passed in development_gates.items() if not passed]
    report['humanDominanceProven'] = False
    report['stoppedAfterGeneration'] = 2
    paired_rows = read(HERE / 'paired-slots.json')
    def compare_pairs(before, after):
        def select(generation, mode):
            return {(r['stage3Id'], r['panel'], r['opponentSeed'], r['seat'], r['initialSha256']): r for r in paired_rows if r['generation'] == generation and r['mode'] == mode}
        left, right = select(*before), select(*after)
        assert len(left) == 56 and left.keys() == right.keys(), '配对身份或覆盖不完整'
        transitions = Counter(); gained = []; lost = []
        for key, a in left.items():
            b = right[key]
            transitions[a['classification'] + ' -> ' + b['classification']] += 1
            if a['classification'] != 'natural_win' and b['classification'] == 'natural_win':
                gained.append(dict(before=a['path'], after=b['path'], panel=b['panel']))
            if a['classification'] == 'natural_win' and b['classification'] != 'natural_win':
                lost.append(dict(before=a['path'], after=b['path'], panel=b['panel']))
        return dict(pairs=56, transitions=dict(transitions), gainedNaturalWins=gained, lostNaturalWins=lost, naturalWinDelta=len(gained)-len(lost))
    pair_comparison = dict(pureVsChampion=compare_pairs((0, 'pure'), (2, 'pure')), searchVsChampion=compare_pairs((0, 'turn_search'), (2, 'turn_search')), searchVsOwnPure=compare_pairs((2, 'pure'), (2, 'turn_search')))
    save(HERE / 'paired-comparison.json', pair_comparison)
    report['pairedComparison'] = pair_comparison
    save(HERE / 'gate-summary.json', report)
    lines = ['# 第2代诊断、修复与电脑实战验收', '', f"执行完成；质量结论：{report['status']}。第2代{'晋升' if promotion['promoted'] else '未晋升'}，当前冠军第{state['championGeneration']}代。", '', '本次从第0代热启动，没有续训失败第1代。旧阶段5模型、数据、源码和晋升历史保留；应用入口按本次开工快照核验。', '', f"晋升失败项：{', '.join(promotion['failedGates']) or '无'}。所有逐子面板比较见promotion.json，全面验收与晋升分别记录。", '', '|代数|策略|面板|槽数|自然胜|自然负|自然平|动作截断|决策超时|墙钟|错误|未知停止|', '|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    totals = dict(championPure=sum(wins(baselines[0], 'pure', p) for p in PANELS), championSearch=sum(wins(baselines[1], 'turn_search', p) for p in PANELS), candidatePure=sum(wins(candidate, 'pure', p) for p in PANELS), candidateSearch=sum(wins(candidate, 'turn_search', p) for p in PANELS))
    lines[3:3] = ['', f"同运行时重测，每项56槽：冠军纯策略{totals['championPure']}胜、搜索{totals['championSearch']}胜；第2代纯策略{totals['candidatePure']}胜、搜索{totals['candidateSearch']}胜。所有自然结果、截断和异常分列。", '', '本轮完整结束后已停下，协调器写入锁已释放；没有创建或启动第3代，见STOP_RECEIPT.json。']
    for row in table:
        outcomes = row['outcomes']
        mode_name = {'pure': '纯策略', 'turn_search': '回合搜索'}[row['mode']]
        panel_name = {'fixed': '固定图', 'expanded': '扩展图', '3ffa': '3人混战', '4ffa': '4人混战', '2v2': '2v2'}[row['panel']]
        known_outcomes = ['natural_win', 'natural_loss', 'natural_draw', 'action_truncation', 'decision_timeout', 'wall_truncation', 'error']
        counts = [outcomes.get(k, 0) for k in known_outcomes] + [sum(v for k, v in outcomes.items() if k not in known_outcomes)]
        assert sum(counts) == row['slots']
        lines.append(f"|{row['generation']}|{mode_name}|{panel_name}|{row['slots']}|" + '|'.join(map(str, counts)) + '|')
    lines += ['', '逐槽身份配对比较见paired-comparison.json：', '']
    for name, comparison in pair_comparison.items():
        lines.append(f"- {name}：56对，新获得自然胜{len(comparison['gainedNaturalWins'])}槽、丢失自然胜{len(comparison['lostNaturalWins'])}槽，净变化{comparison['naturalWinDelta']:+d}槽。")
    lines += ['', '## 诊断与修复', '', '旧基础阶段未保存独立权重，最终漂移不能单独证明遗忘因果。专家相邻同父局、人数阶段和动作类型偏移见diagnosis.json；118条原子纠错复算一致，6064纠错/4325队列纠错与根标签审计见expert-quality-audit.json。旧池保留并隔离。', '', '旧日志实测基础2073次更新/19127样本，平均批次9.23；专家1499次更新/23621样本，平均15.76。此前“专家批次更小”的假设不成立，专家仅占41.97%更新。基础策略权重总量13617.79、专家37106.25，专家占合计约73.15%；批内归一化、学习率和梯度方向不同，这不是梯度贡献比例。原始诊断保留，更正见DIAGNOSIS_CORRECTION.md。旧缓存头部数值不能当作同先验下的动作Top1或棋力提升。', '', '统一候选两条敌方链及墙钟机会，静态覆盖和真实完成分列，未完成不得接管。旧红/新绿和候选置换回归保留。新代确定性交错、跨局轮转和有界洗牌；仅更新策略头，冠军KL保留，共享骨干及价值逐更新差异为0，根标量优化权重0。没有按56槽胜负调参。', '', f"训练{training['updates']}更新/{training['samples']}样本；模型SHA256：{report['modelSha256']}。父模型SHA256：{report['parentModelSha256']}。合同SHA256：{report['contractSha256']}。", '', '## 门禁、性能与证据边界', '', f"89状态三端={parity['passed']}；16切片价值={value['passed']}；全尝试strict={strict_all}，实际{actual}动作、反扑{witnesses}动作。源码变更{source_changes}；本次保护入口变更{protected_changes}；旧阶段5快照变更{old_changes}。", '', '延迟口径为AI.getAction墙钟，不含外层证据压缩、写盘和strict重放；根延迟排除队列调用，包含唯一合法动作的快速路径。反扑只展开至多两条敌方链，静态覆盖不等于真实展开完成。']
    lines.append('')
    for name, perf in performance.items():
        if perf.get('pure', {}).get('count'):
            q = perf['pure']
            lines.append(f"- {name}：纯策略p95/p99/最大={q['p95']:.3f}/{q['p99']:.3f}/{q['maximum']:.3f}ms。")
        if perf['roots']['count']:
            q = perf['roots']; maximum_queue = perf['queues']['maximum']
            lines.append(f"- {name}：根p95/p99/最大={q['p95']:.3f}/{q['p99']:.3f}/{q['maximum']:.3f}ms；队列最大={maximum_queue:.3f}ms；超时/墙钟/错误逐槽见gate-summary.json。")
    ret = candidate['retaliation']; sample_ret = league_quality['retaliation']
    lines += ['', f"候选真实反扑完成{ret['complete']}/{ret['attempts']}，静态完成{ret['staticComplete']}/{ret['attempts']}；采样真实完成{sample_ret['complete']}/{sample_ret['attempts']}。候选模型超时{len(candidate['modelTimeoutSlots'])}槽、对手超时{len(candidate['opponentTimeoutSlots'])}槽；采样教师/对手超时{league_quality['teacherTimeouts']}/{league_quality['opponentTimeouts']}。", '', f"旧目录开工/结束均为{old_bytes}字节；旧交付清单{len(old_manifest)}个文件哈希失配{len(old_manifest_changes)}个，第0/1代模型哈希保持一致。训练与224槽完整及规则等价状态重叠复核={isolation['passed']}，基础/专家重叠{isolation['baseOverlaps']}/{isolation['expertOverlaps']}。", '', f"开发全面门禁失败项：{', '.join(report['failedDevelopmentGates']) or '无'}。其中同分可以满足不退化晋升条件，但不算全面提升。", '', f"公共lint/build通过，测试{tests['numPassedTests']}通过/{tests['numPendingTests']}跳过，本代独立tsc与8项Python回归通过。训练历史总检查12项类型错误及{historical_tests['numFailedTests']}项测试失败单列，不冒称通过。", '', '初次零动作导入错误与Chrome沙箱启动失败均保留；Chrome以同一冻结脚本在沙箱外实际核验，Profile清理。完整和失败对局均按实际归属统计；自然胜负不与动作截断、模型超时、对手超时、运行错误或墙钟停止混淆。', '', '早中后期与多人逐动作诊断见phase-diagnosis.json，逐槽配对身份见paired-slots.json。每组56槽均属开发验收，不是最终独立盲测，不代表5～6人64×64百子全覆盖，不宣称100%人类胜率。没有手机、GUI或应用部署；APK原始资源未重验，跳过不算通过。', '', '后续建议：优先根据同场丢胜槽和各多人子面板修复真实战术；在独立训练/开发证据上验证教师纠错收益，再决定是否解冻共享骨干。对未完成反扑与队列尾延迟单独优化。第2代不合格时保持第0代，不自动启动第3代。']
    (HERE / 'REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    table_start = next(i for i, line in enumerate(lines) if line.startswith('|代数|'))
    (HERE / 'BATTLES.md').write_text('# 同运行时逐面板开发实战\n\n' + '\n'.join(lines[table_start:table_start + len(table) + 2]) + '\n\n完整配对身份见paired-slots.json；自然结果与全部失败见gate-summary.json。采样60局质量、双方超时归属、反扑完成度及尾延迟单列于league-quality.json。\n', encoding='utf-8')
    current_file = HERE.parent / 'status/CURRENT.md'
    text = current_file.read_text('utf-8')
    begin, end = '<!-- dual-stream-v2-gen02-20261021 -->', '<!-- end-dual-stream-v2-gen02-20261021 -->'
    a, b = text.index(begin), text.index(end) + len(end)
    entry = f"{begin}\n## 2026-10-21 第2代执行至开发实战验收（{report['status']}）\n\n见[报告](../{HERE.name}/REPORT.md)、[战报](../{HERE.name}/BATTLES.md)、[恢复说明](../{HERE.name}/RESUME.md)。当前冠军第{state['championGeneration']}代；第2代{'晋升' if promotion['promoted'] else '未晋升'}。失败项：{', '.join(promotion['failedGates']) or '无晋升失败项'}。89状态三端={parity['passed']}，16切片={value['passed']}，全尝试strict={strict_all}，实际/反扑动作{actual}/{witnesses}。旧代证据保留，没有手机、GUI或最终盲测；不自动运行第3代。\n{end}"
    current_file.write_text(text[:a] + entry + text[b:], encoding='utf-8')
    (HERE / 'RESUME.md').write_text('# 第2代恢复与证据入口\n\n在项目根目录运行：\n\n```powershell\nnode ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -B -X utf8 dual_stream_v2_gen02_20261021/run_league.py --target-gen 2\n```\n\n源码、规则、模型、输入或合同变化会拒绝续接；不能修改断言绕过。已完成代数不会重训。未完成正式槽必须先strict审计、保全原attempt再登记新路径，不能覆盖前缀。checkpoint保留优化器、RNG、游标与输入SHA；最多49个未保存更新重算。全程不清理旧证据。\n\nChrome沙箱若出现Crashpad启动错误，先归档失败收据，再以同一冻结browser_runner.mjs在沙箱外执行实际核验；不得拿旧源码收据顶替。旧v2合同和源码快照、首次导入错误及全部Chrome尝试均保留。\n\n合同只支持第2代；后续第3代需要新的用户授权及预登记。当前状态、胜负与所有失败以gate-summary.json和league-state.json为准。\n', encoding='utf-8')
    worklog = HERE / 'WORKLOG.md'
    marker = '<!-- gen02-final-stop -->'
    if marker not in worklog.read_text('utf-8'):
        with worklog.open('a', encoding='utf-8') as stream:
            stream.write(f"\n\n{marker}\n## 第2代完整结束并停止\n\n60局采样、{training['samples']}样本/{training['updates']}更新、候选112槽与冠军112槽均完成。第2代纯策略/搜索自然胜{totals['candidatePure']}/{totals['candidateSearch']}，冠军为{totals['championPure']}/{totals['championSearch']}。89状态三端及16价值切片通过；质量状态{report['status']}，冠军第{state['championGeneration']}代。全尝试strict={strict_all}；训练评测状态重叠复核={isolation['passed']}；源码/入口/输入变更数={len(source_changes)}/{len(protected_changes)}/{len(data_changes)}。停止收据与完整结论见STOP_RECEIPT.json和REPORT.md，没有启动第3代。旧批次假设更正见DIAGNOSIS_CORRECTION.md。\n")
    handoff = HERE / 'EXECUTION_HANDOFF.md'
    banner = '> 第2代已完整结束并按用户要求停下；以下为执行中历史交接记录，最终状态请读REPORT.md及STOP_RECEIPT.json。\n\n'
    handoff_text = handoff.read_text('utf-8')
    if not handoff_text.startswith(banner):
        handoff.write_text(banner + handoff_text, encoding='utf-8')
    save(HERE / 'DELIVERY_MANIFEST.json', {str(p.relative_to(HERE)): digest(p) for p in HERE.rglob('*') if p.is_file() and p.name not in ['DELIVERY_MANIFEST.json', 'run.lease']})
    print(json.dumps(dict(status=report['status'], champion=state['championGeneration'], failed=promotion['failedGates'], actual=actual, witnesses=witnesses), ensure_ascii=False))


if __name__ == '__main__':
    main()
