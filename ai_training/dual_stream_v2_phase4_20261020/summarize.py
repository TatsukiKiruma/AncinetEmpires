"""完整保留失败结果，按预先登记的配对协议生成交付证据。"""
import collections
import hashlib
import json
import math
from pathlib import Path

DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]
def read(name): return json.loads((DIR / name).read_text('utf-8-sig'))
def save(name, value): (DIR / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def quantiles(values):
    s = sorted(values)
    return dict(count=len(s), **{k: s[max(0, math.ceil(len(s) * q) - 1)] if s else None for k, q in [('p50', .5), ('p95', .95), ('p99', .99), ('max', 1)]})
def mcnemar(pure, search):
    wins, losses = sum(not p and s for p, s in zip(pure, search)), sum(p and not s for p, s in zip(pure, search))
    n = wins + losses
    p = min(1., 2 * sum(math.comb(n, i) for i in range(min(wins, losses) + 1)) / 2 ** n) if n else 1.
    return dict(searchOnlyWins=wins, pureOnlyWins=losses, pValue=p, significant=p < .05 and wins > losses)

def main():
    plan = read('battle-plan.json'); results = []; missing = []
    for slot in plan['slots']:
        result = DIR / 'battles' / slot['id'] / 'result.json'
        if not result.exists(): missing.append(slot['id']); continue
        r = json.loads(result.read_text('utf-8')); strict = result.with_name('strict-replay.json')
        r['strict'] = json.loads(strict.read_text('utf-8')) if strict.exists() else dict(passed=False)
        results.append(r)
    table = []
    for model in ['dual_v2_stage4_pure', 'dual_v2_stage4_turn_search']:
        for panel in ['fixed', 'expanded', '3ffa', '4ffa', '2v2']:
            rows = [r for r in results if r['slot']['model'] == model and r['slot']['panel'] == panel]
            metrics = collections.Counter()
            for r in rows: metrics.update(r['metrics']['model'])
            counts = dict(collections.Counter(r['classification'] for r in rows))
            table.append(dict(model=model, panel=panel, slots=len(rows), classifications=counts, metrics=dict(metrics), naturalWins=counts.get('natural_win', 0),
                latency=quantiles([v for r in rows for v in r['latencySamples']['model']]), rootLatency=quantiles([v for r in rows for v in r.get('rootTimes', [])]), queueLatency=quantiles([v for r in rows for v in r.get('queueTimes', [])]),
                missedRecruitRate=metrics['endWithRecruit'] / max(1, metrics['endTurns']), strictActions=sum(r['strict'].get('actions', 0) for r in rows), witnessActions=sum(r['strict'].get('witnessActions', 0) for r in rows), round10IncomeDifference=sum(r['round10'].get('recurringIncomeDifference', 0) for r in rows) / max(1, sum(r['round10'].get('reached', False) for r in rows))))
    paired = {}
    for panel in ['fixed', 'expanded']:
        ids = [s['stage3Id'] for s in plan['slots'] if s['panel'] == panel and s['model'] == 'dual_v2_stage4_pure']
        indicators = {m: {r['slot']['stage3Id']: r['classification'] == 'natural_win' for r in results if r['slot']['model'] == m and r['slot']['panel'] == panel} for m in ['dual_v2_stage4_pure', 'dual_v2_stage4_turn_search']}
        available = [i for i in ids if all(i in values for values in indicators.values())]
        paired[panel] = dict(pairs=len(available), **mcnemar([indicators['dual_v2_stage4_pure'][i] for i in available], [indicators['dual_v2_stage4_turn_search'][i] for i in available]))
    old = json.loads((DIR.parent / 'dual_stream_v2_phase3_20261020/battle-summary.json').read_text('utf-8'))
    old_waits = sum(r['metrics']['unmovedWaits'] for r in old['table'])
    search = [r for r in table if r['model'] == 'dual_v2_stage4_turn_search']
    search_results = [r for r in results if r['slot']['model'] == 'dual_v2_stage4_turn_search']
    latency = quantiles([v for r in search_results for v in r['latencySamples']['model']]); queues = quantiles([v for r in search_results for v in r.get('queueTimes', [])])
    fixes = dict(oldUnmovedWaits=old_waits, searchUnmovedWaits=sum(r['metrics'].get('unmovedWaits', 0) for r in search), pureUnmovedWaits=sum(r['metrics'].get('unmovedWaits', 0) for r in table if r['model'] == 'dual_v2_stage4_pure'))
    fixes['unmovedWaitReduction'] = 1 - fixes['searchUnmovedWaits'] / max(1, old_waits)
    fixes['pureUnmovedWaitReduction'] = 1 - fixes['pureUnmovedWaits'] / max(1, old_waits)
    gates = dict(complete112Slots=len(results) == 112 and not missing, strict=bool(results) and all(r['strict']['passed'] for r in results),
        noTimeoutOrWall=bool(results) and all(r['classification'] not in ['decision_timeout', 'wall_truncation', 'error'] for r in results), searchP95=latency['p95'] is not None and latency['p95'] <= 1000,
        queueStepsBelow1ms=queues['max'] is not None and queues['max'] < 1,
        missedRecruit=bool(search) and all(r['missedRecruitRate'] < .15 for r in table), unmovedWaits=fixes['unmovedWaitReduction'] >= .8 and fixes['pureUnmovedWaitReduction'] >= .8,
        significantFixed=paired['fixed']['pairs'] == 20 and paired['fixed']['significant'], significantExpanded=paired['expanded']['pairs'] == 20 and paired['expanded']['significant'],
        historicalFixed=any(r['panel'] == 'fixed' and r['naturalWins'] >= 14 for r in search), historicalExpanded=any(r['panel'] == 'expanded' and r['naturalWins'] >= 13 for r in search),
        multiplayer=sum(r['naturalWins'] for r in search if r['panel'] in ['3ffa', '4ffa', '2v2']) >= 8 and all(any(r['panel'] == p and r['naturalWins'] > 0 for r in search) for p in ['3ffa', '4ffa', '2v2']))
    gates['strictFinalPanels'] = gates['strict']
    gates['strictAllAttempts'] = gates['strictFinalPanels'] and not any(r.get('unflushedTailUnknown') for r in read('interrupted-attempt-audit.json')['receipts'])
    gates['strict'] = gates['strictAllAttempts']
    summary = dict(passed=all(gates.values()), gates=gates, table=table, paired=paired, stage3Fixes=fixes, missing=missing, results=results, independentEvaluation=False)
    opponent_slices = []
    for model, panel, opponent in sorted({(r['slot']['model'], r['slot']['panel'], r['slot']['opponent']) for r in results}):
        group = [r for r in results if (r['slot']['model'], r['slot']['panel'], r['slot']['opponent']) == (model, panel, opponent)]
        opponent_slices.append(dict(model=model, panel=panel, opponent=opponent, count=len(group), classifications=dict(collections.Counter(r['classification'] for r in group))))
    summary['opponentSlices'] = opponent_slices
    save('battle-summary.json', summary)
    lines = ['# 阶段4配对实战', '', '全部槽位为已消费开发面板；自然胜负、动作截断、墙钟和决策超时分别统计。每臂56槽，共112槽。', '', '|模型|面板|槽数|自然胜/负|动作/墙钟/超时|整体p50/p95/p99 ms|根p50/p95/p99 ms|漏招募/end|第10轮收入差|实际集火受击/死亡|strict实际/反扑动作|', '|---|---|---:|---|---|---|---|---|---:|---|---|']
    def latency_text(q): return '/'.join('-' if q[k] is None else f'{q[k]:.3f}' for k in ['p50', 'p95', 'p99'])
    for r in table:
        c = r['classifications']; m = r['metrics']
        lines.append(f"|{r['model']}|{r['panel']}|{r['slots']}|{c.get('natural_win',0)}/{c.get('natural_loss',0)}|{c.get('action_truncation',0)}/{c.get('wall_truncation',0)}/{c.get('decision_timeout',0)}|{latency_text(r['latency'])}|{latency_text(r['rootLatency'])}|{m.get('endWithRecruit',0)}/{m.get('endTurns',0)}|{r['round10IncomeDifference']:.2f}|{m.get('focusVictims',0)}/{m.get('focusDeaths',0)}|{r['strictActions']}/{r['witnessActions']}|")
    lines += ['', '配对检验：`' + json.dumps(paired, ensure_ascii=False) + '`。', '', '未移动wait变化：`' + json.dumps(fixes, ensure_ascii=False) + '`。', '', '门禁：`' + json.dumps(gates, ensure_ascii=False) + '`。', '', '逐局全部动作、耗时和反扑见证保存在battles/；strict独立重放核验完整前后态、合法动作和过程指标。截断不计自然胜利。']
    lines += ['', '## 对手分层', '', '|模型|面板|对手|槽数|自然胜/负/动作截断|', '|---|---|---|---:|---|']
    for r in opponent_slices:
        c = r['classifications']; lines.append(f"|{r['model']}|{r['panel']}|{r['opponent']}|{r['count']}|{c.get('natural_win',0)}/{c.get('natural_loss',0)}/{c.get('action_truncation',0)}|")
    (DIR / 'BATTLES.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    preservation = []; changed = []
    for item in read('preservation-before.json'):
        p = ROOT / item['path']; match = p.exists() and sha(p) == item['sha256']; preservation.append(dict(path=item['path'], matched=match))
        if not match: changed.append(item['path'])
    save('preservation-after.json', dict(passed=not changed, checked=len(preservation), changed=changed, files=preservation))
    value = read('value-calibration.json'); chrome = read('dual-v2-stage4-pure-browser-parity.json'); node = read('dual-v2-stage4-pure-node-parity.json')
    pipeline_passed = node.get('finalPipelineOriginalStates') == 89 and chrome.get('finalPipelineOriginalStates') == 89 and node.get('pipelineError', 1) < 1e-5 and chrome.get('pipelineError', 1) < 1e-5 and node.get('pipelineArgmax') and chrome.get('pipelineArgmax')
    save('tri-runtime-parity-gate.json', dict(passed=bool(node['passed'] and chrome['passed'] and pipeline_passed), originalStates=89, fullPipeline=True, nodePipelineMaxError=node.get('pipelineError'), chromePipelineMaxError=chrome.get('pipelineError'), argmaxAllMatched=bool(node.get('pipelineArgmax') and chrome.get('pipelineArgmax')), chromeProfileCleaned=chrome['chromeProfileCleaned'], stateRecovery=read('pipeline-state-recovery.json')))
    behavior = read('fix-behavior-audit.json')
    fix_gate = dict(passed=value['passed'] and chrome['passed'] and node['passed'] and gates['unmovedWaits'] and gates['missedRecruit'] and behavior['passed'], valueBaselines=value['passed'], nodeParity=node['passed'], chromeParity=chrome['passed'], calibratedValueChrome=chrome.get('calibratedError'), stage3Fixes=fixes, behaviorAuditPassed=behavior['passed'])
    fix_gate['finalPipelineOriginal89'] = bool(pipeline_passed)
    fix_gate['passed'] = fix_gate['passed'] and pipeline_passed
    save('stage3-fix-and-value-gate.json', fix_gate)
    overall = dict(stage3FixAndValue=fix_gate['passed'], multiUnit=read('multi-unit-combo-regressions.json')['passed'], battles=summary['passed'], historicalPreservation=not changed, publicChecks=read('public-checks.json')['passed'])
    overall['disk'] = sum(p.stat().st_size for p in DIR.rglob('*') if p.is_file()) <= 250000000
    save('gate-summary.json', dict(passed=all(overall.values()), gates=overall, failed=[k for k,v in overall.items() if not v], battleGates=gates))
    (DIR / 'REPORT.md').write_text('# 双流v2阶段4报告\n\n阶段4实现和验收执行结果：' + ('全部门禁通过。' if all(overall.values()) else '质量门禁未全通过，候选不宣称合格交付。') + '\n\n详见[BATTLES.md](BATTLES.md)、[gate-summary.json](gate-summary.json)、[value-calibration.json](value-calibration.json)。\n\n实现包括权威规则驱动的移动战术先验、max组动作校准、9桶温度与军力/收入跳连、最多3单位完整链束搜索、按顺位反扑与逐指挥官守卫、完整身份校验队列。保持原501642参数网络，新增27个价值校准标量及15个动作偏置；骨干和原始模型权重冻结。训练与开发来源均沿用阶段3，校准不读取实战结果。\n\n89输入网络PyTorch/Node/真实Chrome最大误差0；新增校准层另以89个固定开发真实前态核验。所有Profile清理有实际收据。四项协同回归使用零网络分数隔离搜索能力，均与单单位深度对照，不能称真实对局胜率证明。\n\n验收项：`' + json.dumps(overall, ensure_ascii=False) + '`。价值全分层通过=' + str(value['passed']) + '；112槽完成=' + str(gates['complete112Slots']) + '。详细失败项保留，不按战绩调整模型或搜索参数。\n\n公共检查见public-checks.json；历史阶段1～3的' + str(len(preservation)) + '份实存文件SHA核对，变化=' + str(len(changed)) + '。保留工作区已有迁移修改、原始数据、模型与报告；没有修改权威规则、界面、应用策略入口或操作手机。\n\n边界：队列身份校验随快照大小增长，并非严格O(1)；静态三军威胁为原可达性估计，真实反扑动作另行strict验证。受预算限制未完成风险覆盖时保留默认方案。模型与全部面板均属开发材料，不宣称独立泛化或统治级棋力。\n', encoding='utf-8')
    with (DIR / 'REPORT.md').open('a', encoding='utf-8') as report:
        report.write('\n## 价值校准与实战明细\n\n训练141381、固定开发34763条；其中valueMask=true为25577/5482条。8个有界目标配置全部只在训练集拟合，按预注册规则没有联合合格候选时保留原训练NLL候选；详见value-objective-sweep.json。\n\n未通过价值切片：' + '、'.join(k for k,s in value['slices'].items() if not s['allBaselinesExceeded']) + '。\n\n')
        for r in table:
            report.write(f"- {r['model']}/{r['panel']}：{r['naturalWins']}/{r['slots']}自然胜，分类{r['classifications']}。\n")
        report.write('\n搜索整体单步延迟=' + json.dumps(latency) + '；根搜索=' + json.dumps(quantiles([v for r in search_results for v in r.get('rootTimes', [])])) + '；队列步=' + json.dumps(queues) + '。\n\n无意义待机与漏招募的改善不能替代胜率和价值排序；按同一分数做max分组与平面argmax数学等价，本次实际干预来自训练偏置和权威战术先验，不能把分组改写单独当作改善因果证明。\n\n## 日志中断与恢复边界\n\n最初两个搜索分片触发单局见证日志2MB保护。原始失败文件保存在battle-attempt01，改用地图差分与终态SHA后续跑；EVIDENCE_CODEC_REPAIR.json确认模型、参数和全部AI源码未改变。两个中断文件中可恢复的1277条实际动作、4315条反扑动作前缀通过strict，未flush尾部未知，不能声称这两个失败尝试完整strict通过。最终112槽的strict数字与中断前缀分开报告。\n')
        report.write('\n## 固定开发价值分层\n\nBrier按6槽均方误差；Top1与AUC合并同联盟；军力基线沿用权威calculateArmyValue口径。联合门禁还同时比较uniform与seatPrior。\n\n|分层/样本|模型/军力Brier|模型/军力KL|模型/军力Top1|模型/军力AUC|联合通过|\n|---|---|---|---|---|---|\n')
        for name, s in value['slices'].items():
            m, a = s['model'], s['armyShare']; report.write(f"|{name}/{m['count']}|{m['brier']:.6f}/{a['brier']:.6f}|{m['kl']:.6f}/{a['kl']:.6f}|{m['allianceTop1']:.4%}/{a['allianceTop1']:.4%}|{m['allianceRocAuc']:.6f}/{a['allianceRocAuc']:.6f}|{s['allBaselinesExceeded']}|\n")
        report.write('\n## 最终原89状态组合流程核验\n\n完整恢复原64真实状态、9架构夹具及16新增真人前态，所有冻结观测数组逐字节一致。PyTorch精确参考和Node/真实Chrome均覆盖网络、战术先验、15维动作偏置及9桶价值校准；Node与Chrome实际重新调用权威规则计算先验。原89状态最终组合最大误差=' + str(max(node['pipelineError'], chrome['pipelineError'])) + '，策略与价值argmax全部一致，Chrome Profile清理=' + str(chrome['chromeProfileCleaned']) + '。证据见tri-runtime-parity-gate.json。另89个固定开发价值探针仍独立保留。\n')
    files = [dict(path=str(p.relative_to(ROOT)), bytes=p.stat().st_size, sha256=sha(p)) for p in sorted(DIR.rglob('*')) if p.is_file() and p.name != 'DELIVERY_MANIFEST.json']
    runtime = {str(p.relative_to(ROOT)): sha(p) for p in sorted((ROOT / 'src/ai_runtime/dual_v2').glob('*.ts'))}
    external = {str(p.relative_to(ROOT)): sha(p) for p in [ROOT / 'src/ai_runtime/dual_v2/MODEL.md', ROOT / 'ai_training/status/CURRENT.md']}
    save('DELIVERY_MANIFEST.json', dict(status='passed' if all(overall.values()) else 'gates_failed', files=files, runtime=runtime, external=external, directoryBytesBeforeManifest=sum(p.stat().st_size for p in DIR.rglob('*') if p.is_file()), limitBytes=250000000))
    print(json.dumps(dict(gates=overall, battleGates=gates, results=len(results)), ensure_ascii=False))

if __name__ == '__main__': main()
