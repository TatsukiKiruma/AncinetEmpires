"""全部实战和数值门禁结束后生成事实报告、清单与接手状态。"""
from pathlib import Path
import json,hashlib,os,datetime,sys
sys.dont_write_bytecode=True
from preservation_audit import run as audit_preservation
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(n,v):(HERE/n).write_text(json.dumps(v,ensure_ascii=False,allow_nan=False),encoding='utf-8')
assert read(HERE/'pipeline-exit.json')['passed']
for gate in ['feature-gate.json','focus-cache-parity.json','data-audit.json','warmstart-gate.json','value-context-gate.json','army-input-gate.json','value-army-warmstart-gate.json','numeric-initial.json','browser-initial.json','numeric-army-initial.json','browser-army-initial.json','numeric-residual-initial.json','browser-residual-initial.json','numeric-best.json','browser-best.json','search-gate.json','response-regression.json','search-purity-gate.json','dynamic-play-exit.json','interrupted-prefix-audit.json','verified-search-gate.json','response-verified-regression.json','search-verified-purity-gate.json','verified-play-exit.json','verified-pipeline-exit.json']:
    assert read(HERE/gate)['passed'],gate
preserved=audit_preservation()
assert preserved['stage3Unchanged'] and preserved['newTrainingCachePassed']
c=read(HERE/'contract.json');audit=read(HERE/'data-audit.json');policy=read(HERE/'policy-training.json');cal=read(HERE/'calibration-result.json');value=read(HERE/'value-evaluation.json');comparison=read(HERE/'dev-comparison.json');battles=read(HERE/'battle-summary.json');model=read(HERE/'model-final.json');counts=read(HERE/'value-data-counts.json');interruptions=read(HERE/'interrupted-prefix-audit.json')
sourceRevisions={}
for name,digest in read(HERE/'policy-source-binding.json').items():
    candidates=[HERE/name,*HERE.glob(name+'.*.snapshot')];matching=[p for p in candidates if p.is_file() and sha(p)==digest];assert matching,name
    sourceRevisions[name]=dict(trainingSha256=digest,preservedAt=str(matching[0].relative_to(HERE)),currentSha256=sha(HERE/name))
for name,digest in c['sourceBinding'].items():assert sha(HERE/name)==digest,name
assert model['weights']==read(HERE/'policy-final.json')['weights'] and model['schema']==read(HERE/'policy-final.json')['schema']
save('policy-source-revision-audit.json',dict(passed=True,revisions=sourceRevisions,dataGenerationSourcesUnchanged=True,policyWeightsUnchangedByValue=True))
assert battles['strictSlots']==250 and audit['rows']==c['trainRows']+c['devRows']
quality=bool(cal['passed'] and value['passed']);status='complete' if quality else 'completed_with_failed_gates'
fmt=lambda v:'不可用' if v is None else f'{v:.6f}'
lfmt=lambda v:'不可用' if v is None else f'{v:.1f}'
opponents=['random','apk_like','heuristic'];arms=['hierarchical','pure','value_rerank','bounded','bounded_verified']
fixed={(r['arm'],r['opponent']):r for r in battles['table'] if r['panel']=='fixed'}
fixedWins={arm:[fixed[(arm,opponent)]['classifications'].get('natural_win',0) for opponent in opponents] for arm in arms}
winText=lambda arm:'/'.join(str(v) for v in fixedWins[arm])
battleNonregression=all(fixedWins['bounded_verified'][i]>=fixedWins['hierarchical'][i] and fixed[('bounded_verified',opponent)]['truncationRate']<=fixed[('hierarchical',opponent)]['truncationRate'] for i,opponent in enumerate(opponents))
expanded={r['arm']:r for r in battles['table'] if r['panel']=='expanded'}
expandedWins={arm:expanded[arm]['classifications'].get('natural_win',0) for arm in arms}
expandedNonregression=expandedWins['bounded_verified']>=expandedWins['hierarchical'] and expanded['bounded_verified']['truncationRate']<=expanded['hierarchical']['truncationRate']
if quality and not (battleNonregression and expandedNonregression):status='completed_with_observed_battle_regression'
completedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat();completedLocal=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
lines=['# 阶段4：集火、价值头与模型化BattleSearchAI','',f'执行状态：{status}。480训练/120开发父局、原四臂200槽及事件守卫修订50槽，共250槽，全部已提交动作strict重放完成。组校准门禁：{cal["passed"]}；价值分阶段基线门禁：{value["passed"]}。未通过的门禁不改写为通过。','',
    '开发门禁、三端数值一致性和strict合法性通过，不等于搜索实战增益通过。Value直接重排的负面结果与所有截断完整保留；本轮没有晋升模型或接入应用。','',
    f'固定面板自然胜场（依次Random/ApkLikeAI/HeuristicAI，各10槽）：阶段3 **{winText("hierarchical")}**，新纯策略 **{winText("pure")}**，Value重排 **{winText("value_rerank")}**，初版有界搜索 **{winText("bounded")}**，事件守卫修订 **{winText("bounded_verified")}**。修订版逐档胜场及截断率均不退于阶段3的描述性检查：{battleNonregression}；这不是新增预注册门禁。完整截断、配对变化和扩展开发根结果见下表。','',
    f'扩展开发根对HeuristicAI自然胜场（各20槽）：阶段3 **{expandedWins["hierarchical"]}**、新纯策略 **{expandedWins["pure"]}**、Value重排 **{expandedWins["value_rerank"]}**、初版搜索 **{expandedWins["bounded"]}**、修订搜索 **{expandedWins["bounded_verified"]}**。扩展根胜场及截断率均不退于阶段3的描述性检查：{expandedNonregression}。验收完成时间：{completedLocal}；目录日期保留立项标识。','',
    '两版搜索在扩展根各有10/20槽预算截断，搜索时延和墙钟目标未达成。修订版固定面板没有截断，但HeuristicAI胜场退至5/10；离线Value改善没有转化为可靠的局中搜索收益。','',
    '本次为已消费开发材料和标准地图上的受控实验，不宣称独立泛化、模型晋升或应用接入。手机/ADB操作为0。阶段3全部文件SHA保持，既有工作区代码、模型、数据和报告未回滚。','',
    '历史保全复核发现80个阶段2packed/*.pkl已缺失，完整历史快照门禁为False；阶段3全部4771文件、新目录600份训练缓存SHA均通过。独立存储清理记录列出了阶段2缓存类别清理（163件），但无逐文件清单，不能逐件严格归因。原快照、首次失败清单和清理记录副本全部保留，未重建旧缓存或改写预期SHA。详见preservation-check.json；这项缺件不冒称保全通过。','',
    '## 数据与策略','',f'完整候选无裁剪，实际训练{c["trainRows"]}条、开发{c["devRows"]}条非平凡原子；自动换手平凡end_turn剔除{sum(f["trivial"] for f in c["files"])}条。全部来源标签在当前权威轨迹合法，压缩分片和无损float32缓存按SHA绑定。新增特征中段审计{audit["probeParents"]}父局，逐float32误差0。','',
    f'所选600父局合计可信胜方标签{audit["winningLabels"]}、可信败方标签{audit["losingLabels"]}、价值mask关闭{audit["maskedValueLabels"]}。只有valueEligible及完整自然终局strict证据通过的父局进入价值梯度；原生赢家字段单独存在不足以放行。本次只消费所选600父局，不能把背景全部双人SD价值标签数量当成本次训练量。','',
    f'阶段3的141维候选输入完整保留，新增10维集火/收尾信号，总151维。热启动新输入权重为零，23探针的原策略/组logits和argmax误差0。PC float64 AdamW，胜方可信策略样本权重1.5，实际{policy["epochs"]}轮/{policy["steps"]}次更新，训练墙钟{policy["seconds"]:.2f}秒。最终策略epoch={model["epoch"]}。','',
    '两敌军集火反例：单军最大伤害35<目标60HP，但两次move→attack可合法致死。落点冲突反例：松弛伤害70，贪心合法累计仅35、一个攻击者，不能误标致死。relaxed列是固定快照放松占位冲突的三军伤害和；greedy列才是逐动作可重放的累计净损血与致死见证，最多三个不同攻击者。','',
    'can_still_recruit来自当前完整合法招募集合，覆盖空城堡、金币和权威规则限制；has_free_attack表示存在正伤害且行动者无即时损血的合法攻击，不保证后续回合或全队零风险。两者作为全局候选信号注入，包括end_turn候选。集火松弛值不声称敌方整个回合的形式化伤害上界。','',
    '## 同一120父局开发比较','', '|模型|top1|groupTop1|组内移动|组内招募|攻击机会/选择攻击|有机会却wait|有招募却end|','|---|---|---|---|---|---|---|---|']
for name,result in comparison.items():
    m=result['metrics'];lines.append(f'|{name}|{m["top1"]:.4%}|{m["groupTop1"]:.4%}|{m["within_move"]:.4%}|{m["within_recruit"]:.4%}|{m["attackTaken"]}/{m["attackOpportunity"]} ({m["attack_opportunity_rate"]:.4%})|{m["waitWithOpportunity"]}|{m["endWithRecruit"]}|')
lines+=['',f'五类联合L-BFGS原定9组均未通过；追加4组更强end降权，最终选择wait=0.6/end=0.35。追加探索不属于原定参数网格，但全部门禁保持预注册原值：wait不高于阶段3和未校准阶段4、漏招募至少下降20%、攻击机会率不降、top1回退不超过1个百分点。通过：{cal["passed"]}；选择未使用实战胜负。详情见calibration-candidates.json、原定9组失败收据与calibration-extension-protocol.json。','',
    '## 价值头','',f'独立两层MLP基底，64隐藏维、LayerNorm/ReLU/tanh，策略骨干冻结。最终输入为260维策略实体池化上下文＋原24维摘要＋1维公共calculateArmyValue双方差值/1024，总285维。MLP各层先接受自然价值梯度训练，最后固定已训练首层和LayerNorm，使用训练分区L-BFGS拟合输出层及六个可学习分阶段军力跳连参数；最终为BCE目标、L2=0.01。跳连属于神经模型参数，没有调用HeuristicAI评分。实际训练{counts["trainRows"]}条/{counts["trainParents"]}自然终局父局，开发{counts["devRows"]}条/{counts["devParents"]}父局。训练按父局及开/中/后期等权，原宏权重在各桶内归一化。','',
    '原284维MLP未通过中盘和后期强军力基线；追加军力输入的285维MLP及训练分区输出温度校准仍未通过中盘。保留两版模型和全部失败收据后，追加可学习跳连，16个训练拟合候选中按原门禁和开发三阶段MSE选择。此架构与参数探索属于追加开发研究，不伪称原预注册架构一次通过；未使用实战结果。','',
    '|阶段|估计器|行数/父局|MSE|Brier|符号准确率|ROC-AUC|','|---|---|---|---|---|---|---|']
for phase in ['opening','middle','late','all']:
    for name,ms in [('Value',value['metrics']),*value['baselines'].items()]:
        m=ms[phase]
        if not m['rows']:lines.append(f'|{phase}|{name}|0/0|不可用|不可用|不可用|不可用|');continue
        lines.append(f'|{phase}|{name}|{m["rows"]}/{m["parents"]}|{fmt(m["mse"])}|{fmt(m["brier"])}|{fmt(m["signAccuracy"])}|{fmt(m["rocAuc"])}|')
lines+=['','常数、分阶段常数及静态公式系数均只在训练集确定；fitted_static仅使用金币、总HP、兵数和收入差；army_static/fitted_army复用公共calculateArmyValue，招募成本和有效最大HP来自权威规则，拟合尺度仅消费训练集。Brier使用p=(Value+1)/2。某阶段缺少两类自然结果时AUC记不可用。完整指标和未通过门禁见value-evaluation.json。','',
    '## 数值与搜索框架','',
    '初始与最佳Policy＋Value均经PyTorch自动微分、独立TS解析反向和真实Chrome原始状态重编码。包括batch32、实际末批、胜方加权batch及mask=false，策略骨干收到的价值梯度为零。','', '|模型/运行端|前向最大误差|全参数梯度最大误差|loss最大误差|通过|','|---|---|---|---|---|']
for name in ['initial','army-initial','residual-initial','best']:
    for side in ['numeric','browser']:
        r=read(HERE/f'{side}-{name}.json');lines.append(f'|{name}/{side}|{r["maxForwardError"]:.3g}|{r["maxGradientError"]:.3g}|{r["maxLossError"]:.3g}|{r["passed"]}|')
lines+=['',
    '按补充要求直接移植src/game/ai/battle_search_ai.ts控制框架，见FRAMEWORK_MAPPING.md。默认和Top6先验、3步friendlyRolloutSteps均由分层网络产生。Maximin比较三单位集火、movingThreat补充和对手策略回应；移动回应继续探测同单位合法攻击。实战前补齐对称失城净变化项，系数不变，修订前版本与search-amendment-castle-net.json保留。叶子采用Value＋引擎双方总HP净变化（含招募与治疗）、双方指挥官减少差及双方城堡夺取净变化；自然终局±4主导。','',
    '单步48/整局2400显式搜索树节点，30秒/600秒墙钟及2000实际动作。特征构造和集火见证内部结算不计树节点，其耗时包含在决策与整局墙钟内，集火每次最多三个不同攻击者。Takeover间隔0.08，Veto间隔0.03。初版危险线−0.5或已探测真实致死；修订版移除仅凭负Value否决。预算不足的候选不参加接管；耗尽整局节点预算继续使用模型默认策略。连动序列在完整实际状态和合法集合匹配后执行。所有系数在各自实战前冻结。','',
    '独立依赖图证明搜索无HeuristicAI/旧启发式叶子依赖。响应回归实际拦截了单军不致死、两军移动攻击累计致死的指挥官；己方3步均逐步核对为分层网络选择；同一真实占城动作的双方净变化为+1/-1。固定节点探针重复决策和分支完全一致，快速Value叶子与完整Value前向误差0；摘要专用路径省略未被Value使用的actor风险，23状态的24维摘要逐值误差0。Maximin仅覆盖有界探测分支，不是敌方整个回合的穷举最坏值。','',
    '初版在ApkLikeAI上为5/10（含墙钟截断），纯策略6/10，Value重排1/10。静态审查确认原通用Takeover只有分差和损失条件，没有强制验证实际事件，因此独立追加事件守卫修订，不替换原200槽。普通动作只允许实际增加敌指挥官击杀或敌城堡夺取时接管；默认end/wait还可由新增击杀、占领、招募、零即时损血攻击纠正。事件只在己方真实引擎连动结束时统计，不把敌方回应中的反击伤亡冒充己方当回合斩杀。Veto要求合法致死威胁或实际关键损失，取消负Value单独否决；触发探测最多六次权威移动后动作查询，另计triggerProbes，耗时进入墙钟。Policy/Value权重、分差系数、TopK及树预算不变。此修订属于追加开发探索，不能作为独立泛化结论。','',
    '## 配对实战','',
    '固定五图双座位，Random/ApkLikeAI/HeuristicAI各10槽/臂；另10个新增开发父局前缀双座位，对HeuristicAI各20槽/臂。原四臂200槽全部保留，追加修订50槽，共250槽。第四臂value_rerank执行根候选并结算至回合末后按Value重排，不做己方连动或对手Maximin，用于区分Value重排与完整搜索贡献。全部提交动作strict核对完整合法集合、动作、前后态与终态hash；不把截断、超时、错误当作自然胜利。','',
    '|面板|对手|模型|胜/负/和|动作/墙钟/决策截断|自然胜率|p50/p95/p99 ms|第10轮收入差/到达局数|漏招募/模型动作|单军致死/集火致死/已知移动|','|---|---|---|---|---|---|---|---|---|---|']
for r in battles['table']:
    cl=r['classifications'];m=r['metrics'];lat=r['latency'];lines.append(f'|{r["panel"]}|{r["opponent"]}|{r["arm"]}|{cl.get("natural_win",0)}/{cl.get("natural_loss",0)}/{cl.get("natural_draw",0)}|{cl.get("action_truncation",0)}/{cl.get("wall_truncation",0)}/{cl.get("decision_timeout",0)}|{r["naturalWinRate"]:.1%}|{lfmt(lat["p50"])}/{lfmt(lat["p95"])}/{lfmt(lat["p99"])}|{fmt(r["round10IncomeDifference"])}/{r["round10Count"]}|{m.get("endWithRecruit",0)}/{m.get("actions",0)}|{m.get("lethalLandings",0)}/{m.get("focusLethalLandings",0)}/{m.get("knownMoveRisk",0)}|')
lines+=['','自然胜率分母为该组全部槽位，截断不算自然胜利。单步时延包括未提交的超时决策。','', '|面板/对手/模型|选择攻击/攻击机会|有招募却end/end总数|集火已知移动|搜索触发/改选/节点|','|---|---|---|---|---|']
for r in battles['table']:
    m=r['metrics'];attack=m.get('attackTaken',0);opportunity=m.get('attackOpportunity',0);rate=f'{attack/opportunity:.2%}' if opportunity else '不可用'
    lines.append(f'|{r["panel"]}/{r["opponent"]}/{r["arm"]}|{attack}/{opportunity} ({rate})|{m.get("endWithRecruit",0)}/{m.get("endTurns",0)}|{m.get("focusKnownMoveRisk",0)}|{m.get("searchTriggers",0)}/{m.get("searchChanges",0)}/{m.get("searchNodes",0)}|')
lines+=['','|面板/对手/模型（相对阶段3配对）|新增自然胜/丢失自然胜|胜率差|双方均到第10轮的收入差变化/局数|','|---|---|---|---|']
for r in battles['paired']:
    income='不可用' if r['pairedRound10IncomeDifference'] is None else f'{r["pairedRound10IncomeDifference"]:.2f}'
    lines.append(f'|{r["panel"]}/{r["opponent"]}/{r["arm"]}|{r["naturalWinsGained"]}/{r["naturalWinsLost"]}|{r["winRateDifference"]:+.1%}|{income}/{r["pairedRound10Count"]}|')
lines+=['','完整结局分类（包括循环、投降和错误）：','', '|面板/对手/模型|分类计数|','|---|---|']
for r in battles['table']:lines.append(f'|{r["panel"]}/{r["opponent"]}/{r["arm"]}|'+', '.join(f'{k}={v}' for k,v in sorted(r['classifications'].items()))+'|')
lines+=['',f'合计{battles["strictSlots"]}槽、{battles["strictActions"]}个提交动作strict通过。固定分臂调度出现负载失衡后改为相同8并发共享队列，原先完成的{interruptions["retainedResults"]}局结果逐文件SHA保持；{interruptions["interruptedSlots"]}局运行中前缀一律归档并按原模型、初态与种子重跑。另有{interruptions["strictActions"]}个归档动作strict通过，与重跑共享部分{interruptions["sharedActions"]}动作逐状态/动作/随机状态一致。全部局内源码、模型和预算哈希保持，未丢弃已完成的失败或截断。第10轮均值只包含实际到达该轮对局；提前结束不按零混入。致死落点为反事实风险，并不等同实际死亡次数。完整整数分母、搜索干预与逐局记录见BATTLES.md和battle-summary.json。','',
    '## 交付与限制','',
    '公共lint、368测试和build通过；本阶段独立类型与专用门禁通过。训练工作区总lint仍有既有版本类型错误；总测试447通过、64失败，原日志保留，未修改旧用例或模型补缺。本阶段检查不能替代历史版本修复。','',
    f'最终模型SHA-256：`{sha(HERE/"model-final.json")}`。Policy参数（含5类偏置）{len(model["weights"])+5}，替换Value头参数{len(model["valueWeights"])}；兼容保留的旧冻结Value块不参与推理。数据、schema、源码、原始失败/中断现场、全部模型与检查点均由DELIVERY_MANIFEST.json绑定。']
(HERE/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
save('TASK_STATE.json',dict(status=status,phase='实验结果已封存',complete=False,experimentComplete=True,calibrationGate=cal['passed'],valueGate=value['passed'],strictSlots=250))
current=ROOT/'ai_training/status/CURRENT.md';originalCurrent=current.read_bytes();text=originalCurrent.decode('utf-8-sig');start='<!-- tactical-value-search-20261018 -->';end='<!-- end-tactical-value-search-20261018 -->'
currentBackup=HERE/'CURRENT.before-stage4.snapshot'
if not currentBackup.exists():currentBackup.write_bytes(originalCurrent)
section=f'{start}\n## 2026-10-18 阶段4：集火、价值与模型化BattleSearch实验\n\n见[报告](../tactical_value_search_20261018/REPORT.md)、[框架映射](../tactical_value_search_20261018/FRAMEWORK_MAPPING.md)、[实战](../tactical_value_search_20261018/BATTLES.md)和[交付清单](../tactical_value_search_20261018/DELIVERY_MANIFEST.json)。480/120父局实际{c["trainRows"]}/{c["devRows"]}非平凡原子，PC策略{policy["epochs"]}轮；独立Value训练{counts["trainRows"]}条可信标签。组校准门禁{cal["passed"]}，价值分阶段基线门禁{value["passed"]}。250槽/{battles["strictActions"]}动作strict通过，初始/最佳PyTorch/TS/真实Chrome前向和全参数梯度通过。按用户补充要求移植BattleSearchAI默认保底、Takeover/Veto、3步模型连动和Maximin，修复移动攻击与三单位集火，并追加真实事件接管守卫。固定三档自然胜场：阶段3 {winText("hierarchical")}、纯策略{winText("pure")}、初版搜索{winText("bounded")}、修订搜索{winText("bounded_verified")}（各项10槽）。搜索无启发式依赖。扩展Heuristic各20槽，阶段3/纯策略/初版搜索/修订搜索自然胜场为{expandedWins["hierarchical"]}/{expandedWins["pure"]}/{expandedWins["bounded"]}/{expandedWins["bounded_verified"]}。阶段3全部4771文件SHA保持；历史全量快照因80个阶段2缓存缺失未通过，独立清理类别记录及首次失败清单见preservation-check.json，不能逐文件严格归因。本次600份训练缓存SHA保持，手机/ADB 0。属于已消费开发诊断，质量未通过项不可称通过；没有晋升或应用接入。状态：{status}。\n{end}\n'
if '\r\n' in text:section=section.replace('\n','\r\n')
if start in text:text=text[:text.index(start)]+section+text[text.index(end)+len(end):]
else:text=text.replace('# 当前接手状态','# 当前接手状态\n\n'+section,1)
current.write_bytes((b'\xef\xbb\xbf' if originalCurrent.startswith(b'\xef\xbb\xbf') else b'')+text.encode('utf-8'))
artifacts={}
for base,dirs,files in os.walk(HERE,followlinks=False):
    dirs[:]=[d for d in dirs if not d.startswith('chrome-profile-') and d!='__pycache__']
    for name in files:
        path=Path(base)/name
        if name=='DELIVERY_MANIFEST.json':continue
        artifacts[str(path.relative_to(HERE))]=dict(sha256=sha(path),bytes=path.stat().st_size)
save('DELIVERY_MANIFEST.json',dict(version='tactical-value-search-20261018-v2',status=status,experimentComplete=True,overallAcceptancePassed=False,qualityGatesPassed=quality,qualityGateScope="仅源码、数值、标签与训练开发门禁，不表示搜索实战提升",promotionRecommended=False,completedAtUtc=completedUtc,completedAtLocal=completedLocal,calibrationGate=cal['passed'],valueGate=value['passed'],scope=dict(trainParents=480,devParents=120,trainRows=c['trainRows'],devRows=c['devRows'],strictSlots=250,strictActions=battles['strictActions'],originalSlots=200,additionalVerifiedSlots=50,interruptedPrefixStrictActions=interruptions['strictActions'],phoneOperations=0),modelSha256=sha(HERE/'model-final.json'),selectionSha256=sha(HERE/'selection.json'),contractSha256=sha(HERE/'contract.json'),framework=read(HERE/'search-purity-gate.json'),verifiedFramework=read(HERE/'search-verified-purity-gate.json'),fixedNaturalWins=fixedWins,verifiedNonregressionDescriptive=bool(battleNonregression),expandedNaturalWins=expandedWins,verifiedExpandedNonregressionDescriptive=bool(expandedNonregression),preservation=preserved,independentEvaluation=False,artifacts=artifacts,excludedRuntimeCaches=['chrome-profile-*','__pycache__'],currentStatusSha256=sha(current)))
print(json.dumps(dict(status=status,artifacts=len(artifacts),qualityGatesPassed=quality),ensure_ascii=False))
