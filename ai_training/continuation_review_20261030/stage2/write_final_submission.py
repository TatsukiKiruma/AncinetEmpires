"""把三臂实际结果整理成本地审核稿；本工具不批准或启动下一阶段。"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def write_json(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', 'utf-8')


def main():
    result = json.loads((HERE / 'TRIAL_COMPARISON.json').read_text('utf-8'))
    assert result['experimentsComplete'] and len(result['arms']) == 3
    assert all(arm['full80k'] and arm['pairedComparison']['completeNaturalPanel'] for arm in result['arms']), '提前停止或缺自然配对时须单独如实改写报告'
    qualified = [arm for arm in result['arms'] if arm['qualified']]
    assert len(qualified) <= 1, '多候选需要另作明确排序解释，不能自动选择'
    chosen = qualified[0] if qualified else None
    proposal = dict(schema='stage3-budget-proposal-v1', approved=False, stage3Started=False,
                    selectedArm=chosen['arm'] if chosen else None,
                    reason='唯一满足预登记联合门槛的候选，仅推荐送审' if chosen else '三臂均未满足预登记联合门槛，禁止硬选',
                    additionalAtomicExposureBudget=5845296 if chosen else 0,
                    additionalUpdateBudget=730662 if chosen else 0,
                    additionalWallSecondsBudget=302400 if chosen else 0,
                    authorizedSamples=0, authorizedUpdates=0, authorizedWallSeconds=0,
                    dataUnit=dict(newTrainAtomicPositions=3555175, newRatio=.6,
                                  nominalTotalExposureRoundedToBatch8=5925296,
                                  alreadyExposedBySelectedStage2=80000 if chosen else 0,
                                  caveat='分层有放回采样的名义一遍，不保证每个唯一状态都被访问；不自动执行第二或第三遍'),
                    developmentArenaMaxCheckpoints=3 if chosen else 0,
                    finalTestPredictionsSoFar=0)
    if chosen:
        proposal.update(startCheckpoint=json.loads(Path(chosen['audit']).read_text('utf-8'))['checkpoint'],
                        checkpointSha256=chosen['checkpointSha256'],
                        optimizer='完整继承所选终点AdamW、RNG和采样游标；新阶段只建立一次全局日程，分段恢复不重置预算',
                        learningRate=dict(peak=chosen['peakLearningRate'], warmupUpdates=200, endRatio=.1, shape='余弦'),
                        fixedTraining=dict(batch=8, microbatch=1, newRatio=.6, duelRatio=.75,
                                           policyWeight=1, valueWeight=1, gradientClip=1, weightDecay=.0001),
                        offlineEveryUpdates=20000, checkpointEveryUpdates=1000,
                        developmentArenaAtAdditionalUpdates=[243554, 487108, 730662],
                        stopRules=['任何非有限数值、非法标签、身份变化立即停止并保留最后完整状态',
                                   '旧dev NLL超过原基线1.05倍或Brier增加超过0.02，连续两次则停止',
                                   '两次离线诊断新dev NLL改善不足0.5%且Brier改善不足0.005，作为平台停止，不自动扩预算',
                                   '累计样本、更新、墙钟任一上限或可用磁盘低于10GiB则停止',
                                   '开发实战候选必须通过原联合门槛；未通过则保留原冠军'],
                        finalAcceptance='最多3个开发候选各困难20+简单20，按预先固定门槛和排序锁定一次最终候选；随后封存离线测试与独立困难20+简单20仅一次，必要时原基线在同一最终面板40局；测试不得用于继续调参。',
                        deployment='本提案不包含应用部署或替换冠军')
    write_json('STAGE3_PROPOSAL.json', proposal)
    lines = ['# 第二阶段学习率筛选报告', '',
             ('三臂已完成，唯一通过预登记联合门槛的候选为 ' + chosen['arm'] + '，建议协调审核该配置。') if chosen else '三臂已完成，均未通过预登记联合门槛。没有正式续训推荐，第三阶段建议预算为0。', '',
             '本交付请求结果验收，不是自我批准。三臂各80,000条原子有效暴露、10,000次更新，各自从原2414模型/完整AdamW开始；第一臂经获批桥接恢复到相同终点。每臂仅终点参加困难20+简单20，120局新实战；原基线40局复用。最终测试前向、训练和实战均为0。', '',
             '## 三臂结果', '',
             '| 学习率臂 | 样本/更新 | 累计记账秒 | 旧dev NLL/Brier | 新dev NLL/Brier | 困难胜 | 简单胜 | 总得分 | 联合门槛 |',
             '|---|---:|---:|---|---|---:|---:|---:|---|']
    for arm in result['arms']:
        old = arm['terminalOffline']['comparisons']['old/dev']['candidate']
        new = arm['terminalOffline']['comparisons']['new/dev']['candidate']
        lines.append(f"| {arm['arm']} | {arm['samples']}/{arm['updates']} | {arm['wallChargedSeconds']:.4f} | {old['policyNll']:.6f}/{old['brier']:.6f} | {new['policyNll']:.6f}/{new['brier']:.6f} | {arm['score']['hard']:g}/20 | {arm['score']['simple']:g}/20 | {sum(arm['score'].values()):g}/40 | {'通过待审' if arm['qualified'] else '未通过'} |")
    lines += ['', '原基线：旧dev NLL/Brier 1.687261/0.182913，新dev 2.742189/0.545836；困难10胜、简单16胜，共26/40。旧dev使用122父局366状态，新dev112父局266状态；全离线面板为1299态。分层指标均按父局等权，校准分箱与ECE另列。', '',
              '筛选阈值沿用STAGE2_DISPATCH：旧NLL≤基线1.05倍、Brier增量≤0.02；新NLL至少降2%或Brier至少降0.01且另一项不明显退化；完整自然40局、困难≥10、简单≥15、合计≥26。离线改善不能代替实战门槛。', '',
              '## 配对实战与运行边界', '',
              '| 臂/对手 | 自然胜/和/负 | 非自然结果 | 配对平均得分变化 | 10槽聚类bootstrap95% | 改变结果局数 | 模型p95/最大毫秒 |',
              '|---|---|---:|---:|---|---:|---|']
    for arm in result['arms']:
        for opponent in ['hard', 'simple']:
            outcome = arm['outcomes'][opponent]
            paired = arm['pairedComparison']['results'][opponent]
            latency = arm['arenaDetails'][opponent]['latency']['model']
            nonnatural = sum(v for key, v in outcome.items() if not key.startswith('natural_'))
            lines.append(f"| {arm['arm']}/{opponent} | {outcome.get('natural_win', 0)}/{outcome.get('natural_draw', 0)}/{outcome.get('natural_loss', 0)} | {nonnatural} | {paired['scoreChange']} | {paired['clusterBootstrap95']} | {paired['changedGames']} | {latency['p95Ms']:.2f}/{latency['maxMs']:.2f} |")
    lines += ['', '逐地图、实际先后手、截断/错误/时间判负、对手回退及计划拒绝、全部逐局配对变化见TRIAL_COMPARISON.json的arenaDetails和pairedComparison，以及ARENA-*.json、COMPARE-*.json。40局仅用于开发筛选，区间宽且来自10个初态槽，不能据此宣称统计显著或唯一最优。对手为项目OriginalApkLikeHardAI与HeuristicAI，不是APK原生人机对战。', '',
              '| 臂 | 困难先手/后手胜 | 简单先手/后手胜 | 困难对手回退/拒绝计划/运行错误 |',
              '|---|---|---|---|']
    for arm in result['arms']:
        hard, simple = arm['arenaDetails']['hard'], arm['arenaDetails']['simple']
        telemetry = hard['telemetry']
        lines.append(f"| {arm['arm']} | {hard['byActualHand']['first'].get('natural_win', 0)}/10，{hard['byActualHand']['second'].get('natural_win', 0)}/10 | {simple['byActualHand']['first'].get('natural_win', 0)}/10，{simple['byActualHand']['second'].get('natural_win', 0)}/10 | {telemetry['nativeFallbacks']}/{telemetry['rejectedPlans']}/{telemetry['runtimeErrors']} |")
    lines += ['', '本轮失败发生在实战门槛：1e-4合计25分少于26；5e-5困难9胜且合计24；2.4495e-4虽然简单18胜、合计26，困难仅8胜。三臂均通过数值/身份、旧保留及新适应门槛。最低离线损失没有对应困难组更高胜数，因此不能仅据NLL挑选高学习率或扩大正式训练；现有证据适合先做逐局失误与地图/先后手诊断，新增试验须由协调者明确决定。', '',
              '## 分层离线结果与采样', '',
              'TRIAL_COMPARISON.json/.csv保存三臂20k/40k/60k/80k全部已保存预测的比较；按人数、场景、来源、地形可信度、人数×场景×来源、非单候选状态分别列出NLL/top1、价值CE/Brier、校准及父局数。以下列新dev人数分层：', '',
              '| 臂 | 人数 | 父局/状态 | NLL | 相对基线 | Brier | Brier变化 |',
              '|---|---:|---|---:|---:|---:|---:|']
    for arm in result['arms']:
        for players in [2, 3, 4]:
            item = arm['terminalOffline']['comparisons'][f'new/dev/{players}p']
            lines.append(f"| {arm['arm']} | {players} | {item['parents']}/{item['samples']} | {item['candidate']['policyNll']:.6f} | {item['relativeNllChange']:.2%} | {item['candidate']['brier']:.6f} | {item['delta']['brier']:+.6f} |")
    lines += ['', '| 臂 | 新dev场景/来源/地形分层 | 父局/状态 | NLL | 相对基线 | Brier | Brier变化 |',
              '|---|---|---|---:|---:|---:|---:|']
    for arm in result['arms']:
        for key, item in arm['terminalOffline']['comparisons'].items():
            if not key.startswith(('new/dev/category/', 'new/dev/source/', 'new/dev/terrain/')):
                continue
            lines.append(f"| {arm['arm']} | {key.removeprefix('new/dev/')} | {item['parents']}/{item['samples']} | {item['candidate']['policyNll']:.6f} | {item['relativeNllChange']:.2%} | {item['candidate']['brier']:.6f} | {item['delta']['brier']:+.6f} |")
    exposure = result['arms'][0]['exposure']
    lines += ['', f"三臂同seed20261030；完整80k终态采样摘要一致：{result['sameFullBudgetSamplerState']}。每臂新/旧暴露{exposure['corpus/new']}/{exposure['corpus/old']}，双/三/四人{exposure['players/2']}/{exposure['players/3']}/{exposure['players/4']}；损失权重恒为1，没有重复加权。批内隔离组不同，组/场景/来源/父局/阶段分层有放回采样，长局不按动作量加权。", '',
              '新训练2190父局、3,555,175个准入原子位置；dev331、test329、隔离150。80k中约48k新暴露相当于名义新训练量约1.35%，不是唯一状态覆盖率。新数据20/21课程格，双人正常格无准入训练数据；40局只验证双人，不能冒充多人实战或未知地图泛化。', '',
              '## 恢复、日程与完整性', '',
              '原基线checkpoint SHA338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b，globalStep241899，旧样本1935189，参数1966910。三个模型/AdamW起点相同；完整终点状态、导出参数一致性、所有AdamW步数增量、有限性、scheduler和cursor、原生退出码与唯一RUN_CLOSURE均由FINAL_AUDIT-*.json核对。第一臂使用原armId和原账本，终点总耗时已包含历史失败和保守收尾，不能再次加上继承2481.4323秒。', '',
              '| 臂 | 记录指标条数 | 缺失更新 | 实际LR首/峰/末 | 裁剪比例 |',
              '|---|---:|---|---|---:|']
    for arm in result['arms']:
        rate = arm['actualLearningRate']
        lines.append(f"| {arm['arm']} | {arm['recordedMetricRows']} | {arm['missingMetricUpdates']} | {rate['first']:.10g}/{rate['maximum']:.10g}/{rate['last']:.10g} | {arm['clippingFraction']:.2%} |")
    lines += ['', '每条已存LR按原200步预热、余弦至峰值0.1逐条复核，完整曲线见各METRICS.jsonl及汇总每100步曲线。gradientNorm为裁剪前范数。第一臂保留7758屏障完成但指标写入前故障的1条缺口，没有补造；V2记录1–7757，V3正式新增0，V4记录7759–10000。', '',
              '## 历史故障与代码验证', '',
              '原V2在7758更新后ARM_BUDGET.pending原子替换发生WinError5；原317检查点false保持不变。获批V3恢复在首次新优化前心跳期限失败，新增0更新/样本；最新74b异常检查点false保持不变。控制修订、26项/7CLI旧验证与全部失败记录见revisions/、R4_REMEDIATION_REPORT.md、V3_RESUME1_REPORT.md及submission-5原报告。', '',
              'V4经review-5精确批准，控制合同18cadae52968a1aa313938f26393b83ea85d6710d8f8ccc687f7f4d8daa0cce5；主线程单写者、普通安全点节流、关键点强制记账、实际共享错误有界重试、半批/未闭合拒绝等9项合同及5CLI通过。唯一隔离GPU工程验证16.30秒、8样本前向、0优化；副本禁止晋升，8条正式样本未跳过。历史合成控制更新208与正式2M训练分别计数。科学合同4a3072f8…、原V2运行合同27041dff…及阶段一源码不改；V4训练控制身份与V2科学评测身份分别保存。', '',
              '本轮仅增加阶段二包装/只读审计与汇总。Python编译、PowerShell解析、三臂实际闭合审核、12次固定离线身份比较、120局唯一身份/静态原子摘要链/配对比较均有独立产物。公共代码未改，本轮未重跑公共lint/test/build，不记作通过；历史训练工作区未全绿的结果沿用阶段一披露，未用轻量检查替代。', '',
              '## 第三阶段提案与交付', '',
              ('建议从唯一合格终点完整状态继续，额外5,845,296条样本、730,662更新、累计最多302,400秒（84小时），连同阶段二80k约为一遍新训练量的名义暴露；预计约65小时，保留墙钟余量。单一全局日程，最多3个预定开发实战点，平台/遗忘/数值/标签/身份/资源停止规则、封存最终验收均见STAGE3_PROPOSAL.json。该预算仅为建议，实际授权为0，必须由协调者审核后另开第三阶段。') if chosen else '三个主臂均未通过联合门槛，因此STAGE3_PROPOSAL.json的样本、更新、墙钟和开发实战预算均为0。不挑中途模型补局，不扩网格/seed，不启动正式续训；由协调者根据现有逐局/分层证据决定是否需要另行有界诊断。', '',
              'C盘保留源码、报告、清单及FINAL_AUDIT/COMPARE/ARENA/TRIAL_COMPARISON；大型模型与逐局记录位于D:/AncientEmpiresData/continuation_stage2_20261030_v1。所有旧检查点、失败、缓存和历轮提交保留。EVIDENCE_MANIFEST逐文件摘要复核后由REVIEW_REQUEST绑定。按既有通信约定只提交本地材料供协调heartbeat读取，不重试已拒绝的跨聊天发送。未修改STATE/reviews，未部署、提交推送、操作手机或采集新局。', '']
    (HERE / 'REPORT.md').write_text('\n'.join(lines), 'utf-8')
    print(json.dumps(dict(reportWritten=True, recommendedArm=proposal['selectedArm'], stage3Approved=False)))


if __name__ == '__main__':
    main()
