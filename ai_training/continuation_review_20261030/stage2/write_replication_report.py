"""按预登记两seed规则生成结果报告及未授权的阶段三提案。"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


if __name__ == '__main__':
    result = read(HERE / 'REPLICATION_RESULT.json')
    audit = read(HERE / 'REPLICATION_FINAL_AUDIT.json')
    preflight = read(HERE / 'REPLICATION_PREFLIGHT.json')
    passed = result['admittedForStage3Proposal']
    scores = result['replication']['score']
    means = result['meanPer40']['scores']
    proposal = dict(schema='stage3-two-seed-budget-proposal-v1', approved=False, stage3Started=False,
                    selectedLearningRate=.0001 if passed else None,
                    recommendedCheckpointSelection='从原2414/AdamW开始正式阶段，预先固定seed20261030；不挑两个试验终点中较高分者' if passed else None,
                    sampleBudget=5925296 if passed else 0, updateBudget=740662 if passed else 0,
                    cumulativeWallSecondsBudget=302400 if passed else 0, developmentArenaMaxCheckpoints=3 if passed else 0,
                    authorizedSamples=0, authorizedUpdates=0, authorizedWallSeconds=0,
                    reason=result['decision'], finalTestPredictionsSoFar=0,
                    interpretation='双seed只判断1e-4配置的有限预算工程一致性，不证明显著优于原冠军，不宣称独立初始化复验。')
    if passed:
        proposal.update(startingCheckpoint='ai_training/phone_2m_continue414_20261027/completion/job/output/checkpoint-1.pt',
                        checkpointSha256='338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b',
                        trainingSamplerSeed=20261030, newRatio=.6, duelRatio=.75, batch=8, microbatch=1,
                        policyWeight=1, valueWeight=1, gradientClip=1, weightDecay=.0001,
                        learningRate=dict(peak=.0001, warmupUpdates=200, endRatio=.1, shape='单一全局余弦，分段恢复不重新预热'),
                        nominalNewTrainAtomicPositions=3555175,
                        nominalPass='5925296总暴露×0.6约3555178新暴露，一遍名义量；分层有放回，不保证唯一状态全覆盖；不自动追加第二/三遍',
                        offlineEveryUpdates=20000, checkpointEveryUpdates=1000,
                        developmentArenaAtUpdates=[246887, 493774, 740662],
                        stops=['任何非有限、非法标签、来源或身份变化立即停止',
                               '旧dev NLL超过原基线1.05倍或Brier增量超过0.02，连续两次停止',
                               '连续两次相邻离线诊断中，新dev NLL改善均不足0.5%且Brier改善均不足0.005，平台停止',
                               '累计样本/更新/墙钟上限，或磁盘可用低于10GiB，停止并保留完整状态'],
                        finalAcceptance='最多3个固定开发候选各困难20+简单20，按原门槛和困难优先规则固定最终候选；随后封存离线测试与独立困难20+简单20仅一次，必要时原基线同最终面板40局，禁止测试后调参。',
                        deployment='未授权替换应用模型或原冠军')
    (HERE / 'STAGE3_PROPOSAL.json').write_text(json.dumps(proposal, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    lines = ['# 限定抽样seed复验报告', '', result['decision'] + '。', '',
             '原三个主臂的未通过结论保持。仅1e-4从原2414模型和完整AdamW独立开始，抽样seed由20261030改为20261031；不是独立模型初始化复验。未增加第三seed、其它学习率、中途实战或最终测试。', '',
             '## 预登记门槛与实际结果', '',
             '| 抽样seed | 困难得分/20 | 简单得分/20 | 总得分/40 | 原终点门槛 |',
             '|---|---:|---:|---:|---|',
             '| 20261030 | 10 | 15 | 25 | 未通过，保持原结论 |',
             f"| 20261031 | {scores['hard']:g} | {scores['simple']:g} | {sum(scores.values()):g} | {'通过' if result['replication']['endpointGate'] else '未通过'} |",
             f"| 两seed平均 | {means['hard']:g} | {means['simple']:g} | {sum(means.values()):g} | {'达到平均门槛' if result['meanPer40']['consistencyGate'] else '未达平均门槛'} |", '',
             '第六轮dispatch在复验前要求：两次离线均满足旧保留和新适应；新终点本身困难≥10、简单≥15、合计≥26且完整自然40局；两seed平均每40局困难≥10、简单≥15、总≥26。因原seed总分25，新seed总分至少27才可能通过。不能把新seed单次26分当双seed通过，不能修改原seed未通过结论。', '',
             f"实际两次离线联合通过={result['bothSeedsOffline']}，新终点门槛={result['replication']['endpointGate']}，双seed平均门槛={result['meanPer40']['consistencyGate']}，最终配置提案准入={passed}。", '',
             '## 开发离线和实战证据', '',
             '| 终点分层 | 父局/状态 | 原基线NLL→复验 | 相对变化 | Brier基线→复验 | Brier变化 |',
             '|---|---|---|---:|---|---:|']
    for key, item in result['terminalOffline']['comparisons'].items():
        if key not in ['old/dev', 'new/dev', 'new/dev/2p', 'new/dev/3p', 'new/dev/4p'] and not key.startswith(('new/dev/category/', 'new/dev/source/', 'new/dev/terrain/')):
            continue
        lines.append(f"| {key} | {item['parents']}/{item['samples']} | {item['baseline']['policyNll']:.6f}→{item['candidate']['policyNll']:.6f} | {item['relativeNllChange']:.2%} | {item['baseline']['brier']:.6f}→{item['candidate']['brier']:.6f} | {item['delta']['brier']:+.6f} |")
    lines += ['', '四个固定20k/40k/60k/80k离线快照的1299状态身份、分人数/类别/来源/地形、非单候选、NLL/top1/CE/Brier和校准见REPLICATION_RESULT.json、REPLICATION_OFFLINE_COMPARISON.csv。所有汇总读取已保存预测，新增前向0。', '',
              '| 对手 | 新seed结果分类 | 两seed配对平均得分变化 | 10槽聚类bootstrap95% | 模型p95/最大ms | 对手回退/拒绝/错误 |',
              '|---|---|---:|---|---|---|']
    for opponent in ['hard', 'simple']:
        detail = result['arenaDetails'][opponent]
        combined = result['combinedPaired'][opponent]
        latency, telemetry = detail['latency']['model'], detail['telemetry']
        lines.append(f"| {opponent} | {result['replication']['outcomes'][opponent]} | {combined['scoreChange']} | {combined['clusterBootstrap95']} | {latency['p95Ms']:.2f}/{latency['maxMs']:.2f} | {telemetry['nativeFallbacks']}/{telemetry['rejectedPlans']}/{telemetry['runtimeErrors']} |")
    lines += ['', '逐地图、实际先后手、每局基线/两个seed的变化和新seed自然/截断/错误/时间判负及延迟，见REPLICATION_RESULT.json的arenaDetails、combinedPaired和replicationPaired。80条候选记录仍共享10个开局槽，每个对手20个局ID；区间按槽聚类，不能当80个独立初态。未证明更像人类或统计显著棋力提升。', '',
              '## 原三臂静态变化诊断', '',
              'STATIC_CHANGE_DIAGNOSIS.md/.json/.csv列出全部19个臂×局胜负变化，覆盖11个不同局ID，包括地图/类别/先后手、共同原子前缀、首次不同动作及双方回退/拒绝/错误/延迟。只读保存记录，规则重放、模型前向和新增局数均0。分支差异和回退共现不是失败因果；不能因此调整先验、搜索、loss或规则。', '',
              '## 扩展、恢复和预算', '',
              '第六轮原交付保存在revisions/submission-6，1273个C盘文件逐项摘要一致；原2128项大型证据原位保留。原科学合同4a3072f8…、运行合同27041dff…、V4控制合同18cadae5…不改。独立扩展REPLICATION_CONTRACT.json摘要为' + audit['executionIdentity']['replicationContractSha256'] + '，绑定第六轮授权、dispatch、父合同和10份源/配置文件；SOURCE_DIFF.patch显示训练数值和日程未变。', '',
              '训练实际CONFIG.seed=20261031，checkpoint保存该配置及扩展身份。Encoder和原离线/实战使用未修改父配置以保持原冻结评测身份；EVALUATION_PROVENANCE.json把模型与扩展、训练seed及父评测配置绑定。原seed门禁仍实际拒绝新配置，旧review-5不能批准新臂。没有删除原恢复断言；半批、工程、不同身份、不同配置、非有限及未闭合状态仍拒绝。', '',
              '预检：800请求同seed一致、异seed序列改变、400位置保存后逐批精确恢复、仅train且批内隔离组不同；5项原V4同步I/O测试通过，3个CLI正负例通过，预检真实2M前向/优化均0。I/O及frozen.py字节与原V4相同，inspect_resume函数逐字保留；过期旧异常桥接测试未重跑，旧证据保留。', '',
              'REPLICATION_INITIAL_RESTORE_AUDIT.json实际读取不可变零步检查点：模型与基线一致、194项AdamW矩一致、Python/NumPy/Torch恢复RNG与基线相同，全部RNG与原V4零步状态一致，只有sampler RNG不同。未消耗正式样本，也未读取活动预算账本。', '',
              f"本新臂完成{audit['samples']}样本/{audit['updates']}更新，原生退出码{audit['actualExitCode']}，累计记账{audit['closedLedger']['consumedWallSeconds']:.4f}秒，独立armId={audit['closure']['armId']}。10000条实际LR和有限性、194项AdamW步数增量、导出一致性、唯一RUN_CLOSURE及原预算闭合核查通过；裁剪比例{audit['clippingFraction']:.2%}，范数为裁剪前记录。没有重开预算或复用原seed终点。", '',
              '## 第三阶段与交付', '',
              ('双seed预登记规则通过，仅建议协调者评审1e-4配置。为避免选择幸运seed，阶段三提案预先从原2414/AdamW开始、固定抽样seed20261030，单一200步预热后余弦，最多5,925,296总暴露/740,662更新/302,400秒（84小时），约一遍准入新数据的名义有效暴露；最多3个固定开发实战点及一次封存最终验收，详见STAGE3_PROPOSAL.json。实际授权预算仍0。') if passed else '复验未通过完整双seed门槛，STAGE3_PROPOSAL.json的样本、更新、墙钟和开发实战预算均为0。不追加seed、其它LR或中途补赛，不自行启动第三阶段。', '',
              '新训练仍为2190父局、20/21课程格，双人正常格缺失；多人仅离线，开发面板与旧8图有关，没有未知地图泛化证据。最终测试一直封存；未部署/替换冠军、提交推送、采新局、操作手机、修改STATE/reviews。仅更新本地审核请求供既有heartbeat读取，不重试跨聊天发送。', '']
    (HERE / 'REPLICATION_REPORT.md').write_text('\n'.join(lines), 'utf-8')
    summary = ['# 第二阶段第七轮交付', '', result['decision'] + '。', '',
               f"新seed20261031：困难{scores['hard']:g}/20、简单{scores['simple']:g}/20、合计{sum(scores.values()):g}/40；两seed平均困难{means['hard']:g}、简单{means['simple']:g}、总{sum(means.values()):g}/40。", '',
               '原三臂结论保持：1e-4为10/15/25，5e-5为9/15/24，2.4495e-4为8/18/26，均未通过原联合门槛。', '',
               '完整复验结果及分层、两seed配对、扩展与恢复预算证据见[复验报告](REPLICATION_REPORT.md)、[机器汇总](REPLICATION_RESULT.json)；全部原三臂变化见[静态诊断](STATIC_CHANGE_DIAGNOSIS.md)。第六轮原报告及源码交付快照保存在[submission-6](revisions/submission-6/REPORT.md)。', '',
               '仅提交协调审核，第三阶段未启动，最终测试未使用，原冠军未替换。阶段三提案见STAGE3_PROPOSAL.json。', '']
    (HERE / 'REPORT.md').write_text('\n'.join(summary), 'utf-8')
    print(json.dumps(dict(reportWritten=True, admittedForStage3Proposal=passed, stage3AuthorizedBudget=0)))
