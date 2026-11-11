"""只读汇总证据并封存阶段3交付，不启动训练或对战。"""
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]


def read(name):
    return json.loads((DIR / name).read_text(encoding='utf-8-sig'))


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def save(name, value):
    (DIR / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def percentile(xs, fraction):
    if not xs:
        return None
    xs = sorted(xs)
    import math
    return xs[max(0, math.ceil(len(xs) * fraction) - 1)]


def main():
    plan = read('battle-plan.json'); results = []; strict = []
    for slot in plan['slots']:
        results.append(read(f"battles/{slot['id']}/result.json"))
        strict.append(read(f"battles/{slot['id']}/strict-replay.json"))
    assert len(results) == 56 and all(r['passed'] for r in strict)
    grouped = defaultdict(list)
    for result in results:
        slot = result['slot']; grouped[(slot['panel'], slot['opponent'])].append(result)
    table = []
    for (panel, opponent), games in grouped.items():
        classifications = dict(Counter(g['classification'] for g in games))
        times = [ms for g in games for ms in g['latencySamples']['model']]
        metrics = {key: sum(g['metrics']['model'][key] for g in games) for key in games[0]['metrics']['model']}
        round10 = [g['round10']['recurringIncomeDifference'] for g in games if g['round10'].get('reached')]
        table.append(dict(panel=panel, opponent=opponent, slots=len(games), classifications=classifications,
            naturalWinRate=classifications.get('natural_win', 0) / len(games),
            latency=dict(p50=percentile(times, .5), p95=percentile(times, .95), p99=percentile(times, .99), count=len(times)),
            round10Count=len(round10), round10IncomeDifference=sum(round10) / len(round10) if round10 else None,
            metrics=metrics, missedRecruitPerEndTurn=metrics['endWithRecruit'] / max(1, metrics['endTurns']),
            missedRecruitPerOpportunity=metrics['endWithRecruit'] / max(1, metrics['recruitOpportunitySteps']), strictActions=sum(g['actions'] for g in games)))
    historical_file = ROOT / 'ai_training/tactical_exit_20261019/teacher-r6-battle-summary.json'
    historical = json.loads(historical_file.read_text('utf-8'))
    historical['table'] = [{**r, 'arm': r['model']} for r in historical['groups']]
    historical_root = ROOT / 'ai_training/tactical_exit_20261019' / historical['evidenceFolder'] / 'slots'
    historical['results'] = [json.loads((p / 'result.json').read_text('utf-8')) for p in historical_root.iterdir() if (p / 'result.json').exists()]
    old_plan = json.loads((ROOT / 'ai_training/tactical_value_search_20261018/battle-plan.json').read_text('utf-8'))
    comparisons = []
    for arm, label in [('hierarchical', 'stage3_hierarchical'), ('pure', 'stage4_pure')]:
        for row in table:
            if row['panel'] not in ['fixed', 'expanded']:
                continue
            old_row = next(r for r in historical['table'] if r['panel'] == row['panel'] and r['opponent'] == row['opponent'] and r['arm'] == arm)
            paired = []
            for result in grouped[(row['panel'], row['opponent'])]:
                slot = result['slot']; old_id = slot['historicalId'].replace('pure', arm)
                previous = next(r for r in historical['results'] if r['slot']['id'] == old_id)
                started = json.loads((historical_root / old_id / 'started.json').read_text('utf-8'))
                assert previous['slot']['opponentSeed'] == slot['opponentSeed'] and previous['slot']['seat'] == slot['seat']
                assert old_plan['maps'][slot['mapIndex']]['sha256'] == plan['maps'][slot['mapIndex']]['sha256']
                assert started['initialHash'] == plan['maps'][slot['mapIndex']]['sha256']
                paired.append(dict(id=slot['id'], old=previous['classification'], new=result['classification']))
            comparisons.append(dict(baseline=label, panel=row['panel'], opponent=row['opponent'], baselineClassifications=old_row['classifications'], baselineNaturalWinRate=old_row['naturalWinRate'], currentNaturalWinRate=row['naturalWinRate'], difference=row['naturalWinRate'] - old_row['naturalWinRate'], paired=paired))
    save('battle-summary.json', dict(table=table, comparisons=comparisons, slots=results, strictSlots=56, strictActions=sum(r['actions'] for r in strict), historicalSourceSha256=sha(historical_file), independentEvaluation=False))
    head = read('head-calibration.json'); value = read('value-calibration.json'); samples = read('sample-coverage.json')
    history = read('training-history.json'); admission = read('new_replays/admission.json'); audit = read('new-replay-stream-audit.json')
    controller_audit = read('replay-controller-audit.json')
    residual = read('value-residual-calibration.json')
    node = read('dual-v2-stage3-pure-node-parity.json'); browser = read('dual-v2-stage3-pure-browser-parity.json'); public = read('public-checks.json')
    initial = read('preservation-before.json')['files']; baseline = read('preservation-delivery-baseline.json')['files']
    mismatches = [f['path'] for f in initial if sha(ROOT / f['path']) != f['sha256']]
    delivery_mismatches = [p for p, meta in baseline.items() if p != 'ai_training/status/CURRENT.md' and sha(ROOT / p) != meta['sha256']]
    save('preservation-after.json', dict(passed=not mismatches and not delivery_mismatches, initialFiles=len(initial), initialMismatches=mismatches, deliveryReferenceFiles=len(baseline), deliveryMismatches=delivery_mismatches, authorizedStatusUpdate='ai_training/status/CURRENT.md', originalManifestPreexistingDifferences=read('original-delivery-verification-before.json')))
    multi = [r for r in results if r['slot']['panel'] in ['3ffa', '4ffa', '2v2']]
    outcomes = dict(Counter(r['classification'] for r in results))
    panel_outcomes = {panel: dict(Counter(r['classification'] for r in results if r['slot']['panel'] == panel)) for panel in ['fixed', 'expanded', '3ffa', '4ffa', '2v2']}
    save('tri-runtime-parity-gate.json', dict(passed=node['passed'] and browser['passed'], states=len(browser['receipts']), maxLogit=max(node['maxLogit'], browser['maxLogit']), maxActor=max(node['maxActor'], browser['maxActor']), maxValue=max(node['maxValue'], browser['maxValue']), maxNodeChrome=browser['maxNode'], actionMatches=sum(r['actionMatch'] for r in browser['receipts']), actorMatches=sum(r['actorMatch'] for r in browser['receipts']), chromeProfileCleaned=browser['chromeProfileCleaned'], weightsSha256=sha(DIR / 'dual-v2-stage3-pure.bin'), samplesSha256=sha(DIR / 'samples.bin'), torchReferenceSha256=sha(DIR / 'dual-v2-stage3-pure-torch-reference.json')))
    manifest_gate = read('manifest-validation.json')
    fixed_dev_hashes = {e['dev']['inputReceipt']['aggregateSha256'] for e in history['epochs']}
    checks = dict(newReplayAdmission=admission['passed'] and audit['passed'], inheritedSplit=manifest_gate['passed'],
        sampleMinimum=samples['train'] >= 120000 and samples['dev'] >= 25000,
        naturalParentCoverage=samples['originalValueParents'] == 643 and samples['usableValueParents'] == 643,
        threeFullEpochs=len(history['epochs']) == 3 and all(e['train']['samples'] == samples['train'] and e['dev']['samples'] == samples['dev'] for e in history['epochs']),
        fixedDevelopmentInputs=len(fixed_dev_hashes) == 1,
        headCalibration=head['passed'], valueBaselines=value['passed'],
        triRuntimeParity=node['passed'] and browser['passed'] and max(node['maxLogit'], node['maxActor'], node['maxValue']) < 1e-6,
        strictBattles=len(strict) == 56 and all(r['passed'] for r in strict),
        battleInitialIncomeCloneMask=read('battle-initial-gate.json')['passed'],
        adapterRawArgmaxExact=read('pure-adapter-actual-argmax-gate.json')['passed'],
        frozenBattleWeights=all(r['modelSha256'] == sha(DIR / 'dual-v2-stage3-pure.bin') for r in results),
        multiplayerNoErrorsOrTimeouts=all(r['classification'] not in ['error', 'decision_timeout', 'wall_truncation'] for r in multi),
        publicChecks=public['passed'], preservation=not mismatches and not delivery_mismatches)
    total_bytes = sum(p.stat().st_size for p in DIR.rglob('*') if p.is_file())
    checks['diskBudget'] = total_bytes < 249500000
    failed = [k for k, ok in checks.items() if not ok]
    save('gate-summary.json', dict(status='completed_with_failed_quality_gates' if failed else 'complete', passed=not failed, checks=checks, failed=failed, battleOutcomes=outcomes, panelOutcomes=panel_outcomes, purePolicyStrengthClaim='实战明显弱于历史基线，未达到强纯策略底座目标', bytesBeforeFinalManifests=total_bytes, diskLimitBytes=250000000, phase4Started=False, phase5Started=False, phoneOperations=0))
    save('pipeline-status.json', dict(status='complete' if not failed else 'completed_with_failed_quality_gates', checks=checks, failed=failed, browserCompleted=True, battlesCompleted=56))
    save('post-training-status.json', dict(status='complete', browserPassed=browser['passed'], chromeProfileCleaned=browser['chromeProfileCleaned'], strictSlots=56, strictActions=sum(r['actions'] for r in strict), weightsSha256=sha(DIR / 'dual-v2-stage3-pure.bin')))
    save('TASK_STATE.json', dict(status='complete' if not failed else 'completed_with_failed_quality_gates', failed=failed, battleOutcomes=outcomes, purePolicyStrengthClaim=False, trainSamples=samples['train'], devSamples=samples['dev'], naturalValueParents=samples['usableValueParents'], epochs=len(history['epochs']), strictSlots=56, strictActions=sum(r['actions'] for r in strict), weightsSha256=sha(DIR / 'dual-v2-stage3-pure.bin'), phase4Started=False, phase5Started=False, phoneOperations=0))
    battle_lines = ['# 阶段3纯策略实战', '', '56槽均使用最终冻结权重；所有自然胜率以该组全部槽位为分母，截断不计自然胜负。固定20槽、扩展20槽、多方16槽；每局2000原子、每步30秒、整局600秒。', '', '|面板|对手|槽数|自然胜/负/和|动作/墙钟截断|p50/p95/p99 ms|第10轮收入差/到达局数|漏招募/end|实际集火受击/死亡|strict动作|', '|---|---|---:|---|---|---|---|---|---|---:|']
    for r in table:
        c, m, l = r['classifications'], r['metrics'], r['latency']
        q = '/'.join(f'{l[k]:.3f}' if l[k] is not None else '无' for k in ['p50', 'p95', 'p99'])
        income = f"{r['round10IncomeDifference']:.2f}" if r['round10IncomeDifference'] is not None else '未到达'
        battle_lines.append(f"|{r['panel']}|{r['opponent']}|{r['slots']}|{c.get('natural_win',0)}/{c.get('natural_loss',0)}/{c.get('natural_draw',0)}|{c.get('action_truncation',0)}/{c.get('wall_truncation',0)}|{q}|{income}/{r['round10Count']}|{m['endWithRecruit']}/{m['endTurns']}|{m['focusVictims']}/{m['focusDeaths']}|{r['strictActions']}|")
    battle_lines += ['', '完整逐局分类、延迟原始样本、两方过程指标、分母及错误见battle-summary.json和battles/*/result.json。strict重放重新生成权威合法集合、核对每动作前后SHA并复算全部过程计数。', '', '集火受击指同一单位在其所有者下一次回合前遭至少两个不同攻击者实际攻击；focusDamage包含该受击窗口累计伤害。它与旧报告的反事实集火致死落点指标不同，不能混比。多方收入差为本方所有模型席位与其余席位之差；2v2为两联盟之差。', '', '|面板/对手|历史基线|历史自然胜率|本模型自然胜率|差值|', '|---|---|---:|---:|---:|']
    for r in comparisons:
        battle_lines.append(f"|{r['panel']}/{r['opponent']}|{r['baseline']}|{r['baselineNaturalWinRate']:.1%}|{r['currentNaturalWinRate']:.1%}|{r['difference']:+.1%}|")
    battle_lines += ['', '比较逐槽核对初态SHA、随机seed和席位；使用阶段5保留的teacher-r6-battle-summary.json及逐局原始记录中的stage3_hierarchical和stage4_pure基线，stage4_pure模型身份与阶段4model-final.json一致。该快照的pure固定对ApkLike为6/10、对Heuristic为8/10、扩展为12/20；阶段4更早原始统计分别为6/10、7/10、11/20，历史记录均保留，不混合挑选。运行时及既有公共规则历史版本、计时负载不同，不把速度差或胜率差解释为独立因果证据。所有标准图、开发前缀和已消费对局都不是独立最终测试。']
    (DIR / 'BATTLES.md').write_text('\n'.join(battle_lines) + '\n', encoding='utf-8')
    best_epoch = min(history['epochs'], key=lambda e: e['dev']['composite']); dev = best_epoch['dev']
    h0, h1 = head['before'], head['after']
    value_lines = ['|分层/样本|模型Brier/KL|均匀Brier/KL|顺位Brier/KL|军力Brier/KL|模型/军力AUC|模型/军力Top1|全面超越|', '|---|---|---|---|---|---|---|---|']
    for key in ['all'] + [f'{players}p/{phase}' for players in [2, 3, 4] for phase in ['opening', 'middle', 'late']]:
        row = value['slices'][key]; m, a = row['model'], row['armyShare']
        scores = [f"{row[name]['brier']:.5f}/{row[name]['kl']:.5f}" for name in ['model', 'uniform', 'seatPrior', 'armyShare']]
        value_lines.append(f"|{key}/{m['count']}|" + '|'.join(scores) + f"|{m['allianceRocAuc']:.5f}/{a['allianceRocAuc']:.5f}|{m['allianceTop1']:.2%}/{a['allianceTop1']:.2%}|{row['allBaselinesExceeded']}|")
    value_table = '\n'.join(value_lines)
    report = f'''# 双流 v2 阶段3报告

日期：{datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')}（北京时间）。阶段3执行流程已完成；质量门禁{'全部通过' if not failed else '未全部通过：' + '、'.join(failed)}。不把离线改善或合法运行当作棋力通过，不启动阶段4/5。

实战共{outcomes.get('natural_win',0)}自然胜、{outcomes.get('natural_loss',0)}自然负、{outcomes.get('natural_draw',0)}自然和、{outcomes.get('action_truncation',0)}动作截断。固定1v1 {panel_outcomes['fixed'].get('natural_win',0)}/20自然胜，扩展{panel_outcomes['expanded'].get('natural_win',0)}/20，多方与2v2 {sum(panel_outcomes[p].get('natural_win',0) for p in ['3ffa','4ffa','2v2'])}/16。明显弱于历史基线，尚未建立强纯策略底座；不能用开发Top1提升替代实战结论。

## 数据与合同

新增41份响应重新strict转换为{admission['atomicActions']}个原子；历史257响应SHA重复0，4份OL/SR隔离准入0。加强streamReplay头尾/最终摘要、逐动作权威合法性和状态核验41/41通过，valueMask均false、投降行屏蔽、宏权重1/atomicCount。

原始可用policy行按控制者核查：旧255响应人类{controller_audit[0]['policy']['1']}、AI {controller_audit[0]['policy']['2']}；新增41响应人类{controller_audit[1]['policy']['1']}、AI {controller_audit[1]['policy']['2']}。不能把全部响应动作等同真人示范。固定开发池中真人2人模式仅{sum(v for k,v in dev['inputReceipt']['distribution'].items() if k.startswith('replay-human/2p/'))}条，真人1v1专项泛化证据不足。

原3000原生父局及255旧真人响应的train/dev逐条继承，追加新真人训练32/开发9，总3296个登记。用户背景中“40局1v1＋1局3人”与实际启用席位不符：新增SD为2人3、4人19、5人4、6人14；SO为4人1。人类玩家数与全部参战人数不可混用。未证明人类教师最优、隐藏MOD不存在或完整APK赢家一致；真人value始终关闭。

固定高信息采样池训练{samples['train']}、开发{samples['dev']}条。可信自然终局原始父局{samples['originalValueParents']}，实际有当前可信value样本的父局{samples['usableValueParents']}。来源前态、当前完整SHA及canonical规则态对511076个历史评测前态永久排重，开发固定id增强，训练每轮确定性随机D2。原生胜方策略1.5、败方0.75，回放中经playerTypes核实的人类动作2.0、AI席位动作1.0；价值不乘胜败质量系数。控制者未知时拒绝训练，不能把多人回放中的AI行动冒称真人动作。

为控制超长父局冗余，每父局选首/中/末最多三个可恢复分段。所有选中压缩包完整预检；沿途step均由权威引擎验证并逐帧计数状态漂移，漂移段关闭value。候选入池帧再核验完整合法集合、排重并按阶段/动作族蓄水采样。不是全918万原子的当前规则重验。首次较慢的完整候选采样停止，失败/部分证据在corpus-attempt01保留，未用于训练。原始局面按地图引用＋地块差分压缩，恢复时逐前态SHA验证；不落盘训练特征。采样分布、隔离和value缺口详见sample-coverage.json、corpus-receipt-*.json。

## 训练与校准

保持501642参数及dual-stream-v2-phase2-v1格式，新初始化seed=202610203。同尺寸批次有实体/候选padding mask，73状态批次与单样本前向最大误差2.682209e-6、梯度4.112721e-6。该float32训练检查不替代最终accurate_reductions三端门禁。

CPU实测选择4线程；16线程在小模型上明显慢。3个完整epoch、{history['totalUpdates']}次AdamW更新，学习率0.0005余弦下降，梯度裁剪1.0。按开发Policy NLL＋0.25×Who NLL＋Value KL＋Brier选第{best_epoch['epoch']}轮，开发Top1={dev['top1']:.4%}、Policy NLL={dev['policy']:.6f}、Who NLL={dev['who']:.6f}、Value CE={dev['value']:.6f}、Brier={dev['brier']:.6f}。逐轮样本数与指标见training-history.json。

冻结骨干，15维headBias只按训练NLL和固定语义辅助系数拟合、开发门禁筛选；无合格候选时保留基座并明确失败。漏招募{h0['missedRecruit']}→{h1['missedRecruit']}，未移动有战术机会wait {h0['wastedWait']}→{h1['wastedWait']}，攻击机会选择攻击{h0['attackRate']:.4%}→{h1['attackRate']:.4%}，Top1 {h0['top1']:.4%}→{h1['top1']:.4%}；动作校准门禁={head['passed']}。没有读取实战胜负选参。

校准的加权Policy NLL由{h0['policyNll']:.6f}升至{h1['policyNll']:.6f}，这是语义门禁约束下的实际取舍，没有隐藏轻微退化。

wait机会指同一未移动单位当前存在合法attack/capture；显著下降门槛为计数至少下降10%。headBias使用7次各120步的15参数Adam拟合，另评估预注册150偏置组合；骨干没有参与这些更新。

价值温度={value['selectedTemperature']}，等效折叠value2与army_scale，骨干未变。按2/3/4人×开/中/后期报告6槽Brier、CE/KL及联盟ROC-AUC/Top1，逐项比较均匀、训练顺位先验与权威军力占比；全面超越门禁={value['passed']}。详见value-calibration.json，空分层或未超越明确记失败，不用全局平均掩盖。最终权重dual-v2-stage3-pure.json/bin。

初次温度校准后，因部分4人和后期胜方排名仍弱于Army Share，在零实战状态下追加现有军力残差及温度的120组有界校准；联合排名合格候选{residual['rankQualified']}，结果={residual['passed']}。无全门禁合格候选时保留原模型，初次模型与证据在calibration-attempt01逐字节留存；没有改骨干或策略。3A价值损失按宏权重归一，3B分层指标按固定原子样本等权，温度候选之间使用同一统计口径。

{value_table}

各人数汇总与各阶段汇总、三基线的全部排序指标见value-calibration.json。所有分层Brier/KL均更好，但4人开局/中盘及部分后期Top1仍不足，全面超越门禁保持失败。

## 数值与实战

PyTorch/Node/真实Chrome共89状态（原73＋新增真人1v1的16），Node最大logits/actor/value误差={node['maxLogit']}/{node['maxActor']}/{node['maxValue']}；Chrome通过={browser['passed']}、专属Profile清理={browser['chromeProfileCleaned']}。动作和行动者一致性逐帧见两端收据，门槛1e-6。训练用float32批次与最终精确归约参考分开。

DualStreamPureAI调用权威合法集合、encodeDualObservation、同步forward和decodeFactoredAction，稳定argmax、唯一候选快返并过滤投降。新增两项测试证明不调用step或clone；未接入UI和应用策略。56槽实战和{sum(r['actions'] for r in strict)}条动作全部strict重放通过；自然胜/负、截断、耗时、收入与漏招募等全部见BATTLES.md，不省略不利结果。多方16槽零错误/超时门禁={checks['multiplayerNoErrorsOrTimeouts']}。历史对照使用冻结记录，未进行反向挑参。

另在{read('pure-adapter-actual-argmax-gate.json')['checked']}个真实实战前态只读复算：原始最高logit对应的源动作、指针解码、适配器返回和记录中的提交动作完全一致；没有通过改动作选择流程修饰战绩。动作截断不是自然负或和局，2v2联盟自然胜为0/4、四局均动作截断。

## 验证、保全与磁盘

公共检查通过={public['passed']}，完整命令和失败/复跑日志见public-checks.json。首次并行检查有1项既有测试触发5秒墙钟时限，保留原始失败日志；最终检查另记录。阶段1/2文件及已有公共双流文件按本次实存基线核对，意外变化={len(mismatches) + len(delivery_mismatches)}；CURRENT.md仅按授权顶部追加。阶段1原清单中docs/README.md与CURRENT.md在本次开始前已因后续阶段记录而不同，见original-delivery-verification-before.json，未回滚或伪称旧清单全部原SHA一致。阶段2原114份交付在开始时全部匹配。

汇总前目录{total_bytes}字节，最终大小见DELIVERY_MANIFEST.json，硬上限250000000字节。保留首次采样、公共测试失败及全部来源、模型、实战和历史报告；没有删除历史文件、操作手机/ADB、执行阶段4树搜索、阶段5自博弈或应用部署。现有开发来源与标准面板已被消费，本阶段不宣称独立泛化。若质量门禁失败，最终权重只作为已训练候选，不称已通过的强纯策略基座。
'''
    (DIR / 'REPORT.md').write_text(report, encoding='utf-8')
    status_path = ROOT / 'ai_training/status/CURRENT.md'; existing = status_path.read_bytes().decode('utf-8')
    existing = re.sub(r'<!-- dual-stream-v2-phase3-20261020 -->.*?<!-- end-dual-stream-v2-phase3-20261020 -->\r?\n\r?\n', '', existing, flags=re.S)
    block = f'''<!-- dual-stream-v2-phase3-20261020 -->
## 2026-10-20 双流v2阶段3执行完成（{'全部门禁通过' if not failed else '质量门禁未全过'}）

见[REPORT.md](../dual_stream_v2_phase3_20261020/REPORT.md)、[BATTLES.md](../dual_stream_v2_phase3_20261020/BATTLES.md)及[gate-summary.json](../dual_stream_v2_phase3_20261020/gate-summary.json)。新增41响应/71990原子strict准入，历史SHA零重复；按真实人数而非真人数量分桶，新32训练/9开发，旧分区不变。训练{samples['train']}/固定开发{samples['dev']}样本，3轮AdamW/{history['totalUpdates']}更新，最佳第{best_epoch['epoch']}轮。最终模型完成89状态三端核验、56槽/{sum(r['actions'] for r in strict)}动作strict评测；全部有利、不利指标及质量门禁见报告。未通过项：{'无' if not failed else '、'.join(failed)}。

实战{outcomes.get('natural_win',0)}自然胜/{outcomes.get('natural_loss',0)}自然负/{outcomes.get('action_truncation',0)}动作截断：固定0/20、扩展1/20、多方0/16自然胜，明显弱于历史基线，未达到强纯策略底座目标。动作校准通过，价值Brier/KL各分层改善，但部分胜方排名未全面超越军力基线；没有按实战反选参数。

阶段1/2实存交付与历史资产保留，新纯策略适配器未接入应用。开发来源/面板不是独立最终测试，不按实战反选参数；没有启动阶段4/5、手机/ADB或部署。旧阶段5继续暂停。
<!-- end-dual-stream-v2-phase3-20261020 -->

'''
    # 仅在现有标题后新增本阶段块，其余历史字节保持。
    if existing.startswith('# 当前接手状态'):
        first, rest = existing.split('\n', 1)
        status_path.write_bytes((first + '\n\n' + block + rest.lstrip('\r\n')).encode('utf-8'))
    else:
        status_path.write_bytes((block + existing).encode('utf-8'))
    files = {p.relative_to(ROOT).as_posix(): dict(bytes=p.stat().st_size, sha256=sha(p)) for p in DIR.rglob('*') if p.is_file() and p.name != 'DELIVERY_MANIFEST.json' and '__pycache__' not in p.parts}
    for p in [ROOT / 'src/ai_runtime/dual_v2/pure_ai.ts', ROOT / 'src/ai_runtime/dual_v2/pure_ai.test.ts', status_path]:
        files[p.relative_to(ROOT).as_posix()] = dict(bytes=p.stat().st_size, sha256=sha(p))
    delivery = dict(schema='dual-stream-v2-phase3-delivery-v1', status='complete' if not failed else 'completed_with_failed_quality_gates', selfExcluded=True, directoryBytes=0, files=files)
    without_manifest = sum(p.stat().st_size for p in DIR.rglob('*') if p.is_file() and p.name != 'DELIVERY_MANIFEST.json')
    for _ in range(4):
        delivery['directoryBytes'] = without_manifest + len((json.dumps(delivery, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    # 清单自身固定为LF，确保跨平台字节预算与实际写入完全相等。
    (DIR / 'DELIVERY_MANIFEST.json').write_bytes((json.dumps(delivery, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    actual = sum(p.stat().st_size for p in DIR.rglob('*') if p.is_file())
    assert actual <= 250000000, actual
    print(json.dumps(dict(status='complete', failed=failed, bytes=actual, slots=56), ensure_ascii=False))


if __name__ == '__main__':
    main()
