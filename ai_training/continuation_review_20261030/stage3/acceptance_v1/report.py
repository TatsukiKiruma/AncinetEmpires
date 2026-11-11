"""汇总预先锁定的验收结果与交付身份，不根据封存成绩调参。"""
from collections import defaultdict
import json
from pathlib import Path
import sys
from context import HERE, S3, ROOT, BASE, DATA, core, read, sha, save_new, now, validate
from finish import clustered


def macro(summary):
    groups=[summary['byPlayers'][str(n)] for n in [2,3,4]]
    return dict(rank=sum((g['normalizedRank'] or 0)*g['natural']/g['attempted'] for g in groups)/3,
                win=sum(g['wins']/g['attempted'] for g in groups)/3,allNatural=summary['allNatural'])


def analyze():
    validate()
    lock=read(S3/'FINAL_CANDIDATE_LOCK.json')
    base=read(DATA/'test-baseline/SUMMARY.json');final=read(DATA/'test-candidate/SUMMARY.json')
    assert sha(S3/'FINAL_CANDIDATE_LOCK.json')==read(DATA/'FINAL_TEST_ATTEMPT.json')['candidateLockSha256']
    assert final['modelSha256']==lock['modelSha256'] and final['priorScale']==lock['candidate']['priorScale']
    result=clustered(base,final)
    result.update(baselineMacro=macro(base),candidateMacro=macro(final),testRuns=1,selectionChangedAfterTest=False)
    save_new(S3/'FINAL_PAIRED_COMPARISON.json',result)
    save_new(DATA/'FINAL_PAIRED_COMPARISON.json',result)
    plan=read(HERE/'PLAN.json')
    development=clustered(read(plan['baselineDev']),read(lock['candidate']['arena']))
    save_new(S3/'DEV_FINAL_PAIRED_COMPARISON.json',development)
    print(json.dumps(dict(paired=True,byPlayers=result['byPlayers'],baselineMacro=result['baselineMacro'],candidateMacro=result['candidateMacro']),ensure_ascii=False))


def checkpoint_integrity():
    torch=core.torch;torch.set_num_threads(2)
    original=torch.load(core.legacy.BASE,map_location='cpu',weights_only=False)
    report={}
    for kind in ['best','last']:
        state=torch.load(DATA/kind/'checkpoint.pt',map_location='cpu',weights_only=False)
        model=core.legacy.load_model(DATA/kind/'final')
        assert core.legacy.tensor_digest(model.state_dict())==core.legacy.tensor_digest(state['model'])
        assert state['sampler']['cursor']==state['updates']*32
        assert state['scheduler']['last_epoch']==state['updates']
        assert state['baseCheckpointSha256']==core.legacy.BASE_SHA
        assert state['contractSha256']==read(HERE/'PLAN.json')['sourceMacContractSha256']
        increments={float(v['step'])-float(original['optimizer']['state'][k]['step']) for k,v in state['optimizer']['state'].items()}
        assert increments=={float(state['updates'])}
        assert not state['engineeringOnly'] and not state['pendingAccumulatedGradients']
        for values in [list(state['model'].values()),[v[k] for v in state['optimizer']['state'].values() for k in ['exp_avg','exp_avg_sq']]]:
            assert all(bool(torch.isfinite(value).all()) for value in values)
        report[kind]=dict(updates=state['updates'],samples=state['sampler']['cursor'],allFinite=True,
                          allAdamWStepIncrementsCorrect=True,exportTensorExact=True,
                          fullResumeStatePresent=all(k in state for k in ['sampler','rng','dropoutRng','scheduler','optimizer']),
                          noPendingGradients=True,sourceMacContractSha256=state['contractSha256'])
    save_new(S3/'CHECKPOINT_INTEGRITY.json',report)
    return report


def training_audit(returned):
    complete=read(returned/'mac-snapshot/work/training/COMPLETE.json')
    metrics=[]
    with (returned/'METRICS_THROUGH_100000.jsonl').open(encoding='utf-8') as stream:
        for line in stream:
            metrics.append(json.loads(line))
    assert [r['update'] for r in metrics]==list(range(1,100001))
    assert all(r['samples']==r['update']*32 for r in metrics)
    audit=dict(recordedUpdates=len(metrics),samples=3200000,
               gradientClipRate=sum(r['clipped'] for r in metrics)/len(metrics),
               meanGradientNorm=sum(r['gradientNorm'] for r in metrics)/len(metrics),
               priorDropped=sum(r['priorDropped'] for r in metrics),
               dropoutRate=sum(r['priorDropped'] for r in metrics)/3200000,
               forcedPolicyMasked=sum(r['forcedPolicyMasked'] for r in metrics),
               policyDenominator=sum(r['policyDenominator'] for r in metrics),
               exposure=complete['exposure'],sampleBudgetIsNominalCoverage=True,
               historySource=str(returned/'METRICS_PROVENANCE.json'),newTrainingUpdatesDuringAcceptance=0)
    assert audit['policyDenominator']+audit['forcedPolicyMasked']==3200000
    assert audit['exposure']['corpus/new']==2656000 and audit['exposure']['corpus/old']==544000
    assert [audit['exposure'][f'players/{n}'] for n in [2,3,4]]==[1088000,1056000,1056000]
    audit['windows']=[dict(start=u-19999,end=u,gradientClipRate=sum(r['clipped'] for r in metrics[u-20000:u])/20000,
                            meanGradientNorm=sum(r['gradientNorm'] for r in metrics[u-20000:u])/20000) for u in [20000,40000,60000,80000,100000]]
    save_new(S3/'TRAINING_AUDIT.json',audit)
    curves=[]
    for update in [20000,40000,60000,80000,100000]:
        result=read(returned/f'mac-snapshot/work/training/offline-{update:06d}/RESULT.json')
        for scale in [1.,.3,0.]:
            for corpus in ['old','new']:
                curves.append(dict(update=update,priorScale=scale,corpus=corpus,
                                   **result['buckets'][f'{scale}/{corpus}/dev']['parentEqual']))
    save_new(S3/'OFFLINE_CURVES.json',curves)
    return audit,curves


def deliver():
    contract=validate();plan=read(HERE/'PLAN.json');returned=Path(plan['sourceReturn'])
    lock=read(S3/'FINAL_CANDIDATE_LOCK.json');candidate=lock['candidate']
    comparison=read(S3/'FINAL_PAIRED_COMPARISON.json')
    traces=read(S3/'TACTICAL_TRACE_ANALYSIS.json');assert all(r['finalStateVerified'] for r in traces['reports'])
    integrity=checkpoint_integrity()
    audit,curves=training_audit(returned)
    base=read(DATA/'test-baseline/SUMMARY.json');final=read(DATA/'test-candidate/SUMMARY.json')
    cache=read(DATA/'sealed-cache/COMPLETE.json')
    assert cache['sealed'] and cache['parents']==329
    for side in ['baseline','candidate']:
        offline=read(DATA/f'sealed-{side}-offline/RESULT.json')
        assert offline['samples']==cache['samples'] and offline['buckets']['1.0/new/test']['parents']==329
    before=read(S3/'HISTORICAL_PRESERVATION.json')['files']
    changed=[file for file,digest in before.items() if sha(ROOT/file)!=digest]
    assert not changed,changed
    save_new(S3/'HISTORICAL_PRESERVATION_VERIFIED.json',dict(files=len(before),changed=changed,passed=True))
    manifest=dict(schema='stage3-omni-base-model-v1',created=now(),candidate=candidate,
                  inference=dict(search=False,priorScale=candidate['priorScale'],useSoftPriors=True),
                  original2414CheckpointSha256=core.legacy.BASE_SHA,originalScienceContractSha256=core.validate(),
                  acceptanceContractSha256=contract,sourceMacContractSha256=plan['sourceMacContractSha256'],
                  exportParity=read(S3/'EXPORT_PARITY.json'),checkpointIntegrity=integrity,models={},
                  inferenceAppliesTo='best',lastIsTrainingEndpoint=True,modelExportParity={},
                  deployAutomatically=False,fourthStageStarted=False,finalTestRuns=1,
                  caveat='best表示按预先规则选出的阶段三候选，不能仅据文件名认定强于旧冠军；详见REPORT')
    for kind in ['best','last']:
        manifest['models'][kind]={name:dict(path=str(DATA/kind/name),bytes=(DATA/kind/name).stat().st_size,
                                           sha256=sha(DATA/kind/name)) for name in ['checkpoint.pt','final.bin','final.json']}
        parity=read(DATA/f'parity-{integrity[kind]["updates"]}'/'RESULT.json')
        assert parity['passed'] and parity['modelSha256']==manifest['models'][kind]['final.bin']['sha256']
        manifest['modelExportParity'][kind]=parity
    save_new(S3/'OMNI_BASE_MODEL_MANIFEST.json',manifest)
    save_new(DATA/'OMNI_BASE_MODEL_MANIFEST.json',manifest)
    bmacro=macro(base);cmacro=macro(final)
    observed=cmacro['rank']-bmacro['rank']
    outcome='本次封存面板的等权归一排名得分提高' if observed>0 else '本次封存面板的等权归一排名得分未提高'
    lines=['# 第三阶段全人数均衡精调与封存验收报告','',f'交付时间：{now()}。完整训练100000更新、3200000样本已完成；后继验收已按冻结预算闭合。',
           f'唯一候选：**{candidate["update"]:,}更新，推理priorScale={candidate["priorScale"]}**。{outcome}（{bmacro["rank"]:.4f} → {cmacro["rank"]:.4f}）。',
           '本次完成数据/工程与结果交付，未替换应用默认模型、修改公共规则或启动第四阶段。best是阶段三开发筛选最佳，是否保留旧冠军应结合下面的封存成绩与不确定性；没有据测试结果重新训练或更换候选。','',
           '## 方法、授权与训练谱系','',
           '以用户最初第三阶段授权及100k追加授权为准：old2/new2/new3/new4为0.17/0.17/0.33/0.33，effectiveBatch32、真实四微批8、clip1、AdamW、峰值1e-4、终点1.5e-5、warmup1000，priorDropout0.25及priorScale 1→0.3的原100k余弦日程。',
           '从原始2414完整检查点（SHA256 338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b）恢复1,966,910参数及AdamW。Windows→三星→4500完整点→Mac的精确恢复证据保留；Mac从4500新增95500更新，本次验收新增训练更新为0。另一条三星4500以后分支未混入Mac轨迹或作为额外候选。',
           '实现谱系补充：最早84次正式更新使用有效批32、逻辑微批8并按原地图尺寸拆分物理前向；随后99916次使用异尺寸批处理的四个真实微批8。两种实现的梯度数值门槛、84步桥接及安全点摘要均保留，日程和累计更新没有重置；物理前向次数实测分布见acceptance_v1/ARTIFACT_PREFLIGHT.json。',
           '阶段一旧2414/268与新2190训练、331开发、329封存、150隔离原分区不变；阶段一/二冻结文件逐文件摘要复核通过。未串接阶段二的双人偏重试验权重。',
           '100000确定性抽样、各微批隔离组与游标恢复通过，证据SAMPLING_VERIFIED.json。样本有放回；320万是名义暴露，约265.6万新样本不等于所有唯一有效位置恰好遍历一次。单候选步保留价值学习并排除策略分母。',
           f'实际旧/新暴露544000/2656000；2P/3P/4P暴露1088000/1056000/1056000；prior dropout实测{audit["dropoutRate"]:.4%}；强制单候选策略mask次数{audit["forcedPolicyMasked"]:,}。完整细分曝光见TRAINING_AUDIT.json。',
           f'原数值门槛：微批/整批梯度相对L2={read(S3/"NUMERICAL_VERIFIED.json")["relativeL2"]:.8g}<1e-4；Mac工程前向、梯度和下一更新恢复证据见macbook_air_v1。正式梯度裁剪率{audit["gradientClipRate"]:.4%}，对比阶段二lr1e-4报告的99.96%；实际没有缓解裁剪频率，不将本项记作改进。',
           'Mac使用确定性CPU完成训练；MPS确定性scatter_add不通过的预检保留。跨硬件不宣称训练逐位等价，仅按各次检查点的模型/优化器/采样器/CPU RNG及dropout RNG完整状态衔接；验收在本机RX9070XT以同一冻结推理实现运行。','',
           '## 三档先验开发离线曲线','',
           '每20k在同一1299态面板上诊断，同一次前向复用先验1.0/0.3/0.0；以下为父局等权。完整人数×七类×来源×地形分桶及有效多候选NLL保留在源RESULT.json。',
           '| 更新 | 先验 | 分区 | Policy NLL | Value Brier |','|---:|---:|---|---:|---:|']
    lines.extend(f'| {r["update"]} | {r["priorScale"]} | {r["corpus"]}/dev | {r["policyNll"]:.6f} | {r["brier"]:.6f} |' for r in curves)
    lines.extend(['','100k节点的旧dev退化标志与新dev平台标志均为true；前一个80k点均为false，因此没有两个连续诊断点触发提前停止。未用100k终点代替预先定义的候选比较。','',
                  '## 开发全人数实战与唯一锁定','',
                  '开发固定40k、100k，加未退化节点中new/dev NLL最小的80k，共三个权重点；每点只测priorScale0.3与1.0。原2414的54局基线按已冻结身份复用，没有重复记成新实战。',
                  '每套20局2P、18局3P、16局4P，困难对手为每个其他席位独立OriginalApkLikeHardAI。开发并发最多3个独立套件，固定样本/种子/RNG不共享；最终配对最多2套同时运行，基线与候选使用同一GPU、引擎、候选编码及时间边界。所有延迟、截断、运行错误均逐局保留。',
                  '| 模型 | 先验 | 人数 | 独胜/自然局 | 排名分 | 截断/错误/超时 |','|---|---:|---:|---:|---:|---|'])
    sources=[('2414',1.,read(plan['baselineDev']))]
    for update in plan['fixedCandidateUpdates']:
        for scale in plan['fixedPriorScales']:
            sources.append((str(update),scale,read(DATA/f'dev-{update:06d}-prior-{scale}/SUMMARY.json')))
    for name,scale,result in sources:
        for n in [2,3,4]:
            g=result['byPlayers'][str(n)]
            lines.append(f'| {name} | {scale} | {n}P | {g["wins"]}/{g["natural"]} | {g["normalizedRank"]} | {g["truncations"]}/{g["errors"]}/{g["timeForfeits"]} |')
    lines.extend(['',f'按全自然覆盖优先、三个人数等权平均归一排名、独胜、新dev NLL、旧dev Brier依次排序，锁定{candidate["update"]}与先验{candidate["priorScale"]}。完整排序见FINAL_CANDIDATE_LOCK.json。封存原态访问与前向在锁定前均为0。',
                  '基础设施限制：100k＋先验1.0开发组出现过进度JSON原子替换EPERM（见acceptance_v1/IO_INCIDENT.json），按预定口径保留为运行错误，没有补跑或删局。该异常不等同于模型非法动作或推理失败；完整自然覆盖优先的排序受此基础设施因素影响，不能把该配置的名次差完全解释为棋力差。后续监控仅读取已完成的不可变逐局结果，历史及封存阶段对产物rename使用最多2秒有界重试；对局、模型、种子、排序和预算均不变。',
                  f'非自然局界限分析：{json.dumps(lock["ioSensitivity"],ensure_ascii=False)}。只把未观测排名分界定为0到1，检查其上界能否追平已选候选，不将上界计作真实成绩或改变预定排序。',
                  '', '## 唯一一次封存配对验收','',
                  f'全局FINAL_TEST_ATTEMPT于{read(DATA/"FINAL_TEST_ATTEMPT.json")["started"]}占用，随后才物化测试初态和离线前态。329父局按每个实际回合阶段取最多一个固定中位前态，共{cache["samples"]}态；基线与唯一候选使用同一缓存，三档先验复用网络输出。',
                  '| 模型 | 先验 | 测试父局 | Policy NLL | Value Brier |','|---|---:|---:|---:|---:|'])
    for side in ['baseline','candidate']:
        result=read(DATA/f'sealed-{side}-offline/RESULT.json')
        for scale in [1.,.3,0.]:
            group=result['buckets'][f'{scale}/new/test'];r=group['parentEqual']
            lines.append(f'| {side} | {scale} | {group["parents"]} | {r["policyNll"]:.6f} | {r["brier"]:.6f} |')
    lines.extend(['','实战为同条件54局配对（基线54＋唯一候选54），不是增加第二个候选。以下区间以初态槽为聚类单位，含同槽全部席位，10000次bootstrap、固定seed20261101。',
                  '| 人数 | 基线独胜/自然局 | 候选独胜/自然局 | 排名分：基线→候选 | 独胜差95%聚类区间 |','|---:|---:|---:|---|---|'])
    for n in [2,3,4]:
        b=base['byPlayers'][str(n)];c=final['byPlayers'][str(n)];p=comparison['byPlayers'][str(n)]
        lines.append(f'| {n}P | {b["wins"]}/{b["natural"]} | {c["wins"]}/{c["natural"]} | {b["normalizedRank"]} → {c["normalizedRank"]} | {p["firstPlace"]["ci95"]} |')
    lines.extend(['',f'三个人数等权独胜率：{bmacro["win"]:.4%} → {cmacro["win"]:.4%}；等权排名分：{bmacro["rank"]:.6f} → {cmacro["rank"]:.6f}。',
                  f'基线/候选全自然覆盖：{base["allNatural"]}/{final["allNatural"]}。存在非自然结果时不补造完整配对变化或置信区间，详见FINAL_PAIRED_COMPARISON.json。少量初态槽的区间较粗，点估计提高不等于证明总体显著提升。','',
                  '## 历史40局纵向对照',''])
    lines.append('原2414冻结历史基线为困难10/20胜、简单16/20胜，合计26/40（阶段一REPORT第7节与阶段二REPORT的原基线记录）；以下为唯一最终候选在同一40局面板的结果。此纵向开发对照没有用于锁定后的再次选择。')
    history=read(DATA/'historical-final/SUMMARY.json')
    for opponent in ['hard','simple']:
        games=[g for g in history['games'] if g['opponent']==opponent]
        counts={name:sum(g['classification']==name for g in games) for name in ['natural_win','natural_draw','natural_loss']}
        lines.append(f'- {opponent}：自然胜/和/负={counts["natural_win"]}/{counts["natural_draw"]}/{counts["natural_loss"]}，非自然{sum(not g["natural"] for g in games)}，计划20局。')
    lines.extend(['','## 胜败直接证据与局限',''])
    for case in traces['reports']:
        change='由基线未独胜变为独胜' if case['modelFirstPlace'] and not case['baselineFirstPlace'] else '由基线独胜变为未独胜' if case['baselineFirstPlace'] and not case['modelFirstPlace'] else '配对独胜相同'
        text=f'- {case["id"]}，{case["map"]}，{change}；模型动作计数{json.dumps(case["actionCounts"],ensure_ascii=False)}。'
        if case['eliminationEvidence']:
            e=case['eliminationEvidence'][0]
            text+=f'回合{e["turn"]}由玩家{e["actingPlayer"]}的{e["triggerAction"]["type"]}直接触发模型出局；此前模型尚有{len(e["modelUnitsBefore"])}个单位、{e["castlesBefore"]}座城堡。'
        lines.append(text)
    lines.extend(['','上述最多六局只复查本次新实战，前后态SHA及终态全部一致；没有重放历史采集整局。直接出局触发和近期动作不是普遍战略根因，不能仅从NLL判断战术。',
                  '八张官方双人标准开局是共享已知地图基准；dev/test种子不同但标准初态共享，不能声称未知地图泛化。父局附加初态和多人初态按冻结隔离组分区不交叉。新训练双人正常格独立覆盖为零，旧17%正常开局锚点不能消除该数据局限。',
                  '地形confirmed/atlas/approximate保持原准入标记，测试原态分层并未将近似地形提升为确定。对手是项目困难脚本复刻，不是APK原生人机实战。本阶段结论不等同于strict、forced或APK原生历史回放验证。',
                  '本次未改公共规则/UI，不重跑公共lint/test/build，也不记为通过。定向检查为原科学合同、跨语言前向/排序、完整模型/AdamW/日程/RNG/游标身份、导出逐张量、固定预算和阶段一二原件核验。','',
                  '## 交付与后续边界','',
                  f'D盘：`{DATA}`。best/last各含完整checkpoint.pt及final.bin/final.json；唯一推理先验见OMNI_BASE_MODEL_MANIFEST.json，跨语言容差2e-5的检查见EXPORT_PARITY.json。',
                  'EVIDENCE_MANIFEST.json记录实际产物及源码摘要。未自动替换前端模型，当前应用旧冠军保持原状。若封存结果未优于旧基线，应保留旧冠军；本次不会据负结果无限加训、回调超参数、追加候选或重跑测试。',
                  'Mac原件与全部历史检查点保留；Windows训练/原自动跟进仍暂停，三星保持此前收尾状态。验收控制器在全部命令结束后闭合，不留下训练、推理或评测子进程。'])
    report='\n'.join(lines)+'\n'
    assert not (S3/'REPORT.md').exists()
    (S3/'REPORT.md').write_text(report,'utf-8');(DATA/'REPORT.md').write_text(report,'utf-8')
    save_new(DATA/'SEALED_TEST_CLOSED.json',dict(finished=now(),testRuns=1,models=2,arenaGames=108,
                                               offlineParents=329,offlineStates=cache['samples'],uniqueCandidateLockSha256=sha(S3/'FINAL_CANDIDATE_LOCK.json'),
                                               noTrainingAfterTest=True,noReselectionAfterTest=True))
    handoff=S3/'HANDOFF.md';old=handoff.read_text('utf-8')
    (DATA/'HANDOFF_BEFORE_ACCEPTANCE.md').write_text(old,'utf-8')
    insertion=f'2026-10-31最新：100k Mac分支后继验收已完成，唯一候选{candidate["update"]}、先验{candidate["priorScale"]}，开发最多三个权重点及一次329父局离线＋54局基线/候选配对测试均闭合。正式REPORT.md和OMNI_BASE_MODEL_MANIFEST.json已交付，D盘`{DATA}`。未加训、修改公共规则、替换UI或启动第四阶段。旧“待验收/训练中”条目不再是实时状态。\n\n'
    handoff.write_text(old.replace('# 第三阶段当前接手入口\n\n','# 第三阶段当前接手入口\n\n'+insertion,1),'utf-8')
    print(json.dumps(dict(delivered=True,candidate=candidate,report=str(S3/'REPORT.md'),testRuns=1)),flush=True)


def evidence():
    assert read(DATA/'RUN_CLOSED.json')['backgroundChildrenRemaining']==0
    files={}
    paths=list(HERE.glob('*.py'))+list(HERE.glob('*.ts'))+list(HERE.glob('*.json'))
    names=['REPORT.md','OMNI_BASE_MODEL_MANIFEST.json','FINAL_CANDIDATE_LOCK.json','DEV_CANDIDATES.json','FINAL_PAIRED_COMPARISON.json',
           'DEV_FINAL_PAIRED_COMPARISON.json','EXPORT_PARITY.json','CHECKPOINT_INTEGRITY.json','TRAINING_AUDIT.json','OFFLINE_CURVES.json',
           'HISTORICAL_PRESERVATION_VERIFIED.json','TACTICAL_TRACE_ANALYSIS.json','TEST_INITIAL_MANIFEST.json','SEALED_OFFLINE_PANEL.json',
           'SCIENCE_CONTRACT.json','CONFIG.json','AUTHORIZATION.json','SAMPLING_VERIFIED.json','NUMERICAL_VERIFIED.json','OMNI_PANEL_AUDIT.json']
    paths += [S3/name for name in names]
    paths += [p for p in DATA.rglob('*') if p.is_file()]
    plan=read(HERE/'PLAN.json');returned=Path(plan['sourceReturn'])
    paths += [returned/name for name in ['RETURN_RECEIPT.json','SNAPSHOT_MANIFEST.json','FILES_VERIFIED.json','METRICS_PROVENANCE.json','LOCAL_INPUTS_VERIFIED.json']]
    for path in sorted(set(paths)):
        files[str(path)]=dict(bytes=path.stat().st_size,sha256=sha(path))
    value=dict(schema='stage3-acceptance-evidence-v1',created=now(),files=files,finalTestRuns=1,
               finalCandidateLocked=True,backgroundChildrenRemaining=0,stage1Stage2Preserved=True,
               sourceReturnManifest=str(returned/'SNAPSHOT_MANIFEST.json'),
               caveat='取回原件与输入的逐文件清单通过引用的已验证清单绑定；本清单不自包含自己的摘要，REVIEW_REQUEST为完成后的外层指针')
    save_new(S3/'EVIDENCE_MANIFEST.json',value)
    save_new(DATA/'EVIDENCE_MANIFEST.json',value)
    request=dict(schema='stage3-result-review-v1',status='complete',report=str(S3/'REPORT.md'),
                 manifest=str(S3/'OMNI_BASE_MODEL_MANIFEST.json'),evidence=str(S3/'EVIDENCE_MANIFEST.json'),
                 manifestSha256=sha(S3/'OMNI_BASE_MODEL_MANIFEST.json'),evidenceSha256=sha(S3/'EVIDENCE_MANIFEST.json'),
                 finalTestRuns=1,stage4Started=False,uiDeployed=False,newTrainingUpdates=0)
    save_new(S3/'REVIEW_REQUEST.json',request)
    print(json.dumps(dict(evidenceFiles=len(files),backgroundChildrenRemaining=0,reviewRequest=str(S3/'REVIEW_REQUEST.json'))),flush=True)


if __name__=='__main__':
    globals()[sys.argv[1]]()
