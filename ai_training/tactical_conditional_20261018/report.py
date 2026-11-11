"""汇总固定面板与训练收据；只在全部门禁完成后封存交付。"""
from collections import Counter
import hashlib
import json
from pathlib import Path
import time

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(name,value):
    (HERE/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
def sha(path):
    value=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(4*1024*1024),b''):value.update(block)
    return value.hexdigest()
def pct(value):return f'{value*100:.2f}%'
def table(headers,rows):
    return '\n'.join(['|'+'|'.join(headers)+'|','|'+'|'.join(['---']*len(headers))+'|']+['|'+'|'.join(str(x) for x in row)+'|' for row in rows])

assert read(HERE/'PIPELINE_STATE.json')['phase'] in ('等待最终报告','complete')
contract=read(HERE/'contract.json');comparison=read(HERE/'comparison.json');plan=read(HERE/'battle-plan.json')
for filename,digest in read(HERE/'PRESERVE.json').items():assert sha(filename)==digest,filename
for filename,digest in read(HERE/'TRAINING_SOURCE.json').items():assert sha(HERE/filename)==digest,filename
for filename,digest in contract['sourceBinding'].items():assert sha(HERE/filename)==digest,filename
for arm in ('initial','legacy','new','conditional','best'):
    gate=read(HERE/f'numeric-gate-{arm}.json')
    assert gate['passed'] and gate['decoderParity'] and gate['modelFileSha256']==sha(HERE/f'model-{arm}.json') and gate['inputFileSha256']==sha(HERE/'parity-inputs.json')
for arm in ('initial','best'):
    gate=read(HERE/f'browser-parity-{arm}.json')
    assert gate['passed'] and gate['decoderParity'] and gate['rawStateFeaturesRecomputed'] and gate['modelFileSha256']==sha(HERE/f'model-{arm}.json') and gate['inputFileSha256']==sha(HERE/'parity-inputs.json') and gate['stateFileSha256']==sha(HERE/'browser-states.json')
assert '364 passed' in (HERE/'public-tests-final.log').read_text(encoding='utf-8-sig')
assert 'built in' in (HERE/'public-build-final.log').read_text(encoding='utf-8-sig')
assert 'error TS' not in (HERE/'public-lint-final.log').read_text(encoding='utf-8-sig')
native=read(HERE/'native-probe-current.json')
assert native['engineSha256']==sha(ROOT/'src/game/engine.ts') and native['cases']==9 and native['mismatches']==native['redundantPostAttackMoves']==0
native_strict=read(HERE/'native-strict-current.json')
assert native_strict['engineSha256']==sha(ROOT/'src/game/engine.ts') and sum(r['atomicActions'] for r in native_strict['results'])==3542
real=read(HERE/'real-current.json')
assert real['totals']['passed']==3 and real['totals']['failed']==0 and not real['options']['forceExecuteReplayActions']
for item in real['items']:
    evidence=item['validation']['evidence']
    assert item['validation']['success'] and evidence['fullyConsumed'] and not evidence['validationBypassed']
    assert evidence['skippedCount']==evidence['replacedCount']==evidence['ambiguousCount']==0
slots=[]
baseline_content_hash=read(next((HERE/'baseline-offline').glob('*.receipt.json')))['modelSha256']
for slot in plan['slots']:
    prefix=HERE/f"battles/slots/{slot['id']}"
    result=read(prefix/'result.json');replay=read(prefix/'strict-replay.json')
    assert result['classification'] in ('natural_win','natural_loss','natural_draw','surrender','loop','action_truncation','wall_truncation','decision_timeout','error')
    assert result['slot']==slot and replay['passed'] and replay['actions']==result['actions'] and replay['finalHash']==result['finalHash']
    if result['classification'].startswith('natural_'):
        alliances=read(HERE/plan['maps'][slot['mapIndex']]['path']).get('rules',{}).get('alliances',{})
        own=alliances.get(str(slot['seat']),slot['seat']) if isinstance(alliances,dict) else alliances[slot['seat']]
        expected='natural_draw' if result['winner']==-1 else 'natural_win' if result['winner']==own else 'natural_loss'
        assert result['terminal'] and result['classification']==expected
    if result['classification'] in ('action_truncation','wall_truncation','decision_timeout','loop'):assert not result['terminal']
    expected_model_hash=baseline_content_hash if slot['model']=='baseline' else read(HERE/'ts-parity-best.json')['modelSha256']
    assert result['modelHash']==read(prefix/'started.json')['modelHash']==expected_model_hash
    slots.append({**result,'metrics':replay['correctedMetrics'],'strictReplay':replay})
assert len(slots)==120
summaries=[]
for opponent in ('random','apk_like','heuristic'):
    for model in ('baseline','best'):
        for decoder in ('direct','group_mass'):
            rows=[r for r in slots if r['slot']['opponent']==opponent and r['slot']['model']==model and r['slot']['decoder']==decoder]
            assert len(rows)==10
            side_metrics={}
            for side in ('model','opponent'):
                total={key:sum(r['metrics'][side][key] for r in rows) for key in ('actions','moveAttempts','effectiveMoves','unmovedWaits','endWithRecruit','lethalLandings','knownMoveRisk','actualIncome')}
                total.update(effectiveMoveShare=total['effectiveMoves']/max(1,total['actions']),unmovedWaitShare=total['unmovedWaits']/max(1,total['actions']),lethalLandingRate=total['lethalLandings']/max(1,total['knownMoveRisk']))
                side_metrics[side]=total
            reached=[r['round10'] for r in rows if 'model' in r['round10']]
            round10=dict(reached=len(reached),slots=10)
            if reached:
                round10.update({key:sum(r[key] for r in reached)/len(reached) for key in ('recurringIncomeDifference','actualIncomeDifference','goldBalanceDifference')})
                for side in ('model','opponent'):round10[side]={key:sum(r[side][key] for r in reached)/len(reached) for key in ('towns','castles','recurringIncome','actualIncome','gold')}
            summaries.append(dict(opponent=opponent,model=model,decoder=decoder,slots=10,outcomes=dict(Counter(r['classification'] for r in rows)),actions=sum(r['actions'] for r in rows),wallSeconds=sum(r['wallSeconds'] for r in rows),metrics=side_metrics,round10=round10))
save('battle-summary.json',dict(panels=summaries,slots=slots,strictReplays=120,actions=sum(r['actions'] for r in slots),policyRecomputed=False,processRiskRevision='v3-aura-complete',independentEvaluation=False))
pairs=[]
for result in slots:
    s=result['slot']
    if s['model']!='best':continue
    other=next(r for r in slots if r['slot']['model']=='baseline' and all(r['slot'][key]==s[key] for key in ('opponent','decoder','mapIndex','seat','opponentSeed')))
    pairs.append(dict(opponent=s['opponent'],decoder=s['decoder'],map=s['mapIndex'],seat=s['seat'],seed=s['opponentSeed'],baseline=other['classification'],best=result['classification'],bothNatural=other['classification'].startswith('natural_') and result['classification'].startswith('natural_'),baselineActions=other['actions'],bestActions=result['actions']))
save('paired-summary.json',dict(pairs=pairs,slots=60,scope='固定地图/座位/对手种子配对；墙钟受并发负载影响，截断不能计作胜负'))
corrections=[read(HERE/f"data-v3/{p['parentId']}.receipt.json")['correction'] for p in read(HERE/'selection.json')['parents']]
correction={key:sum(r[key] for r in corrections) for key in ('changedStates','changedCandidates','completeBranches','seconds')}
profile=read(HERE/'feature-profile-v3-128.json')
training={arm:read(HERE/f'training-{arm}.json') for arm in ('legacy','new','conditional')}
training_wall=read(HERE/'pc-training-wall.json')
assert training_wall['returnCodes']==[0,0,0]
results=comparison['results']
ablation={}
for name,a,b in [('new_minus_legacy','new','legacy'),('conditional_minus_new','conditional','new')]:
    ablation[name]=dict(loss=results[a]['loss']-results[b]['loss'],**{key:results[a]['metrics']['direct'][key]-results[b]['metrics']['direct'][key] for key in ('top1','within_move','within_recruit','attack_accuracy','attack_opportunity_rate','danger_avoidance')})
save('ablation-summary.json',dict(deltas=ablation,scope='同一He初始化、数据和排序；各臂按相同开发CE准则选最佳轮，轮号在training记录中；单seed开发消融'))
for result in results.values():assert result['metrics']['direct']==result['metrics']['group_max']
verification=dict(passed=True,publicChecks=dict(lint=True,tests=364,testFiles=32,build=True),sourceParents=80,trainRows=contract['trainRows'],devRows=contract['devRows'],trivialRemoved=contract['trivialTrainRows']+contract['trivialDevRows'],featureProbes=7,profileStates=128,parityProbes=len(read(HERE/'parity-inputs.json')),strictBattleReplays=120,battleActions=sum(r['actions'] for r in slots),pcUpdates=sum(r['updates'] for r in training.values()),phoneOperations=0,correction=correction,independentGeneralization=False,sourceSha256='source-sha256.json')
best_metrics=results[comparison['bestArm']]['metrics']['direct']
outcome_total=dict(Counter(r['classification'] for r in slots))
current_path=ROOT/'ai_training/status/CURRENT.md'
current=current_path.read_text(encoding='utf-8-sig')
section=(f"## 2026-10-18 PC PyTorch战术与条件选择64/16开发小试完成\n\n"
    f"用户明确授权PC优化器更新，覆盖历史手机/纯SGD限制；本次手机/ADB操作0。见[完整报告](../tactical_conditional_20261018/REPORT.md)、[开发比较](../tactical_conditional_20261018/comparison.json)、[固定120槽战报](../tactical_conditional_20261018/BATTLES.md)与[交付清单](../tactical_conditional_20261018/DELIVERY_MANIFEST.json)。复用phone-ab冻结64训练/16开发父局，剔除自动换手平凡endturn后实际{contract['trainRows']}/{contract['devRows']}条，剔除{verification['trivialRemoved']}条。He、AdamW、batch32、float64、三层64维ReLU，legacy/new/conditional三臂共{verification['pcUpdates']}次PC更新，value冻结。\n\n"
    f"最佳新模型{comparison['bestArm']}按direct开发CE选择：loss {results[comparison['bestArm']]['loss']:.6f}，within_move {pct(best_metrics['within_move'])}，within_recruit {pct(best_metrics['within_recruit'])}；不能把全部差异只归因于特征。移动连动、移动攻击与真实寻路探针通过；组合光环校正后仅data-v3进入训练。128状态特征时延与完整覆盖率在报告中。PyTorch/TS及真实浏览器{verification['parityProbes']}原始状态门禁通过。公共lint、364测试与build通过。120固定槽分类为{json.dumps(outcome_total,ensure_ascii=False)}，全部已提交动作strict重放通过；截断/超时不计自然胜负，过程四项指标与逐局整数分母完整保留。\n\n"
    "突击非攻击收尾补丁、S10权重通道适配及回归已在主仓库；定向skipRecruitment优化不改变完整动作空间。最终引擎九个原生故障点冗余二次移动0，两原生strict分片及三真实回放抽检通过。历史模型、数据、失败中间件与报告保留。该64/16及已知标准地图均为已消费开发材料，不称独立泛化或棋力提升；没有扩大父局、晋升或接入应用。\n\n")
assert current.startswith('# 当前接手状态\n')
start_marker='<!-- tactical-conditional-pc-20261018 -->'
end_marker='<!-- end-tactical-conditional-pc-20261018 -->'
if start_marker in current:
    prefix,tail=current.split(start_marker,1);_,suffix=tail.split(end_marker,1)
    current=prefix+start_marker+'\n'+section+end_marker+suffix
else:
    current=current.replace('# 当前接手状态\n\n','# 当前接手状态\n\n'+start_marker+'\n'+section+end_marker+'\n\n',1)
current_path.write_text(current,encoding='utf-8')
source_paths=['src/game/engine.ts','src/game/rules.ts','src/game/env.ts','src/game/ai/tactical_pathfinding.ts','src/game/tests/legal_action_query.test.ts','src/game/tests/auto_handoff_contract.test.ts','src/game/tests/assault_post_action.test.ts','src/game/ai/runtime/v7_heuristic_bounded_search.ts','src/game/ai/spatial_channel_contract.test.ts','docs/environment/interface.md','ai_training/status/CURRENT.md']
sources={p:sha(ROOT/p) for p in source_paths}
for folder in (ROOT/'src/game',ROOT/'src/ai_runtime'):
    sources.update({str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in folder.rglob('*.ts') if p.is_file()})
for name in ('package.json','package-lock.json','tsconfig.json'):
    if (ROOT/name).exists():sources[name]=sha(ROOT/name)
sources.update({str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in HERE.iterdir() if p.is_file() and p.suffix in ('.ts','.py','.mjs')})
save('source-sha256.json',sources)
save('preservation-check.json',dict(passed=True,files=read(HERE/'PRESERVE.json')))
save('verification.json',verification)
offline_rows=[]
for arm in ('baseline','legacy','new','conditional'):
    m=results[arm]['metrics']['direct']
    offline_rows.append([arm,f"{results[arm]['loss']:.6f}",pct(m['top1']),pct(m['groupTop1']),pct(m['within_move']),pct(m['within_recruit']),pct(m['attack_accuracy']),pct(m['attack_opportunity_rate']),pct(m['danger_avoidance']),m['waitWithOpportunity']])
decoder_rows=[]
for arm in ('baseline',comparison['bestArm']):
    for decoder in ('direct','group_mass'):
        m=results[arm]['metrics'][decoder]
        decoder_rows.append([arm,decoder,pct(m['top1']),pct(m['groupTop1']),pct(m['attack_opportunity_rate']),pct(m['danger_avoidance']),m['waitWithOpportunity']])
train_rows=[]
telemetry_rows=[]
for arm,t in training.items():
    history=read(HERE/f'history-{arm}.json')
    train_rows.append([arm,t['epochs'],t['bestEpoch'],t['updates'],f"{t['wallSeconds']/60:.2f}",'/'.join(f"{r['trainingSeconds']/60:.2f}" for r in history)])
    for phase,record in [('首个batch',history[0]['telemetry'][0]),('末次记录',history[-1]['telemetry'][-1])]:
        telemetry_rows.append([arm,phase,record['update'],' / '.join(f'{v:.5g}' for v in record['activationRms'].values()),' / '.join(f"{v['rms']:.5g}" for v in record['gradientBlocks'].values())])
battle_rows=[]
process_rows=[]
for panel in summaries:
    out=panel['outcomes'];m=panel['metrics']['model'];r=panel['round10']
    battle_rows.append([panel['opponent'],panel['model'],panel['decoder'],out.get('natural_win',0),out.get('natural_loss',0),out.get('natural_draw',0),out.get('surrender',0),out.get('loop',0),out.get('action_truncation',0),out.get('wall_truncation',0),out.get('decision_timeout',0),out.get('error',0)])
    process_rows.append([panel['opponent'],panel['model'],panel['decoder'],r['reached'],f"{r.get('recurringIncomeDifference',float('nan')):.1f}",pct(m['effectiveMoveShare']),pct(m['unmovedWaitShare']),m['endWithRecruit'],f"{m['lethalLandings']}/{m['knownMoveRisk']}"])
detail=['# 固定120槽逐局与过程数据','',table(['对手','模型','解码','自然胜','自然负','自然和','投降','循环','动作截断','墙钟截断','决策超时','错误'],battle_rows),'',table(['对手','模型','解码','到第10轮局数','第10轮规则收入差均值','有效移动占全部动作','未移动wait占全部动作','可招募却endturn','致死落点/已知移动'],process_rows),'','第10轮双方城镇/城堡数、累计实际收入与金币余额见 battle-summary.json 的 panels.round10。风险指标取 strict-replay.json 的 v3 校正值；baseline 已运行轨迹不改写。','',table(['槽','分类','原子数','终局轮次','墙钟秒','第10轮己方镇/堡','第10轮对手镇/堡'],[[r['slot']['id'],r['classification'],r['actions'],r['finalTurn'],f"{r['wallSeconds']:.2f}",str(r['round10']['model']['towns'])+'/'+str(r['round10']['model']['castles']) if 'model' in r['round10'] else '未达到',str(r['round10']['opponent']['towns'])+'/'+str(r['round10']['opponent']['castles']) if 'opponent' in r['round10'] else '未达到'] for r in slots])]
(HERE/'BATTLES.md').write_text('\n\n'.join(detail),encoding='utf-8')
b=results['baseline']['metrics']['direct'];d=results[comparison['bestArm']]['metrics']['direct'];g=results[comparison['bestArm']]['metrics']['group_mass']
def wins(opponent,model,decoder):
    return next(p for p in summaries if (p['opponent'],p['model'],p['decoder'])==(opponent,model,decoder))['outcomes'].get('natural_win',0)
win_statement='；'.join(f"{opponent}：基线direct/group_mass={wins(opponent,'baseline','direct')}/{wins(opponent,'baseline','group_mass')}，新模型={wins(opponent,'best','direct')}/{wins(opponent,'best','group_mass')}" for opponent in ('random','apk_like','heuristic'))
main=['# PC战术与条件选择64/16开发小试',
f"最佳新模型为 **{comparison['bestArm']}**，按训练前约定的direct开发宏加权原子CE选择。全部三臂训练、数值/浏览器门禁与固定120槽已完成。下列64/16父局和标准地图均是已消费开发材料，不构成独立泛化或棋力提升证明。",
f"固定面板自然胜局数（每项各10槽）：{win_statement}。自然负、和、循环、截断和超时另列于完整表；截断没有记为胜利，也没有补赛。",
f"相对冻结基线，同一非平凡开发集的组内移动{pct(b['within_move'])}→{pct(d['within_move'])}，组内兵种{pct(b['within_recruit'])}→{pct(d['within_recruit'])}，top1 {pct(b['top1'])}→{pct(d['top1'])}；攻击标签准确率{pct(b['attack_accuracy'])}→{pct(d['attack_accuracy'])}，但有合法攻击时选择攻击{pct(b['attack_opportunity_rate'])}→{pct(d['attack_opportunity_rate'])}，所以不能概括为攻击机会利用全面改善。已知安全可选时的致死落点规避{pct(b['danger_avoidance'])}→{pct(d['danger_avoidance'])}。",
f"同一最佳权重使用group_mass，动作组命中{pct(d['groupTop1'])}→{pct(g['groupTop1'])}，有机会却wait从{d['waitWithOpportunity']}降到{g['waitWithOpportunity']}；同时top1 {pct(d['top1'])}→{pct(g['top1'])}，危险落点规避{pct(d['danger_avoidance'])}→{pct(g['danger_avoidance'])}。组概率质量解码存在明确取舍，不能只按wait减少来判优。",
'## 规则与数据口径',
f"主仓库已合入突击单位非攻击收尾锁定；主动攻击剩余移动保留。capture/repair测试使用临时组合能力，不声称内置突击兵具有这些能力。S10按权重通道声明编码，24/26/34通道回归通过。新增skipRecruitment只跳过招募生成；step定向校验及无意义动作检测省去无关枚举，完整合法动作、编码、mask、固定索引、收益和clone合同保持。公共lint、32文件364测试、build全部通过（保留既有包体积警告）。",
f"冻结phone-ab的64训练/16开发父局与闭合宏区间；原训练{contract['originalTrainRows']}、开发{contract['originalDevRows']}条，删除自动换手后不会出现的平凡endturn {contract['trivialTrainRows']}+{contract['trivialDevRows']}={verification['trivialRemoved']}条（{verification['trivialRemoved']/(contract['originalTrainRows']+contract['originalDevRows']):.2%}），实际{contract['trainRows']}/{contract['devRows']}条。80父局完整候选/标签与当前auto轨迹核查通过；恢复冻结的populationLimit配置，不为单样本放宽公共规则。旧schema仅在观察副本可逆重命名人口字段，副本不执行规则。旧逐字节状态hash不相同，不宣称历史输入逐字节复现。",
'当前基线为phone-ab/original-model.json的旧900父局64x3权重；不是A/B手机新权重。旧权重使用封存特征器独立复算同一非平凡开发集，按parent/macro/subAction/codes/hash与新数据严格连接。原宏1/k权重保留。',
'## 特征与探针',
'新增22列包含同单位当回合紧接攻击净伤/斩杀/占领/治疗召唤，行动单位及指挥官的敌方移动攻击风险、真实寻路代价与差值、招募组成/能力。所有合法移动和攻击均来自GameEngine/getLegalActions；距离复用TacticalPathfinder，对同一前态建筑/敌军目标集合比较最近代价。敌占格可作估距终点，不把它当作合法移动或已能占领。风险表示下个敌方回合单单位一次移动加一次攻击，包含完整结算净损血；不表示多单位集火或已证明整回合安全。无法切换到敌方的pending状态显式未知，未知不算安全。',
f"移动后占村、斩杀、真实山路代价9而曼哈顿3通过；3个历史假安全点从0改为50/60/25点（第三致死）。16状态45分支82目标的快/穷举对比通过。组合光环反例揭示6点应为12点；v3对敌侧精灵+亡灵分支完整穷举，校正{correction['changedStates']}状态/{correction['changedCandidates']}候选，完整校正分支{correction['completeBranches']}个。data/失败中间件、data-v2和data-v3都保留，只有v3进入优化器。",
f"128状态共{profile['candidates']}候选，整状态提取p50/p95/p99={profile['latencyMs']['p50']/1000:.3f}/{profile['latencyMs']['p95']/1000:.3f}/{profile['latencyMs']['p99']/1000:.3f}秒。与侧车/基线评测并行时实测，不能当作空载或手机耗时。候选连动净伤/占村覆盖{pct(profile['coverage']['followup_max_enemy_hp_loss']['fraction'])}/{pct(profile['coverage']['followup_can_capture']['fraction'])}，移动回复风险非零{pct(profile['coverage']['actor_moving_reply_damage']['fraction'])}，致死{pct(profile['coverage']['actor_moving_reply_lethal']['fraction'])}；全部22列见feature-profile-v3-128.json。",
'## PC训练与开发指标',
'三臂相同He正态初始化，实体64维+3层64维ReLU，141候选特征、65990参数；legacy屏蔽新22列并恢复旧招募零风险字段，new为原子CE，conditional为CE+0.5目标动作组内条件CE（与旧phone-ab动作组辅助CE不同）。AdamW lr=.001/wd=.0001、batch32、5%预热后余弦到5%LR、全局范数裁剪1、最多8轮，direct开发CE耐心2轮、改善阈值1e-5。无残差/归一化；value头冻结且不参与决策。变长token/候选完整padding+mask，不裁剪落点或兵种；无损float32缓存逐值检查后提升float64训练。',
table(['臂','loss','top1','动作组','within_move','within_recruit','攻击标签准确率','有攻击时选择攻击','安全可选时规避致死','有机会却wait数'],offline_rows),
table(['受控差值','loss绝对差','top1百分点','within_move百分点','within_recruit百分点'],[[name,f"{delta['loss']:+.6f}",f"{delta['top1']*100:+.2f}",f"{delta['within_move']*100:+.2f}",f"{delta['within_recruit']*100:+.2f}"] for name,delta in ablation.items()]),
'组内指标是在已知目标单位/动作类型下选择落点或兵种；与是否选对组分开。within_recruit比较兵种，可能包含多个部署落点；攻击机会指标并不假设每次攻击都是最佳。danger_avoidance只统计已选择移动且同组有已知非致死落点的情况。不同分母不可混用。完整整数分子/分母和差值见comparison.json。',
table(['臂','实际轮数','最佳轮','更新数','总墙钟分钟','各轮纯训练分钟'],train_rows),
table(['臂','时点','更新','激活RMS：embedding/h1/h2/h3','梯度RMS：embedding/policy1/policy2/policy3/output'],telemetry_rows),
f"完整每轮loss、padding浪费、吞吐、每100更新分块范数/RMS在history-*.json。训练用本机CPU PyTorch、每臂4线程并行、float64，三臂合并墙钟{training_wall['seconds']/60:.2f}分钟；预处理与实战时间另计，不能用小样本总量直接推出全库加速倍数。",
table(['模型','解码','top1','动作组','攻击机会选择','危险落点规避','有机会却wait'],decoder_rows),
'group_mass先按单位/城堡+动作类型的softmax概率质量选组，再组内稳定argmax；group_max与direct数学等价，开发结果也完全相同。',
'## 数值、回放与实战',
f"初始和三臂/最佳的PyTorch与独立TS logits、value、padded/单状态和稳定argmax门禁全部通过（阈值1e-8）；初始32坐标有限差分覆盖全部策略块。真实浏览器从{verification['parityProbes']}个原始状态重新提特征、编码和前向，初始与最佳均通过，包含移动威胁与光环反例，文件SHA一并校验。value数值虽一致，未训练不用于价值判断。",
'最终引擎复核九个原生STANDBY故障点：冗余二次移动0，历史修复前为83；两段既有原生strict共3542原子通过；三份真实回放strict通过、forced关闭、跳过/替换/歧义均0。只表示抽样合法执行，非全库重新准入或APK逐步状态等价。见native-probe-current.json、native-strict-current.json、real-current.json。',
table(['对手','模型','解码','自然胜','自然负','自然和','投降','循环','动作截断','墙钟截断','决策超时','错误'],battle_rows),
f"三档对手×两模型×两解码×五图双座位，共120固定槽；不补赛，全部{verification['battleActions']}个已提交动作完整strict重放。随机对手是过滤surrender后含endturn的均匀基线，原RandomAI的90%偏置未使用；ApkLikeAI是项目近似策略。每局2000原子/600秒、单决策30秒。墙钟软预算与并发负载、昂贵新特征共同限制实际动作数，截断/超时/错误不计自然胜负；不能只看胜数或把长局当棋力增强。",
table(['对手','模型','解码','到第10轮','第10轮规则收入差','有效移动占比','未移动wait占比','可招募却endturn','致死落点/已知移动'],process_rows),
'第10轮定义为首次进入turn10，详细双方镇/堡/每轮总规则收入、金币正增量累计、余额及每局原子轨迹见[BATTLES.md](BATTLES.md)和battle-summary.json；不足第10轮显式未达到。actualIncome字段按相邻状态金币正差累计，若同一步支出抵消入账则不计被抵消部分，不能把它称为完整毛收入；主要经济比较采用recurringIncomeDifference。strict重放核查状态hash、完整候选、合法标签和终态，不重新运行双方策略；RNG记录保留。baseline先行轨迹不改写，过程危险值在最终strict阶段按v3定向校正。',
'## 交付与边界',
'主修改在src/game/engine.ts、rules.ts、legal_action_query.test.ts、auto_handoff_contract.test.ts、docs/environment/interface.md及本独立研究目录；先前突击与空间通道补丁及其回归保留。源码SHA在source-sha256.json；全部本次资产、来源身份、模型、schema、seed、指标和日志列于DELIVERY_MANIFEST.json。历史来源PRESERVE核查通过。未操作手机/ADB、未扩大父局、未晋升或接入应用、未删除资产。',
'本次是单seed、已消费64/16开发材料上的方向筛选。He/AdamW与新特征的作用通过legacy/new对照分析，条件目标通过conditional/new分析；与旧SGD手机模型的差异同时包含初始化/优化器/数据口径，不应全部归因于单个特征。未同时重训旧SGD臂，实战预算截断也限制棋力结论。']
main.append(table(['源码','SHA-256'],[[name,sources[name]] for name in ['src/game/engine.ts','src/game/rules.ts','src/game/env.ts','ai_training/tactical_conditional_20261018/complete_tactics.ts','ai_training/tactical_conditional_20261018/train.py','ai_training/tactical_conditional_20261018/model.ts']]))
main.append(f"最终model-best.json SHA-256：`{sha(HERE/'model-best.json')}`。完整清单由当前目录全部文件逐项计算，不包含清单自身与可再生成的__pycache__。")
(HERE/'REPORT.md').write_text('\n\n'.join(main)+'\n',encoding='utf-8')
state=dict(phase='complete',finishedAt=time.strftime('%Y-%m-%dT%H:%M:%S%z'),pcTrainingAuthorized=True,phoneOperations=0,trainingUpdates=verification['pcUpdates'],bestArm=comparison['bestArm'],trainRows=contract['trainRows'],devRows=contract['devRows'],panels=120,strictReplays=120,independentEvaluation=False)
save('TASK_STATE.json',state);save('RUN_STATE.json',state);save('PIPELINE_STATE.json',state)
files=[]
for path in sorted(HERE.rglob('*')):
    if not path.is_file() or path.name=='DELIVERY_MANIFEST.json' or '__pycache__' in path.parts:continue
    files.append(dict(path=str(path.relative_to(HERE)).replace('\\','/'),bytes=path.stat().st_size,sha256=sha(path)))
save('DELIVERY_MANIFEST.json',dict(phase='complete',files=files,sourceSha256=sources,preservedInputs=read(HERE/'PRESERVE.json'),totalBytes=sum(f['bytes'] for f in files),modelSha256=sha(HERE/'model-best.json'),selectionSha256=sha(HERE/'selection.json'),schemaSha256=sha(HERE/'schema.json'),contractSha256=sha(HERE/'contract.json'),seed=contract['seed'],activeDataDirectory='data-v3',retainedIntermediates=['data/失败及中断片','data-v2/校正前侧车'],trainParents=64,devParents=16,trainRows=contract['trainRows'],devRows=contract['devRows'],pcUpdates=verification['pcUpdates'],phoneOperations=0,independentEvaluation=False))
print(json.dumps(dict(phase='complete',files=len(files),bytes=sum(f['bytes'] for f in files),best=comparison['bestArm'],verification=verification),ensure_ascii=False))
