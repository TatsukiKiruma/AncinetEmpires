"""汇总完整策略组合的自然结果、时延、对手回退与永久排重。"""
from pathlib import Path
import json, gzip, hashlib, math

TASK = Path(__file__).resolve().parent
ROOT = TASK.parents[1]
OUT = TASK / 'evaluation'
read = lambda p: json.loads(Path(p).read_text(encoding='utf8'))
sha = lambda b: hashlib.sha256(b).hexdigest()
PLAN = read(TASK / 'EVALUATION_SPLITS.json')

def quantiles(values):
    values = sorted(values)
    q = lambda p: values[max(0, math.ceil(len(values) * p) - 1)] if values else 0
    return {'count': len(values), 'p50': q(.5), 'p95': q(.95), 'p99': q(.99), 'max': max(values, default=0), 'over1000': sum(v > 1000 for v in values)}

def group(identifier, panel, locations):
    reused = panel == 'standard' and identifier in PLAN['historicalReuse']
    source = ROOT / PLAN['historicalReuse'][identifier] if reused else ROOT / locations[f'{panel}/{identifier}']
    evidence = OUT / 'reused' / identifier if reused else source
    summary = read(source / 'summary.json')
    strict = read(evidence / 'independent-strict-replay.json')
    assert strict['passed'] and strict['summarySha256'] == sha((source / 'summary.json').read_bytes())
    assert summary['sourceUnchanged'] and summary['modelArtifactsUnchanged']
    samples = {key: [] for key in ['model', 'hard', 'root', 'queue', 'nontrivialRoot']}
    for game in summary['games']:
        for line in (source / game['id'] / 'actions.jsonl').read_text(encoding='utf8').splitlines():
            row = json.loads(line)
            samples[row['side']].append(row['ms'])
            telemetry = row.get('telemetry')
            if row['side'] == 'model' and telemetry:
                samples['queue' if telemetry['queued'] else 'root'].append(row['ms'])
                if not telemetry['queued'] and telemetry['nodes'] > 0:
                    samples['nontrivialRoot'].append(row['ms'])
    opponent = {key: sum(game['hardTelemetry'][key] for game in summary['games']) for key in ['runtimeDecisions', 'nativeFallbacks', 'rejectedPlans', 'runtimeErrors']}
    search = {key: sum(game['searchTelemetry'][key] for game in summary['games']) for key in ['roots', 'queues', 'takeover', 'veto', 'retaliationComplete', 'retaliationAttempts']}
    distributions = {key: quantiles(values) for key, values in samples.items()}
    return {'id': identifier, 'panel': panel, 'source': str(source.relative_to(ROOT)).replace('\\', '/'),
            'reusedHistorical': reused, 'wins': summary['wins'], 'losses': summary['losses'], 'draws': summary['draws'],
            'truncated': summary['truncated'], 'errors': summary['errors'], 'games': summary['games'],
            'latency': distributions, 'opponent': opponent, 'search': search,
            'decisionLatencyGates': {'modelWithin1000Ms': distributions['model']['over1000'] == 0, 'opponentWithin1000Ms': distributions['hard']['over1000'] == 0},
            'strict': strict, 'evidence': str(evidence.relative_to(ROOT)).replace('\\', '/'),
            'elapsedSeconds': sum(game['elapsedSeconds'] for game in summary['games'])}

def paired(a, b):
    new, lost, comparable = [], [], 0
    for ga, gb in zip(a['games'], b['games']):
        assert ga['mapName'] == gb['mapName'] and ga['seat'] == gb['seat'] and ga['seed'] == gb['seed']
        if ga['cutoff'] or gb['cutoff'] or ga['error'] or gb['error']:
            continue
        comparable += 1
        if ga['classification'] != 'model_win' and gb['classification'] == 'model_win':
            new.append(ga['id'])
        if ga['classification'] == 'model_win' and gb['classification'] != 'model_win':
            lost.append(ga['id'])
    n, k = len(new) + len(lost), min(len(new), len(lost))
    p = min(1, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2**n) if n else 1
    return {'from': a['id'], 'to': b['id'], 'naturalComparablePairs': comparable, 'newWins': new, 'lostWins': lost, 'netWins': len(new) - len(lost), 'exactMcNemarTwoSidedP': p}

def coverage():
    registry = read(TASK / 'MODEL_REGISTRY.json')
    selected = {candidate['modelSha256']: candidate['id'] for candidate in PLAN['candidates']}
    rows = []
    for model in registry['models']:
        relative = Path(model['weightsPath']).relative_to(ROOT).as_posix()
        representative = selected.get(model['weightsSha256'])
        if representative:
            reason = '由同SHA的主要终态权重代表；复制品/父价值副本不重复作为独立代际。完整策略校准按代表候选冻结。'
            category = '主要终态权重及重复副本'
        elif 'dual_stream_v2_phase2_' in relative:
            category = '阶段2架构与小批量冒烟'
            reason = '随机初始化、64样本过拟合或开发失败配置，用于梯度/前向/速度一致性，未经过正式棋力训练；保留其原有门禁身份，不作为训练世代基线。'
        elif relative.endswith('stage3a-best.bin'):
            category = '阶段3校准前中间态'
            reason = 'calibrate.py从此权重继续修改headBias/value2/army_scale再导出正式纯策略；采用校准后同SHA的第0代代表该训练阶段，不把中途产物单列。'
        elif 'gen_01/training-attempt' in relative:
            category = '第1代中途训练尝试'
            reason = '早期计划层蒸馏尝试归档，后由正式gen_01完整原子合同产物替代；它是诊断/恢复证据而非额外正式代际。'
        elif 'gen_03/training-attempt' in relative:
            category = '第3代中途修复尝试'
            reason = 'prior-aware/wait-linear/joint-policy修复过程的中间权重，后续语义训练已选定最终model.bin；保留原合同证据，避免重新按本靶场反选历史尝试。'
        elif 'gen_04/grid/' in relative or 'gen_04/supervised/' in relative:
            category = '第4代开发网格及监督中间态'
            reason = '预登记开发网格或网格前监督热启动，按原协议选定最终gen_04；所选网格权重与正式终态相同且已被代表，其余不按本次实战重新挑选。'
        elif '/gen_05/epoch_' in relative:
            category = '第5代未选训练轮次'
            reason = '按冻结开发目标选择第3轮；epoch1/2用于学习曲线和恢复，未按十局胜率反选，不追加本次实战。'
        else:
            raise AssertionError(f'未解释的模型用途：{relative}')
        rows.append({'weightsPath': relative, 'weightsSha256': model['weightsSha256'], 'namedTensorSha256': model['namedTensorSha256'],
                     'evaluatedRepresentative': representative, 'category': category, 'reason': reason})
    result = {'registryGeneratedAt': registry['generatedAt'], 'registeredPackages': len(rows),
              'uniqueTensorStates': len({row['namedTensorSha256'] for row in rows}),
              'checkpointContainers': len(registry['checkpoints']), 'checkpointOnlyStates': len(registry['checkpointOnlyStates']),
              'terminalCandidates': len(selected), 'representedRegisteredPaths': sum(row['evaluatedRepresentative'] is not None for row in rows),
              'coverageUnit': '登记路径的网络权重状态；不声称穷举同权重全部历史校准与运行时组合。每个主要终态候选按登记配套组合实测。',
              'notAdditionalGameplay': True, 'stage1': '仅观测、动作、数据和规则契约，没有可评估的正式训练模型权重。',
              'legacyReferencedModel': 'sd-value-search-v4为旧特征/模型合同，无法直接装入dual-stream-v2的170张量前向；保留历史原配运行时证据，不将其伪装为v2同条件比较。',
              'models': rows}
    assert result['registeredPackages'] == 48 and result['uniqueTensorStates'] == 29
    (OUT / 'CANDIDATE_COVERAGE.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
    return result

def recommendation(standard, extended, pairs, extensionPairs, combinedPairs):
    std = {row['id']: row for row in standard}
    combined = [{ 'id': row['id'], 'standardWins': std[row['id']]['wins'], 'extensionWins': row['wins'],
                 'standardOutcome': {key: std[row['id']][key] for key in ['wins','losses','draws','truncated','errors']},
                 'extensionOutcome': {key: row[key] for key in ['wins','losses','draws','truncated','errors']},
                 'combinedWins': std[row['id']]['wins'] + row['wins'], 'slots': len(std[row['id']]['games']) + len(row['games']) } for row in extended]
    best = max(row['combinedWins'] for row in combined)
    recommended = [row['id'] for row in combined if row['combinedWins'] == best]
    pareto = [row['id'] for row in combined if not any(other['standardWins'] >= row['standardWins'] and other['extensionWins'] >= row['extensionWins'] and (other['standardWins'] > row['standardWins'] or other['extensionWins'] > row['extensionWins']) for other in combined)]
    def interval(wins, n):
        z = 1.959963984540054
        p, denom = wins / n, 1 + z*z/n
        center = (p + z*z/(2*n)) / denom
        half = z * math.sqrt(p*(1-p)/n + z*z/(4*n*n)) / denom
        return [center-half, center+half]
    for row in combined:
        row['descriptiveWilson95'] = interval(row['combinedWins'], row['slots'])
    config = {row['id']: row for row in PLAN['candidates']}
    combinedPairLookup = {frozenset([pair['from'], pair['to']]): pair for pair in combinedPairs}
    unresolved = [row['id'] for row in combined if row['id'] not in recommended and any(
        combinedPairLookup[frozenset([row['id'], lead])]['exactMcNemarTwoSidedP'] >= .05 for lead in recommended)]
    retainedControls = sorted(unresolved, key=lambda identifier: (identifier != 'phase6-gen05', identifier))
    def compactPairs(values):
        return [{'from': pair['from'], 'to': pair['to'], 'naturalComparablePairs': pair['naturalComparablePairs'],
                 'newWins': len(pair['newWins']), 'lostWins': len(pair['lostWins']), 'netWins': pair['netWins'],
                 'exactMcNemarTwoSidedP': pair['exactMcNemarTwoSidedP']}
                for pair in values if pair['from'] in recommended or pair['to'] in recommended]
    result = {'status': '开发面板研究基线建议，不构成晋升或部署', 'automaticPromotion': False, 'recommendedCandidates': recommended,
              'scope': '仅适用于本次冻结v6r3、780ms内部预算加反扑和1000ms观察门槛；不能外推为4秒搜索或约200万参数新网络的排序。',
              'pointEstimateTies': len(recommended) > 1, 'evidenceIsUncertain': True,
              'statisticallyUnresolvedAlternatives': unresolved, 'recommendedRetainedControls': retainedControls,
              'verifiedUniqueSuperiorModel': False, 'paretoTradeoffCandidates': pareto, 'standardLeaders': [row['id'] for row in standard if row['wins'] == max(x['wins'] for x in standard)],
              'extensionLeaders': [row['id'] for row in extended if row['wins'] == max(x['wins'] for x in extended)],
              'basis': combined, 'selectionRule': '在预登记进入扩展且拥有同样16槽的候选中，以标准与扩展自然胜场合计最高作为工程基线建议；并列全部保留。未进入扩展者不参与16槽排名。',
              'statisticalUncertainty': {'smallSamples': True, 'developmentSelected': True, 'independentBlindTest': False, 'multipleComparisonsAdjusted': False,
                                        'wallClockSearchMayChangeTrajectories': True, 'pairedStandard': compactPairs(pairs), 'pairedExtension': compactPairs(extensionPairs),
                                        'pairedCombined16Slots': compactPairs(combinedPairs), 'fullPairEvidence': 'evaluation/RESULT.json',
                                        'interpretation': 'Wilson仅为描述性小样本区间，未校正候选选择、多重比较及地图相关性；不据此证明普遍优越。'},
              'strategyDependencies': [config[identifier] for identifier in recommended],
              'runtime': {'sourceIdentity': 'evaluation/frozen-runtime-identity.json', 'revision': PLAN['runtimeRevision'], 'searchOptions': PLAN['searchOptions'], 'decisionLimitMs': 1000},
              'parameterTransfer': {'currentParameters': 501642, 'currentTensorCount': 170, 'targetApproxParameters': 2000000,
                                    'directShapeReuse': False, 'reason': '约200万参数的新结构会改变张量形状与偏移；输入schema相同也不代表权重shape兼容。必须生成新权重manifest与前向合同，通过独立跨端一致性后才可使用。旧组合可作教师/对照，或按明确映射受控迁移，不可将旧bin按新shape直接解释。',
                                    'calibrationTransfer': '外置动作/价值校准和父价值混合是当前完整组合的依赖，不可默认直接迁移到新网络；需按新输出合同重新验证或仅用训练分区拟合。'}}
    (OUT / 'BASELINE_RECOMMENDATION.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
    return result

def main():
    assert read(OUT / 'progress.json')['phase'] == 'complete'
    assert not (OUT / 'RESULT.json').exists(), '正式汇总已存在，禁止覆盖'
    typecheck = read(OUT / 'typecheck-result.json')
    assert typecheck['passed'] and typecheck['exitCode'] == 0, '独立类型检查尚未通过'
    locations = read(OUT / 'run-locations.json')
    activeDirectories = {(ROOT / value).resolve() for value in locations.values()}
    attemptedDirectories = {file.parent.resolve() for file in OUT.rglob('started.json')}
    unindexedAttempts = attemptedDirectories - activeDirectories
    assert not unindexedAttempts, f'发现尚未进入永久排重的额外attempt，须先独立恢复：{unindexedAttempts}'
    attemptAudit = {'attempts': sorted(str(directory.relative_to(ROOT)).replace('\\', '/') for directory in attemptedDirectories),
                    'unindexedAttempts': [], 'allAttemptsIncluded': True}
    standard = [group(c['id'], 'standard', locations) for c in PLAN['candidates']]
    selected = read(OUT / 'extension-selection.json')['selected']
    extended = [group(identifier, 'extension', locations) for identifier in selected]
    pairs = [paired(a, b) for i, a in enumerate(standard) for b in standard[i + 1:]]
    extensionPairs = [paired(a, b) for i, a in enumerate(extended) for b in extended[i + 1:]]
    standardById = {row['id']: row for row in standard}
    combinedRows = [{'id': row['id'], 'games': standardById[row['id']]['games'] + row['games']} for row in extended]
    combinedPairs = [paired(a, b) for i, a in enumerate(combinedRows) for b in combinedRows[i + 1:]]
    candidateCoverage = coverage()
    baseline = recommendation(standard, extended, pairs, extensionPairs, combinedPairs)
    histories = []
    historyNames = ['phase61-v6-hard-slayer', 'phase61-v6r2-hard-slayer', 'phase62-sampling-extended', 'phase54-search', 'gen04-search', 'original-apk-hard-20261021']
    for name in historyNames:
        historyBase = OUT / 'consumed-history' / name
        receipt = read(historyBase / 'independent-strict-replay.json')
        assert receipt['passed']
        originalSummary = read(Path(receipt['source']) / 'summary.json')
        originalIdentity = originalSummary.get('identity', {})
        histories.append({'id': name, 'evidence': historyBase.relative_to(ROOT).as_posix(), 'strict': receipt,
                          'originalRuntimeRevision': originalIdentity.get('runtimeRevision', originalSummary.get('runtime')),
                          'originalModelSha256': originalIdentity.get('modelSha256'),
                          'recordedOutcome': {key: originalSummary.get(key) for key in ['wins', 'losses', 'draws', 'truncated', 'errors']},
                          'rankingUse': False})
    hashes = set()
    for result in standard + extended:
        hashes.update(gzip.decompress((ROOT / result['evidence'] / 'consumed-canonical-rule-states.txt.gz').read_bytes()).decode().splitlines())
    comparisonHashes = len(hashes)
    for result in histories:
        hashes.update(gzip.decompress((ROOT / result['evidence'] / 'consumed-canonical-rule-states.txt.gz').read_bytes()).decode().splitlines())
    plain = ('\n'.join(sorted(hashes)) + '\n').encode()
    (OUT / 'consumed-canonical-rule-states.txt.gz').write_bytes(gzip.compress(plain, compresslevel=9, mtime=0))
    runtime = read(OUT / 'frozen-runtime-identity.json')
    assert all(sha((ROOT / asset['path']).read_bytes()) == asset['sha256'] for asset in runtime['files'])
    for config in PLAN['candidates']:
        for asset in config['assets']:
            assert sha((ROOT / asset['path']).read_bytes()) == asset['sha256']
            assert sha((ROOT / config['frozen'] / asset['name']).read_bytes()) == asset['sha256']
    total = {'games': sum(len(result['games']) for result in standard + extended),
             'strictActions': sum(result['strict']['actions'] for result in standard + extended),
             'strictWitnessActions': sum(result['strict']['witnessActions'] for result in standard + extended),
             'comparisonUniqueCanonicalStates': comparisonHashes,
             'preservedHistoricalGames': sum(result['strict']['games'] for result in histories),
             'preservedHistoricalStrictActions': sum(result['strict']['actions'] for result in histories),
             'preservedHistoricalStrictWitnessActions': sum(result['strict']['witnessActions'] for result in histories),
             'uniqueCanonicalStates': len(hashes), 'canonicalPlainSha256': sha(plain),
             'canonicalScope': '全部已落盘实际动作及反扑见证的前后规则态；未落盘的内部搜索节点和预热状态不可精确恢复，不包含在完整性声明中。',
             'unrecordedSearchNodesIncluded': False, 'unrecordedWarmupStatesIncluded': False,
             'modelDecisionsOver1000Ms': sum(result['latency']['model']['over1000'] for result in standard + extended),
             'opponentDecisionsOver1000Ms': sum(result['latency']['hard']['over1000'] for result in standard + extended),
             'permanentTrainingExclusion': True, 'runtimeAndAssetsUnchanged': True}
    final = {'planSha256': sha((TASK / 'EVALUATION_SPLITS.json').read_bytes()), 'runtimeIdentity': runtime,
             'standard': standard, 'extension': extended, 'pairedStandard': pairs, 'pairedExtension': extensionPairs, 'pairedCombined': combinedPairs, 'preservedHistory': histories,
             'attemptAudit': attemptAudit, 'candidateCoverage': candidateCoverage, 'baselineRecommendation': baseline,
             'checks': {'independentTypecheck': typecheck}, 'total': total}
    (OUT / 'RESULT.json').write_text(json.dumps(final, ensure_ascii=False, indent=2), encoding='utf8')
    outcome = lambda result: f"{result['wins']}/{result['losses']}/{result['draws']}/{result['truncated']}/{result['errors']}"
    q = lambda result, key: '/'.join(f"{result['latency'][key][p]:.3f}" for p in ['p50','p95','p99','max'])
    lines = ['# 模型同条件评测', '',
             '已完成全部七个主要可兼容策略组合的五官方图换边评测，并按预登记规则补齐领先候选的新开局配对。唯一对手为 Original-APKlikeAI-Hard；评测未启动训练、未修改GUI或实施4秒搜索改造。', '',
             '统一当前v6r3搜索：内部780ms、220节点、束宽6、最多3个我方单位及5条反扑单位链，默认只缓存首单位；单次决策观察门槛1000ms。每局4000原子动作/120回合/600秒上限。所有新增对局按单进程顺序执行，没有实现4秒预算。', '',
             '| 策略组合 | 胜/负/平/截断/错误 | 证据身份 |', '|---|---:|---|']
    for result in standard:
        lines.append(f"| {result['id']} | {outcome(result)} | {'历史同SHA复用＋本次独立strict' if result['reusedHistorical'] else '本次顺序新测'} |")
    shortOutcome = {'model_win': '胜', 'hard_win': '负', 'natural_draw': '平', 'action_truncation': '截', 'round_truncation': '截', 'wall_truncation': '截', 'error': '错'}
    lines += ['', '下表每格为我方P0/P1结果，截断记“截”、错误记“错”，不混作自然负局。', '',
              '| 组合 | Duel | Crossed swords | Mourningstar | Liberty Port | The Crossing |', '|---|---|---|---|---|---|']
    for result in standard:
        cells = [shortOutcome[result['games'][index]['classification']] + '/' + shortOutcome[result['games'][index + 1]['classification']] for index in range(0, 10, 2)]
        lines.append('| ' + result['id'] + ' | ' + ' | '.join(cells) + ' |')
    leaders = [result['id'] for result in standard if result['wins'] == max(row['wins'] for row in standard)]
    lines += ['', '标准面板自然胜场最高：' + '、'.join(leaders) + '。十局小面板及墙钟搜索不能证明普遍更强；相同运行时也会因搜索截止时刻出现轨迹变化。第3、5代均4/10的历史结果按原样保留，不以代号预判强弱。', '',
              '扩展候选在看到扩展结果前按标准自然胜场选择：最高分全部并列；仅一名最高时再包括第二分全部并列。扩展固定三官方图Icy Paths、Peak Island、Swamplands，每图换边，初始收益结算后双方各加100金币，使用预登记新种子。第5代训练来源包含五标准图及三扩展图的历史局；这些地图已被开发和训练消费，扩展新开局也不称独立盲测。', '',
              '| 扩展组合 | 胜/负/平/截断/错误 |', '|---|---:|']
    for result in extended:
        lines.append(f"| {result['id']} | {outcome(result)} |")
    lines += ['', '| 扩展组合 | Icy Paths P0/P1 | Peak Island P0/P1 | Swamplands P0/P1 |', '|---|---|---|---|']
    for result in extended:
        cells = [shortOutcome[result['games'][index]['classification']] + '/' + shortOutcome[result['games'][index + 1]['classification']] for index in range(0, 6, 2)]
        lines.append('| ' + result['id'] + ' | ' + ' | '.join(cells) + ' |')
    lines += ['', '以下时延单位ms，均从逐动作原始日志重新汇总；根指非队列调用，另保留nodes>0的有效根分布于RESULT.json。历史两组为原来的墙钟测量，SHA相同不代表本次重新测量了它们。', '',
              '| 面板/组合 | 根p50/p95/p99/最大 | 队列p50/p95/p99/最大 | 我方/对手>1000ms |', '|---|---|---|---:|']
    for result in standard + extended:
        lines.append(f"| {result['panel']}/{result['id']} | {q(result,'root')} | {q(result,'queue')} | {result['latency']['model']['over1000']}/{result['latency']['hard']['over1000']} |")
    lines += ['', '| 面板/组合 | 对手主路径决策 | 原生回退 | 拒绝复合计划 | 对手运行错误 | 反扑完整/尝试 |', '|---|---:|---:|---:|---:|---:|']
    for result in standard + extended:
        opponent, search = result['opponent'], result['search']
        lines.append(f"| {result['panel']}/{result['id']} | {opponent['runtimeDecisions']} | {opponent['nativeFallbacks']} | {opponent['rejectedPlans']} | {opponent['runtimeErrors']} | {search['retaliationComplete']}/{search['retaliationAttempts']} |")
    lines += ['', '反扑完整/尝试是现有v6r3内部合同计数：最多展开5条单位链，其余使用静态覆盖，不代表穷举全部敌方联动或战术完备。strict重放证明合法执行和状态一致，也不能替代棋力检验。', '',
              '比较对象为权重＋动作偏置＋价值校准＋父价值依赖的完整策略组合。phase5-gen00/gen03/gen04与other-gen02的外置head-calibration.json和value-config.json逐字节相同；gen01使用自身校准，gen05使用中性的价值校准，不能将这些组合差异全部归于网络权重。phase5-gen02保留parentMixture=1及随模型保存的父价值权重，SHA为843fea9a…；未擅自关闭依赖。', '',
              '阶段3与phase5-gen00的model.bin完全相同（843fea9acf70c2230089ba66a3d2c1c712f29ce7ddd7b8f794cccf779f862e31），以第0代配套校准作为同运行时代表；旧阶段3纯策略/不同校准不另作独立权重代际。阶段4及其它同权重路径的覆盖指网络状态，不声称其全部历史校准和运行时组合都已同条件实测。其余六份model.bin均不同，完整资产SHA见EVALUATION_SPLITS.json。', '',
              f"模型登记的48份包共有29种张量状态；本次7个主要终态权重代表其中{candidateCoverage['representedRegisteredPaths']}份登记路径。22份checkpoint容器均有对应导出状态，只有checkpoint而未导出的独立状态为0。阶段1只有契约；阶段2的初始化/64样本过拟合用于架构冒烟，阶段3校准前态、gen01/gen03中途修复、gen04未选网格/监督热启动、gen05未选轮次均是诊断或训练恢复产物，不按当前靶场重新反选。旧sd-value-search-v4特征合同不能直接装入v2前向。逐包用途与覆盖理由见evaluation/CANDIDATE_COVERAGE.json，不只按时间先后排除。", '',
              '工程基线建议：' + '、'.join(baseline['recommendedCandidates']) + '；仅依据拥有相同标准＋扩展16槽的候选自然胜场合计，所有并列保留。标准/扩展领先与折中候选及小样本不确定性见evaluation/BASELINE_RECOMMENDATION.json。建议对象仍是完整权重＋校准＋依赖组合，不等同已晋升模型。', '',
              '证据层面仍不确定：' + '、'.join(baseline['statisticallyUnresolvedAlternatives']) + '与上述点估计领先者的16槽双侧精确配对检验未达到0.05显著分离；这不证明等强，也不能宣称唯一更强模型。保留主要对照：' + '、'.join(baseline['recommendedRetainedControls']) + '。gen03与gen05的比较也按此口径解释，不以小样本点估计推断普遍优越。', '',
              '当前模型为501642参数、170张量。后续约200万参数结构即使沿用观测schema，也不能直接沿用旧权重形状和偏移；应生成新manifest/前向合同并完成跨端一致性，可将旧组合用作教师或受控迁移对照。', '',
              '第3和第5代复用前逐项核验63份src依赖、模型四文件、搜索选项、地图、种子和上限；本目录另存reuse-identity.json及不调用AI的独立strict收据。所有新增组也检查源码和资产前后身份。自然胜负、自然平局、截断与运行错误分开计数；超1000ms只计时延，不改写胜负。', '',
              f"独立strict合计{total['games']}局、{total['strictActions']}个实际动作、{total['strictWitnessActions']}个反扑动作全部通过。逐步核对合法编码、前后状态SHA、自然终局及最终胜方，不把forced回放等同strict。", '',
              f"标准＋扩展比较证据（含同SHA历史复用时延）中，我方决策超过1000ms共{total['modelDecisionsOver1000Ms']}次，对手共{total['opponentDecisionsOver1000Ms']}次；各组1000ms门槛布尔结果另存RESULT.json，不因strict通过而声称全部预算门槛通过。", '',
              f"此外只读补齐旧v6/v6r2/采样扩展/旧phase54/旧gen04及20261021困难AI原靶场，共{total['preservedHistoricalGames']}局、{total['preservedHistoricalStrictActions']}实际动作、{total['preservedHistoricalStrictWitnessActions']}反扑动作，收据写入evaluation/consumed-history。没有重跑这些AI，也不把旧运行时结果加入本轮排名。原靶场仅保存实际轨迹，未落盘的V2内部搜索节点无法恢复。", '',
              f"永久排重已保存{len(hashes)}个唯一canonical规则态（包含实际和反扑见证的前后态），采用现有ruleStateHash并排除metadata。合并索引为evaluation/consumed-canonical-rule-states.txt.gz，解压文本SHA-256为{sha(plain)}。后续训练必须纳入该索引；本次未修改训练管线。", '',
              '索引完整性限于已落盘的实际动作与反扑见证；未记录的内部搜索节点和预热状态无法由轨迹精确重建，不冒称这些状态也全部排重。', '',
              '已逐目录核对本次started.json与正式运行位置，没有未纳入排重的失败或中断attempt；没有只保留成功尾轮而遗漏已消费轨迹。完整attempt清单见RESULT.json。', '',
              '全部计时AI结束后，独立tsconfig.evaluation.json类型检查通过（退出码0）；持久日志与退出码位于evaluation/typecheck.log和typecheck-result.json。没有重复公共检查以干扰本轮计时。', '',
              '配对新增胜/丢失胜及双侧精确McNemar统计在evaluation/RESULT.json中完整保存；样本量小且候选经过开发选择，不据此宣称独立泛化、模型晋升或统治级棋力。', '',
              '恢复入口（仓库根目录）：`python ai_training/pretrain_preflight_20261022/run_evaluation.py`。完整产物核验后跳过，未完成尝试保留并另建attemptNN。汇总入口为summarize_evaluation.py，正式RESULT.json存在时拒绝覆盖。']
    lines += ['', '以下旧原配运行时结果只按原summary身份保留，不进入当前v6r3排名；原summary SHA及完整来源在RESULT.json的preservedHistory中。', '',
              '| 旧证据 | 原记录胜/负/平/截断/错误 | 原模型SHA前12位 |', '|---|---:|---|']
    for history in histories:
        outcomeRow = history['recordedOutcome']
        values = '/'.join(str(outcomeRow[key]) for key in ['wins','losses','draws','truncated','errors']) if outcomeRow['wins'] is not None else '原靶场20局，按Heuristic/V2分别保存'
        lines.append(f"| {history['id']} | {values} | {(history['originalModelSha256'] or '原规则AI，无v2权重')[:12]} |")
    (TASK / 'MODEL_EVALUATION.md').write_text('\n'.join(lines) + '\n', encoding='utf8')
    print(json.dumps(total))

if __name__ == '__main__':
    main()
