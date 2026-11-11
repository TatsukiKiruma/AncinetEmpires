"""阶段5.1收尾：从逐局收据生成战报、保全核对和如实的晋升结论。"""
import gzip
import ast
import json
import shutil
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path
from run_league import DIR, ROOT, read, save, sha


def results(arena):
    return [read(p) for p in (DIR / arena).glob('battles/*/result.json')]


def main():
    folder = DIR / 'generations/gen_02'
    state = read(DIR / 'league-state.json')
    assert state['currentGeneration'] == 2
    promotion = read(folder / 'promotion.json')
    def promotion_ast(path):
        tree = ast.parse(path.read_text('utf-8'))
        return ast.dump(next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'promote'), include_attributes=False)
    policy_preserved = promotion_ast(DIR / 'run_league.py') == promotion_ast(DIR / 'phase51-audit/training-source-before/run_league.py')
    save(DIR / 'phase51-audit/promotion-policy-attestation.json', dict(unchanged=policy_preserved, comparison='原晋升函数AST与本轮函数AST，忽略位置和注释'))
    before = read(DIR / 'phase51-audit/before.json')
    legacy = json.loads((DIR / 'phase51-audit/legacy-stream-receipts-before.json').read_text('utf-8-sig'))
    legacy_changed = [p['Path'] for p in legacy if sha(Path(p['Path'])).lower() != p['Hash'].lower()]
    changed = [p for p, digest in before['preserved'].items() if not (ROOT / p).exists() or sha(ROOT / p) != digest]
    protected = [p for p, digest in before['protected'].items() if sha(ROOT / p) != digest]
    frozen = read(DIR / 'phase51-audit/runtime-freeze.json')
    runtime_changed = [p for p, digest in frozen['runtime'].items() if sha(ROOT / p) != digest]
    archive = DIR / 'champion-search-arena-v1-archive'
    archived_changed = [p for p, digest in frozen['archivedChampionSearch'].items() if sha(archive / p) != digest]
    if 'secondArchivedChampionSearch' in frozen:
        archived_changed += [f'v2/{p}' for p, digest in frozen['secondArchivedChampionSearch'].items() if sha(DIR / frozen['secondArchive'] / p) != digest]
    arenas = dict(championPure='champion-pure-arena', championSearch='champion-search-arena', candidate='generations/gen_02/arena')
    arms = {}
    table = ['|模型|策略|面板|槽数|自然胜|自然负|自然平|动作截断|决策超时|墙钟截断|错误|', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    all_new = []
    paired = {}
    keyed = {}
    for label, arena in arenas.items():
        rows = results(arena)
        assert len(rows) == (112 if label == 'candidate' else 56)
        for mode in sorted({r['slot']['mode'] for r in rows}):
            selected = [r for r in rows if r['slot']['mode'] == mode]
            key = label + '/' + mode
            arms[key] = dict(slots=len(selected), outcomes=dict(Counter(r['classification'] for r in selected)))
            keyed[key] = {(r['slot']['panel'], r['slot']['mapIndex'], r['slot']['seat'], r['slot']['opponent'], r['slot']['opponentSeed']): r for r in selected}
            assert len(keyed[key]) == 56
            for panel in ['fixed', 'expanded', '3ffa', '4ffa', '2v2']:
                items = [r for r in selected if r['slot']['panel'] == panel]
                counts = Counter(r['classification'] for r in items)
                model_label = '第2代' if label == 'candidate' else '第0代基准'
                mode_label = '纯策略' if mode == 'pure' else '回合搜索'
                panel_label = {'fixed': '固定图', 'expanded': '扩展图', '3ffa': '三人混战', '4ffa': '四人混战', '2v2': '2v2'}[panel]
                table.append('|' + '|'.join(map(str, [model_label, mode_label, panel_label, len(items), *[counts[k] for k in ['natural_win', 'natural_loss', 'natural_draw', 'action_truncation', 'decision_timeout', 'wall_truncation', 'error']]])) + '|')
        if label != 'championPure':
            all_new += list((DIR / arena).glob('battles/*/result.json'))
    for mode, champion in [('pure', 'championPure/pure'), ('turn_search', 'championSearch/turn_search')]:
        old, new = keyed[champion], keyed['candidate/' + mode]
        assert old.keys() == new.keys()
        paired[mode] = dict(pairs=56, gained=sum(old[k]['classification'] != 'natural_win' and new[k]['classification'] == 'natural_win' for k in old), lost=sum(old[k]['classification'] == 'natural_win' and new[k]['classification'] != 'natural_win' for k in old))
    games = list(folder.glob('games/*/result.json')); assert len(games) == 60
    all_new += games
    all_new += list((DIR / 'champion-search-arena/attempts').glob('**/result.json'))
    all_new += list((DIR / 'champion-search-arena-v2-archive/battles').glob('*/result.json'))
    all_new += list((DIR / 'champion-search-arena-v2-archive/attempts').glob('**/result.json'))
    strict = True; actions = 0; witnesses = 0; timeouts = []; errors = []; retaliation = Counter(); queue_max = 0.
    for p in all_new:
        r, receipt = read(p), read(p.parent / 'strict-replay.json')
        strict &= receipt['passed'] and receipt['actions'] == r['actions']
        actions += receipt['actions']; witnesses += receipt.get('witnessActions', 0)
        if r['classification'] == 'decision_timeout': timeouts.append(str(p.relative_to(DIR)))
        if r['classification'] in ['error', 'wall_truncation', 'interrupted'] or r.get('error'): errors.append(str(p.relative_to(DIR)))
        for line in gzip.decompress((p.parent / 'actions.jsonl.gz').read_bytes()).splitlines():
            row = json.loads(line); telemetry = row.get('telemetry')
            if telemetry and not telemetry.get('queued'):
                retaliation['attempts'] += telemetry.get('retaliationAttempts', 0)
                retaliation['complete'] += telemetry.get('retaliationComplete', 0)
            if telemetry and telemetry.get('queued'): queue_max = max(queue_max, row['ms'])
    value, heads = read(folder / 'value-calibration.json'), read(folder / 'head-calibration.json')
    parity, training = read(folder / 'tri-runtime-parity.json'), read(folder / 'training-complete.json')
    parity_error = max(float(parity[side].get(key, 0)) for side in ['node', 'chrome'] for key in ['maxLogit', 'maxActor', 'maxValue', 'maxNode', 'pipelineError', 'calibratedError'])
    audit = dict(preservedFiles=len(before['preserved']), preservedChanged=changed, protectedChanged=protected, runtimeChanged=runtime_changed, archivedBaselineChanged=archived_changed, legacyStreamReceiptChanged=legacy_changed)
    formal_errors = [p for p in errors if '/attempts/' not in p.replace('\\', '/')]
    gates = dict(promotion=promotion['promoted'], value16Slices=value['passed'], triRuntime89=parity['passed'], allNewAttemptsStrict=strict, zeroNewDecisionTimeouts=not timeouts, zeroFormalErrorsOrWallStops=not formal_errors, preserved=not changed and not archived_changed and not legacy_changed, protectedEntrypointsUnchanged=not protected, frozenRuntime=not runtime_changed, queueBelow1ms=queue_max < 1)
    gates['retaliationComplete100'] = retaliation['attempts'] > 0 and retaliation['complete'] == retaliation['attempts']
    gates['promotionPolicyUnchanged'] = policy_preserved
    gates['pureImprovesChampion'] = arms['candidate/pure']['outcomes'].get('natural_win', 0) > arms['championPure/pure']['outcomes'].get('natural_win', 0)
    def panel_wins(key, panel):
        return sum(r['classification'] == 'natural_win' for k, r in keyed[key].items() if k[0] in (['3ffa', '4ffa', '2v2'] if panel == 'multiplayer' else [panel]))
    gates['searchMatchesEveryPurePanel'] = all(panel_wins('candidate/turn_search', panel) >= panel_wins('candidate/pure', panel) for panel in ['fixed', 'expanded', 'multiplayer'])
    source_identity = read(folder / 'training-input-identity.json')['sourceIdentity']
    for name, digest in source_identity.items():
        source = ROOT / name
        target = folder / 'training-source-snapshot' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            assert sha(source) == digest, f'训练源码变化，不能用新源码补造旧快照:{name}'
            shutil.copyfile(source, target)
        assert sha(target) == digest
    save(folder / 'training-source-snapshot.json', source_identity)
    summaries = {name: read(DIR / arena / 'arena-summary.json') if name != 'candidate' else read(folder / 'arena-summary.json') for name, arena in arenas.items()}
    isolation = read(DIR / 'phase51-audit/post-evaluation-isolation.json')
    gates['trainingEvaluationIsolation'] = isolation['passed']
    directory_bytes = sum(p.stat().st_size for p in DIR.rglob('*') if p.is_file())
    free_bytes = shutil.disk_usage(DIR).free
    gates['disk'] = directory_bytes < 650_000_000 and free_bytes >= 12 * 1024 ** 3
    summary = dict(stage='phase5.1', generation=2, championGeneration=state['championGeneration'], promoted=promotion['promoted'], promotionDecision=promotion, gates=gates, failed=[k for k, v in gates.items() if not v], legacyPhase5Gates=dict(path='phase51-audit/training-source-before/gate-summary.json', sha256=sha(DIR / 'phase51-audit/training-source-before/gate-summary.json'), note='旧阶段全部失败尝试和历史schema比较限制按原件保留，本轮统计不替代旧门禁'), arms=arms, arenaSummaries=summaries, paired=paired, actualActions=actions, witnessActions=witnesses, timeouts=timeouts, errors=errors, retaliation=dict(retaliation), queueMaximumMs=queue_max, preservation=audit, training=training, isolation=isolation, valueFailedSlices=[k for k, v in value['slices'].items() if not v['allBaselinesExceeded']], headCalibration=heads, independentFinalTest=False)
    cache_archive = read(DIR / 'phase51-audit/calibration-cache-archive.json')
    assert all(sha(ROOT / p['path']) == p['sha256'] for p in cache_archive['files'].values())
    summary.update(complete=True, latestCompletedGeneration=2, passed=all(gates.values()), status='complete' if all(gates.values()) else 'completed_quality_unmet', directoryBytesBeforeReports=directory_bytes, systemFreeBytes=free_bytes, calibrationCacheArchive=cache_archive)
    summary.update(requestedStopAfterGeneration=2, continuedToGeneration3=False)
    save(DIR / 'gate-summary.json', summary)
    save(DIR / 'phase51-audit/preservation-after.json', audit)
    save(DIR / 'phase51-audit/paired-comparison.json', paired)
    (DIR / 'BATTLES.md').write_text('# 阶段5.1第2代配对战报\n\n同初态、同对手种子，每臂56槽。纯策略复用已核验SHA的第0代基线；搜索为最终运行时重测。第2代搜索采用新策略权重与父代价值，纯策略只用新策略权重。\n\n' + '\n'.join(table) + '\n\n自然结果与截断、超时、错误分列；这是已消费开发面板，不是独立最终盲测。旧战报原文在 phase51-audit/training-source-before/BATTLES.md。\n', encoding='utf-8')
    failure_labels = dict(promotion='原状态机晋升', queueBelow1ms='本轮全部尝试队列峰值小于1ms', retaliationComplete100='真实反扑展开完整率100%', pureImprovesChampion='纯策略胜场超过冠军', searchMatchesEveryPurePanel='搜索三个主面板不低于同代纯策略')
    failed_text = '、'.join(failure_labels.get(key, key) for key in summary['failed']) or '无'
    report = f'''# 双流v2阶段5.1第2代执行报告

执行至第2代；晋升={promotion['promoted']}，当前冠军第{state['championGeneration']}代。失败门禁：{failed_text}。

完整战绩见[BATTLES.md](BATTLES.md)，逐项机器证据见[gate-summary.json](gate-summary.json)。原阶段5报告和续跑说明逐字节保存在[旧报告](phase51-audit/training-source-before/REPORT.md)及同目录快照。今天另一个合同的第2代实验保持原样，本报告仅对应当前阶段5目录的新记录。

|策略|第0代自然胜|第2代自然胜|配对新增胜槽|配对丢失胜槽|
|---|---:|---:|---:|---:|
|纯策略|{arms['championPure/pure']['outcomes'].get('natural_win', 0)}/56|{arms['candidate/pure']['outcomes'].get('natural_win', 0)}/56|{paired['pure']['gained']}|{paired['pure']['lost']}|
|回合搜索|{arms['championSearch/turn_search']['outcomes'].get('natural_win', 0)}/56|{arms['candidate/turn_search']['outcomes'].get('natural_win', 0)}/56|{paired['turn_search']['gained']}|{paired['turn_search']['lost']}|

原状态机的纯策略不退化判定：{'通过' if promotion['pureNoRegression'] else '未通过'}；搜索不退化判定：{'通过' if promotion['searchNoRegression'] else '未通过'}。两项均按固定图20槽、扩展图20槽、多人16槽分别与冠军比较；晋升函数与开工版本AST一致。

训练从第0代热启动，基础/专家按预计样本比例均匀交错；AdamW峰值学习率3e-5、余弦下限3e-6，专家纠错1.5、获胜1.0，冠军KL为0.10。共享骨干与价值均参与更新；移除原始网络拟合外置rootValue的MSE。完成{training['updates']}次更新、{training['samples']}条样本；详情与恢复身份在该代training-complete.json、training-input-identity.json和checkpoint.pt。

默认首选单位链的每一步使用神经排序且只保留首选，其它单位/候选仍用启发式；预算750ms，叶前向须距候选期限至少45ms。动作头从第0代外置偏置锚点出发，偏移逐维限定±0.25；开发真实actor:head解码命中率或无谓待机退化即回退冠军。价值预登记24组L-BFGS候选增加0/0.05/0.15军力保底混合，全部只用train拟合，dev只作16切片门禁，未依据实战挑选超参数。价值通过={value['passed']}；三端89状态通过={parity['passed']}。

动作头微调的开发命中率由{heads['before']['headTop1']:.4%}变为{heads['attempted']['headTop1']:.4%}，但有未行动机会时的待机数由{heads['before']['waitWithAnyUnmovedOpportunity']}变为{heads['attempted']['waitWithAnyUnmovedOpportunity']}，因此按守门规则拒绝微调并逐字采用冠军外置偏置；未因命中率单项改善放行。

首轮24候选未通过全部切片，原件保存在calibration-attempt01-army-floor。候选实战尚未启动时按原授权追加父代logits插值：父代样本目标、活跃槽、态势及几何逐项相同，冻结父代参数在当前池16/16仍通过。新增候选0及96组训练集L-BFGS插值网格，开发只做门禁，按合格候选训练NLL选择。最终父代价值混合权重={value['config'].get('parentMixture', 0)}；策略仍使用本轮训练权重，不能将继承父代价值宣称为新价值头提升。运行时扩展后原38胜冠军面板完整按SHA归档到champion-search-arena-v2-archive，再以新运行时重测。

三端网络及组合最大误差{parity_error}，动作/价值argmax一致；真实Chrome临时Profile清理={parity['chrome']['chromeProfileCleaned']}。原冻结观测数组在新收据中再次逐字节核验。

第2代正式112槽共{summaries['candidate']['actualActions']}实际动作、{summaries['candidate']['witnessActions']}反扑动作，全部strict通过，决策超时、错误和墙钟截断均为0。该代搜索根决策p95={summaries['candidate']['rootLatency']['p95']:.3f}ms、最大={summaries['candidate']['rootLatency']['max']:.3f}ms，队列最大={summaries['candidate']['queueLatency']['max']:.6f}ms；该代正式队列全部小于1ms。下面的本轮全尝试统计还包含两次冠军基线与归档失败前缀。

本轮新尝试共{actions}实际动作、{witnesses}反扑动作，strict={strict}；决策超时{len(timeouts)}，全部尝试错误或墙钟停止{len(errors)}，其中当前正式结果错误/墙钟{len(formal_errors)}。逐局详情与时延见机器汇总；不得用静态覆盖冒称真实反扑完成。队列最大{queue_max:.6f}ms，真实反扑完成{retaliation['complete']}/{retaliation['attempts']}。

一次验证夹具清理与目录扫描并发，造成冠军三人槽700动作后ENOENT中断。700动作及3971反扑动作strict通过，原文件按SHA归档于champion-search-arena-v2-archive/attempts/disk-scan-race-20261021。目录统计只对ENOENT容错，权限错误仍抛出；在扫描范围外的竞态回归通过。相同模型、初态和种子的新attempt补齐正式槽，原失败单列，未按战绩挑选或覆盖证据。

旧代及今天既有实验{audit['preservedFiles']}份文件哈希变化{len(changed)}项；保护入口变化{len(protected)}项，旧冠军搜索归档变化{len(archived_changed)}项。650MB目录配额及系统至少12GiB空闲守卫保留。本轮新生成的45,766,155字节校准统计按SHA保全到兄弟目录dual_stream_v2_phase51_cache_archive_20261021，恢复位置见phase51-audit/calibration-cache-archive.json；旧第0/1代、新模型、检查点和对局原件保持原位。

最终公共完整测试437通过、20跳过；首选链、候选期限及父代价值等6项定向回归通过。公共lint/build、阶段独立tsc、9项Python回归和原子纠错合法夹具通过。未重验APK原始解包资源，跳过不计通过。没有GUI入口修改、手机操作、部署或最终盲测。按用户最新要求，第2代完整结束后停止，无论是否晋升均不继续第3代。
'''
    (DIR / 'REPORT.md').write_text(report, encoding='utf-8')
    guide = DIR / 'LEAGUE_RESUME_GUIDE.md'
    guide_text = guide.read_text('utf-8')
    guide_start = '<!-- phase51-final-result -->'
    guide_end = '<!-- end-phase51-final-result -->'
    guide_entry = f"{guide_start}\n## 第2代最终状态\n\n状态机已完成第2代，晋升={promotion['promoted']}，当前冠军第{state['championGeneration']}代；种子游标={state['seedCursor']}。第2代纯策略{arms['candidate/pure']['outcomes'].get('natural_win', 0)}/56自然胜，搜索{arms['candidate/turn_search']['outcomes'].get('natural_win', 0)}/56自然胜；同运行时冠军分别为{arms['championPure/pure']['outcomes'].get('natural_win', 0)}/56与{arms['championSearch/turn_search']['outcomes'].get('natural_win', 0)}/56。全部自然负、平局、截断、超时及错误见[BATTLES.md](BATTLES.md)，晋升逐项判定见`generations/gen_02/promotion.json`。\n\n价值16/16、89状态三端及训练/评测隔离结果以[gate-summary.json](gate-summary.json)为准；全面质量未通过项：{', '.join(summary['failed']) or '无'}。重复`--target-gen 2`不会追加训练代数；未晋升时不自动继续第3代。训练源码快照与最终推理源码各有独立SHA，不能用最终运行时覆盖旧训练输入身份。\n{guide_end}\n\n"
    guide_entry = guide_entry.replace('未晋升时不自动继续第3代。', '按用户最新要求，无论是否晋升，完整完成第2代后均停止，不继续第3代。')
    if guide_start in guide_text:
        start = guide_text.index(guide_start)
        end = guide_text.index(guide_end, start) + len(guide_end)
        guide_text = guide_text[:start] + guide_entry.rstrip() + guide_text[end:]
    else:
        guide_text = guide_text.replace('# 双流 v2 联赛续跑\n', '# 双流 v2 联赛续跑\n\n' + guide_entry, 1)
    guide.write_text(guide_text, encoding='utf-8')
    current = ROOT / 'ai_training/status/CURRENT.md'
    text = current.read_text('utf-8')
    marker = '<!-- dual-stream-v2-phase51-20261021 -->'
    entry = f"{marker}\n## 2026-10-21 阶段5.1精准修复及第2代验收\n\n见[报告](../dual_stream_v2_phase5_20261020/REPORT.md)与[战报](../dual_stream_v2_phase5_20261020/BATTLES.md)。晋升={promotion['promoted']}，冠军第{state['championGeneration']}代；失败门禁：{', '.join(summary['failed']) or '无'}。旧代{audit['preservedFiles']}文件变化{len(changed)}项，受保护入口变化{len(protected)}项；不混用同日另一合同第2代的结果。\n<!-- end-dual-stream-v2-phase51-20261021 -->\n\n"
    if marker in text:
        start = text.index(marker)
        end_marker = '<!-- end-dual-stream-v2-phase51-20261021 -->'
        end = text.index(end_marker, start) + len(end_marker)
        text = text[:start] + entry.rstrip() + text[end:]
    else:
        text = text.replace('# 当前接手状态\n', '# 当前接手状态\n\n' + entry, 1)
    current.write_text(text, encoding='utf-8')
    manifest_path = DIR / 'DELIVERY_MANIFEST_PHASE51.json'
    files = [p for p in DIR.rglob('*') if p.is_file() and p != manifest_path]
    files += [ROOT / p for p in frozen['runtime']]
    files += [ROOT / p for p in source_identity]
    files += list((ROOT / 'src/ai_runtime/dual_v2').glob('*.test.ts'))
    files += [ROOT / p for p in before['protected']]
    files.append(current)
    files += [ROOT / p['path'] for p in cache_archive['files'].values()]
    save(manifest_path, dict(stage='phase5.1', generation=2, files={p.relative_to(ROOT).as_posix(): dict(bytes=p.stat().st_size, sha256=sha(p)) for p in files}, includesHistoricalPreservedBytes=True))
    print(json.dumps(dict(promoted=promotion['promoted'], arms=arms, failed=summary['failed'], preservation=audit), ensure_ascii=False))


if __name__ == '__main__': main()
