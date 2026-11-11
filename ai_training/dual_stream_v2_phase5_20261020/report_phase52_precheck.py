"""如实交付第3代前检结果；没有112槽时不宣称整代完成或执行晋升。"""
import gzip
import json
import shutil
from collections import Counter
from run_league import DIR, ROOT, read, save, sha


def main():
    folder = DIR / 'generations/gen_03'; state = read(DIR / 'league-state.json')
    assert state['currentGeneration'] == 2 and not (folder / 'arena/plan.json').exists()
    dev = read(folder / 'dev-policy-audit.json'); training = read(folder / 'training-complete.json')
    parity = read(folder / 'tri-runtime-parity.json'); value = read(folder / 'value-calibration.json')
    isolation = read(DIR / 'phase52-audit/post-evaluation-isolation.json')
    first = read(folder / 'training-attempt01-prior-aware/dev-policy-audit.json')
    assert not dev['passed'] and parity['passed'] and parity['modelSha256'] == sha(folder / 'model.bin')
    before = read(DIR / 'phase52-audit/before.json')
    changed = [p for p, e in before['files'].items() if not (ROOT / p).exists() or sha(ROOT / p) != e['sha256']]
    old = read(folder / 'training-attempt01-prior-aware/ARCHIVE_MANIFEST.json')
    archive_changed = [p for p, digest in old['files'].items() if sha(folder / 'training-attempt01-prior-aware' / p) != digest]
    baseline = read(DIR / 'champion-search-arena/arena-summary.json')
    extraction = read(folder / 'extraction-summary.json'); expert = read(folder / 'expert-stream-epoch0.json')
    sample_outcomes = Counter(read(p)['classification'] for p in folder.glob('games/*/result.json'))
    counters = Counter(); queues = []
    for arena, glob in [(DIR / 'champion-search-arena', 'battles/*/result.json'), (folder, 'games/*/result.json')]:
        for p in arena.glob(glob):
            r = read(p); receipt = read(p.parent / 'strict-replay.json'); assert receipt['passed'] and receipt['actions'] == r['actions']
            counters['actualActions'] += receipt['actions']; counters['witnessActions'] += receipt['witnessActions']
            if r['classification'] == 'decision_timeout': counters['decisionTimeouts'] += 1
            if r['classification'] in ['error', 'wall_truncation'] or r.get('error'): counters['errorsOrWallStops'] += 1
            for line in gzip.decompress((p.parent / 'actions.jsonl.gz').read_bytes()).splitlines():
                row = json.loads(line); telemetry = row.get('telemetry') or {}
                if telemetry.get('queued'): queues.append(row['ms'])
                else:
                    counters['retaliationAttempts'] += telemetry.get('retaliationAttempts', 0); counters['retaliationComplete'] += telemetry.get('retaliationComplete', 0)
    gates = dict(selfplay60Strict=extraction['games'] == 60 and extraction['strictAllAttempts'], priorAwareCorrectionOnly=expert['correctionOnly'], frozenValueZero=training['maxValueLogitsDifference'] == dev['maxValueLogitsDifference'] == 0., frozenBinary=dev['frozenBinaryAudit']['allByteIdentical'], auxiliaryOnlyWaitRow=read(folder / 'wait-row-byte-audit.json')['passed'], value16Slices=value['passed'], triRuntime89=parity['passed'] and parity['chrome']['chromeProfileCleaned'], devPolicyAudit=dev['passed'], devHeadTop1=dev['gates']['headTop1'], devWaitAtMost2=dev['gates']['waitWithAnyUnmovedOpportunity'], protectedActionCounts=dev['gates']['protectedHeadCounts'], correctionImproves=dev['gates']['correctionImproves'], trainingEvaluationIsolation=isolation['passed'], oldFilesUnchanged=not changed and not archive_changed, queueBelow1ms=max(queues) < 1., queueBelowPoint5ms=max(queues) < .5, retaliationComplete100=counters['retaliationAttempts'] == counters['retaliationComplete'], zeroDecisionTimeouts=counters['decisionTimeouts'] == 0, fullArena112=False, promotionExecuted=False)
    summary = dict(stage='phase5.2', generation=3, complete=False, status='dev_precheck_failed_before_arena', currentCompletedGeneration=2, championGeneration=state['championGeneration'], promotionExecuted=False, candidateArenaSlots=0, gates=gates, unmet=[k for k, v in gates.items() if not v], notRun=['candidatePure56', 'candidateSearch56', 'promote(3)'], requestedStopAfterGeneration=3, generation4Started=False, devPolicyAudit=dev, firstAttemptDevPolicyAudit=first, triRuntimeParity=parity, valueCalibration=value, training=training, extraction=extraction, selfplayOutcomes=sample_outcomes, expertStream=expert, isolation=isolation, observedFinalRuntimeBaselineAndSelfplay=dict(counters=counters, queueMaximumMs=max(queues), scope='仅当前最终运行时56槽冠军基准及60局采样；更早工程尝试原件按SHA另存'), preservation=dict(files=before['count'], changed=changed, firstTrainingArchiveChanged=archive_changed), sameRuntimeChampionSearch=baseline, pendingDecision='保持原门禁继续同代优化，或明确允许当前失败版本进行不晋升的112槽诊断')
    backup = DIR / 'phase52-audit/precheck-documents-before'; backup.mkdir(exist_ok=True)
    for name in ['REPORT.md', 'BATTLES.md', 'gate-summary.json', 'LEAGUE_RESUME_GUIDE.md']:
        if not (backup / name).exists(): shutil.copyfile(DIR / name, backup / name)
    current = ROOT / 'ai_training/status/CURRENT.md'
    if not (backup / 'CURRENT.md').exists(): shutil.copyfile(current, backup / 'CURRENT.md')
    save(DIR / 'gate-summary.json', summary)
    table = ['|版本|headTop1|相对冠军变化|有未移动机会时待机|纠错命中|', '|---|---:|---:|---:|---:|']
    for label, audit in [('第0代同口径基线', dev), ('先验感知首版', first), ('待机语义校正版', dev)]:
        metrics = audit['champion'] if label.startswith('第0') else audit['student']
        delta = metrics['headTop1'] - dev['champion']['headTop1']
        hits = '0/8520' if label.startswith('第0') else f"{audit['expert']['studentHits']}/8520"
        table.append(f"|{label}|{metrics['headTop1']:.4%}|{delta*100:+.4f}个百分点|{metrics['waitWithAnyUnmovedOpportunity']}|{hits}|")
    text = f'''# 阶段5.2第3代：训练及三端核验完成，开发前检未通过

第3代尚未完整结束：112槽候选实战和promote(3)尚未执行，联赛已完成代数仍为2，冠军仍为第{state['championGeneration']}代。没有启动第4代。

{chr(10).join(table)}

当前模型未过两项前检：headTop1相比同口径冠军下降{(dev['champion']['headTop1']-dev['student']['headTop1'])*100:.4f}个百分点，超过0.2个百分点；有未移动机会时待机为{dev['student']['waitWithAnyUnmovedOpportunity']}，高于绝对门槛2。因此没有将当前模型作为通过门禁的正式晋升候选。纠错命中提升只属于训练拟合，不是独立泛化。

请求中的82.8755%/2来自第2代head-calibration.json的before字段，并非第0代同口径基线；本轮实际重新计算冠军为85.1192%/23。源码动作合同中招募头为5，头11为突击后移动，最终审计同时覆盖两者。证据见phase52-audit/metric-attribution.json；门槛没有因基线更高而放宽。

60局采样及54,448实际/159,399反扑动作全部strict；{sample_outcomes['natural_terminal']}局自然终局、{sample_outcomes['action_truncation']}局动作数截断，采样决策超时{sample_outcomes['decision_timeout']}。提取4,344条本代真实纠错；训练只使用第2/3代共8,520纠错，44,144条普通获胜步不进入专家损失。先验感知基础/专家流完成2,701次AdamW更新，基础19,127条；共享骨干、价值及内置headBias冻结，valueLogits最大差异0。所有冻结张量导出字节与第0代相同，价值/动作外置校准逐字继承，16/16价值切片继承，无外置父代双前向。

首版模型、检查点、源码和三端收据90份文件保存在generations/gen_03/training-attempt01-prior-aware/。同代辅助阶段只扫描训练池134,568条，使用15,247条KL锚点和119个违例局面，2,000次Adam更新仅改变what_entity待机语义行。二进制独立核验通过；开发集只作门禁，不进入梯度更新。

当前模型SHA：{sha(folder / 'model.bin')}。89个冻结状态PyTorch/Node/真实Chrome最大误差0、argmax一致、临时Profile已清理。首次Chrome沙箱失败和其后真实执行收据均保留。

同运行时冠军搜索基准56槽自然胜38：固定10/20、扩展15/20、多人13/16。模型根p95/max为330.6272/551.5697ms；队列峰值1.158ms。一次扩展槽对手超时1039.6673ms，不计自然胜。最终运行时基准及采样合计真实反扑{counters['retaliationComplete']}/{counters['retaliationAttempts']}，并未达到100%；较早工程尝试按SHA另存，不能用本段替代其失败记录。详见gate-summary.json与BATTLES.md。

训练/评测隔离复核通过：基础/专家/辅助训练样本的完整SHA和权威规则等价态重叠均为0。旧代、同日另一合同和保护入口共{before['count']}文件SHA变化{len(changed)}项；首版训练归档变化{len(archive_changed)}项。公共lint、440测试/20跳过、build、阶段独立tsc及16项Python合同回归通过。APK原始解包资源未重验，跳过不算通过。没有修改GUI入口、操作手机或部署。

下一步需要明确选择：保持原门禁继续同代优化，或允许当前模型先进行112槽诊断且保留门禁失败、不晋升。当前没有放宽任何门禁，也没有把未运行实战记作完成。
'''
    (DIR / 'REPORT.md').write_text(text, encoding='utf-8')
    battle = ['# 阶段5.2已执行战报（候选112槽尚未启动）', '', '|策略|面板|槽数|自然胜|自然负|截断|决策超时|', '|---|---|---:|---:|---:|---:|---:|']
    for key, group in baseline['groups'].items():
        o = group['outcomes']; battle.append('|' + '|'.join(map(str, ['第0代搜索', key, group['slots'], o.get('natural_win', 0), o.get('natural_loss', 0), o.get('action_truncation', 0), o.get('decision_timeout', 0)])) + '|')
    battle += ['', '第0代纯策略56槽按SHA复用：固定14/20、扩展13/20、多人7/16，共34自然胜。', '', '第3代纯策略/搜索：0/112槽。开发前检失败，未执行正式晋升评测，不以零槽推断胜率。', '', '采样：60局，55自然终局、5动作数截断；属于训练用途，不计入正式胜率。旧阶段5.1战报保存在phase52-audit/harness-before/BATTLES.md。']
    (DIR / 'BATTLES.md').write_text('\n'.join(battle) + '\n', encoding='utf-8')
    guide = DIR / 'LEAGUE_RESUME_GUIDE.md'; marker = '<!-- phase52-precheck-state -->'; end = '<!-- end-phase52-precheck-state -->'
    entry = f"{marker}\n## 第3代当前恢复状态\n\n60局采样、分阶段策略训练及89状态三端已完成；开发前检失败，候选112槽和promote(3)未执行。当前模型及失败项见REPORT.md；完整机器身份见generations/gen_03/training-input-identity.json。重复--target-gen 3会复核现有产物，但不会绕过arena_plan.py的前检断言，不能靠删除收据启动实战。若继续同代修复，先保全当前完整产物并登记新训练合同；若选择112槽失败版本诊断，须明确记录非晋升资格并保持门禁失败。不能启动第4代。\n{end}\n\n"
    body = guide.read_text('utf-8')
    if marker not in body: body = body.replace('# 双流 v2 联赛续跑\n', '# 双流 v2 联赛续跑\n\n' + entry, 1)
    guide.write_text(body, encoding='utf-8')
    marker = '<!-- dual-stream-v2-phase52-precheck-20261021 -->'; end = '<!-- end-dual-stream-v2-phase52-precheck-20261021 -->'
    entry = f"{marker}\n## 2026-10-21 阶段5.2第3代前检未通过，112槽尚未启动\n\n见[报告](../dual_stream_v2_phase5_20261020/REPORT.md)。60局strict、先验纠错蒸馏、冻结价值及89状态三端误差0已完成。当前headTop1=84.7625%，同口径冠军85.1192%；有未移动机会时待机10（门槛2）。候选112槽和promote(3)未执行，已完成代数仍2、冠军仍0；没有第4代。旧受保护6766文件SHA变化0项。\n{end}\n\n"
    body = current.read_text('utf-8')
    if marker not in body: body = body.replace('# 当前接手状态\n', '# 当前接手状态\n\n' + entry, 1)
    current.write_text(body, encoding='utf-8')
    save(DIR / 'pipeline-status.json', dict(stage='dev_precheck_failed_before_arena', generation=3, currentCompletedGeneration=2, pids=[], candidateArenaSlots=0, pendingDecision=summary['pendingDecision']))
    save(DIR / 'phase52-audit/precheck-preservation.json', summary['preservation'])
    save(DIR / 'phase52-audit/PRECHECK_HOLD.json', dict(reason='用户新增前检未通过，未擅自放宽门禁', candidateArenaStarted=False, generation4Started=False, modelSha256=sha(folder / 'model.bin')))
    print(dict(status=summary['status'], unmet=summary['unmet'], preserved=len(before['files']), changed=changed))


if __name__ == '__main__': main()
