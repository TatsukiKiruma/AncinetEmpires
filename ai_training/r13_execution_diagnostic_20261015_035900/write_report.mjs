import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';const o=path.dirname(fileURLToPath(import.meta.url)),read=f=>JSON.parse(fs.readFileSync(path.join(o,f),'utf8')),canonical=x=>x===null||typeof x!=='object'?x:Array.isArray(x)?x.map(canonical):Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])),hash=x=>crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex'),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),cov=read('coverage_and_turns.json'),inf=read('inference_audit_corrected.json'),ent=read('entity_order_audit.json'),buf=read('cross_state_buffer_audit.json'),credit=read('heal_credit_audit.json'),teacher=read('teacher_calibration.json'),b100=read('b100_historical_calibration.json'),fixtures=read('fixtures.json').rows,p=read('protocol.json');const sources=['ai_training/r10_terminal_chain_20261015_024000/REPORT.md','ai_training/r12_first_disagreement_20261015_034900/REPORT.md','ai_training/r12_first_disagreement_20261015_034900/data_gate.json'].map(f=>({path:path.resolve(f),sha256:sha(f)}));fs.writeFileSync(path.join(o,'report_sources.json'),JSON.stringify({sources},null,2),{flag:'wx'});const summary={status:'DIAGNOSIS_COMPLETE_NO_PRODUCTION_DEFECT_REPRODUCED',generatedAt:new Date().toISOString(),elapsedSeconds:(Date.now()-Date.parse(p.createdAt))/1000,wallLimitSeconds:p.wallLimitSeconds,newMatches:0,trainingUpdates:0,productionEdits:0,traceEntries:cov.rows.length,transitions:cov.transitions,legalCandidateEntries:cov.coverageCandidates,duplicateActionCodes:cov.duplicateCodes,maxFullLegalCount:Math.max(...cov.rows.map(x=>x.maxLegalCount)),inferenceFixtureEntries:fixtures.length,uniqueFixtureStates:new Set(fixtures.map(x=>hash(x.state))).size,uniqueModelStatePairs:new Set(fixtures.map(x=>x.modelSha+'|'+hash(x.state))).size,models:inf.modelCount,executionMismatches:inf.failures.length,entityCandidateEntries:ent.candidates,entityMismatches:ent.failures.length,crossStateBufferPassed:buf.passed,featureCollisionFixtures:inf.collisionFixtures.length,harnessFalseAlarmsPreserved:read('inference_audit.json').failures.length,teacherCalibration:teacher.existingFreshTeacherParents.counts,b100Historical:b100.rows.map(x=>({variant:x.variant,counts:x.counts,completedTeacherDecisions:x.completedTeacherDecisions,latency:x.completedDecisionElapsedMs})),healCredit:{total:credit.heals,noTargetHPOrStatusGain:credit.noTargetHPOrStatusGain,actorBenefitAmongThose:credit.noTargetGainButActorXPOrLevelGain,noImmediateTargetOrActorGain:credit.noImmediateTargetOrActorGain},r11r12CourseExpansionStopped:true,confirmationGames:0,next:'Offline search-teacher completion/latency contract audit before any new teacher qualification matches; no automatic training'};fs.writeFileSync(path.join(o,'RESULTS.json'),JSON.stringify(summary,null,2),{flag:'wx'});const next={status:'PROPOSAL_NOT_EXECUTED',route:'Budgeted search-teacher qualification, not more current Heuristic roll-in courses',stageA:{scope:'12 existing frozen fixtures, 4 pre-timeout Q states,4 pre-timeout R states,4 completed controls; pick file/step order before queries',maxQueries:14,maxWallSeconds:300,training:0,newMatches:0,requirements:['Restore exact RNG and query identity','Record each candidate started/completed, termination reason and real player handoffs','Only completed candidates may be selected','All returned actions in full original legal set','Repeat2 fixtures with exact RNG and identical result','Record decision timing including encoding/serialization and incomplete work'],stop:'Any contract mismatch: save minimal fixture, correct only verified defect in new experimental wrapper and regression-test; no match or training until clean. If no mismatch, report latency/censoring and stop offline phase.'},stageB:{conditional:'Only after stageA passes and a single fixed candidate teacher can return within1000ms; requires a separately frozen batch',maxWallSeconds:2400,maxConcurrent:2,maxNewParents:8,maps:4,seats:2,teacherArms:2,maxPrimaryGames:16,maxDecisionMs:1000,maxWallSecondsPerGame:120,maxTotalAtomicActions:3000,parentSelection:'Fresh seeded legal prefixes, frozen before scoring; no failed seed replacement; old consumed diagnostics excluded from independent score',gate:'At least4 teacher natural-win parent families,>=2maps,both seats; at least3 paired teacher wins where frozen Heuristic naturally loses, no lost natural wins; truncated pairs remain unknown, no ordering as losses',stop:'Any unresolved error or failed quality gate stops this teacher route; no label expansion or student fitting. Pass only permits a later independently designed training protocol, not automatic training.'},confirmation:'Preserve original confirmation; teacher diagnostics and assisted outcomes never count as student scores'};fs.writeFileSync(path.join(o,'NEXT_PROTOCOL.json'),JSON.stringify(next,null,2),{flag:'wx'});const report=`# R13 执行一致性、动作效率与教师诊断

结论：选定范围未复现项目候选排序、合法覆盖或执行错位缺陷；当前最强证据指向教师/课程资格不足与覆盖不足。动作效率有可疑现象，但不能把合法且有经验收益的动作直接称为浪费。未修改游戏或模型；训练0更新、新对局0场；R11/R12多回合课程扩展保持停止。

## 检查范围与结果

- 53条既有R8–R12轨迹，21952次状态转换，1845842个合法候选条目（含反复出现，不是独立样本）。逐步核对真实引擎完整合法集、顺序、编码、执行后状态、奖励和结束标记；动作编码重复0，最大合法集630。覆盖的是冻结引擎提供的合法动作，未独立证明APK所有合法动作都已被引擎枚举。
- 固定位置抽取96个夹具条目，${summary.uniqueFixtureStates}个不同完整状态、${summary.uniqueModelStatePairs}个不同模型/状态对；4份冻结权重，覆盖R8/R10/R11/R12实际网络决策。R9c的参考介入只作合法回放，不误当学生argmax。抽样不是96个独立父局。
- 96个实际记录动作均匹配正确座位的完整合法集网络argmax。反序候选得分、单候选得分、同状态缓冲区复用的最大差异均0；4个模型跨不同状态A-B-A复用差异均0。未截断候选，不加启发式接管。
- 6361个夹具候选逐项核对独立实体ID到坐标、目标/落点及反序合法集重新编码，错位0；动作特征完全相同的不同候选对0。这不证明所有状态无别名，也不是新的Python/TS全流程一致性审计。

首轮诊断器缓存策略误固定座位0，导致36个座位1假警报；当时独立网络argmax已全部匹配原记录。错误位于本批测试器，不是生产策略：生产worker按candidateSeat构造策略。原失败输出inference_audit.json保留，正确结果在inference_audit_corrected.json；diagnostic_harness_correction.json与verify.cjs可重现区别。没有据假警报修改项目。教师汇总中的早期控制过滤字段也已按first_student_decision修正，原轨迹不动。

## 动作开销：观察与纠偏

R12两个动作截断分支均未超120秒，不得判负：

|case/h|学生动作|实际玩家交接|同回合回访移动格|存在同单位其他动作仍等待|最长连续学生动作|
|---|---:|---:|---:|---:|---:|
|1/8|2878|50|202|31|444|
|5/8|2760|86|99|2|480|

这些是行为描述，回访可能是战术重定位，等待可触发真实规则中的光环/经验/自动换手；不能用短期HP指标替代自然胜。完整状态从未完全不变也不证明策略在有效推进。

case5学生253次友军治疗中，136次没有目标HP或状态改善；其中79次仍使施术者获得经验或升级，只剩57次无这些直接收益。6个原有状态各做治疗/等待两个单步克隆：早期step129/150/191治疗各比等待多30经验，不能判无效；较晚step900/955/1009完整状态仅多了目标hasBeenHealedThisTurn=true，当下合法动作集合完全相同。后3例显示局部收益冗余，尚不证明最终输赢损失；没有删除治疗、强制结束回合或修改真实规则。最小状态与结果在heal_wait_minimal_*和late_heal_wait_fixtures.json。

## 教师实际能力与计算合同

- 既有R10四个新教师父局，冻结Heuristic对同强度对手为2自然胜2自然负，无截断，仅2图双方座位。R11两个早期阳性控制精确复现这些相同赢局，不是新增独立证据；较晚同家族完整教师自然负274步。
- R12有6条尚未归还学生就结束的教师分支，2胜4负；去重为5条轨迹，2胜3负。它们是被选中的学生分歧状态，不是无偏教师胜率。真正归还学生后新增自然胜并精确复验的仍只有1个家族，门槛不足。
- R8同历史面板：B100-Q为4胜8负1动作截断7时间截断；B100-R为4胜9负1动作截断6时间截断。每组20槽的4胜只是已观察自然胜，不能把截断记负或用自然终局子集推断总体胜率。全是已消费固定开局，不能当新独立校准。
- 既有9699个完成搜索决策中非法返回与内部异常均0；Q完成决策耗时中位70ms、P95 519ms、最大963ms；R为65/540/987ms。12次时间截断由1000ms外部决策硬限触发，另1次为整局墙钟。完成日志排除了被杀死的未完成决策，不能据P95宣布满足硬限。旧字段也没有逐候选完成状态，不能证明未完成候选从未参与选择。

## 有证据排序的归因

1. **教师资格/完成合同，证据强。** Heuristic不能稳定提供跨家族改进，现有更强搜索也存在实际硬限截断；不宜继续把其标签数量当质量。
2. **数据覆盖与访问分布，证据强但并非唯一原因。** R10成功课程391输入仅一个祖先家族；R11/R12多家族取样仍未取得足够合格终局。不能用重复轨迹或同种子复验虚增独立家族。
3. **排序目标与动作效率，证据中等。** 候选全部可见且确按网络得分执行；分歧教师动作在网络中排第2–14，但教师不是正确性真值。回访及无直接收益动作值得诊断，尚无因果胜率证据。
4. **优化器/容量完全失效，证据较弱。** 既有R10报告长链模型成功动作argmax为382/391，并能在已消费开局纯模型自然胜，却没有新DEV净收益，说明至少能拟合局部课程。该历史数据在本批未重新训练或重算391行；不证明所有训练实现都正确。
5. **本次被测执行缺陷，目前无复现。** 抽样一致性通过不能排除未覆盖状态、APK对齐、完整历史污染或跨语言训练问题。不要据此盲改架构。

## 具体下一步与停止条件

首选另开“搜索教师完成与延迟合同”离线批次，**不是继续当前课程或加训练**。NEXT_PROTOCOL.json给出可执行边界：先从既有日志按固定顺序选4个Q超时前状态、4个R超时前状态、4个已完成控制，最多14次教师查询（12个状态各一次，另2次复验）、5分钟上限、不对战。记录每个候选开始/完成、终止原因、真实玩家交接、完整合法集与RNG；未完成候选不得入选，2个夹具精确重复。发现合同缺陷就保存最小复现，只修证实的问题并回归；未过合同不进入对战。

仅合同通过且固定单一教师能在1000ms内返回后，才另冻8个全新训练父局、4图双座位，当前Heuristic与候选教师同120秒/3000原子动作/1000ms对手流比较，最多16场、2并发、40分钟。要求至少4个自然胜家族、2图、双方座位，至少3个配对由Heuristic自然负转为教师自然胜且无丢失自然胜；截断配对未知。未达门槛停止该教师路线，不补种子、不扩标签、不训练；通过也只允许另设计训练验证协议。原确认集始终保留。

## 交付和进程

所有源码、数据、模型与原始记录只读；69项保护与来源快照已核验。verify.cjs复核199条来源快照、4个模型及确认清单，并复现座位诊断器问题与3个晚期单步对照。此时报告生成约${(summary.elapsedSeconds/60).toFixed(2)}分钟，上限20分钟。最终磁盘、Git差异及项目进程见final_state.json；没有新增权限阻碍。

复核命令（不写结果、不启动训练或对战）：

    node ai_training/r13_execution_diagnostic_20261015_035900/verify.cjs

关键文件：RESULTS.json、inference_audit_corrected.json、entity_order_audit.json、coverage_and_turns.json、heal_credit_audit.json、teacher_calibration.json、b100_historical_calibration.json、NEXT_PROTOCOL.json。
`;fs.writeFileSync(path.join(o,'REPORT.md'),report,{flag:'wx'});console.log(summary);

