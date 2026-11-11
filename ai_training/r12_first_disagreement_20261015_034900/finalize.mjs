import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';const o=path.dirname(fileURLToPath(import.meta.url)),read=f=>JSON.parse(fs.readFileSync(path.join(o,f),'utf8')),p=read('protocol.json'),rows=read('primary_results.json').rows,reps=read('repeat_results.json').rows,gate=read('data_gate.json'),audit=read('replay_audit.json'),count=a=>Object.fromEntries(['natural_win','natural_loss','step_truncated','timeout_truncated','rule_draw','error'].map(k=>[k,a.filter(x=>x.outcome===k).length]));assert.equal(rows.length,24);assert.equal(reps.length,1);assert.equal(gate.passed,false);assert.equal(audit.passed,true);const groups=p.referenceHandoffs.map(h=>({h,games:rows.filter(x=>x.referenceHandoffs===h).length,counts:count(rows.filter(x=>x.referenceHandoffs===h))})),result={status:'STOPPED_COURSE_EXPANSION_DATA_GATE_FAILED',generatedAt:new Date().toISOString(),protocolCreatedAt:p.createdAt,wallElapsedSeconds:(Date.now()-Date.parse(p.createdAt))/1000,wallLimitSeconds:p.wallLimitSeconds,parentSha256:p.parentSha256,primaryGroups:groups,repeat:count(reps),deterministicRepeatExact:reps[0].exactSameTrajectory,independentReplicateSeeds:0,gate,trainingUpdates:0,newModels:0,independentDevGames:0,confirmationGames:0,assistedScoresAreStudentScores:false,audit,aggregatePrimaryEpisodeWallSeconds:rows.reduce((s,r)=>s+r.elapsedWallSeconds,0),maxPrimaryEpisodeWallSeconds:Math.max(...rows.map(x=>x.elapsedWallSeconds)),stopReason:'Only1 qualifying parent family /1 map /seat1; insufficient reliable multi-family course benefit. Stop this curriculum expansion route; no automatic horizon, wall or training increase.'};fs.writeFileSync(path.join(o,'RESULTS.json'),JSON.stringify(result,null,2),{flag:'wx'});const root=read('roots.json').rows,cell=r=>r.outcome==='natural_win'?`胜 ${r.steps}${r.returnedStudentDecisions===0?'（未归还学生）':''}`:r.outcome==='natural_loss'?`负 ${r.steps}`:`动作截断 ${r.steps}`,table=root.map(c=>`|${c.caseIndex}|${c.mapName}|${c.candidateSeat}|${c.rootStep}|${[0,8,16].map(h=>cell(rows.find(r=>r.caseIndex===c.caseIndex&&r.referenceHandoffs===h))).join('|')}|`).join('\n');const report=`# R12 首次动作分歧与等预算验证

项目 C:\\code\\AncinetEmpires；冻结父模型 SHA256 ${p.parentSha256}。规则与 R8 冻结引擎未修改。本批在40分钟上限内提前按无足够收益停止，实际生成报告时约${(result.wallElapsedSeconds/60).toFixed(2)}分钟；未耗满窗口追加实验。

## 最终决定

完成24个冻结槽及1次同条件复验，只有1个家族、1张地图、座位1合格，未达到4家族、2张地图、双方座位门槛。训练0更新，无新候选、无晋级、无独立DEV、无确认赛。**停止继续扩充这条有限教师介入课程路线，不再自动增加训练量、介入时长或截断预算。** 稳定击败基线的总目标尚未达到。

## 历史核对与更正

R8–R11六份本机阶段报告及R11原始结果已复核，来源SHA见historical_review.json。R9c/R10/R11已单列截断，没有发现把R11时间截断直接记为自然失败。R11原始整局60秒、较晚状态分支60秒，剩余比赛可用预算并不对称；因此当时“门槛未过”不能推出没有可恢复课程。R11精确延续4个截断所得2胜1负1动作截断仍为补充诊断，不改写正式记录。本批只追加HISTORICAL_CORRECTIONS.md，旧报告与结果全部保持原字节。

R8旧supervisor字段naturalWinRate=wins/20仅是固定槽观察到胜局比例，不能解释为自然终局条件胜率。历史核对与首批运行有时间重叠；所有R12阈值在首场前冻结，不根据部分成绩调整。

## 冻结比较

复用全部8个R11父家族，不按胜负重抽；这些家族已消费，仅是训练方法诊断，不能叫新独立评测。按真实学生轨迹顺序让教师影子查询：共同动作逐步推进教师RNG，首个不同动作之前保存完整状态和双方随机数快照。三个策略从相同根运行，各自120秒、1000ms硬决策限、3000-rootStep总动作；h0纯父模型，h8/h16在对应真实玩家交接次数后归还学生。没有按失败追加时间或动作，也未改规则或弱化对手。

|组别|自然胜|自然负|动作截断|时间截断|错误|
|---|---:|---:|---:|---:|---:|
${groups.map(g=>`|h${g.h}|${g.counts.natural_win}|${g.counts.natural_loss}|${g.counts.step_truncated}|${g.counts.timeout_truncated}|${g.counts.error}|`).join('\n')}

以上辅助组自然胜不等于学生自然胜。h16 Duel座位1与Swamplands座位0均由教师结束，学生归还后决策为0，不能作为课程改进。Swamplands座位0原学生本就自然胜，其h8获胜也不构成新增收益。

|家族case|地图|座位|分歧rootStep|h0|h8|h16|
|---|---|---:|---:|---|---|---|
${table}

## 唯一可重复改进及其限度

case5 The Crossing座位1：分歧step11，h0自然负720步；h16教师141次决策后归还，学生实际执行973次决策，续局1207步自然胜，总动作含前缀1218。按预注册选择该家族最短成功档复验一次，全部状态、动作、角色、交接及双方RNG逐步相同，再次自然胜。它是同状态同种子的确定性复现，**不是独立种子重复，也不是第二个家族**。不足门槛，不提取课程训练，不用确认集再验证。

两个h8分支到动作上限仍未自然结束，耗时分别约76.06与79.59秒，均低于120秒；时间不再是本批截断原因。它们的终局仍未知，不判失败、胜利或平局。case1累计50次玩家交接、学生2878次动作；case5累计86次交接、学生2760次动作，最长连续学生动作444/480。大量移动与等待占用原子预算；没有观察到完全不变状态的动作，但完整状态互异也不证明策略有效进展，不能把它们直接称作死循环。见truncation_behavior_diagnostic.json与action_budget_diagnostic.json。

## 验证与保护

25场共13061次转换、534个真实输入哈希探针合法回放通过；所有8个h0精确复现旧原始学生后缀。独立重新推进教师共同前缀确认首次分歧与RNG；首个教师动作、角色切换、奖励、终局和动作预算逐项核验。69个保护文件及13个历史来源文件哈希不变；确认清单哈希不变，未读取确认种子内容、未运行确认对局。未来DEV仅保留R11种子预约，未生成状态或评分。

首次分歧的8个学生/教师动作对，在actor/landing/target坐标及动作语义组合中均不完全相同。此检查排除这8对的精确动作特征同一，**不证明整个编码无别名或网络已经能正确排序**。没有据此改架构。

## 替代路线（本批不继续运行）

1. 优先做回合及部队动作效率诊断：以真实玩家交接、单位数、移动/等待/治疗及目标进展记录耗费，核验大量原子动作是否带来可测战术进展。只有发现具体排序缺陷后，才考虑新的小型动作分组或回合级策略对照；保持完整合法集和真实规则，不能通过强制结束回合或削弱对手制造收益。
2. 教师资格先于蒸馏：有限Heuristic接管在大多数家族无自然终局改进，完整教师本身也不保证胜。若另开路线，先把冻结参考策略或预算有限搜索作为候选教师，在全新训练父局与匹配预算下校准自然终局能力；教师达不到标准就不生成标签、不训练学生。该建议不是已经证实的成功方案。
3. 有证据才修编码/训练：现有8对没有精确特征碰撞，优先审计全合法候选的实体归属、Python/TS排序与决策成本，再据发现设计独立验证。不要把延长旧391输入拟合、扩大未经证实单步标签或继续扫介入长度当新方法。

没有新增权限阻碍。所有材料留在本批目录；未删除历史资产，未上传或推送。最终磁盘与进程以final_state.json为准。复验命令：项目根目录执行 node ai_training/r12_first_disagreement_20261015_034900/audit.cjs；已有审计输出按字节核验，不覆盖。
`;fs.writeFileSync(path.join(o,'REPORT.md'),report,{flag:'wx'});console.log({groups,gate,wallElapsedSeconds:result.wallElapsedSeconds});
