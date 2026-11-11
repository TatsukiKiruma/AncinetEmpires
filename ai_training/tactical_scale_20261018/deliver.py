"""只在全部验收完成后生成报告、状态登记和交付清单。"""
from pathlib import Path
import hashlib,json,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
while not (HERE/'DELIVERY_REVIEW.json').exists():time.sleep(.5)
review=read(HERE/'DELIVERY_REVIEW.json');assert review['approvedBy']=='Codex'
assert review['modelSha256']==sha(HERE/'group-best.json') and review['battleSummarySha256']==sha(HERE/'hierarchical-battle-summary.json')
contract=read(HERE/'scale-contract.json');training=read(HERE/'group-training.json');model=read(HERE/'group-best.json')
comparison=read(HERE/'scale-comparison.json');battles=read(HERE/'hierarchical-battle-summary.json');speed=read(HERE/'feature-parity-clean.json');clone=read(HERE/'clone-trajectory-parity.json')
assert read(HERE/'final-battles-exit.json')['passed'] and battles['allStrictPassed'] and battles['totalSlots']==60
assert contract['trainParents']==240 and contract['devParents']==60 and contract['canonicalV3Threshold']
assert read(HERE/'verification.json')['passed'] and read(HERE/'preservation-check.json')['passed']
assert read(HERE/'runtime-patch-data-audit.json')['passed']
for name in ['group-numeric-initial.json','group-numeric-best.json','group-browser-initial.json','group-browser-best.json','group-numeric-calibrated-initial.json','group-browser-calibrated-initial.json','feature-parity-clean.json','castle-aura-probe.json','expanded-feature-parity.json','group-size-invariance.json']:
    assert read(HERE/name)['passed'],name
for f in contract['files']:
    assert sha(f['path'])==f['sha256'] and sha(f['packedPath'])==f['packedSha256']
old=read(HERE/'battle-speed-summary.json');group=comparison['hierarchical']['metrics'];prior=comparison['stage2']['metrics']['group_mass']
calibration=read(HERE/'calibration-results.json');assert calibration['best']['passed'] and read(HERE/'CALIBRATION_PROMOTION.json')['trunkBitEqual']
for filename in ['group_model.ts','group_train.py']:assert sha(HERE/'uncalibrated'/filename)==contract['sourceBinding'][filename]
head=['# 阶段3：无损提速与分层策略240/60扩量','',
    '全部预处理、PC训练、数值门禁、固定面板与strict重放已完成。原阶段2目录1,886份文件SHA保持；两轮中间实战和中间数据保留。这里使用既有开发材料与标准地图，不称独立泛化证明。','',
    '## 无损提速','',
    f"专用结构拷贝及规则字段读取优化通过公共lint、368测试与build。冻结JSON克隆引擎与当前引擎在五图随机/启发式共{clone['steps']}步、{clone['cloneChecks']}次clone逐字节一致；独立嵌套隔离和规则读取回归通过。克隆微基准倍数为{clone['speedup']:.2f}，详见clone-trajectory-parity.json。",'',
    '128冻结状态、16,877候选的540,064个float32战术值完全相同。额外17个实战非终局/1,949候选及敌城堡扣血×组合光环反例通过；扩量每个新父局中段另作旧v3/新提取器/缓存三方逐值对照。','',
    '|整状态提取|提速前冻结运行|最终实现空载运行|倍数|','|---|---:|---:|---:|']
for q in ['p50','p95','p99']:
    a,b=speed['oldMs'][q],speed['newMs'][q];head.append(f'|{q}|{a/1000:.4f}秒|{b/1000:.4f}秒|{a/b:.2f}|')
head += ['',f"总时间倍数{speed['totalSpeedup']:.2f}，中位数达到5倍以上；整体与尾部尚未全部达到5–10倍目标。空载复核在其他本阶段工作结束后执行；并发负载下的原始时延也保留，不能把不同负载直接当作硬件加速倍数。",'',
    '最终新增onlyAttacks定向查询，普通攻击与完整动作集合复用同一权威生成函数，省去无关技能/建筑/招募候选；默认集合和顺序保持。该优化后重新完成128状态零误差、6000步字节一致、真实浏览器及完整60槽strict复核。','',
    '数据生成期与最终运行期源码分别绑定。最终克隆器还精确保留脚本字典的特殊JSON键，旧克隆源码快照保留；所选全部封存初态和脚本均不含该键或字面量，兼容审计通过。最终6000步、128状态和最佳权重浏览器复核使用最终实现。','',
    '相同阶段2最佳权重、group_mass及2000动作/600秒/单决策30秒预算下，墙钟截断10→0；自然胜仍为7，新增自然胜0。原墙钟截断全部转为动作截断。30槽公共动作前缀全部一致，36,112已提交动作strict通过。提速解决墙钟瓶颈，没有单独解决策略收官。见[BATTLES_SPEED.md](BATTLES_SPEED.md)。','',
    '## 数据与训练','',
    f"原900父局分区内分层抽取240训练/60开发父局，实际{contract['trainRows']:,}/{contract['devRows']:,}条非平凡原子，删除{contract['removedTrivial']:,}条自动换手平凡end_turn。保留原宏1/k权重，完整候选无裁剪；float32缓存逐值无损，提升float64训练。阶段2的80父局只读复用；新父局完整标签在当前权威轨迹合法。旧源状态摘要与当前投影状态摘要分别记录，不能声称历史原输入逐字节复现。",'',
    f"阈值规范化检查涉及{sum(f.get('thresholdChecked',0) for f in contract['files']):,}候选，实际修改{contract['thresholdChanges']}值；新增中段探针合计{contract['sampleParityCandidates']:,}候选，32维误差0。只使用data-final/packed-final合同。",'',
    '网络为64维实体及三层64维候选隐藏层，其中后两个块采用Residual+LayerNorm（epsilon=1e-5）；独立动作组头对组内证据取均值，另一个头学习组内条件选择。目标为组CE+组内条件CE，推理按同样顺序先选组再选候选。完整复制一个动作组不增加组分数的回归通过。详见[DESIGN.md](DESIGN.md)。','',
    f"仅PC PyTorch {training['torchVersion']} CPU执行AdamW（lr=.001、weight_decay=.0001、He、batch32、5%预热+余弦、裁剪1）。实际{training['epochs']}轮/{training['steps']:,}次更新，最佳第{model['epoch']}轮；墙钟{training['seconds']/60:.2f}分钟。参数{training['parameters']:,}，{training['cpuThreads']}线程；value头冻结且不用于决策。手机/ADB操作0。",'',
    f"第8轮未校准模型的有机会却wait为1504，超过旧模型1314，故继续进行一维组类型校准。保留所有骨干/组内参数逐位不变，240训练父局按预注册alpha=1/0.8/0.6拟合wait组logit偏置，60开发父局按原宏权重验收。仅alpha={calibration['best']['alpha']}通过全部门禁，偏置{calibration['best']['bias']:.12f}，额外1个参数（总66,312）。校准墙钟{calibration['seconds']/60:.2f}分钟，选择未使用实战结果；独立标量优化梯度核对通过。未校准模型和18场自然胜的30槽原件见[BATTLES_UNCALIBRATED.md](BATTLES_UNCALIBRATED.md)。",'',
    '## 数值与开发比较','',
    '基座初始化/第8轮和校准零偏置/最终偏置均通过23个原始状态的PyTorch自动微分、独立TS解析反向及真实Chrome完整重新编码；包括batch32和末批14。全参数梯度、两种前向、loss/value误差均小于1e-8，argmax100%一致。校准梯度测试采用实际wait标签权重；浏览器收据包含读取文件SHA。','',
    '|同一60父局开发指标|阶段2 best+group_mass|分层新模型|','|---|---:|---:|']
for key in ['top1','groupTop1','within_move','within_recruit','attack_opportunity_rate','danger_avoidance']:
    head.append(f'|{key}|{prior[key]:.4%}|{group[key]:.4%}|')
head.append(f"|有机会却wait（代理计数）|{prior['waitWithOpportunity']}|{group['waitWithOpportunity']}|")
head += ['', '各项整数分子/分母、direct对照及原16父局子集见[COMPARISON.md](COMPARISON.md)和scale-comparison.json。组内移动/招募与组选组分开；攻击机会不表示每次攻击都最优；危险规避只在存在已知安全落点时统计。有机会却wait是代理指标，不单独证明错误等待。新模型组CE＋条件CE为分层联合NLL，旧模型为全候选softmax原子NLL，均按原宏权重归一化；损失不能单独证明两阶段解码或棋力改善。风险只表示敌方单单位移动后一次攻击，不保证抵御整回合集火。架构、目标和数据同时变化，不能单因素归因。','',
    '## 配对实战','',
    '相同五图双座位、对手seed及预算，两模型各30槽。Random是含end_turn、过滤surrender的均匀随机；ApkLikeAI为项目近似策略。','',
    '|对手|模型|自然胜|自然负|动作截断|墙钟截断|到第10轮|第10轮规则收入差|','|---|---|---:|---:|---:|---:|---:|---:|']
for p in battles['panels']:
    c=p['classification'];head.append(f"|{p['opponent']}|{p['model']}|{c.get('natural_win',0)}|{c.get('natural_loss',0)}|{c.get('action_truncation',0)}|{c.get('wall_truncation',0)}|{p['round10Reached']}|{p['round10IncomeDifference']:.2f}|")
head += ['', '第10轮均值只包含实际达到该轮的对局，提前胜负的局不当作零收入混入。JSON的actualIncome是相邻状态金币正差累计，支出抵消入账的部分不计，不能视为完整毛收入；主要经济比较采用规则每轮收入。','', f"60槽全部{sum(p['strictActions'] for p in battles['panels']):,}个已提交动作strict重放通过：完整合法集合、动作、前后态hash及终态均核对。strict不重新运行双方策略；截断、超时与错误不计自然胜负。逐局双方城镇/城堡、收入、余额、有效移动、wait及危险落点整数计数见[BATTLES_HIERARCHICAL.md](BATTLES_HIERARCHICAL.md)及hierarchical-battle-summary.json。",'',
    '## 交付','',
    '代码、schema、模型、数据与外部缓存身份、seed、门禁、所有日志及中间失败原件列于DELIVERY_MANIFEST.json。全部历史资产保留。训练和评测是本次已消费开发诊断，不作独立最终棋力或泛化宣称。','',
    f"最佳新模型SHA-256：`{sha(HERE/'group-best.json')}`。"]
(HERE/'REPORT.md').write_text('\n'.join(head)+'\n',encoding='utf-8')
state=dict(status='complete',trainParents=240,devParents=60,trainRows=contract['trainRows'],devRows=contract['devRows'],phoneOperations=0,report='REPORT.md')
(HERE/'TASK_STATE.json').write_text(json.dumps(state,ensure_ascii=False),encoding='utf-8')
status=ROOT/'ai_training/status/CURRENT.md';text=status.read_text(encoding='utf-8-sig');marker='<!-- tactical-scale-20261018 -->'
winSummary='；'.join(f"{p['opponent']} {p['classification'].get('natural_win',0)}胜{p['classification'].get('natural_loss',0)}负{p['classification'].get('action_truncation',0)}动作截断" for p in battles['panels'] if p['model']=='hierarchical')
if marker in text:
    start=text.index(marker);end=text.index('<!-- end-tactical-scale-20261018 -->',start)+len('<!-- end-tactical-scale-20261018 -->')
    text=text[:start]+text[end:]
entry=f"""{marker}
## 2026-10-18 阶段3：无损提速与分层240/60完成

见[报告](../tactical_scale_20261018/REPORT.md)、[开发比较](../tactical_scale_20261018/COMPARISON.md)、[同权重复测](../tactical_scale_20261018/BATTLES_SPEED.md)、[分层配对实战](../tactical_scale_20261018/BATTLES_HIERARCHICAL.md)与[交付清单](../tactical_scale_20261018/DELIVERY_MANIFEST.json)。6000步/300次clone字节一致，128状态16877候选32维战术float32误差0；公共368测试/lint/build通过。原最佳权重墙钟截断10→0，自然胜仍7，原墙钟局全部转动作截断，不能称新增胜利。

240训练/60开发父局实际{contract['trainRows']}/{contract['devRows']}非平凡原子，仅PC PyTorch AdamW float64训练{training['epochs']}轮；显式组均值头+组内头、Residual/LayerNorm，23状态初始/最佳PyTorch/TS/真实Chrome全参数梯度与前向通过。开发有攻击时选择攻击{prior['attack_opportunity_rate']:.2%}→{group['attack_opportunity_rate']:.2%}，有机会却wait{prior['waitWithOpportunity']}→{group['waitWithOpportunity']}；完整分母与所有不利指标保留。已消费开发材料，不称独立泛化。阶段2的1886份文件SHA不变，调试实战与中间分片保留，手机/ADB操作0。

第8轮基座后增加1个wait组校准参数，预注册3档校准中仅alpha=0.6通过全部开发门禁；原66,311权重逐位冻结，最终66,312参数，选择未用实战胜负。最终固定面板：{winSummary}，墙钟截断/决策超时/错误均0；60槽全部strict通过。未校准18胜的30槽原件另存，最终候选22胜（旧模型7胜）。整状态提取中位数约{speed['oldMs']['p50']/speed['newMs']['p50']:.2f}倍、总时间{speed['totalSpeedup']:.2f}倍，整体与尾部未全部达到5–10倍目标。
<!-- end-tactical-scale-20261018 -->

"""
text=text.replace('# 当前接手状态', '# 当前接手状态\n\n'+entry,1);status.write_text(text,encoding='utf-8')
assets=[]
for p in sorted(HERE.rglob('*')):
    if not p.is_file() or p.name=='DELIVERY_MANIFEST.json' or '__pycache__' in p.parts or any(x.startswith('chrome-profile') for x in p.relative_to(HERE).parts):continue
    assets.append(dict(path=p.relative_to(HERE).as_posix(),sha256=sha(p),bytes=p.stat().st_size))
dependencies={}
for f in contract['files']:
    for key,digest in [('path',f['sha256']),('packedPath',f['packedSha256'])]:
        p=Path(f[key]);dependencies[str(p)]=digest
manifest=dict(version='tactical-scale-20261018-v1',status='complete',scope=state,sourceBinding=contract['sourceBinding'],modelSha256=sha(HERE/'group-best.json'),
    selectionSha256=sha(HERE/'selection.json'),contractSha256=sha(HERE/'scale-contract.json'),independentEvaluation=False,
    verification=read(HERE/'verification.json'),externalDataDependencies=dependencies,assets=assets,excludedRegenerableCaches=['chrome-profile*','__pycache__'])
sourceFiles=list((ROOT/'src/game').glob('*.ts'))+list((ROOT/'src/game/ai').rglob('*.ts'))+list((ROOT/'src/ai_runtime/sd_v1').rglob('*.ts'))
sourceFiles += [ROOT/'package.json',ROOT/'package-lock.json',HERE.parent/'sd64x3_phone_20261016/model.ts',HERE.parent/'sd64x3_phone_20261016/tactics.ts',HERE.parent/'tactical_conditional_20261018/train.py',HERE.parent/'data_acceptance_20261016/phone/compact_reader.ts']
manifest['dataSourceBindingDescription']='特征数据生成时期源码；最终运行期源码另行绑定，旧克隆源码保存在source-snapshots'
manifest['runtimeSourceBinding']={f:sha(HERE/f) for f in contract['sourceBinding']}
manifest['runtimeCompatibilityPatch']=read(HERE/'runtime-source-patch.json')
manifest['calibration']=dict(plan='CALIBRATION_PLAN.json',results='calibration-results.json',promotion=read(HERE/'CALIBRATION_PROMOTION.json'),extraUncalibratedStrictSlots=30)
manifest['externalSourceDependencies']={str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in sourceFiles if p.is_file() and not p.name.endswith('.test.ts')}
publicFiles=['src/game/clone_state.ts','src/game/engine.ts','src/game/rule_config.ts','src/game/rules.ts','src/game/tests/clone_state.test.ts','src/game/tests/rule_config_readers.test.ts','src/game/tests/legal_action_query.test.ts','docs/environment/interface.md','ai_training/status/CURRENT.md']
manifest['publicWorkspaceArtifacts']={name:dict(sha256=sha(ROOT/name),bytes=(ROOT/name).stat().st_size) for name in publicFiles}
(HERE/'DELIVERY_MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8');print(len(assets))
