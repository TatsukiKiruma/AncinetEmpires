"""从第3代原始收据生成战报、门禁及保全核验；完成后不启动第4代。"""
import ast
import gzip
import json
import shutil
from collections import Counter
from run_league import DIR, ROOT, read, save, sha


def records(arena):
    return [read(p) for p in (DIR / arena / 'battles').glob('*/result.json')]


def identity(row):
    s = row['slot']
    return s['panel'], s['mapIndex'], s['seat'], s['opponent'], s['opponentSeed']


def main():
    folder = DIR / 'generations/gen_03'; state = read(DIR / 'league-state.json')
    assert state['currentGeneration'] == 3 and not (DIR / 'generations/gen_04').exists()
    promotion = read(folder / 'promotion.json')
    before = read(DIR / 'phase52-audit/before.json')
    changed = [p for p, e in before['files'].items() if not (ROOT / p).exists() or sha(ROOT / p) != e['sha256']]
    freeze = read(DIR / 'phase52-audit/runtime-freeze.json')
    runtime_changed = [p for p, digest in freeze['runtime'].items() if sha(ROOT / p) != digest]
    archive_changed = []
    training_archives = {}
    for archive in folder.glob('training-attempt*'):
        manifest = read(archive / 'ARCHIVE_MANIFEST.json')
        diff = [p for p, digest in manifest['files'].items() if sha(archive / p) != digest]
        archive_changed += [archive.name + '/' + p for p in diff]
        training_archives[archive.name] = dict(files=len(manifest['files']), changed=diff)
    engineering_archives = []
    for receipt in (DIR / 'phase52-audit').glob('runtime-freeze*.json'):
        frozen = read(receipt)
        archive_changed += [str(frozen['archive'] + '/' + p) for p, digest in frozen['archivedChampionSearch'].items() if sha(DIR / frozen['archive'] / p) != digest]
        archive = DIR / frozen['archive']
        if read(archive / 'plan.json').get('runtimeRevision') == 'gen03-phase52' and archive not in engineering_archives:
            engineering_archives.append(archive)
    arms = dict(championPure=records('champion-pure-arena'), championSearch=records('champion-search-arena'), candidate=records('generations/gen_03/arena'))
    assert [len(arms[k]) for k in arms] == [56, 56, 112]
    grouped = {}; table = ['|模型|策略|面板|槽数|自然胜|自然负|自然平|动作截断|决策超时|墙钟|错误|', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    names = {'fixed': '固定图', 'expanded': '扩展图', '3ffa': '三人混战', '4ffa': '四人混战', '2v2': '2v2'}
    for arm, rows in arms.items():
        for mode in sorted({r['slot']['mode'] for r in rows}):
            selected = [r for r in rows if r['slot']['mode'] == mode]
            grouped[arm + '/' + mode] = {identity(r): r for r in selected}
            for panel, name in names.items():
                items = [r for r in selected if r['slot']['panel'] == panel]; c = Counter(r['classification'] for r in items)
                table.append('|' + '|'.join(map(str, ['第3代' if arm == 'candidate' else '第0代', '纯策略' if mode == 'pure' else '回合搜索', name, len(items), *[c[k] for k in ['natural_win', 'natural_loss', 'natural_draw', 'action_truncation', 'decision_timeout', 'wall_truncation', 'error']]])) + '|')
    paired = {}
    for mode, baseline in [('pure', 'championPure/pure'), ('turn_search', 'championSearch/turn_search')]:
        old, new = grouped[baseline], grouped['candidate/' + mode]; assert old.keys() == new.keys()
        paired[mode] = dict(pairs=56, gained=sum(old[k]['classification'] != 'natural_win' and new[k]['classification'] == 'natural_win' for k in old), lost=sum(old[k]['classification'] == 'natural_win' and new[k]['classification'] != 'natural_win' for k in old))
    policy_actions = {}
    for arm, arena in [('championPure', 'champion-pure-arena'), ('championSearch', 'champion-search-arena'), ('candidate', 'generations/gen_03/arena')]:
        for result in arms[arm]:
            slot = result['slot']; key = arm + '/' + slot['mode'] + '/' + slot['panel']
            if key not in policy_actions: policy_actions[key] = Counter()
            log = DIR / arena / 'battles' / slot['id'] / 'actions.jsonl.gz'
            for line in gzip.decompress(log.read_bytes()).splitlines():
                row = json.loads(line)
                if row['player'] in slot['modelSeats']: policy_actions[key][row['code'].split(':', 1)[0]] += 1
    save(DIR / 'phase52-audit/battle-action-distribution.json', {k: dict(v) for k, v in policy_actions.items()})
    action_table = ['|模型/面板（纯策略）|heal|capture|attack|recruit_to_castle|wait|', '|---|---:|---:|---:|---:|---:|']
    for arm, label in [('championPure', '第0代'), ('candidate', '第3代')]:
        for panel in ['3ffa', '4ffa', '2v2']:
            counter = policy_actions[arm + '/pure/' + panel]
            action_table.append('|' + '|'.join(map(str, [label+'/'+panel, *[counter[k] for k in ['heal', 'capture', 'attack', 'recruit_to_castle', 'wait']]])) + '|')
    heal_observation = {panel: dict(champion=policy_actions['championPure/pure/'+panel]['heal'], candidate=policy_actions['candidate/pure/'+panel]['heal']) for panel in ['3ffa', '4ffa', '2v2']}
    games = list(folder.glob('games/*/result.json')); assert len(games) == 60
    formal_paths = list((DIR / 'champion-search-arena/battles').glob('*/result.json')) + list((folder / 'arena/battles').glob('*/result.json')) + games
    all_paths = formal_paths + [p for archive in engineering_archives for p in (archive / 'battles').glob('*/result.json')]
    counts = Counter(); formal_counts = Counter(); queue_max = 0.; formal_queue_max = 0.; strict = True; errors = []; timeouts = []; timeout_details = []; interrupted = []
    worst_queue = None; incomplete_retaliations = []; candidate_counts = Counter()
    for p in all_paths:
        r = read(p)
        strict_path = p.parent / 'strict-replay.json'
        receipt = read(strict_path if strict_path.exists() else DIR / 'phase52-audit/archive-strict' / (p.parent.name + '.json'))
        strict &= receipt['passed'] and receipt['actions'] == r['actions']
        counts['actualActions'] += receipt['actions']; counts['witnessActions'] += receipt.get('witnessActions', 0)
        if r['classification'] == 'decision_timeout':
            timeouts.append(str(p.relative_to(DIR)))
            timeout_details.append(dict(path=str(p.relative_to(DIR)), latency=r.get('latency'), failedDecision=r.get('failedDecision')))
            failed = r.get('failedDecision') or {}
            is_model = failed.get('teacher') if failed else (r.get('latency', {}).get('model', {}).get('max') or 0) > 1000
            counts['modelTimeouts' if is_model else 'opponentTimeouts'] += 1
            t = failed.get('telemetry') or {}
            if t and not t.get('queued'):
                counts['retaliationAttempts'] += t.get('retaliationAttempts', 0); counts['retaliationComplete'] += t.get('retaliationComplete', 0)
                if t.get('retaliationAttempts', 0) != t.get('retaliationComplete', 0): incomplete_retaliations.append(dict(path=str(p.relative_to(DIR)), failedDecision=True, telemetry=t))
                if p in formal_paths:
                    formal_counts['retaliationAttempts'] += t.get('retaliationAttempts', 0); formal_counts['retaliationComplete'] += t.get('retaliationComplete', 0)
                if folder / 'arena' in p.parents:
                    candidate_counts['retaliationAttempts'] += t.get('retaliationAttempts', 0); candidate_counts['retaliationComplete'] += t.get('retaliationComplete', 0)
            if t.get('queued'):
                if failed['ms'] >= queue_max: worst_queue = dict(path=str(p.relative_to(DIR)), failedDecision=True, ms=failed['ms'], telemetry=t)
                queue_max = max(queue_max, failed['ms'])
                if p in formal_paths: formal_queue_max = max(formal_queue_max, failed['ms'])
        if r['classification'] in ['error', 'wall_truncation'] or r.get('error'): errors.append(str(p.relative_to(DIR)))
    action_files = [p.parent / 'actions.jsonl.gz' for p in all_paths]
    for p in [p for archive in engineering_archives for p in (archive / 'battles').glob('*/INTERRUPTION_STRICT.json')]:
        receipt = read(p); strict &= receipt['passed'] and not receipt['actualTailIncomplete'] and not receipt['witnessTailIncomplete']
        counts['actualActions'] += receipt['actions']; counts['witnessActions'] += receipt['witnessActions']; interrupted.append(receipt)
        action_files.append(p.parent / 'actions.jsonl.gz')
    for p in action_files:
        for line in gzip.decompress(p.read_bytes()).splitlines():
            row = json.loads(line); t = row.get('telemetry') or {}
            if t.get('queued'):
                if row['ms'] >= queue_max: worst_queue = dict(path=str(p.relative_to(DIR)), i=row['i'], ms=row['ms'], code=row['code'], beforeHash=row['beforeHash'], telemetry=t)
                queue_max = max(queue_max, row['ms'])
                if not any(archive in p.parents for archive in engineering_archives): formal_queue_max = max(formal_queue_max, row['ms'])
            else:
                counts['retaliationAttempts'] += t.get('retaliationAttempts', 0); counts['retaliationComplete'] += t.get('retaliationComplete', 0)
                if t.get('retaliationAttempts', 0) != t.get('retaliationComplete', 0): incomplete_retaliations.append(dict(path=str(p.relative_to(DIR)), i=row['i'], ms=row['ms'], beforeHash=row['beforeHash'], telemetry=t))
                if not any(archive in p.parents for archive in engineering_archives):
                    formal_counts['retaliationAttempts'] += t.get('retaliationAttempts', 0); formal_counts['retaliationComplete'] += t.get('retaliationComplete', 0)
                if folder / 'arena' in p.parents:
                    candidate_counts['retaliationAttempts'] += t.get('retaliationAttempts', 0); candidate_counts['retaliationComplete'] += t.get('retaliationComplete', 0)
    stress = read(DIR / 'phase52-audit/retaliation-stress-v3.json')
    strict &= all(p['strict'] for p in stress['probes'])
    counts['retaliationAttempts'] += stress['attempts']; counts['retaliationComplete'] += stress['complete']
    counts['actualActions'] += sum(1 + len(p['queues']) for p in stress['probes'])
    counts['witnessActions'] += sum(p['witnessActions'] for p in stress['probes'])
    queue_max = max(queue_max, max((q for p in stress['probes'] for q in p['queues']), default=0.))
    training = read(folder / 'training-complete.json'); dev = read(folder / 'dev-policy-audit.json'); parity = read(folder / 'tri-runtime-parity.json')
    candidate_summary = read(folder / 'arena-summary.json')
    selfplay_outcomes = dict(Counter(read(p)['classification'] for p in games))
    value = read(folder / 'value-calibration.json'); isolation = read(DIR / 'phase52-audit/post-evaluation-isolation.json')
    supervised_updates = training.get('supervisedUpdates', training['updates'])
    auxiliary = training.get('auxiliaryWaitConstraint')
    joint = training.get('jointPolicyRepair')
    semantic = training.get('semanticJointRepair')
    auxiliary_description = '' if not auxiliary else f"第一版因绝对待机门禁失败已完整保全；随后同代仅用训练池扫描{auxiliary['scannedTrainSamples']}条，保留{auxiliary['anchorSamples']}条KL锚点及{auxiliary['constraintStates']}个机会违例局面，以{auxiliary['steps']}次Adam更新单独校正what_entity待机语义行，其余第一版策略参数不变。辅助阶段不使用开发标签或实战胜负，身份、样本ID及恢复检查点见wait-constraint-training.json。"
    if joint:
        auxiliary_description += f"第二版仍未通过原前检，106份文件保存在training-attempt02-wait-linear。用户明确要求保持门禁继续同代优化后，第三阶段在第二版模型上联合训练全部获准策略头，基础KL=2、CE=.2，加冠军正确动作头margin=.2/权重.5及机会约束；专家损失保持原合同。固定{joint['epoch']}轮、基础{joint['baseSamples']}条次、纠错{joint['expertSamples']}条次，训练挖出的119个机会违例每轮重用8遍共{joint['constraintSamples']}条次；AdamW峰值1e-5、下限2e-6，共{joint['updates']}次更新。开发标签与实战胜负不进入梯度，详见joint-training-complete.json。单行字节审计只适用于已归档的第二阶段模型，最终第三阶段按完整策略冻结合同审计。"
    if semantic:
        auxiliary_description += f"前三次训练尝试及失败门禁全部按SHA保留。最终语义联合阶段从首版9534048b模型分支热启动，不继承第二/三版权重；只更新what_entity的前15个动作语义行，其他策略参数逐字节保持首版。仅在RAM缓存基础/纠错/119个训练机会违例的冻结实体表征和完整候选分数，稠密特征不落盘；缓存用于优化近似，导出后由实际完整网络重新校验。基础KL=1、动作CE=.2，加直接对齐headTop1的头CE=1与机会约束；基础目标若被先验禁止或自身是机会待机则不计算硬标签损失，仍保留KL。专家损失保持原合同。固定{semantic['epoch']}轮，基础{semantic['baseSamples']}条次、纠错{semantic['expertSamples']}条次、机会约束{semantic['constraintSamples']}条次；共{semantic['updates']}次AdamW更新，峰值2e-5、下限2e-6。完整来源、标签冲突计数与缓存摘要见semantic-training-complete.json、semantic-cache-receipt.json。"
    def policy_ast(path):
        return ast.dump(next(n for n in ast.parse(path.read_text('utf-8')).body if isinstance(n, ast.FunctionDef) and n.name == 'promote'), include_attributes=False)
    def wins(arm, panels=None):
        return sum(r['classification'] == 'natural_win' and (panels is None or k[0] in panels) for k, r in grouped[arm].items())
    gates = dict(promotion=promotion['promoted'], devPolicyAudit=dev['passed'], frozenValueZero=training['maxValueLogitsDifference'] == 0. and dev['maxValueLogitsDifference'] == 0., value16Slices=value['passed'], triRuntime89=parity['passed'] and parity['chrome']['chromeProfileCleaned'], allAttemptsStrict=strict, zeroDecisionTimeouts=not timeouts, zeroErrorsOrWallStops=not errors, queueBelow1ms=queue_max < 1., queueBelowPoint5ms=queue_max < .5, retaliationComplete100=counts['retaliationAttempts'] > 0 and counts['retaliationAttempts'] == counts['retaliationComplete'], preserved=not changed and not archive_changed, frozenRuntime=not runtime_changed, trainingEvaluationIsolation=isolation['passed'], inheritedCalibrationSha=all(sha(folder / n) == sha(DIR / 'generations/gen_00' / n) for n in ['value-config.json', 'head-calibration.json']), promotionPolicyUnchanged=policy_ast(DIR / 'run_league.py') == policy_ast(DIR / 'phase52-audit/harness-before/run_league.py'), pureImprovesChampion=wins('candidate/pure') > wins('championPure/pure'), searchMatchesEveryPurePanel=all(wins('candidate/turn_search', panels) >= wins('candidate/pure', panels) for panels in [['fixed'], ['expanded'], ['3ffa', '4ffa', '2v2']]))
    size = sum(p.stat().st_size for p in DIR.rglob('*') if p.is_file()); free = shutil.disk_usage(DIR).free
    gates['finalRuntimeRetaliationComplete100'] = formal_counts['retaliationAttempts'] > 0 and formal_counts['retaliationAttempts'] == formal_counts['retaliationComplete'] and stress['allComplete']
    gates['zeroModelTimeouts'] = counts['modelTimeouts'] == 0
    gates['zeroOpponentTimeouts'] = counts['opponentTimeouts'] == 0
    gates['candidateRetaliationComplete100'] = candidate_counts['retaliationAttempts'] > 0 and candidate_counts['retaliationAttempts'] == candidate_counts['retaliationComplete']
    input_freeze = read(folder / 'ARENA_INPUT_FREEZE.json')['identities']
    input_paths = dict(modelSha256='model.bin', planSha256='arena/plan.json', headCalibrationSha256='head-calibration.json', valueConfigSha256='value-config.json', devAuditSha256='dev-policy-audit.json', triParitySha256='tri-runtime-parity.json', semanticProtocolSha256='semantic-repair-protocol.json')
    gates['arenaInputsUnchanged'] = all(sha(folder / path) == input_freeze[key] for key, path in input_paths.items())
    stop_request = read(DIR / 'phase52-audit/STOP_AFTER_CURRENT_ROUND.json')
    gates['noTrainingAfterStopRequest'] = (folder / 'model.bin').stat().st_mtime <= stop_request['recordedAt'] and (folder / 'training-complete.json').stat().st_mtime <= stop_request['recordedAt']
    if auxiliary:
        row_audit = read(folder / 'wait-row-byte-audit.json')
        gates['auxiliaryOnlyWaitRowChanged'] = row_audit['passed']
        if joint:
            gates['intermediateWaitAuditBound'] = row_audit['modelSha256'] == joint['protocol']['warmSha256'] == sha(DIR / (joint['protocol']['warmModel'] + '.bin'))
    if semantic:
        audit = read(folder / 'semantic-row-byte-audit.json')
        gates['semanticOnlyAuthorizedRows'] = audit['passed'] and audit['modelSha256'] == sha(folder / 'model.bin') and audit['warmSha256'] == semantic['protocol']['warmSha256']
    gates['disk'] = size < 950000000 and free >= 12 * 1024 ** 3
    preservation = dict(files=before['count'], changed=changed, archiveChanged=archive_changed, runtimeChanged=runtime_changed, trainingArchives=training_archives)
    summary = dict(stage='phase5.2', generation=3, complete=True, status='complete' if all(gates.values()) else 'completed_quality_unmet', promoted=promotion['promoted'], championGeneration=state['championGeneration'], gates=gates, failed=[k for k, v in gates.items() if not v], promotionDecision=promotion, counts=dict(counts), finalRuntimeCounts=dict(formal_counts), retaliationStress=stress, queueMaximumMs=queue_max, formalQueueMaximumMs=formal_queue_max, engineeringAttempts=dict(archives=[a.relative_to(DIR).as_posix() for a in engineering_archives], completedGames=len(all_paths) - len(formal_paths), interrupted=interrupted, reasons=['unitId查询仍含全局动作，已保留actor过滤修复', '扩展图候选窗口不足，改为两案等额优先反扑']), preservation=preservation, training=training, devPolicyAudit=dev, paired=paired, isolation=isolation, errors=errors, timeouts=timeouts, directoryBytes=size, systemFreeBytes=free, stoppedAfterGeneration=3, generation4Started=False, independentFinalTest=False)
    summary['timeoutDetails'] = timeout_details
    summary['worstQueueDecision'] = worst_queue
    summary['retaliationIncompleteDecisions'] = incomplete_retaliations
    summary['candidateArena'] = candidate_summary
    summary['candidateRuntimeCounts'] = dict(candidate_counts)
    summary['postBattleHealObservation'] = dict(counts=heal_observation, zeroUsagePanels=[panel for panel, entry in heal_observation.items() if entry['champion'] > 0 and entry['candidate'] == 0], devProtectedCountsPassed=dev['gates']['protectedHeadCounts'], scope='事后实战诊断；没有更改原开发前检或晋升函数，尚未归因到机会选择与兵种构成')
    summary['selfplayOutcomes'] = selfplay_outcomes
    summary['stopRequest'] = stop_request
    save(DIR / 'gate-summary.json', summary); save(DIR / 'phase52-audit/preservation-after.json', preservation); save(DIR / 'phase52-audit/paired-comparison.json', paired)
    (DIR / 'BATTLES.md').write_text('# 阶段5.2第3代配对战报\n\n同初态、同对手种子；冠军纯策略56槽按SHA复用，冠军搜索56槽按新运行时重测，候选纯策略和搜索共112槽。\n\n' + '\n'.join(table) + '\n\n自然终局与截断、超时和错误分别统计。这些是开发面板，不是独立盲测。两轮工程尝试归档索引见gate-summary.json，未混入正式战绩。\n', encoding='utf-8')
    report = f'''# 双流v2阶段5.2第3代执行报告

第3代完整结束，晋升={promotion['promoted']}，当前冠军第{state['championGeneration']}代。未通过门禁：{', '.join(summary['failed']) or '无'}。已停止，不启动第4代。

本轮纯策略自然胜由34/56提高到41/56，搜索器由38/56回退到32/56；多人heal实战归零仍未解决：3FFA为59→0、4FFA为88→0，2v2为8→23。开发集受保护头计数通过不代表实战动作分布已恢复。队列尾部和真实反扑完成率也未达到目标，不能把本轮结论写成全部修复成功。

|策略|同运行时第0代|第3代|配对新增胜槽|配对丢失胜槽|
|---|---:|---:|---:|---:|
|纯策略|{wins('championPure/pure')}/56|{wins('candidate/pure')}/56|{paired['pure']['gained']}|{paired['pure']['lost']}|
|回合搜索|{wins('championSearch/turn_search')}/56|{wins('candidate/turn_search')}/56|{paired['turn_search']['gained']}|{paired['turn_search']['lost']}|

完整自然胜负及异常分类见[BATTLES.md](BATTLES.md)，逐项门禁见[gate-summary.json](gate-summary.json)。旧阶段5.1报告和源码逐字节保存在phase52-audit/harness-before/，旧代及同日另一合同{before['count']}份受保护文件变化{len(changed)}项，旧搜索归档变化{len(archive_changed)}项。

搜索使用定向权威查询、25%一级预算、两案等额窗口和优先真实反扑。权威unitId查询仍返回全局end_turn/surrender，直接length判断会误判单位完结；定向结果必须继续按actor过滤。首轮错误语义及第二轮扩展图时间窗口不足的基准均完整保全，已持久化前缀另有strict收据，没有把工程中断冒称自然结果。此前失败局面11探针/21次反扑在最终运行时完整通过，未依据实战胜负调参。神经后续保留完整候选编码；纯策略和战术先验文件保持原SHA。

60局混合采样后只使用第2/3代真实原子纠错。第1代和普通winning步不进入专家损失；跨8局轮转与有界确定性洗牌。仅策略指针/语义头训练，骨干、价值及内置headBias逐更新完全相同；所有监督批及完整开发集valueLogits最大差异严格为0，冻结张量导出字节相同。没有价值终局损失或外置rootValue回归。先验与冠军外置偏置以float64加到网络logits；基础KL=1、CE=.2，专家margin=.5、CE系数=.5、KL=.5，战术/移动硬监督权重1.5/.5，专家wait/end仅KL。监督阶段AdamW峰值2e-5、余弦下限2e-6，共{supervised_updates}次更新、{training['baseSamples']}基础/{training['expertSamples']}纠错样本。{auxiliary_description}总更新{training['updates']}，末次学习率{training['lastLearningRate']:.8g}。模型SHA：{training['modelSha256']}。

开发34763样本真实actor:head解码前检通过={dev['passed']}；headTop1 {dev['champion']['headTop1']:.4%}→{dev['student']['headTop1']:.4%}，无谓wait {dev['champion']['waitWithAnyUnmovedOpportunity']}→{dev['student']['waitWithAnyUnmovedOpportunity']}。受保护头计数及纠错命中提升和精确McNemar见generations/gen_03/dev-policy-audit.json；纠错命中是训练拟合证据，不称独立泛化。外置价值/动作校准与第0代逐字相同，16/16价值切片继承。89冻结状态PyTorch/Node/真实Chrome通过={parity['passed']}，临时Profile清理={parity['chrome']['chromeProfileCleaned']}。

多人面板的实际动作次数来自各槽原始日志，仅统计模型控制席位；零次或低频会按原值呈现，不以开发集头计数替代实战：

{chr(10).join(action_table)}

这些是不同完整轨迹上的实际使用次数，不等同于同局面的激活率；本轮没有进一步重放审计heal机会和兵种构成的因果关系。实战3FFA/4FFA仍归零的事实保留为未解决问题，未因总胜场提高或开发门禁通过而隐去，也没有据此继续训练。

请求引用的82.8755%/2来自第2代head-calibration.json的before字段，不是第0代同口径基线；本轮重新计算冠军并保留相同分母。待机仍按绝对<=2守门，不因冠军自身超过2而放宽。权威动作合同中recruit_to_castle实际为头5，头11为post_attack_move；本轮同时审计两者。

全部本轮尝试已持久实际/反扑动作{counts['actualActions']}/{counts['witnessActions']}，strict={strict}。含已归档工程尝试的真实反扑完成{counts['retaliationComplete']}/{counts['retaliationAttempts']}，最终运行时正式范围为{formal_counts['retaliationComplete']}/{formal_counts['retaliationAttempts']}；全尝试队列峰值{queue_max:.6f}ms，修复后正式范围峰值{formal_queue_max:.6f}ms。队列小于1ms与小于.5ms分列，不隐去异常峰值；决策超时{len(timeouts)}，错误或墙钟停止{len(errors)}。训练与评测完整SHA及规则等价态重叠为基础{isolation['baseOverlaps']}、专家{isolation['expertOverlaps']}。最慢队列决策与每次未完成反扑的槽位、动作下标、前态SHA和完整遥测见gate-summary.json的worstQueueDecision、retaliationIncompleteDecisions，未以压力探针通过替代正式失败记录。

候选112槽单独统计：实际动作{candidate_summary['actualActions']}、反扑见证动作{candidate_summary['witnessActions']}，strict={candidate_summary['strictAllAttempts']}，真实反扑完成{candidate_counts['retaliationComplete']}/{candidate_counts['retaliationAttempts']}；搜索根p95/max={candidate_summary['rootLatency']['p95']}/{candidate_summary['rootLatency']['max']}ms，队列p95/max={candidate_summary['queueLatency']['p95']}/{candidate_summary['queueLatency']['max']}ms。采样60局终止分类为{selfplay_outcomes}，采样结果不计正式胜率。全部输入SHA与评测前冻结文件一致={gates['arenaInputsUnchanged']}；输入汇总收据在已有17槽结果后补记，文件mtime及各槽modelSha证明输入在竞技场启动前已固定，没有伪装预先写出收据。用户要求本轮结束即停之后未再追加训练={gates['noTrainingAfterStopRequest']}。

公共lint、440测试/20跳过、build和阶段独立tsc通过，22项Python合同回归通过，详见phase52-audit/日志。APK原始解包资源未重验，跳过不算通过。950MB目录上限与12GiB系统空闲守卫保留。没有修改GUI入口、操作手机或部署，也没有独立最终盲测。
'''
    (DIR / 'REPORT.md').write_text(report, encoding='utf-8')
    guide = DIR / 'LEAGUE_RESUME_GUIDE.md'
    # 先前失败/运行中报告另有原件，只移除本次新增的临时状态块，避免恢复指令相互矛盾。
    def clear_pending(body, marker, end):
        if marker in body:
            start = body.index(marker); finish = body.index(end, start) + len(end)
            body = body[:start] + body[finish:]
        return body.replace('用户已选择保持原门禁继续第3代同代优化。第二次失败模型与收据保全于training-attempt02-wait-linear，正在执行joint-repair-protocol.json；原报告指标仍指第二次模型，112槽由前检守门，第4代禁止启动。', '')
    entry = f"\n<!-- phase52-final-result -->\n第3代已结束，晋升={promotion['promoted']}，冠军第{state['championGeneration']}代；失败门禁：{', '.join(summary['failed']) or '无'}。本轮源码、原报告和清单见phase52-audit/；新运行身份为RUNTIME_REVISION.json的gen3RuntimeSha256。恢复命令为原Python解释器运行run_league.py --target-gen 3；重复不会追加代数。不得启动第4代。旧正文为历史口径，第3代使用纠错专用冻结合同和950MB/12GiB守卫。\n<!-- end-phase52-final-result -->\n"
    guide_body = clear_pending(guide.read_text('utf-8'), '<!-- phase52-precheck-state -->', '<!-- end-phase52-precheck-state -->')
    guide_body = clear_pending(guide_body, '<!-- phase52-final-result -->', '<!-- end-phase52-final-result -->')
    guide.write_text(guide_body.replace('# 双流 v2 联赛续跑\n', '# 双流 v2 联赛续跑\n' + entry, 1), encoding='utf-8')
    current = ROOT / 'ai_training/status/CURRENT.md'
    entry = f"\n<!-- dual-stream-v2-phase52-20261021 -->\n## 2026-10-21 阶段5.2第3代完整验收\n\n见[报告](../dual_stream_v2_phase5_20261020/REPORT.md)与[战报](../dual_stream_v2_phase5_20261020/BATTLES.md)。晋升={promotion['promoted']}，冠军第{state['championGeneration']}代；失败门禁：{', '.join(summary['failed']) or '无'}。旧代及另一合同{before['count']}文件变化{len(changed)}项。已停止，不启动第4代。\n<!-- end-dual-stream-v2-phase52-20261021 -->\n"
    current_body = clear_pending(current.read_text('utf-8'), '<!-- dual-stream-v2-phase52-precheck-20261021 -->', '<!-- end-dual-stream-v2-phase52-precheck-20261021 -->')
    current_body = clear_pending(current_body, '<!-- dual-stream-v2-phase52-20261021 -->', '<!-- end-dual-stream-v2-phase52-20261021 -->')
    current.write_text(current_body.replace('# 当前接手状态\n', '# 当前接手状态\n' + entry, 1), encoding='utf-8')
    save(DIR / 'phase52-audit/STOP_RECEIPT.json', dict(completedGeneration=3, championGeneration=state['championGeneration'], generation4Started=False, pipelineStatus=read(DIR / 'pipeline-status.json')))
    manifest_path = DIR / 'DELIVERY_MANIFEST_PHASE52.json'
    files = [p for p in DIR.rglob('*') if p.is_file() and p != manifest_path]
    files += [ROOT / p for p in freeze['runtime']] + [current]
    save(manifest_path, dict(generation=3, files={p.relative_to(ROOT).as_posix(): dict(bytes=p.stat().st_size, sha256=sha(p)) for p in files}, preservedBefore='phase52-audit/before.json', stoppedAfterGeneration=3))
    print(json.dumps(dict(promoted=promotion['promoted'], failed=summary['failed'], counts=dict(counts), preservation=preservation)), flush=True)


if __name__ == '__main__': main()
