"""从实际收据生成交付；缺少必需步骤时拒绝宣布完成。"""
from pathlib import Path
from datetime import datetime,timezone
import difflib,hashlib,json,subprocess,sys
from numeric_receipt_valid import numeric_receipt_valid
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
def read(n):return json.loads((HERE/n).read_text(encoding='utf-8-sig'))
def save(n,v):(HERE/n).write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
    return h.hexdigest()
def yes(v):return '通过' if v else '未通过'
def pct(v):return f'{100*v:.2f}%'

required=['pipeline-full-exit.json','data-audit.json','expert-summary.json','final-value-evaluation.json','final-battle-summary.json','teacher-battle-summary.json','final-speed.json','checks.json','base-policy-training.json','distill-policy-training.json','base-calibration-result.json','distill-calibration-result.json','numeric-best.json','browser-best.json','search-scale/teacher-calibration.json','search-scale/final-calibration.json','rank-score-final-gate.json','productive-red-green-gate.json','fresh-search-calibration-gate.json','army-risk-red-green-gate.json','deployment-red-green-gate.json','deployment-real-witness-gate.json']
required+=['commander-health-red-green-gate.json','veto-objective-red-green-gate.json']
required+=['proposal-reuse-gate.json','browser-proposal.json','numeric-proposal.json']
required+=['root-capacity-red-green-gate.json','search-capacity-speed-gate.json']
required+=['value-continuation-games-gate.json','value-continuation-pack-gate.json','value-continuation-adoption.json','revisions/r21/performance-consistency-gate.json','revisions/r21/safe-completion-red-green-gate.json']
missing=[n for n in required if not (HERE/n).exists()]
if missing:raise RuntimeError('仍有必需工作未完成，拒绝交付：'+','.join(missing))
pipeline=read('pipeline-full-exit.json');data=read('data-audit.json');expert=read('expert-summary.json');value=read('final-value-evaluation.json');battles=read('final-battle-summary.json');teacher=read('teacher-battle-summary.json');speed=read('final-speed.json');checks=read('checks.json')
base=read('base-policy-training.json');distill=read('distill-policy-training.json');calibration=read('distill-calibration-result.json')
policyDev=(calibration['selected'] or dict(metrics=calibration['uncalibrated']))['metrics']
numerical={n:{k:read(f'{k}-{n}.json') for k in ['numeric','browser']} for n in ['initial','teacher','proposal','best']}
assert all(numeric_receipt_valid(HERE,n) for n in numerical),'存在数值输入、模型或Python参考已经失配的浏览器收据'
allRuns=[]
for folder in [*HERE.glob('*battles/slots'),HERE/'expert-games',HERE/'value-continuations/slots']:
    if not folder.exists():continue
    count=total=unique=0
    for resultPath in folder.glob('*/result.json'):
        result=json.loads(resultPath.read_text());strict=json.loads((resultPath.parent/'strict-replay.json').read_text())
        assert strict['passed'] and strict['actions']==result['actions'],'存在未完成strict的已提交轨迹'
        count+=1;total+=result['actions'];unique+=0 if (resultPath.parent/'reused-evidence.json').exists() else result['actions']
    allRuns.append(dict(folder=folder.relative_to(HERE).as_posix(),slots=count,strictActions=total,uniqueSubmittedActions=unique))
    partialActions=partialSlots=0
    for raw in folder.glob('*/actions.jsonl'):
        if raw.with_name('result.json').exists():continue
        receipt=raw.with_name('strict-prefix-replay.json');assert receipt.exists(),'中断原始动作必须独立strict，不得因缺result而漏记'
        r=json.loads(receipt.read_text());assert r['passed'] and r['classification']=='user_interrupted_prefix' and sha(raw)==r['rawLogSha256']
        partialActions+=r['actions'];partialSlots+=1
    if partialSlots:allRuns.append(dict(folder=folder.relative_to(HERE).as_posix(),scope='user_interrupted_prefixes',slots=partialSlots,strictActions=partialActions,uniqueSubmittedActions=partialActions))
public=all(r['passed'] for r in checks if r['name'] in ['public-lint','public-test','public-build','stage5-typecheck'])
assert sum(r['name'] in ['public-lint','public-test','public-build','stage5-typecheck'] for r in checks)==4
passed=bool(pipeline.get('readyForDelivery') and data['passed'] and expert['passed'] and value['passed'] and battles['gates']['passed'] and teacher['gates']['passed'] and speed['passed'] and public and calibration['passed'] and all(r['passed'] for v in numerical.values() for r in v.values()))
assert passed,'全部原定验收未通过，禁止生成完成交付或结束本任务'
searchBudget=read(read('ACTIVE_SEARCH_PROTOCOL.json')['path']).get('searchBudget',dict(topK=6,maxFollowNodes=24,maximumOwnNodes=150))
identities=read('final-model-identities.json');finalSha=sha(HERE/'model-final.json');originalSha=sha(HERE.parent/'tactical_value_search_20261018/model-final.json')
assert read('proposal-reuse-gate.json')['passed'] and identities['proposal']['fileSha256']==sha(HERE/'base-policy-final.json')
searchScale={n:read(f'search-scale/{n}-calibration.json') for n in ['teacher','final']}
assert all(r['passed'] for r in searchScale.values()) and read('rank-score-final-gate.json')['passed']
assert searchScale['final']['modelSha256']==finalSha and searchScale['final']['configSha256']==sha(HERE/'search_prior_config.ts')
assert read('rank-score-final-gate.json')['modelSha256']==finalSha and read('rank-score-final-gate.json')['priorWeight']==searchScale['final']['selected']['priorWeight']
assert all(read(n)['passed'] for n in ['productive-red-green-gate.json','fresh-search-calibration-gate.json','army-risk-red-green-gate.json','deployment-red-green-gate.json','deployment-real-witness-gate.json'])
assert read('commander-health-red-green-gate.json')['passed']
assert read('veto-objective-red-green-gate.json')['passed']
assert read('root-capacity-red-green-gate.json')['passed'] and read('root-capacity-red-green-gate.json')['currentSha256']==sha(HERE/'model_battle_search_ai.ts')
coreSha=sha(HERE/'model_battle_search_ai.ts')
assert all(read(n)['currentSha256']==coreSha for n in ['productive-red-green-gate.json','army-risk-red-green-gate.json','deployment-red-green-gate.json','commander-health-red-green-gate.json','veto-objective-red-green-gate.json']),'守卫回归不属于当前搜索源码'
assert read('fresh-search-calibration-gate.json')['coreSha256']==coreSha
assert read('fresh-search-calibration-gate.json')['calibrationSha256']==sha(HERE/'search-scale/teacher-calibration.json')
stoppedAttempts=[]
for p in sorted(HERE.glob('teacher-r*-stopped-summary.json')):
    r=read(p.name);revision=p.name.split('-')[1];stoppedAttempts.append(dict(revision=revision,plannedSlots=150,completedSlots=r['completedSlots'],strictActions=r['strictActions'],qualified=False,summary=p.name,sourceFreeze='revisions/r1/source-freeze-teacher.json' if revision=='r1' else f'source-freeze-teacher-{revision}.json'))
activeTeacher=read('ACTIVE_TEACHER.json') if (HERE/'ACTIVE_TEACHER.json').exists() else dict(revision='initial')
assert all(read(n)['passed'] for n in ['value-continuation-games-gate.json','value-continuation-pack-gate.json','value-continuation-adoption.json','revisions/r21/performance-consistency-gate.json'])
activeCompletionGate=f'revisions/{activeTeacher["revision"]}/safe-completion-red-green-gate.json'
assert (HERE/activeCompletionGate).exists() and read(activeCompletionGate)['passed'] and read(activeCompletionGate)['coreSha256']==coreSha,'安全完结回归未绑定当前合格教师源码'
activeDeploymentCompletionGate=f'revisions/{activeTeacher["revision"]}/deployment-completion-final-red-green-gate.json'
if (HERE/'deployment_recovery.ts').exists():
    assert (HERE/activeDeploymentCompletionGate).exists(),'部署安全完结回归缺失'
    deploymentCompletion=read(activeDeploymentCompletionGate)
    assert deploymentCompletion['passed'] and deploymentCompletion['coreSha256']==coreSha and deploymentCompletion['recoverySha256']==sha(HERE/'deployment_recovery.ts')
activeRecruitmentCoverageGate=f'revisions/{activeTeacher["revision"]}/safe-recruitment-coverage-red-green-gate.json'
if (HERE/'safe_recruitment_coverage.ts').exists():
    assert (HERE/activeRecruitmentCoverageGate).exists(),'安全招募覆盖回归缺失'
    coverage=read(activeRecruitmentCoverageGate)
    assert coverage['passed'] and coverage['coreSha256']==coreSha and coverage['coverageSha256']==sha(HERE/'safe_recruitment_coverage.ts')
activeTop16CapacityGate=f'revisions/{activeTeacher["revision"]}/top16-capacity-red-green-gate.json'
if searchBudget['topK']>=16:
    assert (HERE/activeTop16CapacityGate).exists(),'Top16容量回归缺失'
    capacity=read(activeTop16CapacityGate)
    assert capacity['passed'] and capacity['coreSha256']==coreSha and capacity['budgetSha256']==sha(HERE/'search_budget.ts') and capacity['originalTwelvePreserved']
continuation=dict(games=read('value-continuation-games-gate.json'),pack=read('value-continuation-pack-gate.json'),adoption=read('value-continuation-adoption.json'),scope='40局普通纯策略自然结局只改善教师Value；与合格搜索教师40局专家采样严格分开，未计为专家策略样本')
failedFullAttempts=[]
for p in sorted(HERE.glob('teacher-r*-battle-summary.json')):
    r=read(p.name)
    if not r['gates']['passed']:
        failedFullAttempts.append(dict(revision=r['phase'].removeprefix('teacher-'),summary=p.name,completedSlots=r['gates']['slots'],strictActions=r['gates']['strictActions'],gates=r['gates'],panels=r['panels'],qualified=False))
rejectedSpeedMeasurements=[dict(artifact=p.relative_to(HERE).as_posix(),measurement=read(p.relative_to(HERE).as_posix())) for p in sorted((HERE/'revisions').rglob('speed-attempt*.json'))]
assert originalSha=='e93a212f07fa7a91348c4e7311dc93f2ece4d3b8ea14d559d40a4d3cbe4f6421'
now=datetime.now(timezone.utc).isoformat();model=read('model-final.json')
frozen=read('source-freeze-final.json')['files']
assert all(sha(ROOT/name)==r['sha256'] for name,r in frozen.items()),'最终源码与实战冻结身份不同'
reused=list((HERE/'battles/slots').glob('*/reused-evidence.json'))
lines=['# 阶段5：极速状态Value、同单位战术搜索与专家纠错','',f'整体验收：{yes(passed)}。本报告由实际模型、训练记录、三端门禁和逐槽strict收据生成，时间{now}。',
    '',f'900父局完整覆盖：720训练/180开发，241,287/61,040条非平凡原子，共{data["rows"]:,}条。保留阶段4纯策略作教师的策略基座，40局教师在线纠错后微调1轮，再训练独立Value。未进行应用接入，手机/ADB操作0。',
    '', '## 四项修复与边界','',
    '- Value为297维（260实体池化+36当前状态摘要+1军力差）。当前指挥官位置各最多一次三军集火，不执行全量未来候选再取最大风险。全局招募/免费攻击标志使用静态合法查询；免费攻击只对当前攻击做即时权威见证核验，相关次数另记，不能把它说成完全没有引擎step。',
    f'- 根部一次主策略前向、至多一次共享根编码的提议前向，最多{searchBudget["topK"]}个根候选，每根最多{searchBudget["maxFollowNodes"]}个同单位后续节点、己方总节点上限{searchBudget["maximumOwnNodes"]}。致死的贪心后续最多补查两个已经执行的完整叶子，不增加己方step或分支infer。支持突击二次移动，己方叶子保留未动队友；风控的对手回合投影单独克隆。未完成连动不用于接管或队列。',
    '- 战斗净损按权威军力损失差；新兵增值不能当战斗收益，招募金币成本完整扣除，治疗单列，城堡和村庄的归属/地形变化对称记账。Veto依据可重放致死见证，Takeover依据真实招募、占领、击杀、无反击净伤和战术净差。',
    '- 保存基线仅含立项时实际存在9,925文件，约22GB；不再把立项前已清理80个临时pkl列为缺失。6处公共提速修改及CURRENT的原文逐字节保留。',
    '', '风险模型采用至多三军贪心顺序的真实可执行见证，不能证明不存在其他更优对手攻击。pending锁阻止合法回合切换时编码unknown，不能把未知当作已知安全。普通/专家样本不具备自然终局证据的Value标签均屏蔽。',
    'R3首次230次Value测量最大5.4478ms，门禁失败且未启动对战。随后将嵌入缓存的重复JSON内容键改为只读token身份WeakMap，不缓存最终Value；独立TS和真实Chrome冷/热路径误差低于1e-15，原测量和源码保留于revisions/r3。修改后重新测速通过，未通过的测量见清单rejectedSpeedMeasurements。',
    '', '第一版阶段5搜索存在额外的默认保底错误：未触发Veto/Takeover也提交模拟plan，导致普通空城新兵被wait覆盖真实移动。R1停止新增在76槽，49,865动作及67,698风险见证动作全部strict，原件和不利战绩保留于TEACHER_R1_STOPPED.md。R2修复默认队列，但固定30槽仅20胜，低于阶段3的22胜和纯策略24胜，停止后106槽/64,614动作strict。R3进一步保护新兵未展开的合法部署、禁止普通接管降低确定的战斗净值，并要求Veto复核原受威胁单位；三项相同回归在R2按预期失败、R3通过。模型权重、评分系数和候选预算未变。',
    'R3完整150槽亦未过：固定搜索24胜、纯策略24胜；扩展搜索10胜，阶段3/纯策略13/12胜，搜索扩展p95约975ms、墙钟截断1。87,985实际动作及208,219反扑见证动作全部strict。它没有被用作专家教师，原始完整失败面板保留，不伪造成部分停止。',
    'R4修复普通移动时漏覆盖敌城堡/敌指挥官关键事件候选的问题，同一合法夺堡用例在R3失败、R4通过。另以CPU证据定位招募价格查询的完整规则复制，改为保留自有可枚举语义的直接读取；40,280项价格/招募检查通过。定向合法动作缓存与推理未使用数组分配优化有独立等价证明。单军后效分组作为离线提案保留，未接入运行搜索器；运行仍用原风险算法及权威见证。',
    'R4完整150槽仍失败：固定24胜与pure持平，扩展10胜、p95=771.8ms、墙钟截断1；89,478动作及210,190反扑见证动作strict。R5进一步区分当前原位已有的指挥官危险与默认动作新造成的危险；真正换手、行动指挥官危险完结、即时指挥官损失和高价值actor守卫保留。原位比较也保存并strict重放见证，未进行跨队友搜索或强行结束己方回合。',
    'R5将合法动作的通用深复制换为保持位置别名和外部隔离的专用复制，内部只读换手检查省去对外列表复制。41状态/8066查询/1241步和全部15种动作通过；六慢帧完整编码、网络输出和先验逐项相同。深冻结与内部借用快照两种试验都没有可用的性能收益，已从运行路径撤出，源码和不利测量全部保留。公共getState隔离语义未变。',
    'R5在89槽停止新增，58,123实际动作全部strict；固定搜索已结束29槽、22胜，剩余1槽即使获胜也低于pure的24胜。归因延后规则漏掉了行动者自身的防守机会：合法弓手防守反例在R5失败、R6通过。R6仅复用已展开的同actor完整防守连动，消耗该行动机会时保留Veto；原无害远端行动仍不提前调走队友。未改参数、评分系数和预算。',
    'R6完整150槽仍因扩展质量失败：固定24/30胜、扩展10/20胜，阶段3/纯策略扩展13/12胜；扩展p95=526.7ms、决策超时及墙钟超时均0。89,782实际动作及222,578反扑见证动作strict。性能达到硬门禁不等于棋力合格，因此该版本未用于专家采样。',
    'R7修复同根移动的贪心后续风险污染：初选攻击若致死，复用候选枚举已经执行的原位完结分支，只有完整、指挥官与行动者均已知非致死且叶子分更高时改用它。不增加己方执行节点或分支策略前向；额外Value与风险评估成本由新面板实测。被拒绝的攻击连动和反扑见证保存在finishRecovery中并strict。50HP人鱼/70HP黑魔法师反例在R6失败、R7通过；R6实际日志第668步也有同类见证，详见finish-real-witness-gate.json。',
    'R7完整150槽仍质量失败：固定24/30胜、扩展10/20胜，89,791实际动作及218,994反扑见证strict。搜索p95固定264.6ms/扩展484.2ms，决策及墙钟超时0，不能因性能通过而用于教师采样。',
    'R8发现联合路径概率与主策略分层解码的跨组排序不一致：23个状态中4例的两种首选不同。搜索改用组logit相对全局最佳组、动作logit相对本组最佳动作的置信分，避免组内归一化常数额外改变组优先级。旧联合概率保留作诊断，纯策略输入、网络输出与argmax逐项相同，101候选构造和23状态在旧实现红/新实现绿。没有把置信分加入叶子战损，没有新增拟合系数。诊断探针中的类型分支首次检查失败，修复及受影响检查重跑通过，原失败收据保留。',
    'R8在固定质量门槛已不可能达到时停止新增，所有在途正常结束，87个实际槽位、54,237实际动作strict。未运行槽不补齐胜负，完整停止记录保留。R9进一步按原生训练/开发policy标签标定安全备选排序尺度，不用失败教师的自走轨迹训练。rankScore独立于叶子score；自然获胜、指挥官斩杀、敌堡、收尾事件和Veto原资格守卫不放宽。',
    'R9固定仅22/30胜，停止新增后118槽、69,948实际动作strict；离线排序指标改善没有被写成对战通过。R10发现安全有效默认同单位后续仅估值却未提交的问题：R9实际第67步按招募弓手后射击估值，下一步实际却移走弓手。新实现只落实完整、已知非致死、有非wait后续和真实收益的默认计划，无收益wait和未展开新兵移动保护保留。23状态根动作及叶子分相同、7处计划实际落实；1557前态全候选矩阵精确一致后沿用0.8，没有按战绩重选系数。strict另复算提交计划的收益、存活、单位完成状态及风险见证。',
    'R10固定22/30胜，停止新增后114槽、67,442实际动作strict，未用于专家。R11修复即时阵亡既进入军力净损又额外固定扣分的重复成本：只有存活单位的未来致死风险再按当前军力折算；高价值分类使用行动前现存军力，指挥官始终显式保护。36HP三级幽灵攻击满血狼后自身阵亡的权威引擎反例中，敌军军力损失150、己方损失73，正净战值77，敌狼未被击杀，旧固定惩罚将其错误压成负分；五项红绿回归记录完整。旧安全候选矩阵复用尝试失败并保留，重新采集1557前态及47962反扑见证、刷新全部已消费前态索引，再按原固定规则重拟合，仍选0.8，不冒充候选矩阵未变。',
    'R11在89槽停止新增，56,681实际动作及105,031反扑见证全部strict；固定搜索29槽22胜，剩余全胜仍低于pure24胜。R12补齐空城新兵的部署移动与完结：只为权威合法动作排序，最多4个有即时机会的落点与原地有效攻击，全部实际步骤仍在24后续节点预算内；没有安全有效完整部署时明确未完成、按真实招募后状态估值，不能把未提交wait后的状态当叶子。旧R11的第2步招募士兵有实际前缀及两种状态SHA证明。部署占村、部署延后真实性、部署攻击后突击移动旧红新绿；原地攻击两版通过。重新采集1557前态及47976反扑见证后按同协议重拟合，不复用旧候选曲线。',
    'R12仍质量失败，在87槽停止新增，53,115实际动作全部strict；固定搜索29槽22胜，剩余全胜仍低于pure24胜。真实第57/56步Veto为保护250军力弓手，改选了会承受84/90点集火的指挥官前移，默认分支指挥官仅受0/9伤害。R13增加逐指挥官的见证后剩余HP不退化条件，保留原高价值保护和已知失败局面救回指挥官；仅复用已有风险，不增加反扑搜索或评分系数。两个真实帧旧红新绿，重新采集1557根及47874反扑见证，四路候选输入与叶子记录逐字节相同；已消费日志排重刷新为1366份/831061动作，按原条件NLL规则仍选0.8。',
    'R13固定23/30胜低于pure24胜，停止后100槽/59,751动作strict；扩展只运行3个搜索槽，不能补齐完整面板。R14优先选择满足原有全部安全、净收益和指挥官健康门槛的原actor完整Veto方案，避免先消耗队友行动后重复处理原单位危险；没有同单位解才考虑其他单位。两个实际帧旧红新绿，实际重放弓手完结而指挥官仍未行动。1557前态/47651见证重新采集，候选输入和叶子记录与R13逐字节相同，刷新1466份日志/890812动作排重后按原规则仍选0.8，既有系数与预算未变。',
    'R14固定22/30胜，未获资格；停止后90槽/55,730实际动作strict。绝对同actor优先作为未采纳策略保留，不属于当前规范。R15在新评测前登记search_scale_protocol_v2：Veto已明确策略首选致死时，备选按真实战损、建筑、风险及Value组成的原叶子分排序，只有同分才优先原actor；普通收益接管仍按原网格校准策略融合系数。原风险、指挥官健康、原受威胁单位及净收益守卫不放宽。两个实际帧旧R14红、新版绿，普通融合系数改为1.6也不改变Veto选择；此处只证明排序目标一致性，不预设棋力增益。v1协议与所有失败资料保留，v2拟合明确区分固定Veto域与普通域，不能把不同协议的NLL当作同一曲线提升。',
    f'本次合格教师版本为{activeTeacher["revision"]}，来自重新完整资格验收；失败版本均不采样。完整停止记录见各TEACHER_*_STOPPED.md及清单stoppedAttempts，完整未通过版本见failedFullAttempts，不用未运行槽补齐胜率。',
    '', '## 训练、谱系与校准','',
    f'全量策略训练{base["epochs"]}轮、{base["steps"]:,}次更新，随后专家蒸馏{distill["epochs"]}轮、{distill["steps"]:,}次更新；PC PyTorch {distill["torch"]}，float64，batch32，真实尾批7。阶段4赢家1.5权重沿用，专家纠错2.0、普通轨迹0.5。开发NLL选择轮次和五类增量组偏置，不按实战胜负反选。',
    f'搜索教师40局，与HeuristicAI/ApkLikeAI各20局，来自训练父局合法前缀。打包{expert["rows"]:,}条、纠错{expert["correctionRows"]:,}条，strict {expert["strictActions"]:,}动作；过滤{expert["excludedDevDuplicates"]}条与开发模型输入表示相同的轨迹，另排除{expert["excludedEvalStateHashes"]}条冻结评测实际状态hash重复项，最终实测交集均为0。仅用评测输入身份排重，不导入评测动作/胜负监督。谱系见expert-roots.json、expert-summary.json和原始samples/actions记录。',
    f'最终组校准：{yes(calibration["passed"])}。详细整数分母与所有候选见distill-calibration-result.json/candidates.json；不能把开发top1等同于棋力。',
    f'完整180父局开发{policyDev["rows"]:,}条：top1={pct(policyDev["top1"])}，groupTop1={pct(policyDev["groupTop1"])}，漏招募{policyDev["endWithRecruit"]}次，有机会却wait {policyDev["waitWithOpportunity"]}次，攻击{policyDev["attackTaken"]}/{policyDev["attackOpportunity"]}。与阶段4的120父局分母不同，不能直接把这两组百分比归为同集提升。',
    '', f'搜索排序校准固定选择900父局，867父局取得1,557个合法前态，259,433前缀动作strict；所有已消费资格输入只提取beforeHash作排重。教师条件子集实际{searchScale["teacher"]["selected"]["train"]["rows"]}训练行/{searchScale["teacher"]["selected"]["train"]["parents"]}父局、{searchScale["teacher"]["selected"]["validation"]["rows"]}开发行/{searchScale["teacher"]["selected"]["validation"]["parents"]}父局，原标签须被至少两个完整已知非致死候选覆盖；其余覆盖失败与重复输入均另存，不把条件指标当作完整开发集指标。系数候选预先固定，按开发NLL和top1不降选择，不用实战胜负反选。最终模型在同一根池独立校准，零系数也如实保留。',
    '', '|搜索配置|系数|条件开发行/父局|原NLL→选择后NLL|原top1→选择后top1|','|---|---|---|---|---|',
    *[f'|{n}|{r["selected"]["priorWeight"]}|{r["selected"]["validation"]["rows"]}/{r["selected"]["validation"]["parents"]}|{r["baseline"]["validation"]["nll"]:.6f}→{r["selected"]["validation"]["nll"]:.6f}|{pct(r["baseline"]["validation"]["top1"])}→{pct(r["selected"]["validation"]["top1"])}|' for n,r in searchScale.items()],
    '', '## 最终Value开发指标','',
    '|阶段|开发行/父局|ROC-AUC|Brier|MSE|','|---|---|---|---|---|']
for name in ['all','opening','middle','late']:
    m=value['metrics'][name];lines.append(f'|{name}|{m["rows"]:,}/{m["parents"]}|{m["rocAuc"]:.6f}|{m["brier"]:.6f}|{m["mse"]:.6f}|')
lines+=['', '六种静态/可学习基线和所有校准候选均在final-value-evaluation.json；可信标签父局只是900父局中的自然终局子集，不能把全部900父局都报成有胜负监督。','', '## 数值与速度','', '|模型|TS前向/梯度最大误差|真实Chrome前向/梯度最大误差|argmax|','|---|---|---|---|']
for n,v in numerical.items():
    a,b=v['numeric'],v['browser'];lines.append(f'|{n}|{a["maxForwardError"]:.3g}/{a["maxGradientError"]:.3g}|{b["maxForwardError"]:.3g}/{b["maxGradientError"]:.3g}|{yes(a["argmax"] and b["argmax"])}|')
q=speed['latency'];lines+=['', 'Value独立训练冻结策略实体池化上下文，数值门禁按相同stop-gradient语义检查所有参数，包括冻结块的零梯度。原数据尾批7及专家实际尾批均在最终检查中覆盖。',f'最终evaluateValue独立230次、23状态，p50/p95/p99/max={q["p50"]:.3f}/{q["p95"]:.3f}/{q["p99"]:.3f}/{q["max"]:.3f}ms；解释器先预热4轮，计时每次重编码状态，不缓存最终Value。每指挥官focus最多{speed["maxFocusCallsPerCommander"]}次。独立探针不能证明所有实战状态的最坏耗时；初始混合探针曾有GC尾延迟，原始probe-gate.json保留。','', '## 同面板四臂配对实战','', '|面板|模型|自然胜/全部槽|自然胜率|分类|p50/p95/p99 ms|','|---|---|---|---|---|---|']
reuseEvidence=HERE/'revisions/r7/reused-browser-numeric-evidence.json'
if reuseEvidence.exists():
    lines.insert(lines.index('## 同面板四臂配对实战')-1,'R7至R17部分冗余Chrome复核请求因自动审批服务容量错误未执行。对应未变的数值程序、数据和权重按SHA复核后复用R6实际收据，各revision分别保留复用证明，不称新执行。R18以后以源码绑定的实际执行收据为准，其中R21初始、教师、提议三模型均新执行Chrome；最终蒸馏模型有独立真实Chrome验收，不能复用教师数值。')
for panel,arms in battles['panels'].items():
    for arm,r in arms.items():
        q=r['latency'];lines.append(f'|{panel}|{arm}|{r["naturalWins"]}/{r["slots"]}|{pct(r["naturalWinRate"])}|{json.dumps(r["classifications"],ensure_ascii=False)}|{q["p50"]:.1f}/{q["p95"]:.1f}/{q["p99"]:.1f}|')
lines+=['',f'最终200槽、{battles["gates"]["strictActions"]:,}动作全部strict重放，其中{len(reused)}个冻结基线槽来自教师资格观测，最终重新strict；复用不算独立重复试验。教师资格共150槽，所有原件及失败/中断现场保留。各对手、配对收入差、第10轮到达局数、漏招募/结束回合整数分母、集火致死/已知移动分母详见BATTLES.md和final-battle-summary.json。自然胜率分母包含全部槽，不把任何截断算胜。集火致死率为动作后反事实见证，不能当实际阵亡率。',
    '', '阶段4pure保留原模型字节和分层解码，采用已验证151列等价的新编码实现，并移除不会改变策略选择的旧Value隐式前向；属于同权重提速基线。各阶段都使用当前同一权威引擎。固定地图、扩展开发前缀和原开发数据均已消费，所有战绩为配对开发诊断，不称独立泛化。','', '## 回归、公共检查与保全','',
    '24局7,200步/576克隆/7,200 mask与立项前引擎状态和收益字节一致；3,313移动成本及2,922伤害旧值完全一致；73状态4,574候选的151列float32与原编码一致。自杀候选不污染原位风险、队友保持行动、招募后阵亡完整成本、村/堡及摧毁村庄、突击后移动、双军集火见证均有可复现回归。',
    '', '|检查|结果|日志|','|---|---|---|']
for r in checks:lines.append(f'|{r["name"]}|{yes(r["passed"])}（退出码{r["code"]}）|{r["log"]}|')
lines+=['', '训练工作区总检查历史失败单独披露，不能用阶段5独立检查或公共检查替代。APK原始资源检查如本机缺解包目录不能记通过。保全逐文件结果见preservation-check.json，授权改动的before/after与原文副本均列出。','', '## 复现入口','',
    '所有训练和评测从仓库根目录经node ai_training/run.mjs启动；Python使用清单记录的实际解释器。preregister.json、seed-contract.json、contract.json、各轮checkpoint、源码冻结和逐槽actions为完整复现依据。重跑应使用新目录保留本次收据，不能覆盖失败。',
    '', f'最终模型SHA-256：`{finalSha}`。模型和全部交付文件身份见DELIVERY_MANIFEST.json。']
(HERE/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
with (HERE/'REPORT.md').open('a',encoding='utf-8') as f:f.write('\n## 共享根编码提议与统计补充\n\n主教师策略仍与阶段4逐字节同权重及组偏置。独立扩量基础策略只复用同一个根编码，增加至多一次根前向；只在其分层首选未被原Top6覆盖时提议，不继续补低排名动作。R16为Top6/24/150；R17起原六根完整保留，再补至Top12/24/300，全部安全守卫保持，分支策略前向0。提议模型本身另有真实Chrome三端前向和全参数梯度收据，模型、源码、权重身份同时绑定到教师与最终清单。v3强行寻找外部动作的方案在前置回归中被否决，未进入实战；原候选与校准原件保留，v4限定首选后重采校准。\n\nBATTLES.md另列实际同敌方回合多攻击者死亡、自动/显式换手前的可招募机会关闭率、排除已验证队列的根决策p95。它们分别是实际轨迹死亡、机会代理和根决策时延，不能与反事实致死风险、确定漏招募错误或全步时延混用。所有新增统计单独权威重放，并绑定原动作日志及strict收据，未改写原对局结果。\n')

with (HERE/'REPORT.md').open('a',encoding='utf-8') as f:
    f.write('\n## 缓存复核、普通Value续弈与安全完结修复\n\nR18完成73状态/4574候选151列、809风险查询、864见证及三端验收；其完整150槽82867动作及332804风险见证全部strict，但扩展搜索p95=718.7473ms、自然胜12/20，未合格。R19共享单军/集火移动查询的1557根及98497风险见证完全相同，三端新执行通过；该性能分支未单独宣称完整资格通过。R20只改变Value，完整150槽85104动作及348103风险见证strict，扩展11胜8负1墙钟截断、p95=702.1ms，同样未用于专家采样。全部失败原件纳入清单。\n\n40局普通纯策略Value续弈有25646动作strict、37个自然二元终局和3个动作截断；排重后2007训练/463辅助留出样本，后者仅7父局且开局AUC约.827。它只改善教师Value，不能冒充合格搜索专家或独立泛化证据。其数据谱系和选模原件在value-continuation-*，最终清单ordinaryValueContinuations单列。\n\nR21纯性能分支在1557根/15921候选/98497风险见证上与R20完整一致。当前状态编码和风险保持原值，普通move子集、同源就绪计数、标量读取、事件独立复制、已有快照复用及带淘汰代数的路径几何共享只省去无关工作。独立安全修复对已枚举的同actor完结最多补查两个完整叶子；实际641步反例与全部守卫红绿通过，根Veto/Takeover方法逐字相同。重采88个候选换成更高且安全的物理叶子，15833候选不变；原输入/先验/覆盖一致，条件开发分母变为74行，原网格仍选0.8。是否合格以最终ACTIVE_TEACHER及150槽完整gate为准，单进程提速与离线更高叶子均不当作胜率证明。完整历史见WORKLOG.md和failedFullAttempts。\n')
with (HERE/'REPORT.md').open('a',encoding='utf-8') as f:
    f.write('\nR21曾由用户停止在135完整局、4中断前缀及11未开始槽。恢复时先完成82278实际动作及340199风险见证strict；独立恢复批次保留135局全部结果和计时，从原初态重跑其余15槽，4343个中断共同动作的状态、网络输出及随机流完全一致。完整150槽84327动作及346475风险见证strict，扩展搜索p95=509.0254ms、根527.3470ms、两类超时0，但11/20胜低于阶段3和pure，仍不合格。135局副本不重复算作独立提交，4中断前缀另列strict并纳入全部评测输入排重。\n\nR22补查空城部署内部实际已经执行的分支，发现圣骑移动后治疗指挥官的安全方案被即时贪心攻击丢弃；真实第40步旧红/新绿。每根最多补查两个已有完整叶子，己方节点与根守卫不变；1557根中15920候选相同，仅1个部署物理叶子改善。三模型三端全部新执行通过，首次受限Chrome crashpad失败保留，正常Windows进程权限重试后通过。R22及后续资格只按完整面板原门禁判断。\n')
with (HERE/'REPORT.md').open('a',encoding='utf-8') as f:
    f.write('\nR22完整150槽83989实际动作及342894风险见证strict；扩展全步p95=415.2032ms、根427.6001ms且两类超时0，但12/20胜仍低于阶段3的13胜。部署反例一槽从负转胜，不能代替全量资格。突击完结诊断71根/329备选无安全改善，零发现原件保留。根覆盖诊断发现默认wait时原池仅覆盖致死美人鱼、池外弓手可合法完成安全正收益连动。R23事先登记仅在原池无安全生产性空城招募时，按已有根特征补入一个最高原先验候选，替换最后容量补充根；原六根、Top12/24/300、全部Veto/Takeover守卫与网络前向次数保持。1557根中142根覆盖变化，共同15779候选物理字段精确相同；原74行条件开发仍选0.8。各轮完整资格结论均以其原始gate为准。\n')
with (HERE/'REPORT.md').open('a',encoding='utf-8') as f:
    f.write('\nR23完整150槽84950实际动作及329084风险见证strict，扩展搜索13/20胜、p95=426.4993ms、根445.7018ms，两类超时0，但固定23/30低于pure24/30。弓手反例所在槽由负转胜，另一个固定槽由胜转负；诊断确认女巫招募连动确实合法、安全且叶子更高，原池也没有已有安全招募，因此否定了先前猜测，不按单局胜负屏蔽合法动作。R24事先登记单一Top16/24/400方案，胜率、四进程600ms、零超时及单进程500ms准入门槛保持；1557根全部原15921候选保留且物理字段精确相同，新增5307候选及9触发，原Top12全部保留。默认Top16有独立容量红绿；原Top12招募覆盖组件保留显式Top12回归。新条件开发78行/65父局，仍选0.8，分母变化不与此前74行直接比较。资格以实际完整gate为准。\n')

# 仅替换本阶段块，保留当前其余字节，包括其他工作后来追加的内容。
current=(ROOT/'ai_training/status/CURRENT.md').read_bytes();start=current.index(b'<!-- tactical-exit-20261019 -->');end=current.index(b'<!-- end-tactical-exit-20261019 -->')+len(b'<!-- end-tactical-exit-20261019 -->');previousBlock=current[start:end];nl=b'\r\n' if b'\r\n' in previousBlock else b'\n'
status='验收通过' if passed else '仍有未通过门禁，不晋升'
block=f'''<!-- tactical-exit-20261019 -->
## 2026-10-19 阶段5：极速Value、同单位搜索与专家纠错（{status}）

见[报告](../tactical_exit_20261019/REPORT.md)、[实战](../tactical_exit_20261019/BATTLES.md)、[交付清单](../tactical_exit_20261019/DELIVERY_MANIFEST.json)。完整720/180父局，241,287/61,040原子；40局搜索教师纠错{expert['correctionRows']:,}条，蒸馏1轮。297维纯状态Value，Top{searchBudget['topK']}同单位完整连动，无分支策略前向，不跳过未动队友。最终200槽/{battles['gates']['strictActions']:,}动作strict，复用基线{len(reused)}槽明确登记并重放。初始/教师/最终三端前向及全参数梯度通过，约1e-14、argmax一致。Value独立p95={speed['latency']['p95']:.3f}ms，实战胜率/截断/尾时延详见报告，整体门禁{yes(passed)}。公共及训练检查各自留存；历史文件不删，原有CURRENT段落逐字节保留。已消费开发材料，不称独立泛化。没有应用接入，手机/ADB操作0。

<!-- end-tactical-exit-20261019 -->'''.replace('\n',nl.decode()).encode('utf-8')
(ROOT/'ai_training/status/CURRENT.md').write_bytes(current[:start]+block+current[end:])
assert (ROOT/'ai_training/status/CURRENT.md').read_bytes().replace(block,previousBlock,1)==current
subprocess.run(['node',str(ROOT/'ai_training/run.mjs'),sys.executable,'-X','utf8','tactical_exit_20261019/check_current_scope.py','current-outside-scope.json'],cwd=ROOT,check=True)
subprocess.run(['node',str(ROOT/'ai_training/run.mjs'),sys.executable,'-X','utf8','tactical_exit_20261019/preservation_check.py'],cwd=ROOT,check=True)
preserve=read('preservation-check.json');assert preserve['passed'],'保全复核未过，禁止交付'
diff=[]
for name in ['engine','map','rules','abilities','rule_config','campaign_events']:
    before=(HERE/f'public_before/{name}.ts.snapshot').read_text(encoding='utf-8').splitlines(keepends=True);after=(ROOT/f'src/game/{name}.ts').read_text(encoding='utf-8').splitlines(keepends=True)
    diff.extend(difflib.unified_diff(before,after,fromfile=f'立项前/src/game/{name}.ts',tofile=f'当前/src/game/{name}.ts'))
(HERE/'public-changes.diff').write_text(''.join(diff),encoding='utf-8')
with (HERE/'final-git-status.txt').open('wb') as out:subprocess.run(['git','status','--short'],cwd=ROOT,stdout=out,check=True)
save('TASK_STATE.json',dict(status='complete' if passed else 'acceptance_failed',complete=passed,experimentComplete=True,acceptancePassed=passed,report='REPORT.md',updatedAt=now))
with (HERE/'WORKLOG.md').open('a',encoding='utf-8') as f:f.write(f'\n## 交付收据 {now}\n\n整体门禁{yes(passed)}，最终200槽strict，40局专家和全量蒸馏完成，报告及SHA清单已生成；详细以REPORT.md和原始收据为准。\n')
excluded={'DELIVERY_MANIFEST.json','DELIVERY_MANIFEST.sha256'};files={};excludedPaths=[]
for p in sorted(HERE.rglob('*')):
    if not p.is_file():continue
    rel=p.relative_to(HERE).as_posix()
    if p.name in excluded or any(part.startswith('chrome-profile') or part=='__pycache__' for part in p.relative_to(HERE).parts):
        excludedPaths.append(rel);continue
    files[rel]=dict(bytes=p.stat().st_size,sha256=sha(p))
manifest=dict(version='tactical-exit-20261019-v1',generatedAt=now,experimentComplete=True,overallAcceptancePassed=passed,promotionRecommended=False,applicationIntegrated=False,
    scope=dict(trainParents=720,devParents=180,trainRows=241287,devRows=61040,teacherSlots=150,expertGames=40,expertRows=expert['rows'],expertCorrections=expert['correctionRows'],finalSlots=200,reusedBaselineSlots=len(reused),finalStrictActions=battles['gates']['strictActions'],independentEvaluation=False,phoneOperations=0),
    models=identities['models'],proposal=identities['proposal'],searchBudget=searchBudget,modelSha256=finalSha,stage4OriginalSha256=originalSha,modelTrainingPhases=model.get('trainingPhases'),
    gates=dict(data=data['passed'],teacher=teacher['gates'],final=battles['gates'],value=value['passed'],speed=speed['passed'],public=public,calibration=calibration['passed'],preservation=preserve['passed']),
    framework=dict(pytorch=distill['torch'],python=distill['python'],dtype='float64',policyFeatureDimensions=151,valueInputDimensions=297),
    stoppedAttempts=stoppedAttempts,failedFullAttempts=failedFullAttempts,activeTeacher=activeTeacher,ordinaryValueContinuations=continuation,safeCompletionRegression=dict(path=activeCompletionGate,sha256=sha(HERE/activeCompletionGate)),performanceConsistency=read('revisions/r21/performance-consistency-gate.json'),rejectedSpeedMeasurements=rejectedSpeedMeasurements,searchScaleCalibration={n:dict(path=f'search-scale/{n}-calibration.json',protocolPath=r.get('protocolPath','search_scale_protocol.json'),protocolVersion=r.get('protocolVersion','search-scale-v1'),protocolSha256=r['protocolSha256'],rankingModeCounts=r.get('rankingModeCounts'),fixedVetoPriorWeight=r.get('fixedVetoPriorWeight'),modelSha256=r['modelSha256'],selected=r['selected'],baseline=r['baseline'],roots=r['roots'],conditionalRows=r['conditionalRows'],inputSplitOverlap=r['inputSplitOverlap']) for n,r in searchScale.items()},
    allSubmittedActionsStrict=True,allRuns=allRuns,uniqueSubmittedActions=sum(r['uniqueSubmittedActions'] for r in allRuns),interruptedR21Evidence=read('revisions/r21/resume1/stopped-strict-gate.json'),deploymentCompletionRegression=dict(path=activeDeploymentCompletionGate,sha256=sha(HERE/activeDeploymentCompletionGate)) if (HERE/'deployment_recovery.ts').exists() else None,safeRecruitmentCoverageRegression=dict(path=activeRecruitmentCoverageGate,sha256=sha(HERE/activeRecruitmentCoverageGate)) if (HERE/'safe_recruitment_coverage.ts').exists() else None,top16CapacityRegression=dict(path=activeTop16CapacityGate,sha256=sha(HERE/activeTop16CapacityGate)) if searchBudget['topK']>=16 else None,runtime=read('runtime.json'),
    preservation=dict(baselineFiles=preserve['baselineFiles'],unchangedFiles=preserve['unchangedFiles'],authorizedChanges=preserve['authorizedChangesWithExactOriginal'],missing=preserve['missing'],unexpectedChanged=preserve['unexpectedChanged'],currentOutsideOwnedBlock=read('current-outside-scope.json')),
    publicAddedTests={n:dict(sha256=sha(ROOT/n),bytes=(ROOT/n).stat().st_size) for n in ['src/game/tests/legal_action_cache.test.ts','src/game/tests/combat_scalar_reads.test.ts','src/game/tests/recruit_cost_scalar_reads.test.ts','src/game/tests/ordinary_movement_query.test.ts']},
    inventoryScope='阶段5全部模型、数据、原始证据、源码快照、日志和报告；Chrome临时profile与Python字节缓存排除，清单本身以独立sha256文件验证',excludedPaths=excludedPaths,files=files)
save('DELIVERY_MANIFEST.json',manifest);(HERE/'DELIVERY_MANIFEST.sha256').write_text(sha(HERE/'DELIVERY_MANIFEST.json')+'  DELIVERY_MANIFEST.json\n',encoding='utf-8')
print(json.dumps(dict(passed=passed,files=len(files),modelSha256=finalSha),ensure_ascii=False))
